import type { StoredScanReport } from './reportFile.service';
import type { CompetitorGapItem, CrawlPageResult, KeywordClusterItem } from '../models/scan.model';
import fs from 'fs';
import path from 'path';
import { config } from '../config/config';

type NormalizedKeyword = {
  keyword: string;
  category: string;
  searchIntent: string;
  priorityScore: number;
  opportunityScore: number;
  suggestedPageUrl: string;
  updateAreas: string[];
  recommendedWordCount: string;
  competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  blogTopic: string;
  seoCluster: string;
};

type PageType = 'homepage' | 'product' | 'blog' | 'other';

export type IntelligenceReport = {
  executionMode: 'preview' | 'execute';
  summary: {
    currentScore: number;
    estimatedScore: number;
    improvement: number;
    confidenceScore: number;
    pagesAnalyzed: number;
    totalIssues: number;
    breakdown: {
      technicalScore: number;
      contentScore: number;
      keywordScore: number;
      linkScore: number;
    };
    impactPrediction: {
      trafficIncreasePercent: number;
      rankingImprovementEstimate: string;
    };
  };
  pages: Array<{
    pageUrl: string;
    seoScore: number;
    primaryKeyword: string;
    secondaryKeywords: string[];
    searchIntent: string;
    priorityScore: number;
    opportunityScore: number;
    competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendedWordCount: number;
    issues: Array<{ type: string; severity: string; description: string; fix: string }>;
    recommendedFixes: Array<{ type: string; priority: string; suggested: string }>;
    quickWin: boolean;
    pageType: PageType;
    keywordInsight: {
      keyword: string;
      intent: string;
      searchIntentType: string;
      priorityScore: number;
      opportunityScore: number;
      competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      serpSignals: {
        competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        estimatedTopDomains: string[];
        avgTitleLength: number;
      };
      recommendedWordCount: number;
    };
    contentAnalysis: {
      wordCount: number;
      recommendedWordCount: number;
      keywordCoverage: number;
      readabilityScore: number;
      headingStructure: {
        h1: 'present' | 'missing';
        optimized: boolean;
        h2Count: number;
        h3Count: number;
      };
      missingTopics: string[];
      contentGaps: string[];
      improvementSuggestions: string[];
    };
    headingAnalysis: {
      currentH1: string;
      isOptimized: boolean;
      suggestedH1: string;
      h2Suggestions: string[];
      h3Suggestions: string[];
    };
    imageAnalysis: Array<{
      imageUrl: string;
      altText: string;
      isAltMissing: boolean;
      isRelevantToContent: boolean;
      contextMatchScore: number;
      conversionImpact: 'HIGH' | 'MEDIUM' | 'LOW';
      suggestedImageType: 'dashboard' | 'ui' | 'illustration' | 'workflow';
      issue: string;
      suggestion: {
        altText: string;
        filename: string;
        context: string;
      };
      improvement: string;
    }>;
    contentSuggestions: {
      introParagraph: string;
      intro: string;
      additionalSections: string[];
      sectionDetails: Array<{
        heading: string;
        points: string[];
      }>;
      faqSuggestions: string[];
      blogTopics: string[];
    };
    /** Overlap of primaryKeyword with live slug + title + H1 (higher = safer topical fit). */
    topicAlignmentScore: number;
    /** When fit is weak, warn reviewers not to trust auto snippets blindly. */
    topicReviewerWarning: string | null;
  }>;
  keywordStrategy: {
    primaryKeywords: Array<{
      keyword: string;
      intent: string;
      targetPage: string;
      priorityScore: number;
      opportunityScore: number;
    }>;
    longTailKeywords: Array<{ keyword: string; intent: string; targetPage: string; priorityScore: number; opportunityScore: number }>;
    blogKeywords: Array<{ keyword: string; intent: string; targetPage: string; priorityScore: number; opportunityScore: number }>;
    comparisonKeywords: Array<{ keyword: string; intent: string; targetPage: string; priorityScore: number; opportunityScore: number }>;
  };
  keywordClusters: KeywordClusterItem[];
  keywordMapping: Array<{ keyword: string; targetPage: string; reason: string }>;
  competitorKeywordGaps: CompetitorGapItem[];
  quickWins: Array<{ page: string; action: string; exactChange: string; impact: 'HIGH' | 'MEDIUM' | 'LOW'; reason: string }>;
  topOpportunities: Array<{ keyword: string; targetPage: string; opportunityScore: number; priorityScore: number; reason: string }>;
  technicalIssues: Array<{ type: string; page: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; impact: string; fixSuggestion: string }>;
  internalLinks: Array<{ from: string; to: string; anchorText: string; reason: string }>;
  newPageSuggestions: Array<{
    keyword: string;
    url: string;
    intent: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    reason: string;
    contentBrief: { headings: string[]; wordCount: number };
  }>;
  decisions: Array<{
    actionType: string;
    page: string;
    /** Target query / primary keyword this action is optimizing for (answers "which keyword is missing in H1?"). */
    primaryKeyword: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    reason: string;
    expectedImpact: string;
    impactType: 'SEO_ONLY' | 'CONTENT' | 'UX' | 'RISKY';
    actionConfidence: { score: number; reason: string };
  }>;
  decisionGroups: {
    highImpact: Array<{
      actionType: string;
      page: string;
      primaryKeyword: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      reason: string;
      expectedImpact: string;
      impactType: 'SEO_ONLY' | 'CONTENT' | 'UX' | 'RISKY';
      actionConfidence: { score: number; reason: string };
    }>;
    quickWins: Array<{
      actionType: string;
      page: string;
      primaryKeyword: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      reason: string;
      expectedImpact: string;
      impactType: 'SEO_ONLY' | 'CONTENT' | 'UX' | 'RISKY';
      actionConfidence: { score: number; reason: string };
    }>;
    contentImprovements: Array<{
      actionType: string;
      page: string;
      primaryKeyword: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      reason: string;
      expectedImpact: string;
      impactType: 'SEO_ONLY' | 'CONTENT' | 'UX' | 'RISKY';
      actionConfidence: { score: number; reason: string };
    }>;
    technicalFixes: Array<{
      actionType: string;
      page: string;
      primaryKeyword: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      reason: string;
      expectedImpact: string;
      impactType: 'SEO_ONLY' | 'CONTENT' | 'UX' | 'RISKY';
      actionConfidence: { score: number; reason: string };
    }>;
  };
  executionPlan: Array<{
    page: string;
    filePath: string;
    impactType: 'SEO_ONLY' | 'CONTENT' | 'UX' | 'RISKY';
    topicAlignmentScore: number;
    topicReviewerWarning: string | null;
    actionConfidence: { score: number; reason: string };
    executionAllowed: boolean;
    executionBlockReason?: string;
    changes: Array<{
      selector: string;
      action: string;
      current: string;
      suggested: string;
      diffPreview: {
        before: string;
        after: string;
        diffType: 'replace' | 'insert' | 'append';
      };
    }>;
  }>;
  prGroups: {
    metaFixes: Array<{
      groupId: string;
      page: string;
      filePath: string;
      changes: Array<{
        selector: string;
        action: string;
        current: string;
        suggested: string;
        diffPreview: {
          before: string;
          after: string;
          diffType: 'replace' | 'insert' | 'append';
        };
      }>;
    }>;
    contentUpdates: Array<{
      groupId: string;
      page: string;
      filePath: string;
      changes: Array<{
        selector: string;
        action: string;
        current: string;
        suggested: string;
        diffPreview: {
          before: string;
          after: string;
          diffType: 'replace' | 'insert' | 'append';
        };
      }>;
    }>;
    internalLinks: Array<{
      groupId: string;
      page: string;
      filePath: string;
      changes: Array<{
        selector: string;
        action: string;
        current: string;
        suggested: string;
        diffPreview: {
          before: string;
          after: string;
          diffType: 'replace' | 'insert' | 'append';
        };
      }>;
    }>;
    technicalFixes: Array<{
      groupId: string;
      page: string;
      filePath: string;
      changes: Array<{
        selector: string;
        action: string;
        current: string;
        suggested: string;
        diffPreview: {
          before: string;
          after: string;
          diffType: 'replace' | 'insert' | 'append';
        };
      }>;
    }>;
  };
  executionTracking: Array<{
    prId: string;
    status: 'created' | 'merged' | 'rejected';
    expectedImpact: string;
    actualImpact?: string;
  }>;
  learningInsights: Array<{
    actionType: string;
    success: boolean;
    expectedImpact: number;
    actualImpact: number;
    accuracyScore: number;
  }>;
  historicalLearning: {
    byActionType: Array<{
      actionType: string;
      totalRuns: number;
      successRate: number;
      averageEffectiveness: number;
      averageAccuracy: number;
    }>;
  };
  weightingAdjustments: {
    priorityWeight: number;
    opportunityWeight: number;
    basedOnLearning: boolean;
  };
  scoreSimulation: {
    before: number;
    after: number;
    improvements: string[];
    scoreBreakdown: Array<{ action: string; impact: number }>;
  };
  explanation: {
    whyThisMatters: string;
    expectedOutcome: string;
  };
  dataQualityCheck: {
    pagesAnalyzed: number;
    uniqueKeywords: number;
    duplicateKeywordsRemoved: number;
    invalidKeywordsFiltered: number;
    duplicatesRemoved: number;
    invalidFiltered: number;
  };
};

const GENERIC_KEYWORDS = new Set(['about', 'contact', 'home', 'page', 'welcome']);
const FILLER_PATTERNS = ['solution', 'tools', 'software tools', 'platform solution'];
const INTENT_INDICATORS = ['what', 'how', 'best', 'vs', 'for', 'alternatives'];
const NOUN_HINTS = [
  'platform',
  'software',
  'services',
  'solutions',
  'consulting',
  'automation',
  'integration',
  'cloud',
  'development',
  'implementation',
  'management',
  'digital',
  'hiring',
  'recruitment',
  'candidate',
  'ats',
  'screening',
  'interview',
];

function isInvalidKeyword(kw: string): boolean {
  const k = String(kw || '').toLowerCase().trim();
  if (!k || GENERIC_KEYWORDS.has(k)) return true;
  const words = k.split(/\s+/).filter(Boolean);
  if (words.length < 3 || words.length > 8) return true;
  if (/\bvariant\b/.test(k)) return true;
  if (FILLER_PATTERNS.some((p) => k.includes(p))) return true;
  const root = words.slice(0, 2).join(' ');
  const rootCount = words.join(' ').split(root).length - 1;
  if (rootCount > 2) return true;
  return false;
}

function isRepetitiveKeyword(k: string): boolean {
  const matches = String(k || '').toLowerCase().match(/\b(platform|software|tools?)\b/g) || [];
  return matches.length >= 2;
}

function isSearchLike(keyword: string): boolean {
  const k = String(keyword || '').toLowerCase().trim();
  const hasIntent = INTENT_INDICATORS.some((x) => k.includes(x));
  const hasTransactionalShape =
    (k.includes('platform') || k.includes('software') || k.includes('services') || k.includes('solutions')) &&
    (k.length > 12 || k.includes('for') || k.includes('best'));
  const hiringTxn =
    (k.includes('hiring') || k.includes('recruitment') || k.includes('candidate')) &&
    (k.includes('platform') || k.includes('software'));
  return hasIntent || hasTransactionalShape || hiringTxn;
}

function normalizeKeywordGrammar(keyword: string): string {
  let k = normalizePhrase(keyword);
  k = k.replace(/\bhow how to\b/g, 'how to');
  k = k.replace(/\bhow to works\b/g, 'how it works');
  k = k.replace(/\bwhat is how to\b/g, '');
  k = k.replace(/\bwhat is what\b/g, 'what is');
  k = k.replace(/\bhow to platform\b/g, 'how to use platform');
  k = k.replace(/\bhow to software\b/g, 'how to use software');
  k = k.replace(/\bhow how\b/g, 'how');
  k = k.replace(/\bwhat what\b/g, 'what');
  return k.replace(/\s+/g, ' ').trim();
}

function isNaturalSearchQuery(keyword: string): boolean {
  const k = normalizeKeywordGrammar(keyword);
  if (!k) return false;
  const words = k.split(' ').filter(Boolean);
  if (words.length < 3 || words.length > 8) return false;
  if (/\b(how|what|best|vs|for)\s+\1\b/.test(k)) return false;
  if (/^what is how to\b/.test(k)) return false;
  if (/^how to (platform|software|tool)\b/.test(k)) return false;
  const hasNoun = NOUN_HINTS.some((n) => k.includes(n));
  if (!hasNoun) return false;
  const validShape =
    /^what is [a-z0-9 ]+$/.test(k) ||
    /^how [a-z0-9 ]+ works$/.test(k) ||
    /^best [a-z0-9 ]+ for [a-z0-9 ]+$/.test(k) ||
    /^[a-z0-9 ]+ vs [a-z0-9 ]+$/.test(k) ||
    /^[a-z0-9 ]+ for [a-z0-9 ]+$/.test(k) ||
    /^[a-z0-9 ]+ (platform|software)$/.test(k);
  return validShape;
}

function normalizePhrase(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function clusterRoot(k: string): string {
  const n = normalizePhrase(k).split(' ').filter(Boolean);
  return n.slice(0, 2).join(' ');
}

function inferCategoryFromKeyword(keyword: string): NormalizedKeyword['category'] {
  const k = normalizePhrase(keyword);
  if (k.includes(' vs ') || k.includes('alternative') || k.includes('compare')) return 'bofu_comparison';
  if (k.startsWith('what ') || k.startsWith('how ') || k.includes('benefits')) return 'blog_tofu';
  if (k.includes(' for ')) return 'long_tail';
  return 'domain_trend';
}

function inferIntentFromKeyword(keyword: string): NormalizedKeyword['searchIntent'] {
  const k = normalizePhrase(keyword);
  if (k.includes(' vs ') || k.includes('alternative') || k.includes('best')) return 'commercial';
  if (k.startsWith('what ') || k.startsWith('how ') || k.includes('benefits')) return 'informational';
  if (k.includes('platform') || k.includes('software')) return 'transactional';
  return 'commercial';
}

function generateIntentKeywords(baseKeyword: string, pageContext: string): Array<{ keyword: string; category: NormalizedKeyword['category']; searchIntent: NormalizedKeyword['searchIntent'] }> {
  const base = normalizePhrase(baseKeyword).replace(/\b(solution|tools|software tools|platform solution)\b/g, '').replace(/\s+/g, ' ').trim();
  const context = normalizePhrase(pageContext || 'business');
  const ctx = context.includes('staffing') ? 'staffing agencies' : context.includes('startup') ? 'startups' : 'teams';
  const transactional = [`${base} platform`, `${base} software`];
  const informational = [`what is ${base}`, `how ${base} works`];
  const comparison = [`${base} vs alternatives`, `best ${base} comparison`];
  const longTail = [`${base} for startups`, `${base} for ${ctx}`];
  return [
    ...transactional.map((keyword) => ({ keyword, category: 'domain_trend' as const, searchIntent: 'transactional' as const })),
    ...informational.map((keyword) => ({ keyword, category: 'blog_tofu' as const, searchIntent: 'informational' as const })),
    ...comparison.map((keyword) => ({ keyword, category: 'bofu_comparison' as const, searchIntent: 'commercial' as const })),
    ...longTail.map((keyword) => ({ keyword, category: 'long_tail' as const, searchIntent: 'commercial' as const })),
  ];
}

function collapseDuplicateWords(s: string): string {
  return String(s || '')
    .replace(/\b(\w+)(\s+\1\b)+/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateNaturalHeading(keyword: string): string {
  let k = normalizeKeywordGrammar(keyword);
  if (/^best what\b/i.test(k)) k = k.replace(/^best what\b/i, 'what is');
  const coreRaw = k
    .replace(/^what is\s+/, '')
    .replace(/^how\s+/, '')
    .replace(/\s+works$/, '')
    .replace(/\s+vs\s+alternatives.*$/i, '')
    .trim();
  const core = collapseDuplicateWords(coreRaw);
  const titleCaseWords = (s: string) =>
    collapseDuplicateWords(s)
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  let heading = '';
  if (/ vs /.test(k)) {
    const p = k.split(/\s+vs\s+/i);
    const a = (p[0] || '').trim();
    const b = (p[1] || 'alternatives').trim();
    const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
    heading = `${titleCase(a)} vs ${titleCase(b)}`;
  } else if (k.startsWith('what is')) {
    const fragment = titleCaseWords(core || coreRaw || k.replace(/^what is\s+/i, '').trim());
    heading = fragment ? `What Is ${fragment}?` : 'What Is This Topic?';
  } else if (k.startsWith('how ')) {
    const fragment = titleCaseWords(core || coreRaw || k.replace(/^how\s+/i, '').trim());
    heading = fragment ? `How ${fragment} Works` : 'How It Works';
  } else if (k.includes('for')) {
    const frag = titleCaseWords(core || coreRaw || k);
    heading = frag ? `Best ${frag}` : titleCaseWords(k);
  } else {
    const frag = titleCaseWords(core || coreRaw || k);
    heading = frag ? `${frag}: Overview` : `${titleCaseWords(k)}: Overview`;
  }
  heading = collapseDuplicateWords(heading.replace(/\bWhat Is What\b/gi, 'What Is'));
  heading = heading.replace(/\b(\w+)( \1\b)+/gi, '$1').replace(/\s+/g, ' ').trim();
  return heading.slice(0, 60);
}

function generateAnchorText(keyword: string): string | null {
  const k = normalizeKeywordGrammar(keyword);
  if (!isNaturalSearchQuery(k)) return null;
  const cleaned = k
    .replace(/^what is\s+/, '')
    .replace(/^how\s+/, '')
    .replace(/\s+works$/, '')
    .replace(/\b(for|the|a|an|to|it)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const short = cleaned.split(' ').slice(0, 5).join(' ').trim();
  return short ? short.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

function generateContentPlan(keyword: string, pageTypeValue: PageType, pageHeadline: string): {
  introParagraph: string;
  intro: string;
  additionalSections: string[];
  sectionDetails: Array<{ heading: string; points: string[] }>;
  faqSuggestions: string[];
  blogTopics: string[];
} {
  const seoPhrase = normalizeKeywordGrammar(keyword);
  const hub = topicLabelForSections(pageHeadline, 5);
  const h1Preview = collapseDuplicateWords(pageHeadline.slice(0, 70)).trim() || hub;
  const sections =
    pageTypeValue === 'blog'
      ? [
          `${hub}: background`,
          `${hub}: what readers should validate`,
          `${hub}: options and tradeoffs`,
          `${hub}: recommended next steps`,
        ]
      : [
          `${hub}: overview`,
          `${hub}: scope and capabilities`,
          `${hub}: typical outcomes`,
          `${hub}: rollout considerations`,
        ];
  const sectionDetails = sections.slice(0, 5).map((s) => ({
    heading: s,
    points: ['Clarify the reader problem', 'Add concrete steps or examples', 'Tie recommendations to measurable outcomes'],
  }));
  return {
    introParagraph: `${h1Preview} should clarify who the page is for, the problem solved, and the primary call to action. Weave "${seoPhrase}" into body copy only where it fits naturally.`,
    intro: `${h1Preview} should clarify who the page is for, the problem solved, and the primary call to action. Weave "${seoPhrase}" into body copy only where it fits naturally.`,
    additionalSections: sections,
    sectionDetails,
    faqSuggestions: [`What should readers know about ${hub}?`, `How does ${hub} apply in practice?`, `What outcomes should teams expect?`].map((x) => x.slice(0, 80)),
    blogTopics: [`${h1Preview}`, `Practical checklist for ${hub}`, `Measurement and follow-up for ${hub}`].map((x) => x.slice(0, 80)),
  };
}

function generateImageSuggestions(pageUrl: string, keyword: string, pageTypeValue: PageType): Array<{
  imageUrl: string;
  altText: string;
  isAltMissing: boolean;
  isRelevantToContent: boolean;
  contextMatchScore: number;
  conversionImpact: 'HIGH' | 'MEDIUM' | 'LOW';
  suggestedImageType: 'dashboard' | 'ui' | 'illustration' | 'workflow';
  issue: string;
  suggestion: { altText: string; filename: string; context: string };
  improvement: string;
}> {
  const type: 'dashboard' | 'ui' | 'illustration' | 'workflow' =
    pageTypeValue === 'product' ? 'dashboard' : pageTypeValue === 'homepage' ? 'ui' : pageTypeValue === 'blog' ? 'workflow' : 'illustration';
  const safeKeyword = normalizeKeywordGrammar(keyword);
  return [
    {
      imageUrl: `(suggested) ${type}`,
      altText: '',
      isAltMissing: true,
      isRelevantToContent: true,
      contextMatchScore: 70,
      conversionImpact: pageTypeValue === 'product' || pageTypeValue === 'homepage' ? 'HIGH' : 'MEDIUM',
      suggestedImageType: type,
      issue: 'missing representative visual',
      suggestion: {
        altText: `${safeKeyword} product or service context`.slice(0, 110),
        filename: `${slugFromUrl(pageUrl)}-${type}.webp`,
        context: `Hero visual for ${safeKeyword}`,
      },
      improvement: `Add ${type} image aligned to "${safeKeyword}"`,
    },
  ];
}

function finalKeywordQualityCheck(keywords: NormalizedKeyword[]): NormalizedKeyword[] {
  const seen = new Set<string>();
  const out: NormalizedKeyword[] = [];
  for (const row of keywords) {
    const normalized = normalizeKeywordGrammar(row.keyword);
    if (!normalized) continue;
    if (!isNaturalSearchQuery(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({ ...row, keyword: normalized });
  }
  return out;
}

function domainHostBrand(domain: string): string {
  return domain
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .split('.')
    .filter(Boolean)[0]
    ?.toLowerCase()
    .trim() || '';
}

/** Fix common crawl/display glitches in heading text. */
function decodeBasicHtmlEntities(text: string): string {
  return String(text || '')
    .replace(/&#8217;|&#8216;|&#x2019;/gi, "'")
    .replace(/&#8220;|&#8221;|&#x201c;|&#x201d;/gi, '"')
    .replace(/&#038;|&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeHeadingDisplay(text: string): string {
  const decoded = decodeBasicHtmlEntities(text);
  return decoded
    .replace(/\bCapabiltiies\b/gi, 'Capabilities')
    .replace(/\bcapabiltiies\b/gi, 'capabilities')
    .trim();
}

function mapKeywordToPageAdvanced(
  keyword: string,
  reports: Array<{ url: string; suggestedTitle?: string; improvedContent?: { h1?: string } }>,
  crawlByUrl: Map<string, CrawlPageResult>,
  domain: string
): string {
  const brand = domainHostBrand(domain);
  const k = normalizePhrase(keyword);
  const kTokens = k.split(' ').filter((t) => t.length > 1);
  const meaningfulTokens = kTokens.filter((t) => t !== brand && t.length > 2);
  const home = reports.find((r) => /\/$/.test(r.url))?.url || reports[0]?.url || '/';

  let best = { url: home, score: -1 };
  for (const r of reports) {
    const crawl = crawlByUrl.get(r.url);
    const h1c = sanitizeHeadingDisplay(crawl?.headings?.[0] || '');
    const pathSlug = normalizePhrase(slugFromUrl(r.url).replace(/-/g, ' '));
    const hay = normalizePhrase(
      [r.suggestedTitle, r.improvedContent?.h1, h1c, crawl?.title, crawl?.metaDescription, pathSlug].join(' ')
    );
    let score = kTokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    if (brand && meaningfulTokens.length > 0) {
      const strong = meaningfulTokens.filter((t) => hay.includes(t)).length;
      if (strong === 0) score = Math.min(score, 1);
    }
    if (score > best.score) best = { url: r.url, score };
  }

  const needStrong = meaningfulTokens.length >= 2;
  const minScore = needStrong ? 2 : 1;
  if (best.score < minScore) return home;
  return best.url || home;
}

function buildSemanticInternalLinks(
  pages: Array<{ pageUrl: string; primaryKeyword: string; pageType: PageType }>
): Array<{ from: string; to: string; anchorText: string; reason: string }> {
  const out: Array<{ from: string; to: string; anchorText: string; reason: string }> = [];
  for (const from of pages) {
    const related = pages
      .filter((p) => p.pageUrl !== from.pageUrl)
      .map((p) => ({
        page: p,
        score: from.primaryKeyword
          .split(' ')
          .filter(Boolean)
          .reduce((n, t) => n + (p.primaryKeyword.includes(t) ? 1 : 0), 0),
      }))
      .sort((a, b) => b.score - a.score || a.page.pageUrl.localeCompare(b.page.pageUrl))
      .slice(0, 3)
      .filter((x) => x.score >= 2);
    for (const r of related) {
      out.push({
        from: from.pageUrl,
        to: r.page.pageUrl,
        anchorText: r.page.primaryKeyword,
        reason: `Semantic cluster alignment with "${r.page.primaryKeyword}"`,
      });
    }
  }
  return out;
}

function level(priority: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (priority >= 75) return 'HIGH';
  if (priority >= 55) return 'MEDIUM';
  return 'LOW';
}

function domainBrandToken(scanData: StoredScanReport): string {
  const raw = String(scanData.domain || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
  return raw.split('.').filter(Boolean)[0] || 'site';
}

function normalizeKeywords(scanData: StoredScanReport): {
  keywords: NormalizedKeyword[];
  duplicateRemoved: number;
  invalidFiltered: number;
} {
  const src = Array.isArray(scanData.trendKeywords) ? scanData.trendKeywords : [];
  const seen = new Set<string>();
  let duplicateRemoved = 0;
  let invalidFiltered = 0;
  const out: NormalizedKeyword[] = [];

  for (const row of src) {
    const keyword = normalizeKeywordGrammar(String(row.keyword || '').toLowerCase().replace(/\s+/g, ' ').trim());
    if (isInvalidKeyword(keyword) || isRepetitiveKeyword(keyword) || !isSearchLike(keyword) || !isNaturalSearchQuery(keyword)) {
      invalidFiltered++;
      continue;
    }
    if (seen.has(keyword)) {
      duplicateRemoved++;
      continue;
    }
    seen.add(keyword);
    out.push({
      keyword,
      category: row.category || 'domain_trend',
      searchIntent: row.searchIntent || 'commercial',
      priorityScore: Math.max(1, Number(row.priorityScore || 1)),
      opportunityScore: Math.max(1, Number(row.opportunityScore || row.priorityScore || 1)),
      suggestedPageUrl: String(row.suggestedPageUrl || '').trim(),
      updateAreas: Array.isArray(row.updateAreas) && row.updateAreas.length ? row.updateAreas : ['title', 'h1', 'meta_description'],
      recommendedWordCount: String(row.recommendedWordCount || '800-1200'),
      competitionLevel: (row.serpSignals?.competitionLevel || 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH',
      reason: String(row.reason || 'Improve keyword-page relevance and conversion intent.').trim(),
      blogTopic: String(row.blogTopic || '').trim(),
      seoCluster: String(row.seoCluster || '').trim(),
    });
  }

  // Intent-driven enrichment from base topics.
  const baseSeeds = [
    ...new Set(
      [
        ...out.map((k) => k.keyword),
        ...Object.values(scanData.pageReports || {}).map((r) =>
          normalizePhrase(r.keywordInsights?.targetKeyword || r.suggestedTitle || '')
        ),
      ]
        .map((k) => clusterRoot(k))
        .filter(Boolean)
    ),
  ].slice(0, 8);

  for (const seed of baseSeeds) {
    const generated = generateIntentKeywords(seed, seed);
    for (const g of generated) {
      const keyword = normalizeKeywordGrammar(normalizePhrase(g.keyword));
      if (seen.has(keyword)) continue;
      if (isInvalidKeyword(keyword) || isRepetitiveKeyword(keyword) || !isSearchLike(keyword) || !isNaturalSearchQuery(keyword)) continue;
      seen.add(keyword);
      out.push({
        keyword,
        category: g.category,
        searchIntent: g.searchIntent,
        priorityScore: 55,
        opportunityScore: 58,
        suggestedPageUrl: '',
        updateAreas: ['title', 'h1', 'meta_description'],
        recommendedWordCount: g.searchIntent === 'informational' ? '1200-1600' : g.searchIntent === 'transactional' ? '700-1000' : '900-1200',
        competitionLevel: 'MEDIUM',
        reason: 'Intent-driven keyword expansion for realistic market coverage.',
        blogTopic: '',
        seoCluster: clusterRoot(keyword),
      });
    }
  }

  // Diversity control: max 3 per cluster and ensure intent coverage.
  const clusterCounts = new Map<string, number>();
  const diversified: NormalizedKeyword[] = [];
  for (const k of out) {
    const root = clusterRoot(k.keyword);
    const count = clusterCounts.get(root) || 0;
    if (count >= 3) {
      duplicateRemoved++;
      continue;
    }
    clusterCounts.set(root, count + 1);
    diversified.push(k);
  }
  const hasInfo = diversified.some((k) => k.searchIntent === 'informational');
  const hasTxn = diversified.some((k) => k.searchIntent === 'transactional');
  const hasCmp = diversified.some((k) => /vs|alternative/.test(k.keyword));
  const seed = baseSeeds[0];
  if (seed) {
    const ensure = generateIntentKeywords(seed, seed);
    const addIfMissing = (predicate: boolean, matcher: (k: { keyword: string }) => boolean) => {
      if (predicate) return;
      const candidate = ensure.find((k) => matcher(k) && !seen.has(normalizeKeywordGrammar(normalizePhrase(k.keyword))));
      if (!candidate) return;
      const keyword = normalizeKeywordGrammar(normalizePhrase(candidate.keyword));
      diversified.push({
        keyword,
        category: candidate.category,
        searchIntent: candidate.searchIntent,
        priorityScore: 55,
        opportunityScore: 58,
        suggestedPageUrl: '',
        updateAreas: ['title', 'h1', 'meta_description'],
        recommendedWordCount: candidate.searchIntent === 'informational' ? '1200-1600' : candidate.searchIntent === 'transactional' ? '700-1000' : '900-1200',
        competitionLevel: 'MEDIUM',
        reason: 'Intent coverage normalization.',
        blogTopic: '',
        seoCluster: clusterRoot(keyword),
      });
      seen.add(keyword);
    };
    addIfMissing(hasInfo, (k) => /^what is|^how /.test(normalizePhrase(k.keyword)));
    addIfMissing(hasTxn, (k) => /platform|software/.test(normalizePhrase(k.keyword)));
    addIfMissing(hasCmp, (k) => /vs|alternative/.test(normalizePhrase(k.keyword)));
  }

  diversified.sort((a, b) => (b.opportunityScore - a.opportunityScore) || (b.priorityScore - a.priorityScore));
  return { keywords: diversified, duplicateRemoved, invalidFiltered };
}

function pageType(url: string): PageType {
  if (/\/$/.test(url)) return 'homepage';
  if (/\/blog\//.test(url)) return 'blog';
  if (/\/(product|feature|agent|solution|service|platform)/.test(url)) return 'product';
  return 'other';
}

function recommendedWordCountNum(range: string): number {
  const n = Number(String(range || '').split('-')[0]);
  return Number.isFinite(n) && n > 0 ? n : 900;
}

function normalizeUrlPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname || '/';
  } catch {
    return '/';
  }
}

function slugFromUrl(url: string): string {
  const p = normalizeUrlPath(url).replace(/^\/+|\/+$/g, '');
  if (!p) return 'home';
  return p.split('/').filter(Boolean).join('-');
}

function cleanTitleForH1(title: string): string {
  let t = decodeBasicHtmlEntities(title).replace(/\s+/g, ' ').trim();
  if (!t) return '';
  t = t.replace(/\s*\|\s*.+$/i, '').trim();
  t = t.replace(/\s*\|\s*Scadea\b.*$/i, '').trim();
  if (t.length > 88) t = t.slice(0, 88).replace(/\s+\S*$/, '').trim();
  return t;
}

function smartTitleCaseFromSlug(phrase: string): string {
  const small = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'vs', 'from', 'into', 'it', 'is']);
  const words = phrase.split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      const lw = w.toLowerCase();
      if (lw === 'aiops') return 'AIOps';
      if (lw === 'api') return 'API';
      if (lw === 'aws') return 'AWS';
      if (lw === 'gcp') return 'GCP';
      if (lw === 'rpa') return 'RPA';
      if (lw === 'bpm') return 'BPM';
      if (lw === 'sql') return 'SQL';
      if (lw === 'angular') return 'Angular';
      if (i > 0 && small.has(lw)) return lw;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();
}

function headlineFromUrlPath(url: string): string {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    const last = segments.length ? segments[segments.length - 1] : '';
    let raw = last;
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* keep raw */
    }
    const phrase = raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (phrase.length < 10 || /^\d+$/.test(phrase)) return '';
    return smartTitleCaseFromSlug(phrase);
  } catch {
    return '';
  }
}

/** Meta description preview anchored on URL topic, not a fixed vertical (avoids wrong-industry boilerplate). */
function metaDescriptionPreview(primaryKeyword: string, pageUrl: string): string {
  const slugTopic = headlineFromUrlPath(pageUrl);
  const kw = normalizeKeywordGrammar(primaryKeyword).slice(0, 52).trim();
  if (slugTopic.length >= 14) {
    return `Explore ${slugTopic}: practical context, key takeaways, and where "${kw}" belongs when it truly matches reader intent.`.slice(
      0,
      155
    );
  }
  return `Practical summary for this page and how "${kw}" may relate—verify fit with your real product story before publishing.`.slice(0, 155);
}

function isGenericHeadingLabel(s: string): boolean {
  const t = normalizePhrase(s);
  if (t.length < 5) return true;
  if (/^(blog|home|news|page|untitled|services)$/.test(t)) return true;
  return false;
}

function topicLabelForSections(headline: string, maxWords = 6): string {
  const cleaned = headline.replace(/\?+$/, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ');
  return words || 'This topic';
}

function suggestedH1Dynamic(
  primaryKeyword: string,
  ctx: { url: string; pageTitle: string; suggestedTitle: string; currentH1: string; pType: PageType }
): string {
  const title = cleanTitleForH1(ctx.suggestedTitle || ctx.pageTitle);
  const h1 = decodeBasicHtmlEntities(ctx.currentH1).replace(/\s+/g, ' ').trim();
  const slugH = headlineFromUrlPath(ctx.url);
  const hay = normalizePhrase([title, h1, slugH].join(' '));
  const rel = countKeywordCoverage(hay, primaryKeyword);

  if (!isGenericHeadingLabel(title) && title.length >= 18) {
    return title.slice(0, 72).trim();
  }
  if (!isGenericHeadingLabel(h1) && h1.length >= 18) {
    return h1.slice(0, 72).trim();
  }
  if (slugH.length >= 22) {
    return slugH.slice(0, 72).trim();
  }
  if (rel >= 28) {
    let fromKw = generateNaturalHeading(primaryKeyword);
    fromKw = fromKw.replace(/\bBest What\b/gi, 'What');
    return fromKw.slice(0, 72).trim();
  }
  if (slugH.length >= 12) {
    return slugH.slice(0, 72).trim();
  }
  let fromKw = generateNaturalHeading(primaryKeyword);
  fromKw = fromKw.replace(/\bBest What\b/gi, 'What');
  return fromKw.slice(0, 72).trim();
}

function defaultKeywordForPage(url: string, pType: PageType, scanData: StoredScanReport): string {
  const brand = domainBrandToken(scanData);
  const slug = slugFromUrl(url).replace(/-/g, ' ');
  if (pType === 'homepage') return `${brand} homepage and services overview`.replace(/\s+/g, ' ').trim();
  if (pType === 'blog') return `how to approach ${slug} with ${brand}`.replace(/\s+/g, ' ').trim();
  if (pType === 'product') return `${slug} for ${brand} customers`.replace(/\s+/g, ' ').trim();
  return `${brand} ${slug} key information`.replace(/\s+/g, ' ').trim();
}

function searchIntentType(intent: string): string {
  if (intent === 'transactional') return 'DECISION';
  if (intent === 'commercial') return 'EVALUATION';
  if (intent === 'informational') return 'DISCOVERY';
  return 'NAVIGATION';
}

function countKeywordCoverage(source: string, keyword: string): number {
  const s = String(source || '').toLowerCase();
  const tokens = String(keyword || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  const covered = tokens.filter((t) => s.includes(t)).length;
  return Math.round((covered / tokens.length) * 100);
}

function estimateReadability(wordCount: number, h2Count: number, h3Count: number): number {
  const wcScore = wordCount >= 900 ? 40 : Math.max(15, Math.round((wordCount / 900) * 40));
  const headingScore = Math.min(35, h2Count * 8 + h3Count * 3);
  return Math.max(20, Math.min(100, wcScore + headingScore + 15));
}

function buildKeywordClustersFallback(keywords: NormalizedKeyword[]): KeywordClusterItem[] {
  const map = new Map<string, Set<string>>();
  const topPageMap = new Map<string, string>();
  for (const k of keywords) {
    const root = k.seoCluster || k.keyword.split(' ').slice(0, 3).join(' ');
    if (!map.has(root)) map.set(root, new Set<string>());
    map.get(root)!.add(k.keyword);
    if (!topPageMap.has(root)) topPageMap.set(root, k.suggestedPageUrl || '/');
  }
  return [...map.entries()].map(([cluster, kwSet]) => {
    const count = kwSet.size;
    return {
      cluster,
      keywords: [...kwSet],
      count,
      topPage: topPageMap.get(cluster) || '/',
      coverage: count > 5 ? 'HIGH' : count >= 3 ? 'MEDIUM' : 'LOW',
    };
  });
}

function impactTypeFromAction(actionType: string): 'SEO_ONLY' | 'CONTENT' | 'UX' | 'RISKY' {
  if (actionType === 'ADD_CONTENT' || actionType === 'CREATE_PAGE') return 'CONTENT';
  if (actionType === 'UPDATE_H1' || actionType === 'FIX_META') return 'SEO_ONLY';
  return 'UX';
}

function decisionConfidenceScore(priority: 'HIGH' | 'MEDIUM' | 'LOW', opportunityScore: number): number {
  const pBoost = priority === 'HIGH' ? 15 : priority === 'MEDIUM' ? 8 : 2;
  return Math.max(0, Math.min(100, Math.round(opportunityScore * 0.7 + pBoost)));
}

function isRiskyExecutionChange(selector: string, action: string, suggested: string): boolean {
  const s = String(selector || '').toLowerCase();
  const a = String(action || '').toUpperCase();
  if (a.includes('DELETE')) return true;
  if (a.includes('REPLACE') && suggested.length > 500) return true;
  if (s.includes('main') && a.includes('REPLACE') && suggested.length > 280) return true;
  return false;
}

function reportsDir(): string {
  return path.join(path.dirname(config.dbPath), 'reports');
}

function loadPreviousDomainScan(scanData: StoredScanReport): StoredScanReport | null {
  const dir = reportsDir();
  if (!fs.existsSync(dir)) return null;
  const currentId = Number(scanData.scanId || 0);
  const files = fs
    .readdirSync(dir)
    .map((f) => f.trim())
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => Number(f.replace('.json', '')))
    .filter((id) => Number.isFinite(id) && id > 0 && id < currentId)
    .sort((a, b) => b - a);

  for (const id of files) {
    try {
      const p = path.join(dir, `${id}.json`);
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as StoredScanReport;
      if (parsed.domain === scanData.domain) return parsed;
    } catch {
      // Ignore malformed historical file.
    }
  }
  return null;
}

function parseExpectedImpact(value: string): number {
  const nums = String(value || '').match(/\d+/g);
  if (!nums?.length) return 0;
  return Number(nums[0]) || 0;
}

function priorityDownshift(priority: 'HIGH' | 'MEDIUM' | 'LOW'): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (priority === 'HIGH') return 'MEDIUM';
  if (priority === 'MEDIUM') return 'LOW';
  return 'LOW';
}

export function buildIntelligenceReport(scanData: StoredScanReport): IntelligenceReport {
  const reports = Object.values(scanData.pageReports || {});
  const crawlByUrl = new Map<string, CrawlPageResult>((scanData.pages || []).map((p) => [p.url, p]));
  const { keywords, duplicateRemoved, invalidFiltered } = normalizeKeywords(scanData);
  const previousReport = loadPreviousDomainScan(scanData) as (StoredScanReport & {
    learningInsights?: Array<{ actionType: string; success: boolean; expectedImpact: number; actualImpact: number; accuracyScore: number; pageType?: string }>;
    weightingAdjustments?: { priorityWeight?: number; opportunityWeight?: number };
    historicalLearning?: { byActionType?: Array<{ actionType: string; successRate: number }> };
  }) | null;
  const previousPageReports = Object.values(previousReport?.pageReports || {});
  const previousPageReportByUrl = new Map(previousPageReports.map((p) => [p.url, p]));
  const previousAvgScore = previousPageReports.length
    ? previousPageReports.reduce((s, r) => s + Number(r.seoScore || 0), 0) / previousPageReports.length
    : 0;
  const currentAvgScore = reports.length
    ? reports.reduce((s, r) => s + Number(r.seoScore || 0), 0) / reports.length
    : 0;
  const scoreDelta = Math.round((currentAvgScore - previousAvgScore) * 10) / 10;
  const basePriorityWeight = previousReport?.weightingAdjustments?.priorityWeight ?? 1;
  const baseOpportunityWeight = previousReport?.weightingAdjustments?.opportunityWeight ?? 1;
  const priorHistorical = previousReport?.historicalLearning?.byActionType || [];
  const avgSuccessRate = priorHistorical.length
    ? priorHistorical.reduce((s: number, x: { successRate: number }) => s + Number(x.successRate || 0), 0) / priorHistorical.length
    : 60;
  const negativeLearningPenalty = avgSuccessRate < 55 ? -0.05 : 0;
  const positiveLearningBoost = avgSuccessRate > 70 ? 0.03 : 0;
  const priorityWeight = Math.max(
    0.8,
    Math.min(
      1.2,
      Number(
        (
          basePriorityWeight +
          (scoreDelta > 0 ? 0.02 : scoreDelta < 0 ? -0.02 : 0) +
          negativeLearningPenalty +
          positiveLearningBoost
        ).toFixed(2)
      )
    )
  );
  const opportunityWeight = Math.max(
    0.8,
    Math.min(
      1.2,
      Number(
        (
          baseOpportunityWeight +
          (scoreDelta > 0 ? 0.03 : scoreDelta < 0 ? -0.03 : 0) +
          negativeLearningPenalty +
          positiveLearningBoost
        ).toFixed(2)
      )
    )
  );
  const reportsForMapping = reports.map((r) => ({ url: r.url, suggestedTitle: r.suggestedTitle, improvedContent: r.improvedContent }));
  const routedKeywords = finalKeywordQualityCheck(keywords).map((k) => ({
    ...k,
    suggestedPageUrl: mapKeywordToPageAdvanced(k.keyword, reportsForMapping, crawlByUrl, scanData.domain),
    category: inferCategoryFromKeyword(k.keyword),
    searchIntent: inferIntentFromKeyword(k.keyword),
  }));
  const used = new Set<string>();

  const pages = reports.map((rep) => {
    const pType = pageType(rep.url);
    const crawl = crawlByUrl.get(rep.url);
    const picked =
      routedKeywords.find((k) => k.suggestedPageUrl === rep.url && !used.has(k.keyword)) || null;

    let primaryKeyword = picked?.keyword || defaultKeywordForPage(rep.url, pType, scanData);
    if (used.has(primaryKeyword)) {
      primaryKeyword = `${defaultKeywordForPage(rep.url, pType, scanData)} ${slugFromUrl(rep.url).replace(/-/g, ' ')}`.replace(/\s+/g, ' ').trim();
    }
    used.add(primaryKeyword);

    const secondaryKeywords = routedKeywords
      .filter((k) => k.suggestedPageUrl === rep.url && k.keyword !== primaryKeyword)
      .slice(0, 5)
      .map((k) => k.keyword);
    const intentFallback = generateIntentKeywords(primaryKeyword, pType).map((x) => normalizePhrase(x.keyword));
    for (const k of intentFallback) {
      if (secondaryKeywords.length >= 2) break;
      if (k !== primaryKeyword && !secondaryKeywords.includes(k)) secondaryKeywords.push(k);
    }

    const priorityScore = Math.max(1, Number(picked?.priorityScore || 50));
    const opportunityScore = Math.max(1, Number(picked?.opportunityScore || priorityScore));
    const rankProxy = Math.max(1, Math.min(100, 100 - priorityScore));
    const quickWin = rankProxy >= 20 && rankProxy <= 50 && Number(rep.seoScore || 0) > 50;
    const recommendedWordCount = recommendedWordCountNum(picked?.recommendedWordCount || rep.recommendedWordCount || '800-1200');

    const pageText = [
      rep.suggestedTitle,
      rep.suggestedMetaDescription,
      rep.improvedContent?.h1 ? sanitizeHeadingDisplay(rep.improvedContent.h1) : '',
      rep.improvedContent?.bodyCopy,
      crawl?.title,
      crawl?.metaDescription,
      ...(crawl?.headings || []).map((h) => sanitizeHeadingDisplay(h)),
    ].join(' ');
    const h1Text = sanitizeHeadingDisplay(rep.improvedContent?.h1 || crawl?.headings?.[0] || '');
    const suggestedH1 = suggestedH1Dynamic(primaryKeyword, {
      url: rep.url,
      pageTitle: crawl?.title || '',
      suggestedTitle: rep.suggestedTitle || '',
      currentH1: h1Text,
      pType,
    });
    const h2Topic = topicLabelForSections(suggestedH1, 4);
    const h2Count = crawl?.h2Count || Math.max(0, (crawl?.headings || []).filter((h) => /^h2[:\s-]/i.test(h)).length);
    const h3Count = Math.max(0, (crawl?.headings || []).filter((h) => /^h3[:\s-]/i.test(h)).length);
    const wordCount = crawl?.wordCount || (rep.improvedContent?.bodyCopy?.split(/\s+/).filter(Boolean).length || 0);
    const keywordCoverage = countKeywordCoverage(pageText, primaryKeyword);
    const readability = estimateReadability(wordCount, h2Count, h3Count);
    const topicAlignmentHay = normalizePhrase([slugFromUrl(rep.url).replace(/-/g, ' '), crawl?.title || '', h1Text].join(' '));
    const topicAlignmentScore = countKeywordCoverage(topicAlignmentHay, primaryKeyword);
    const topicReviewerWarning =
      topicAlignmentScore < 26
        ? 'Primary keyword may not match this page topic (URL/title/H1 vs target keyword). Treat generated title, meta, H1, and intro as draft; align with the real page purpose before publishing.'
        : topicAlignmentScore < 40
          ? 'Moderate overlap between target keyword and visible page topic—review snippets before publishing.'
          : null;
    let imageAnalysis = (crawl?.images || []).slice(0, 8).map((img, idx) => {
      const altText = String(img.alt || '').trim();
      const isAltMissing = !altText;
      const contextMatchScore = altText ? countKeywordCoverage(`${altText} ${pageText}`, primaryKeyword) : 10;
      const isRelevantToContent = contextMatchScore >= 30;
      const conversionImpact: 'HIGH' | 'MEDIUM' | 'LOW' =
        pType === 'product' || pType === 'homepage' ? (isRelevantToContent ? 'HIGH' : 'MEDIUM') : 'LOW';
      const suggestedImageType: 'dashboard' | 'ui' | 'illustration' | 'workflow' =
        pType === 'product' ? 'dashboard' : pType === 'homepage' ? 'ui' : pType === 'blog' ? 'workflow' : 'illustration';
      return {
        imageUrl: img.src,
        altText,
        isAltMissing,
        isRelevantToContent,
        contextMatchScore,
        conversionImpact,
        suggestedImageType,
        issue: isAltMissing ? 'missing alt text' : isRelevantToContent ? 'none' : 'generic stock image',
        suggestion: {
          altText: `${h2Topic} — ${pType} visual`.slice(0, 110),
          filename: `${slugFromUrl(rep.url)}-${idx + 1}-${h2Topic.split(' ').slice(0, 2).join('-')}`.replace(/[^a-z0-9.-]/gi, '-').toLowerCase() + '.webp',
          context: `Visual supporting ${h2Topic}`,
        },
        improvement:
          isAltMissing || !isRelevantToContent
            ? `Replace with ${suggestedImageType} image aligned to "${h2Topic}"`
            : 'Keep',
      };
    });
    if (!imageAnalysis.length) {
      imageAnalysis = generateImageSuggestions(rep.url, primaryKeyword, pType);
    }

    return {
      pageUrl: rep.url,
      seoScore: Number(rep.seoScore || 0),
      primaryKeyword,
      secondaryKeywords,
      searchIntent: picked?.searchIntent || 'commercial',
      priorityScore,
      opportunityScore,
      competitionLevel: (picked?.competitionLevel || 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH',
      recommendedWordCount,
      issues: (rep.issues || []).map((i) => ({
        type: String(i.type || '').toUpperCase(),
        severity: String(i.severity || '').toUpperCase(),
        description: String(i.description || ''),
        fix: String(i.fix || ''),
      })),
      recommendedFixes: (rep.issues || []).slice(0, 4).map((i) => ({
        type: String(i.type || '').toUpperCase(),
        priority: String(i.severity || 'medium').toUpperCase(),
        suggested: String(i.fix || 'Update title, H1, metadata, and content relevance.'),
      })),
      quickWin,
      pageType: pType,
      keywordInsight: {
        keyword: primaryKeyword,
        intent: picked?.searchIntent || 'commercial',
        searchIntentType: searchIntentType(picked?.searchIntent || 'commercial'),
        priorityScore,
        opportunityScore,
        competitionLevel: (picked?.competitionLevel || 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH',
        serpSignals: {
          competitionLevel: (picked?.competitionLevel || 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH',
          estimatedTopDomains: ['linkedin.com', 'g2.com', 'softwareadvice.com'],
          avgTitleLength: 58,
        },
        recommendedWordCount,
      },
      contentAnalysis: {
        wordCount,
        recommendedWordCount,
        keywordCoverage,
        readabilityScore: readability,
        headingStructure: {
          h1: (h1Text ? 'present' : 'missing') as 'present' | 'missing',
          optimized: h1Text.toLowerCase().includes(primaryKeyword.split(' ')[0] || ''),
          h2Count,
          h3Count,
        },
        missingTopics: keywordCoverage >= 70 ? [] : [`Use-case proof for ${primaryKeyword}`, `Feature comparison for ${primaryKeyword}`],
        contentGaps: wordCount >= recommendedWordCount ? [] : [`Increase depth by ${Math.max(0, recommendedWordCount - wordCount)} words`],
        improvementSuggestions: [
          `Add keyword "${primaryKeyword}" in first 120 words`,
          'Expand FAQ and use-case examples',
          'Strengthen internal links to related pages',
        ],
      },
      headingAnalysis: {
        currentH1: h1Text || 'Missing H1',
        isOptimized: h1Text.toLowerCase().includes(primaryKeyword.split(' ')[0] || ''),
        suggestedH1,
        h2Suggestions: [
          `${h2Topic}: audience and intent`,
          `${h2Topic}: solution snapshot`,
          `${h2Topic}: proof points and examples`,
        ],
        h3Suggestions: ['Scope boundaries', 'Integration touchpoints', 'Timeline and ownership'],
      },
      imageAnalysis,
      contentSuggestions: generateContentPlan(primaryKeyword, pType, suggestedH1),
      topicAlignmentScore,
      topicReviewerWarning,
    };
  });

  const primaryKeywords = routedKeywords.map((k) => ({
    keyword: k.keyword,
    intent: k.searchIntent,
    targetPage: mapKeywordToPageAdvanced(k.keyword, reportsForMapping, crawlByUrl, scanData.domain) || '/',
    priorityScore: Math.max(1, Math.min(100, Math.round(k.priorityScore * priorityWeight))),
    opportunityScore: Math.max(1, Math.min(100, Math.round(k.opportunityScore * opportunityWeight))),
  }));
  const longTailKeywords = primaryKeywords.filter((k) => routedKeywords.find((x) => x.keyword === k.keyword)?.category === 'long_tail');
  const blogKeywords = primaryKeywords.filter((k) => routedKeywords.find((x) => x.keyword === k.keyword)?.category === 'blog_tofu');
  const comparisonKeywords = primaryKeywords.filter((k) => routedKeywords.find((x) => x.keyword === k.keyword)?.category === 'bofu_comparison');
  const keywordMapping = primaryKeywords.map((k) => {
    const pType = pageType(k.targetPage || '/');
    const reason =
      pType === 'homepage'
        ? 'Broad intent keyword mapped to homepage'
        : pType === 'blog'
          ? 'Informational keyword mapped to blog content'
          : pType === 'product'
            ? 'Feature-specific keyword mapped to product page'
            : 'Best topical relevance page match';
    return { keyword: k.keyword, targetPage: k.targetPage || '/', reason };
  });

  const quickWins = pages
    .filter((p) => p.quickWin && isNaturalSearchQuery(p.primaryKeyword) && decisionConfidenceScore(level(p.priorityScore), p.opportunityScore) > 70)
    .slice(0, 5)
    .map((p) => ({
      page: p.pageUrl,
      action: `Optimize title/H1/content for "${p.primaryKeyword}"`,
      exactChange: `Update <title>, H1, intro paragraph, and first internal anchor with "${p.primaryKeyword}"`,
      impact: level(p.priorityScore),
      reason: 'High opportunity with manageable effort',
    }));
  while (quickWins.length < 3 && pages.length) {
    const p = pages[quickWins.length % pages.length];
    quickWins.push({
      page: p.pageUrl,
      action: 'Improve H1 clarity and add structured content',
      exactChange: 'Improve H1 clarity; add structured section blocks with clear subheadings',
      impact: 'MEDIUM',
      reason: 'Fast on-page relevance gain',
    });
  }

  const topOpportunities = [...primaryKeywords]
    .sort((a, b) => (b.opportunityScore - a.opportunityScore) || (b.priorityScore - a.priorityScore))
    .slice(0, 5)
    .map((x) => ({
      keyword: x.keyword,
      targetPage: x.targetPage,
      opportunityScore: x.opportunityScore,
      priorityScore: x.priorityScore,
      reason: routedKeywords.find((k) => k.keyword === x.keyword)?.reason || 'Strong keyword-page fit opportunity.',
    }));

  const totalIssues = reports.reduce((n, r) => n + (r.issues?.length || 0), 0);
  const currentScore = reports.length
    ? Math.round((reports.reduce((s, r) => s + Number(r.seoScore || 0), 0) / reports.length) * 10) / 10
    : 0;
  const estimatedScore = Math.min(100, Math.round((currentScore + 15) * 10) / 10);
  const improvement = Math.round((estimatedScore - currentScore) * 10) / 10;
  const completeness = pages.length ? 100 : 0;
  const validity = keywords.length ? Math.max(0, 100 - invalidFiltered * 5 - duplicateRemoved * 3) : 0;
  const consistency = quickWins.length >= 3 ? 100 : 70;
  const confidenceScore = Math.max(0, Math.min(100, Math.round(completeness * 0.4 + validity * 0.35 + consistency * 0.25)));

  const technicalScore = reports.length ? Math.round(reports.reduce((s, r) => s + Number(r.scoreBreakdown?.technical || r.seoScore || 0), 0) / reports.length) : 0;
  const contentScore = reports.length ? Math.round(reports.reduce((s, r) => s + Number(r.scoreBreakdown?.content || r.seoScore || 0), 0) / reports.length) : 0;
  const keywordScore = pages.length ? Math.round(pages.reduce((s, p) => s + p.contentAnalysis.keywordCoverage, 0) / pages.length) : 0;
  const linkScore = reports.length ? Math.round(reports.reduce((s, r) => s + Number(r.backlinkInsights?.backlinkQualityScore || r.scoreBreakdown?.backlinks || 0), 0) / reports.length) : 0;

  const uniq = new Set<string>();
  for (const p of pages) {
    if (uniq.has(p.primaryKeyword)) {
      p.primaryKeyword = `${p.primaryKeyword} ${slugFromUrl(p.pageUrl).replace(/-/g, ' ')}`.replace(/\s+/g, ' ').trim();
      p.keywordInsight.keyword = p.primaryKeyword;
    }
    uniq.add(p.primaryKeyword);
  }

  const technicalIssues = pages
    .flatMap((p) =>
      p.issues.map((i) => ({
        type: i.type,
        page: p.pageUrl,
        severity: (i.severity as 'HIGH' | 'MEDIUM' | 'LOW') || 'MEDIUM',
        impact: i.description || 'May reduce visibility and conversion',
        fixSuggestion: i.fix || 'Apply page-level SEO fix',
      }))
    )
    .filter((i) => ['MISSING_H1', 'DUPLICATE_TITLE', 'MISSING_TITLE', 'MISSING_META_DESCRIPTION', 'BROKEN_LINKS', 'SLOW_PAGE'].includes(i.type));

  const internalLinks = buildSemanticInternalLinks(pages)
    .map((l) => ({
      ...l,
      anchorText: generateAnchorText(l.anchorText) || l.anchorText,
    }))
    .filter((l) => Boolean(l.anchorText));

  const newPageSuggestions = (scanData.competitorKeywordGaps || []).slice(0, 5).map((g) => ({
    keyword: g.keyword,
    url: `/${g.keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`,
    intent: inferIntentFromKeyword(g.keyword),
    priority: level(g.opportunityScore),
    reason: g.reason,
    contentBrief: {
      headings: [generateNaturalHeading(g.keyword), `${g.keyword} use cases`, `${g.keyword} implementation guide`],
      wordCount: 1200,
    },
  }));

  const baseDecisions = [
    ...pages.slice(0, 6).map((p) => ({
      actionType: p.headingAnalysis.isOptimized ? 'ADD_CONTENT' : 'UPDATE_H1',
      page: p.pageUrl,
      primaryKeyword: p.primaryKeyword,
      priority: level(p.opportunityScore),
      reason: p.headingAnalysis.isOptimized
        ? 'Content depth below opportunity potential'
        : 'Primary keyword missing or weak in H1',
      expectedImpact: `+${Math.max(3, Math.round(p.opportunityScore / 20))} score impact`,
      impactType: impactTypeFromAction(p.headingAnalysis.isOptimized ? 'ADD_CONTENT' : 'UPDATE_H1'),
      actionConfidence: {
        score: decisionConfidenceScore(level(p.opportunityScore), p.opportunityScore),
        reason: 'Derived from opportunity score and action complexity.',
      },
    })),
    ...newPageSuggestions.slice(0, 2).map((n) => ({
      actionType: 'CREATE_PAGE',
      page: n.url,
      primaryKeyword: n.keyword,
      priority: n.priority,
      reason: n.reason,
      expectedImpact: '+8 to +15 long-tail visibility',
      impactType: impactTypeFromAction('CREATE_PAGE'),
      actionConfidence: {
        score: decisionConfidenceScore(n.priority, 72),
        reason: 'New page creation confidence based on gap relevance and deterministic priority.',
      },
    })),
  ];

  const executionMode: 'preview' | 'execute' = 'preview';
  const maxActions = 10;
  const executionCandidates = [...pages]
    .map((p) => ({
      ...p,
      _score: p.priorityScore + p.opportunityScore,
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, maxActions);

  const rawExecutionPlan = executionCandidates.map((p) => {
    const metaAfter = metaDescriptionPreview(p.primaryKeyword, p.pageUrl);
    const changes = [
      {
        selector: 'title',
        action: 'REPLACE_TEXT',
        current: 'Current title',
        suggested: `${p.primaryKeyword} | ${slugFromUrl(p.pageUrl).replace(/-/g, ' ')}`.slice(0, 65),
        diffPreview: {
          before: 'Current title',
          after: `${p.primaryKeyword} | ${slugFromUrl(p.pageUrl).replace(/-/g, ' ')}`.slice(0, 65),
          diffType: 'replace' as const,
        },
      },
      {
        selector: 'h1',
        action: 'REPLACE_TEXT',
        current: p.headingAnalysis.currentH1,
        suggested: p.headingAnalysis.suggestedH1,
        diffPreview: {
          before: p.headingAnalysis.currentH1,
          after: p.headingAnalysis.suggestedH1,
          diffType: 'replace' as const,
        },
      },
      {
        selector: 'meta[name="description"]',
        action: 'REPLACE_TEXT',
        current: 'Current description',
        suggested: metaAfter,
        diffPreview: {
          before: 'Current description',
          after: metaAfter,
          diffType: 'replace' as const,
        },
      },
      {
        selector: 'main p:first-of-type',
        action: 'REPLACE_TEXT',
        current: 'Current intro paragraph',
        suggested: p.contentSuggestions.introParagraph,
        diffPreview: {
          before: 'Current intro paragraph',
          after: p.contentSuggestions.introParagraph,
          diffType: 'replace' as const,
        },
      },
    ];
    const hasRiskyChange = changes.some((c) => isRiskyExecutionChange(c.selector, c.action, c.suggested));
    const topicPenalty = p.topicAlignmentScore < 26 ? 20 : p.topicAlignmentScore < 36 ? 10 : 0;
    const topicNote =
      p.topicAlignmentScore < 26
        ? ' Topic fit vs live page is weak—human review required.'
        : p.topicAlignmentScore < 40
          ? ' Moderate topic fit—verify copy before publishing.'
          : '';
    const topicBlock = p.topicAlignmentScore < 18;
    let actionConfidenceScore = Math.max(
      0,
      Math.min(100, Math.round((p.priorityScore * 0.45) + (p.opportunityScore * 0.45) + (hasRiskyChange ? -30 : 10) - topicPenalty))
    );
    const executionAllowed = !topicBlock && actionConfidenceScore > 70 && !hasRiskyChange;
    const executionBlockReason = topicBlock
      ? 'Primary keyword looks unrelated to this page topic (auto-check vs URL/title/H1). Fix keyword mapping first.'
      : executionAllowed
        ? undefined
        : actionConfidenceScore <= 70
          ? 'Confidence score <= 70'
          : 'Risky operation detected';
    return {
      page: p.pageUrl,
      filePath: `content/${slugFromUrl(p.pageUrl)}.html`,
      impactType: hasRiskyChange ? ('RISKY' as const) : ('SEO_ONLY' as const),
      topicAlignmentScore: p.topicAlignmentScore,
      topicReviewerWarning: p.topicReviewerWarning,
      actionConfidence: {
        score: actionConfidenceScore,
        reason: (() => {
          if (hasRiskyChange) return 'Blocked due to risky broad replacement pattern.';
          if (topicBlock) return 'Blocked: primary keyword appears unrelated to visible page topic (URL/title/H1).';
          let r = 'Safe targeted selectors with opportunity-confidence score.';
          if (topicNote.trim()) r += topicNote;
          return r;
        })(),
      },
      executionAllowed,
      executionBlockReason,
      changes,
    };
  });

  const executionPlan = rawExecutionPlan.filter((x) => x.executionAllowed);

  if (!executionPlan.length && pages.length) {
    executionPlan.push({
      page: pages[0].pageUrl,
      filePath: `content/${slugFromUrl(pages[0].pageUrl)}.html`,
      impactType: 'SEO_ONLY',
      topicAlignmentScore: pages[0].topicAlignmentScore,
      topicReviewerWarning: pages[0].topicReviewerWarning,
      actionConfidence: { score: 78, reason: 'Fallback H1-only change is constrained and safe.' },
      executionAllowed: true,
      executionBlockReason: undefined,
      changes: [{
        selector: 'h1',
        action: 'REPLACE_TEXT',
        current: pages[0].headingAnalysis.currentH1,
        suggested: pages[0].headingAnalysis.suggestedH1,
        diffPreview: {
          before: pages[0].headingAnalysis.currentH1,
          after: pages[0].headingAnalysis.suggestedH1,
          diffType: 'replace',
        },
      }],
    });
  }

  // Deterministic grouping with no duplication across groups.
  const assigned = new Set<string>();
  const prGroups = {
    metaFixes: [] as Array<(typeof executionPlan)[number] & { groupId: string }>,
    contentUpdates: [] as Array<(typeof executionPlan)[number] & { groupId: string }>,
    internalLinks: [] as Array<(typeof executionPlan)[number] & { groupId: string }>,
    technicalFixes: [] as Array<(typeof executionPlan)[number] & { groupId: string }>,
  };
  const classifyGroup = (plan: (typeof executionPlan)[number]): keyof typeof prGroups => {
    const selectors = plan.changes.map((c) => c.selector.toLowerCase());
    if (selectors.some((s) => s.includes('meta') || s === 'title')) return 'metaFixes';
    if (selectors.some((s) => s.includes('a[') || s.includes('link'))) return 'internalLinks';
    if (selectors.some((s) => s.includes('main') || s.includes('h1'))) return 'contentUpdates';
    return 'technicalFixes';
  };
  executionPlan.forEach((plan, idx) => {
    const key = `${plan.page}|${plan.filePath}`;
    if (assigned.has(key)) return;
    assigned.add(key);
    const group = classifyGroup(plan);
    const groupId = `pr-${idx + 1}-${group}`;
    (prGroups[group] as Array<any>).push({ ...plan, groupId });
  });

  const executionTracking = executionPlan.map((plan, idx) => ({
    prId: `pr-${idx + 1}`,
    status: 'created' as const,
    expectedImpact: `Expected uplift from ${plan.changes.length} safe changes on ${plan.page}`,
    actualImpact: '',
  }));

  const learningInsightsWithContext = baseDecisions.map((d) => {
    const expectedImpact = parseExpectedImpact(d.expectedImpact);
    const page = pages.find((p) => p.pageUrl === d.page);
    const previousPage = previousPageReportByUrl.get(d.page);
    const prevSeo = Number(previousPage?.seoScore || 0);
    const prevContent = Number(previousPage?.scoreBreakdown?.content || previousPage?.seoScore || 0);
    const prevKeywordCoverage = previousPage
      ? countKeywordCoverage(
          [
            previousPage.suggestedTitle,
            previousPage.suggestedMetaDescription,
            previousPage.improvedContent?.h1,
            previousPage.improvedContent?.bodyCopy,
          ].join(' '),
          previousPage.keywordInsights?.targetKeyword || page?.primaryKeyword || ''
        )
      : 0;
    const prevIssueCount = previousPage?.issues?.length || 0;
    const currentIssueCount = page?.issues?.length || 0;
    const seoScoreDelta = page ? Math.round((page.seoScore - prevSeo) * 10) / 10 : scoreDelta;
    const contentScoreDelta = page
      ? Math.round((page.contentAnalysis.readabilityScore - prevContent) * 10) / 10
      : Math.round((contentScore - prevContent) * 10) / 10;
    const keywordCoverageDelta = page ? page.contentAnalysis.keywordCoverage - prevKeywordCoverage : 0;
    const technicalIssuesResolved = Math.max(0, prevIssueCount - currentIssueCount);
    const actionPlanMatch = executionPlan.find((p) => p.page === d.page);
    const actualImpact = actionPlanMatch
      ? Math.max(
          0,
          Math.round(
            (Math.max(0, seoScoreDelta) * 0.35) +
              (Math.max(0, contentScoreDelta) * 0.25) +
              (Math.max(0, keywordCoverageDelta) * 0.25) +
              (Math.max(0, technicalIssuesResolved) * 2 * 0.15)
          )
        )
      : 0;
    const positiveSignals =
      (seoScoreDelta > 0 ? 1 : 0) +
      (contentScoreDelta > 0 ? 1 : 0) +
      (keywordCoverageDelta > 0 ? 1 : 0) +
      (technicalIssuesResolved > 0 ? 1 : 0);
    const success = positiveSignals >= 2 || actualImpact > 0;
    const accuracyScore = expectedImpact > 0
      ? Math.max(0, Math.min(100, Math.round((Math.min(expectedImpact, actualImpact) / expectedImpact) * 100)))
      : 0;
    return {
      actionType: d.actionType,
      pageType: page ? page.pageType : pageType(d.page),
      contextKey: `${d.actionType}|${page ? page.pageType : pageType(d.page)}`,
      success,
      expectedImpact,
      actualImpact,
      accuracyScore,
    };
  });
  const learningInsights = learningInsightsWithContext.map((x) => ({
    actionType: x.actionType,
    success: x.success,
    expectedImpact: x.expectedImpact,
    actualImpact: x.actualImpact,
    accuracyScore: x.accuracyScore,
  }));

  const mergedLearningWithContext = [
    ...((previousReport?.learningInsights || []).map((x: any) => ({
      actionType: x.actionType,
      success: Boolean(x.success),
      expectedImpact: Number(x.expectedImpact || 0),
      actualImpact: Number(x.actualImpact || 0),
      accuracyScore: Number(x.accuracyScore || 0),
      pageType: String(x.pageType || 'other'),
      contextKey: `${x.actionType}|${String(x.pageType || 'other')}`,
    })) as Array<{
      actionType: string;
      success: boolean;
      expectedImpact: number;
      actualImpact: number;
      accuracyScore: number;
      pageType: string;
      contextKey: string;
    }>),
    ...learningInsightsWithContext,
  ];
  const learningMap = new Map<
    string,
    { totalRuns: number; successRuns: number; impactWeightedSum: number; accuracyWeightedSum: number; weightSum: number }
  >();
  const contextualMap = new Map<string, { successWeighted: number; weightSum: number }>();
  const totalLearningItems = mergedLearningWithContext.length || 1;
  mergedLearningWithContext.forEach((li, idx) => {
    const recencyWeight = (idx + 1) / totalLearningItems;
    const key = li.actionType;
    if (!learningMap.has(key)) {
      learningMap.set(key, { totalRuns: 0, successRuns: 0, impactWeightedSum: 0, accuracyWeightedSum: 0, weightSum: 0 });
    }
    const row = learningMap.get(key)!;
    row.totalRuns += 1;
    row.successRuns += li.success ? 1 : 0;
    row.impactWeightedSum += Number(li.actualImpact || 0) * recencyWeight;
    row.accuracyWeightedSum += Number(li.accuracyScore || 0) * recencyWeight;
    row.weightSum += recencyWeight;

    if (!contextualMap.has(li.contextKey)) {
      contextualMap.set(li.contextKey, { successWeighted: 0, weightSum: 0 });
    }
    const c = contextualMap.get(li.contextKey)!;
    c.successWeighted += (li.success ? 100 : 0) * recencyWeight;
    c.weightSum += recencyWeight;
  });
  const historicalLearning = {
    byActionType: [...learningMap.entries()]
      .map(([actionType, m]) => ({
        actionType,
        totalRuns: m.totalRuns,
        successRate: m.totalRuns ? Math.round((m.successRuns / m.totalRuns) * 100) : 0,
        averageEffectiveness: m.weightSum ? Math.round((m.impactWeightedSum / m.weightSum) * 10) / 10 : 0,
        averageAccuracy: m.weightSum ? Math.round((m.accuracyWeightedSum / m.weightSum) * 10) / 10 : 0,
      }))
      .sort((a, b) => a.actionType.localeCompare(b.actionType)),
  };

  const actionTypeSuccess = new Map(historicalLearning.byActionType.map((x) => [x.actionType, x.successRate]));
  const decisions = baseDecisions
    .map((d) => {
      const pType = pageType(d.page);
      const contextKey = `${d.actionType}|${pType}`;
      const contextSuccess = contextualMap.get(contextKey);
      const contextRate = contextSuccess && contextSuccess.weightSum > 0
        ? Math.round(contextSuccess.successWeighted / contextSuccess.weightSum)
        : 60;
      const actionRate = actionTypeSuccess.get(d.actionType) ?? 60;
      const performanceScore = Math.round(actionRate * 0.6 + contextRate * 0.4);
      const tunedConfidence = Math.max(
        0,
        Math.min(100, d.actionConfidence.score + (performanceScore > 75 ? 8 : 0) - (performanceScore < 55 ? 12 : 0))
      );
      const tunedPriority = performanceScore < 55 ? priorityDownshift(d.priority) : d.priority;
      return {
        ...d,
        priority: tunedPriority,
        actionConfidence: {
          score: tunedConfidence,
          reason: `${d.actionConfidence.reason} Learning-adjusted by action/context performance (${performanceScore}%).`,
        },
        _performanceScore: performanceScore,
      };
    })
    .filter((d) => d._performanceScore >= 35)
    .sort((a, b) => (b._performanceScore - a._performanceScore) || (b.actionConfidence.score - a.actionConfidence.score) || a.page.localeCompare(b.page))
    .map(({ _performanceScore, ...d }) => d);

  const decisionGroups = {
    highImpact: decisions.filter((d) => d.priority === 'HIGH'),
    quickWins: decisions.filter((d) => (d.actionType === 'UPDATE_H1' || d.actionType === 'FIX_META') && d.actionConfidence.score > 70),
    contentImprovements: decisions.filter((d) => d.actionType === 'ADD_CONTENT' || d.actionType === 'CREATE_PAGE'),
    technicalFixes: decisions.filter((d) => d.actionType === 'UPDATE_H1' || d.actionType === 'FIX_META'),
  };

  const keywordClusters =
    scanData.keywordClusters && scanData.keywordClusters.length
      ? scanData.keywordClusters
      : buildKeywordClustersFallback(keywords);

  return {
    executionMode,
    summary: {
      currentScore,
      estimatedScore,
      improvement,
      confidenceScore,
      pagesAnalyzed: pages.length,
      totalIssues,
      breakdown: {
        technicalScore,
        contentScore,
        keywordScore,
        linkScore,
      },
      impactPrediction: {
        trafficIncreasePercent: Math.max(5, Math.min(60, Math.round(improvement * 2))),
        rankingImprovementEstimate: improvement >= 12 ? 'Significant ranking lift expected in 8-12 weeks' : 'Moderate ranking lift expected in 8-12 weeks',
      },
    },
    pages,
    keywordStrategy: {
      primaryKeywords,
      longTailKeywords,
      blogKeywords,
      comparisonKeywords,
    },
    keywordClusters,
    keywordMapping,
    competitorKeywordGaps: scanData.competitorKeywordGaps || [],
    quickWins,
    topOpportunities,
    technicalIssues,
    internalLinks,
    newPageSuggestions,
    decisions,
    decisionGroups,
    executionPlan,
    prGroups,
    executionTracking,
    learningInsights,
    historicalLearning,
    weightingAdjustments: {
      priorityWeight,
      opportunityWeight,
      basedOnLearning: Boolean(previousReport),
    },
    scoreSimulation: {
      before: currentScore,
      after: estimatedScore,
      improvements: [
        'Fix H1 alignment -> +5',
        'Expand content depth -> +8',
        'Improve internal linking -> +4',
      ],
      scoreBreakdown: [
        { action: 'Fix H1', impact: 5 },
        { action: 'Add content', impact: 8 },
        { action: 'Improve internal linking', impact: 4 },
      ],
    },
    explanation: {
      whyThisMatters: 'This prioritization turns SEO findings into deterministic implementation tasks that engineering and content teams can execute without ambiguity.',
      expectedOutcome: 'Higher topical relevance, better conversion alignment, and measurable score/ranking improvement from focused page-level changes.',
    },
    dataQualityCheck: {
      pagesAnalyzed: pages.length,
      uniqueKeywords: uniq.size,
      duplicateKeywordsRemoved: duplicateRemoved,
      invalidKeywordsFiltered: invalidFiltered,
      duplicatesRemoved: duplicateRemoved,
      invalidFiltered: invalidFiltered,
    },
  };
}

