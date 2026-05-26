import { config } from '../config/config';
import { getActiveSetting } from './companyConfig.service';
import { getLegacySetting } from './db.service';

function setting(key: string): string {
  return getActiveSetting(key) || getLegacySetting(key) || '';
}

/** OpenAI connection — from appsettings.json ConnectionStrings.OpenAI. */
export function getOpenAiConnection(): string {
  return config.openaiConnection.trim();
}

export async function getOpenAiConnectionAsync(): Promise<string> {
  return config.openaiConnection.trim();
}

/** @deprecated Use getOpenAiConnection */
export const getOpenAiKey = getOpenAiConnection;

/** @deprecated Use getOpenAiConnectionAsync */
export const getOpenAiKeyAsync = getOpenAiConnectionAsync;

/** Google PageSpeed connection — from appsettings.json ConnectionStrings.Google. */
export function getGoogleConnection(): string {
  return config.googleConnection.trim();
}

/** @deprecated Use getGoogleConnection */
export const getGoogleApiKey = getGoogleConnection;

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
