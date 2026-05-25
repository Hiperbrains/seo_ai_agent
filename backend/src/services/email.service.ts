import nodemailer from 'nodemailer';
import { getEmailConfig } from './secrets.service';
import { logger } from '../utils/logger';
import { dbAll, dbGet } from './db.service';
import { loadScanReportFile } from './reportFile.service';
import {
  buildScanReportPdf,
  renderPdf,
  ScanPdfIssueRow,
  ScanPdfMeta,
  suggestedFilename,
} from './pdfReport.service';
import { buildIntelligenceReport } from './intelligenceReport.service';
import { getPublicAppUrl, resolveBrandLogoPath } from '../utils/brandAssets';

export interface EmailReportPayload {
  scanId?: number;
  domain: string;
  pagesCount: number;
  issuesCount: number;
  aiSummaryLines: string[];
  to: string;
}

async function buildDownloadPdfAttachment(scanId: number): Promise<{ filename: string; content: Buffer }> {
  const row = await dbGet<{
    id: number;
    started_at: string;
    completed_at: string | null;
    pages_count: number;
    seo_score_avg: number | null;
    status: string;
    github_issues_created: number;
    domain: string;
  }>(
    `SELECT s.id, s.started_at, s.completed_at, s.pages_count, s.seo_score_avg, s.status, s.github_issues_created,
            d.domain
     FROM scans s JOIN domains d ON d.id = s.domain_id WHERE s.id = ?`,
    [scanId]
  );

  if (!row) throw new Error(`Scan not found for PDF attachment: ${scanId}`);

  const meta: ScanPdfMeta = {
    id: row.id,
    domain: row.domain,
    started_at: row.started_at,
    completed_at: row.completed_at,
    pages_count: row.pages_count,
    seo_score_avg: row.seo_score_avg,
    status: row.status,
    github_issues_created: row.github_issues_created,
  };

  const stored = loadScanReportFile(scanId);
  const pdf = stored?.pageReports && Object.keys(stored.pageReports).length > 0
    ? await renderPdf(buildIntelligenceReport(stored))
    : await buildScanReportPdf(
        meta,
        (await dbAll(
          `SELECT page_url, issue_type, message, ai_suggestion, status, github_issue_url
           FROM issues WHERE scan_id = ? ORDER BY page_url, id`,
          [scanId]
        )) as ScanPdfIssueRow[]
      );

  return { filename: suggestedFilename(row.domain, scanId), content: pdf };
}

export async function sendReportEmail(payload: EmailReportPayload): Promise<{ ok: boolean; error?: string }> {
  const { host, port, user, pass, from } = getEmailConfig();
  if (!host || !user) {
    return { ok: false, error: 'Email not configured (EMAIL_HOST / EMAIL_USER)' };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: pass ? { user, pass } : undefined,
  });

  const logoPath = resolveBrandLogoPath();
  const publicUrl = getPublicAppUrl();
  const summaryHtml = payload.aiSummaryLines
    .slice(0, 15)
    .map((line) => `<li>${line.replace(/</g, '&lt;')}</li>`)
    .join('');

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (payload.scanId) {
    try {
      attachments = [await buildDownloadPdfAttachment(payload.scanId)];
    } catch (e) {
      logger.warn('PDF attachment skipped', { scanId: payload.scanId, error: String(e) });
    }
  }

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:640px">
      ${logoPath ? `<p><img src="cid:brand-logo" alt="AI SEO Agent" style="height:40px" /></p>` : ''}
      <h2>SEO scan report — ${payload.domain}</h2>
      <p>Pages analyzed: <strong>${payload.pagesCount}</strong> · Issues: <strong>${payload.issuesCount}</strong></p>
      <ul>${summaryHtml}</ul>
      ${publicUrl ? `<p><a href="${publicUrl}">Open dashboard</a></p>` : ''}
    </div>`;

  try {
    await transporter.sendMail({
      from: from || user,
      to: payload.to,
      subject: `SEO report: ${payload.domain}`,
      html,
      attachments: logoPath
        ? [
            ...(attachments || []),
            { filename: 'logo.png', path: logoPath, cid: 'brand-logo' },
          ]
        : attachments,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
