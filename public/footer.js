// Single source of truth for the site footer. Every page includes a
// <footer id="site-footer"></footer> placeholder plus this script; the markup
// below is injected into it, so the footer can only ever be edited in one place.
//
// The script is loaded with `defer`, so it runs after the document is parsed
// but BEFORE DOMContentLoaded — which means lang.js's DOMContentLoaded pass (and
// its live EN/FR toggle) still translate the data-i18n labels here. Pages that
// don't load lang.js simply show the English default text.
(function () {
  var mount = document.getElementById('site-footer');
  if (!mount) return;

  var social =
    '<span class="footer-social">' +
      '<a href="https://www.facebook.com/letterhomeca" target="_blank" rel="noopener" aria-label="Letterhome on Facebook"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.198 21.5h4v-8.01h3.604l.396-3.98h-4V7.5a1 1 0 0 1 1-1h3v-4h-3a5 5 0 0 0-5 5v2.01h-2l-.396 3.98h2.396v8.01Z"/></svg></a>' +
      '<a href="https://www.instagram.com/letterhomeca" target="_blank" rel="noopener" aria-label="Letterhome on Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><line x1="17.3" y1="6.7" x2="17.3" y2="6.7" stroke-width="2.4" stroke-linecap="round"/></svg></a>' +
      '<a href="https://x.com/letterhomeca" target="_blank" rel="noopener" aria-label="Letterhome on X"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>' +
    '</span>';

  mount.outerHTML =
    '<footer>' +
      '<div class="footer-bottom">' +
        '<div>© 2026 Letterhome</div>' +
        '<div class="footer-bottom-links">' + social +
          '<a href="/guides">Guides</a>' +
          '<a href="/privacy" data-i18n="footer.privacy">Privacy</a>' +
          '<a href="/terms" data-i18n="footer.terms">Terms</a>' +
          '<a href="https://jeffbuilds.ca" target="_blank" rel="noopener" style="opacity:0.6">Jeffbuilds</a>' +
        '</div>' +
      '</div>' +
    '</footer>';
})();
