// Letterhome theme toggle — light/dark with localStorage persistence
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('lh-theme', next); } catch {}
}

// Nav shadow on scroll
(function () {
  const nav = document.querySelector('nav');
  if (!nav) return;
  window.addEventListener('scroll', function () {
    nav.style.boxShadow = window.scrollY > 8 ? '0 2px 16px rgba(0,0,0,0.07)' : '';
  }, { passive: true });
})();
