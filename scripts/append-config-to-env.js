#!/usr/bin/env node
/**
 * Deploy helper: fetch CONFIG_URL JSON and append DB/JWT lines to .env
 * Usage: CONFIG_URL=https://... node scripts/append-config-to-env.js .env
 */
const fs = require('fs');
const https = require('https');
const http = require('http');

const configUrl = process.env.CONFIG_URL || process.env.ConfigUrl;
const envPath = process.argv[2] || '.env';

if (!configUrl) {
  console.log('No CONFIG_URL set; skipping remote config');
  process.exit(0);
}

function get(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, { headers: { Accept: 'application/json' } }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          resolve(body);
        });
      })
      .on('error', reject);
  });
}

function pick(obj, ...keys) {
  if (!obj) return '';
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

(async () => {
  const raw = await get(configUrl);
  const data = JSON.parse(raw);
  const conn = data.ConnectionStrings || data.connectionStrings || {};
  const lines = [];

  const hiperbrains = pick(conn, 'Hiperbrains', 'hiperbrains') || pick(data, 'HIPERBRAINS_DATABASE');
  if (hiperbrains) lines.push(`HIPERBRAINS_DATABASE=${hiperbrains}`);

  const dbUrl = pick(data, 'DATABASE_URL', 'databaseUrl');
  if (dbUrl) lines.push(`DATABASE_URL=${dbUrl}`);

  const jwt = pick(data, 'JWT_SECRET', 'jwtSecret');
  if (jwt) lines.push(`JWT_SECRET=${jwt}`);

  if (lines.length) {
    fs.appendFileSync(envPath, `\n# From config server\n${lines.join('\n')}\n`);
    console.log('Appended to .env:', lines.map((l) => l.split('=')[0]).join(', '));
  } else {
    console.log('Config server returned no database settings');
  }

  const openAi = pick(data.OpenAI, 'ApiKey') || pick(data, 'OPENAI_API_KEY');
  const google = pick(data.Google, 'ApiKey') || pick(data, 'GOOGLE_API_KEY');
  if (openAi || google) {
    fs.writeFileSync(
      'appsettings.json',
      JSON.stringify({ OpenAI: { ApiKey: openAi || '' }, Google: { ApiKey: google || '' } }, null, 2)
    );
    console.log('Wrote appsettings.json from config server');
  }
})().catch((e) => {
  console.error('Config fetch failed:', e.message);
  process.exit(1);
});
