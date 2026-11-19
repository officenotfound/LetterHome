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

  var htmlLang = (document.documentElement.lang || '').toLowerCase();
  var isFrench = htmlLang.indexOf('fr') === 0;
  var isSpanish = htmlLang.indexOf('es') === 0;
  var country = document.documentElement.getAttribute('data-country') || '';
  var onUsDomain = location.hostname.replace(/^www\./, '') === 'letterhome.us';
  // Remember the visitor's language on the French and US Spanish pages, so the ordering pages that follow open in it.
  try {
    if (isSpanish) localStorage.setItem('lh-lang', 'es');
    else if (isFrench) localStorage.setItem('lh-lang', 'fr');   // a visitor on a French page orders in French
    else if (country === 'us' && document.documentElement.hasAttribute('data-en-only')) localStorage.setItem('lh-lang', 'en');
  } catch (e) {}
  // Hide toggle only on the /guides index page (not on individual blog/guide pages).
  var isGuidesIndex = window.location.pathname === '/guides' || window.location.pathname === '/guides/';

  // English-only guide pages (<html data-en-only>) have no French version, so no toggle.
  var enOnly = document.documentElement.hasAttribute('data-en-only');
  var langToggle = (!isFrench && !isGuidesIndex && !enOnly) ?
    '<button type="button" class="lang-toggle" onclick="toggleLang()" lang="fr" aria-label="Passer au français">Français</button>' : '';
  // The ordering pages on the US site switch between English and Spanish; the UK and Australian ones are English only.
  if (country === 'us' && !enOnly && !isGuidesIndex) langToggle = '<button type="button" class="lang-toggle" onclick="toggleLang()" lang="es" aria-label="Cambiar a español">Español</button>';
  else if ((country === 'uk' || country === 'au') && !enOnly) langToggle = '';

  // Dedicated French pages link to their English twin.
  if (isFrench) {
    var en = document.querySelector('link[rel="alternate"][hreflang^="en"]');
    if (en) langToggle = '<a class="lang-link" lang="en" href="' + new URL(en.href, location.href).pathname + '" onclick="try{localStorage.setItem(\'lh-lang\',\'en\')}catch(e){}">English</a>';
  }
  var sendLabel = isFrench ? 'Envoyer une lettre' : isSpanish ? 'Enviar una carta' : 'Send a letter';
  var trackLabel = isSpanish ? 'Rastrear un pedido' : 'Track an order';

  var stamp = window.LHStamp ? window.LHStamp('h', 44) : '';

  // Holiday touch, November 11 to January 2 by the visitor's date: a slim green strip linking to the mailing deadlines, and a green
  // line under the Canadian header. Colour and one link only, no change to page content. ?xmas=1 or ?xmas=0 forces it on or off.
  var season = (function () {
    try { var q = /[?&]xmas=([01])/.exec(location.search); if (q) return q[1] === '1'; } catch (e) {}
    var d = new Date(), m = d.getMonth();
    return (m === 10 && d.getDate() >= 11) || m === 11 || (m === 0 && d.getDate() <= 2);
  })();
  var seasonBar = '';
  if (season && !isFrench && !isSpanish && country !== "uk" && country !== "us" && country !== "au") {   // Christmas bar is Canada-only: only Canada has the Santa letter
    document.documentElement.setAttribute('data-season', 'christmas');
    var onUs = location.hostname === 'letterhome.us';
    var href = country === 'us' ? (onUs ? '/christmas-mailing-deadlines-2026' : '/us/christmas-mailing-deadlines-2026')
      : (country === 'uk' || country === 'au') ? '/send-a-christmas-letter-to-canada' : '/canada-post-christmas-mailing-deadlines-2026';
    var label = (country === 'uk' || country === 'au') ? 'Holiday letters to Canada: order-by dates' : 'Last days to mail for Christmas';
    var now = new Date(), cut = new Date(now.getFullYear(), 11, 5), left = Math.ceil((cut - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    var santa = '';
    if (country !== 'uk' && country !== 'au' && now.getMonth() >= 10 && left > 0 && left <= 30) {
      label = '<span class="sb-full">Christmas mail: ' + left + (left === 1 ? ' day' : ' days') + ' left to order for Canada (by Dec 5)</span><span class="sb-short">Christmas mail: order by Dec 5</span>';
    }
    if (country !== 'us' && country !== 'uk' && country !== 'au' && now.getMonth() >= 10 && left > -5 && !/^\/send\b/.test(location.pathname)) {   // not on the order form, where people are mid-order
      santa = ' <a href="/santa-letter" class="season-santa sb-t" style="display:inline-block;background:#fff;color:#14532d;text-decoration:none;font-weight:700;font-size:16px;line-height:1.3;padding:7px 16px;border-radius:6px;white-space:nowrap"><span class="sb-full">Order a letter from Santa, $12</span><span class="sb-short">Santa letter, $12</span></a>';
    }
    seasonBar = '<style>html[data-season] body:not([class*="c-"]) nav{border-bottom:3px solid #1f6b3a!important}.season-bar{position:relative;overflow:hidden}.season-bar>.sb-t{position:relative;z-index:1}.season-bar .sb-lights{position:absolute;left:0;right:0;top:0;height:18px;background-repeat:repeat-x;background-size:80px 18px;pointer-events:none}.season-bar .sb-l1{background-image:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2218%22 viewBox=%220 0 80 18%22%3E%3Cpath d=%22M0 3Q10 11 20 3T40 3T60 3T80 3%22 fill=%22none%22 stroke=%22%230b3a1f%22 stroke-width=%221.4%22/%3E%3Ccircle cx=%2210%22 cy=%2210%22 r=%223.6%22 fill=%22%23e5484d%22/%3E%3Ccircle cx=%229%22 cy=%229%22 r=%221%22 fill=%22%23fff%22 fill-opacity=%22.55%22/%3E%3Ccircle cx=%2230%22 cy=%2210%22 r=%223.6%22 fill=%22%23f2c14e%22/%3E%3Ccircle cx=%2229%22 cy=%229%22 r=%221%22 fill=%22%23fff%22 fill-opacity=%22.55%22/%3E%3Ccircle cx=%2250%22 cy=%2210%22 r=%223.6%22 fill=%22%23fff7e0%22/%3E%3Ccircle cx=%2249%22 cy=%229%22 r=%221%22 fill=%22%23fff%22 fill-opacity=%22.55%22/%3E%3Ccircle cx=%2270%22 cy=%2210%22 r=%223.6%22 fill=%22%237bd88f%22/%3E%3Ccircle cx=%2269%22 cy=%229%22 r=%221%22 fill=%22%23fff%22 fill-opacity=%22.55%22/%3E%3C/svg%3E")}.season-bar .sb-l2{background-image:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2218%22 viewBox=%220 0 80 18%22%3E%3Cpath d=%22M0 3Q10 11 20 3T40 3T60 3T80 3%22 fill=%22none%22 stroke=%22%230b3a1f%22 stroke-width=%221.4%22/%3E%3Ccircle cx=%2210%22 cy=%2210%22 r=%223.6%22 fill=%22%23f2c14e%22/%3E%3Ccircle cx=%229%22 cy=%229%22 r=%221%22 fill=%22%23fff%22 fill-opacity=%22.55%22/%3E%3Ccircle cx=%2230%22 cy=%2210%22 r=%223.6%22 fill=%22%23fff7e0%22/%3E%3Ccircle cx=%2229%22 cy=%229%22 r=%221%22 fill=%22%23fff%22 fill-opacity=%22.55%22/%3E%3Ccircle cx=%2250%22 cy=%2210%22 r=%223.6%22 fill=%22%237bd88f%22/%3E%3Ccircle cx=%2249%22 cy=%229%22 r=%221%22 fill=%22%23fff%22 fill-opacity=%22.55%22/%3E%3Ccircle cx=%2270%22 cy=%2210%22 r=%223.6%22 fill=%22%23e5484d%22/%3E%3Ccircle cx=%2269%22 cy=%229%22 r=%221%22 fill=%22%23fff%22 fill-opacity=%22.55%22/%3E%3C/svg%3E");opacity:0}.season-bar .sb-tree{position:absolute;bottom:4px;height:28px;width:30px;height:36px;background:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2228%22 height=%2234%22 viewBox=%220 0 28 34%22%3E%3Cpath d=%22M14 2l8 10h-4l7 9h-5l6 8H2l6-8H3l7-9H6z%22 fill=%22%232f8f55%22/%3E%3Crect x=%2212%22 y=%2229%22 width=%224%22 height=%224%22 fill=%22%238a5a3c%22/%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%221.2%22 fill=%22%23f2c14e%22/%3E%3Ccircle cx=%2217%22 cy=%2219%22 r=%221.2%22 fill=%22%23e5484d%22/%3E%3Ccircle cx=%2210%22 cy=%2224%22 r=%221.2%22 fill=%22%23fff7e0%22/%3E%3C/svg%3E") no-repeat center/contain;pointer-events:none}.season-bar .sb-tl{left:max(18px,calc(50% - 640px))}.season-bar .sb-tr{right:max(18px,calc(50% - 640px))}@media(max-width:1100px){.season-bar .sb-tree{display:none}}.season-bar .sb-short{display:none}@media(max-width:700px){.season-bar{padding:22px 12px 7px!important;gap:4px 12px!important;font-size:13px!important;flex-wrap:nowrap!important}.season-bar a{white-space:nowrap}.season-bar .sb-full{display:none}.season-bar .sb-short{display:inline}.season-bar a.season-santa{background:none!important;color:#fff!important;padding:0!important;font-weight:500!important;text-decoration:underline!important;text-underline-offset:2px;box-shadow:none!important}}@media(prefers-reduced-motion:no-preference){.season-bar .sb-l1{animation:sbA 1.8s ease-in-out infinite alternate}.season-bar .sb-l2{animation:sbB 1.8s ease-in-out infinite alternate}}@keyframes sbA{from{opacity:1}to{opacity:.25}}@keyframes sbB{from{opacity:0}to{opacity:1}}</style>' +
      '<div class="season-bar" style="background:#14532d;text-align:center;padding:30px 16px 14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 20px;font:700 17px/1.35 Roboto,Arial,sans-serif"><span class="sb-tree sb-tl"></span><span class="sb-tree sb-tr"></span><a class="sb-t" href="' + href + '" style="color:#fff;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px">' + label + '</a>' + santa + '<span class="sb-lights sb-l1"></span><span class="sb-lights sb-l2"></span></div>';
  }
  // Snow falls inside the green bar, on every page that shows the bar. ?snow=1 or ?snow=0 forces it on or off.
  (function () {
    var on = !!seasonBar;
    try { var q = /[?&]snow=([01])/.exec(location.search); if (q) on = !!seasonBar && q[1] === '1'; } catch (e) {}
    if (on) { var sc = document.createElement('script'); sc.src = '/snow.js?v=4'; sc.defer = true; document.head.appendChild(sc); }
  })();
  mount.outerHTML = seasonBar +
    '<nav>' +
      '<div class="nav-inner">' +
        '<a href="' + (country === 'au' ? '/au' : '/') + '" class="logo" aria-label="Letterhome home"><span class="logo-stamp" aria-hidden="true">' + stamp + '</span><span class="logo-wordmark">Letter<span class="logo-accent">home</span></span></a>' +
        '<div class="nav-right">' +
          '<a href="' + (/^(uk|us|au)$/.test(country) ? '/business-' + country : '/business') + '" class="nav-track nav-biz">Business</a>' +
          '<a href="/track" class="nav-track" data-i18n="nav.track">' + trackLabel + '</a>' +
          langToggle +
          '<a href="/send" class="btn btn-red nav-cta" data-i18n="nav.send">' + sendLabel + '</a>' +
        '</div>' +
      '</div>' +
    '</nav>';

  // The French pages are written for the Canadian service. When one is served on the US or UK domain, its order, tracking
  // and home links go to letterhome.ca, and ?lang=fr tells the order page to open in French (storage does not cross domains).
  if (isFrench && /(^|\.)letterhome\.(us|co\.uk)$/.test(location.hostname)) {
    try {
      document.querySelectorAll('a[href]').forEach(function (a) {
        var h = a.getAttribute('href') || '';
        if (h === '/' || h === '/track') a.setAttribute('href', 'https://letterhome.ca' + h);
        else if (h === '/send' || h.indexOf('/send?') === 0) a.setAttribute('href', 'https://letterhome.ca' + h + (h.indexOf('?') < 0 ? '?' : '&') + 'lang=fr');
      });
    } catch (e) {}
  }
})();

// Side column on guide and service pages (wide screens only).
(function () { try { var s = document.createElement('script'); s.src = '/rail.js?v=6'; s.defer = true; document.head.appendChild(s); } catch (e) {} })();
