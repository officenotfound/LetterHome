#!/usr/bin/env node
/**
 * Validates that every HTML page using .guide-wrap has the required
 * inline style block. Run as a pre-push hook or in CI.
 *
 * Usage: node scripts/validate-guide-styles.js
 */
const fs = require('fs');
const path = require('path');

const REQUIRED = [
  "Source Serif 4",
  ".guide-wrap{max-width",
  ".answer-capsule{",
  ".comparison-table{",
];

const pubDir = path.join(__dirname, '../public');
let errors = 0;

for (const file of fs.readdirSync(pubDir).sort()) {
  if (!file.endsWith('.html')) continue;
  const fp = path.join(pubDir, file);
  const html = fs.readFileSync(fp, 'utf8');
  if (!html.includes('class="guide-wrap"')) continue;

  const missing = REQUIRED.filter(s => !html.includes(s));
  if (missing.length) {
    console.error(`❌ ${file} — missing inline styles: ${missing.join(', ')}`);
    errors++;
  }
}

if (errors) {
  console.error(`\n${errors} page(s) missing required inline styles.`);
  console.error('Run scripts/fix-guide-wrap.js or add the full inline <style> block.');
  process.exit(1);
} else {
  console.log(`✅ All guide pages have required inline styles.`);
}
