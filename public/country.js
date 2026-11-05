// Country pages (/us, /uk, /au, /nz and their guides): puts the country's own logo where the maple leaf
// logo sits in the header (the real stitched M with the leaf cut off and a national emblem above it),
// adds the Spanish/English link where a page has a twin, and translates the header labels on Spanish pages.
// The header colours themselves come from the page's CSS (body.c-xx).
(function () {
  var root = document.documentElement;
  var cc = root.getAttribute('data-country');
  if (!cc) return;

  // The header "Send a letter" button follows the page's own call to action, so on a UK page it opens the
  // order form with the UK already chosen as the destination (and on a route page, that route's destination).
  var navCta = document.querySelector('.nav-cta');
  var pageCta = document.querySelector('.hero-cta') || document.querySelector('.cta-block a');
  if (navCta && pageCta && (pageCta.getAttribute('href') || '').indexOf('/send') === 0) navCta.setAttribute('href', pageCta.getAttribute('href'));

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

  // Every amount marked data-cad shows in this country's currency. Main prices round up to the next half
  // unit, small extras to the next 5 cents. Display only; the exact amount is set at checkout.
  var curs = { us: 'USD', uk: 'GBP', au: 'AUD' }, cur = curs[cc], marked = document.querySelectorAll('[data-cad]');
  if (cur && marked.length) {
    fetch('/api/site-config').then(function (r) { return r.json(); }).then(function (c) {
      var rate = c.fx_display && c.fx_display[cur] && c.fx_display[cur].rate;
      if (!rate) return;
      marked.forEach(function (el) {
        var cents = +el.getAttribute('data-cad'), x = cents / 100 * rate;
        var v = cents >= 300 ? Math.max(0.5, Math.ceil(x * 2 - 1e-9) / 2) : Math.ceil(x * 20 - 1e-9) / 20;
        var t = v % 1 ? v.toFixed(2) : v.toFixed(0);
        el.textContent = (cur === 'GBP' ? '\u00a3' : '$') + t;
      });
    }).catch(function () {});
  }

  if ((root.lang || '').toLowerCase().indexOf('es') === 0) {
    var map = { how: 'Cómo funciona', pricing: 'Precios', contact: 'Contacto', track: 'Rastrear un pedido', send: 'Enviar una carta' };
    Object.keys(map).forEach(function (k) {
      document.querySelectorAll('[data-i18n="nav.' + k + '"]').forEach(function (el) { el.textContent = map[k]; });
    });
  }
})();
