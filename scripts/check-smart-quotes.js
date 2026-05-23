#!/usr/bin/env node
// Detects U+2018 LEFT SINGLE QUOTATION MARK in JS source files.
// This character is never valid in JS syntax and appears only when an editor
// autocorrects a straight quote — silently breaking the script at runtime.
'use strict';

const fs = require('fs');

const FILES = [
  'server.js',
  'public/lang.js',
  'public/theme.js',
  'tests/server.test.js',
];

let errors = 0;

for (const file of FILES) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (let j = 0; j < line.length; j++) {
      if (line.charCodeAt(j) === 0x2018) {
        console.error(`${file}:${i + 1}:${j + 1}: U+2018 left curly quote — editor autocorrect corrupted a string delimiter`);
        errors++;
      }
    }
  });
}

if (errors > 0) {
  console.error(`\n${errors} curly quote(s) found. Replace with straight single quotes.`);
  process.exit(1);
}

console.log(`smart-quotes: ok (${FILES.length} files checked)`);
