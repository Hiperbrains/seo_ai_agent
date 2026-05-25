import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

type JsonRecord = Record<string, unknown>;

function pickString(obj: JsonRecord | undefined, ...keys: string[]): string {
  if (!obj) return '';
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function applyEnv(key: string, value: string): void {
  if (!value || process.env[key]?.trim()) return;
  process.env[key] = value;
}

function writeAppSettings(data: JsonRecord): void {
  const openAi = pickString(
    data.OpenAI as JsonRecord | undefined,
    'ApiKey'
  ) || pickString(data, 'OPENAI_API_KEY');
  const google = pickString(
    data.Google as JsonRecord | undefined,
    'ApiKey'
  ) || pickString(data, 'GOOGLE_API_KEY');
  if (!openAi && !google) return;

  const file = {
    OpenAI: { ApiKey: openAi },
    Google: { ApiKey: google },
  };
  const target = path.resolve(process.cwd(), 'appsettings.json');
  fs.writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  logger.info('Wrote appsettings.json from remote config');
}

function applyRemoteJson(data: JsonRecord): void {
  const conn = (data.ConnectionStrings || data.connectionStrings) as JsonRecord | undefined;
  const hiperbrains =
    pickString(conn, 'Hiperbrains', 'hiperbrains') ||
    pickString(data, 'HIPERBRAINS_DATABASE', 'DATABASE_CONNECTION_STRING');

  applyEnv('HIPERBRAINS_DATABASE', hiperbrains);
  applyEnv('DATABASE_URL', pickString(data, 'DATABASE_URL', 'databaseUrl'));
  applyEnv('JWT_SECRET', pickString(data, 'JWT_SECRET', 'jwtSecret'));
  applyEnv('JWT_EXPIRES_IN', pickString(data, 'JWT_EXPIRES_IN', 'jwtExpiresIn'));
  applyEnv('GITHUB_TOKEN', pickString(data, 'GITHUB_TOKEN', 'githubToken'));
  applyEnv('GITHUB_REPO', pickString(data, 'GITHUB_REPO', 'githubRepo'));

  writeAppSettings(data);
}

/** Fetch CONFIG_URL / ConfigUrl (Hiperbrains config server) before DB init. */
export async function loadRemoteConfig(): Promise<void> {
  const url = process.env.ConfigUrl?.trim() || process.env.CONFIG_URL?.trim();
  if (!url) return;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      logger.warn('Remote config fetch failed', { url, status: res.status });
      return;
    }
    const data = (await res.json()) as JsonRecord;
    applyRemoteJson(data);
    logger.info('Remote config loaded', {
      hasDatabase: !!(process.env.DATABASE_URL || process.env.HIPERBRAINS_DATABASE),
    });
  } catch (e) {
    logger.warn('Remote config unavailable', {
      url,
      error: String(e instanceof Error ? e.message : e),
    });
  }
}
