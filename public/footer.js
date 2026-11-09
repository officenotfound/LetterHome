// Single source of truth for the site footer. Every page includes a
// <footer id="site-footer"></footer> placeholder plus this script; the markup
// below is injected into it, so the footer can only ever be edited in one place.
//
// The script is loaded with `defer`, so it runs after the document is parsed
// but BEFORE DOMContentLoaded, which means lang.js's DOMContentLoaded pass (and
// its live EN/FR toggle) still translate the data-i18n labels here. Pages that
// don't load lang.js simply show the English default text.
(function () {
  var mount = document.getElementById('site-footer');
  if (!mount) return;

  var social =
    '<div class="lh-f-social">' +
      '<a href="https://www.facebook.com/letterhomeca" target="_blank" rel="noopener" aria-label="Letterhome on Facebook"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.198 21.5h4v-8.01h3.604l.396-3.98h-4V7.5a1 1 0 0 1 1-1h3v-4h-3a5 5 0 0 0-5 5v2.01h-2l-.396 3.98h2.396v8.01Z"/></svg></a>' +
      '<a href="https://x.com/letterhomeca" target="_blank" rel="noopener" aria-label="Letterhome on X"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>' +
      '<a href="https://www.linkedin.com/company/letterhome" target="_blank" rel="noopener" aria-label="Letterhome on LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z"/></svg></a>' +
      '<a href="https://www.google.com/maps?cid=17816876555793881554" target="_blank" rel="noopener" aria-label="Letterhome on Google"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg></a>' +
    '</div>';
  var stamp = window.LHStamp ? window.LHStamp('f', 34) : '';
  // Only the links a visitor expects in a footer. Anything already in the header or on the home page stays out.
  var row = function (label, links) {
    return '<div class="lh-f-row" role="navigation" aria-label="' + label + '">' +
      links.map(function (l) { return '<a href="' + l[0] + '"' + (l[2] ? ' data-i18n="' + l[2] + '"' : '') + '>' + l[1] + '</a>'; }).join('') + '</div>';
  };
  // On a country domain (letterhome.us, letterhome.co.uk) the home page is that country's page, so the Canada link has
  // to be absolute. Other country links are plain paths: the server sends them to the right domain.
  var H = location.hostname.replace(/^www\./, '');
  var onCountryHost = H === 'letterhome.us' || H === 'letterhome.co.uk';
  var caHome = onCountryHost ? 'https://letterhome.ca/' : '/';
  var auHome = onCountryHost ? 'https://letterhome.ca/au' : '/au';
  var usHome = H === 'letterhome.us' ? '/' : '/us';
  var ukHome = H === 'letterhome.co.uk' ? '/' : '/uk';
  // Until the .us domain is switched on, the US pages on letterhome.ca show the .us address in the footer.
  var onUs = H !== 'letterhome.us' && (location.pathname === '/us' || location.pathname.indexOf('/us/') === 0);
  var usDomain = onUs ? '<a href="https://letterhome.us" data-us-domain>letterhome.us</a>' : '';
  mount.outerHTML =
    '<footer class="lh-footer"><div class="lh-f-in">' +
      '<div class="lh-f-brand"><div class="lh-f-logo"><span class="lh-f-stamp" aria-hidden="true">' + stamp + '</span><span class="lh-f-word">Letter<em>home</em></span></div>' +
      '<p data-i18n="footer.blurb">We print and mail your letters for you. Built for Canadians abroad, useful to anyone who needs Canadian post without the trip.</p>' + social + '</div>' +
      '<div class="lh-f-nav">' +
      row('Countries', [[caHome, 'Canada', 'footer.ca'], [usHome, 'United States', 'footer.us'], [ukHome, 'United Kingdom', 'footer.uk'], [auHome, 'Australia', 'footer.au']]) +
      row('Information', [['/about', 'About', 'footer.about'], ['/contact', 'Contact', 'nav.contact'], ['/guides', 'Mailing guides', 'footer.guides'], ['/terms', 'Terms', 'footer.terms'], ['/refunds', 'Refund policy', 'footer.refunds'], ['/accessibility', 'Accessibility', 'footer.accessibility']]) +
      '</div>' +
    '</div><div class="lh-f-bar"><div class="lh-f-in2"><span>© 2026 Letterhome</span>' + usDomain + '<a href="/privacy" data-i18n="footer.privacy">Privacy</a><a href="https://jeffbuilds.ca" target="_blank" rel="noopener">Jeffbuilds</a></div></div></footer>';
  // The "home" in the footer wordmark takes the exact colour of the header's, on every page, theme and country look.
  function syncAccent() {
    var src = document.querySelector('nav .logo-accent, header .logo-accent, .logo-accent'), em = document.querySelector('.lh-f-word em');
    if (!src || !em) return;
    var c = getComputedStyle(src).color;
    if (c) em.style.setProperty('color', c, 'important');
  }
  syncAccent();
  window.addEventListener('load', syncAccent);
  try { new MutationObserver(function () { setTimeout(syncAccent, 50); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-country', 'class'] }); } catch (e) {}
})();
