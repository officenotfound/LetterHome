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
// Country postage stamps: original artwork in each country's postage-stamp style (perforated edge, framed picture, country name, value mark).
(function () {
  var cc = document.documentElement.getAttribute('data-country') || 'ca';
  var T = function (x, y, s, fill, txt, w, anchor) { return '<text x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '" font-family="Roboto,sans-serif" font-size="' + s + '" font-weight="' + (w || 500) + '" fill="' + fill + '" letter-spacing=".3">' + txt + '</text>'; };
  var art = {
    ca: { label: 'CANADA', bg: '#c8281e', defs: '',
      draw: '<polygon transform="translate(2 3.400) scale(.9)" fill="#fff" points="20,10 22,14.200 24.200,13.400 23.400,18.600 26.800,16 27.600,17.800 30.400,17.200 28.800,21.600 31,23 25.400,27.800 26.200,30 21,29.100 21,34 19,34 19,29.100 13.800,30 14.600,27.800 9,23 11.200,21.600 9.600,17.200 12.400,17.800 13.200,16 16.600,18.600 15.800,13.400 18,14.200"/>' +
        T(20, 10.600, 3.300, '#fff', 'CANADA', 600) + '<circle cx="10.500" cy="37.200" r="2.600" fill="none" stroke="#fff" stroke-width=".6"/>' + T(10.500, 38.400, 3.300, '#fff', 'P', 600) },
    us: { label: 'USA', bg: '#bcd6ee', defs: '',
      draw: '<g transform="rotate(-7 20 22)"><rect x="8" y="12" width="24" height="18" fill="#fff"/>' +
        [0,2,4,6,8,10,12].map(function (i) { return '<rect x="8" y="' + (12 + i * 1.385) + '" width="24" height="1.385" fill="#d7263d"/>'; }).join('') +
        '<rect x="8" y="12" width="10.500" height="9.700" fill="#1c2d63"/>' +
        [0,1,2,3].map(function (r) { return [0,1,2,3].map(function (c) { return '<circle cx="' + (10 + c * 2.300) + '" cy="' + (14 + r * 1.900) + '" r=".5" fill="#fff"/>'; }).join(''); }).join('') + '</g>' +
        T(9.500, 10.600, 3.600, '#1c2d63', 'USA', 700, 'start') + T(20, 39.300, 3.200, '#1c2d63', 'FIRST-CLASS', 600) },
    uk: { label: 'UK', bg: '#8c1128', defs: '',
      draw: '<path d="M11.500 28 V17.500 L15.600 21.600 L20 14.200 L24.400 21.600 L28.500 17.500 V28 Z" fill="#f3e3b3"/><rect x="11.500" y="29" width="17" height="2.600" fill="#f3e3b3"/>' +
        '<circle cx="11.500" cy="16" r="1.300" fill="#f3e3b3"/><circle cx="20" cy="12.600" r="1.400" fill="#f3e3b3"/><circle cx="28.500" cy="16" r="1.300" fill="#f3e3b3"/>' +
        '<text x="8.500" y="39.500" font-family="DM Serif Display,serif" font-size="8" fill="#fff">1st</text>' + T(32, 10.600, 3.300, '#f3e3b3', 'UK', 600, 'end') },
    au: { label: 'AUSTRALIA', bg: '#0e5a3a', defs: '',
      draw: '<g transform="translate(0 2)"><path d="M12 36 Q18 28 27 13" stroke="#b9d98a" stroke-width=".9" fill="none"/><path d="M14 33 Q21 31 29 27" stroke="#b9d98a" stroke-width=".8" fill="none"/>' +
        '<g fill="#f6c935"><circle cx="27" cy="13" r="2.300"/><circle cx="24" cy="16.500" r="2.200"/><circle cx="29.500" cy="17" r="2.100"/><circle cx="22.500" cy="21.500" r="2.100"/><circle cx="27.500" cy="22" r="2.300"/><circle cx="19" cy="27" r="2"/><circle cx="25" cy="27.500" r="2.100"/><circle cx="29" cy="26.500" r="1.800"/></g>' +
        '<g fill="#7fb35c"><ellipse cx="14" cy="30" rx="4" ry="1.200" transform="rotate(-30 14 30)"/><ellipse cx="17" cy="34" rx="4" ry="1.100" transform="rotate(-10 17 34)"/><ellipse cx="12" cy="25" rx="3.600" ry="1.100" transform="rotate(-55 12 25)"/></g></g>' +
        T(20, 10.600, 3, '#f6c935', 'AUSTRALIA', 600) + T(10, 39.300, 3, '#f6c935', 'POST', 600, 'start') }
  };
  var a = art[cc] || art.ca;
  function cancel(id) {
    var ink = '#12141a', lines = '';
    [21, 25, 29].forEach(function (y) { lines += '<path d="M-1 ' + y + ' q2 -1.700 4 0 t4 0 t4 0 t4 0 t4 0 t3 0" stroke-width=".7"/>'; });
    return '<g class="void" opacity=".74" fill="none" stroke="' + ink + '" transform="rotate(-10 22 30)">' + lines +
      '<circle cx="29.500" cy="29" r="9.400" stroke-width=".9"/><circle cx="29.500" cy="29" r="7" stroke-width=".4"/>' +
      '<path id="pc' + id + '" d="M21.200 29 a8.300 8.300 0 0 1 16.600 0" stroke="none"/>' +
      '<text font-family="Roboto,sans-serif" font-size="2" font-weight="600" fill="' + ink + '" stroke="none" letter-spacing=".25"><textPath href="#pc' + id + '" startOffset="50%" text-anchor="middle">LETTERHOME</textPath></text>' +
      '<text x="29.500" y="28.400" text-anchor="middle" font-family="Roboto,sans-serif" font-size="2.600" font-weight="600" fill="' + ink + '" stroke="none">NOV 05</text>' +
      '<path d="M25.200 29.800 h8.600" stroke-width=".35"/>' +
      '<text x="29.500" y="32.800" text-anchor="middle" font-family="Roboto,sans-serif" font-size="2.600" font-weight="600" fill="' + ink + '" stroke="none">2026</text></g>';
  }
  function stamp(id, w, c) {
    var a = art[c || cc] || art.ca;
    var h = Math.round(w * 1.2), r = 1.7, d = '';
    for (var x = 3; x < 40; x += 4) d += '<circle cx="' + x + '" cy="0" r="' + r + '"/><circle cx="' + x + '" cy="48" r="' + r + '"/>';
    for (var y = 3; y < 48; y += 4) d += '<circle cx="0" cy="' + y + '" r="' + r + '"/><circle cx="40" cy="' + y + '" r="' + r + '"/>';
    return '<svg class="stamp-svg" width="' + w + '" height="' + h + '" viewBox="0 0 40 48" role="img" aria-label="' + a.label + ' postage stamp">' +
      '<defs><mask id="pf' + id + '"><rect width="40" height="48" fill="#fff"/><g fill="#000">' + d + '</g></mask>' +
      '<pattern id="hx' + id + '" width="1.600" height="1.600" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width=".3" height="1.600" fill="#000"/></pattern></defs>' +
      '<g mask="url(#pf' + id + ')"><rect width="40" height="48" fill="#fffaf0"/>' +
      '<rect x="4" y="4" width="32" height="40" fill="' + a.bg + '"/><rect x="4" y="4" width="32" height="40" fill="url(#hx' + id + ')" opacity=".16"/>' +
      a.draw + '<rect x="4" y="4" width="32" height="40" fill="none" stroke="rgba(0,0,0,.25)" stroke-width=".4"/>' +
      '<rect x="5.400" y="5.400" width="29.200" height="37.200" fill="none" stroke="rgba(255,255,255,.5)" stroke-width=".5"/></g>' + cancel(id) + '</svg>';
  }
  window.LHStamp = stamp;
  function run() {
    var w = document.querySelector('.rm-widget');
    if (w && !w.querySelector('.hero-stamp')) {
      var b = document.createElement('div'); b.className = 'hero-stamp'; b.setAttribute('aria-hidden', 'true');
      b.innerHTML = stamp('b', 92);
      w.appendChild(b);
    }
  }
  if (document.readyState !== 'loading') run(); else document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
})();

(function () {
  var mount = document.getElementById('site-header');
  if (!mount) return;

  var isFrench = (document.documentElement.lang || '').toLowerCase().indexOf('fr') === 0;
  // Hide toggle only on the /guides index page (not on individual blog/guide pages).
  var isGuidesIndex = window.location.pathname === '/guides' || window.location.pathname === '/guides/';

  // English-only guide pages (<html data-en-only>) have no French version, so no toggle.
  var enOnly = document.documentElement.hasAttribute('data-en-only');
  var langToggle = (!isFrench && !isGuidesIndex && !enOnly) ?
    '<button type="button" class="lang-toggle" onclick="toggleLang()" lang="fr" aria-label="Passer au français">Français</button>' : '';

  // Dedicated French pages link to their English twin.
  if (isFrench) {
    var en = document.querySelector('link[rel="alternate"][hreflang^="en"]');
    if (en) langToggle = '<a class="lang-link" lang="en" href="' + new URL(en.href, location.href).pathname + '" onclick="try{localStorage.setItem(\'lh-lang\',\'en\')}catch(e){}">English</a>';
  }

  var sendLabel = isFrench ? 'Envoyer une lettre' : 'Send a letter';

  var stamp = window.LHStamp ? window.LHStamp('h', 44) : '';
  mount.outerHTML =
    '<nav>' +
      '<div class="nav-inner">' +
        '<a href="/" class="logo" aria-label="Letterhome home"><span class="logo-stamp" aria-hidden="true">' + stamp + '</span><span class="logo-wordmark">Letter<span class="logo-accent">home</span></span></a>' +
        '<div class="nav-right">' +
          '<a href="/track" class="nav-track" data-i18n="nav.track">Track an order</a>' +
          langToggle +
          '<a href="/send" class="btn btn-red nav-cta" data-i18n="nav.send">' + sendLabel + '</a>' +
        '</div>' +
      '</div>' +
    '</nav>';
})();
