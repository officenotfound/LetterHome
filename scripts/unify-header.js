#!/usr/bin/env node
/**
 * Make the header identical on every page.
 * - Replaces the first <nav>...</nav> with the canonical header.
 * - Ensures lang.js is loaded (needed for the FR toggle + nav i18n).
 * The footer is already shared via footer.js on every page.
 */
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '../public');

const NAV = `<nav>
  <div class="nav-inner">
    <a href="/" class="logo"><img src="/logo.png" alt="Letterhome" class="logo-img" width="32" height="34" style="height:34px;width:auto;display:block"><span class="logo-wordmark">Letter<span class="logo-accent">home</span></span></a>
    <div class="nav-links">
      <a href="/#how" data-i18n="nav.how">How it works</a>
      <a href="/#pricing" data-i18n="nav.pricing">Pricing</a>
      <a href="/contact" data-i18n="nav.contact">Contact</a>
      <a href="/track" data-i18n="nav.track">Track an order</a>
    </div>
    <div class="nav-right">
      <button type="button" class="lang-toggle" onclick="toggleLang()" aria-label="Toggle language">FR</button>
      <button type="button" class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle dark mode" title="Toggle dark mode">
        <svg class="sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/></svg>
        <svg class="moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
      <a href="/send" class="btn btn-red nav-cta" data-i18n="nav.send">Send a letter</a>
    </div>
  </div>
</nav>`;

const files = fs.readdirSync(pub).filter(f => f.endsWith('.html'));
let navCount = 0, langCount = 0;
const warn = [];

for (const file of files) {
  const fp = path.join(pub, file);
  let html = fs.readFileSync(fp, 'utf8');
  let changed = false;

  // 1. Replace the first <nav>...</nav> (the site header).
  if (/<nav>[\s\S]*?<\/nav>/.test(html)) {
    html = html.replace(/<nav>[\s\S]*?<\/nav>/, () => NAV);
    navCount++; changed = true;
  } else {
    warn.push(`no <nav> in ${file}`);
  }

  // 2. Ensure lang.js is loaded (after theme.js, or before </body>).
  if (!html.includes('/lang.js')) {
    if (/<script src="\/theme\.js[^"]*"( defer)?><\/script>/.test(html)) {
      html = html.replace(/(<script src="\/theme\.js[^"]*"( defer)?><\/script>)/, '$1\n<script src="/lang.js" defer></script>');
    } else {
      html = html.replace(/<\/body>/, '<script src="/lang.js" defer></script>\n</body>');
    }
    langCount++; changed = true;
  }

  if (changed) fs.writeFileSync(fp, html);
}

console.log(`Header replaced on ${navCount} pages`);
console.log(`lang.js added to ${langCount} pages`);
if (warn.length) console.log('Warnings:\n  ' + warn.join('\n  '));
