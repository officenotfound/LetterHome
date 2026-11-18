// Snow falling inside the green Christmas bar (the .season-bar that header.js adds in season). Nothing else on the page moves.
// Off for visitors who ask for reduced motion, paused while the tab is hidden, and never blocks clicks.
(function () {
  if (window.__lhSnow) return; window.__lhSnow = true;
  try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
  var bar = document.querySelector('.season-bar'); if (!bar) return;
  var c = document.createElement('canvas');
  c.setAttribute('aria-hidden', 'true');
  c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:0';
  var ctx = c.getContext('2d'); if (!ctx) return;
  var w = 0, h = 0, flakes = [], raf = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  function make(anywhere) {
    var r = 1.3 + Math.random() * 2.2;
    return { x: Math.random() * w, y: anywhere ? Math.random() * h : -4, r: r, v: 0.22 + r * 0.16, d: Math.random() * 6.28, s: 0.01 + Math.random() * 0.02, a: 0.55 + Math.random() * 0.45 };
  }
  function size() {
    w = bar.clientWidth; h = bar.clientHeight;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.round(Math.min(80, Math.max(24, w / 11)));
    while (flakes.length < n) flakes.push(make(true));
    flakes.length = n;
  }
  function tick() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.v; f.d += f.s; f.x += Math.sin(f.d) * 0.3;
      if (f.y > h + 4) flakes[i] = f = make(false);
      ctx.globalAlpha = f.a;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.2832); ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  }
  function start() { if (!raf) raf = requestAnimationFrame(tick); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  if (window.ResizeObserver) new ResizeObserver(size).observe(bar); else window.addEventListener('resize', size);
  bar.insertBefore(c, bar.firstChild); size(); start();
})();
