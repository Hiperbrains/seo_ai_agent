import { getSetting } from './db.service';

export interface SerpLiveRankResult {
  keyword: string;
  targetDomain: string;
  location: string;
  device: 'desktop' | 'mobile';
  found: boolean;
  position: number | null;
  matchedUrl: string | null;
  topResults: Array<{ position: number; title: string; link: string; snippet: string }>;
}

type SerpResultItem = { position: number; title: string; link: string; snippet: string };
export type ExternalTrendSignal = { keyword: string; source: 'serpapi_related'; confidence: number };

function getSerpApiKey(): string {
  return getSetting('SERPAPI_KEY') || process.env.SERPAPI_KEY || '';
}

function normDomain(input: string): string {
  const s = input.trim().toLowerCase();
  if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return s.replace(/^https?:\/\//i, '').replace(/^www\./, '').replace(/\/.*$/, '');
  }
}

export async function fetchSerpLiveRank(params: {
  keyword: string;
  targetDomain: string;
  location?: string;
  device?: 'desktop' | 'mobile';
  num?: number;
}): Promise<SerpLiveRankResult> {
  const apiKey = getSerpApiKey();
  if (!apiKey) throw new Error('Missing SERPAPI_KEY');
  const keyword = params.keyword.trim();
  const targetDomain = normDomain(params.targetDomain);
  if (!keyword) throw new Error('keyword is required');
  if (!targetDomain) throw new Error('targetDomain is required');
  const location = (params.location || 'India').trim();
  const device = params.device === 'mobile' ? 'mobile' : 'desktop';
  const num = Math.max(10, Math.min(100, Number(params.num) || 30));

  const qs = new URLSearchParams({
    engine: 'google',
    q: keyword,
    location,
    google_domain: 'google.com',
    gl: 'in',
    hl: 'en',
    num: String(num),
    api_key: apiKey,
  });
  if (device === 'mobile') qs.set('device', 'mobile');

  const resp = await fetch(`https://serpapi.com/search.json?${qs.toString()}`, {
    method: 'GET',
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`SerpAPI error (${resp.status})`);
  const json = (await resp.json()) as any;
  const organic = Array.isArray(json?.organic_results) ? json.organic_results : [];
  const topResults: SerpResultItem[] = organic.slice(0, num).map((r: any) => ({
    position: Number(r.position || 0),
    title: String(r.title || ''),
    link: String(r.link || ''),
    snippet: String(r.snippet || ''),
  }));
  const match = topResults.find((r: SerpResultItem) => normDomain(r.link) === targetDomain);
  return {
    keyword,
    targetDomain,
    location,
    device,
    found: Boolean(match),
    position: match?.position ?? null,
    matchedUrl: match?.link ?? null,
    topResults,
  };
}

export async function testSerpApiConnection(keyword = 'seo audit tools'): Promise<{
  ok: boolean;
  checkedKeyword: string;
  organicCount: number;
}> {
  const r = await fetchSerpLiveRank({
    keyword,
    targetDomain: 'google.com',
    location: 'India',
    device: 'desktop',
    num: 10,
  });
  return {
    ok: true,
    checkedKeyword: keyword,
    organicCount: r.topResults.length,
  };
}

export async function fetchTrendSeedKeywords(
  seeds: string[],
  location = 'India'
): Promise<ExternalTrendSignal[]> {
  const apiKey = getSerpApiKey();
  if (!apiKey) return [];
  const cleanedSeeds = [...new Set(seeds.map((s) => s.trim()).filter((s) => s.length >= 3))].slice(0, 3);
  const out = new Map<string, ExternalTrendSignal>();
  for (const seed of cleanedSeeds) {
    const qs = new URLSearchParams({
      engine: 'google',
      q: `${seed} trends`,
      location,
      google_domain: 'google.com',
      gl: 'in',
      hl: 'en',
      num: '10',
      api_key: apiKey,
    });
    try {
      const resp = await fetch(`https://serpapi.com/search.json?${qs.toString()}`, {
        method: 'GET',
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) continue;
      const json = (await resp.json()) as any;
      const suggestions: string[] = [];
      for (const q of Array.isArray(json?.related_questions) ? json.related_questions : []) {
        const question = String(q?.question || '').trim();
        if (question) suggestions.push(question);
      }
      for (const r of Array.isArray(json?.related_searches) ? json.related_searches : []) {
        const query = String(r?.query || '').trim();
        if (query) suggestions.push(query);
      }
      for (const s of suggestions) {
        const key = s.toLowerCase();
        if (!out.has(key)) out.set(key, { keyword: s, source: 'serpapi_related', confidence: 60 });
      }
    } catch {
      // Do not fail scan if external trend signal fetch fails.
    }
  }
  return [...out.values()].slice(0, 20);
}

