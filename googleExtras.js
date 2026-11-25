'use strict';
// Google extras for the admin, using the same service account as the search fetch:
//   - URL Inspection: which of our sitemap pages Google has indexed
//   - PageSpeed Insights: phone speed scores for the main pages (needs a plain API key)
//   - Analytics Data API: visitor numbers (needs the GA4 property numbers, and the account added as a Viewer)
// Plus the weekly summary shown on the dashboard. Every address called here is fixed in this file or in searchApis.js.
const { pickProperties, parseServiceKey, googleToken, call } = require('./searchApis');
const { SITES, PRIMARY } = require('./sites');

const SPEED_PAGES = [
  'https://letterhome.ca/', 'https://letterhome.ca/send', 'https://letterhome.ca/santa-letter', 'https://letterhome.ca/guides',
  'https://letterhome.ca/how-much-does-it-cost-to-mail-a-letter-to-canada', 'https://letterhome.us/', 'https://letterhome.co.uk/',
];
const PER_SITE_PER_RUN = 200;   // Google allows 2000 inspections a day per site
const GA_WAIT_MS = 6 * 60 * 60 * 1000;

function schema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS index_status (url TEXT PRIMARY KEY, site TEXT NOT NULL, verdict TEXT, coverage TEXT, last_crawl TEXT, checked_at TEXT NOT NULL)`);
  try { db.exec('ALTER TABLE index_status ADD COLUMN detail TEXT'); } catch {}   // the rest of Google's answer, for the page helper
  db.exec(`CREATE TABLE IF NOT EXISTS speed_results (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, score INTEGER, lcp_ms INTEGER, cls REAL, tbt_ms INTEGER, error TEXT, checked_at TEXT NOT NULL)`);
}

const siteOfHost = host => (host === PRIMARY ? 'ca' : (SITES.find(s => s.host === host) || {}).key || null);

const INSPECT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

// Asks Google about one page and keeps the answer.
async function inspect({ db, auth, property, site, url, fetchImpl, now }) {
  const j = await call(fetchImpl, 'Google', INSPECT, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
  });
  const s = j.inspectionResult?.indexStatusResult || {};
  const detail = { robots: s.robotsTxtState, indexing: s.indexingState, fetch: s.pageFetchState, googleCanonical: s.googleCanonical, userCanonical: s.userCanonical };
  db.prepare(`INSERT INTO index_status (url, site, verdict, coverage, last_crawl, checked_at, detail) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(url) DO UPDATE SET site=excluded.site, verdict=excluded.verdict, coverage=excluded.coverage, last_crawl=excluded.last_crawl, checked_at=excluded.checked_at, detail=excluded.detail`)
    .run(url, site, s.verdict || 'UNKNOWN', String(s.coverageState || '').slice(0, 200), String(s.lastCrawlTime || '').slice(0, 10) || null, now().toISOString(), JSON.stringify(detail).slice(0, 2000));
}

async function inspectPage({ db, getSetting, url, fetchImpl = fetch, now = () => new Date() }) {
  const raw = getSetting('gsc_service_key', '');
  if (!raw) throw new Error('Add the Google key file on the Search screen first.');
  const auth = { Authorization: `Bearer ${await googleToken(fetchImpl, parseServiceKey(raw))}` };
  const list = await call(fetchImpl, 'Google', 'https://www.googleapis.com/webmasters/v3/sites', { headers: auth });
  const props = pickProperties((list.siteEntry || []).map(s => s.siteUrl));
  const site = siteOfHost(new URL(url).host);
  if (!site || !props[site]) throw new Error('This site is not in Search Console for this key.');
  await inspect({ db, auth, property: props[site], site, url, fetchImpl, now });
}

// Which sitemap pages to look at next, per site: never checked first, then the ones checked longest ago.
function duePages(db, byHost, limit = PER_SITE_PER_RUN) {
  const seen = new Map(db.prepare('SELECT url, checked_at FROM index_status').all().map(r => [r.url, r.checked_at]));
  const out = {};
  for (const [host, urls] of byHost) {
    const site = siteOfHost(host);
    if (!site) continue;
    out[site] = [...urls].sort((a, b) => String(seen.get(a) || '').localeCompare(String(seen.get(b) || ''))).slice(0, limit);
  }
  return out;
}

async function checkIndex({ db, getSetting, setSetting, pages, fetchImpl = fetch, now = () => new Date() }) {
  const raw = getSetting('gsc_service_key', '');
  if (!raw) throw new Error('Add the Google key file on the Search screen first.');
  const token = await googleToken(fetchImpl, parseServiceKey(raw));
  const auth = { Authorization: `Bearer ${token}` };
  const list = await call(fetchImpl, 'Google', 'https://www.googleapis.com/webmasters/v3/sites', { headers: auth });
  const props = pickProperties((list.siteEntry || []).map(s => s.siteUrl));
  const urls = pages();
  // Forget pages that left the sitemap.
  const live = new Set([...urls.values()].flat());
  for (const r of db.prepare('SELECT url FROM index_status').all()) if (!live.has(r.url)) db.prepare('DELETE FROM index_status WHERE url = ?').run(r.url);
  const messages = [];
  for (const [site, due] of Object.entries(duePages(db, urls))) {
    if (!props[site]) { messages.push(`${site}: no Search Console property for this key.`); continue; }
    let done = 0;
    for (const url of due) {
      try {
        await inspect({ db, auth, property: props[site], site, url, fetchImpl, now });
        done++;
      } catch (e) {
        messages.push(`${site}: ${/may not read/.test(e.message) ? 'Google refused. In Search Console this account may need Full instead of Restricted access.' : e.message}`);
        break;   // the same answer would come back for every page
      }
    }
    if (done) messages.push(`${site}: ${done} pages checked.`);
  }
  setSetting('index_check_last', JSON.stringify({ at: now().toISOString(), messages }));
  return messages;
}

async function checkSpeed({ db, getSetting, setSetting, fetchImpl = fetch, now = () => new Date(), urls = SPEED_PAGES }) {
  const key = getSetting('pagespeed_api_key', '');
  if (!key) throw new Error('Add the PageSpeed API key first.');
  for (const col of ['a11y', 'practices', 'seo']) { try { db.exec(`ALTER TABLE speed_results ADD COLUMN ${col} INTEGER`); } catch {} }
  const save = db.prepare('INSERT INTO speed_results (url, score, lcp_ms, cls, tbt_ms, error, checked_at, a11y, practices, seo) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const at = now().toISOString();
  for (const url of urls) {
    try {
      let r;
      try { r = await fetchImpl(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(90000) }); }
      catch { throw new Error('Could not reach PageSpeed.'); }   // no detail: the address carries the key
      if (!r.ok) throw new Error(r.status === 400 || r.status === 403 ? 'Google refused the key, or the PageSpeed Insights API is not enabled.' : `PageSpeed answered with error ${r.status}.`);
      const lh = (await r.json()).lighthouseResult || {};
      const val = id => lh.audits?.[id]?.numericValue;
      const mark = id => (lh.categories?.[id]?.score == null ? null : Math.round(lh.categories[id].score * 100));
      save.run(url, Math.round((lh.categories?.performance?.score || 0) * 100), Math.round(val('largest-contentful-paint') || 0), Math.round((val('cumulative-layout-shift') || 0) * 1000) / 1000, Math.round(val('total-blocking-time') || 0), null, at, mark('accessibility'), mark('best-practices'), mark('seo'));
    } catch (e) { save.run(url, null, null, null, null, e.message, at, null, null, null); }
  }
  db.prepare("DELETE FROM speed_results WHERE checked_at < ?").run(new Date(now().getTime() - 120 * 86400000).toISOString());
  setSetting('speed_check_last', at);
}

async function analytics({ getSetting, setSetting, fetchImpl = fetch, now = Date.now() }) {
  const ids = getSetting('ga4_property_ids', '').split(',').map(s => s.trim()).filter(s => /^\d{6,15}$/.test(s));
  const raw = getSetting('gsc_service_key', '');
  if (!ids.length || !raw) return { configured: false };
  let saved = {};
  try { saved = JSON.parse(getSetting('ga_cache', '{}')) || {}; } catch {}
  if (saved.ids === ids.join() && now - saved.at < GA_WAIT_MS) return saved;
  const properties = [];
  try {
    const token = await googleToken(fetchImpl, parseServiceKey(raw), 'analytics.readonly');
    for (const id of ids) {
      const report = body => call(fetchImpl, 'Google Analytics', `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      try {
        const metrics = [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }];
        const totals = await report({ metrics, dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }, { startDate: '14daysAgo', endDate: '8daysAgo' }] });
        const channels = await report({ metrics: [{ name: 'sessions' }], dimensions: [{ name: 'sessionDefaultChannelGroup' }], dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }], limit: 8, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }] });
        const range = name => ((totals.rows || []).find(r => (r.dimensionValues?.[0]?.value || 'date_range_0') === name)?.metricValues || []).map(v => Number(v.value) || 0);
        properties.push({ id, week: range('date_range_0'), before: range('date_range_1'), channels: (channels.rows || []).map(r => ({ name: r.dimensionValues[0].value, sessions: Number(r.metricValues[0].value) || 0 })) });
      } catch (e) {
        properties.push({ id, error: /may not read/.test(e.message) ? 'Google refused. Enable the Google Analytics Data API and add the account as a Viewer on this property.' : e.message });
      }
    }
  } catch (e) { return { configured: true, error: e.message, properties: [] }; }
  saved = { configured: true, ids: ids.join(), at: now, properties };
  setSetting('ga_cache', JSON.stringify(saved));
  return saved;
}

// The week at a glance for the dashboard, from what is already stored. `todo` is in order of importance.
function pulse(db, getSetting, now = Date.now()) {
  const stamp = d => new Date(now - d * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const one = (sql, ...a) => { try { return db.prepare(sql).get(...a) || {}; } catch { return {}; } };
  const all = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } };
  const orders = (from, to) => one(`SELECT COUNT(*) n, COALESCE(SUM(price_cents), 0) cents FROM orders WHERE status NOT IN ('awaiting_payment','refunded','cancelled') AND deleted_at IS NULL AND split_from IS NULL AND created_at >= ? AND created_at < ?`, stamp(from), stamp(to));
  const visitors = (from, to) => one(`SELECT COUNT(DISTINCT ip) n FROM page_views WHERE COALESCE(bot_name, '') = '' AND created_at >= ? AND created_at < ?`, stamp(from), stamp(to)).n || 0;
  const search = ['google', 'bing'].map(engine => {
    const sum = { engine, clicks: 0, impressions: 0, before_clicks: null, before_impressions: null };
    for (const site of ['ca', 'us', 'uk']) {
      const snaps = all('SELECT date_to, clicks, impressions FROM gsc_snapshots WHERE site = ? AND engine = ? ORDER BY id DESC LIMIT 12', site, engine);
      if (!snaps.length) continue;
      sum.clicks += snaps[0].clicks; sum.impressions += snaps[0].impressions;
      const cut = snaps[0].date_to ? new Date(Date.parse(snaps[0].date_to) - 6 * 86400000).toISOString().slice(0, 10) : '';
      const prev = snaps.slice(1).find(s => s.date_to && s.date_to <= cut);
      if (prev) { sum.before_clicks = (sum.before_clicks || 0) + prev.clicks; sum.before_impressions = (sum.before_impressions || 0) + prev.impressions; }
    }
    return sum;
  });

  const todo = [];
  for (const key of ['search_fetch_last']) {
    let last = null;
    try { last = JSON.parse(getSetting(key, '') || 'null'); } catch {}
    const bad = (last?.results || []).filter(r => !r.ok);
    if (bad.length) todo.push({ text: `The search fetch failed: ${bad[0].message}`, href: '/admin/growth' });
  }
  const stuck = one(`SELECT code, COUNT(*) n FROM form_problems WHERE day >= ? GROUP BY code ORDER BY n DESC LIMIT 1`, stamp(7).slice(0, 10));
  if (stuck.n >= 3) todo.push({ code: stuck.code, count: stuck.n, href: '/admin/funnel' });
  const slow = one(`SELECT COUNT(*) n FROM speed_results WHERE checked_at = (SELECT MAX(checked_at) FROM speed_results) AND score IS NOT NULL AND score < 50`).n;
  if (slow) todo.push({ text: `${slow} main page${slow === 1 ? ' is' : 's are'} slow on phones.`, href: '/admin/google' });
  const missing = one(`SELECT COUNT(*) n FROM index_status WHERE verdict != 'PASS'`).n;
  if (missing) todo.push({ text: `Google has not indexed ${missing} page${missing === 1 ? '' : 's'}.`, href: '/admin/google' });
  const quiet = one(`SELECT COUNT(*) n FROM gsc_rows WHERE kind = 'page' AND position > 0 AND position <= 10.5 AND impressions >= 40 AND ctr < 0.01
    AND snapshot_id IN (SELECT MAX(id) FROM gsc_snapshots GROUP BY site, engine)`).n;
  if (quiet) todo.push({ text: `${quiet} page${quiet === 1 ? ' shows' : 's show'} on page one but few people click. Better titles could help.`, href: '/admin/growth' });

  return {
    orders: { week: orders(7, -1), before: orders(14, 7) },
    visitors: { week: visitors(7, -1), before: visitors(14, 7) },
    search, todo,
  };
}

function register(app, { db, requireAdmin, logAudit, getSetting, setSetting, pages }) {
  schema(db);
  const running = { index: false, speed: false };
  // These take minutes, so the button starts them and the screen shows the result when it is reloaded.
  function start(kind) {
    if (running[kind]) return false;
    running[kind] = true;
    const job = kind === 'index' ? checkIndex({ db, getSetting, setSetting, pages }) : checkSpeed({ db, getSetting, setSetting });
    job.catch(e => {
      console.error(`[${kind}-check]`, e.message);
      if (kind === 'index') setSetting('index_check_last', JSON.stringify({ at: new Date().toISOString(), messages: [e.message] }));
    }).finally(() => { running[kind] = false; });
    return true;
  }

  app.get('/api/admin/pulse', requireAdmin, (req, res) => {
    try { res.json(pulse(db, getSetting)); } catch (e) { console.error('[pulse]', e.message); res.status(500).json({ error: 'Could not load the summary.' }); }
  });

  app.get('/api/admin/google', requireAdmin, async (req, res) => {
    try {
      let indexLast = null;
      try { indexLast = JSON.parse(getSetting('index_check_last', '') || 'null'); } catch {}
      res.json({
        has_google_key: !!getSetting('gsc_service_key', ''), has_speed_key: !!getSetting('pagespeed_api_key', ''),
        ga_ids: getSetting('ga4_property_ids', ''), running,
        index: {
          sites: db.prepare(`SELECT site, COUNT(*) checked, SUM(verdict = 'PASS') passed FROM index_status GROUP BY site ORDER BY site`).all(),
          missing: db.prepare(`SELECT url, coverage, last_crawl FROM index_status WHERE verdict != 'PASS' ORDER BY site, url LIMIT 60`).all(),
          last: indexLast,
        },
        speed: db.prepare('SELECT url, score, lcp_ms, cls, tbt_ms, error, checked_at FROM speed_results WHERE checked_at = (SELECT MAX(checked_at) FROM speed_results) ORDER BY score').all(),
        analytics: await analytics({ getSetting, setSetting }),
      });
    } catch (e) { console.error('[google]', e.message); res.status(500).json({ error: 'Could not load this section.' }); }
  });

  app.post('/api/admin/google/settings', requireAdmin, (req, res) => {
    const { speed_key, ga_ids } = req.body || {};
    if (speed_key !== undefined) {
      const k = String(speed_key).trim();
      if (k && !/^[A-Za-z0-9_-]{20,100}$/.test(k)) return res.status(400).json({ error: 'That does not look like a Google API key.' });
      setSetting('pagespeed_api_key', k);
    }
    if (ga_ids !== undefined) {
      const v = String(ga_ids).trim();
      if (v && !/^\d{6,15}(\s*,\s*\d{6,15})*$/.test(v)) return res.status(400).json({ error: 'Property IDs are numbers only, separated by commas. Not the G- code.' });
      setSetting('ga4_property_ids', v);
      setSetting('ga_cache', '{}');
    }
    logAudit(req, 'google.settings', 'settings', null, null);
    res.json({ ok: true });
  });

  app.post('/api/admin/google/run', requireAdmin, (req, res) => {
    const kind = req.body?.kind === 'speed' ? 'speed' : 'index';
    if (kind === 'index' && !getSetting('gsc_service_key', '')) return res.status(400).json({ error: 'Add the Google key file on the Search screen first.' });
    if (kind === 'speed' && !getSetting('pagespeed_api_key', '')) return res.status(400).json({ error: 'Add the PageSpeed API key first.' });
    res.json({ ok: true, started: start(kind) });
  });

  return { start };
}

module.exports = { register, checkIndex, checkSpeed, analytics, pulse, duePages, schema, inspectPage };
