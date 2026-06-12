#!/usr/bin/env node
/**
 * Unify all new guide pages onto the OLD page template.
 * - Replaces the divergent inline <style> block with the canonical one
 *   (lifted from mail-a-letter-online.html, extended with answer-capsule
 *   and comparison-table component styles).
 * - Renames the wrapper class .guide-wrap -> .page
 * - Replaces <nav class="breadcrumb">...</nav> with <div class="eyebrow">Guide</div>
 * - Inserts an "Updated June 2026" line after the answer capsule.
 * Body content (h1, capsule text, tables, lists, FAQs) is preserved.
 */
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '../public');

const CANON = `:root {
  --kraft: #f1ebde; --kraft-deep: #e1d6bd; --paper: #faf6ec;
  --ink: #2a2a2a; --ink-soft: #3a3835; --ink-muted: #6b6258; --ink-faint: #968b7d;
  --red: #a8472d; --red-deep: #7d3220; --line: rgba(42,42,42,0.14);
  --shadow-card: 0 2px 6px rgba(42,42,42,0.06), 0 14px 40px rgba(42,42,42,0.1);
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Source Serif 4',Georgia,serif;background:var(--kraft);color:var(--ink);line-height:1.6;font-size:16px}
nav{position:sticky;top:0;z-index:100;background:rgba(241,235,222,0.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.nav-inner{max-width:1100px;margin:0 auto;padding:18px 32px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.logo{display:flex;align-items:center;gap:10px;font-family:'DM Serif Display',serif;font-size:24px;color:var(--ink);text-decoration:none}
.btn{display:inline-block;padding:11px 22px;border-radius:2px;font-weight:500;font-size:13px;text-decoration:none;transition:all 0.2s;border:none;cursor:pointer;font-family:inherit;letter-spacing:0.04em;text-transform:uppercase}
.btn-red{background:var(--red);color:var(--paper);border:2px dashed white}
.btn-red:hover{background:var(--red-deep);transform:translateY(-1px)}
.page{max-width:780px;margin:0 auto;padding:56px 32px 80px}
.eyebrow{display:inline-flex;align-items:center;gap:12px;font-family:'DM Mono',monospace;font-size:12px;text-transform:uppercase;letter-spacing:0.18em;color:var(--red);font-weight:500;margin-bottom:18px}
.eyebrow::before,.eyebrow::after{content:'';width:32px;height:1px;background:var(--red)}
h1{font-family:'DM Serif Display',serif;font-size:clamp(28px,5vw,44px);line-height:1.15;letter-spacing:-0.02em;margin-bottom:14px}
.updated{font-family:'DM Mono',monospace;font-size:12px;letter-spacing:0.06em;color:var(--ink-faint);margin-bottom:24px}
.answer{font-size:18px;color:var(--ink-soft);line-height:1.65;margin-bottom:18px;max-width:660px}
.answer strong{color:var(--ink)}
.answer-capsule{background:#f0f7f0;border-left:4px solid #2a7a2a;padding:.85rem 1.1rem;margin:.5rem 0 1.8rem;border-radius:0 4px 4px 0;font-size:1rem;line-height:1.65;color:var(--ink)}
.answer-capsule strong{color:var(--ink)}
.cta-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:32px 0 8px}
.price-note{font-family:'DM Mono',monospace;font-size:13px;color:var(--ink-muted)}
h2{font-family:'DM Serif Display',serif;font-size:24px;letter-spacing:-0.01em;margin-bottom:18px;margin-top:48px}
h3{font-family:'DM Serif Display',serif;font-size:19px;margin:28px 0 10px}
p{font-size:16px;color:var(--ink-soft);margin-bottom:16px;line-height:1.72}
p strong{color:var(--ink)}
ul,ol{color:var(--ink-soft);font-size:15px;line-height:1.8;margin:0 0 16px 20px}
a{color:var(--red);text-underline-offset:2px}
a:hover{color:var(--red-deep)}
pre{font-family:'DM Mono','Courier New',monospace;font-size:14px;line-height:1.9;background:var(--paper);border:1px solid var(--line);border-left:3px solid var(--red);border-radius:2px;padding:18px 22px;overflow-x:auto;white-space:pre-line;margin:8px 0 20px}
code{font-family:'DM Mono','Courier New',monospace;font-size:.875em;background:var(--paper);border:1px solid var(--line);border-radius:2px;padding:1px 5px}
.comparison-table{width:100%;border-collapse:collapse;font-size:.88rem;margin:.5rem 0 1.5rem;font-family:'DM Mono',monospace}
.comparison-table th{background:var(--paper);text-align:left;padding:9px 13px;font-weight:600;font-size:.78rem;text-transform:uppercase;letter-spacing:.07em;border-bottom:2px solid var(--line);white-space:nowrap}
.comparison-table td{padding:9px 13px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--ink-soft)}
.comparison-table tbody tr:last-child td{border-bottom:none}
.cta-band{background:var(--ink);color:var(--paper);border-radius:2px;padding:40px;margin-top:56px;text-align:center}
.cta-band h2{color:var(--paper);margin-top:0;font-size:26px}
.cta-band p{color:rgba(250,246,236,0.75);margin-bottom:24px;font-size:15px}
.btn-paper{background:var(--paper);color:var(--ink);border:2px dashed var(--ink)}
.btn-paper:hover{background:var(--kraft);transform:translateY(-1px)}
.related{display:grid;gap:8px;margin-top:8px}
.related a{font-size:15px;color:var(--red);text-decoration:none}
.related a:hover{text-decoration:underline}
@media(max-width:640px){.nav-inner{padding:14px 20px}.page{padding:32px 20px 72px}}
[data-theme=dark]{background:#1a1410;color:#f0e6d3}
[data-theme=dark] nav{background:rgba(26,20,16,0.94)}
[data-theme=dark] h1,[data-theme=dark] h2,[data-theme=dark] h3{color:#f0e6d3}
[data-theme=dark] p,[data-theme=dark] ul,[data-theme=dark] ol{color:#ddd0be}
[data-theme=dark] pre,[data-theme=dark] code{background:#231d18;border-color:rgba(240,230,211,0.1)}
[data-theme=dark] .answer-capsule{background:#1a2a1a;border-color:#4a9a4a;color:#e0f0e0}
[data-theme=dark] .comparison-table th{background:#231d18;color:#f0e6d3;border-color:rgba(240,230,211,.15)}
[data-theme=dark] .comparison-table td{color:#ddd0be;border-color:rgba(240,230,211,.07)}`;

// French pages use a French eyebrow label
const FRENCH = new Set(['combien-coute-envoyer-une-lettre-au-canada.html','comment-envoyer-une-lettre-au-canada.html','format-adresse-canadienne.html','envoyer-documents-ircc-depuis-etranger.html']);

const files = fs.readdirSync(pub).filter(f => f.endsWith('.html'));
let count = 0;
const report = [];

for (const file of files) {
  const fp = path.join(pub, file);
  let html = fs.readFileSync(fp, 'utf8');
  if (!html.includes('<div class="guide-wrap"')) continue;

  const checks = { style:false, wrap:false, breadcrumb:false, updated:false };

  // 1. Replace the inline <style> block that contains .guide-wrap with the canonical block.
  html = html.replace(/<style>[\s\S]*?<\/style>/g, (m) => {
    if (m.includes('.guide-wrap')) { checks.style = true; return `<style>\n${CANON}\n</style>`; }
    return m;
  });

  // 2. Rename wrapper class.
  const beforeWrap = html;
  html = html.replace(/<div class="guide-wrap"/g, '<div class="page"');
  checks.wrap = html !== beforeWrap;

  // 3. Replace breadcrumb <nav> with an eyebrow label.
  const label = FRENCH.has(file) ? 'Guide' : 'Guide';
  html = html.replace(/<nav class="breadcrumb"[\s\S]*?<\/nav>/, () => { checks.breadcrumb = true; return `<div class="eyebrow">${label}</div>`; });

  // 4. Insert "Updated" line right after the answer capsule paragraph.
  const updatedLine = FRENCH.has(file)
    ? '\n  <p class="updated">Mis à jour en juin 2026</p>'
    : '\n  <p class="updated">Updated June 2026</p>';
  html = html.replace(/(<p class="answer-capsule">[\s\S]*?<\/p>)/, (m) => { checks.updated = true; return m + updatedLine; });

  fs.writeFileSync(fp, html);
  count++;
  const miss = Object.entries(checks).filter(([,v]) => !v).map(([k]) => k);
  report.push(`${miss.length ? '⚠' : '✅'} ${file}${miss.length ? '  MISSED: ' + miss.join(',') : ''}`);
}

console.log(report.join('\n'));
console.log(`\nUnified ${count} pages onto the canonical template.`);
