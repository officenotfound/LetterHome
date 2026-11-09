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
  if (right && alt && !right.querySelector('.lang-link, .lang-toggle')) {
    var a = document.createElement('a');
    a.className = 'lang-link';
    a.href = alt;
    var es = root.getAttribute('data-alt-label') === 'ES';
    a.textContent = es ? 'Español' : 'English';
    a.setAttribute('hreflang', es ? 'es-US' : 'en-US');
    a.setAttribute('lang', es ? 'es' : 'en');
    // Same order as the Canadian header: Track an order, language, Send a letter.
    var track = right.querySelector('.nav-track');
    right.insertBefore(a, track ? track.nextSibling : right.firstChild);
  }

  // Orders started on a country page use that country's fixed prices and currency.
  var curs = { us: 'USD', uk: 'GBP', au: 'AUD' }, cur = curs[cc];
  if (cur) document.querySelectorAll('a[href^="/send"]').forEach(function (a) {
    var h = a.getAttribute('href');
    if (h.indexOf('cur=') < 0) a.setAttribute('href', h + (h.indexOf('?') < 0 ? '?' : '&') + 'cur=' + cur);
  });

  // Spanish pages (Mexican Spanish): the shared header and footer labels.
  if ((root.lang || '').toLowerCase().indexOf('es') === 0) {
    var es = {
      'nav.how': 'Cómo funciona', 'nav.pricing': 'Precios', 'nav.contact': 'Contacto', 'nav.track': 'Rastrear un pedido', 'nav.send': 'Enviar una carta',
      'footer.blurb': 'Imprimimos y enviamos sus cartas por usted, sin ir a la oficina postal.',
      'footer.service': 'Servicio', 'footer.countries': 'Países', 'footer.company': 'Empresa', 'footer.guides': 'Guías de envío',
      'footer.ca': 'Canadá', 'footer.us': 'Estados Unidos', 'footer.uk': 'Reino Unido', 'footer.au': 'Australia',
      'footer.about': 'Nosotros', 'footer.refunds': 'Política de reembolsos', 'footer.privacy': 'Privacidad', 'footer.terms': 'Términos', 'footer.accessibility': 'Accesibilidad'
    };
    var spanish = function () {
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var v = es[el.getAttribute('data-i18n')];
        if (v) el.textContent = v;
      });
    };
    spanish();
    document.addEventListener('DOMContentLoaded', spanish);
  }
})();
