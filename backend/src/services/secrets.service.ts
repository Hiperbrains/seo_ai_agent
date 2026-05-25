import { config } from '../config/config';
import { getActiveSetting } from './companyConfig.service';
import { getLegacySetting } from './db.service';

function setting(key: string): string {
  return getActiveSetting(key) || getLegacySetting(key) || '';
}

/** OpenAI key — always from appsettings.json (see config.openaiApiKey). */
export function getOpenAiKey(): string {
  return config.openaiApiKey.trim();
}

export async function getOpenAiKeyAsync(): Promise<string> {
  return config.openaiApiKey.trim();
}

/** Google PageSpeed key — always from appsettings.json (see config.googleApiKey). */
export function getGoogleApiKey(): string {
  return config.googleApiKey.trim();
}

export function getGithubToken(): string {
  return config.githubToken || setting('GITHUB_TOKEN') || '';
}

export function getGithubRepo(): string {
  return config.githubRepo || setting('GITHUB_REPO') || '';
}

export function getGithubRepoParts(): { owner: string; repo: string } {
  const owner = setting('GITHUB_REPO_OWNER') || '';
  const repo = setting('GITHUB_REPO_NAME') || '';
  if (owner && repo) return { owner, repo };
  const legacy = getGithubRepo();
  const [legacyOwner, legacyRepo] = legacy.split('/').filter(Boolean);
  return { owner: legacyOwner || '', repo: legacyRepo || '' };
}

export function getEmailConfig(): {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
} {
  const host = config.email.host || setting('EMAIL_HOST') || '';
  const port = parseInt(setting('EMAIL_PORT') || String(config.email.port), 10) || config.email.port;
  const user = config.email.user || setting('EMAIL_USER') || '';
  const pass = config.email.pass || setting('EMAIL_PASS') || '';
  const from = config.email.from || setting('EMAIL_FROM') || '';
  return { host, port, user, pass, from };
}
