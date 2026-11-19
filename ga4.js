// Server-side Google Analytics events (GA4 Measurement Protocol).
// Only ever sent for visitors who accepted the cookie banner: the GA client id comes from their own _ga cookie.
// Without GA4_API_SECRET nothing is sent. No names, emails or addresses are included.
// One GA4 data stream per site. The IDs are public (they appear in every page); each stream has its own API secret.
const STREAMS = {
  ca: { id: () => process.env.GA4_MEASUREMENT_ID || 'G-DF3XQ6ML41',    secret: () => process.env.GA4_API_SECRET },
  uk: { id: () => process.env.GA4_MEASUREMENT_ID_UK || 'G-7F069ML6GE', secret: () => process.env.GA4_API_SECRET_UK },
  us: { id: () => process.env.GA4_MEASUREMENT_ID_US || 'G-HVXM35WRD2', secret: () => process.env.GA4_API_SECRET_US },
};
// Which stream a request belongs to, by the address the visitor is actually on (not by whether the site is switched live).
const siteOfHost = h => { h = String(h || '').toLowerCase().replace(/^www\./, ''); return h === 'letterhome.co.uk' ? 'uk' : h === 'letterhome.us' ? 'us' : 'ca'; };
const stream = site => STREAMS[site] || STREAMS.ca;
const measurementIdFor = site => stream(site).id();

// _ga looks like GA1.1.1234567890.1700000000 ; the session cookie _ga_<ID> is GS1.1.<ts>... or GS2.1.s<ts>$o1...
function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return out;
}

function gaIdsFromCookie(header, site = 'ca') {
  const measurementId = measurementIdFor(site);
  const c = parseCookies(header);
  const m = /^GA\d\.\d\.(\d+\.\d+)$/.exec(c._ga || '');
  if (!m) return { clientId: null, sessionId: null };
  const raw = c['_ga_' + String(measurementId).replace(/^G-/, '')] || '';
  const s = /^GS1\.\d\.(\d+)/.exec(raw) || /^GS2\.\d\.s(\d+)/.exec(raw);
  return { clientId: m[1], sessionId: s ? s[1] : null };
}

function buildPayload(order, name, extra = {}) {
  const currency = String(order.charge_currency || 'CAD').toUpperCase();
  const value = Math.round(Number(order.charge_cents || order.price_cents || 0)) / 100;
  const params = {
    currency, value,
    destination_country: order.destination_country || '',
    letter_type: order.letter_type || 'letter',
    engagement_time_msec: 100,
    items: [{ item_id: order.letter_type || 'letter', item_name: 'Letter to ' + (order.destination_country || ''), price: value, quantity: 1 }],
    ...extra,
  };
  if (order.ga_session_id) params.session_id = Number(order.ga_session_id);
  return { client_id: order.ga_client_id, events: [{ name, params }] };
}

async function sendOrderEvent(order, name, extra = {}, fetchImpl = globalThis.fetch) {
  const secret = stream(order && order.ga_site).secret();
  if (!secret || !order || !order.ga_client_id) return { sent: false };
  try {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementIdFor(order.ga_site))}&api_secret=${encodeURIComponent(secret)}`;
    const r = await fetchImpl(url, { method: 'POST', body: JSON.stringify(buildPayload(order, name, extra)), signal: AbortSignal.timeout(5000) });
    return { sent: r.status >= 200 && r.status < 300 };
  } catch (e) {
    console.error('[ga4]', name, e.message);
    return { sent: false };
  }
}

module.exports = { siteOfHost, measurementIdFor, gaIdsFromCookie, buildPayload, sendOrderEvent };
