#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Rules to inject just before </style> in the already-fixed pages
const EXTRA = `
.guide-wrap{max-width:780px;margin:0 auto;padding:56px 32px 80px}
.guide-wrap .breadcrumb{font-size:.78rem;font-family:'DM Mono',monospace;color:var(--ink-muted);margin-bottom:1.8em;letter-spacing:.01em}
.guide-wrap .breadcrumb a{color:var(--ink-muted);text-decoration:none}
.guide-wrap .breadcrumb a:hover{color:var(--red)}
.guide-wrap .breadcrumb span{color:var(--ink-muted)}
.answer-capsule{background:#f0f7f0;border-left:4px solid #2a7a2a;padding:.85rem 1.1rem;margin:.5rem 0 1.8rem;border-radius:0 4px 4px 0;font-size:1rem;line-height:1.65;color:var(--ink)}
.comparison-table{width:100%;border-collapse:collapse;font-size:.88rem;margin:.5rem 0 1.5rem;font-family:'DM Mono',monospace}
.comparison-table th{background:var(--paper);text-align:left;padding:9px 13px;font-weight:600;font-size:.78rem;text-transform:uppercase;letter-spacing:.07em;border-bottom:2px solid var(--line);white-space:nowrap}
.comparison-table td{padding:9px 13px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--ink-soft)}
.comparison-table tbody tr:last-child td{border-bottom:none}
.comparison-table tbody tr:hover td{background:rgba(168,71,45,.04)}
[data-theme=dark] .answer-capsule{background:#1a2a1a;border-color:#4a9a4a;color:#e0f0e0}
[data-theme=dark] .comparison-table th{background:#231d18;color:#f0e6d3;border-color:rgba(240,230,211,.15)}
[data-theme=dark] .comparison-table td{color:#ddd0be;border-color:rgba(240,230,211,.07)}
@media(max-width:640px){.guide-wrap{padding:32px 20px 72px}}`;

const pubDir = path.join(__dirname, '../public');
const MARKER = `@media(max-width:640px){.nav-inner{padding:14px 20px}}\n[data-theme=dark]`;

let fixed = 0;
for (const file of fs.readdirSync(pubDir)) {
  if (!file.endsWith('.html')) continue;
  const fp = path.join(pubDir, file);
  let html = fs.readFileSync(fp, 'utf8');
  if (!html.includes('class="guide-wrap"')) continue;
  if (html.includes('.guide-wrap{max-width')) { console.log(`  already has it: ${file}`); continue; }
  // Inject EXTRA after the @media nav-inner line, inside the existing style block
  if (!html.includes(MARKER)) { console.warn(`  marker not found: ${file}`); continue; }
  html = html.replace(MARKER, EXTRA + '\n' + MARKER.replace('\n[data-theme=dark]', '\n[data-theme=dark]'));
  fs.writeFileSync(fp, html);
  console.log(`✅ ${file}`);
  fixed++;
}
console.log(`\nDone — ${fixed} pages updated.`);
