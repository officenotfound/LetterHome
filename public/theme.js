(function () {
  const nav = document.querySelector('nav');
  if (!nav) return;
  window.addEventListener('scroll', function () {
    nav.style.boxShadow = window.scrollY > 8 ? '0 2px 16px rgba(0,0,0,0.07)' : '';
  }, { passive: true });
})();
