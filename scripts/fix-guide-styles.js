#!/usr/bin/env node
// Injects the shared guide inline <style> block into every broken guide page.
// Matches exactly what the working pages (mail-a-letter-online, etc.) embed.

const fs = require('fs');
const path = require('path');

const STYLE_BLOCK = `<style>
:root{--kraft:#f1ebde;--kraft-deep:#e1d6bd;--paper:#faf6ec;--ink:#2a2a2a;--ink-soft:#3a3835;--ink-muted:#6b6258;--ink-faint:#968b7d;--red:#a8472d;--red-deep:#7d3220;--line:rgba(42,42,42,0.14);--shadow-card:0 2px 6px rgba(42,42,42,0.06),0 14px 40px rgba(42,42,42,0.1)}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Source Serif 4',Georgia,serif;background:var(--kraft);color:var(--ink);line-height:1.6;font-size:16px}
nav{position:sticky;top:0;z-index:100;background:rgba(241,235,222,0.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.nav-inner{max-width:1100px;margin:0 auto;padding:18px 32px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.logo{display:flex;align-items:center;gap:10px;font-family:'DM Serif Display',serif;font-size:24px;color:var(--ink);text-decoration:none}
.btn{display:inline-block;padding:11px 22px;border-radius:2px;font-weight:500;font-size:13px;text-decoration:none;transition:all .2s;border:none;cursor:pointer;font-family:inherit;letter-spacing:.04em;text-transform:uppercase}
.btn-red{background:var(--red);color:var(--paper);border:2px dashed rgba(255,255,255,.7)}
.btn-red:hover{background:var(--red-deep);transform:translateY(-1px)}
h1{font-family:'DM Serif Display',serif;font-size:clamp(28px,5vw,44px);line-height:1.15;letter-spacing:-.02em;margin-bottom:14px}
h2{font-family:'DM Serif Display',serif;font-size:clamp(20px,3vw,26px);letter-spacing:-.01em;margin:48px 0 18px}
h3{font-family:'DM Serif Display',serif;font-size:19px;margin:28px 0 10px}
p{font-size:16px;color:var(--ink-soft);margin-bottom:16px;line-height:1.72}
p strong{color:var(--ink)}
ul,ol{color:var(--ink-soft);font-size:15px;line-height:1.8}
a{color:var(--red);text-underline-offset:2px}
a:hover{color:var(--red-deep)}
pre{font-family:'DM Mono','Courier New',monospace;font-size:14px;line-height:1.9;background:var(--paper);border:1px solid var(--line);border-left:3px solid var(--red);border-radius:2px;padding:18px 22px;overflow-x:auto;white-space:pre-line;margin:8px 0 20px}
code{font-family:'DM Mono','Courier New',monospace;font-size:.875em;background:var(--paper);border:1px solid var(--line);border-radius:2px;padding:1px 5px}
@media(max-width:640px){.nav-inner{padding:14px 20px}}
[data-theme=dark]{background:#1a1410;color:#f0e6d3}
[data-theme=dark] body{background:#1a1410;color:#f0e6d3}
[data-theme=dark] nav{background:rgba(26,20,16,.94) !important}
[data-theme=dark] h1,[data-theme=dark] h2,[data-theme=dark] h3{color:#f0e6d3}
[data-theme=dark] p,[data-theme=dark] ul,[data-theme=dark] ol{color:#ddd0be}
[data-theme=dark] pre,[data-theme=dark] code{background:#231d18;border-color:rgba(240,230,211,.1)}
</style>`;

const pubDir = path.join(__dirname, '../public');

// Find all HTML files that use guide-wrap (the broken ones)
let fixed = 0, skipped = 0;
for (const file of fs.readdirSync(pubDir)) {
  if (!file.endsWith('.html')) continue;
  const filepath = path.join(pubDir, file);
  let html = fs.readFileSync(filepath, 'utf8');

  // Only process guide-wrap pages
  if (!html.includes('class="guide-wrap"')) { skipped++; continue; }

  // Skip if already has the inline style (idempotent)
  if (html.includes("'Source Serif 4',Georgia,serif")) {
    console.log(`  already fixed: ${file}`);
    skipped++;
    continue;
  }

  // Insert BEFORE the guide.css link (so it sits between theme.css and guide.css)
  const marker = '<link rel="stylesheet" href="/guide.css">';
  if (!html.includes(marker)) {
    console.warn(`  WARN: no guide.css link in ${file}, skipping`);
    skipped++;
    continue;
  }

  html = html.replace(marker, STYLE_BLOCK + '\n' + marker);
  fs.writeFileSync(filepath, html);
  console.log(`✅ ${file}`);
  fixed++;
}

console.log(`\nDone — ${fixed} pages fixed, ${skipped} skipped.`);
