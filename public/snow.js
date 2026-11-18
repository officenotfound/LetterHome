// Light falling snow for the Christmas season. Loaded by header.js on the home page and the Letter from Santa pages only.
// Off for visitors who ask for reduced motion, paused while the tab is hidden, and never blocks clicks.
(function () {
  if (window.__lhSnow) return; window.__lhSnow = true;
  try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
  var c = document.createElement('canvas');
  c.setAttribute('aria-hidden', 'true');
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483000';
  var ctx = c.getContext('2d'); if (!ctx) return;
  var w = 0, h = 0, flakes = [], raf = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  function size() {
    w = window.innerWidth; h = window.innerHeight;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.round(Math.min(70, Math.max(26, w / 22)));
    while (flakes.length < n) flakes.push(make(true));
    flakes.length = n;
  }
  function make(anywhere) {
    var r = 1 + Math.random() * 2.6;
    return { x: Math.random() * w, y: anywhere ? Math.random() * h : -6, r: r, v: 0.35 + r * 0.28, d: Math.random() * 6.28, s: 0.004 + Math.random() * 0.012, a: 0.45 + Math.random() * 0.45 };
  }
  function tick() {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.v; f.d += f.s; f.x += Math.sin(f.d) * 0.45;
      if (f.y > h + 6) flakes[i] = f = make(false);
      ctx.globalAlpha = f.a; ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(90,110,140,.55)'; ctx.shadowBlur = 2;   // faint edge so flakes show on white pages too
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.2832); ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  }
  function start() { if (!raf) raf = requestAnimationFrame(tick); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  window.addEventListener('resize', size);
  function go() { document.body.appendChild(c); size(); start(); }
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
})();
