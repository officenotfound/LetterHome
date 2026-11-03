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

  // English-only guide pages (<html data-en-only>) have no French version, so no toggle.
  var enOnly = document.documentElement.hasAttribute('data-en-only');
  var langToggle = (!isFrench && !isGuidesIndex && !enOnly) ?
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
          '<a href="/send" class="btn btn-red nav-cta" data-i18n="nav.send">' + sendLabel + '</a>' +
        '</div>' +
      '</div>' +
    '</nav>';
})();
