'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `lh-admintools-${randomUUID()}.db`);
const backupDir = path.join(os.tmpdir(), `lh-admintools-bk-${randomUUID()}`);
fs.mkdirSync(backupDir, { recursive: true });

const express = require('express');
const db = require('../db');
const tools = require('../adminTools');

// A stored copy of search results, as the daily fetch writes it.
function seed(date, { queries = [], pages = [], countries = [], impressions = 0 }) {
  const id = Number(db.prepare('INSERT INTO gsc_snapshots (site, date_from, date_to, clicks, impressions) VALUES (?,?,?,?,?)').run('ca', date, date, 0, impressions).lastInsertRowid);
  const ins = db.prepare('INSERT INTO gsc_rows (snapshot_id, kind, key, clicks, impressions, ctr, position) VALUES (?,?,?,?,?,?,?)');
  for (const [kind, rows] of [['query', queries], ['page', pages], ['country', countries]]) for (const r of rows) ins.run(id, kind, ...r);
}
const QUERIES = [['how long does a letter take, in canada', 0, 46, 0, 8.6], ['letter mailing service', 0, 15, 0, 14]];

let server, base;
const submitted = [];

before(async () => {
  const app = express();
  app.use(express.json());
  const requireAdmin = (req, res, next) => next();
  app.use('/api/admin', (req, res, next) => { req.session = {}; next(); });
  const res = tools.register(app, {
    db, requireAdmin, logAudit: () => {}, getSetting: () => null,
    backupDir, appRoot: path.join(__dirname, '..'), baseUrl: 'http://localhost',
    submitOrder: async id => { submitted.push(id); return id === 999999 ? { ok: false, error: 'PostGrid said no' } : { ok: true, letter_id: 'letter_' + id }; },
    contentHeld: o => !!(o.content_flags && !o.content_cleared_at),
    printReady: () => true,
  });
  assert.equal(typeof res.runAudit, 'function');
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  for (const f of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + f); } catch {} }
  try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch {}
});

test('growth: page-one pages with few clicks and near page-one queries are found', async () => {
  seed('2026-10-02', { impressions: 237, queries: QUERIES,
    pages: [['https://letterhome.ca/how-long', 6, 3672, 0.0016, 9.5], ['https://letterhome.ca/', 9, 608, 0.0148, 56.8]],
    countries: [['Canada', 19, 5185, 0.0037, 15.6], ['United Kingdom', 0, 278, 0, 34.8]] });
  const g = await (await fetch(`${base}/api/admin/growth?site=ca`)).json();
  assert.equal(g.latest.impressions, 237);
  assert.equal(g.pageOneQuiet[0].key, '/how-long');
  assert.equal(g.nearPageOne[0].key, 'letter mailing service');
  assert.equal(g.deepCountries[0].key, 'United Kingdom');
  assert.ok(g.questions.some(q => q.key.startsWith('how long')));
});

test('a newer copy shows what moved since the one before', async () => {
  seed('2026-10-12', { queries: QUERIES, pages: [['https://letterhome.ca/how-long', 9, 3900, 0.002, 8.5], ['https://letterhome.ca/new-page', 0, 90, 0, 12]] });
  const g = await (await fetch(`${base}/api/admin/growth?site=ca`)).json();
  assert.ok(g.previous);
  const m = g.movers.find(x => x.key === '/new-page');
  assert.ok(m && m.isNew && m.delta === 90);
});

test('funnel returns checkout steps, revenue and weekly orders', async () => {
  db.prepare(`INSERT INTO orders (customer_email, recipient_name, recipient_street, price_cents, status, destination_country, paid_at, mailed_at)
    VALUES ('a@example.com','R','1 Main St',600,'mailed','CA', datetime('now','-3 days'), datetime('now','-2 days'))`).run();
  db.prepare(`INSERT INTO orders (customer_email, recipient_name, recipient_street, price_cents, status, destination_country)
    VALUES ('b@example.com','R','1 Main St',600,'awaiting_payment','CA')`).run();
  db.prepare("INSERT INTO funnel_events (step, country, day) VALUES ('send_view','CA', date('now'))").run();
  const f = await (await fetch(`${base}/api/admin/funnel?days=30`)).json();
  assert.equal(f.orders, 1);
  assert.equal(f.revenue_cents, 600);
  assert.equal(f.unpaid, 1);
  assert.equal(f.steps.send_view, 1);
  assert.equal(f.steps.mailed, 1);
  assert.ok(f.weekly.length >= 1);
  assert.ok(f.median_hours_to_mail > 0);
  const bad = await (await fetch(`${base}/api/admin/funnel?days=30&site=%27%3B--`)).json();
  assert.equal(bad.site, 'all', 'an unknown site value is ignored, not put into the query');
});

test('health detail reports cpu, memory and the newest backup', async () => {
  fs.writeFileSync(path.join(backupDir, 'orders-2026-01-01.db'), 'x');
  const h = await (await fetch(`${base}/api/admin/health-detail`)).json();
  assert.ok(h.cpus >= 1);
  assert.ok(h.mem.total > 0);
  assert.equal(h.backup.file, 'orders-2026-01-01.db');
  fs.unlinkSync(path.join(backupDir, 'orders-2026-01-01.db'));
});

test('restore drill opens a real backup, checks it, and leaves no scratch file behind', async () => {
  const before = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('drill-')).length;
  db.prepare('VACUUM INTO ?').run(path.join(backupDir, 'orders-2026-02-02.db'));
  const r = await (await fetch(`${base}/api/admin/backups/drill`, { method: 'POST' })).json();
  assert.equal(r.ok, true);
  assert.equal(r.integrity, 'ok');
  assert.equal(r.backupOrders, r.liveOrders);
  assert.equal(fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('drill-')).length, before);
});

test('restore drill fails clearly on a damaged backup', async () => {
  fs.writeFileSync(path.join(backupDir, 'orders-2026-03-03.db'), 'this is not a database');
  const r = await fetch(`${base}/api/admin/backups/drill`, { method: 'POST' });
  const j = await r.json();
  assert.equal(j.ok, false);
  fs.unlinkSync(path.join(backupDir, 'orders-2026-03-03.db'));
});

test('content audit reads the real pages and reports counts', async () => {
  const r = await (await fetch(`${base}/api/admin/seo-audit/run`, { method: 'POST' })).json();
  assert.ok(r.pages > 100);
  assert.equal(typeof r.counts.high, 'number');
  const again = await (await fetch(`${base}/api/admin/seo-audit`)).json();
  assert.equal(again.pages, r.pages);
  const newPage = r.issues.filter(i => i.page === '/postage-for-a-large-letter-in-canada' && i.sev !== 'low');
  assert.deepEqual(newPage, [], 'the new large-letter page should have no high or medium issues');
});

const mkOrder = (email, o) => Number(db.prepare(`INSERT INTO orders (customer_email, recipient_name, recipient_street, recipient_city, recipient_province, recipient_postal, destination_country, price_cents, status, paid_at, content_flags)
  VALUES (?,?,?,?,?,?,?,600,'paid', datetime('now'), ?)`).run(email, o.name || 'Pat Lee', o.street || '12 King St W', o.city || 'Toronto', o.prov || 'ON', o.postal || 'M5H 1A1', o.cc || 'CA', o.flags || null).lastInsertRowid);

test('approval queue lists paid orders and separates clean ones from those that need a look', async () => {
  const clean = mkOrder('c1@example.com', {});
  const badPostal = mkOrder('c2@example.com', { postal: '12' });
  const held = mkOrder('c3@example.com', { flags: JSON.stringify({ hits: [{ label: 'threat' }] }) });
  const d = await (await fetch(`${base}/api/admin/approvals`)).json();
  assert.equal(d.configured, true);
  const by = Object.fromEntries(d.orders.map(o => [o.id, o]));
  assert.equal(by[clean].clean, true);
  assert.equal(by[badPostal].clean, false);
  assert.match(by[badPostal].issues.join(' '), /Postal code/);
  assert.equal(by[held].clean, false);
  assert.equal(by[held].held, true);
  assert.deepEqual(by[held].flags, ['threat']);
});

test('approving sends only what was chosen, and never an order that is not waiting', async () => {
  const a = mkOrder('d1@example.com', {});
  const b = mkOrder('d2@example.com', {});
  const post = body => fetch(`${base}/api/admin/approvals/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  submitted.length = 0;
  const r = await (await post({ ids: [a] })).json();
  assert.equal(r.ok, true);
  assert.deepEqual(submitted, [a], 'only the chosen order is sent');
  db.prepare("UPDATE orders SET status = 'printing', postgrid_letter_id = 'x' WHERE id = ?").run(a);
  submitted.length = 0;
  const again = await (await post({ ids: [a, b] })).json();
  assert.equal(again.results.find(x => x.id === a).ok, false, 'an order already sent is refused');
  assert.deepEqual(submitted, [b]);
});

test('a scheduled order is approved now but not sent until its date, and approval can be withdrawn', async () => {
  const id = mkOrder('sch1@example.com', {});
  db.prepare("UPDATE orders SET scheduled_date = '2999-12-22', schedule_for_later = 1 WHERE id = ?").run(id);
  const post = (path, body) => fetch(`${base}/api/admin/approvals/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let d = await (await fetch(`${base}/api/admin/approvals`)).json();
  let o = d.orders.find(x => x.id === id);
  assert.equal(o.scheduled, '2999-12-22');
  assert.equal(o.clean, true, 'a scheduled order with nothing wrong is clean');
  assert.equal(o.approved_for, null);
  submitted.length = 0;
  const r = await (await post('approve', { ids: [id] })).json();
  assert.equal(r.ok, true);
  assert.equal(r.results[0].scheduled_for, '2999-12-22');
  assert.deepEqual(submitted, [], 'nothing goes to print before the date');
  assert.ok(db.prepare('SELECT send_approved_at FROM orders WHERE id = ?').get(id).send_approved_at);
  d = await (await fetch(`${base}/api/admin/approvals`)).json();
  assert.equal(d.orders.find(x => x.id === id).approved_for, '2999-12-22');
  assert.equal((await (await post('unapprove', { id })).json()).ok, true);
  assert.equal(db.prepare('SELECT send_approved_at FROM orders WHERE id = ?').get(id).send_approved_at, null);
});

test('a scheduled order held for content cannot be approved', async () => {
  const id = mkOrder('sch2@example.com', { flags: JSON.stringify({ hits: [{ label: 'threat' }] }) });
  db.prepare("UPDATE orders SET scheduled_date = '2999-12-22' WHERE id = ?").run(id);
  const r = await (await fetch(`${base}/api/admin/approvals/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [id] }) })).json();
  assert.equal(r.results[0].ok, false);
  assert.equal(db.prepare('SELECT send_approved_at FROM orders WHERE id = ?').get(id).send_approved_at, null);
});

test('approving needs a list of ids and caps a batch at 10', async () => {
  const post = body => fetch(`${base}/api/admin/approvals/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ ids: [] })).status, 400);
  assert.equal((await post({ ids: Array.from({ length: 11 }, (_, i) => i + 1) })).status, 400);
  assert.equal((await post({ ids: ['x', -4, 1.5] })).status, 400);
});

test('a failed send is reported per order and does not stop the rest', async () => {
  const good = mkOrder('e1@example.com', {});
  const post = body => fetch(`${base}/api/admin/approvals/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const bad = Number(db.prepare(`INSERT INTO orders (id, customer_email, recipient_name, recipient_street, price_cents, status) VALUES (999999,'e2@example.com','X','1 Main St',600,'paid')`).run().lastInsertRowid);
  const r = await (await post({ ids: [bad, good] })).json();
  assert.equal(r.ok, false);
  assert.equal(r.results.find(x => x.id === bad).error, 'PostGrid said no');
  assert.equal(r.results.find(x => x.id === good).ok, true);
});

test('outreach follow-ups: opened and quiet contacts come first, replied and unsubscribed are left out', async () => {
  const add = (email, status, sentDaysAgo, token) => db.prepare(`INSERT INTO outreach_contacts (campaign, business_name, email, status, token, sent_at) VALUES ('t', ?, ?, ?, ?, datetime('now', ?))`)
    .run('Biz ' + email, email, status, token, `-${sentDaysAgo} days`).lastInsertRowid;
  const quiet = Number(add('quiet@example.com', 'sent', 10, 'tok-q'));
  const opened = Number(add('opened@example.com', 'sent', 9, 'tok-o'));
  const recent = Number(add('recent@example.com', 'sent', 2, 'tok-r'));
  const gone = Number(add('gone@example.com', 'sent', 12, 'tok-g'));
  const bounced = Number(add('bounce@example.com', 'failed', 12, 'tok-b'));
  db.prepare("INSERT INTO email_opens (token, open_count) VALUES ('tok-o', 3)").run();
  db.prepare("INSERT INTO customers (email, unsubscribed_at) VALUES ('gone@example.com', CURRENT_TIMESTAMP)").run();
  const f = await (await fetch(`${base}/api/admin/outreach/followups?days=7`)).json();
  const ids = f.due.map(r => r.id);
  assert.deepEqual(ids, [opened, quiet], 'opened first, then oldest; recent and unsubscribed are not due');
  assert.equal(f.waiting, 1);
  assert.equal(f.failed[0].id, bounced);
  assert.equal(f.unsubscribed, 1);
  const post = body => fetch(`${base}/api/admin/outreach/contacts/${quiet}/followup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ action: 'replied', note: 'wants a quote' })).status, 200);
  const after = await (await fetch(`${base}/api/admin/outreach/followups?days=7`)).json();
  assert.deepEqual(after.due.map(r => r.id), [opened]);
  assert.equal(after.replied[0].followup_note, 'wants a quote');
  await post({ action: 'reopen' });
  const reopened = await (await fetch(`${base}/api/admin/outreach/followups?days=7`)).json();
  assert.ok(reopened.due.some(r => r.id === quiet));
  assert.equal((await post({ action: 'nonsense' })).status, 400);
  assert.equal(recent > 0, true);
});
