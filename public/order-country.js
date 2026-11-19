// Which country's look the ordering pages (send, track, confirmation, account) use. Runs in <head>, before first paint.
//   letterhome.us      -> US, letterhome.co.uk -> UK (always)
//   anywhere else      -> the country the visitor came in through, remembered for the visit: ?cur=USD|GBP|AUD from the
//                         /us, /uk and /au pages. Plain letterhome.ca visitors stay on the Canadian look.
// The currency follows the country domain too, so an order started on letterhome.us is priced in US dollars even
// when the visitor arrived without ?cur=.
(function () {
  var BY_HOST = { 'letterhome.us': 'us', 'www.letterhome.us': 'us', 'letterhome.co.uk': 'uk', 'www.letterhome.co.uk': 'uk' };
  var BY_CUR  = { USD: 'us', GBP: 'uk', AUD: 'au' };
  var CUR     = { us: 'USD', uk: 'GBP', au: 'AUD' };
  var LANG    = { us: 'en-US', uk: 'en-GB', au: 'en-AU' };
  var c = BY_HOST[location.hostname] || '';
  try {
    if (!c) {
      var q = (new URLSearchParams(location.search).get('cur') || '').toUpperCase();
      var cur = q || sessionStorage.getItem('lh_cur') || '';
      c = BY_CUR[cur] || '';
    } else {
      sessionStorage.setItem('lh_cur', CUR[c]);
    }
  } catch (e) {}
  if (!c) return;
  var el = document.documentElement;
  el.setAttribute('data-country', c);
  el.setAttribute('lang', LANG[c]);
  window.LH_COUNTRY = c;
  // The country looks are deliberately light (white cards, each country's own colours). The pages also follow the device's
  // dark mode, and the two together left white cards with cream text that could not be read, so these pages stay light.
  var keepLight = function () { if (el.getAttribute('data-theme') !== 'light') el.setAttribute('data-theme', 'light'); };
  keepLight();
  try { new MutationObserver(keepLight).observe(el, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}
  // Tab title: no "from Canada" on the country sites.
  var NAME = { us: 'USA', uk: 'UK', au: 'Australia' };
  document.addEventListener('DOMContentLoaded', function () {
    var t = document.title;
    if (/Letterhome$/.test(t)) document.title = t.replace(/ from Canada/, '').replace(/\| Letterhome$/, '| Letterhome ' + NAME[c]);
  });
})();

// Info pages (About, Contact, Privacy, Terms...) wear the country's theme classes, so they match the country's own pages.
document.addEventListener('DOMContentLoaded', function () {
  var c = document.documentElement.getAttribute('data-country');
  if (c && document.body && document.body.hasAttribute('data-info')) document.body.classList.add('c-' + c);
});
