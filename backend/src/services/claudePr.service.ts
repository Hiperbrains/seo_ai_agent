import { getActiveSetting } from './companyConfig.service';
import { logger } from '../utils/logger';
import { getGithubRepoParts, getGithubToken } from './secrets.service';
import { loadScanReportFile } from './reportFile.service';
import { buildIntelligenceReport } from './intelligenceReportService';

export type ClaudePrCreateResult = {
  ok: boolean;
  prUrl?: string;
  error?: string;
  requestPayload?: Record<string, unknown>;
};

function getClaudeSettings(): {
  instanceId: string;
  endpoint: string;
  token: string;
} {
  return {
    instanceId: getActiveSetting('CLAUDE_INSTANCE_ID') || '',
    endpoint: getActiveSetting('CLAUDE_PR_ENDPOINT') || '',
    token: getActiveSetting('CLAUDE_API_TOKEN') || '',
  };
}

function getGitRepoSettings(): {
  owner: string;
  repo: string;
  defaultBranch: string;
  contentRootFolder: string;
  fileExtension: string;
  githubToken: string;
} {
  const parts = getGithubRepoParts();
  return {
    owner: getActiveSetting('GITHUB_REPO_OWNER') || parts.owner,
    repo: getActiveSetting('GITHUB_REPO_NAME') || parts.repo,
    defaultBranch: getActiveSetting('GITHUB_DEFAULT_BRANCH') || 'main',
    contentRootFolder: (getActiveSetting('GITHUB_CONTENT_ROOT_FOLDER') || '').replace(/^\/+|\/+$/g, ''),
    fileExtension: getActiveSetting('GITHUB_FILE_EXTENSION') || '.html',
    githubToken: getGithubToken() || '',
  };
}

export async function createClaudePullRequest(params: {
  scanId: number;
  domain: string;
}): Promise<ClaudePrCreateResult> {
  const claude = getClaudeSettings();
  if (!claude.instanceId || !claude.endpoint) {
    return { ok: false, error: 'CLAUDE_INSTANCE_ID and CLAUDE_PR_ENDPOINT are required in Settings.' };
  }
  const report = loadScanReportFile(params.scanId);
  if (!report) return { ok: false, error: 'Report file not found for this scan.' };
  const intelligenceReport = buildIntelligenceReport(report);

  const git = getGitRepoSettings();
  if (!git.owner || !git.repo) {
    return { ok: false, error: 'Git repository owner/name is required in Settings.' };
  }

  const payload = {
    instanceId: claude.instanceId,
    domain: params.domain,
    scanId: params.scanId,
    repository: {
      owner: git.owner,
      repo: git.repo,
      defaultBranch: git.defaultBranch,
      contentRootFolder: git.contentRootFolder,
      fileExtension: git.fileExtension,
    },
    credentials: {
      githubToken: git.githubToken,
    },
    auditReport: intelligenceReport,
    instructions:
      'Create a GitHub pull request that applies actionable SEO fixes based on this audit report. Return JSON with prUrl.',
  } as const;

  try {
    const res = await fetch(claude.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(claude.token ? { Authorization: `Bearer ${claude.token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `Claude endpoint failed (${res.status}): ${txt || res.statusText}` };
    }
    const data = (await res.json()) as { prUrl?: string; pullRequestUrl?: string; url?: string };
    const prUrl = data.prUrl || data.pullRequestUrl || data.url || '';
    if (!prUrl) {
      return { ok: false, error: 'Claude response did not include a PR URL.', requestPayload: payload };
    }
    return { ok: true, prUrl, requestPayload: payload };
  } catch (e) {
    logger.error('createClaudePullRequest failed', { scanId: params.scanId, error: String(e) });
    return { ok: false, error: String(e), requestPayload: payload };
  }
}
