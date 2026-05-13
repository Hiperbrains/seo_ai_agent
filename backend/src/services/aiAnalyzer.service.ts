import OpenAI from 'openai';
import {
  CrawlPageResult,
  SeoPageReport,
  AiIssueItem,
  TrendKeywordInsight,
  ProductFeatureInsight,
  SeoActionPlanItem,
  CompetitorGapItem,
  KeywordClusterItem,
} from '../models/scan.model';
import { getOpenAiKey } from './secrets.service';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import type { PageSpeedMetrics } from './pagespeed.service';
import { getSetting } from './db.service';
import { fetchTrendSeedKeywords } from './serpapi.service';

type AggregateAudit = {
  total_pages: number;
  pages_missing_meta: number;
  pages_missing_h1: number;
  images_without_alt: number;
  broken_links: number;
  duplicate_titles: number;
};

type AggregateAiResponse = {
  globalRecommendations?: string[];
  issueFixes?: Record<string, string>;
  metaDescriptionTemplate?: string;
  titleTemplate?: string;
  internalLinkingTips?: string[];
  contentImprovementTips?: string[];
};

type TrendKeywordsAiResponse = {
  trendKeywords?: Array<{
    keyword?: string;
    category?: 'domain_trend' | 'long_tail' | 'blog_tofu' | 'bofu_comparison';
    searchIntent?: 'informational' | 'commercial' | 'transactional' | 'navigational';
    reason?: string;
    suggestedPageUrl?: string;
    updateAreas?: Array<'title' | 'h1' | 'meta_description' | 'body_content' | 'internal_links'>;
    priorityScore?: number;
    seoCluster?: string;
    blogTopic?: string;
    sourceSignals?: string[];
  }>;
};

const GENERIC_NAV_KEYWORDS = new Set([
  'about',
  'contact',
  'book demo',
  'enterprise',
  'resellers',
  'careers',
  'investors',
  'home',
  'pricing',
]);

function classifyTrendKeyword(keyword: string): NonNullable<TrendKeywordInsight['category']> {
  const k = keyword.toLowerCase();
  if (k.includes(' vs ') || k.includes('alternative') || k.includes('alternatives') || k.includes('better than')) {
    return 'bofu_comparison';
  }
  if (k.startsWith('how to ') || k.includes('guide') || k.includes('benefits') || k.includes('challenges')) {
    return 'blog_tofu';
  }
  if (k.split(/\s+/).length >= 5 || k.includes(' for ') || k.includes(' in ')) {
    return 'long_tail';
  }
  return 'domain_trend';
}

type TrendMetric = { searchVolume: number; trend: number };
type SerpSignals = {
  competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedTopDomains: string[];
  avgTitleLength: number;
};

function buildTrendMap(externalTrendRows: Array<{ keyword: string; confidence: number }>): Map<string, TrendMetric> {
  const m = new Map<string, TrendMetric>();
  for (const row of externalTrendRows) {
    const k = row.keyword.toLowerCase().trim();
    if (!k) continue;
    // We only get confidence from SerpAPI related queries, so map it into stable 0-100 proxies.
    const trend = Math.max(20, Math.min(100, Number(row.confidence) || 50));
    const searchVolume = Math.max(15, Math.min(100, Math.round(trend * 0.9 + 10)));
    m.set(k, { searchVolume, trend });
  }
  return m;
}

function intentWeight(intent: TrendKeywordInsight['searchIntent']): number {
  if (intent === 'transactional') return 100;
  if (intent === 'commercial') return 85;
  if (intent === 'informational') return 65;
  return 45;
}

function getSerpSignals(keyword: string): SerpSignals {
  const k = cleanTrendKeyword(keyword);
  if (/\b(best|top|tools)\b/.test(k)) {
    return {
      competitionLevel: 'HIGH',
      estimatedTopDomains: ['g2.com', 'capterra.com', 'linkedin.com'],
      avgTitleLength: 58,
    };
  }
  if (/\b(how to|guide)\b/.test(k)) {
    return {
      competitionLevel: 'MEDIUM',
      estimatedTopDomains: ['hubspot.com', 'indeed.com', 'workable.com'],
      avgTitleLength: 62,
    };
  }
  return {
    competitionLevel: 'LOW',
    estimatedTopDomains: ['niche-saas-blog.com', 'industry-pages.com'],
    avgTitleLength: 54,
  };
}

function getRecommendedContentLength(_keyword: string, intent: string): string {
  if (intent === 'informational') return '1200-2000';
  if (intent === 'commercial') return '800-1200';
  if (intent === 'transactional') return '500-800';
  return '800-1200';
}

function computePriorityScore(
  keyword: string,
  intent: TrendKeywordInsight['searchIntent'],
  metric?: { searchVolume?: number; trend?: number },
  serpSignals?: SerpSignals
): number {
  const hasMetric = Number.isFinite(Number(metric?.searchVolume)) || Number.isFinite(Number(metric?.trend));
  const searchVolume = hasMetric ? Math.max(0, Math.min(100, Number(metric?.searchVolume) || 45)) : 0;
  const trend = hasMetric ? Math.max(0, Math.min(100, Number(metric?.trend) || 45)) : 0;
  const intentScore = intentWeight(intent);
  const baseScore = hasMetric
    ? Math.round(searchVolume * 0.4 + trend * 0.3 + intentScore * 0.3)
    : Math.round(55 * 0.4 + 50 * 0.3 + intentScore * 0.3);
  const k = cleanTrendKeyword(keyword);
  const conversionBoost = /\b(software|platform|solution)\b/.test(k) ? 15 : 0;
  const comparisonBoost = /\b(vs|alternative|alternatives)\b/.test(k) ? 10 : 0;
  const serpBoost = serpSignals?.competitionLevel === 'LOW' ? 6 : serpSignals?.competitionLevel === 'MEDIUM' ? 2 : -2;
  return Math.max(1, Math.min(100, baseScore + conversionBoost + comparisonBoost + serpBoost));
}

function computeOpportunityScore(
  priorityScore: number,
  serpSignals: SerpSignals,
  isMissingFromSite: boolean
): number {
  const lowCompetitionBonus = serpSignals.competitionLevel === 'LOW' ? 20 : 0;
  const contentGapBonus = isMissingFromSite ? 15 : 0;
  return Math.max(1, Math.min(100, Math.round(priorityScore * 0.6 + lowCompetitionBonus * 0.2 + contentGapBonus * 0.2)));
}

function isQuickWin(pageRank: number, seoScore: number): boolean {
  return pageRank >= 20 && pageRank <= 50 && seoScore > 50;
}

function cleanTrendKeyword(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bsoftware tools\b/g, 'software')
    .replace(/\btools software\b/g, 'software')
    .replace(/\btools tools\b/g, 'tools')
    .trim();
}

function isValidKeyword(k: string): boolean {
  const keyword = cleanTrendKeyword(k);
  if (keyword.length < 5) return false;
  if (keyword.split(' ').length < 3) return false;
  if (/tools|software tools/.test(keyword)) return false;
  return true;
}

function expandKeywords(baseKeyword: string): string[] {
  const b = cleanTrendKeyword(baseKeyword);
  if (!b) return [];
  return [
    `${b} software`,
    `${b} for startups`,
    `how to ${b}`,
    `best ${b} tools`,
  ]
    .map((x) => cleanTrendKeyword(x))
    .filter(Boolean);
}

function expandByIntent(keyword: string): {
  transactional: string[];
  informational: string[];
  comparison: string[];
} {
  const k = cleanTrendKeyword(keyword);
  return {
    transactional: [`${k} software`, `${k} platform`, `${k} solution`].map(cleanTrendKeyword),
    informational: [`how to ${k}`, `what is ${k}`, `${k} process`].map(cleanTrendKeyword),
    comparison: [`${k} vs alternatives`, `best ${k} tools`, `${k} comparison`].map(cleanTrendKeyword),
  };
}

function isWeakKeywordPattern(keyword: string): boolean {
  const k = cleanTrendKeyword(keyword);
  if (!k) return true;
  if (k.split(/\s+/).length < 3) return true;
  if (/\b(tools|software)\s+\1\b/.test(k)) return true;
  if (/\bsoftware tools\b/.test(k)) return true;
  return false;
}

function dedupeAndCleanKeywords(rows: TrendKeywordInsight[]): TrendKeywordInsight[] {
  const seen = new Set<string>();
  const out: TrendKeywordInsight[] = [];
  for (const row of rows) {
    const cleaned = cleanTrendKeyword(row.keyword);
    if (!isValidKeyword(cleaned) || isWeakKeywordPattern(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push({ ...row, keyword: cleaned });
  }
  return out;
}

function enrichWithExpandedKeywords(
  rows: TrendKeywordInsight[],
  pages: CrawlPageResult[],
  domain: string,
  pageReports: Map<string, SeoPageReport>,
  trendMap: Map<string, TrendMetric>
): TrendKeywordInsight[] {
  if (!rows.length) return [];
  const expanded: TrendKeywordInsight[] = [];
  for (const row of rows.slice(0, 6)) {
    const byIntent = expandByIntent(row.keyword);
    const candidates = [...byIntent.transactional, ...byIntent.informational, ...byIntent.comparison, ...expandKeywords(row.keyword)];
    for (const kw of [...new Set(candidates)].slice(0, 4)) {
      if (!isValidKeyword(kw)) continue;
      expanded.push({
        keyword: kw,
        category: classifyTrendKeyword(kw),
        searchIntent: row.searchIntent,
        reason: `Expanded from core keyword "${row.keyword}" for stronger search-intent coverage.`,
        suggestedPageUrl: mapKeywordToBestPageUrl(kw, pages, domain),
        updateAreas: inferUpdateAreas(kw, mapKeywordToBestPageUrl(kw, pages, domain), pageReports),
        serpSignals: getSerpSignals(kw),
        recommendedWordCount: getRecommendedContentLength(kw, row.searchIntent),
        priorityScore: computePriorityScore(
          kw,
          row.searchIntent,
          trendMap.get(cleanTrendKeyword(kw)),
          getSerpSignals(kw)
        ),
        seoCluster: row.seoCluster,
        blogTopic: row.blogTopic,
        sourceSignals: ['keyword_expansion_layer', ...(row.sourceSignals || [])].slice(0, 5),
      });
    }
  }
  return dedupeAndCleanKeywords([...rows, ...expanded]).slice(0, 12);
}

function bestHomepageUrl(pages: CrawlPageResult[], domain: string): string | undefined {
  const domainNorm = domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').toLowerCase();
  const home = pages.find((p) => {
    try {
      const u = new URL(p.url);
      return u.hostname.replace(/^www\./, '').toLowerCase() === domainNorm && (u.pathname === '/' || u.pathname === '');
    } catch {
      return false;
    }
  });
  return home?.url || pages[0]?.url;
}

function matchScore(keywordTokens: string[], candidateTokens: string[]): number {
  if (!keywordTokens.length || !candidateTokens.length) return 0;
  const set = new Set(candidateTokens);
  const matched = keywordTokens.filter((t) => set.has(t)).length;
  return matched / keywordTokens.length;
}

const TOKEN_SYNONYMS: Record<string, string[]> = {
  hiring: ['recruitment', 'recruiting'],
  interview: ['screening', 'assessment'],
  candidate: ['applicant'],
};

function expandTokens(tokens: string[]): string[] {
  const out = new Set(tokens);
  for (const t of tokens) {
    for (const s of TOKEN_SYNONYMS[t] || []) out.add(s);
  }
  return [...out];
}

function mapKeywordToBestPageUrl(keyword: string, pages: CrawlPageResult[], domain: string): string | undefined {
  const kTokens = expandTokens(tokenize(keyword));
  let best = { url: bestHomepageUrl(pages, domain), score: 0 };
  for (const p of pages) {
    const h1Text = (p.headings?.[0] || '').trim();
    const titleText = p.title || '';
    const headingText = (p.headings || []).join(' ');
    const contentText = p.contentSnippet || '';
    const weighted =
      matchScore(kTokens, expandTokens(tokenize(h1Text || headingText))) * 0.5 +
      matchScore(kTokens, expandTokens(tokenize(titleText))) * 0.3 +
      matchScore(kTokens, expandTokens(tokenize(contentText))) * 0.2;
    if (weighted > best.score) best = { url: p.url, score: weighted };
  }
  // Require stronger token overlap than picking a random page that only shares the brand name.
  if (best.score < 0.38) return bestHomepageUrl(pages, domain);
  return best.url;
}

function inferUpdateAreas(
  keyword: string,
  pageUrl: string | undefined,
  pageReports: Map<string, SeoPageReport>
): Array<'title' | 'h1' | 'meta_description' | 'body_content' | 'internal_links'> {
  const areas = new Set<'title' | 'h1' | 'meta_description' | 'body_content' | 'internal_links'>();
  const report = pageUrl ? pageReports.get(pageUrl) : undefined;
  const issueTypes = new Set((report?.issues || []).map((i) => i.type));
  const kw = keyword.toLowerCase();

  if (issueTypes.has('missing_title') || issueTypes.has('duplicate_title')) areas.add('title');
  if (issueTypes.has('missing_h1') || issueTypes.has('multiple_h1')) areas.add('h1');
  if (issueTypes.has('missing_meta_description')) areas.add('meta_description');
  if (issueTypes.has('low_word_count')) areas.add('body_content');
  if (issueTypes.has('broken_links') || issueTypes.has('invalid_or_nonfunctional_link')) areas.add('internal_links');

  // If no explicit issue signals exist, infer likely optimization zones from intent pattern.
  if (areas.size === 0) {
    if (kw.startsWith('how to ') || kw.includes('guide') || kw.includes('benefits')) areas.add('body_content');
    else areas.add('title');
    areas.add('h1');
    areas.add('meta_description');
  }

  return [...areas].slice(0, 5);
}

type PageAiResponse = {
  pasteReadyFixes?: { issueType?: string; issueSummary?: string; improvedContent?: string }[];
  improvedContent?: {
    h1?: string;
    title?: string;
    metaDescription?: string;
    bodyCopy?: string;
  };
};

type BacklinkSignalsByUrl = Map<
  string,
  {
    internalReferringPages: number;
    uniqueExternalDomainsLinked: number;
    externalLinksCount: number;
    internalAuthorityScore: number;
    backlinkQualityScore: number;
  }
>;

function buildAggregatePrompt(summary: AggregateAudit): string {
  return `You are an expert technical SEO consultant.

We already ran rule-based SEO checks locally for all pages.
Use the aggregated results below and return concise, actionable recommendations.

Return JSON only.

Audit summary:
${JSON.stringify(summary, null, 2)}

Output schema:
{
  "globalRecommendations": ["..."],
  "issueFixes": {
    "missing_title": "...",
    "missing_meta_description": "...",
    "missing_h1": "...",
    "multiple_h1": "...",
    "broken_links": "...",
    "images_without_alt": "...",
    "duplicate_title": "...",
    "slow_page": "...",
    "missing_canonical": "..."
  },
  "metaDescriptionTemplate": "",
  "titleTemplate": "",
  "internalLinkingTips": ["..."],
  "contentImprovementTips": ["..."]
}`;
}

function normalizeReport(raw: Partial<SeoPageReport>, pageUrl: string): SeoPageReport {
  const issues: AiIssueItem[] = Array.isArray(raw.issues)
    ? raw.issues
        .filter((i): i is AiIssueItem => i && typeof i === 'object')
        .map((i) => ({
          type: String(i.type || 'issue'),
          severity: (['high', 'medium', 'low'].includes(String(i.severity)) ? i.severity : 'medium') as
            | 'high'
            | 'medium'
            | 'low',
          description: String(i.description || '').trim() || 'See page metrics.',
          fix: String(i.fix || '').trim() || 'Review this URL in Search Console.',
        }))
    : [];

  return {
    url: pageUrl,
    seoScore: Math.min(100, Math.max(0, Number(raw.seoScore) || 0)),
    issues,
    suggestedTitle: String(raw.suggestedTitle ?? '').trim(),
    suggestedMetaDescription: String(raw.suggestedMetaDescription ?? '').trim(),
    contentImprovements: Array.isArray(raw.contentImprovements)
      ? raw.contentImprovements.map((x) => String(x).trim()).filter(Boolean)
      : [],
    internalLinkSuggestions: Array.isArray(raw.internalLinkSuggestions)
      ? raw.internalLinkSuggestions.map((x) => String(x).trim()).filter(Boolean)
      : [],
    pasteReadyFixes: Array.isArray(raw.pasteReadyFixes)
      ? raw.pasteReadyFixes
          .map((x) => ({
            issueType: String(x?.issueType ?? '').trim(),
            issueSummary: String(x?.issueSummary ?? '').trim(),
            improvedContent: String(x?.improvedContent ?? '').trim(),
          }))
          .filter((x) => x.issueType && x.improvedContent)
      : [],
    improvedContent: raw.improvedContent
      ? {
          h1: String(raw.improvedContent.h1 ?? '').trim() || undefined,
          title: String(raw.improvedContent.title ?? '').trim() || undefined,
          metaDescription: String(raw.improvedContent.metaDescription ?? '').trim() || undefined,
          bodyCopy: String(raw.improvedContent.bodyCopy ?? '').trim() || undefined,
        }
      : undefined,
  };
}

function normalizeTrendKeywords(
  raw: TrendKeywordsAiResponse | null | undefined,
  pages: CrawlPageResult[],
  domain: string,
  trendMap: Map<string, TrendMetric>,
  pageReports: Map<string, SeoPageReport>
): TrendKeywordInsight[] {
  const isLowValueKeyword = (kw: string): boolean => {
    const k = kw.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!k || k.length < 4) return true;
    if (GENERIC_NAV_KEYWORDS.has(k)) return true;
    if ([...GENERIC_NAV_KEYWORDS].some((g) => k === `${g} 2025` || k === `${g} 2026` || k === `${g} 2027`)) return true;
    if (/^(about|contact|home|pricing|enterprise|resellers)\s+\d{4}$/.test(k)) return true;
    return false;
  };
  const rows = Array.isArray(raw?.trendKeywords) ? raw?.trendKeywords : [];
  const internalKeywordSet = new Set(getCurrentKeywords(pageReports).map((k) => cleanTrendKeyword(k)));
  const normalized = dedupeAndCleanKeywords(
    rows
    .map((r) => ({
      keyword: String(r?.keyword || '').trim(),
      category: (['domain_trend', 'long_tail', 'blog_tofu', 'bofu_comparison'].includes(String(r?.category || ''))
        ? (r?.category as TrendKeywordInsight['category'])
        : classifyTrendKeyword(String(r?.keyword || ''))) as TrendKeywordInsight['category'],
      searchIntent: (['informational', 'commercial', 'transactional', 'navigational'].includes(
        String(r?.searchIntent || '')
      )
        ? r?.searchIntent
        : 'informational') as TrendKeywordInsight['searchIntent'],
      reason: String(r?.reason || '').trim(),
      suggestedPageUrl: mapKeywordToBestPageUrl(String(r?.keyword || ''), pages, domain),
      updateAreas: Array.isArray(r?.updateAreas)
        ? r.updateAreas.filter((x) =>
            ['title', 'h1', 'meta_description', 'body_content', 'internal_links'].includes(String(x))
          )
        : undefined,
      serpSignals: getSerpSignals(String(r?.keyword || '')),
      recommendedWordCount: getRecommendedContentLength(
        String(r?.keyword || ''),
        (['informational', 'commercial', 'transactional', 'navigational'].includes(String(r?.searchIntent || ''))
          ? String(r?.searchIntent || 'informational')
          : 'informational')
      ),
      priorityScore: computePriorityScore(
        String(r?.keyword || ''),
        (['informational', 'commercial', 'transactional', 'navigational'].includes(String(r?.searchIntent || ''))
          ? (r?.searchIntent as TrendKeywordInsight['searchIntent'])
          : 'informational') as TrendKeywordInsight['searchIntent'],
        trendMap.get(cleanTrendKeyword(String(r?.keyword || ''))),
        getSerpSignals(String(r?.keyword || ''))
      ),
      seoCluster: String(r?.seoCluster || '').trim() || undefined,
      blogTopic: String(r?.blogTopic || '').trim() || undefined,
      sourceSignals: Array.isArray(r?.sourceSignals)
        ? r.sourceSignals.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
        : undefined,
    }))
    .filter((r) => r.keyword.length >= 3 && r.reason.length >= 8 && !isLowValueKeyword(r.keyword))
    .map((row) => ({
      ...row,
      seoCluster: row.seoCluster || clusterLabelFromKeyword(row.keyword),
      updateAreas: row.updateAreas?.length
        ? row.updateAreas
        : inferUpdateAreas(row.keyword, row.suggestedPageUrl, pageReports),
      opportunityScore: computeOpportunityScore(
        row.priorityScore,
        row.serpSignals || getSerpSignals(row.keyword),
        !internalKeywordSet.has(cleanTrendKeyword(row.keyword))
      ),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 12)
  );
  return normalized.length ? normalized : [];
}

function buildTrendKeywordPrompt(
  domain: string,
  productFeatures: string[],
  currentKeywords: string[],
  externalTrendSignals: string[],
  competitorKeywords: string[],
  pages: CrawlPageResult[],
  pageReports: Map<string, SeoPageReport>
): string {
  const samples = pages.slice(0, 20).map((p) => ({
    url: p.url,
    title: p.title,
    h1: p.headings[0] || '',
    existingTargetKeyword: pageReports.get(p.url)?.keywordInsights?.targetKeyword || '',
  }));
  return `You are an SEO strategist.

Generate trend-focused keyword opportunities for this website.
Use realistic SEO logic (freshness, intent, topic fit, and likely traffic potential).
Infer the site's industry and offers ONLY from "domain" and "pageSamples" (titles, headings, URLs). Ignore any productFeatures entries that clearly conflict with what the sampled pages are about.
Do NOT assume recruitment, ATS, or hiring tech unless pageSamples clearly show that niche.
Do NOT generate generic navigation keywords (about, contact, book demo, enterprise, resellers, pricing).
Do NOT create fake trend terms by simply appending a year to generic page names.
Ensure output includes all 4 categories where possible: domain_trend, long_tail, blog_tofu, bofu_comparison.
For each keyword, provide updateAreas from this list: title, h1, meta_description, body_content, internal_links.
ONLY generate keywords that:
- are real search-style Google queries
- are natural phrases (not robotic)
- are not repetitive variations
- match the site's actual products, services, or problems implied by pageSamples
BAD examples:
- generic page name + year only
- unrelated vertical (e.g. hiring software for a manufacturing IT services site)
GOOD examples (illustrative only — adapt to the real niche):
- enterprise cloud migration strategy
- low code automation for financial services
- salesforce integration best practices
Return JSON only.

Input:
${JSON.stringify(
  {
    domain,
    productFeatures,
    currentKeywords,
    externalTrendSignals,
    competitorKeywords,
    pageSamples: samples,
  },
  null,
  2
)}

Output schema:
{
  "trendKeywords": [
    {
      "keyword": "example keyword",
      "category": "domain_trend",
      "searchIntent": "informational",
      "reason": "Why this trend keyword is relevant for the site right now.",
      "suggestedPageUrl": "https://example.com/some-page",
      "updateAreas": ["title", "h1", "meta_description"],
      "priorityScore": 85,
      "seoCluster": "Core service theme from samples",
      "blogTopic": "Educational angle aligned to the same theme",
      "sourceSignals": ["product_features", "existing_keywords", "external_trend_data"]
    }
  ]
}`;
}

function getProductFeatures(): string[] {
  const raw = getSetting('PRODUCT_FEATURES') || process.env.PRODUCT_FEATURES || '';
  return raw
    .split(/[,\n|]/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .slice(0, 25);
}

const DOMAIN_SEED_STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'your',
  'from',
  'that',
  'this',
  'our',
  'are',
  'was',
  'has',
  'have',
  'home',
  'page',
  'blog',
  'news',
  'read',
  'more',
  'get',
  'use',
  'all',
  'new',
  'top',
]);

/** Derive short topic seeds from the crawled site (titles, headings, slugs) — not from a fixed vertical. */
export function extractDomainSeedPhrases(pages: CrawlPageResult[], domainInput: string): string[] {
  const host = domainInput
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
  const brandToken = host.split('.').filter(Boolean)[0] || 'site';
  const brandPhrase = brandToken.replace(/[^a-z0-9-]/gi, '').replace(/-/g, ' ').trim() || 'site';
  const seeds = new Set<string>();
  if (brandPhrase.length >= 2) {
    seeds.add(`${brandPhrase} services`);
    seeds.add(`${brandPhrase} solutions`);
  }

  const pushNgrams = (raw: string) => {
    const words = raw
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !DOMAIN_SEED_STOP.has(w));
    for (let i = 0; i < words.length - 1; i++) {
      const bi = `${words[i]} ${words[i + 1]}`;
      if (bi.length >= 6) seeds.add(bi);
    }
    for (let i = 0; i < words.length - 2; i++) {
      const tri = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      if (tri.length >= 10 && tri.length <= 70) seeds.add(tri);
    }
  };

  for (const p of pages.slice(0, 30)) {
    try {
      const slug = new URL(p.url).pathname.split('/').filter(Boolean).slice(-1)[0]?.replace(/[-_]+/g, ' ') || '';
      if (slug.length > 3) pushNgrams(slug);
    } catch {
      /* ignore */
    }
    const blob = [p.title, ...(p.headings || []).slice(0, 3), p.metaDescription || ''].join(' ');
    pushNgrams(blob);
    const titleShort = p.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (titleShort.length >= 10 && titleShort.length <= 72) seeds.add(titleShort);
  }

  return [...seeds]
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 4 && s.length <= 85)
    .slice(0, 14);
}

function minimalCrawlPagesFromReports(pageReports: Map<string, SeoPageReport>): CrawlPageResult[] {
  const out: CrawlPageResult[] = [];
  for (const [url, r] of pageReports.entries()) {
    const h1 = r.improvedContent?.h1 || '';
    out.push({
      url,
      title: r.suggestedTitle || '',
      metaDescription: r.suggestedMetaDescription || '',
      canonical: '',
      h1Count: h1 ? 1 : 0,
      h2Count: 0,
      wordCount: 0,
      headings: h1 ? [h1] : [],
      links: [],
      imagesWithoutAlt: 0,
      brokenLinks: [],
      invalidNavLinks: [],
      loadTimeMs: 0,
      contentSnippet: r.improvedContent?.bodyCopy,
    });
  }
  return out;
}

function inferFeaturesFromText(text: string): string[] {
  const known = [
    'resume parser',
    'coding test',
    'ai interview',
    'interview bot',
    'candidate ranking',
    'hiring analytics',
    'smart scheduler',
    'phone screening',
    'job post generator',
    'proctoring',
    'technical hiring platform',
    'recruitment automation',
    'talent assessment',
  ];
  const lower = text.toLowerCase();
  return known.filter((k) => lower.includes(k));
}

export function extractProductFeaturesFromPages(pages: CrawlPageResult[]): ProductFeatureInsight[] {
  const rows: ProductFeatureInsight[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    const path = new URL(p.url).pathname.toLowerCase();
    const sourceType: ProductFeatureInsight['sourceType'] =
      path.includes('use-case') || path.includes('usecase')
        ? 'use_case_page'
        : path.includes('feature') || path.includes('agent')
          ? 'feature_page'
          : path.includes('service') || path.includes('solution') || path.includes('product')
            ? 'service_page'
            : 'content_inference';
    const boostPath =
      sourceType === 'use_case_page' || sourceType === 'feature_page' || sourceType === 'service_page';
    const pool = `${p.title} ${(p.headings || []).join(' ')} ${p.contentSnippet || ''}`.slice(0, 2000);
    const inferred = inferFeaturesFromText(pool);
    if (!inferred.length && !boostPath) continue;
    for (const feature of inferred) {
      const key = feature.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ feature, sourceUrl: p.url, sourceType });
    }
  }
  return rows.slice(0, 25);
}

function getCurrentKeywords(pageReports: Map<string, SeoPageReport>): string[] {
  const set = new Set<string>();
  for (const rep of pageReports.values()) {
    const k = String(rep.keywordInsights?.targetKeyword || '').trim();
    if (k.length >= 3) set.add(k);
  }
  return [...set].slice(0, 20);
}

function buildDynamicCompetitorGapKeywords(domain: string, pages: CrawlPageResult[], currentKeywords: string[]): string[] {
  const seeds = extractDomainSeedPhrases(pages, domain).slice(0, 5);
  const gaps: string[] = [];
  const push = (k: string) => {
    const t = k.replace(/\s+/g, ' ').trim();
    if (t.length >= 8 && t.length < 92) gaps.push(t);
  };
  for (const s of seeds) {
    if (!s) continue;
    push(`best ${s} software`);
    push(`${s} implementation guide`);
    push(`what is ${s}`);
    push(`${s} vs alternatives`);
  }
  if (gaps.length < 4) {
    const host = domain
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('.')[0]
      ?.replace(/[^a-z0-9-]/gi, '')
      .replace(/-/g, ' ')
      .trim();
    if (host && host.length >= 2) {
      push(`best ${host} platform`);
      push(`what is ${host}`);
      push(`${host} services comparison`);
    }
  }
  return [...new Set(gaps)].slice(0, 8);
}

function competitorKeywordGaps(currentKeywords: string[], domain: string, pages: CrawlPageResult[]): CompetitorGapItem[] {
  const current = new Set(currentKeywords.map((k) => cleanTrendKeyword(k)));
  const expandedInternal = new Set<string>();
  for (const k of currentKeywords) {
    const byIntent = expandByIntent(k);
    for (const x of [...expandKeywords(k), ...byIntent.transactional, ...byIntent.informational, ...byIntent.comparison]) {
      expandedInternal.add(cleanTrendKeyword(x));
    }
  }
  return buildDynamicCompetitorGapKeywords(domain, pages, currentKeywords)
    .filter((k) => !current.has(cleanTrendKeyword(k)) && !expandedInternal.has(cleanTrendKeyword(k)))
    .slice(0, 8)
    .map((keyword) => ({
      keyword,
      reason: 'Missing from site coverage (derived from crawled topics)',
      opportunityScore: computeOpportunityScore(
        computePriorityScore(keyword, 'commercial', { searchVolume: 70, trend: 60 }, getSerpSignals(keyword)),
        getSerpSignals(keyword),
        true
      ),
    }));
}

function generateActionPlan(
  reports: Map<string, SeoPageReport>,
  trendKeywords: TrendKeywordInsight[]
): string[] {
  const allIssues = [...reports.values()].flatMap((r) => r.issues.map((i) => i.type));
  const has = (t: string): boolean => allIssues.includes(t);
  const topKeyword = trendKeywords[0]?.keyword;
  const actions: string[] = [];
  if (has('missing_h1')) actions.push('Fix missing H1 tags on all affected pages.');
  if (has('missing_title') || has('duplicate_title')) actions.push('Rewrite page titles with intent-focused keywords.');
  if (has('low_word_count')) actions.push('Add 500+ words of focused content on thin pages.');
  if (topKeyword) actions.push(`Create/optimize a landing page for "${topKeyword}".`);
  actions.push('Add internal links between feature/use-case pages with descriptive anchors.');
  return [...new Set(actions)].slice(0, 5);
}

function generateActionPlanItems(
  reports: Map<string, SeoPageReport>,
  trendKeywords: TrendKeywordInsight[]
): SeoActionPlanItem[] {
  const rows: SeoActionPlanItem[] = [];
  const top = trendKeywords.slice(0, 6);
  for (const k of top) {
    const page = k.suggestedPageUrl || [...reports.keys()][0] || '/';
    const pageSeoScore = reports.get(page)?.seoScore ?? 0;
    const pageRank = Math.max(1, Math.min(100, 100 - Math.round(k.priorityScore)));
    const quickWin = isQuickWin(pageRank, pageSeoScore);
    rows.push({
      page,
      action: `Add/update 500+ words targeting "${k.keyword}" and optimize ${k.updateAreas?.join(', ') || 'title, h1, meta_description'}.`,
      priority: quickWin ? 'HIGH' : k.priorityScore >= 75 ? 'HIGH' : k.priorityScore >= 55 ? 'MEDIUM' : 'LOW',
      quickWin,
    });
  }
  return rows.slice(0, 5);
}

function buildKeywordClusters(keywords: TrendKeywordInsight[]): KeywordClusterItem[] {
  const groups = new Map<string, TrendKeywordInsight[]>();
  for (const k of keywords) {
    const cluster = clusterLabelFromKeyword(k.keyword) || 'general';
    const arr = groups.get(cluster) ?? [];
    arr.push(k);
    groups.set(cluster, arr);
  }
  const out: KeywordClusterItem[] = [];
  for (const [cluster, rows] of groups) {
    const topPage = rows[0]?.suggestedPageUrl || '/';
    const count = rows.length;
    const coverage = count > 5 ? 'HIGH' : count >= 3 ? 'MEDIUM' : 'LOW';
    out.push({
      cluster,
      keywords: [...new Set(rows.map((r) => r.keyword))].slice(0, 10),
      count,
      topPage,
      coverage,
    });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, 10);
}

export function buildKeywordActionPlanForReport(
  pageReports: Map<string, SeoPageReport>,
  trendKeywords: TrendKeywordInsight[]
): string[] {
  return generateActionPlan(pageReports, trendKeywords);
}

export function buildKeywordActionPlanItemsForReport(
  pageReports: Map<string, SeoPageReport>,
  trendKeywords: TrendKeywordInsight[]
): SeoActionPlanItem[] {
  return generateActionPlanItems(pageReports, trendKeywords);
}

export function buildCompetitorKeywordGapsForReport(
  pageReports: Map<string, SeoPageReport>,
  domain = '',
  pages: CrawlPageResult[] = []
): CompetitorGapItem[] {
  const crawlPages = pages.length ? pages : minimalCrawlPagesFromReports(pageReports);
  return competitorKeywordGaps(getCurrentKeywords(pageReports), domain, crawlPages);
}

export function buildKeywordClustersForReport(trendKeywords: TrendKeywordInsight[]): KeywordClusterItem[] {
  return buildKeywordClusters(trendKeywords);
}

export function buildTopOpportunitiesForReport(trendKeywords: TrendKeywordInsight[]): TrendKeywordInsight[] {
  return [...trendKeywords].sort((a, b) => (b.opportunityScore ?? b.priorityScore) - (a.opportunityScore ?? a.priorityScore)).slice(0, 5);
}

export function buildQuickWinsForReport(
  trendKeywords: TrendKeywordInsight[],
  pageReports: Map<string, SeoPageReport>
): TrendKeywordInsight[] {
  return trendKeywords
    .filter((k) => {
      const page = k.suggestedPageUrl || '';
      const seoScore = pageReports.get(page)?.seoScore ?? 0;
      const pageRank = Math.max(1, Math.min(100, 100 - Math.round(k.priorityScore)));
      return isQuickWin(pageRank, seoScore);
    })
    .slice(0, 5);
}

function getStableJitter(url: string): number {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return (hash % 5) - 2;
}

function clusterLabelFromKeyword(keyword: string): string {
  const k = cleanTrendKeyword(keyword)
    .replace(/\brecruitment\b/g, 'hiring')
    .replace(/\brecruiting\b/g, 'hiring')
    .replace(/\bsoftware\b/g, 'platform')
    .replace(/\btools?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return k.split(' ').slice(0, 3).join(' ');
}

export async function generateTrendKeywordsForDomain(
  domain: string,
  pages: CrawlPageResult[],
  pageReports: Map<string, SeoPageReport>,
  extractedProductFeatures: ProductFeatureInsight[] = []
): Promise<TrendKeywordInsight[]> {
  const settingFeatures = getProductFeatures();
  const pageFeatures = extractedProductFeatures.map((x) => x.feature);
  const topicSeeds = extractDomainSeedPhrases(pages, domain);
  const productFeatures = [...new Set([...topicSeeds, ...pageFeatures, ...settingFeatures])].slice(0, 25);
  const currentKeywords = getCurrentKeywords(pageReports);
  const competitorKeywords = competitorKeywordGaps(currentKeywords, domain, pages).map((x) => x.keyword);
  const externalTrendRows = await fetchTrendSeedKeywords(
    [...currentKeywords.slice(0, 4), ...productFeatures.slice(0, 3)],
    'India'
  );
  const trendMap = buildTrendMap(externalTrendRows);
  const externalTrendSignals = externalTrendRows.map((x) => x.keyword);
  const key = getOpenAiKey();
  if (!key) {
    logger.warn('OpenAI API key missing; trendKeywords not generated (no fallback).', { domain });
    return [];
  }
  try {
    const client = new OpenAI({ apiKey: key });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an SEO strategist. Return only valid JSON. Use all provided inputs and produce practical trend keywords, blog topics, and SEO clusters.',
        },
        {
          role: 'user',
          content: buildTrendKeywordPrompt(
            domain,
            productFeatures,
            currentKeywords,
            externalTrendSignals,
            competitorKeywords,
            pages,
            pageReports
          ),
        },
      ],
      temperature: 0.3,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
    });
    const text = completion.choices[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(text) as TrendKeywordsAiResponse;
    const normalized = normalizeTrendKeywords(parsed, pages, domain, trendMap, pageReports);
    if (!normalized.length) {
      logger.warn('OpenAI returned no usable trend keywords after normalization.', { domain });
    }
    return enrichWithExpandedKeywords(normalized, pages, domain, pageReports, trendMap);
  } catch (e) {
    logger.warn('OpenAI trend keyword generation failed; no fallback keywords returned.', { domain, error: String(e) });
    return [];
  }
}

export async function analyzePageWithAi(page: CrawlPageResult): Promise<SeoPageReport> {
  const map = await analyzePagesWithAi([page]);
  return (
    map.get(page.url) ||
    normalizeReport(
      {
        seoScore: 0,
        issues: [],
        suggestedTitle: page.title,
        suggestedMetaDescription: page.metaDescription,
        contentImprovements: [],
        internalLinkSuggestions: [],
      },
      page.url
    )
  );
}

function pageTopic(page: CrawlPageResult): string {
  const u = new URL(page.url);
  const slug = u.pathname
    .split('/')
    .filter(Boolean)
    .slice(-1)[0]
    ?.replace(/[-_]+/g, ' ')
    .replace(/\bpage\b/gi, '')
    .trim();
  const heading = page.headings[0]?.trim();
  const title = page.title.trim();
  const source = heading || slug || title || 'Page';
  return source
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 80);
}

function extractRealKeyword(page: CrawlPageResult): string {
  const text = `${page.title} ${page.headings[0] || ''}`.toLowerCase();
  const stopWords = new Set(['about', 'contact', 'home', 'page', 'welcome']);
  const keyword = text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 4)
    .join(' ')
    .trim();
  return keyword || pageTopic(page).toLowerCase();
}

function titleSuggestion(page: CrawlPageResult, forceUnique = false): string {
  const cleaned = page.title.trim();
  if (!forceUnique && cleaned.length >= 30 && cleaned.length <= 60) return cleaned;
  const base = pageTopic(page).slice(0, 42) || 'Page';
  const host = new URL(page.url).hostname.replace(/^www\./, '');
  return `${base} | ${host}`.slice(0, 60);
}

function metaSuggestion(page: CrawlPageResult, template?: string): string {
  const current = page.metaDescription.trim();
  if (current.length >= 110 && current.length <= 160) return current;
  const topic = pageTopic(page) || 'this page';
  const host = new URL(page.url).hostname.replace(/^www\./, '');
  const fallback = `Learn about ${topic} on ${host}. Explore key details, practical tips, and related resources.`;
  return (template ? template.replace(/\{topic\}/g, topic).replace(/\{site\}/g, host) : fallback).slice(0, 158);
}

function h1Suggestion(page: CrawlPageResult): string {
  const heading = page.headings[0]?.trim();
  if (heading) return heading.slice(0, 80);
  return pageTopic(page).slice(0, 80);
}

function bodyCopySuggestion(page: CrawlPageResult): string {
  const topic = pageTopic(page) || 'this page';
  const keyword = extractRealKeyword(page) || topic.toLowerCase();
  const pool = `${page.title} ${(page.headings || []).join(' ')} ${page.contentSnippet || ''}`;
  const features = inferFeaturesFromText(pool);
  const tokens = tokenize(pool).filter((t) => t.length > 4);
  const genericCaps = ['clarity', 'workflow automation', 'integration readiness', 'scalable delivery'];
  const [feature1, feature2, feature3] = [
    features[0] || tokens[0] || genericCaps[0],
    features[1] || tokens[1] || genericCaps[1],
    features[2] || tokens[2] || genericCaps[2],
  ];
  const mainProblem = page.url.toLowerCase().includes('/blog')
    ? 'fragmented information and weak topical depth'
    : 'operational friction and unclear value for visitors';
  const [benefit1, benefit2] = ['clarity for buyers', 'conversion and trust'];
  return (
    `${keyword} addresses ${mainProblem} for teams evaluating ${topic.toLowerCase()}. ` +
    `It highlights ${feature1}, ${feature2}, and ${feature3}. ` +
    `Strengthen this narrative to improve ${benefit1} and ${benefit2}.`
  ).slice(0, 700);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}

function uniqueCount(arr: string[]): number {
  return new Set(arr).size;
}

function hasAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

function computeTrendBoost(page: CrawlPageResult): number {
  const nowYear = new Date().getFullYear();
  const url = page.url.toLowerCase();
  const title = page.title.toLowerCase();
  const freshnessTerms = ['new', 'latest', 'best', 'top', 'guide', 'update', 'trends', '2025', '2026'];
  const yearSignal = [String(nowYear), String(nowYear - 1)].some((y) => url.includes(y) || title.includes(y));
  const termSignal = hasAny(`${url} ${title}`, freshnessTerms);
  const recencyBonus = yearSignal ? 12 : 0;
  const termBonus = termSignal ? 8 : 0;
  return Math.min(25, recencyBonus + termBonus);
}

function computeFreeKeywordInsights(
  page: CrawlPageResult,
  seoScore: number,
  issueTypes: string[]
): SeoPageReport['keywordInsights'] {
  const topic = pageTopic(page).toLowerCase();
  const topicTokens = tokenize(topic);
  const titleTokens = tokenize(page.title);
  const headingTokens = tokenize((page.headings || []).join(' '));
  const bodyTokens = tokenize(page.contentSnippet || '');

  const keyword = extractRealKeyword(page) || topic || 'general topic';
  const relevanceOverlap = uniqueCount(topicTokens.filter((t) => titleTokens.includes(t) || headingTokens.includes(t)));
  const relevanceBase = topicTokens.length ? Math.round((relevanceOverlap / topicTokens.length) * 100) : 50;
  const titleMatchBoost = page.title.toLowerCase().includes(keyword) ? 15 : 0;
  const headingMatchBoost = (page.headings[0] || '').toLowerCase().includes(keyword) ? 12 : 0;
  const bodySupportBoost = bodyTokens.some((t) => topicTokens.includes(t)) ? 8 : 0;
  const keywordPlacementScore = Math.max(10, Math.min(100, relevanceBase + titleMatchBoost + headingMatchBoost + bodySupportBoost));

  // Free "opportunity" model: prioritize pages likely to gain from better snippets/content.
  const ctrGap =
    (issueTypes.includes('missing_title') ? 18 : 0) +
    (issueTypes.includes('missing_meta_description') ? 20 : 0) +
    (issueTypes.includes('duplicate_title') ? 12 : 0);
  const positionGap = seoScore >= 50 && seoScore <= 80 ? 18 : seoScore < 50 ? 10 : 6;
  const trendBoost = computeTrendBoost(page);
  const intentMatchBoost = hasAny(page.url, ['/blog', '/guide', '/services', '/product']) ? 8 : 4;
  const technicalDrag =
    (issueTypes.includes('slow_page') ? 8 : 0) +
    (issueTypes.includes('broken_links') ? 10 : 0) +
    (issueTypes.includes('invalid_or_nonfunctional_link') ? 6 : 0);

  const opportunityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(keywordPlacementScore * 0.4 + ctrGap * 0.2 + positionGap * 0.15 + trendBoost * 0.15 + intentMatchBoost * 0.1 - technicalDrag)
    )
  );
  const rankingProbability = Math.max(5, Math.min(95, Math.round(opportunityScore * 0.9 + (seoScore * 0.25))));

  return {
    targetKeyword: keyword,
    keywordPlacementScore,
    rankingProbability,
    opportunityScore,
    trendBoost,
    serpSignals: getSerpSignals(keyword),
    recommendedWordCount: getRecommendedContentLength(keyword, page.url.includes('/blog') ? 'informational' : 'commercial'),
  };
}

function computeBacklinkSignals(pages: CrawlPageResult[]): BacklinkSignalsByUrl {
  const byUrl: BacklinkSignalsByUrl = new Map();
  const knownUrls = new Set(pages.map((p) => p.url));
  const incomingInternal = new Map<string, Set<string>>();

  for (const p of pages) {
    for (const href of p.links || []) {
      if (!knownUrls.has(href) || href === p.url) continue;
      const bucket = incomingInternal.get(href) ?? new Set<string>();
      bucket.add(p.url);
      incomingInternal.set(href, bucket);
    }
  }

  for (const p of pages) {
    const fromHost = new URL(p.url).hostname.replace(/^www\./, '');
    const externalDomains = new Set<string>();
    let externalLinksCount = 0;
    for (const href of p.links || []) {
      try {
        const to = new URL(href);
        const toHost = to.hostname.replace(/^www\./, '');
        if (toHost !== fromHost) {
          externalDomains.add(toHost);
          externalLinksCount++;
        }
      } catch {
        // Ignore malformed URLs.
      }
    }

    const internalReferringPages = incomingInternal.get(p.url)?.size ?? 0;
    const internalAuthorityScore = Math.max(0, Math.min(100, 25 + internalReferringPages * 9));
    const externalDiversityBonus = Math.min(20, externalDomains.size * 2);
    const externalVolumePenalty = externalLinksCount > 50 ? 10 : externalLinksCount > 25 ? 5 : 0;
    const backlinkQualityScore = Math.max(
      0,
      Math.min(100, Math.round(internalAuthorityScore * 0.75 + externalDiversityBonus - externalVolumePenalty))
    );

    byUrl.set(p.url, {
      internalReferringPages,
      uniqueExternalDomainsLinked: externalDomains.size,
      externalLinksCount,
      internalAuthorityScore,
      backlinkQualityScore,
    });
  }

  return byUrl;
}

function localContentImprovements(page: CrawlPageResult, issueTypes: string[]): string[] {
  const tips: string[] = [];
  const topic = pageTopic(page);
  if (issueTypes.includes('missing_h1') || issueTypes.includes('multiple_h1')) {
    tips.push(`Add exactly one clear H1 focused on "${topic}".`);
  }
  if (issueTypes.includes('missing_title') || issueTypes.includes('duplicate_title')) {
    tips.push('Create a unique title (45-60 chars) with page topic + brand.');
  }
  if (issueTypes.includes('missing_meta_description')) {
    tips.push('Write a unique meta description (120-160 chars) with value + CTA.');
  }
  if (issueTypes.includes('low_word_count')) {
    tips.push('Expand to 500+ words with sections: overview, benefits, use cases, FAQs.');
  }
  if (issueTypes.includes('images_without_alt')) {
    tips.push('Add descriptive alt text for key images using contextual keywords.');
  }
  if (issueTypes.includes('slow_page')) {
    tips.push('Improve speed by optimizing images, reducing JS, and fixing LCP/INP bottlenecks.');
  }
  if (tips.length === 0) {
    tips.push(`Enhance topical depth for "${topic}" with examples, proof points, and internal links.`);
  }
  return tips.slice(0, 4);
}

function buildLocalPasteReadyFixes(
  page: CrawlPageResult,
  issueTypes: string[],
  duplicateTitle: boolean
): {
  improvedContent: { h1?: string; title?: string; metaDescription?: string; bodyCopy?: string };
  pasteReadyFixes: { issueType: string; issueSummary: string; improvedContent: string }[];
} {
  const improved = {
    h1: h1Suggestion(page),
    title: titleSuggestion(page, duplicateTitle),
    metaDescription: metaSuggestion(page),
    bodyCopy: bodyCopySuggestion(page),
  };
  const byType = new Map<string, string>();
  if (issueTypes.includes('missing_h1') || issueTypes.includes('multiple_h1')) {
    byType.set('missing_h1', `<h1>${improved.h1}</h1>`);
    byType.set('multiple_h1', `<h1>${improved.h1}</h1>`);
  }
  if (issueTypes.includes('duplicate_title') || issueTypes.includes('missing_title') || duplicateTitle) {
    byType.set('duplicate_title', improved.title);
    byType.set('missing_title', improved.title);
  }
  if (issueTypes.includes('missing_meta_description')) {
    byType.set('missing_meta_description', improved.metaDescription);
  }
  if (issueTypes.includes('low_word_count')) {
    byType.set('low_word_count', improved.bodyCopy);
  }

  const pasteReadyFixes = issueTypes
    .filter((t) => byType.has(t))
    .map((t) => ({
      issueType: t,
      issueSummary: t.replace(/_/g, ' '),
      improvedContent: byType.get(t) as string,
    }));

  return { improvedContent: improved, pasteReadyFixes };
}

function buildPagePrompt(
  page: CrawlPageResult,
  issueTypes: string[],
  duplicateTitle: boolean
): string {
  return `You are an SEO copywriter generating paste-ready fixes.

Return JSON only.

Input page:
${JSON.stringify(
  {
    url: page.url,
    title: page.title,
    metaDescription: page.metaDescription,
    headings: page.headings.slice(0, 5),
    h1Count: page.h1Count,
    wordCount: page.wordCount,
    contentSnippet: (page.contentSnippet || '').slice(0, 650),
    issueTypes,
    duplicateTitle,
  },
  null,
  2
)}

Requirements:
- Mention only issues in issueTypes.
- improvedContent.title: unique, 45-60 chars when possible.
- improvedContent.metaDescription: 120-160 chars when possible.
- improvedContent.h1: concise, natural.
- improvedContent.bodyCopy: 90-150 words and directly relevant to this page.
- pasteReadyFixes[].improvedContent must be final text developers can paste.
- If issueType is missing_h1 or multiple_h1, provide HTML like <h1>...</h1>.
- For duplicate_title or missing_title, provide only title text.
- For missing_meta_description, provide only meta description text.
- For low_word_count, provide one ready-to-paste paragraph.

Output schema:
{
  "improvedContent": {
    "h1": "...",
    "title": "...",
    "metaDescription": "...",
    "bodyCopy": "..."
  },
  "pasteReadyFixes": [
    {
      "issueType": "missing_h1",
      "issueSummary": "No H1 heading on page",
      "improvedContent": "<h1>...</h1>"
    }
  ]
}`;
}

async function generatePageAiContent(
  client: OpenAI,
  page: CrawlPageResult,
  issueTypes: string[],
  duplicateTitle: boolean
): Promise<PageAiResponse | null> {
  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an SEO assistant. Return only valid JSON. Output must be directly paste-ready for web developers.',
        },
        { role: 'user', content: buildPagePrompt(page, issueTypes, duplicateTitle) },
      ],
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' },
    });
    const text = completion.choices[0]?.message?.content?.trim() || '{}';
    return JSON.parse(text) as PageAiResponse;
  } catch (e) {
    logger.warn('OpenAI per-page content generation failed; using local fallback.', {
      pageUrl: page.url,
      error: String(e),
    });
    return null;
  }
}

function scoreBand(value: number, good: number, ok: number, maxPenalty: number): number {
  if (value <= good) return 0;
  if (value >= ok) return maxPenalty;
  const ratio = (value - good) / (ok - good);
  return Math.round(maxPenalty * ratio);
}

function computeSeoScore(page: CrawlPageResult, duplicateTitle: boolean): number {
  let score = 100;
  const titleLen = page.title.trim().length;
  const metaLen = page.metaDescription.trim().length;
  const words = page.wordCount;
  const linkCount = page.links.length;

  if (!titleLen) score -= 20;
  else score -= scoreBand(Math.abs(55 - titleLen), 0, 35, 8);

  if (!metaLen) score -= 16;
  else score -= scoreBand(Math.abs(145 - metaLen), 0, 70, 7);

  if (page.h1Count === 0) score -= 14;
  else if (page.h1Count > 1) score -= 10;

  // Content depth penalty varies by page rather than one flat deduction.
  if (words < 150) score -= 10;
  else if (words < 300) score -= 7;
  else if (words < 500) score -= 4;

  // Reward pages with richer internal link graph; penalize too-thin linking.
  if (linkCount < 3) score -= 4;
  else if (linkCount < 8) score -= 2;
  else if (linkCount > 40) score += 1;

  if (page.imagesWithoutAlt > 0) score -= Math.min(16, page.imagesWithoutAlt * 2);
  if (page.brokenLinks.length > 0) score -= Math.min(18, page.brokenLinks.length * 4);
  if (duplicateTitle) score -= 10;
  if (page.loadTimeMs > config.slowPageMs) score -= scoreBand(page.loadTimeMs, config.slowPageMs, 8000, 10);
  if (!page.canonical.trim()) score -= 4;

  // Slight per-page variance factor from URL depth to avoid identical buckets.
  const depth = new URL(page.url).pathname.split('/').filter(Boolean).length;
  if (depth >= 3) score -= 1;
  score += getStableJitter(page.url);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function pushIssue(
  issues: AiIssueItem[],
  type: string,
  severity: 'high' | 'medium' | 'low',
  description: string,
  aiFixes: Record<string, string>
): void {
  issues.push({
    type,
    severity,
    description,
    fix: aiFixes[type] || 'Fix this issue based on SEO best practices for this page.',
  });
}

export async function analyzePagesWithAi(pages: CrawlPageResult[]): Promise<Map<string, SeoPageReport>> {
  return analyzePagesWithAiWithSignals(pages, new Map<string, PageSpeedMetrics>());
}

export async function analyzePagesWithAiWithSignals(
  pages: CrawlPageResult[],
  perfByUrl: Map<string, PageSpeedMetrics>
): Promise<Map<string, SeoPageReport>> {
  const key = getOpenAiKey();
  const map = new Map<string, SeoPageReport>();
  const openAiClient = key ? new OpenAI({ apiKey: key }) : null;

  const titleBuckets = new Map<string, string[]>();
  for (const p of pages) {
    const t = p.title.trim().toLowerCase();
    if (!t) continue;
    const bucket = titleBuckets.get(t) ?? [];
    bucket.push(p.url);
    titleBuckets.set(t, bucket);
  }
  const duplicateTitlePages = new Set<string>();
  for (const urls of titleBuckets.values()) {
    if (urls.length < 2) continue;
    for (const u of urls) duplicateTitlePages.add(u);
  }

  const aggregate: AggregateAudit = {
    total_pages: pages.length,
    pages_missing_meta: pages.filter((p) => !p.metaDescription.trim()).length,
    pages_missing_h1: pages.filter((p) => p.h1Count === 0).length,
    images_without_alt: pages.reduce((n, p) => n + p.imagesWithoutAlt, 0),
    broken_links: pages.reduce((n, p) => n + p.brokenLinks.length, 0),
    duplicate_titles: duplicateTitlePages.size,
  };

  let aggregateAi: AggregateAiResponse = {};
  if (openAiClient) {
    try {
      const completion = await openAiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an SEO advisor. Return only valid JSON matching the requested schema and keep recommendations practical.',
          },
          { role: 'user', content: buildAggregatePrompt(aggregate) },
        ],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      });
      const text = completion.choices[0]?.message?.content?.trim() || '{}';
      aggregateAi = JSON.parse(text) as AggregateAiResponse;
    } catch (e) {
      logger.warn('OpenAI aggregate analysis failed; using local recommendations.', { error: String(e) });
    }
  }

  const aiFixes = aggregateAi.issueFixes ?? {};
  const MAX_PAGE_AI_REWRITES = 15;
  let pageRewriteCalls = 0;
  const backlinkSignalsByUrl = computeBacklinkSignals(pages);

  const calcWeighted = (
    page: CrawlPageResult,
    issueTypes: string[],
    duplicateTitle: boolean,
    perf?: PageSpeedMetrics
  ): SeoPageReport['scoreBreakdown'] => {
    const wc = page.wordCount;
    const titleLen = page.title.trim().length;
    const metaLen = page.metaDescription.trim().length;
    const links = page.links.length;
    const load = perf?.lcpMs ?? page.loadTimeMs;

    const content = Math.max(
      0,
      100 - (wc < 150 ? 42 : wc < 300 ? 30 : wc < 500 ? 18 : 6) - (issueTypes.includes('missing_h1') ? 18 : 0)
    );
    const technical = Math.max(
      0,
      100
        - (issueTypes.includes('broken_links') ? 25 : 0)
        - (issueTypes.includes('invalid_or_nonfunctional_link') ? 15 : 0)
        - (issueTypes.includes('missing_canonical') ? 10 : 0)
        - (links < 3 ? 8 : links < 8 ? 4 : 0)
    );
    const onPage = Math.max(
      0,
      100
        - (issueTypes.includes('missing_title') ? 30 : 0)
        - (duplicateTitle ? 25 : 0)
        - (issueTypes.includes('multiple_h1') ? 15 : 0)
        - (titleLen > 0 && (titleLen < 30 || titleLen > 65) ? 8 : 0)
        - (metaLen > 0 && (metaLen < 110 || metaLen > 165) ? 6 : 0)
    );
    const uxPenaltyFromSpeed =
      (load && load > 4000 ? 20 : load && load > 2500 ? 10 : 0) +
      (perf?.cls && perf.cls > 0.25 ? 20 : perf?.cls && perf.cls > 0.1 ? 10 : 0) +
      (perf?.inpMs && perf.inpMs > 500 ? 20 : perf?.inpMs && perf.inpMs > 200 ? 10 : 0) +
      (issueTypes.includes('slow_page') ? 15 : 0);
    const ux = Math.max(0, 100 - uxPenaltyFromSpeed);
    const backlinks = backlinkSignalsByUrl.get(page.url)?.backlinkQualityScore ?? 45;
    const weightedTotal = Math.round(content * 0.25 + technical * 0.2 + backlinks * 0.2 + onPage * 0.2 + ux * 0.15);
    return { content, technical, backlinks, onPage, ux, weightedTotal };
  };

  for (const p of pages) {
    const isDuplicateTitle = duplicateTitlePages.has(p.url);
    const issues: AiIssueItem[] = [];
    if (!p.title.trim()) pushIssue(issues, 'missing_title', 'high', 'Missing page title.', aiFixes);
    if (!p.metaDescription.trim()) {
      pushIssue(issues, 'missing_meta_description', 'high', 'Missing meta description.', aiFixes);
    }
    if (p.h1Count === 0) pushIssue(issues, 'missing_h1', 'high', 'No H1 heading on the page.', aiFixes);
    if (p.h1Count > 1) pushIssue(issues, 'multiple_h1', 'medium', `Multiple H1 headings detected (${p.h1Count}).`, aiFixes);
    if (p.imagesWithoutAlt > 0) {
      pushIssue(issues, 'images_without_alt', 'medium', `${p.imagesWithoutAlt} image(s) missing ALT text.`, aiFixes);
    }
    if (p.brokenLinks.length > 0) {
      pushIssue(
        issues,
        'broken_links',
        'high',
        `${p.brokenLinks.length} broken or unreachable internal link(s) detected.`,
        aiFixes
      );
    }
    if (isDuplicateTitle) {
      pushIssue(issues, 'duplicate_title', 'medium', 'Title is duplicated across multiple pages.', aiFixes);
    }
    if (p.loadTimeMs > config.slowPageMs) {
      pushIssue(issues, 'slow_page', 'medium', `Page load time is high (~${p.loadTimeMs}ms).`, aiFixes);
    }
    if (!p.canonical.trim()) {
      pushIssue(issues, 'missing_canonical', 'low', 'Canonical tag is missing.', aiFixes);
    }
    if (p.wordCount < 250) {
      pushIssue(issues, 'low_word_count', 'low', `Content appears thin (${p.wordCount} words).`, aiFixes);
    }
    for (const inv of p.invalidNavLinks || []) {
      pushIssue(
        issues,
        'invalid_or_nonfunctional_link',
        'medium',
        `Non-functional link (${inv.reason}): ${inv.href}`,
        aiFixes
      );
    }

    const issueTypes = [...new Set(issues.map((x) => x.type))];
    const perf = perfByUrl.get(p.url);
    const backlinkInsights = backlinkSignalsByUrl.get(p.url);
    const localEnhanced = buildLocalPasteReadyFixes(p, issueTypes, isDuplicateTitle);

    let pageAi = null as PageAiResponse | null;
    const shouldCallPageAi = Boolean(openAiClient) && issueTypes.length > 0 && pageRewriteCalls < MAX_PAGE_AI_REWRITES;
    if (shouldCallPageAi) {
      pageRewriteCalls++;
      pageAi = await generatePageAiContent(openAiClient as OpenAI, p, issueTypes, isDuplicateTitle);
    }

    const pageFixMap = new Map<string, string>();
    for (const row of pageAi?.pasteReadyFixes ?? []) {
      const t = String(row.issueType ?? '').trim();
      const fix = String(row.improvedContent ?? '').trim();
      if (t && fix) pageFixMap.set(t, fix);
    }
    for (const row of localEnhanced.pasteReadyFixes) {
      if (!pageFixMap.has(row.issueType)) pageFixMap.set(row.issueType, row.improvedContent);
    }
    for (const issue of issues) {
      const issueSpecific = pageFixMap.get(issue.type);
      if (issueSpecific) issue.fix = issueSpecific;
    }

    const seoScore = computeSeoScore(p, isDuplicateTitle);
    const keywordInsights = computeFreeKeywordInsights(p, seoScore, issueTypes);
    const r: SeoPageReport = {
      url: p.url,
      seoScore,
      scoreBreakdown: calcWeighted(p, issueTypes, isDuplicateTitle, perf),
      keywordInsights,
      recommendedWordCount: keywordInsights?.recommendedWordCount,
      backlinkInsights,
      performanceMetrics: perf
        ? {
            source: 'pagespeed',
            lcpMs: perf.lcpMs,
            fcpMs: perf.fcpMs,
            cls: perf.cls,
            inpMs: perf.inpMs,
            ttfbMs: perf.ttfbMs,
            lighthousePerformanceScore: perf.lighthousePerformanceScore,
            lighthouseSeoScore: perf.lighthouseSeoScore,
            lighthouseAccessibilityScore: perf.lighthouseAccessibilityScore,
            lighthouseBestPracticesScore: perf.lighthouseBestPracticesScore,
          }
        : { source: 'crawl_estimate', lcpMs: p.loadTimeMs },
      issues,
      suggestedTitle: titleSuggestion(p, isDuplicateTitle),
      suggestedMetaDescription: metaSuggestion(p, aggregateAi.metaDescriptionTemplate),
      contentImprovements:
        aggregateAi.contentImprovementTips?.length
          ? aggregateAi.contentImprovementTips.slice(0, 2).concat(localContentImprovements(p, issueTypes)).slice(0, 4)
          : localContentImprovements(p, issueTypes),
      internalLinkSuggestions: aggregateAi.internalLinkingTips?.slice(0, 2) ?? [
        'Add contextual internal links from related pages using descriptive anchor text.',
      ],
      pasteReadyFixes: issueTypes
        .filter((t) => pageFixMap.has(t))
        .map((t) => ({
          issueType: t,
          issueSummary: t.replace(/_/g, ' '),
          improvedContent: pageFixMap.get(t) as string,
        })),
      improvedContent: {
        h1: String(pageAi?.improvedContent?.h1 ?? localEnhanced.improvedContent.h1 ?? '').trim() || undefined,
        title: String(pageAi?.improvedContent?.title ?? localEnhanced.improvedContent.title ?? '').trim() || undefined,
        metaDescription: String(
          pageAi?.improvedContent?.metaDescription ?? localEnhanced.improvedContent.metaDescription ?? ''
        ).trim() || undefined,
        bodyCopy: String(pageAi?.improvedContent?.bodyCopy ?? localEnhanced.improvedContent.bodyCopy ?? '').trim() || undefined,
      },
    };
    map.set(p.url, r);
  }

  return map;
}
