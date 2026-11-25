'use strict';
// Data for the admin Reports area (Overview, Audience, Search, Sales, Health).
//   build()     everything worked out from our own database and the figures already fetched; no outside calls
//   live()      what is happening right now, from our own database
//   external()  Stripe, Google Analytics, Clarity and Bing, each cached and each allowed to fail on its own
//   register()  the routes, the CSV export and the server heartbeat (build() runs in reportsWorker.js)
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { estimateCost } = require('./adminExtras');
const { SOURCE_LABELS } = require('./trafficSources');
const { parseServiceKey, googleToken, call, pickProperties, windowsSchema } = require('./searchApis');
const tracking = require('./tracking');

const SITES = ['ca', 'us', 'uk'];
const SALE = "status NOT IN ('awaiting_payment','refunded','cancelled') AND deleted_at IS NULL AND split_from IS NULL";
const PERSON = "COALESCE(bot_name, '') = ''";
const OUR_HOSTS = /(^|\.)letterhome\.(ca|us|co\.uk)$/;
const PROBLEM_TEXT = {
  from_country: 'Sender country not chosen', from_address: 'Sender address incomplete', to_address: 'Recipient address incomplete',
  too_many_pages: 'Too many pages', email: 'Email missing or wrong', terms: 'Terms box not ticked', declaration: 'Declaration not ticked',
};

const stamp = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const dbTime = s => Date.parse(String(s).replace(' ', 'T') + 'Z');
const zone = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
// Time zone conversion is slow, and Toronto only changes on the hour, so each hour is worked out once.
const hours = new Map();
function local(ms) {
  const key = Math.floor(ms / 3600000);
  let hit = hours.get(key);
  if (!hit) {
    const p = Object.fromEntries(zone.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    hit = { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) };
    if (hours.size > 20000) hours.clear();
    hours.set(key, hit);
  }
  return hit;
}
const pageName = path => (!path || path === '/' ? 'Home page' : path === '/send' ? 'Order page' : String(path).slice(0, 120));
const landingGroup = path => (path === '/' ? 'Home page' : path === '/send' ? 'Order page' : /santa/.test(path || '') ? 'Santa letter' : 'Guides and other pages');
const titleCase = c => (c ? c[0].toUpperCase() + c.slice(1) : 'Unknown');
const count = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); if (k != null) m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };

function filters(query) {
  const days = query.days === 'all' ? 'all' : [7, 28, 90].includes(Number(query.days)) ? Number(query.days) : 28;
  const site = SITES.includes(query.site) ? query.site : 'all';
  return {
    days, site,
    pv: site === 'all' ? '' : ` AND COALESCE(NULLIF(NULLIF(site, ''), 'au'), 'ca') = '${site}'`,
    ord: site === 'all' ? '' : ` AND COALESCE(NULLIF(order_site, ''), 'ca') = '${site}'`,
  };
}

// Orders waiting on the owner. The content check lives in the server, so this part stays on the main thread.
function orderQueue(db, contentHeld, t) {
  try {
    const paid = db.prepare("SELECT * FROM orders WHERE status = 'paid' AND deleted_at IS NULL").all();
    const held = o => !!(contentHeld && contentHeld(o));
    return {
      waiting: paid.filter(o => (!o.postgrid_letter_id || o.postgrid_status === 'cancelled') && !(o.scheduled_date && o.scheduled_date > t) && !held(o)).length,
      held: paid.filter(o => !o.postgrid_letter_id && held(o)).length,
    };
  } catch (e) { console.error('[reports]', e.message); return { waiting: 0, held: 0 }; }
}

function build({ db, getSetting, contentHeld, today, queue }, query = {}, now = Date.now()) {
  const f = filters(query);
  const all = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch (e) { console.error('[reports]', e.message); return []; } };
  const one = (sql, ...a) => all(sql, ...a)[0] || {};

  // All time starts at the first visit or paid order on record.
  const allTime = f.days === 'all';
  let days = f.days;
  if (allTime) {
    const first = [one('SELECT MIN(created_at) t FROM page_views').t, one(`SELECT MIN(created_at) t FROM orders WHERE ${SALE}`).t].filter(Boolean).sort()[0];
    days = first ? Math.min(3660, Math.max(1, Math.ceil((now - dbTime(first)) / 86400000) + 1)) : 1;
  }

  const dates = Array.from({ length: days * 2 }, (_, i) => local(now - (days * 2 - 1 - i) * 86400000).day);
  const current = new Set(dates.slice(days));
  const since = dates[0], from = dates[days];

  // ── Orders ─────────────────────────────────────────────────────────────────────────────────
  const fx = parseFloat(getSetting('fx_usd_cad', '1.40')) || 1.40;
  const orderRows = all(`SELECT id, created_at, paid_at, mailed_at, price_cents, destination_country, page_count, colour_printing, registered_mail, certified_mail, express_mail,
      traffic_source, landing_path, heard_from, discount_code, cart_offer_sent_at, customer_email, actual_cost_cents
    FROM orders WHERE ${SALE} AND created_at >= ?${f.ord}`, stamp(now - (days * 2 + 1) * 86400000))
    .map(o => ({ ...o, day: local(dbTime(o.paid_at || o.created_at)).day, cost: o.actual_cost_cents ?? estimateCost(o, fx).total }));
  const sales = orderRows.filter(o => current.has(o.day));
  const before = orderRows.filter(o => !current.has(o.day) && o.day >= since);
  const sumOf = (list, key) => list.reduce((a, x) => a + (x[key] || 0), 0);
  const daily = (list, value) => { const m = new Map(); for (const o of list) m.set(o.day, (m.get(o.day) || 0) + value(o)); return dates.map(d => m.get(d) || 0); };

  // ── Page views ─────────────────────────────────────────────────────────────────────────────
  const views = all(`SELECT ip, path, COALESCE(source, 'direct') AS source, referrer, device_type, country_code, country_name, created_at
    FROM page_views WHERE ${PERSON} AND created_at >= ?${f.pv} ORDER BY created_at, id`, stamp(now - (days * 2 + 1) * 86400000))
    .map(v => ({ ...v, ...local(dbTime(v.created_at)) }));
  const nowViews = views.filter(v => current.has(v.day));
  const beforeViews = views.filter(v => !current.has(v.day) && v.day >= since);
  // One entry per visitor: the first page they opened, and every page after it.
  const visitorsOf = list => {
    const m = new Map();
    for (const v of list) {
      const key = v.ip || `row-${v.created_at}-${v.path}`;
      let x = m.get(key);
      if (!x) m.set(key, (x = { ...v, key, pages: new Set(), views: 0 }));
      x.pages.add(v.path); x.views++;
      if (!x.country_code && v.country_code) { x.country_code = v.country_code; x.country_name = v.country_name; }
    }
    return [...m.values()];
  };
  const people = visitorsOf(nowViews), peopleBefore = visitorsOf(beforeViews);
  const perDay = list => { const m = new Map(); for (const v of list) { if (!m.has(v.day)) m.set(v.day, new Set()); m.get(v.day).add(v.ip || v.created_at); } return dates.map(d => m.get(d)?.size || 0); };
  const visitorDaily = perDay(views);
  const aiDaily = perDay(views.filter(v => v.source === 'ai'));
  const phoneDaily = perDay(views.filter(v => v.device_type === 'mobile'));
  const sendDaily = perDay(views.filter(v => v.path === '/send'));
  const seenBefore = new Set(all(`SELECT DISTINCT ip FROM page_views WHERE ${PERSON} AND created_at < ? AND ip IS NOT NULL`, stamp(now - days * 86400000)).map(r => r.ip));

  const kpi = (now_, then) => ({ now: now_, before: then });
  const share = (list, test) => (list.length ? Math.round(list.filter(test).length / list.length * 100) : 0);
  const repeats = list => count(list, o => o.customer_email).filter(([, n]) => n > 1).length;
  const kpis = {
    revenue: kpi(sumOf(sales, 'price_cents'), sumOf(before, 'price_cents')),
    orders: kpi(sales.length, before.length),
    visitors: kpi(people.length, peopleBefore.length),
    profit: kpi(sumOf(sales, 'price_cents') - sumOf(sales, 'cost'), sumOf(before, 'price_cents') - sumOf(before, 'cost')),
    aov: kpi(sales.length ? Math.round(sumOf(sales, 'price_cents') / sales.length) : 0, before.length ? Math.round(sumOf(before, 'price_cents') / before.length) : 0),
    repeat: kpi(repeats(sales), repeats(before)),
    phone: kpi(share(people, p => p.device_type === 'mobile'), share(peopleBefore, p => p.device_type === 'mobile')),
    ai: kpi(people.filter(p => p.source === 'ai').length, peopleBefore.filter(p => p.source === 'ai').length),
    pagesPer: kpi(people.length ? Math.round(nowViews.length / people.length * 10) / 10 : 0, peopleBefore.length ? Math.round(beforeViews.length / peopleBefore.length * 10) / 10 : 0),
    sendViews: kpi(people.filter(p => p.pages.has('/send')).length, peopleBefore.filter(p => p.pages.has('/send')).length),
  };
  const series = {
    dates: dates.slice(days),
    revenue: daily(orderRows, o => o.price_cents).slice(days), revenuePrev: daily(orderRows, o => o.price_cents).slice(0, days),
    orders: daily(orderRows, () => 1).slice(days), profit: daily(orderRows, o => o.price_cents - o.cost).slice(days),
    visitors: visitorDaily.slice(days), ai: aiDaily.slice(days), phone: phoneDaily.slice(days), send: sendDaily.slice(days),
  };

  // ── Funnel (checkout steps are counted for all sites together) ───────────────────────────
  const steps = Object.fromEntries(all('SELECT step, COUNT(*) n FROM funnel_events WHERE day >= ? GROUP BY step', from).map(r => [r.step, r.n]));
  // With one site chosen, only the steps that can be told apart by site are shown.
  const funnel = f.site === 'all'
    ? [['Visited', people.length], ['Opened the order page', steps.send_view || kpis.sendViews.now], ['Clicked Pay', steps.pay_click || 0], ['Paid', sales.length]]
    : [['Visited', people.length], ['Opened the order page', kpis.sendViews.now], ['Paid', sales.length]];

  // ── Sources and journey ──────────────────────────────────────────────────────────────────
  const label = s => SOURCE_LABELS[s] || 'Unknown';
  const ordersBySource = count(sales, o => label(o.traffic_source || 'unknown'));
  const channels = count(people, p => label(p.source));
  const topSources = channels.slice(0, 4).map(c => c[0]);
  const sourceName = s => (topSources.includes(label(s)) ? label(s) : 'All other');
  const flow = new Map();
  const bump = (a, b, n = 1) => { if (n > 0) flow.set(`${a}\u0000${b}`, (flow.get(`${a}\u0000${b}`) || 0) + n); };
  for (const p of people) bump(sourceName(p.source), landingGroup(p.path));
  for (const group of new Set(people.map(p => landingGroup(p.path)))) {
    const here = people.filter(p => landingGroup(p.path) === group);
    const paid = Math.min(here.length, sales.filter(o => o.landing_path && landingGroup(o.landing_path) === group).length);
    const started = Math.min(here.length - paid, Math.max(0, here.filter(p => p.pages.has('/send')).length - paid));
    bump(group, 'Paid an order', paid);
    bump(group, 'Opened order page, did not pay', started);
    bump(group, 'Only read', here.length - paid - started);
  }
  const journey = [...flow].map(([k, n]) => [...k.split('\u0000'), n]);

  // ── Audience ─────────────────────────────────────────────────────────────────────────────
  const countries = count(people.filter(p => p.country_code), p => p.country_code)
    .map(([code, n]) => ({ code, name: people.find(p => p.country_code === code)?.country_name || code, visitors: n })).slice(0, 15);
  const pageViews = count(nowViews, v => pageName(v.path)).slice(0, 15);
  const ordersByLanding = new Map(count(sales, o => o.landing_path && pageName(o.landing_path)));
  const topPages = pageViews.map(([path, n]) => [path, n, ordersByLanding.get(path) || 0]);
  const devices = count(people, p => titleCase(p.device_type === 'mobile' ? 'phone' : p.device_type === 'desktop' ? 'computer' : p.device_type));
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  const seenHour = new Set();
  for (const v of nowViews) {
    const k = `${v.ip}|${v.day}|${v.hour}`;
    if (seenHour.has(k) || v.weekday < 0) continue;
    seenHour.add(k); heat[v.weekday][v.hour]++;
  }
  // Within a period, returning means seen before it. Over all time it means seen on more than one day.
  const daysSeen = new Map();
  if (allTime) for (const v of nowViews) { if (!daysSeen.has(v.ip)) daysSeen.set(v.ip, new Set()); daysSeen.get(v.ip).add(v.day); }
  const returning = people.filter(p => (allTime ? daysSeen.get(p.ip)?.size > 1 : seenBefore.has(p.ip))).length;
  const referrers = count(people.filter(p => p.source === 'site' || p.source === 'social'), p => {
    const h = String(p.referrer || '').toLowerCase().replace(/^www\./, '');
    return h && !OUR_HOSTS.test(h) ? h.slice(0, 80) : null;
  }).slice(0, 8);

  // ── Search ───────────────────────────────────────────────────────────────────────────────
  const sites = f.site === 'all' ? SITES : [f.site];
  const search = { engines: {}, queries: [], pages: [], countries: [], devices: [], dates: [] };
  const merge = (map, key, r) => {
    const x = map.get(key) || { key, clicks: 0, impressions: 0, weighted: 0 };
    x.clicks += r.clicks || 0; x.impressions += r.impressions || 0; x.weighted += (r.position || 0) * (r.impressions || 0);
    map.set(key, x);
  };
  const flat = map => [...map.values()].map(x => ({ key: x.key, clicks: Math.round(x.clicks), impressions: Math.round(x.impressions), position: x.impressions ? Math.round(x.weighted / x.impressions * 10) / 10 : 0 }));
  const queryMap = new Map(), pageMap = new Map(), countryMap = new Map(), deviceMap = new Map();
  const dayMaps = { google: new Map(), bing: new Map() };
  // Each period is fetched separately. Until that has happened the latest 28 days stand in, and the screen says so.
  let standIn = false;
  const addRow = (kind, r, engine, total) => {
    if (kind === 'date') { merge(dayMaps[engine], r.key, r); if (total) total.weighted += (r.position || 0) * (r.impressions || 0); }
    else if (kind === 'query') merge(queryMap, r.key, r);
    else if (kind === 'page') merge(pageMap, f.site === 'all' ? r.key.replace(/^https?:\/\/(www\.)?/, '') : r.key.replace(/^https?:\/\/[^/]+/, '') || '/', r);
    else if (kind === 'country') merge(countryMap, r.key, r);
    else if (kind === 'device') merge(deviceMap, r.key, r);
  };
  for (const engine of ['google', 'bing']) {
    const total = { clicks: 0, impressions: 0, weighted: 0, beforeClicks: null, beforeImpressions: null, to: null };
    for (const site of sites) {
      let period = null;
      try { period = JSON.parse(one('SELECT data FROM search_windows WHERE site = ? AND engine = ? AND days = ?', site, engine, allTime ? 0 : f.days).data || 'null'); } catch {}
      if (period) {
        if (period.to && (!total.to || period.to > total.to)) total.to = period.to;
        total.clicks += period.clicks; total.impressions += period.impressions;
        total.weighted += period.position * period.impressions;
        if (period.beforeClicks != null) { total.beforeClicks = (total.beforeClicks || 0) + period.beforeClicks; total.beforeImpressions = (total.beforeImpressions || 0) + period.beforeImpressions; }
        for (const r of period.chart) addRow('date', r, engine);
        for (const kind of ['query', 'page', 'country', 'device']) for (const r of period[{ query: 'queries', page: 'pages', country: 'countries', device: 'devices' }[kind]] || []) addRow(kind, r, engine);
        continue;
      }
      const snaps = all('SELECT id, date_to, clicks, impressions FROM gsc_snapshots WHERE site = ? AND engine = ? ORDER BY id DESC LIMIT 12', site, engine);
      if (!snaps.length) continue;
      if (f.days !== 28) standIn = true;
      const latest = snaps[0];
      if (latest.date_to && (!total.to || latest.date_to > total.to)) total.to = latest.date_to;
      total.clicks += latest.clicks; total.impressions += latest.impressions;
      const cut = latest.date_to ? new Date(Date.parse(latest.date_to) - 6 * 86400000).toISOString().slice(0, 10) : '';
      const prev = f.days === 28 && snaps.slice(1).find(s => s.date_to && s.date_to <= cut);
      if (prev) { total.beforeClicks = (total.beforeClicks || 0) + prev.clicks; total.beforeImpressions = (total.beforeImpressions || 0) + prev.impressions; }
      for (const r of all('SELECT kind, key, clicks, impressions, position FROM gsc_rows WHERE snapshot_id = ?', latest.id)) addRow(r.kind, r, engine, total);
    }
    const position = total.impressions ? Math.round(total.weighted / total.impressions * 10) / 10 : 0;
    search.engines[engine] = { clicks: Math.round(total.clicks), impressions: Math.round(total.impressions), position, to: total.to,
      beforeClicks: total.beforeClicks, beforeImpressions: total.beforeImpressions };
  }
  search.standIn = standIn;
  search.dates = [...new Set([...dayMaps.google.keys(), ...dayMaps.bing.keys()])].sort();
  search.google = search.dates.map(d => Math.round(dayMaps.google.get(d)?.clicks || 0));
  search.bing = search.dates.map(d => Math.round(dayMaps.bing.get(d)?.clicks || 0));
  search.shown = search.dates.map(d => Math.round((dayMaps.google.get(d)?.impressions || 0) + (dayMaps.bing.get(d)?.impressions || 0)));
  search.queries = flat(queryMap).sort((a, b) => b.impressions - a.impressions).slice(0, 25);
  search.pages = flat(pageMap).sort((a, b) => b.impressions - a.impressions).slice(0, 60);
  search.countries = flat(countryMap).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 8);
  search.devices = flat(deviceMap).sort((a, b) => b.clicks - a.clicks);
  const siteIn = `site IN (${sites.map(s => `'${s}'`).join(',')})`;
  const index = one(`SELECT COUNT(*) checked, COALESCE(SUM(verdict = 'PASS'), 0) indexed_count FROM index_status WHERE ${siteIn}`);
  search.index = { checked: index.checked || 0, indexed: index.indexed_count || 0 };
  search.missing = all(`SELECT url, site, coverage FROM index_status WHERE verdict != 'PASS' AND ${siteIn} ORDER BY site, url LIMIT 25`);
  let audit = null;
  try {
    const row = one('SELECT ran_at, result FROM seo_audit_runs ORDER BY id DESC LIMIT 1');
    if (row.result) { const r = JSON.parse(row.result); audit = { ran_at: row.ran_at, pages: r.pages, counts: r.counts }; }
  } catch {}
  search.audit = audit;

  // ── Sales ────────────────────────────────────────────────────────────────────────────────
  const problems = all('SELECT code, COUNT(*) n, SUM(device = \'phone\') phone FROM form_problems WHERE day >= ? GROUP BY code ORDER BY n DESC LIMIT 8', from)
    .map(p => [PROBLEM_TEXT[p.code] || p.code, p.n, p.phone || 0]);
  const heard = count(sales.filter(o => o.heard_from), o => tracking.HEARD_FROM[o.heard_from] || o.heard_from);
  const profitMap = new Map();
  for (const o of sales) {
    const cc = o.destination_country || 'CA';
    const x = profitMap.get(cc) || { revenue: 0, profit: 0, orders: 0 };
    x.revenue += o.price_cents; x.profit += o.price_cents - o.cost; x.orders++;
    profitMap.set(cc, x);
  }
  const profit = [...profitMap].map(([code, x]) => ({ code, ...x })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const buckets = [['Same day', 0], ['Next day', 0], ['2 days', 0], ['3 days or more', 0]];
  for (const o of sales) {
    if (!o.mailed_at || !o.paid_at) continue;
    const gap = Math.round((Date.parse(local(dbTime(o.mailed_at)).day) - Date.parse(local(dbTime(o.paid_at)).day)) / 86400000);
    if (gap >= 0) buckets[Math.min(3, gap)][1]++;
  }
  const emails = one('SELECT COUNT(*) sent, COALESCE(SUM(open_count > 0 OR first_opened_at IS NOT NULL), 0) opened FROM email_opens WHERE created_at >= ?', stamp(now - days * 86400000));
  const extras = {
    emailsTracked: emails.sent || 0, emailsOpened: emails.opened || 0,
    codes: sales.filter(o => o.discount_code).length,
    offers: sales.filter(o => o.cart_offer_sent_at).length,
    messages: one('SELECT COUNT(*) n FROM contact_submissions WHERE read_at IS NULL').n || 0,
    emailsSent: one('SELECT COUNT(*) n FROM email_log WHERE created_at >= ?', stamp(now - days * 86400000)).n || 0,
  };

  // ── What to do next, most important first ────────────────────────────────────────────────
  const t = today ? today() : local(now).day;
  const { waiting, held } = queue || orderQueue(db, contentHeld, t);
  const actions = [];
  const add = (level, text, button, href) => actions.push({ level, text, button, href });
  const s = n => (n === 1 ? '' : 's');
  if (waiting) add('High', `${waiting} order${s(waiting)} waiting for your approval`, 'Review', '/admin/approvals');
  if (held) add('High', `${held} order${s(held)} held by the content check`, 'Review', '/admin/approvals');
  let fetchLast = null;
  try { fetchLast = JSON.parse(getSetting('search_fetch_last', '') || 'null'); } catch {}
  const failed = (fetchLast?.results || []).find(r => !r.ok);
  if (failed) add('High', `The search fetch failed: ${failed.message}`, 'Fix', '/admin/growth');
  if (problems[0] && problems[0][1] >= 3) add('Medium', `${problems[0][0]} stopped people ${problems[0][1]} times`, 'See why', '/admin/reports/sales');
  if (extras.messages) add('Medium', `${extras.messages} message${s(extras.messages)} from the contact form to answer`, 'Open', '/admin/contacts');
  const quiet = search.pages.filter(p => p.position > 0 && p.position <= 10.5 && p.impressions >= 40 && p.clicks / p.impressions < 0.01).length;
  if (quiet) add('Medium', `${quiet} page${s(quiet)} on page one but rarely clicked`, 'See pages', '/admin/reports/search');
  const missing = search.index.checked - search.index.indexed;
  if (missing) add('Low', `${missing} page${s(missing)} not in Google yet`, 'See list', '/admin/reports/search');

  const month = local(now).day.slice(0, 7);
  const monthOrders = all(`SELECT paid_at, created_at FROM orders WHERE ${SALE} AND created_at >= ?${f.ord}`, stamp(now - 33 * 86400000))
    .filter(o => local(dbTime(o.paid_at || o.created_at)).day.startsWith(month)).length;

  const heartbeat = new Map(all('SELECT day, beats, expected FROM app_heartbeat ORDER BY day DESC LIMIT 90').map(r => [r.day, r]));
  const speed = all('SELECT url, score, a11y, practices, seo, lcp_ms, cls, error, checked_at FROM speed_results WHERE checked_at = (SELECT MAX(checked_at) FROM speed_results) ORDER BY url');
  const setting = key => { try { return JSON.parse(getSetting(key, '') || 'null'); } catch { return null; } };

  const upDays = Array.from({ length: 90 }, (_, i) => local(now - (89 - i) * 86400000).day);

  return {
    days, period: f.days, since: from, site: f.site, generated_at: new Date(now).toISOString(),
    kpis, series,
    overview: { actions, ordersBySource, funnel, target: { goal: parseInt(getSetting('monthly_order_target', ''), 10) || 0, month: monthOrders } },
    audience: { countries, channels, topPages, devices, heat, visitorsNew: people.length - returning, visitorsReturning: returning, referrers },
    search,
    sales: { journey, problems, heard, profit, fulfilment: buckets, extras },
    health: {
      uptime: upDays.map(d => { const r = heartbeat.get(d); return { day: d, share: r ? Math.min(1, r.beats / Math.max(1, r.expected)) : null }; }),
      speed,
      jobs: {
        searchFetch: fetchLast?.at ? new Date(fetchLast.at).toISOString() : null,
        indexCheck: setting('index_check_last')?.at || null,
        speedCheck: getSetting('speed_check_last', '') || null,
        contentAudit: audit?.ran_at || null,
      },
      keys: {
        google: !!getSetting('gsc_service_key', ''), bing: !!getSetting('bing_api_key', ''),
        pagespeed: !!getSetting('pagespeed_api_key', ''), analytics: !!getSetting('ga4_property_ids', ''),
        clarity: !!getSetting('clarity_api_token', ''),
      },
    },
  };
}

function live({ db }, query = {}, now = Date.now()) {
  const f = filters(query);
  const all = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch (e) { console.error('[reports]', e.message); return []; } };
  const recent = all(`SELECT ip, path, source, device_type, country_name, created_at FROM page_views WHERE ${PERSON} AND created_at >= ?${f.pv} ORDER BY created_at DESC, id DESC LIMIT 600`, stamp(now - 30 * 60000));
  const latest = new Map();
  for (const v of recent) if (!latest.has(v.ip)) latest.set(v.ip, v);
  const orders = all(`SELECT id, status, price_cents, recipient_city, destination_country, created_at, paid_at, mailed_at FROM orders
    WHERE status != 'awaiting_payment' AND deleted_at IS NULL AND split_from IS NULL${f.ord} ORDER BY id DESC LIMIT 6`);
  const events = [];
  const add = (at, text, detail, warn) => { if (at && dbTime(at) >= now - 24 * 3600000) events.push({ at: new Date(dbTime(at)).toISOString(), text, detail, warn: !!warn }); };
  for (const v of recent.slice(0, 8)) {
    add(v.created_at, v.path === '/send' ? 'Someone opened the order page' : `Visit: ${pageName(v.path)}`,
      [v.country_name, v.device_type === 'mobile' ? 'phone' : 'computer', v.source && v.source !== 'direct' ? `from ${SOURCE_LABELS[v.source] || v.source}` : ''].filter(Boolean).join(', '));
  }
  for (const o of orders) {
    add(o.paid_at || o.created_at, `Paid order #${o.id}`, `to ${o.recipient_city || o.destination_country || 'unknown'}`);
    add(o.mailed_at, `Order #${o.id} mailed`, `to ${o.recipient_city || o.destination_country || 'unknown'}`);
  }
  for (const p of all('SELECT code, device, created_at FROM form_problems ORDER BY id DESC LIMIT 5')) {
    add(p.created_at, `Order form problem: ${(PROBLEM_TEXT[p.code] || p.code).toLowerCase()}`, `on a ${p.device}`, true);
  }
  events.sort((a, b) => b.at.localeCompare(a.at));
  return {
    at: new Date(now).toISOString(),
    active: latest.size,
    activePages: count([...latest.values()], v => pageName(v.path)).slice(0, 5),
    events: events.slice(0, 8),
    orders: orders.slice(0, 5),
  };
}

// ── Outside services ───────────────────────────────────────────────────────────────────────────
const cache = new Map();
async function cached(key, ms, make, now = Date.now()) {
  const hit = cache.get(key);
  if (hit && now - hit.at < ms) return hit.value;
  let value;
  try { value = await make(); }
  catch (e) { console.error(`[reports ${key}]`, e.message); value = { error: e.message || 'Not available.' }; }
  // A failure is kept for a minute only, so a fixed key shows up quickly.
  cache.set(key, { at: value.error ? now - ms + 60000 : now, value: { ...value, fetched_at: new Date(now).toISOString() } });
  return cache.get(key).value;
}
const timed = (promise, ms = 9000) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error('Did not answer in time.')), ms).unref())]);

async function stripeFigures(stripe, days, now) {
  const created = days === 'all' ? undefined : { gte: Math.floor(now / 1000) - days * 86400 };
  const list = (resource, params) => timed(resource.list({ limit: 100, ...params }).autoPagingToArray({ limit: days === 'all' ? 3000 : 600 }), 20000);
  const [balance, payouts, charges, movements, disputes] = await Promise.all([
    timed(stripe.balance.retrieve()),
    timed(stripe.payouts.list({ limit: 5 })),
    list(stripe.charges, created ? { created } : {}),
    list(stripe.balanceTransactions, created ? { created } : {}),
    timed(stripe.disputes.list({ limit: 20 })),
  ]);
  const add = rows => rows.reduce((a, r) => a + r.amount, 0);
  const next = payouts.data.filter(p => p.status === 'pending' || p.status === 'in_transit').sort((a, b) => a.arrival_date - b.arrival_date)[0] || null;
  const last = payouts.data.find(p => p.status === 'paid') || null;
  const paid = charges.filter(c => c.status === 'succeeded');
  const method = c => {
    const d = c.payment_method_details || {};
    const wallet = d.card?.wallet?.type;
    if (wallet) return wallet === 'apple_pay' ? 'Apple Pay' : wallet === 'google_pay' ? 'Google Pay' : wallet === 'link' ? 'Link' : 'Other wallet';
    return d.type === 'card' ? 'Card' : d.type === 'link' ? 'Link' : d.type ? titleCase(d.type.replace(/_/g, ' ')) : 'Other';
  };
  const refunded = charges.filter(c => c.amount_refunded > 0);
  return {
    currency: (balance.available[0]?.currency || 'cad').toUpperCase(),
    available: add(balance.available), pending: add(balance.pending),
    nextPayout: next && { amount: next.amount, arrival: next.arrival_date },
    lastPayout: last && { amount: last.amount, arrival: last.arrival_date },
    fees: movements.reduce((a, m) => a + (m.fee || 0), 0),
    declined: charges.filter(c => c.status === 'failed').length,
    refunds: refunded.length, refundedCents: refunded.reduce((a, c) => a + c.amount_refunded, 0),
    disputes: disputes.data.filter(d => d.status === 'needs_response' || d.status === 'under_review' || d.status === 'warning_needs_response').length,
    methods: count(paid, method),
  };
}

async function analyticsFigures(getSetting, days, fetchImpl) {
  const ids = getSetting('ga4_property_ids', '').split(',').map(s => s.trim()).filter(s => /^\d{6,15}$/.test(s));
  const raw = getSetting('gsc_service_key', '');
  if (!ids.length || !raw) return { configured: false };
  const token = await googleToken(fetchImpl, parseServiceKey(raw), 'analytics.readonly');
  const cities = new Map(), languages = new Map();
  let sessions = 0, seconds = 0, engaged = 0, errors = 0;
  const dateRanges = [{ startDate: days === 'all' ? '2020-01-01' : `${days}daysAgo`, endDate: 'today' }];
  for (const id of ids) {
    const report = body => call(fetchImpl, 'Google Analytics', `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ dateRanges, ...body }) });
    try {
      const totals = (await report({ metrics: [{ name: 'sessions' }, { name: 'averageSessionDuration' }, { name: 'engagementRate' }] })).rows?.[0]?.metricValues?.map(v => Number(v.value) || 0);
      if (totals) { sessions += totals[0]; seconds += totals[1] * totals[0]; engaged += totals[2] * totals[0]; }
      for (const [dimension, into] of [['city', cities], ['language', languages]]) {
        const j = await report({ metrics: [{ name: 'activeUsers' }], dimensions: [{ name: dimension }], limit: 20, orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }] });
        for (const r of j.rows || []) {
          const k = r.dimensionValues[0].value;
          if (k && k !== '(not set)') into.set(k, (into.get(k) || 0) + (Number(r.metricValues[0].value) || 0));
        }
      }
    } catch (e) { errors++; if (errors === ids.length) throw e; }
  }
  const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { configured: true, sessions, seconds: sessions ? Math.round(seconds / sessions) : 0, engagedPct: sessions ? Math.round(engaged / sessions * 100) : 0, cities: top(cities), languages: top(languages) };
}

async function clarityFigures(getSetting, setSetting, fetchImpl) {
  const c = await tracking.clarityInsights({ getSetting, setSetting, fetchImpl });
  if (!c.configured) return { configured: false };
  const info = name => (c.metrics || []).find(m => m.metricName === name)?.information?.[0] || null;
  const num = (name, key) => { const v = Number(info(name)?.[key]); return Number.isFinite(v) ? v : null; };
  return {
    configured: true, error: c.error && !c.metrics.length ? c.error : undefined, at: c.at,
    sessions: num('Traffic', 'totalSessionCount'), scroll: num('ScrollDepth', 'averageScrollDepth'),
    dead: num('DeadClickCount', 'subTotal'), rage: num('RageClickCount', 'subTotal'),
    quickback: num('QuickbackClick', 'subTotal'), errors: num('ScriptErrorCount', 'subTotal'),
  };
}

async function bingFigures(getSetting, site, days, fetchImpl, now) {
  const key = getSetting('bing_api_key', '');
  if (!key) return { configured: false };
  const base = 'https://ssl.bing.com/webmaster/api.svc/json';
  const ask = async (method, extra = '') => (await call(fetchImpl, 'Bing', `${base}/${method}?apikey=${encodeURIComponent(key)}${extra}`)).d;
  const props = pickProperties(((await ask('GetUserSites')) || []).filter(s => s.IsVerified !== false).map(s => s.Url));
  const wanted = Object.entries(props).filter(([s]) => site === 'all' || s === site);
  const since = days === 'all' ? 0 : now - days * 86400000;
  let crawled = 0, errors = 0, inIndex = 0, links = 0, quota = null;
  for (const [, url] of wanted) {
    const q = `&siteUrl=${encodeURIComponent(url)}`;
    const rows = ((await ask('GetCrawlStats', q)) || []).map(r => ({ ...r, ms: Number(String(r.Date).match(/\d+/)?.[0]) })).filter(r => r.ms >= since).sort((a, b) => a.ms - b.ms);
    for (const r of rows) { crawled += r.CrawledPages || 0; errors += r.CrawlErrors || 0; }
    const last = rows[rows.length - 1];
    if (last) { inIndex += last.InIndex || 0; links += last.InLinks || 0; }
    const left = await ask('GetUrlSubmissionQuota', q);
    if (left) quota = (quota || 0) + (left.DailyQuota || 0);
  }
  return { configured: true, crawled, errors, inIndex, links, quota };
}

async function external({ getSetting, setSetting, stripe }, query = {}, fetchImpl = fetch, now = Date.now()) {
  const f = filters(query);
  const HOUR = 3600000;
  const [money, analytics, clarity, bing] = await Promise.all([
    cached(`stripe ${f.days}`, 60000, () => stripeFigures(stripe, f.days, now), now),
    cached(`analytics ${f.days} ${getSetting('ga4_property_ids', '')}`, HOUR, () => analyticsFigures(getSetting, f.days, fetchImpl), now),
    cached('clarity', 15 * 60000, () => clarityFigures(getSetting, setSetting, fetchImpl), now),
    cached(`bing ${f.site} ${f.days}`, 6 * HOUR, () => bingFigures(getSetting, f.site, f.days, fetchImpl, now), now),
  ]);
  return { stripe: money, analytics, clarity, bing };
}

// A spreadsheet treats a cell that starts like a formula as one; these words come from outside, so they are defused.
function toCsv(columns, rows) {
  const cell = v => {
    let s = v == null ? '' : String(v);
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [columns, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
}

const money = c => Math.round(c) / 100;
function tables(d) {
  const t = (screen, id, title, columns, rows) => ({ screen, id, title, columns, rows });
  const s = d.series;
  return [
    t('overview', 'daily', 'Daily figures', ['Day', 'Revenue (CAD)', 'Previous period (CAD)', 'Orders', 'Visitors', 'Profit estimate (CAD)'],
      s.dates.map((day, i) => [day, money(s.revenue[i]), money(s.revenuePrev[i]), s.orders[i], s.visitors[i], money(s.profit[i])])),
    t('overview', 'sources', 'Orders by source', ['Source', 'Orders'], d.overview.ordersBySource),
    t('overview', 'funnel', 'Conversion funnel', ['Step', 'People'], d.overview.funnel),
    t('audience', 'countries', 'Visitors by country', ['Country', 'Visitors'], d.audience.countries.map(c => [c.name, c.visitors])),
    t('audience', 'channels', 'Traffic channels', ['Channel', 'Visitors'], d.audience.channels),
    t('audience', 'pages', 'Top pages', ['Page', 'Views', 'Orders'], d.audience.topPages),
    t('audience', 'devices', 'Devices', ['Device', 'Visitors'], d.audience.devices),
    t('audience', 'hours', 'Visits by day and hour', ['Day', 'Hour', 'Visits'],
      d.audience.heat.flatMap((row, i) => row.map((n, h) => [['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], h, n]))),
    t('audience', 'referrers', 'Referring sites', ['Site', 'Visitors'], d.audience.referrers),
    t('search', 'clicks', 'Search clicks', ['Day', 'Google', 'Bing'], d.search.dates.map((day, i) => [day, d.search.google[i], d.search.bing[i]])),
    t('search', 'queries', 'Search queries', ['Query', 'Shown', 'Clicks', 'Position'], d.search.queries.map(q => [q.key, q.impressions, q.clicks, q.position])),
    t('search', 'pages', 'Pages in search', ['Page', 'Position', 'Shown', 'Clicks'], d.search.pages.map(p => [p.key, p.position, p.impressions, p.clicks])),
    t('search', 'missing', 'Not yet indexed', ['Page', 'Google says'], d.search.missing.map(m => [m.url, m.coverage])),
    t('search', 'countries', 'Search clicks by country', ['Country', 'Clicks', 'Shown'], d.search.countries.map(c => [c.key, c.clicks, c.impressions])),
    t('sales', 'journey', 'Customer journey', ['From', 'To', 'Visitors'], d.sales.journey),
    t('sales', 'problems', 'Form drop-off causes', ['Problem', 'Times', 'On phones'], d.sales.problems),
    t('sales', 'heard', 'Self-reported source', ['Answer', 'Orders'], d.sales.heard),
    t('sales', 'profit', 'Profit by destination', ['Destination', 'Orders', 'Revenue (CAD)', 'Profit estimate (CAD)'], d.sales.profit.map(p => [p.code, p.orders, money(p.revenue), money(p.profit)])),
    t('sales', 'fulfilment', 'Fulfilment time', ['Time', 'Orders'], d.sales.fulfilment),
    t('health', 'uptime', 'Server running time', ['Day', 'Percent'], d.health.uptime.map(u => [u.day, u.share == null ? '' : Math.round(u.share * 100)])),
    t('health', 'speed', 'Page quality', ['Page', 'Speed', 'Accessibility', 'Best practices', 'SEO'], d.health.speed.map(p => [p.url, p.score, p.a11y, p.practices, p.seo])),
  ];
}

// A mark every five minutes while the server runs. A day with marks missing is a day it was down part of the time.
function beat(db, now = Date.now()) {
  const day = local(now).day;
  const row = db.prepare('SELECT beats, expected, last_at FROM app_heartbeat WHERE day = ?').get(day);
  if (!row) {
    const prior = db.prepare('SELECT COUNT(*) n FROM app_heartbeat').get().n;
    const since = prior ? local(now).hour * 12 + Math.floor(new Date(now).getUTCMinutes() / 5) + 1 : 1;
    db.prepare('INSERT INTO app_heartbeat (day, beats, expected, last_at) VALUES (?, 1, ?, ?)').run(day, since, now);
    return;
  }
  const gap = Math.max(1, Math.round((now - row.last_at) / 300000));
  db.prepare('UPDATE app_heartbeat SET beats = beats + 1, expected = expected + ?, last_at = ? WHERE day = ?').run(gap, now, day);
}

function schema(db) {
  windowsSchema(db);
  db.exec('CREATE TABLE IF NOT EXISTS app_heartbeat (day TEXT PRIMARY KEY, beats INTEGER NOT NULL, expected INTEGER NOT NULL, last_at INTEGER NOT NULL)');
  for (const col of ['a11y', 'practices', 'seo']) { try { db.exec(`ALTER TABLE speed_results ADD COLUMN ${col} INTEGER`); } catch {} }
}

// ── Background worker and short-lived cache ───────────────────────────────────────────────────
function background(dbPath) {
  let worker = null, nextId = 0;
  const waiting = new Map();
  const drop = (w, message) => {
    if (worker !== w) return;
    worker = null;
    for (const job of waiting.values()) job.reject(new Error(message));
    waiting.clear();
  };
  function start() {
    const w = new Worker(path.join(__dirname, 'reportsWorker.js'), { workerData: { dbPath } });
    w.on('message', m => {
      const job = waiting.get(m.id);
      if (!job) return;
      waiting.delete(m.id);
      if (!waiting.size) w.unref();
      if (m.error) job.reject(new Error(m.error)); else job.resolve(m.data);
    });
    w.on('error', e => drop(w, e.message));
    w.on('exit', () => drop(w, 'The report worker stopped.'));
    return w;
  }
  return (query, queue, today) => new Promise((resolve, reject) => {
    if (!worker) worker = start();
    const w = worker, id = ++nextId;
    const timer = setTimeout(() => { drop(w, 'The report took too long.'); w.terminate(); }, 60000);
    timer.unref();
    const done = fn => value => { clearTimeout(timer); fn(value); };
    waiting.set(id, { resolve: done(resolve), reject: done(reject) });
    w.ref();
    w.postMessage({ id, query, queue, today, now: Date.now() });
  });
}

function register(app, deps) {
  const { db, requireAdmin, contentHeld, today } = deps;
  schema(db);
  const run = background(path.resolve(deps.dbPath || process.env.DB_PATH || 'orders.db'));
  const recent = new Map();
  // The same screen is reused for a minute, and sooner than that if an order arrives or changes.
  function report(query) {
    const f = filters(query), t = today ? today() : local(Date.now()).day;
    const queue = orderQueue(db, contentHeld, t);
    let newest = 0;
    try { newest = db.prepare('SELECT MAX(id) n FROM orders').get().n || 0; } catch {}
    const key = [f.days, f.site, newest, queue.waiting, queue.held, deps.getSetting('monthly_order_target', ''), deps.getSetting('search_fetch_last', '')].join('|');
    const hit = recent.get(key);
    if (hit && Date.now() - hit.at < 60000) return hit.value;
    for (const [k, v] of recent) if (Date.now() - v.at >= 60000) recent.delete(k);
    const value = run({ days: f.days, site: f.site }, queue, t);
    recent.set(key, { at: Date.now(), value });
    value.catch(() => recent.delete(key));
    return value;
  }
  const fail = (res, e) => { console.error('[reports]', e.message); res.status(500).json({ error: 'Could not load this section.' }); };

  app.get('/api/admin/reports', requireAdmin, async (req, res) => { try { res.json(await report(req.query)); } catch (e) { fail(res, e); } });
  app.get('/api/admin/reports/live', requireAdmin, (req, res) => { try { res.json(live(deps, req.query)); } catch (e) { fail(res, e); } });
  app.get('/api/admin/reports/external', requireAdmin, async (req, res) => { try { res.json(await external(deps, req.query)); } catch (e) { fail(res, e); } });

  // A real file from the server, so it downloads in the browser and in both apps.
  app.get('/api/admin/reports/export', requireAdmin, async (req, res) => {
    try {
      const data = await report(req.query);
      const wanted = tables(data).filter(t => (req.query.table ? t.id === req.query.table && t.screen === req.query.screen : t.screen === req.query.screen));
      if (!wanted.length) return res.status(404).json({ error: 'Nothing to export.' });
      const body = wanted.map(t => (wanted.length > 1 ? `${t.title}\r\n` : '') + toCsv(t.columns, t.rows)).join('\r\n\r\n');
      const name = `letterhome-${wanted[0].screen}${req.query.table ? '-' + wanted[0].id : ''}-${data.period === 'all' ? 'all-time' : data.period + 'd'}-${data.series.dates[data.series.dates.length - 1]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.send('﻿' + body);
    } catch (e) { fail(res, e); }
  });

  return { beat: () => { try { beat(db); } catch (e) { console.error('[heartbeat]', e.message); } } };
}

module.exports = { register, build, live, external, tables, toCsv, beat, schema };
