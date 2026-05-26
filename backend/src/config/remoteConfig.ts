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

function pickOpenAiConnection(data: JsonRecord): string {
  const conn = (data.ConnectionStrings || data.connectionStrings) as JsonRecord | undefined;
  return (
    pickString(conn, 'OpenAI', 'openAI') ||
    pickString(data.OpenAI as JsonRecord | undefined, 'Connection', 'SecretKey', 'ApiKey') ||
    pickString(data, 'OPENAI_CONNECTION', 'OPENAI_SECRET_KEY', 'OPENAI_API_KEY')
  );
}

function pickGoogleConnection(data: JsonRecord): string {
  const conn = (data.ConnectionStrings || data.connectionStrings) as JsonRecord | undefined;
  return (
    pickString(conn, 'Google', 'google') ||
    pickString(data.Google as JsonRecord | undefined, 'Connection', 'SecretKey', 'ApiKey') ||
    pickString(data, 'GOOGLE_CONNECTION', 'GOOGLE_SECRET_KEY', 'GOOGLE_API_KEY')
  );
}

function writeAppSettings(data: JsonRecord): void {
  const openAi = pickOpenAiConnection(data);
  const google = pickGoogleConnection(data);
  const connRemote = (data.ConnectionStrings || data.connectionStrings) as JsonRecord | undefined;
  const hiperbrains =
    pickString(connRemote, 'Hiperbrains', 'hiperbrains') || pickString(data, 'HIPERBRAINS_DATABASE');

  const target = path.resolve(process.cwd(), 'appsettings.json');
  let existing: JsonRecord = {};
  if (fs.existsSync(target)) {
    try {
      existing = JSON.parse(fs.readFileSync(target, 'utf8')) as JsonRecord;
    } catch {
      existing = {};
    }
  }
  const existingConn = (existing.ConnectionStrings || {}) as JsonRecord;
  if (!openAi && !google && !hiperbrains) return;

  const connectionStrings: JsonRecord = { ...existingConn };
  if (hiperbrains) connectionStrings.Hiperbrains = hiperbrains;
  if (openAi) connectionStrings.OpenAI = openAi;
  if (google) connectionStrings.Google = google;

  const file = { ConnectionStrings: connectionStrings };
  fs.writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  logger.info('Merged appsettings.json from remote config');
}

function applyRemoteJson(data: JsonRecord): void {
  const conn = (data.ConnectionStrings || data.connectionStrings) as JsonRecord | undefined;
  const hiperbrains =
    pickString(conn, 'Hiperbrains', 'hiperbrains') ||
    pickString(data, 'HIPERBRAINS_DATABASE', 'DATABASE_CONNECTION_STRING') ||
    pickString(data, 'ConnectionStrings:Hiperbrains');

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
