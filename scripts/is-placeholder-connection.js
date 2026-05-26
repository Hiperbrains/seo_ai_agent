#!/usr/bin/env node
/** Returns 0 if connection string looks like a real deploy config, 1 if placeholder/empty. */
const raw = (process.argv[2] || '').trim();
if (!raw) process.exit(1);
const u = raw.toUpperCase();
if (/SERVER=HOST\b/.test(u)) process.exit(1);
if (/USER ID=USER\b|USER=USER\b/.test(u)) process.exit(1);
if (/PASSWORD=SECRET\b/.test(u)) process.exit(1);
process.exit(0);
