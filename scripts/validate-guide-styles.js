#!/usr/bin/env node
/**
 * Guards the guide-page template against the two regressions that have
 * broken pages before. Runs as a pre-push hook and in CI.
 *
 * Any page built on the canonical `.page` content wrapper must:
 *   1. ship the shared inline design system (Source Serif 4 + .page rule
 *      + .eyebrow), so it renders correctly even if guide.css is stale;
 *   2. NOT use the legacy `.guide-wrap` wrapper; and
 *   3. NOT wrap its breadcrumb in a second <nav>, which inherits the
 *      sticky site-header styling and collides with the real header.
 *
 * Usage: node scripts/validate-guide-styles.js
 */
const fs = require('fs');
const path = require('path');

const REQUIRED = [
  "Source Serif 4",   // body font, proves the inline block is present
  ".eyebrow{",        // canonical eyebrow label
];

const pubDir = path.join(__dirname, '../public');
let errors = 0;

for (const file of fs.readdirSync(pubDir).sort()) {
  if (!file.endsWith('.html')) continue;
  const html = fs.readFileSync(path.join(pubDir, file), 'utf8');

  // A canonical guide/country page is one that defines the .page content
  // wrapper inline. The guides index and marketing pages don't, and are skipped.
  if (!html.includes('.page{max-width:780px')) continue;

  const missing = REQUIRED.filter(s => !html.includes(s));
  if (html.includes('class="guide-wrap"')) missing.push('LEGACY .guide-wrap wrapper (use .page)');
  if (html.includes('<nav class="breadcrumb"')) missing.push('LEGACY <nav class="breadcrumb"> (collides with site header)');

  if (missing.length) {
    console.error(`❌ ${file} — ${missing.join(', ')}`);
    errors++;
  }
}

if (errors) {
  console.error(`\n${errors} guide page(s) off the canonical template.`);
  console.error('Rebuild with scripts/unify-guides.js or the canonical inline block.');
  process.exit(1);
} else {
  console.log('✅ All guide pages use the canonical template.');
}

// ── Header/footer wiring guard ───────────────────────────────────────────────
// The header and footer must come only from header.js / footer.js. No page may
// hardcode its own <nav> header or reintroduce a divergent footer.
let wireErrors = 0;
for (const file of fs.readdirSync(pubDir).sort()) {
  if (!file.endsWith('.html')) continue;
  const html = fs.readFileSync(path.join(pubDir, file), 'utf8');
  if (!/<body[ >]/.test(html)) continue;

  const problems = [];
  if (!html.includes('id="site-header"')) problems.push('missing <div id="site-header"> placeholder');
  if (!html.includes('id="site-footer"')) problems.push('missing <footer id="site-footer"> placeholder');
  if (/<nav[ >]/.test(html)) problems.push('hardcoded <nav> (header must come from header.js)');

  if (problems.length) {
    console.error(`❌ ${file} — ${problems.join('; ')}`);
    wireErrors++;
  }
}

if (wireErrors) {
  console.error(`\n${wireErrors} page(s) not using the shared header/footer.`);
  console.error('Use <div id="site-header"></div> + header.js and <footer id="site-footer"></footer> + footer.js.');
  process.exit(1);
} else {
  console.log('✅ Every page uses the shared header.js + footer.js.');
}
