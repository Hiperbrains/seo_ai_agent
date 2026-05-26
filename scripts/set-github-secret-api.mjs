#!/usr/bin/env node
/**
 * Set a GitHub Actions secret via REST API (no gh CLI).
 * Usage: GITHUB_TOKEN=ghp_xxx node scripts/set-github-secret-api.mjs APPSETTINGS_JSON appsettings.json
 */
import fs from 'fs';
import crypto from 'crypto';

const [secretName, filePath] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repo = process.env.GITHUB_REPOSITORY || 'Hiperbrains/seo_ai_agent';

if (!secretName || !filePath || !token) {
  console.error('Usage: GITHUB_TOKEN=... node scripts/set-github-secret-api.mjs NAME path/to/file.json');
  process.exit(1);
}

const value = fs.readFileSync(filePath, 'utf8');
const [owner, name] = repo.split('/');

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

const keyRes = await fetch(`https://api.github.com/repos/${owner}/${name}/actions/secrets/public-key`, {
  headers,
});
if (!keyRes.ok) throw new Error(`public-key: ${keyRes.status} ${await keyRes.text()}`);
const { key_id, key } = await keyRes.json();

import _sodium from 'libsodium-wrappers';
await _sodium.ready;
const binKey = _sodium.from_base64(key, _sodium.base64_variants.ORIGINAL);
const binMsg = _sodium.from_string(value);
const enc = _sodium.crypto_box_seal(binMsg, binKey);
const encrypted_value = _sodium.to_base64(enc, _sodium.base64_variants.ORIGINAL);

const putRes = await fetch(`https://api.github.com/repos/${owner}/${name}/actions/secrets/${secretName}`, {
  method: 'PUT',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ encrypted_value, key_id }),
});
if (!putRes.ok) throw new Error(`set secret: ${putRes.status} ${await putRes.text()}`);
console.log(`Set secret ${secretName} on ${owner}/${name}`);
