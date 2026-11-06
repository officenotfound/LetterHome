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
      '<a href="https://share.google/9n84eAjgTniCd7RXL" target="_blank" rel="noopener" aria-label="Letterhome on Google"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg></a>' +
    '</div>';
  var stamp = window.LHStamp ? window.LHStamp('f', 34) : '';
  // Only the links a visitor expects in a footer. Anything already in the header or on the home page stays out.
  var row = function (label, links) {
    return '<div class="lh-f-row" role="navigation" aria-label="' + label + '">' +
      links.map(function (l) { return '<a href="' + l[0] + '" data-i18n="' + l[2] + '">' + l[1] + '</a>'; }).join('') + '</div>';
  };
  mount.outerHTML =
    '<footer class="lh-footer"><div class="lh-f-in">' +
      '<div class="lh-f-brand"><div class="lh-f-logo"><span class="lh-f-stamp" aria-hidden="true">' + stamp + '</span><span class="lh-f-word">Letter<em>home</em></span></div>' +
      '<p data-i18n="footer.blurb">We print and mail your letters for you. Built for Canadians abroad, useful to anyone who needs Canadian post without the trip.</p>' + social + '</div>' +
      '<div class="lh-f-nav">' +
      row('Countries', [['/', 'Canada', 'footer.ca'], ['/us', 'United States', 'footer.us'], ['/uk', 'United Kingdom', 'footer.uk'], ['/au', 'Australia', 'footer.au']]) +
      row('Information', [['/about', 'About', 'footer.about'], ['/contact', 'Contact', 'nav.contact'], ['/guides', 'Mailing guides', 'footer.guides'], ['/terms', 'Terms', 'footer.terms'], ['/refunds', 'Refund policy', 'footer.refunds'], ['/accessibility', 'Accessibility', 'footer.accessibility']]) +
      '</div>' +
    '</div><div class="lh-f-bar"><div class="lh-f-in2"><span>© 2026 Letterhome</span><a href="/privacy" data-i18n="footer.privacy">Privacy</a><a href="https://jeffbuilds.ca" target="_blank" rel="noopener">Jeffbuilds</a></div></div></footer>';
})();
