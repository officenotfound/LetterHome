// Shows the Google score the owner set under Settings. The page's own number stays if the request fails.
fetch('/api/site-config').then(function (r) { return r.json(); }).then(function (cfg) {
  var n = cfg && cfg.google_rating;
  if (!n) return;
  var full = Math.round(Number(n));
  document.querySelectorAll('.g-num').forEach(function (el) { el.textContent = n; });
  document.querySelectorAll('.g-stars').forEach(function (el) {
    el.textContent = '\u2605'.repeat(full) + '\u2606'.repeat(5 - full);
    el.setAttribute('aria-label', n + ' out of 5 stars');
  });
}).catch(function () {});
