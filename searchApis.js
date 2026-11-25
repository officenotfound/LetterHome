'use strict';
// Daily fetch of search results from the Google Search Console API and the Bing Webmaster API into the same
// tables the Search screen already reads (see adminTools.js). The keys are saved from the admin, never shown again,
// and never logged. Every address called here is fixed in this file.
const { createSign } = require('node:crypto');

const KEEP = 12;
const GOOGLE = 'https://www.googleapis.com/webmasters/v3';
const BING = 'https://ssl.bing.com/webmaster/api.svc/json';
const COUNTRIES = { can: 'Canada', usa: 'United States', gbr: 'United Kingdom', aus: 'Australia', nzl: 'New Zealand', ind: 'India', phl: 'Philippines',
  deu: 'Germany', fra: 'France', mex: 'Mexico', nga: 'Nigeria', pak: 'Pakistan', irl: 'Ireland', are: 'United Arab Emirates', zaf: 'South Africa',
  chn: 'China', hkg: 'Hong Kong', jpn: 'Japan', bra: 'Brazil', esp: 'Spain', ita: 'Italy', nld: 'Netherlands', sgp: 'Singapore', ken: 'Kenya' };
const day = ms => new Date(ms).toISOString().slice(0, 10);

// Which of our sites a property address belongs to.
function siteOfProperty(url) {
  const m = String(url || '').toLowerCase().match(/^(?:sc-domain:|https?:\/\/)?(?:www\.)?(letterhome\.(?:ca|us|co\.uk))(\/au\/?)?\/?$/);
  if (!m) return null;
  if (m[2]) return m[1] === 'letterhome.ca' ? 'au' : null;
  return { 'letterhome.ca': 'ca', 'letterhome.us': 'us', 'letterhome.co.uk': 'uk' }[m[1]];
}

// One property per site: the whole-domain one if there is one, else the https one.
function pickProperties(urls) {
  const rank = u => (u.startsWith('sc-domain:') ? 0 : u.startsWith('https://') ? 1 : 2);
  const out = {};
  for (const u of [...urls].sort((a, b) => rank(a) - rank(b))) { const s = siteOfProperty(u); if (s && !out[s]) out[s] = u; }
  return out;
}

function parseServiceKey(text) {
  let k;
  try { k = JSON.parse(String(text)); } catch { throw new Error('That is not the key file Google gave you (it should be a .json file).'); }
  if (k?.type !== 'service_account' || !/@[\w.-]+\.gserviceaccount\.com$/.test(k.client_email || '') || !/PRIVATE KEY/.test(k.private_key || '')) {
    throw new Error('That file is not a service account key.');
  }
  return { client_email: k.client_email, private_key: k.private_key };
}

async function call(fetchImpl, who, url, opts = {}) {
  let r;
  try { r = await fetchImpl(url, { ...opts, signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error(`Could not reach ${who}.`); }   // no detail: a Bing address carries the key
  if (!r.ok) {
    if (r.status === 401) throw new Error(`${who} refused the key.`);
    if (r.status === 403) throw new Error(`${who} says this key may not read the site.`);
    throw new Error(`${who} answered with error ${r.status}.`);
  }
  return r.json();
}

async function googleToken(fetchImpl, key) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const jwt = head + '.' + createSign('RSA-SHA256').update(head).sign(key.private_key).toString('base64url');
  const j = await call(fetchImpl, 'Google', 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString(),
  });
  return j.access_token;
}

async function googleData(fetchImpl, token, property, now) {
  const range = { startDate: day(now - 30 * 86400000), endDate: day(now - 2 * 86400000) };   // 28 days; Google runs 2 days behind
  const ask = async (dimension, rowLimit) => {
    const j = await call(fetchImpl, 'Google', `${GOOGLE}/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...range, dimensions: [dimension], rowLimit }),
    });
    return (j.rows || []).map(r => ({ key: String(r.keys[0]).slice(0, 500), clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: r.ctr || 0, position: r.position || 0 }));
  };
  const queries = await ask('query', 2000), pages = await ask('page', 2000), chart = await ask('date', 100);
  const countries = (await ask('country', 250)).map(r => ({ ...r, key: COUNTRIES[r.key] || r.key.toUpperCase() }));
  const devices = (await ask('device', 10)).map(r => ({ ...r, key: r.key[0] + r.key.slice(1).toLowerCase() }));
  return { queries, pages, countries, devices, chart };
}

const bingDay = v => { const m = String(v).match(/\/Date\((\d+)/); return m ? day(Number(m[1])) : String(v).slice(0, 10); };

// Bing returns every period it holds; keep the last 28 days and add the periods up per search or page.
function bingRows(list, keyOf, since) {
  const by = new Map();
  for (const r of list || []) {
    if (bingDay(r.Date) < since) continue;
    const key = String(keyOf(r) || '').slice(0, 500);
    if (!key) continue;
    const x = by.get(key) || { key, clicks: 0, impressions: 0, weighted: 0, seen: 0 };
    x.clicks += r.Clicks || 0;
    x.impressions += r.Impressions || 0;
    if (r.AvgImpressionPosition > 0) { x.weighted += r.AvgImpressionPosition * (r.Impressions || 0); x.seen += r.Impressions || 0; }
    by.set(key, x);
  }
  return [...by.values()].map(x => ({ key: x.key, clicks: x.clicks, impressions: x.impressions, ctr: x.impressions ? x.clicks / x.impressions : 0, position: x.seen ? x.weighted / x.seen : 0 }))
    .sort((a, b) => b.impressions - a.impressions).slice(0, 2000);
}

async function bingData(fetchImpl, apiKey, siteUrl, now) {
  const since = day(now - 28 * 86400000);
  const ask = async method => (await call(fetchImpl, 'Bing', `${BING}/${method}?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${encodeURIComponent(apiKey)}`)).d || [];
  return {
    queries: bingRows(await ask('GetQueryStats'), r => r.Query, since),
    pages: bingRows(await ask('GetPageStats'), r => r.Query, since),
    chart: bingRows(await ask('GetRankAndTrafficStats'), r => bingDay(r.Date), since).sort((a, b) => a.key.localeCompare(b.key)),
    countries: [], devices: [],
  };
}

// One kept copy per week: a newer fetch in the same week replaces it, so the history reaches back months.
function store(db, site, engine, data, now) {
  const dates = data.chart.map(r => r.key).sort();
  const from = data.chart.length ? data.chart : data.pages;
  const total = k => Math.round(from.reduce((a, r) => a + r[k], 0));
  const week = d => { const t = new Date(d + 'T00:00:00Z'); return day(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86400000); };
  const label = `API ${week(day(now))}`;
  const drop = id => { db.prepare('DELETE FROM gsc_rows WHERE snapshot_id = ?').run(id); db.prepare('DELETE FROM gsc_snapshots WHERE id = ?').run(id); };
  db.exec('BEGIN');
  try {
    for (const o of db.prepare('SELECT id FROM gsc_snapshots WHERE site = ? AND engine = ? AND filename = ?').all(site, engine, label)) drop(o.id);
    const id = Number(db.prepare('INSERT INTO gsc_snapshots (site, engine, date_from, date_to, clicks, impressions, filename) VALUES (?,?,?,?,?,?,?)')
      .run(site, engine, dates[0] || null, dates[dates.length - 1] || null, total('clicks'), total('impressions'), label).lastInsertRowid);
    const ins = db.prepare('INSERT INTO gsc_rows (snapshot_id, kind, key, clicks, impressions, ctr, position) VALUES (?,?,?,?,?,?,?)');
    for (const [kind, rows] of [['query', data.queries], ['page', data.pages], ['country', data.countries], ['device', data.devices], ['date', data.chart]]) {
      for (const r of rows.slice(0, 2000)) ins.run(id, kind, r.key, r.clicks, r.impressions, r.ctr, r.position);
    }
    for (const o of db.prepare('SELECT id FROM gsc_snapshots WHERE site = ? AND engine = ? ORDER BY id DESC LIMIT -1 OFFSET ?').all(site, engine, KEEP)) drop(o.id);
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

async function fetchAll({ db, getSetting, setSetting, fetchImpl = fetch, now = Date.now() }) {
  const results = [];
  const engine = async (name, label, run) => {
    try { await run(); }
    catch (e) { results.push({ engine: name, ok: false, message: e.message || `${label} failed.` }); }
  };
  const one = async (name, site, getData) => {
    try {
      const data = await getData();
      if (!data.pages.length && !data.queries.length && !data.chart.length) return results.push({ engine: name, site, ok: true, message: 'No data yet.' });
      store(db, site, name, data, now);
      results.push({ engine: name, site, ok: true, message: `${data.queries.length} searches, ${data.pages.length} pages` });
    } catch (e) { results.push({ engine: name, site, ok: false, message: e.message }); }
  };
  const googleKey = getSetting('gsc_service_key', '');
  if (googleKey) await engine('google', 'Google', async () => {
    const token = await googleToken(fetchImpl, parseServiceKey(googleKey));
    const list = await call(fetchImpl, 'Google', `${GOOGLE}/sites`, { headers: { Authorization: `Bearer ${token}` } });
    const props = pickProperties((list.siteEntry || []).filter(s => s.permissionLevel !== 'siteUnverifiedUser').map(s => s.siteUrl));
    if (!Object.keys(props).length) throw new Error('The key works, but it has not been added as a user on any Letterhome site in Search Console.');
    for (const [site, property] of Object.entries(props)) await one('google', site, () => googleData(fetchImpl, token, property, now));
  });
  const bingKey = getSetting('bing_api_key', '');
  if (bingKey) await engine('bing', 'Bing', async () => {
    const list = (await call(fetchImpl, 'Bing', `${BING}/GetUserSites?apikey=${encodeURIComponent(bingKey)}`)).d || [];
    const props = pickProperties(list.filter(s => s.IsVerified !== false).map(s => s.Url));
    if (!Object.keys(props).length) throw new Error('The key works, but no verified Letterhome site is on that Bing account.');
    for (const [site, url] of Object.entries(props)) await one('bing', site, () => bingData(fetchImpl, bingKey, url, now));
  });
  if (results.length) setSetting('search_fetch_last', JSON.stringify({ at: now, results }));
  return results;
}

function status(getSetting) {
  let email = '', last = null;
  try { email = parseServiceKey(getSetting('gsc_service_key', '')).client_email; } catch {}
  try { last = JSON.parse(getSetting('search_fetch_last', '') || 'null'); } catch {}
  return { google: !!email, google_email: email, bing: !!getSetting('bing_api_key', ''), last };
}

function register(app, { db, requireAdmin, logAudit, getSetting, setSetting }) {
  app.get('/api/admin/search-api', requireAdmin, (req, res) => res.json(status(getSetting)));

  app.post('/api/admin/search-api/keys', requireAdmin, (req, res) => {
    const { google, bing, remove } = req.body || {};
    try {
      if (google !== undefined) setSetting('gsc_service_key', JSON.stringify(parseServiceKey(google)));
      if (bing !== undefined) {
        const k = String(bing).trim();
        if (!/^[A-Za-z0-9]{16,100}$/.test(k)) throw new Error('That does not look like a Bing API key.');
        setSetting('bing_api_key', k);
      }
    } catch (e) { return res.status(400).json({ error: e.message }); }
    if (remove === 'google') setSetting('gsc_service_key', '');
    if (remove === 'bing') setSetting('bing_api_key', '');
    logAudit(req, 'search-api.keys', 'settings', remove ? `removed ${remove}` : 'saved', null);
    res.json({ ok: true, ...status(getSetting) });
  });

  app.post('/api/admin/search-api/fetch', requireAdmin, async (req, res) => {
    try { res.json({ ok: true, results: await fetchAll({ db, getSetting, setSetting }) }); }
    catch (e) { console.error('[search-api]', e.message); res.status(500).json({ error: 'The fetch failed.' }); }
  });
}

module.exports = { register, fetchAll, status, siteOfProperty, pickProperties, parseServiceKey, bingRows };
