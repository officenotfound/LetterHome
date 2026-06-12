#!/usr/bin/env node
/**
 * Replace the inline <nav>...</nav> on every page with the shared header
 * placeholder + script, so the header lives only in public/header.js.
 * Mirrors how the footer is wired (footer.js).
 *
 * header.js is loaded WITHOUT defer, right after the placeholder, so the
 * sticky nav paints immediately (no flash).
 */
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '../public');

const PLACEHOLDER = '<div id="site-header"></div>\n<script src="/header.js"></script>';

const files = fs.readdirSync(pub).filter(f => f.endsWith('.html'));
let count = 0;
const warn = [];

for (const file of files) {
  const fp = path.join(pub, file);
  let html = fs.readFileSync(fp, 'utf8');

  if (html.includes('id="site-header"')) { warn.push(`already wired: ${file}`); continue; }
  if (!/<nav>[\s\S]*?<\/nav>/.test(html)) { warn.push(`no <nav>: ${file}`); continue; }

  html = html.replace(/<nav>[\s\S]*?<\/nav>/, () => PLACEHOLDER);
  fs.writeFileSync(fp, html);
  count++;
}

console.log(`Wired header placeholder into ${count} pages`);
if (warn.length) console.log('Notes:\n  ' + warn.join('\n  '));
