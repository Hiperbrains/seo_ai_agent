import fs from 'fs';
import path from 'path';

/** PNG shipped at `backend/assets/ai-seo-agent-logo.png` (works from `src` via tsx and from `dist` after `tsc`). */
export function resolveBrandLogoPath(): string | null {
  const candidates = [
    path.join(__dirname, '..', '..', 'assets', 'ai-seo-agent-logo.png'),
    path.join(process.cwd(), 'assets', 'ai-seo-agent-logo.png'),
    path.join(process.cwd(), 'backend', 'assets', 'ai-seo-agent-logo.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Optional HTTPS URL for clickable logo in PDFs and emails (no trailing slash). */
export function getPublicAppUrl(): string | undefined {
  const raw = process.env.PUBLIC_APP_URL || process.env.WEB_APP_URL;
  if (!raw || !/^https?:\/\//i.test(raw.trim())) return undefined;
  return raw.trim().replace(/\/+$/, '');
}
