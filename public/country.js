// Country pages (/us, /uk, /au, /nz and their guides): adds a small postmark ring beside the Letterhome
// wordmark, adds the Spanish/English link where a page has a twin, and translates the header labels on
// Spanish pages. The postmark colour comes from the --m1 variable each country theme sets.
(function () {
  var root = document.documentElement;
  var cc = root.getAttribute('data-country');
  if (!cc) return;

  var codes = { us: 'US', uk: 'UK', au: 'AU', nz: 'NZ' };
  var wordmark = document.querySelector('.logo .logo-wordmark');
  if (wordmark && codes[cc]) {
    var pm = document.createElement('span');
    pm.setAttribute('aria-hidden', 'true');
    pm.style.cssText = 'display:inline-block;margin-left:10px;vertical-align:middle;line-height:0';
    pm.innerHTML = '<svg width="50" height="50" viewBox="0 0 58 58" style="color:var(--m1)">' +
      '<circle cx="24" cy="29" r="21" fill="none" stroke="currentColor" stroke-width="2.5"/>' +
      '<circle cx="24" cy="29" r="16.5" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
      '<text x="24" y="34" text-anchor="middle" font-family="DM Mono,monospace" font-size="15" font-weight="700" fill="currentColor">' + codes[cc] + '</text>' +
      '<path d="M47 22 q5-3 10 0 M47 29 q5-3 10 0 M47 36 q5-3 10 0" stroke="currentColor" stroke-width="2" fill="none"/></svg>';
    wordmark.parentNode.insertBefore(pm, wordmark.nextSibling);
  }

  var right = document.querySelector('.nav-right');
  var alt = root.getAttribute('data-alt');
  if (right && alt) {
    var a = document.createElement('a');
    a.className = 'lang-link';
    a.href = alt;
    a.textContent = root.getAttribute('data-alt-label') || '';
    a.setAttribute('hreflang', root.getAttribute('data-alt-label') === 'ES' ? 'es-US' : 'en-US');
    right.insertBefore(a, right.firstChild);
  }

  if ((root.lang || '').toLowerCase().indexOf('es') === 0) {
    var map = { how: 'Cómo funciona', pricing: 'Precios', contact: 'Contacto', track: 'Rastrear un pedido', send: 'Enviar una carta' };
    Object.keys(map).forEach(function (k) {
      document.querySelectorAll('[data-i18n="nav.' + k + '"]').forEach(function (el) { el.textContent = map[k]; });
    });
  }
})();
