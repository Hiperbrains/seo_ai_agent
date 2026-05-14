import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { getPublicAppUrl } from '../utils/brandAssets';
import type {
  SeoPageReport,
} from '../models/scan.model';
import type { IntelligenceReport } from './intelligenceReport.service';

export interface SerpRankRow {
  pageUrl: string;
  keyword: string;
  found: boolean;
  position: number | null;
  matchedUrl: string | null;
  location: string;
  device: 'desktop' | 'mobile';
}

export interface ScanPdfMeta {
  id: number;
  domain: string;
  started_at: string;
  completed_at: string | null;
  pages_count: number;
  seo_score_avg: number | null;
  status: string;
  github_issues_created: number;
}

/** @deprecated legacy row-based PDF */
export interface ScanPdfIssueRow {
  page_url: string;
  issue_type: string;
  message: string;
  ai_suggestion: string | null;
  status: string;
  github_issue_url: string | null;
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'report';
}

export function suggestedFilename(domain: string, scanId: number): string {
  return `seo-report-${safeFilenamePart(domain)}-${scanId}.pdf`;
}

function issueDisplayName(type: string): string {
  const map: Record<string, string> = {
    missing_h1: 'Missing H1',
    duplicate_title: 'Duplicate Title',
    missing_title: 'Missing Title',
    low_word_count: 'Low Word Count',
    missing_meta_description: 'Missing Meta Description',
    missing_canonical: 'Missing Canonical',
  };
  return map[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function issueImpact(type: string): string {
  const map: Record<string, string> = {
    missing_h1: 'Search engines cannot clearly identify the primary topic.',
    duplicate_title: 'Reduces ranking uniqueness and can suppress CTR.',
    missing_title: 'Weak SERP relevance signal and poor click-through.',
    low_word_count: 'Thin content lowers topical authority and long-tail reach.',
    missing_meta_description: 'Lower SERP snippet quality and weaker CTR.',
    missing_canonical: 'Can create duplicate URL ambiguity over time.',
  };
  return map[type] || 'May reduce search visibility and content clarity.';
}

function severityRank(sev: string): number {
  if (sev === 'high') return 0;
  if (sev === 'medium') return 1;
  return 2;
}

function severityColor(sev: string): string {
  if (sev === 'high') return '#dc2626';
  if (sev === 'medium') return '#ea580c';
  return '#16a34a';
}

function severityBadgeLabel(sev: string): string {
  if (sev === 'high') return 'HIGH';
  if (sev === 'medium') return 'MEDIUM';
  return 'LOW';
}

function severityWithIndicator(sev: string): string {
  if (sev === 'high') return '[HIGH]';
  if (sev === 'medium') return '[MEDIUM]';
  return '[LOW]';
}

function softWrapForPdf(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .trim()
    // Only split extremely long uninterrupted tokens; keep normal words/URLs intact.
    .replace(/([A-Za-z0-9]{45})(?=[A-Za-z0-9])/g, '$1 ');
}

/** Decode common HTML entities and normalize whitespace for PDF heading cells (avoids &#039; etc.). */
function sanitizeHeadingForPdf(text: string): string {
  return softWrapForPdf(
    String(text || '')
      .replace(/&#8217;|&#8216;|&#x2019;/gi, "'")
      .replace(/&#8220;|&#8221;|&#x201c;|&#x201d;/gi, '"')
      .replace(/&#038;|&amp;/gi, '&')
      .replace(/&#039;|&#x27;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function displayUrl(url: string): string {
  if (url.length <= 110) return url;
  return `${url.slice(0, 72)} ... ${url.slice(-30)}`;
}

function healthStatus(avgScore: number): 'Excellent' | 'Good' | 'Needs Improvement' | 'Critical' {
  if (avgScore >= 85) return 'Excellent';
  if (avgScore >= 70) return 'Good';
  if (avgScore >= 50) return 'Needs Improvement';
  return 'Critical';
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

type PdfDoc = InstanceType<typeof PDFDocument>;

function drawBrandedPdfHeader(doc: PdfDoc, title: string, subtitle: string): void {
  const marginTop = (doc as unknown as { page: { margins?: { top: number } } }).page.margins?.top ?? 48;
  const m = (doc as unknown as { page: { margins: { left: number; right: number } } }).page.margins;
  const ml = m?.left ?? 36;
  const mr = m?.right ?? 36;
  const textWidth = doc.page.width - ml - mr;
  const brand = 'AI SEO AGENT';

  doc.x = ml;
  doc.y = marginTop;
  const yBrand = doc.y;

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f172a');
  doc.text(brand, ml, doc.y, { width: textWidth, align: 'center', lineGap: 0 });

  const appUrl = getPublicAppUrl();
  if (appUrl) {
    const bw = doc.widthOfString(brand);
    const bx = ml + (textWidth - bw) / 2;
    doc.link(bx, yBrand, bw, 20, appUrl);
  }

  doc.x = ml;
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(20).fillColor('#0f172a');
  doc.text(title, ml, doc.y, { width: textWidth, align: 'center', lineGap: 2 });
  doc.x = ml;
  doc.moveDown(0.35);
  doc.fontSize(11).fillColor('#334155');
  doc.text(subtitle, ml, doc.y, { width: textWidth, align: 'center', lineGap: 0 });
  doc.x = ml;
  doc.moveDown(0.75);
}

function keywordQuickAction(rep: SeoPageReport): string {
  const issueTypes = new Set(rep.issues.map((i) => i.type));
  if (issueTypes.has('missing_title')) return 'Add unique title with primary keyword near start.';
  if (issueTypes.has('missing_meta_description')) return 'Write CTR-focused meta description (120-160 chars).';
  if (issueTypes.has('duplicate_title')) return 'Replace duplicate title with page-specific intent.';
  if (issueTypes.has('low_word_count')) return 'Expand body with intent-matched topical depth.';
  if (issueTypes.has('slow_page')) return 'Improve speed to protect rank and engagement.';
  return 'Strengthen keyword coverage across title, H1, and intro.';
}

/** Professional per-page audit from normalized intelligence report only. */
export function renderPdf(intelligenceReport: IntelligenceReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    console.assert(intelligenceReport.pages.length > 0, 'intelligenceReport.pages must not be empty');
    console.assert(intelligenceReport.quickWins.length >= 3, 'intelligenceReport.quickWins must be >= 3');
    console.assert(intelligenceReport.topOpportunities.length > 0, 'intelligenceReport.topOpportunities must not be empty');

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, info: { Title: 'SEO Report' } });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    doc.pipe(stream);

    const contentWidth = doc.page.width - 72;
    const pages = intelligenceReport.pages;

    const leftX = 36;

    const sectionTitle = (title: string): void => {
      if (doc.y > doc.page.height - 130) doc.addPage();
      doc.moveDown(0.25);
      doc.fontSize(14).fillColor('#0f172a').text(title, leftX, doc.y, { width: contentWidth, align: 'left' });
      doc.moveDown(0.35);
    };

    const line = (text: string, color = '#334155', size = 10): void => {
      doc.fontSize(size).fillColor(color).text(text, leftX, doc.y, { width: contentWidth, align: 'left' });
    };

    const ensureSpace = (required = 80): void => {
      if (doc.y + required > doc.page.height - 48) doc.addPage();
    };

    type TableColumn = { key: string; title: string; width: number; align?: 'left' | 'center' | 'right' };
    const drawTable = (
      columns: TableColumn[],
      rows: Array<Record<string, string | number>>,
      opts?: { fontSize?: number; rowPadding?: number }
    ): void => {
      const x = leftX;
      const baseFontSize = opts?.fontSize ?? 8;
      const rowPadding = opts?.rowPadding ?? 3;
      const rawTotalW = columns.reduce((s, c) => s + c.width, 0);
      const scale = rawTotalW > contentWidth ? contentWidth / rawTotalW : 1;
      const fittedColumns = columns.map((c) => ({
        ...c,
        width: Math.max(56, Math.floor(c.width * scale)),
      }));
      const totalW = fittedColumns.reduce((s, c) => s + c.width, 0);
      const fontSize = scale < 1 ? Math.max(6, baseFontSize - 1) : baseFontSize;
      const headerFontSize = scale < 1 ? 7 : 8;

      const drawHeader = (): void => {
        ensureSpace(40);
        const y = doc.y;
        const maxHeaderTextH = Math.max(
          ...fittedColumns.map((c) => doc.heightOfString(c.title, { width: c.width - 6, align: c.align || 'left' }))
        );
        const headerH = Math.max(22, maxHeaderTextH + 8);
        doc.rect(x, y, totalW, headerH).fillColor('#dbeafe').fill();
        let cx = x;
        for (const c of fittedColumns) {
          doc
            .fontSize(headerFontSize)
            .fillColor('#0f172a')
            .text(c.title, cx + 3, y + 4, { width: c.width - 6, align: c.align || 'left' });
          cx += c.width;
        }
        cx = x;
        for (let i = 0; i < fittedColumns.length - 1; i++) {
          cx += fittedColumns[i].width;
          doc.moveTo(cx, y).lineTo(cx, y + headerH).strokeColor('#cbd5e1').stroke();
        }
        doc.y = y + headerH;
      };

      drawHeader();

      for (const row of rows) {
        const y = doc.y;
        const heights = fittedColumns.map((c) =>
          doc.heightOfString(String(row[c.key] ?? ''), { width: c.width - 6, align: c.align || 'left' })
        );
        const rowH = Math.max(16, Math.max(...heights) + rowPadding * 2);
        if (y + rowH > doc.page.height - 44) {
          doc.addPage();
          drawHeader();
        }
        const ry = doc.y;
        doc.rect(x, ry, totalW, rowH).strokeColor('#e2e8f0').stroke();
        let cx = x;
        for (const c of fittedColumns) {
          const txt = String(row[c.key] ?? '');
          doc.fontSize(fontSize).fillColor('#334155').text(txt, cx + 3, ry + rowPadding, {
            width: c.width - 6,
            align: c.align || 'left',
          });
          cx += c.width;
        }
        cx = x;
        for (let i = 0; i < fittedColumns.length - 1; i++) {
          cx += fittedColumns[i].width;
          doc.moveTo(cx, ry).lineTo(cx, ry + rowH).strokeColor('#e2e8f0').stroke();
        }
        doc.y = ry + rowH;
      }
      doc.moveDown(0.5);
    };

    drawBrandedPdfHeader(
      doc,
      'SEO audit report',
      `Pages analyzed: ${intelligenceReport.summary.pagesAnalyzed}`
    );

    sectionTitle('1. Enhanced Executive Summary');
    const overallVerdict =
      intelligenceReport.summary.confidenceScore >= 80
        ? 'Strong execution readiness with clear SEO gains.'
        : intelligenceReport.summary.confidenceScore >= 65
          ? 'Good readiness; focused execution required for consistent gains.'
          : 'Needs tighter execution discipline before broad rollout.';
    drawTable(
      [
        { key: 'metric', title: 'Overall Verdict', width: 240 },
        { key: 'value', title: 'Summary', width: 460 },
      ],
      [
        {
          metric: 'Verdict',
          value: `${overallVerdict} ${intelligenceReport.explanation.expectedOutcome}`.slice(0, 220),
        },
      ],
      { fontSize: 9 }
    );
    drawTable(
      [
        { key: 'metric', title: 'Metric', width: 240 },
        { key: 'value', title: 'Value', width: 460 },
      ],
      [
        { metric: 'Total Pages Scanned', value: intelligenceReport.summary.pagesAnalyzed },
        { metric: 'Current SEO Score', value: intelligenceReport.summary.currentScore },
        { metric: 'Estimated SEO Score', value: intelligenceReport.summary.estimatedScore },
        { metric: 'Improvement Delta', value: intelligenceReport.summary.improvement },
        { metric: 'Confidence Score', value: intelligenceReport.summary.confidenceScore },
        { metric: 'Total Issues', value: intelligenceReport.summary.totalIssues },
        { metric: 'Technical Score', value: intelligenceReport.summary.breakdown.technicalScore },
        { metric: 'Content Score', value: intelligenceReport.summary.breakdown.contentScore },
        { metric: 'Keyword Score', value: intelligenceReport.summary.breakdown.keywordScore },
        { metric: 'Link Score', value: intelligenceReport.summary.breakdown.linkScore },
        { metric: 'Traffic Increase Prediction (%)', value: intelligenceReport.summary.impactPrediction.trafficIncreasePercent },
        { metric: 'Ranking Improvement Estimate', value: intelligenceReport.summary.impactPrediction.rankingImprovementEstimate },
      ],
      { fontSize: 9 }
    );
    const topThreeActions = intelligenceReport.decisions.slice(0, 3).map((d) => `${d.actionType} (${displayUrl(d.page)})`).join(' | ');
    drawTable(
      [
        { key: 'metric', title: 'At-a-Glance', width: 240 },
        { key: 'value', title: 'Value', width: 460 },
      ],
      [
        { metric: 'Top 3 Actions', value: topThreeActions || '-' },
        { metric: 'Quick Wins Count', value: intelligenceReport.quickWins.length },
        { metric: 'Confidence', value: intelligenceReport.summary.confidenceScore },
        { metric: 'Why This Matters', value: intelligenceReport.explanation.whyThisMatters },
      ],
      { fontSize: 9 }
    );
    line(
      `Confidence explanation: Score ${intelligenceReport.summary.confidenceScore} reflects data completeness, keyword validity, and consistency of prioritized actions.`,
      '#334155',
      9
    );
    doc.moveDown(0.25);

    sectionTitle('2. Top Actionable Improvements');
    const effortLevel = (score: number): 'Low' | 'Medium' | 'High' =>
      score >= 85 ? 'Low' : score >= 70 ? 'Medium' : 'High';
    const immediateActions = [...intelligenceReport.decisions]
      .filter((d) => d.actionConfidence.score >= 80 && d.priority === 'HIGH')
      .slice(0, 3);
    drawTable(
      [
        { key: 'metric', title: 'Immediate Actions (Next 24h)', width: 240 },
        { key: 'value', title: 'Action', width: 460 },
      ],
      (immediateActions.length
        ? immediateActions
        : intelligenceReport.decisions.slice(0, 3)
      ).map((d) => ({
        metric: d.actionType,
        value: `${displayUrl(d.page)} | Confidence ${d.actionConfidence.score} | ${d.expectedImpact}`.slice(0, 180),
      })),
      { fontSize: 9 }
    );
    drawTable(
      [
        { key: 'action', title: 'Action', width: 520 },
        { key: 'impact', title: 'Impact', width: 90, align: 'center' },
        { key: 'effort', title: 'Estimated Effort', width: 90, align: 'center' },
      ],
      intelligenceReport.scoreSimulation.scoreBreakdown.map((s) => ({
        action: s.action,
        impact: `+${s.impact}`,
        effort: effortLevel(
          Math.round(
            intelligenceReport.executionPlan.reduce((n, e) => n + e.actionConfidence.score, 0) /
              Math.max(1, intelligenceReport.executionPlan.length)
          )
        ),
      })),
      { fontSize: 9 }
    );
    drawTable(
      [
        { key: 'keyword', title: 'Top Opportunity Keyword', width: 280 },
        { key: 'page', title: 'Target Page', width: 300 },
        { key: 'score', title: 'Opportunity Score', width: 140, align: 'center' },
      ],
      intelligenceReport.topOpportunities.map((t) => ({
        keyword: t.keyword,
        page: displayUrl(t.targetPage),
        score: t.opportunityScore,
      })),
      { fontSize: 8 }
    );
    drawTable(
      [
        { key: 'page', title: 'Quick Win Page', width: 230 },
        { key: 'action', title: 'Action', width: 330 },
        { key: 'change', title: 'Exact Change', width: 210 },
      ],
      intelligenceReport.quickWins.map((q) => ({
        page: displayUrl(q.page),
        action: q.action.slice(0, 100),
        change: q.exactChange.slice(0, 90),
      })),
      { fontSize: 8 }
    );

    sectionTitle('3. Content & Heading Analysis');
    const decisionPages = new Set(intelligenceReport.decisions.map((d) => d.page));
    const stablePages = intelligenceReport.pages.filter(
      (p) =>
        p.issues.filter((i) => i.severity === 'HIGH' || i.severity === 'MEDIUM').length === 0 &&
        !decisionPages.has(p.pageUrl)
    );
    if (stablePages.length) {
      drawTable(
        [
          { key: 'page', title: 'Stable Page', width: 460 },
          { key: 'score', title: 'SEO Score', width: 120, align: 'center' },
          { key: 'note', title: 'Status', width: 120, align: 'center' },
        ],
        stablePages.slice(0, 8).map((p) => ({
          page: displayUrl(p.pageUrl),
          score: p.seoScore,
          note: 'Stable',
        })),
        { fontSize: 8 }
      );
    }
    drawTable(
      [
        { key: 'page', title: 'Page', width: 160 },
        { key: 'wc', title: 'Words', width: 64, align: 'center' },
        { key: 'rwc', title: 'Recommended', width: 84, align: 'center' },
        { key: 'coverage', title: 'Coverage', width: 72, align: 'center' },
        { key: 'h1', title: 'Current H1', width: 200 },
        { key: 'h1opt', title: 'Optimized', width: 64, align: 'center' },
        { key: 'suggested', title: 'Suggested H1', width: 120 + (contentWidth - 764) },
      ],
      intelligenceReport.pages.map((p) => ({
        page: displayUrl(p.pageUrl),
        wc: p.contentAnalysis.wordCount,
        rwc: p.contentAnalysis.recommendedWordCount,
        coverage: `${p.contentAnalysis.keywordCoverage}%`,
        h1: sanitizeHeadingForPdf(p.headingAnalysis.currentH1),
        h1opt: p.headingAnalysis.isOptimized ? 'YES' : 'NO',
        suggested: sanitizeHeadingForPdf(p.headingAnalysis.suggestedH1),
      })),
      { fontSize: 8 }
    );
    drawTable(
      [
        { key: 'keyword', title: 'Keyword', width: 220 },
        { key: 'intent', title: 'Intent', width: 110, align: 'center' },
        { key: 'target', title: 'Target Page', width: 230 },
        { key: 'priority', title: 'Priority', width: 80, align: 'center' },
        { key: 'opportunity', title: 'Opportunity', width: 80, align: 'center' },
      ],
      intelligenceReport.keywordStrategy.primaryKeywords.map((k) => ({
        keyword: k.keyword,
        intent: k.intent.toUpperCase(),
        target: displayUrl(k.targetPage),
        priority: k.priorityScore,
        opportunity: k.opportunityScore,
      })),
      { fontSize: 8 }
    );
    line(
      `Keyword Buckets -> Primary: ${intelligenceReport.keywordStrategy.primaryKeywords.length}, Long-tail: ${intelligenceReport.keywordStrategy.longTailKeywords.length}, Blog: ${intelligenceReport.keywordStrategy.blogKeywords.length}, Comparison: ${intelligenceReport.keywordStrategy.comparisonKeywords.length}`,
      '#334155',
      9
    );
    doc.moveDown(0.2);
    line(
      `Keyword Clusters: ${intelligenceReport.keywordClusters.map((c) => `${c.cluster} (${c.count})`).slice(0, 6).join(', ') || '-'}`,
      '#334155',
      9
    );
    doc.moveDown(0.2);
    line(
      `Competitor Gaps: ${intelligenceReport.competitorKeywordGaps.map((g) => g.keyword).slice(0, 8).join(', ') || '-'}`,
      '#334155',
      9
    );
    doc.moveDown(0.3);

    sectionTitle('4. Keyword Mapping (Standalone)');
    const keywordIntentMap = new Map(
      intelligenceReport.keywordStrategy.primaryKeywords.map((k) => [k.keyword, k.intent.toUpperCase()])
    );
    drawTable(
      [
        { key: 'keyword', title: 'Keyword', width: 240 },
        { key: 'intent', title: 'Intent', width: 90, align: 'center' },
        { key: 'target', title: 'Mapped Page', width: 250 },
        { key: 'reason', title: 'Reason', width: 120 + (contentWidth - 580) },
      ],
      intelligenceReport.keywordMapping.map((m) => ({
        keyword: m.keyword,
        intent: keywordIntentMap.get(m.keyword) || '-',
        target: displayUrl(m.targetPage),
        reason: m.reason.slice(0, 100),
      })),
      { fontSize: 8 }
    );

    sectionTitle('5. Image SEO Analysis');
    drawTable(
      [
        { key: 'page', title: 'Page', width: 140 },
        { key: 'image', title: 'Image', width: 150 },
        { key: 'alt', title: 'Alt Text', width: 90 },
        { key: 'ctx', title: 'Context', width: 70, align: 'center' },
        { key: 'conv', title: 'Conversion', width: 70, align: 'center' },
        { key: 'type', title: 'Type', width: 70, align: 'center' },
        { key: 'issue', title: 'Issue', width: 100 },
        { key: 'impr', title: 'Improvement', width: 80 + (contentWidth - 690) },
      ],
      intelligenceReport.pages
        .flatMap((p) =>
          p.imageAnalysis.map((img) => ({
            page: displayUrl(p.pageUrl),
            image: displayUrl(img.imageUrl),
            alt: (img.altText || '-').slice(0, 35),
            ctx: `${img.contextMatchScore}%`,
            conv: img.conversionImpact,
            type: img.suggestedImageType,
            issue: img.issue,
            impr: img.improvement.slice(0, 70),
          }))
        )
        .slice(0, 12),
      { fontSize: 7 }
    );

    sectionTitle('6. Technical SEO Issues');
    drawTable(
      [
        { key: 'type', title: 'Issue Type', width: 170 },
        { key: 'page', title: 'Page', width: 210 },
        { key: 'severity', title: 'Severity', width: 80, align: 'center' },
        { key: 'impact', title: 'Impact', width: 140 },
        { key: 'fix', title: 'Fix Suggestion', width: 120 + (contentWidth - 600) },
      ],
      intelligenceReport.technicalIssues.map((i) => ({
        type: i.type,
        page: displayUrl(i.page),
        severity: i.severity,
        impact: i.impact.slice(0, 60),
        fix: i.fixSuggestion.slice(0, 95),
      })),
      { fontSize: 8 }
    );

    sectionTitle('7. Internal Linking Plan');
    drawTable(
      [
        { key: 'from', title: 'From', width: 230 },
        { key: 'to', title: 'To', width: 230 },
        { key: 'anchor', title: 'Anchor Text', width: 160 },
        { key: 'reason', title: 'Reason', width: 80 + (contentWidth - 620) },
      ],
      intelligenceReport.internalLinks.map((l) => ({
        from: displayUrl(l.from),
        to: displayUrl(l.to),
        anchor: l.anchorText.slice(0, 50),
        reason: l.reason.slice(0, 90),
      })),
      { fontSize: 8 }
    );

    sectionTitle('8. New Page Opportunities');
    drawTable(
      [
        { key: 'keyword', title: 'Keyword', width: 170 },
        { key: 'url', title: 'URL', width: 170 },
        { key: 'intent', title: 'Intent', width: 90, align: 'center' },
        { key: 'priority', title: 'Priority', width: 90, align: 'center' },
        { key: 'reason', title: 'Reason', width: 140 + (contentWidth - 520) },
        { key: 'brief', title: 'Brief', width: 160 },
      ],
      intelligenceReport.newPageSuggestions.map((n) => ({
        keyword: n.keyword,
        url: n.url,
        intent: n.intent,
        priority: n.priority,
        reason: n.reason.slice(0, 70),
        brief: `${n.contentBrief.headings.join(' | ')} (${n.contentBrief.wordCount})`.slice(0, 90),
      })),
      { fontSize: 8 }
    );

    sectionTitle('9. AI Decision Engine Output');
    drawTable(
      [
        { key: 'action', title: 'Action', width: 88 },
        { key: 'page', title: 'Page', width: 152 },
        { key: 'primaryKeyword', title: 'Primary keyword', width: 128 },
        { key: 'priority', title: 'Priority', width: 72, align: 'center' },
        { key: 'impactType', title: 'Impact Type', width: 82, align: 'center' },
        { key: 'confidence', title: 'Confidence', width: 72, align: 'center' },
        { key: 'reason', title: 'Reason', width: 108 },
        { key: 'expected', title: 'Expected Impact', width: 120 + (contentWidth - 804) },
      ],
      intelligenceReport.decisions.map((d) => ({
        action: d.actionType,
        page: displayUrl(d.page),
        primaryKeyword: (d.primaryKeyword || '—').slice(0, 80),
        priority: d.priority,
        impactType: d.impactType,
        confidence: d.actionConfidence.score,
        reason: d.reason.slice(0, 55),
        expected: d.expectedImpact,
      })),
      { fontSize: 8 }
    );
    drawTable(
      [
        { key: 'group', title: 'Decision Group', width: 220 },
        { key: 'count', title: 'Count', width: 120, align: 'center' },
        { key: 'actions', title: 'Actions', width: 360 },
      ],
      [
        { group: 'highImpact', count: intelligenceReport.decisionGroups.highImpact.length, actions: intelligenceReport.decisionGroups.highImpact.map((d) => d.actionType).join(', ') || '-' },
        { group: 'quickWins', count: intelligenceReport.decisionGroups.quickWins.length, actions: intelligenceReport.decisionGroups.quickWins.map((d) => d.actionType).join(', ') || '-' },
        { group: 'contentImprovements', count: intelligenceReport.decisionGroups.contentImprovements.length, actions: intelligenceReport.decisionGroups.contentImprovements.map((d) => d.actionType).join(', ') || '-' },
        { group: 'technicalFixes', count: intelligenceReport.decisionGroups.technicalFixes.length, actions: intelligenceReport.decisionGroups.technicalFixes.map((d) => d.actionType).join(', ') || '-' },
      ],
      { fontSize: 8 }
    );
    const skippedDecisions = intelligenceReport.decisions.filter((d) => d.actionConfidence.score <= 70 || d.priority === 'LOW');
    drawTable(
      [
        { key: 'action', title: 'Skipped Action', width: 120 },
        { key: 'page', title: 'Page', width: 150 },
        { key: 'primaryKeyword', title: 'Primary keyword', width: 110 },
        { key: 'skipReason', title: 'Skip Reason', width: 200 },
        { key: 'reason', title: 'Decision Reason', width: 150 },
        { key: 'confidence', title: 'Confidence', width: 74, align: 'center' },
      ],
      (
        skippedDecisions.length
          ? skippedDecisions
          : [
              {
                actionType: '-',
                page: '-',
                primaryKeyword: '—',
                reason: 'No skipped decisions',
                actionConfidence: { score: 0 },
              },
            ]
      ).map((d: any) => ({
        action: d.actionType,
        page: displayUrl(d.page),
        primaryKeyword: (d.primaryKeyword || '—').slice(0, 70),
        skipReason: d.actionConfidence.score <= 70 ? 'Low confidence (<=70)' : d.priority === 'LOW' ? 'Low priority' : '-',
        reason: d.reason.slice(0, 90),
        confidence: d.actionConfidence.score,
      })),
      { fontSize: 8 }
    );

    sectionTitle('10. Execution plan (handoff to dev / content)');
    doc.fontSize(8).fillColor('#64748b').text(
      softWrapForPdf(
        'This section is a draft work list. It does not change your live site. Engineers often ship similar edits as GitHub "pull requests" (PRs)—groups of file updates with a short description. Content and SEO leads should still read each "before → after" snippet for tone and accuracy.'
      ),
      leftX,
      doc.y,
      { width: contentWidth, align: 'left' }
    );
    doc.moveDown(0.35);
    doc.fontSize(8).fillColor('#64748b').text(
      softWrapForPdf(
        `Execution mode — ${intelligenceReport.executionMode.toUpperCase()}: ` +
          (intelligenceReport.executionMode === 'preview'
            ? 'Preview only. Nothing is auto-applied; use the tables below as tickets or copy-paste instructions.'
            : 'Execute-capable build: automation may apply approved changes—confirm with your admin.')
      ),
      leftX,
      doc.y,
      { width: contentWidth, align: 'left' }
    );
    doc.moveDown(0.45);
    const executionFiles = new Set(intelligenceReport.executionPlan.map((e) => e.filePath)).size;
    const executionChanges = intelligenceReport.executionPlan.reduce((n, e) => n + e.changes.length, 0);
    const blockedActionsCount = skippedDecisions.length;
    const safeActionsCount = intelligenceReport.executionPlan.length;
    const avgConfidence = intelligenceReport.executionPlan.length
      ? Math.round(
          intelligenceReport.executionPlan.reduce((n, e) => n + e.actionConfidence.score, 0) /
            Math.max(1, intelligenceReport.executionPlan.length)
        )
      : 0;
    const prGroupCount =
      intelligenceReport.prGroups.metaFixes.length +
      intelligenceReport.prGroups.contentUpdates.length +
      intelligenceReport.prGroups.internalLinks.length +
      intelligenceReport.prGroups.technicalFixes.length;
    const readinessStatus = blockedActionsCount === 0 && avgConfidence >= 80 ? 'READY' : avgConfidence >= 70 ? 'REVIEW_REQUIRED' : 'NOT_READY';
    const readinessPlain =
      readinessStatus === 'READY'
        ? 'Low friction: spot-check wording, then ship.'
        : readinessStatus === 'REVIEW_REQUIRED'
          ? 'Have SEO or a content owner approve each snippet before publishing.'
          : 'Treat as exploratory—several items need stronger data or rewrites first.';
    drawTable(
      [
        { key: 'metric', title: 'What this means (managers)', width: 260 },
        { key: 'value', title: 'Detail', width: 440 },
      ],
      [
        {
          metric: 'Publishing readiness (code)',
          value: `${readinessStatus} — ${readinessPlain}`,
        },
        {
          metric: 'Pages with an approved edit batch',
          value: `${safeActionsCount} — each row is one URL where we suggest concrete title / meta / H1 (or similar) replacements below.`,
        },
        {
          metric: 'Suggestions on hold for now',
          value: `${blockedActionsCount} — ideas we still show in section 9 but did not bundle here (often lower confidence or lower priority).`,
        },
        {
          metric: 'Average certainty for bundled edits (0–100)',
          value: `${avgConfidence} — higher usually means clearer crawl signals and safer, smaller text swaps (not a Google ranking guarantee).`,
        },
      ],
      { fontSize: 9 }
    );
    drawTable(
      [
        { key: 'metric', title: 'Scope of work', width: 260 },
        { key: 'value', title: 'Detail', width: 440 },
      ],
      [
        {
          metric: 'Total on-page text or tag tweaks',
          value: `${executionChanges} — individual before/after lines listed in the next table.`,
        },
        {
          metric: 'Content files touched (approx.)',
          value: `${executionFiles} — unique file paths referenced for engineering handoff.`,
        },
        {
          metric: 'Suggested PR batches',
          value: `${prGroupCount} — logical groupings (e.g. meta-only vs body) so reviews stay small.`,
        },
      ],
      { fontSize: 9 }
    );
    const riskSeoOnly = intelligenceReport.executionPlan.filter((e) => e.impactType === 'SEO_ONLY').length;
    const riskContent = intelligenceReport.executionPlan.filter((e) => e.impactType === 'CONTENT').length;
    const riskRiskyBlocked = skippedDecisions.filter((d) => d.impactType === 'RISKY').length;
    drawTable(
      [
        { key: 'metric', title: 'Change type (for reviewers)', width: 260 },
        { key: 'value', title: 'Detail', width: 440 },
      ],
      [
        {
          metric: 'Tags & snippets only (titles, meta, H1, …)',
          value: `${riskSeoOnly} — typically quick copy review; less layout risk.`,
        },
        {
          metric: 'Larger body or section rewrites',
          value: `${riskContent} — needs editorial time if any appear.`,
        },
        {
          metric: 'Blocked risky automation',
          value: `${riskRiskyBlocked} — broad replacements we refused to auto-suggest.`,
        },
      ],
      { fontSize: 9 }
    );
    doc.moveDown(0.15);
    doc.fontSize(8).fillColor('#64748b').text(
      softWrapForPdf(
        'Suggested edits (for approvers): each row is one field on a page. Selector = which HTML element (e.g. title, H1). Before / After = current vs proposed text. SEO_ONLY means tag or snippet edits, not a full page redesign.'
      ),
      leftX,
      doc.y,
      { width: contentWidth, align: 'left' }
    );
    doc.moveDown(0.25);
    const topicRows = intelligenceReport.executionPlan.map((e) => ({
      page: displayUrl(e.page),
      fit: e.topicAlignmentScore,
      note: softWrapForPdf(e.topicReviewerWarning || 'No major auto-detected mismatch vs URL/title/H1 (still verify tone).').slice(0, 200),
    }));
    drawTable(
      [
        { key: 'page', title: 'Page', width: 200 },
        { key: 'fit', title: 'Topic fit 0–100', width: 90, align: 'center' },
        { key: 'note', title: 'Topic check (auto)', width: 120 + (contentWidth - 410) },
      ],
      topicRows.length ? topicRows : [{ page: '—', fit: '—', note: 'No bundled edits for this export.' }],
      { fontSize: 7 }
    );
    if (intelligenceReport.executionPlan.some((e) => e.topicReviewerWarning)) {
      doc.moveDown(0.2);
      doc.fontSize(8).fillColor('#b45309').text(
        softWrapForPdf(
          'At least one URL above shows weak overlap between the target keyword and the live page topic. Treat title/meta/H1/intro suggestions as draft ideas, not final copy.'
        ),
        leftX,
        doc.y,
        { width: contentWidth, align: 'left' }
      );
      doc.moveDown(0.35);
    } else {
      doc.moveDown(0.35);
    }
    drawTable(
      [
        { key: 'page', title: 'Page', width: 130 },
        { key: 'file', title: 'File', width: 130 },
        { key: 'impact', title: 'Impact', width: 70, align: 'center' },
        { key: 'conf', title: 'Confidence', width: 70, align: 'center' },
        { key: 'selector', title: 'Selector', width: 100 },
        { key: 'diff', title: 'Diff', width: 60, align: 'center' },
        { key: 'before', title: 'Before', width: 120 },
        { key: 'after', title: 'After', width: 120 + (contentWidth - 800) },
      ],
      intelligenceReport.executionPlan.flatMap((e) =>
        e.changes.map((c) => ({
          page: displayUrl(e.page),
          file: e.filePath.slice(0, 30),
          impact: e.impactType,
          conf: e.actionConfidence.score,
          selector: c.selector.slice(0, 24),
          diff: c.diffPreview.diffType,
          before: `- ${c.diffPreview.before.slice(0, 33)}`,
          after: `+ ${c.diffPreview.after.slice(0, 33)}`,
        }))
      ),
      { fontSize: 7 }
    );
    drawTable(
      [
        { key: 'group', title: 'PR Group', width: 220 },
        { key: 'count', title: 'Count', width: 120, align: 'center' },
        { key: 'ids', title: 'IDs', width: 360 },
      ],
      [
        { group: 'metaFixes', count: intelligenceReport.prGroups.metaFixes.length, ids: intelligenceReport.prGroups.metaFixes.map((g) => g.groupId).join(', ') || '-' },
        { group: 'contentUpdates', count: intelligenceReport.prGroups.contentUpdates.length, ids: intelligenceReport.prGroups.contentUpdates.map((g) => g.groupId).join(', ') || '-' },
        { group: 'internalLinks', count: intelligenceReport.prGroups.internalLinks.length, ids: intelligenceReport.prGroups.internalLinks.map((g) => g.groupId).join(', ') || '-' },
        { group: 'technicalFixes', count: intelligenceReport.prGroups.technicalFixes.length, ids: intelligenceReport.prGroups.technicalFixes.map((g) => g.groupId).join(', ') || '-' },
      ],
      { fontSize: 8 }
    );
    const totalSimulationImpact = intelligenceReport.scoreSimulation.scoreBreakdown.reduce(
      (s, i) => s + Number(i.impact || 0),
      0
    );
    const groupRows = [
      { group: 'metaFixes', rows: intelligenceReport.prGroups.metaFixes },
      { group: 'contentUpdates', rows: intelligenceReport.prGroups.contentUpdates },
      { group: 'internalLinks', rows: intelligenceReport.prGroups.internalLinks },
      { group: 'technicalFixes', rows: intelligenceReport.prGroups.technicalFixes },
    ].map((g) => {
      const groupChanges = g.rows.reduce((n, r) => n + r.changes.length, 0);
      const filesAffected = new Set(g.rows.map((r) => r.filePath)).size;
      const estimatedImpact = executionChanges > 0
        ? Math.round((groupChanges / executionChanges) * totalSimulationImpact * 10) / 10
        : 0;
      return {
        group: g.group,
        impact: `+${estimatedImpact}`,
        files: filesAffected,
      };
    });
    drawTable(
      [
        { key: 'group', title: 'PR Group', width: 220 },
        { key: 'impact', title: 'Estimated Score Impact', width: 220, align: 'center' },
        { key: 'files', title: 'Files Affected', width: 260, align: 'center' },
      ],
      groupRows,
      { fontSize: 8 }
    );
    const changeDensityRows = [...intelligenceReport.executionPlan]
      .map((e) => ({ page: displayUrl(e.page), changes: e.changes.length }))
      .sort((a, b) => b.changes - a.changes)
      .slice(0, 5);
    drawTable(
      [
        { key: 'page', title: 'Top Page by Change Density', width: 500 },
        { key: 'changes', title: 'Changes', width: 200, align: 'center' },
      ],
      changeDensityRows.length ? changeDensityRows : [{ page: '-', changes: 0 }],
      { fontSize: 8 }
    );
    drawTable(
      [
        { key: 'prId', title: 'PR ID', width: 140 },
        { key: 'status', title: 'Status', width: 120, align: 'center' },
        { key: 'expected', title: 'Expected Impact', width: 280 },
        { key: 'actual', title: 'Actual Impact', width: 180 },
      ],
      intelligenceReport.executionTracking.map((t) => ({
        prId: t.prId,
        status: t.status.toUpperCase(),
        expected: t.expectedImpact.slice(0, 100),
        actual: (t.actualImpact || '-').slice(0, 70),
      })),
      { fontSize: 8 }
    );

    sectionTitle('11. Learning & Adaptation');
    drawTable(
      [
        { key: 'actionType', title: 'Action Type', width: 180 },
        { key: 'success', title: 'Success', width: 90, align: 'center' },
        { key: 'expected', title: 'Expected', width: 90, align: 'center' },
        { key: 'actual', title: 'Actual', width: 90, align: 'center' },
        { key: 'accuracy', title: 'Accuracy', width: 90, align: 'center' },
        { key: 'note', title: 'Note', width: 180 + (contentWidth - 540) },
      ],
      intelligenceReport.learningInsights.map((l) => ({
        actionType: l.actionType,
        success: l.success ? 'YES' : 'NO',
        expected: l.expectedImpact,
        actual: l.actualImpact,
        accuracy: `${l.accuracyScore}%`,
        note: 'Latest cycle',
      })),
      { fontSize: 8 }
    );
    drawTable(
      [
        { key: 'actionType', title: 'Action Type', width: 180 },
        { key: 'runs', title: 'Runs', width: 90, align: 'center' },
        { key: 'successRate', title: 'Success Rate', width: 110, align: 'center' },
        { key: 'avgEff', title: 'Avg Effectiveness', width: 120, align: 'center' },
        { key: 'avgAcc', title: 'Avg Accuracy', width: 110, align: 'center' },
        { key: 'weights', title: 'Weights', width: 110 + (contentWidth - 610), align: 'center' },
      ],
      intelligenceReport.historicalLearning.byActionType.map((h) => ({
        actionType: h.actionType,
        runs: h.totalRuns,
        successRate: `${h.successRate}%`,
        avgEff: h.averageEffectiveness,
        avgAcc: `${h.averageAccuracy}%`,
        weights: `P:${intelligenceReport.weightingAdjustments.priorityWeight} O:${intelligenceReport.weightingAdjustments.opportunityWeight}`,
      })),
      { fontSize: 8 }
    );
    const bestLearning = intelligenceReport.historicalLearning.byActionType[0]
      ? [...intelligenceReport.historicalLearning.byActionType].sort((a, b) => b.averageEffectiveness - a.averageEffectiveness)[0]
      : null;
    const weakestLearning = intelligenceReport.historicalLearning.byActionType[0]
      ? [...intelligenceReport.historicalLearning.byActionType].sort((a, b) => a.averageEffectiveness - b.averageEffectiveness)[0]
      : null;
    drawTable(
      [
        { key: 'metric', title: 'Learning Summary', width: 260 },
        { key: 'value', title: 'Value', width: 440 },
      ],
      [
        { metric: 'Best Performing Action', value: bestLearning ? `${bestLearning.actionType} (${bestLearning.averageEffectiveness})` : '-' },
        { metric: 'Weakest Action', value: weakestLearning ? `${weakestLearning.actionType} (${weakestLearning.averageEffectiveness})` : '-' },
        {
          metric: 'System Adjustment Note',
          value: `Priority weight ${intelligenceReport.weightingAdjustments.priorityWeight}, Opportunity weight ${intelligenceReport.weightingAdjustments.opportunityWeight}`,
        },
      ],
      { fontSize: 9 }
    );

    sectionTitle('12. Score Simulation');
    const totalBreakdownScore =
      intelligenceReport.summary.breakdown.technicalScore +
      intelligenceReport.summary.breakdown.contentScore +
      intelligenceReport.summary.breakdown.keywordScore +
      intelligenceReport.summary.breakdown.linkScore;
    const modeledDelta = (score: number): number =>
      totalBreakdownScore > 0
        ? Math.round(((score / totalBreakdownScore) * intelligenceReport.summary.improvement) * 10) / 10
        : 0;
    drawTable(
      [
        { key: 'metric', title: 'Metric', width: 260 },
        { key: 'value', title: 'Value', width: 440 },
      ],
      [
        { metric: 'Before', value: intelligenceReport.scoreSimulation.before },
        { metric: 'After', value: intelligenceReport.scoreSimulation.after },
        { metric: 'Why This Matters', value: intelligenceReport.explanation.whyThisMatters },
        { metric: 'Expected Outcome', value: intelligenceReport.explanation.expectedOutcome },
        { metric: 'Pages analyzed', value: intelligenceReport.dataQualityCheck.pagesAnalyzed },
        { metric: 'Unique keywords', value: intelligenceReport.dataQualityCheck.uniqueKeywords },
        { metric: 'Duplicate keywords removed', value: intelligenceReport.dataQualityCheck.duplicateKeywordsRemoved },
        { metric: 'Invalid keywords filtered', value: intelligenceReport.dataQualityCheck.invalidKeywordsFiltered },
      ],
      { fontSize: 9 }
    );
    drawTable(
      [
        { key: 'category', title: 'Category', width: 260 },
        { key: 'delta', title: 'Score Delta', width: 440 },
      ],
      [
        { category: 'Technical', delta: `+${modeledDelta(intelligenceReport.summary.breakdown.technicalScore)}` },
        { category: 'Content', delta: `+${modeledDelta(intelligenceReport.summary.breakdown.contentScore)}` },
        { category: 'Keyword', delta: `+${modeledDelta(intelligenceReport.summary.breakdown.keywordScore)}` },
        { category: 'Link', delta: `+${modeledDelta(intelligenceReport.summary.breakdown.linkScore)}` },
      ],
      { fontSize: 9 }
    );

    sectionTitle('13. Next steps, definitions, and automation');
    doc.fontSize(9).fillColor('#334155').text('What runs automatically vs what you do manually', leftX, doc.y, {
      width: contentWidth,
      underline: true,
    });
    doc.moveDown(0.35);
    doc.fontSize(8).fillColor('#64748b').text(
      softWrapForPdf(
        'This PDF is generated by the SEO agent after a crawl and model pass. It does not edit your site by itself. Engineers may use GitHub or a CMS to apply rows from section 10; content owners should rewrite any draft that does not match brand voice or the true page topic. Integrations (e.g. GitHub issues or PR bots) only run when you enable them in your deployment.'
      ),
      leftX,
      doc.y,
      { width: contentWidth, align: 'left' }
    );
    doc.moveDown(0.45);
    doc.fontSize(9).fillColor('#334155').text('Suggested next steps', leftX, doc.y, {
      width: contentWidth,
      underline: true,
    });
    doc.moveDown(0.35);
    doc.fontSize(8).fillColor('#64748b').text(
      softWrapForPdf(
        '1) Share sections 3–6 with the page owner for fact-checking. 2) Fix broken links and factual errors before SEO experiments. 3) For each URL in section 10 with a low "Topic fit" score, either change the primary keyword in your strategy or discard auto snippets. 4) Publish only after SME review of title, meta, H1, and intro. 5) Re-run a scan after changes to refresh scores.'
      ),
      leftX,
      doc.y,
      { width: contentWidth, align: 'left' }
    );
    doc.moveDown(0.45);
    doc.fontSize(9).fillColor('#334155').text('Definitions (plain language)', leftX, doc.y, {
      width: contentWidth,
      underline: true,
    });
    doc.moveDown(0.35);
    doc.fontSize(8).fillColor('#64748b').text(
      softWrapForPdf(
        'Score simulation: illustrative math from your scan averages—not a promise from Google. Topic fit: share of primary-keyword words found in the live URL slug, browser title, and H1. Confidence: how strong the crawl + keyword signals were for that bundle of edits. PR / pull request: a reviewable package of file changes—common in software teams.'
      ),
      leftX,
      doc.y,
      { width: contentWidth, align: 'left' }
    );
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#94a3b8').text(
      'Report layout is data-first for speed; richer charts and branding can be added in the web dashboard.',
      leftX,
      doc.y,
      { width: contentWidth, align: 'left' }
    );
    doc.moveDown(0.6);

    doc.fontSize(8).fillColor('#94a3b8').text(`Generated ${new Date().toISOString()} — AI SEO Agent`, {
      align: 'center',
    });

    doc.end();
  });
}

/** Legacy PDF when no JSON report file exists. */
export function buildScanReportPdf(meta: ScanPdfMeta, issues: ScanPdfIssueRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `SEO Report — ${meta.domain}` } });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    doc.pipe(stream);

    const contentWidth = doc.page.width - 96;

    drawBrandedPdfHeader(doc, 'SEO scan report', `Domain: ${meta.domain}`);

    doc.fontSize(12).fillColor('#0f172a').text('Summary', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Scan ID: ${meta.id}`);
    doc.text(`Started: ${meta.started_at}`);
    if (meta.completed_at) doc.text(`Completed: ${meta.completed_at}`);
    doc.text(`Status: ${meta.status}`);
    doc.text(`Pages crawled: ${meta.pages_count}`);
    doc.text(
      `Average SEO score (AI): ${meta.seo_score_avg != null ? meta.seo_score_avg.toFixed(1) : '—'}`
    );
    doc.text(`GitHub issues created (automation): ${meta.github_issues_created}`);
    doc.text(`Open findings: ${issues.length}`);
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#0f172a').text('Findings & recommended actions', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#64748b').text(
      'Legacy issue list (no per-page JSON file for this scan). Run a new scan for the full audit PDF.',
      { width: contentWidth }
    );
    doc.moveDown(0.8);

    if (issues.length === 0) {
      doc.fontSize(10).fillColor('#334155').text('No rows in the issues table for this scan.', {
        width: contentWidth,
      });
    } else {
      issues.forEach((row, idx) => {
        const solution =
          row.ai_suggestion?.trim() ||
          'No AI recommendation stored. Re-run scan with OPENAI_API_KEY.';

        if (doc.y > doc.page.height - 180) doc.addPage();

        doc.fontSize(11).fillColor('#0f172a').text(`${idx + 1}. ${row.issue_type.replace(/_/g, ' ')}`, {
          width: contentWidth,
        });
        doc.moveDown(0.25);
        doc.fontSize(9).fillColor('#64748b').text(`Page: ${row.page_url}`, { width: contentWidth });
        doc.moveDown(0.35);
        doc.fontSize(10).fillColor('#1e293b').text('Problem:', { continued: false });
        doc.moveDown(0.15);
        doc.fontSize(10).fillColor('#334155').text(row.message, { width: contentWidth });
        doc.moveDown(0.35);
        doc.fontSize(10).fillColor('#0f766e').text('Recommended solution (AI):', { continued: false });
        doc.moveDown(0.15);
        doc.fontSize(10).fillColor('#134e4a').text(solution, { width: contentWidth });
        if (row.github_issue_url) {
          doc.moveDown(0.25);
          doc.fontSize(9).fillColor('#2563eb').text(`GitHub: ${row.github_issue_url}`, { width: contentWidth });
        }
        doc.moveDown(0.15);
        doc.fontSize(8).fillColor('#94a3b8').text(`Status: ${row.status}`);
        doc.moveDown(1);
      });
    }

    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#94a3b8').text(`Generated ${new Date().toISOString()} — AI SEO Agent`, {
      align: 'center',
    });

    doc.end();
  });
}
