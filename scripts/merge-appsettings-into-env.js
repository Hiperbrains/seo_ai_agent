#!/usr/bin/env node
/**
 * Reads appsettings.json ConnectionStrings into .env for Docker (--env-file).
 * Usage: node scripts/merge-appsettings-into-env.js [appsettings.json] [.env]
 */
const fs = require('fs');
const path = require('path');

const settingsPath = path.resolve(process.argv[2] || 'appsettings.json');
const envPath = path.resolve(process.argv[3] || '.env');

function upsertEnv(lines, key, value) {
  if (!value) return lines;
  const prefix = `${key}=`;
  const filtered = lines.filter((l) => !l.startsWith(prefix));
  filtered.push(`${prefix}${value}`);
  return filtered;
}

function readEnvLines() {
  if (!fs.existsSync(envPath)) return [];
  return fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0);
}

if (!fs.existsSync(settingsPath)) {
  console.log(`No ${settingsPath}; skipping appsettings → .env merge`);
  process.exit(0);
}

let file;
try {
  file = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (e) {
  console.error('Invalid appsettings.json:', e.message);
  process.exit(1);
}

const conn = file.ConnectionStrings || file.connectionStrings || {};
const hiperbrains = (conn.Hiperbrains || conn.hiperbrains || '').trim();

function isPlaceholderConnection(s) {
  if (!s) return true;
  const u = s.toUpperCase();
  return /SERVER=HOST\b/.test(u) || /USER ID=USER\b/.test(u) || /PASSWORD=SECRET\b/.test(u);
}

let lines = readEnvLines();
if (hiperbrains && !isPlaceholderConnection(hiperbrains)) {
  lines = upsertEnv(lines, 'HIPERBRAINS_DATABASE', hiperbrains);
  console.log('Merged ConnectionStrings.Hiperbrains into .env');
} else if (hiperbrains) {
  lines = lines.filter((l) => !l.startsWith('HIPERBRAINS_DATABASE=') && !l.startsWith('DATABASE_URL='));
  console.log('WARN: Skipping placeholder ConnectionStrings.Hiperbrains (set APPSETTINGS_JSON secret)');
} else {
  console.log('WARN: appsettings.json has no ConnectionStrings.Hiperbrains');
}

const body = `${lines.join('\n')}\n`;
fs.writeFileSync(envPath, body, 'utf8');
