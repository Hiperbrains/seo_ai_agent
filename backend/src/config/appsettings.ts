import fs from 'fs';
import path from 'path';

export interface AppSettingsFile {
  OpenAI?: { ApiKey?: string };
  Google?: { ApiKey?: string };
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

/** OpenAI + Google keys — always from appsettings.json (never company_configs DB). */
export function loadAppSettings(): { openaiApiKey: string; googleApiKey: string } {
  const file = readAppSettingsFile();
  const openaiApiKey = (
    file.OpenAI?.ApiKey ||
    file.OPENAI_API_KEY ||
    ''
  ).trim();
  const googleApiKey = (
    file.Google?.ApiKey ||
    file.GOOGLE_API_KEY ||
    ''
  ).trim();
  return { openaiApiKey, googleApiKey };
}
