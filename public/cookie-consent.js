(function () {
  var KEY = 'lh-analytics-consent';
  try {
    if (localStorage.getItem(KEY)) return;
  } catch (e) { return; }

  function loadGA() {
    var s = document.createElement('script');
    s.src = '/ga.js?v=2';
    document.head.appendChild(s);
  }

  function show() {
    var small = window.matchMedia && window.matchMedia('(max-width:480px)').matches;
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
      'padding:' + (small ? '10px 14px calc(10px + env(safe-area-inset-bottom))' : '20px 36px'),
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'gap:' + (small ? '8px' : '16px'),
      'flex-wrap:wrap',
      'font-family:inherit',
      'font-size:' + (small ? '12px' : '14px'),
      'line-height:' + (small ? '1.35' : '1.5'),
      'box-shadow:0 -2px 16px rgba(0,0,0,0.2)',
    ].join(';');

    var text = document.createElement('p');
    text.style.cssText = 'margin:0;flex:1;min-width:' + (small ? '100%' : '200px');
    text.style.color = 'rgba(250,246,236,0.9)';
    var words = function () {
      var fr = document.documentElement.getAttribute('data-lang') === 'fr' || (document.documentElement.lang || '').indexOf('fr') === 0;
      if ((document.documentElement.lang || '').indexOf('es') === 0) {
        text.innerHTML = 'Usamos herramientas de análisis para entender cómo llegan las personas a Letterhome. <a href="/privacy" style="color:#ffb3a6;text-decoration:underline">Política de privacidad</a>.';
        decline.textContent = 'Rechazar';
        accept.textContent = 'Aceptar';
        return;
      }
      text.innerHTML = (fr ? 'Nous utilisons des outils d\'analyse pour comprendre comment les gens trouvent Letterhome. ' : 'We use analytics to understand how people find Letterhome. ') +
        '<a href="/privacy" style="color:#ffb3a6;text-decoration:underline">' + (fr ? 'Politique de confidentialité' : 'Privacy policy') + '</a>.';
      decline.textContent = fr ? 'Refuser' : 'Decline';
      accept.textContent = fr ? 'Accepter' : 'Accept';
    };

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;flex-shrink:0' + (small ? ';width:100%' : '');

    var decline = document.createElement('button');
    decline.textContent = 'Decline';
    decline.style.cssText = 'background:transparent;color:rgba(250,246,236,0.7);border:1px solid rgba(250,246,236,0.3);padding:' + (small ? '11px 12px' : '11px 20px') + ';cursor:pointer;font-family:inherit;font-size:' + (small ? '12px' : '13px') + ';letter-spacing:0.04em;text-transform:uppercase' + (small ? ';flex:1' : '');

    var accept = document.createElement('button');
    accept.textContent = 'Accept';
    accept.style.cssText = 'background:#bf2d3a;color:#fff;border:none;padding:' + (small ? '11px 12px' : '11px 20px') + ';cursor:pointer;font-family:inherit;font-size:' + (small ? '12px' : '13px') + ';letter-spacing:0.04em;text-transform:uppercase' + (small ? ';flex:1' : '');

    decline.addEventListener('click', function () {
      try { localStorage.setItem(KEY, 'no'); } catch (e) {}
      banner.remove();
    });

    accept.addEventListener('click', function () {
      try { localStorage.setItem(KEY, 'yes'); } catch (e) {}
      banner.remove();
      loadGA();
    });

    words();
    document.addEventListener('lh:lang', words);
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
