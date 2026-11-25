'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `lh-reports-${randomUUID()}.db`);
const express = require('express');
const db = require('../db');
require('../trafficSources').ensureSchema(db);
require('../adminTools').register(express(), { db, requireAdmin: (q, r, n) => n(), logAudit: () => {}, getSetting: () => null, appRoot: path.join(__dirname, '..'), backupDir: os.tmpdir(), baseUrl: 'http://localhost' });
require('../googleExtras').schema(db);
const reports = require('../reportsData');
reports.schema(db);
after(() => { for (const f of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + f); } catch {} } });

const NOW = Date.parse('2026-11-25T18:00:00Z');
const at = hoursAgo => new Date(NOW - hoursAgo * 3600000).toISOString().slice(0, 19).replace('T', ' ');
const deps = { db, getSetting: (k, d = '') => ({ monthly_order_target: '40' })[k] ?? d };

const order = db.prepare(`INSERT INTO orders (customer_email, recipient_name, recipient_street, recipient_city, destination_country, price_cents, status, created_at, paid_at, traffic_source, landing_path)
  VALUES (?, 'R', '1 Road', 'Toronto', 'CA', ?, ?, ?, ?, 'google', '/santa-letter')`);
order.run('a@x.test', 700, 'paid', at(2), at(2));
order.run('a@x.test', 900, 'mailed', at(50), at(50));
order.run('b@x.test', 500, 'awaiting_payment', at(3), null);
order.run('c@x.test', 600, 'paid', at(24 * 40), at(24 * 40));
const view = db.prepare('INSERT INTO page_views (path, ip, source, device_type, country_code, country_name, created_at, bot_name) VALUES (?,?,?,?,?,?,?,?)');
view.run('/santa-letter', '1.1.1.1', 'google', 'mobile', 'CA', 'Canada', at(0.1), '');
view.run('/send', '1.1.1.1', 'google', 'mobile', 'CA', 'Canada', at(0.05), '');
view.run('/', '2.2.2.2', 'direct', 'desktop', 'US', 'United States', at(30), '');
view.run('/', '9.9.9.9', 'google', 'desktop', 'US', 'United States', at(1), 'Googlebot');

test('the report counts paid orders and people only, against the period before', () => {
  const d = reports.build(deps, { days: '28' }, NOW);
  assert.equal(d.kpis.orders.now, 2);
  assert.equal(d.kpis.orders.before, 1);
  assert.equal(d.kpis.revenue.now, 1600);
  assert.equal(d.kpis.visitors.now, 2);       // the crawler is left out
  assert.equal(d.kpis.sendViews.now, 1);
  assert.equal(d.series.dates.length, 28);
  assert.equal(d.series.revenue.reduce((a, b) => a + b, 0), 1600);
  assert.deepEqual(d.overview.target, { goal: 40, month: 2 });
  assert.equal(d.audience.heat.length, 7);
  assert.ok(d.sales.journey.some(([from, to, n]) => from === 'Santa letter' && to === 'Paid an order' && n === 1));
  assert.ok(d.overview.actions.some(a => /waiting for your approval/.test(a.text)));
});

test('odd filters fall back to every site and 28 days', () => {
  const d = reports.build(deps, { days: "7' OR 1=1", site: "ca'; DROP TABLE orders" }, NOW);
  assert.equal(d.days, 28);
  assert.equal(d.site, 'all');
});

test('live shows who is on the sites now and the newest events', () => {
  const l = reports.live(deps, {}, NOW);
  assert.equal(l.active, 1);
  assert.ok(l.events.length);
  assert.equal(l.orders[0].recipient_city, 'Toronto');
  assert.ok(!JSON.stringify(l).includes('a@x.test'), 'no customer addresses in the live feed');
});

test('every card export has a table, and spreadsheet formulas are defused', () => {
  const t = reports.tables(reports.build(deps, {}, NOW));
  for (const x of t) for (const row of x.rows) assert.equal(row.length, x.columns.length, `${x.screen}/${x.id}`);
  assert.equal(reports.toCsv(['a'], [['=HYPERLINK("x")'], [-5]]), '"a"\r\n"\'=HYPERLINK(""x"")"\r\n"-5"');
});

test('outside services that fail or are not set up do not break the rest', async () => {
  const fail = () => ({ autoPagingToArray: async () => { throw new Error('nope'); } });
  const stripe = { balance: { retrieve: async () => { throw new Error('Stripe is down'); } }, payouts: { list: async () => ({ data: [] }) },
    charges: { list: fail }, balanceTransactions: { list: fail }, disputes: { list: async () => ({ data: [] }) } };
  const x = await reports.external({ getSetting: (k, d = '') => d, setSetting: () => {}, stripe }, {}, async () => { throw new Error('offline'); }, NOW);
  assert.ok(x.stripe.error);
  assert.equal(x.analytics.configured, false);
  assert.equal(x.bing.configured, false);
  assert.equal(x.clarity.configured, false);
});

test('the heartbeat marks the day, and missed marks lower it', () => {
  reports.beat(db, NOW);
  reports.beat(db, NOW + 300000);
  reports.beat(db, NOW + 1800000);
  const row = db.prepare('SELECT beats, expected FROM app_heartbeat').get();
  assert.equal(row.beats, 3);
  assert.equal(row.expected, 7);
});

test('all time reaches back to the first record and shows what the shorter periods leave out', () => {
  const short = reports.build(deps, { days: '7' }, NOW), all = reports.build(deps, { days: 'all' }, NOW);
  assert.equal(all.period, 'all');
  assert.equal(short.kpis.orders.now, 2);
  assert.equal(all.kpis.orders.now, 3);          // includes the order from 40 days ago
  assert.equal(all.kpis.orders.before, 0);
  assert.ok(all.days >= 41);
  assert.equal(all.health.uptime.length, 90);    // the same whatever period is chosen
  assert.equal(short.health.uptime.length, 90);
  assert.ok(reports.tables(all).length);
});

test('search figures follow the period chosen, and say so when a period has not been fetched yet', async () => {
  const search = require('../searchApis');
  search.windowsSchema(db);
  const day = n => new Date(NOW - n * 86400000).toISOString().slice(0, 10);
  const answer = body => {
    const rows = [];
    if (body.dimensions[0] === 'date') for (let n = 2; n < 200; n++) rows.push({ keys: [day(n)], clicks: 1, impressions: 10, position: 5 });
    else rows.push({ keys: [body.dimensions[0] === 'page' ? 'https://letterhome.ca/from-' + body.startDate : 'can'], clicks: 3, impressions: 30, position: 4 });
    return { rows: rows.filter(r => body.dimensions[0] !== 'date' || (r.keys[0] >= body.startDate && r.keys[0] <= body.endDate)) };
  };
  const key = require('node:crypto').generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
  const settings = { gsc_service_key: JSON.stringify({ type: 'service_account', client_email: 'a@b.iam.gserviceaccount.com', private_key: key }) };
  const fetchImpl = async (url, opts = {}) => ({ ok: true, status: 200, json: async () => (url.includes('oauth2') ? { access_token: 't' }
    : url.endsWith('/sites') ? { siteEntry: [{ siteUrl: 'sc-domain:letterhome.ca', permissionLevel: 'siteOwner' }] } : answer(JSON.parse(opts.body))) });

  db.exec("DELETE FROM search_windows");
  assert.equal(reports.build(deps, { days: '28' }, NOW).search.standIn, false);
  const results = await search.fetchAll({ db, getSetting: (k, d = '') => settings[k] ?? d, setSetting() {}, fetchImpl, now: NOW });
  assert.ok(results.every(r => r.ok), JSON.stringify(results));
  const seen = ['7', '28', '90', 'all'].map(days => reports.build(deps, { days, site: 'ca' }, NOW).search);
  assert.deepEqual(seen.map(s => s.engines.google.clicks), [7, 28, 90, 198]);
  assert.equal(seen[0].engines.google.beforeClicks, 7);
  assert.equal(seen[3].engines.google.beforeClicks, null);
  assert.equal(new Set(seen.map(s => s.pages[0].key)).size, 4);
  assert.ok(seen.every(s => !s.standIn));
});
