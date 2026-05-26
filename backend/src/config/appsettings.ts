import fs from 'fs';
import path from 'path';

export interface ConnectionStrings {
  Hiperbrains?: string;
  ConnectionStringRoomService?: string;
  OpenAI?: string;
  Google?: string;
}

export interface AppSettingsFile {
  ConnectionStrings?: ConnectionStrings;
  /** @deprecated Use ConnectionStrings.OpenAI */
  OpenAI?: { Connection?: string; SecretKey?: string; ApiKey?: string };
  /** @deprecated Use ConnectionStrings.Google */
  Google?: { Connection?: string; SecretKey?: string; ApiKey?: string };
  OPENAI_CONNECTION?: string;
  GOOGLE_CONNECTION?: string;
  OPENAI_SECRET_KEY?: string;
  GOOGLE_SECRET_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
}

const APPSETTINGS_CANDIDATES = [
  path.resolve(process.cwd(), 'appsettings.json'),
  path.resolve(process.cwd(), '..', 'appsettings.json'),
  path.resolve(__dirname, '../../appsettings.json'),
  path.resolve(__dirname, '../../../appsettings.json'),
  path.resolve(process.cwd(), 'appsettings.example.json'),
  path.resolve(process.cwd(), '..', 'appsettings.example.json'),
];

function readAppSettingsFile(): AppSettingsFile {
  const filePath = APPSETTINGS_CANDIDATES.find((p) => fs.existsSync(p));
  if (!filePath) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as AppSettingsFile;
  } catch {
    return {};
  }
}

function pickLegacyOpenAi(file: AppSettingsFile): string {
  return (
    file.OpenAI?.Connection ||
    file.OpenAI?.SecretKey ||
    file.OpenAI?.ApiKey ||
    file.OPENAI_CONNECTION ||
    file.OPENAI_SECRET_KEY ||
    file.OPENAI_API_KEY ||
    ''
  ).trim();
}

function pickLegacyGoogle(file: AppSettingsFile): string {
  return (
    file.Google?.Connection ||
    file.Google?.SecretKey ||
    file.Google?.ApiKey ||
    file.GOOGLE_CONNECTION ||
    file.GOOGLE_SECRET_KEY ||
    file.GOOGLE_API_KEY ||
    ''
  ).trim();
}

/** OpenAI + Google connections — always from appsettings.json (never company_configs DB). */
export function loadAppSettings(): {
  openaiConnection: string;
  googleConnection: string;
  hiperbrainsDatabase: string;
  connectionStringRoomService: string;
} {
  const file = readAppSettingsFile();
  const conn = file.ConnectionStrings || {};
  const openaiConnection = (conn.OpenAI || pickLegacyOpenAi(file)).trim();
  const googleConnection = (conn.Google || pickLegacyGoogle(file)).trim();
  const hiperbrainsDatabase = (conn.Hiperbrains || '').trim();
  const connectionStringRoomService = (conn.ConnectionStringRoomService || '').trim();
  return { openaiConnection, googleConnection, hiperbrainsDatabase, connectionStringRoomService };
}
