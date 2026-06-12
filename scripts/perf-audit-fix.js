#!/usr/bin/env node
/**
 * Performance audit fixes — applied to all HTML pages.
 * Changes (no aesthetic impact):
 *   1. Add defer to <script src="/theme.js">
 *   2. Add defer to <script src="/lang.js">
 *   3. Add ?v=1 to /fonts.css where not already versioned
 *   4. Add ?v=1 to /theme.js where not already versioned
 *   5. Add font preload (Source Serif 4 Regular Latin) after <meta charset>
 *   6. Add dns-prefetch for googletagmanager in <head>
 */
const fs   = require('fs');
const path = require('path');

const pubDir = path.join(__dirname, '../public');
const files  = fs.readdirSync(pubDir).filter(f => f.endsWith('.html'));

const FONT_PRELOAD = '<link rel="preload" as="font" type="font/woff2" href="/fonts/vEFI2_tTDB4M7-auWDN0ahZJW1gb8tc.woff2" crossorigin>';
const PRECONNECT   = '<link rel="dns-prefetch" href="https://www.googletagmanager.com">';
const HEAD_HINTS   = `${FONT_PRELOAD}\n${PRECONNECT}`;

let stats = { defer_theme:0, defer_lang:0, version_fonts:0, version_themejs:0, preload:0, preconnect:0 };

for (const file of files) {
  const fp = path.join(pubDir, file);
  let html = fs.readFileSync(fp, 'utf8');
  let changed = false;

  // 1. defer theme.js (only where not already deferred)
  if (html.includes('src="/theme.js"') && !html.includes('src="/theme.js" defer')) {
    html = html.replace(/(<script src="\/theme\.js")(>)/g, '$1 defer$2');
    stats.defer_theme++;
    changed = true;
  }

  // 2. defer lang.js (only where not already deferred)
  if (html.includes('src="/lang.js"') && !html.includes('src="/lang.js" defer')) {
    html = html.replace(/(<script src="\/lang\.js")(>)/g, '$1 defer$2');
    stats.defer_lang++;
    changed = true;
  }

  // 3. version fonts.css (add ?v=1 where not already versioned)
  if (html.includes('href="/fonts.css"') && !html.includes('href="/fonts.css?')) {
    html = html.replace(/href="\/fonts\.css"/g, 'href="/fonts.css?v=1"');
    stats.version_fonts++;
    changed = true;
  }

  // 4. version theme.js src (add ?v=1 where not already versioned)
  if (html.includes('src="/theme.js') && !html.includes('src="/theme.js?')) {
    html = html.replace(/src="\/theme\.js( defer)?"/g, (m, d) => `src="/theme.js?v=1"${d||''}`);
    // Re-apply defer if it was there
    html = html.replace(/src="\/theme\.js\?v=1" defer/g, 'src="/theme.js?v=1" defer');
    stats.version_themejs++;
    changed = true;
  }

  // 5 & 6. Add preload + dns-prefetch after <meta charset> if not already present
  if (!html.includes('vEFI2_tTDB4M7-auWDN0ahZJW1gb8tc.woff2')) {
    html = html.replace(/<meta charset="UTF-8">/, `<meta charset="UTF-8">\n${HEAD_HINTS}`);
    stats.preload++;
    stats.preconnect++;
    changed = true;
  } else if (!html.includes('dns-prefetch')) {
    html = html.replace(/<meta charset="UTF-8">/, `<meta charset="UTF-8">\n${PRECONNECT}`);
    stats.preconnect++;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(fp, html);
    console.log(`✅ ${file}`);
  }
}

console.log('\n── Summary ──────────────────────────────');
console.log(`  defer theme.js:       ${stats.defer_theme} pages`);
console.log(`  defer lang.js:        ${stats.defer_lang} pages`);
console.log(`  version fonts.css:    ${stats.version_fonts} pages`);
console.log(`  version theme.js:     ${stats.version_themejs} pages`);
console.log(`  font preload added:   ${stats.preload} pages`);
console.log(`  dns-prefetch added:   ${stats.preconnect} pages`);
console.log(`  Total files changed:  ${files.filter(f => {
  const fp = path.join(pubDir, f);
  const html = fs.readFileSync(fp, 'utf8');
  return html.includes('vEFI2_tTDB4M7-auWDN0ahZJW1gb8tc.woff2');
}).length} pages now have font preload`);
