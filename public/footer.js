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
    '<span class="footer-social">' +
      '<a href="https://www.facebook.com/letterhomeca" target="_blank" rel="noopener" aria-label="Letterhome on Facebook"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.198 21.5h4v-8.01h3.604l.396-3.98h-4V7.5a1 1 0 0 1 1-1h3v-4h-3a5 5 0 0 0-5 5v2.01h-2l-.396 3.98h2.396v8.01Z"/></svg></a>' +
      '<a href="https://x.com/letterhomeca" target="_blank" rel="noopener" aria-label="Letterhome on X"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>' +
      '<a href="https://share.google/9n84eAjgTniCd7RXL" target="_blank" rel="noopener" aria-label="Letterhome on Google"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg></a>' +
    '</span>';

  mount.outerHTML =
    '<footer>' +
      '<div class="footer-bottom">' +
        '<div class="ft-copy">© 2026 Letterhome</div>' +
        '<span class="ft-legal">' +
          '<a href="/privacy" data-i18n="footer.privacy">Privacy</a>' +
          '<a href="/terms" data-i18n="footer.terms">Terms</a>' +
          '<a href="/accessibility" data-i18n="footer.accessibility">Accessibility</a>' +
        '</span>' +
        '<span class="ft-right">' + social +
          '<a href="https://jeffbuilds.ca" target="_blank" rel="noopener" class="ft-credit">Jeffbuilds</a>' +
        '</span>' +
      '</div>' +
    '</footer>';
})();
