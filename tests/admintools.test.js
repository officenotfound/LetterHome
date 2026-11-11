'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { randomUUID } = require('node:crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `lh-admintools-${randomUUID()}.db`);
const backupDir = path.join(os.tmpdir(), `lh-admintools-bk-${randomUUID()}`);
fs.mkdirSync(backupDir, { recursive: true });

const express = require('express');
const db = require('../db');
const tools = require('../adminTools');

// Builds a zip the way Search Console does (deflated entries), so the reader is tested on realistic input.
function makeZip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = zlib.deflateRawSync(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

const QUERIES = 'Top queries,Clicks,Impressions,CTR,Position\n"how long does a letter take, in canada",0,46,0%,8.6\nletter mailing service,0,15,0%,14\n';
const PAGES = 'Top pages,Clicks,Impressions,CTR,Position\nhttps://letterhome.ca/how-long,6,3672,0.16%,9.5\nhttps://letterhome.ca/,9,608,1.48%,56.8\n';
const COUNTRIES = 'Country,Clicks,Impressions,CTR,Position\nCanada,19,5185,0.37%,15.6\nUnited Kingdom,0,278,0%,34.8\n';
const CHART = 'Date,Clicks,Impressions,CTR,Position\n2026-10-01,1,133,0.75%,9\n2026-10-02,2,104,1.92%,8.4\n';

let server, base;

before(async () => {
  const app = express();
  const requireAdmin = (req, res, next) => next();
  app.use('/api/admin', (req, res, next) => { req.session = {}; next(); });
  const res = tools.register(app, {
    db, requireAdmin, logAudit: () => {}, getSetting: () => null,
    backupDir, appRoot: path.join(__dirname, '..'), baseUrl: 'http://localhost',
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

test('csv parser keeps commas inside quotes', () => {
  const rows = tools.parseCsv(QUERIES);
  assert.equal(rows[1][0], 'how long does a letter take, in canada');
  assert.equal(rows.length, 3);
});

test('a Search Console zip is read into queries, pages, countries and dates', () => {
  const zip = makeZip({ 'Queries.csv': QUERIES, 'Pages.csv': PAGES, 'Countries.csv': COUNTRIES, 'Chart.csv': CHART });
  const data = tools.parseUpload(zip, 'letterhome.ca.zip');
  assert.equal(data.queries.length, 2);
  assert.equal(data.pages[0].impressions, 3672);
  assert.ok(Math.abs(data.pages[0].ctr - 0.0016) < 1e-9, 'percent strings become fractions');
  assert.equal(data.chart.length, 2);
});

test('a file that is not a Search Console export is refused with a clear message', () => {
  assert.throws(() => tools.parseUpload(Buffer.from('hello,world\n1,2\n'), 'x.csv'), /Could not tell/);
  assert.throws(() => tools.parseUpload(makeZip({ 'readme.txt': 'hi' }), 'x.zip'), /No Search Console tables/);
});

test('import then growth: page-one pages with few clicks and near page-one queries are found', async () => {
  const zip = makeZip({ 'Queries.csv': QUERIES, 'Pages.csv': PAGES, 'Countries.csv': COUNTRIES, 'Chart.csv': CHART });
  const imp = await fetch(`${base}/api/admin/growth/import`, { method: 'POST', headers: { 'x-site': 'ca', 'x-filename': 'a.zip', 'content-type': 'application/octet-stream' }, body: zip });
  assert.equal(imp.status, 200);
  const j = await imp.json();
  assert.equal(j.ok, true);
  const g = await (await fetch(`${base}/api/admin/growth?site=ca`)).json();
  assert.equal(g.latest.impressions, 237);
  assert.equal(g.pageOneQuiet[0].key, '/how-long');
  assert.equal(g.nearPageOne[0].key, 'letter mailing service');
  assert.equal(g.deepCountries[0].key, 'United Kingdom');
  assert.ok(g.questions.some(q => q.key.startsWith('how long')));
});

test('import needs a site and a file', async () => {
  const noSite = await fetch(`${base}/api/admin/growth/import`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: Buffer.from('x') });
  assert.equal(noSite.status, 400);
  const bad = await fetch(`${base}/api/admin/growth/import`, { method: 'POST', headers: { 'x-site': 'ca', 'content-type': 'application/octet-stream' }, body: Buffer.from('not a real export') });
  assert.equal(bad.status, 400);
});

test('a second import shows what moved since the first', async () => {
  const pages2 = 'Top pages,Clicks,Impressions,CTR,Position\nhttps://letterhome.ca/how-long,9,3900,0.2%,8.5\nhttps://letterhome.ca/new-page,0,90,0%,12\n';
  const zip = makeZip({ 'Queries.csv': QUERIES, 'Pages.csv': pages2, 'Chart.csv': CHART });
  await fetch(`${base}/api/admin/growth/import`, { method: 'POST', headers: { 'x-site': 'ca', 'content-type': 'application/octet-stream' }, body: zip });
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
