// Side column for guide and service pages on wide screens: a short call to action, the page's
// "Updated" date, a contents list and the official sources it links to. Hidden below 1180px by CSS.
(function () {
  // On phones short intros are centred and long ones read better left-aligned; mark the long ones.
  function markLong() {
    var ps = document.querySelectorAll('.lede, .sub, .intro, .hero p, .page > p, .main > p, .hero-copy p');
    for (var i = 0; i < ps.length; i++) if (ps[i].textContent.replace(/\s+/g, ' ').trim().length > 170) ps[i].classList.add('lh-long');
  }
  function run() {
  markLong();
  var body = document.body;
  if (!body) return;
  var cm = /\bc-(uk|us|au)\b/.exec(body.className);
  var country = cm ? cm[1] : (document.documentElement.getAttribute('data-country') || 'ca');
  if ((document.documentElement.lang || 'en').slice(0, 2) !== 'en') return;
  var path = location.pathname.replace(/\/$/, '') || '/';
  if (/^\/(send|santa-letter|track|order-success|contact|account|business|guides|about|careers|privacy|terms|refunds|uk|us|au|nz)?$/.test(path)) return;

  var hero = null;
  var host = document.querySelector('body > .page');
  if (!host) {
    var main = document.querySelector('body > .hero + .main, body > #main-content.hero ~ .main');
    if (main) { host = main; hero = main.previousElementSibling && main.previousElementSibling.classList.contains('hero') ? main.previousElementSibling : document.getElementById('main-content'); }
  }
  if (!host || !document.querySelector('h1')) return;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // The page's own main action, so the side button says the same thing as the page.
  var cta = document.querySelector('.hero a.hero-cta, .page a.hero-cta, .cta-block a, .cta-band a.btn, .cta-band a');
  var href = cta ? cta.getAttribute('href') : '/send';
  var label = cta ? cta.textContent.replace(/\s+/g, ' ').trim() : 'Send a letter';
  if (!label || label.length > 40) label = 'Send a letter';

  var COPY = {
    ca: { title: 'Mail it from inside Canada', text: 'We print it, put it in an envelope and mail it within two business days. From $6, postage included.' },
    uk: { title: 'Post it without the post office', text: 'We print it, put it in an envelope and post it within two working days. Postage is included in the price.' },
    au: { title: 'Post it without the post office', text: 'We print it, put it in an envelope and post it within two business days. Postage is included in the price.' },
    us: { title: 'Mail it without the post office', text: 'We print it, put it in an envelope and mail it within two business days. Postage is included in the price.' }
  };
  var copy = COPY[country] || COPY.ca;
  var aside = el('aside', 'lh-rail');
  aside.setAttribute('aria-label', 'On this page');
  var card = el('div', 'lh-rail-card',
    '<p class="lh-rail-title">' + copy.title + '</p>' +
    '<p class="lh-rail-text">' + copy.text + '</p>' +
    '<a class="btn btn-red btn-large lh-rail-btn" href="' + esc(href) + '">' + esc(label) + '</a>' +
    '<p class="lh-rail-meta">Pay securely with Stripe. Cancel before printing for a full refund.</p>');
  aside.appendChild(card);

  var upd = document.querySelector('.updated, .page-updated, .last-updated');
  if (!upd) {
    var cands = host.querySelectorAll('p, span, time, div');
    for (var i = 0; i < cands.length && !upd; i++) if (/^\s*(Last )?updated\b/i.test(cands[i].textContent) && cands[i].textContent.length < 60) upd = cands[i];
  }

  var skip = /^(frequently asked|common questions|related|ready to|questions|sources|got a|got something|need to send)/i;
  var heads = [].filter.call(host.querySelectorAll('h2'), function (h) { return h.offsetParent !== null && !skip.test(h.textContent.trim()); });
  if (heads.length >= 3) {
    var toc = el('div', 'lh-rail-toc');
    toc.setAttribute('role', 'navigation');
    toc.setAttribute('aria-label', 'Contents');
    var list = '<p class="lh-rail-label">On this page</p><ol>';
    heads.slice(0, 8).forEach(function (h, n) {
      if (!h.id) h.id = 'sec-' + (n + 1) + '-' + h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      list += '<li><a href="#' + h.id + '">' + esc(h.textContent.trim()) + '</a></li>';
    });
    toc.innerHTML = list + '</ol>';
    aside.appendChild(toc);
  }

  var seen = {}, srcs = [];
  [].forEach.call(host.querySelectorAll('a[href^="http"]'), function (a) {
    var u; try { u = new URL(a.href); } catch (e) { return; }
    if (/letterhome\./.test(u.hostname) || seen[u.hostname] || srcs.length >= 4) return;
    if (!/(\.gc\.ca|canada\.ca|\.gov(\.[a-z]{2})?$|\.gov\.uk$|gov\.au$|ontario\.ca|\.bc\.ca|\.qc\.ca|\.ab\.ca|\.mb\.ca|tribunalsontario|canadapost|postescanada|\.edu$|ubc\.ca|utoronto|mcgill|queensu|uwaterloo|uvic|dal\.ca|sfu\.ca|wes\.org|icesbc|alberta\.ca|usps\.com|royalmail|auspost)/i.test(u.hostname)) return;
    seen[u.hostname] = 1;
    srcs.push('<li><a href="' + esc(a.href) + '" target="_blank" rel="noopener">' + esc(u.hostname.replace(/^www\./, '')) + '</a></li>');
  });
  if (srcs.length || upd) {
    var meta = el('div', 'lh-rail-src');
    meta.innerHTML = (upd ? '<p class="lh-rail-label">' + esc(upd.textContent.replace(/\s+/g, ' ').trim()) + '</p>' : '') +
      (srcs.length ? '<p class="lh-rail-label">Sources</p><ul>' + srcs.join('') + '</ul>' : '');
    aside.appendChild(meta);
  }

  var wrap = el('div', 'lh-railwrap');
  host.parentNode.insertBefore(wrap, host);
  wrap.appendChild(host);
  wrap.appendChild(aside);
  body.classList.add('lh-has-rail');
  if (hero) hero.classList.add('lh-rail-hero');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
