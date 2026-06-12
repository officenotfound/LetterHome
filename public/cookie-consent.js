(function () {
  var KEY = 'lh-analytics-consent';
  try {
    if (localStorage.getItem(KEY)) return;
  } catch (e) { return; }

  function loadGA() {
    var s = document.createElement('script');
    s.src = '/ga.js';
    document.head.appendChild(s);
  }

  function show() {
    var banner = document.createElement('div');
    banner.id = 'lh-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie preferences');
    banner.style.cssText = [
      'position:fixed',
      'bottom:0',
      'left:0',
      'right:0',
      'z-index:9999',
      'background:#2a2a2a',
      'color:rgba(250,246,236,0.85)',
      'padding:20px 36px',
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'gap:16px',
      'flex-wrap:wrap',
      'font-family:inherit',
      'font-size:14px',
      'line-height:1.5',
      'box-shadow:0 -2px 16px rgba(0,0,0,0.2)',
    ].join(';');

    var text = document.createElement('p');
    text.style.cssText = 'margin:0;flex:1;min-width:200px';
    text.innerHTML = 'We use analytics to understand how people find Letterhome. <a href="/privacy" style="color:#b85540;text-decoration:underline">Privacy policy</a>.';

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;flex-shrink:0';

    var decline = document.createElement('button');
    decline.textContent = 'Decline';
    decline.style.cssText = 'background:transparent;color:rgba(250,246,236,0.7);border:1px solid rgba(250,246,236,0.3);padding:9px 18px;cursor:pointer;font-family:inherit;font-size:13px;letter-spacing:0.04em;text-transform:uppercase';

    var accept = document.createElement('button');
    accept.textContent = 'Accept';
    accept.style.cssText = 'background:#a8472d;color:#faf6ec;border:none;padding:9px 18px;cursor:pointer;font-family:inherit;font-size:13px;letter-spacing:0.04em;text-transform:uppercase';

    decline.addEventListener('click', function () {
      try { localStorage.setItem(KEY, 'no'); } catch (e) {}
      banner.remove();
    });

    accept.addEventListener('click', function () {
      try { localStorage.setItem(KEY, 'yes'); } catch (e) {}
      banner.remove();
      loadGA();
    });

    btns.appendChild(decline);
    btns.appendChild(accept);
    banner.appendChild(text);
    banner.appendChild(btns);
    document.body.appendChild(banner);
    accept.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
})();
