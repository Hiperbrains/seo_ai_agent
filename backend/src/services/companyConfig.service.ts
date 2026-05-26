import { config } from '../config/config';
import { companyContext, getContextCompanyId } from '../context/company.context';
import {
  getCompanyConfigJson,
  getCompanyConfigJsonAsync,
  getLegacySetting,
  setCompanyConfigJson,
  setCompanyConfigJsonAsync,
  getDriver,
} from './db.service';

const SECRET_KEY_SUFFIXES = ['PASS', 'TOKEN', 'KEY'];

/** Stored only in appsettings.json — never in company_configs / legacy settings table. */
export const APP_SETTINGS_ONLY_KEYS = [
  'OPENAI_CONNECTION',
  'GOOGLE_CONNECTION',
  'OPENAI_SECRET_KEY',
  'GOOGLE_SECRET_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'GoogleConnection',
  'GoogleSecretKey',
  'GoogleAPIKey',
] as const;

export const SETTINGS_KEYS = [
  'SERPAPI_KEY',
  'ENABLE_LIVE_SERP_RANK',
  'GITHUB_TOKEN',
  'GITHUB_REPO',
  'GITHUB_REPO_OWNER',
  'GITHUB_REPO_NAME',
  'GITHUB_DEFAULT_BRANCH',
  'GITHUB_CONTENT_ROOT_FOLDER',
  'GITHUB_FILE_EXTENSION',
  'CLAUDE_INSTANCE_ID',
  'CLAUDE_PR_ENDPOINT',
  'CLAUDE_API_TOKEN',
  'EMAIL_HOST',
  'EMAIL_PORT',
  'EMAIL_USER',
  'EMAIL_PASS',
  'EMAIL_FROM',
  'REPORT_EMAIL_TO',
  'scheduler.enabled',
  'scheduler.frequency',
  'scheduler.domain',
  'scheduler.email',
  'scheduler.rules',
] as const;

export function isSecretSettingKey(key: string): boolean {
  return SECRET_KEY_SUFFIXES.some((s) => key.includes(s));
}

export function maskSecretValue(value: string): string {
  if (!value) return '';
  return value.length > 4 ? `****${value.slice(-4)}` : '****';
}

export function stripAppSettingsKeys(settings: Record<string, string>): Record<string, string> {
  const out = { ...settings };
  for (const k of APP_SETTINGS_ONLY_KEYS) delete out[k];
  return out;
}

async function loadAndSanitizeCompanyConfig(companyId: number): Promise<Record<string, string>> {
  const raw =
    getDriver() === 'postgres' ? await getCompanyConfigJsonAsync(companyId) : getCompanyConfigJson(companyId);
  const sanitized = stripAppSettingsKeys(raw);
  const hadAppKeys = APP_SETTINGS_ONLY_KEYS.some((k) => raw[k] != null && String(raw[k]).length > 0);
  if (hadAppKeys || Object.keys(raw).length !== Object.keys(sanitized).length) {
    await setCompanyConfig(companyId, sanitized);
  }
  return sanitized;
}

export async function getCompanyConfig(companyId: number): Promise<Record<string, string>> {
  return loadAndSanitizeCompanyConfig(companyId);
}

export async function setCompanyConfig(companyId: number, settings: Record<string, string>): Promise<void> {
  if (getDriver() === 'postgres') return setCompanyConfigJsonAsync(companyId, settings);
  setCompanyConfigJson(companyId, settings);
}

export async function getCompanySetting(companyId: number, key: string): Promise<string | null> {
  const settings = await getCompanyConfig(companyId);
  const v = settings[key];
  return v ?? null;
}

export async function mergeCompanySettings(companyId: number, partial: Record<string, string>): Promise<void> {
  const settings = await getCompanyConfig(companyId);
  for (const [k, v] of Object.entries(partial)) {
    if (APP_SETTINGS_ONLY_KEYS.includes(k as (typeof APP_SETTINGS_ONLY_KEYS)[number])) continue;
    if (typeof v !== 'string' || v.startsWith('****')) continue;
    settings[k] = v;
  }
  await setCompanyConfig(companyId, stripAppSettingsKeys(settings));
}

/** Masked OpenAI/Google keys from appsettings.json (read-only in API). */
export function getAppSettingsForApi(): Record<string, string> {
  return {
    OPENAI_CONNECTION: config.openaiConnection ? maskSecretValue(config.openaiConnection) : '',
    GOOGLE_CONNECTION: config.googleConnection ? maskSecretValue(config.googleConnection) : '',
  };
}

export async function getCompanySettingsForApi(companyId: number): Promise<Record<string, string>> {
  const settings = await getCompanyConfig(companyId);
  const out: Record<string, string> = { ...getAppSettingsForApi() };
  for (const k of SETTINGS_KEYS) {
    const v = settings[k] ?? process.env[k] ?? '';
    if (!v) {
      out[k] = '';
      continue;
    }
    out[k] = isSecretSettingKey(k) ? maskSecretValue(v) : v;
  }
  return out;
}

export function getActiveSetting(key: string): string | null {
  const store = companyContext.getStore();
  if (store?.settings) return store.settings[key] ?? null;
  const companyId = getContextCompanyId();
  if (companyId) {
    if (getDriver() === 'postgres') {
      // PostgreSQL company settings are JSONB — use getActiveSettingAsync in async code paths.
      return null;
    }
    return getCompanyConfigJson(companyId)[key] ?? null;
  }
  return getLegacySetting(key);
}

/** Ensures company_configs settings are on the async context store (PostgreSQL scans). */
export async function ensureCompanySettingsInContext(): Promise<void> {
  const store = companyContext.getStore();
  if (!store || store.settings) return;
  const settings = await getCompanyConfig(store.companyId);
  store.settings = settings;
}

export async function getActiveSettingAsync(key: string): Promise<string | null> {
  const companyId = getContextCompanyId();
  if (companyId) {
    const settings = await getCompanyConfig(companyId);
    return settings[key] ?? null;
  }
  return getLegacySetting(key);
}
