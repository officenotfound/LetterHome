#!/usr/bin/env node
// Validates that every data-i18n and data-i18n-aria key used in HTML files
// exists in both the EN and FR dictionaries in lang.js.
// A missing key causes the UI to silently display the raw key string.
'use strict';

const fs = require('fs');
const path = require('path');

const langContent = fs.readFileSync('public/lang.js', 'utf8');

const enStart = langContent.indexOf('\n    en: {');
const frStart = langContent.indexOf('\n    fr: {');

const enSection = langContent.slice(enStart, frStart);
const frSection = langContent.slice(frStart);

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

const htmlFiles = fs.readdirSync('public').filter(f => f.endsWith('.html'));
const REF_RE = /data-i18n(?:-aria)?="([^"]+)"/g;

let errors = 0;

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join('public', file), 'utf8');
  let m;
  while ((m = REF_RE.exec(html)) !== null) {
    const key = m[1];
    const lineNum = html.slice(0, m.index).split('\n').length;
    if (!enKeys.has(key)) {
      console.error(`${file}:${lineNum}: data-i18n key '${key}' missing from EN dictionary`);
      errors++;
    }
    if (!frKeys.has(key)) {
      console.error(`${file}:${lineNum}: data-i18n key '${key}' missing from FR dictionary`);
      errors++;
    }
  }
  REF_RE.lastIndex = 0;
}

if (errors > 0) {
  console.error(`\n${errors} missing i18n key reference(s).`);
  process.exit(1);
}

console.log(`i18n-refs: ok (${htmlFiles.length} HTML files checked)`);
