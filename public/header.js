// Single source of truth for the site header. Every page includes a
// <div id="site-header"></div> placeholder plus this script; the markup below
// is injected into it, so the header can only ever be edited in one place.
//
// Loaded WITHOUT defer, immediately after the placeholder, so the sticky nav
// is in place before first paint (no flash). The data-i18n labels are still
// translated by lang.js on its DOMContentLoaded pass / live EN-FR toggle.
//
// The language toggle is omitted on French pages (<html lang="fr-...">), and
// the "Send a letter" CTA renders in French there.
(function () {
  var mount = document.getElementById('site-header');
  if (!mount) return;

  var isFrench = (document.documentElement.lang || '').toLowerCase().indexOf('fr') === 0;
  // Hide toggle only on the /guides index page (not on individual blog/guide pages).
  var isGuidesIndex = window.location.pathname === '/guides' || window.location.pathname === '/guides/';

  var langToggle = (!isFrench && !isGuidesIndex) ?
    '<button type="button" class="lang-toggle" onclick="toggleLang()" aria-label="Toggle language">FR</button>' : '';

  var sendLabel = isFrench ? 'Envoyer une lettre' : 'Send a letter';

  mount.outerHTML =
    '<nav>' +
      '<div class="nav-inner">' +
        '<a href="/" class="logo"><img src="/logo.png" alt="Letterhome" class="logo-img" width="32" height="34" style="height:34px;width:auto;display:block"><span class="logo-wordmark">Letter<span class="logo-accent">home</span></span></a>' +
        '<div class="nav-links">' +
          '<a href="/#how" data-i18n="nav.how">How it works</a>' +
          '<a href="/#pricing" data-i18n="nav.pricing">Pricing</a>' +
          '<a href="/contact" data-i18n="nav.contact">Contact</a>' +
          '<a href="/track" data-i18n="nav.track">Track an order</a>' +
        '</div>' +
        '<div class="nav-right">' +
          langToggle +
          '<button type="button" class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle dark mode" title="Toggle dark mode">' +
            '<svg class="sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/></svg>' +
            '<svg class="moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
          '</button>' +
          '<a href="/send" class="btn btn-red nav-cta" data-i18n="nav.send">' + sendLabel + '</a>' +
        '</div>' +
      '</div>' +
    '</nav>';
})();
