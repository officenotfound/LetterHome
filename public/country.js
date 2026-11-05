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

  // Orders started on a country page use that country's fixed prices and currency.
  var curs = { us: 'USD', uk: 'GBP', au: 'AUD' }, cur = curs[cc];
  if (cur) document.querySelectorAll('a[href^="/send"]').forEach(function (a) {
    var h = a.getAttribute('href');
    if (h.indexOf('cur=') < 0) a.setAttribute('href', h + (h.indexOf('?') < 0 ? '?' : '&') + 'cur=' + cur);
  });

  if ((root.lang || '').toLowerCase().indexOf('es') === 0) {
    var map = { how: 'Cómo funciona', pricing: 'Precios', contact: 'Contacto', track: 'Rastrear un pedido', send: 'Enviar una carta' };
    Object.keys(map).forEach(function (k) {
      document.querySelectorAll('[data-i18n="nav.' + k + '"]').forEach(function (el) { el.textContent = map[k]; });
    });
  }
})();
