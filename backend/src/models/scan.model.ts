export interface CrawlPageResult {
  url: string;
  title: string;
  metaDescription: string;
  canonical: string;
  h1Count: number;
  h2Count: number;
  wordCount: number;
  headings: string[];
  links: string[];
  imagesWithoutAlt: number;
  brokenLinks: string[];
  /** Footer / social-style links with #, empty, javascript:, or missing href (broken “click”). */
  invalidNavLinks: { href: string; reason: string; context: string }[];
  images?: {
    src: string;
    alt: string;
    suggestedAlt?: string;
  }[];
  loadTimeMs: number;
  contentSnippet?: string;
}

export type IssueType =
  | 'missing_title'
  | 'missing_meta_description'
  | 'multiple_h1'
  | 'broken_links'
  | 'invalid_or_nonfunctional_link'
  | 'images_without_alt'
  | 'slow_page';

export interface SeoIssue {
  type: IssueType | string;
  pageUrl: string;
  message: string;
  details?: string;
}

/** AI audit issue row (from model JSON). */
export interface AiIssueItem {
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  fix: string;
}

/** Full per-page SEO report (one OpenAI response per page). */
export interface SeoPageReport {
  url: string;
  seoScore: number;
  scoreBreakdown?: {
    content: number;
    technical: number;
    backlinks: number;
    onPage: number;
    ux: number;
    weightedTotal: number;
  };
  keywordInsights?: {
    targetKeyword: string;
    keywordPlacementScore: number;
    rankingProbability: number;
    opportunityScore?: number;
    trendBoost?: number;
    serpSignals?: {
      competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      estimatedTopDomains: string[];
      avgTitleLength: number;
    };
    recommendedWordCount?: string;
  };
  recommendedWordCount?: string;
  backlinkInsights?: {
    internalReferringPages: number;
    uniqueExternalDomainsLinked: number;
    externalLinksCount: number;
    internalAuthorityScore: number;
    backlinkQualityScore: number;
  };
  performanceMetrics?: {
    source: 'pagespeed' | 'crawl_estimate';
    lcpMs?: number;
    fcpMs?: number;
    cls?: number;
    inpMs?: number;
    ttfbMs?: number;
    lighthousePerformanceScore?: number;
    lighthouseSeoScore?: number;
    lighthouseAccessibilityScore?: number;
    lighthouseBestPracticesScore?: number;
  };
  issues: AiIssueItem[];
  suggestedTitle: string;
  suggestedMetaDescription: string;
  contentImprovements: string[];
  internalLinkSuggestions: string[];
  pasteReadyFixes?: {
    issueType: string;
    issueSummary: string;
    improvedContent: string;
  }[];
  improvedContent?: {
    h1?: string;
    title?: string;
    metaDescription?: string;
    bodyCopy?: string;
  };
}

export interface TrendKeywordInsight {
  keyword: string;
  category?: 'domain_trend' | 'long_tail' | 'blog_tofu' | 'bofu_comparison';
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  reason: string;
  suggestedPageUrl?: string;
  updateAreas?: Array<'title' | 'h1' | 'meta_description' | 'body_content' | 'internal_links'>;
  priorityScore: number;
  serpSignals?: {
    competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    estimatedTopDomains: string[];
    avgTitleLength: number;
  };
  recommendedWordCount?: string;
  seoCluster?: string;
  blogTopic?: string;
  sourceSignals?: string[];
  opportunityScore?: number;
}

export interface ProductFeatureInsight {
  feature: string;
  sourceUrl?: string;
  sourceType: 'settings' | 'use_case_page' | 'feature_page' | 'service_page' | 'content_inference';
}

export interface SeoActionPlanItem {
  page: string;
  action: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  quickWin?: boolean;
}

export interface CompetitorGapItem {
  keyword: string;
  reason: string;
  opportunityScore: number;
}

export interface KeywordClusterItem {
  cluster: string;
  keywords: string[];
  count: number;
  topPage: string;
  coverage: 'LOW' | 'MEDIUM' | 'HIGH';
}

/** @deprecated use SeoPageReport */
export interface AiPageAnalysis {
  seoScore: number;
  suggestedMetaTags: { name?: string; property?: string; content: string }[];
  contentImprovements: string[];
  summary: string;
}

export interface ScanRecord {
  id: number;
  domainId: number;
  startedAt: string;
  completedAt: string | null;
  pagesCount: number;
  seoScoreAvg: number | null;
  status: string;
  emailSent: number;
  emailSentAt: string | null;
  emailError: string | null;
  githubIssuesCreated: number;
  schedulerRun: number;
}

export interface DomainRecord {
  id: number;
  domain: string;
  createdAt: string;
}

export interface IssueRecord {
  id: number;
  scanId: number;
  pageUrl: string;
  issueType: string;
  message: string;
  aiSuggestion: string | null;
  status: string;
  githubIssueUrl: string | null;
  seoScore?: number | null;
  codeSnippet?: string | null;
  codeDiff?: string | null;
  githubPrUrl?: string | null;
  githubPrBranch?: string | null;
}
