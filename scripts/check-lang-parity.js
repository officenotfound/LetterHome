#!/usr/bin/env node
// Verifies that every EN translation key has a FR equivalent and vice versa.
// A missing key causes the UI to silently fall back to the raw key string.
'use strict';

const fs = require('fs');

const content = fs.readFileSync('public/lang.js', 'utf8');

const enStart = content.indexOf('\n    en: {');
const frStart = content.indexOf('\n    fr: {');

if (enStart === -1 || frStart === -1) {
  console.error('check-lang-parity: could not locate en/fr sections in lang.js');
  process.exit(1);
}

const enSection = content.slice(enStart, frStart);
const frSection = content.slice(frStart);

// Match translation keys — must contain at least one dot to distinguish from
// JS property names like 'en', 'fr', etc.
const KEY_RE = /['"]([\w-]+(?:\.[\w-]+)+)['"]\s*:/g;

function extractKeys(section) {
  const keys = new Set();
  let m;
  while ((m = KEY_RE.exec(section)) !== null) keys.add(m[1]);
  KEY_RE.lastIndex = 0;
  return keys;
}

const enKeys = extractKeys(enSection);
const frKeys = extractKeys(frSection);

let errors = 0;

for (const k of enKeys) {
  if (!frKeys.has(k)) {
    console.error(`Missing FR translation: '${k}'`);
    errors++;
  }
}
for (const k of frKeys) {
  if (!enKeys.has(k)) {
    console.error(`Extra FR key with no EN equivalent: '${k}'`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\n${errors} translation key mismatch(es) found.`);
  process.exit(1);
}

console.log(`lang-parity: ok (${enKeys.size} EN keys, ${frKeys.size} FR keys)`);
