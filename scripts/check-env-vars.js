#!/usr/bin/env node
// Verifies that every process.env.VAR reference in server.js is documented
// in .env.example. An undocumented variable is a silent ops failure waiting
// to happen — the server runs in degraded mode with no warning.
'use strict';

const fs = require('fs');

const serverCode = fs.readFileSync('server.js', 'utf8');
const envExample = fs.readFileSync('.env.example', 'utf8');

// Vars that are intentionally absent from .env.example
const SKIP = new Set([
  'NODE_ENV',    // standard Node convention
  'DB_PATH',     // set by deployment, not user config
  'TEST_MODE',   // test harness only
]);

const serverVars = new Set();
const RE_SERVER = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
let m;
while ((m = RE_SERVER.exec(serverCode)) !== null) serverVars.add(m[1]);

const exampleVars = new Set();
const RE_EXAMPLE = /^([A-Z_][A-Z0-9_]*)=/gm;
while ((m = RE_EXAMPLE.exec(envExample)) !== null) exampleVars.add(m[1]);

let errors = 0;
for (const v of serverVars) {
  if (!SKIP.has(v) && !exampleVars.has(v)) {
    console.error(`server.js uses process.env.${v} but it is not documented in .env.example`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\n${errors} undocumented env var(s). Add them to .env.example.`);
  process.exit(1);
}

console.log(`env-vars: ok (${serverVars.size} references, all in .env.example)`);
