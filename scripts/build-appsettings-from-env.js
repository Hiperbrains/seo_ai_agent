#!/usr/bin/env node
/**
 * Writes appsettings.json from CI env (HIPERBRAINS_DATABASE, OPENAI_API_KEY, etc.).
 * Usage: node scripts/build-appsettings-from-env.js [output-path]
 */
const fs = require('fs');
const path = require('path');

const out = path.resolve(process.argv[2] || 'appsettings.json');
const hiperbrains = (process.env.HIPERBRAINS_DATABASE || '').trim();
const openAi = (process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY || '').trim();
const google = (process.env.GOOGLE_API_KEY || '').trim();

if (!hiperbrains) {
  console.error('HIPERBRAINS_DATABASE env is empty');
  process.exit(1);
}

const file = {
  OpenAI: { ApiKey: openAi },
  Google: { ApiKey: google },
  ConnectionStrings: {
    Hiperbrains: hiperbrains,
    ConnectionStringRoomService: (process.env.CONNECTION_STRING_ROOM_SERVICE || '').trim(),
  },
};

fs.writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
console.log(`Wrote ${out} (${fs.statSync(out).size} bytes) with ConnectionStrings.Hiperbrains`);
