'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `lh-adminextras-${randomUUID()}.db`);

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const extras = require('../adminExtras');
const adminUsers = require('../adminUsers');

const ME_PW = 'correct horse battery';
let server, base, api;
const settings = {};

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', (req, res, next) => { req.session = { admin: { username: 'owner' } }; next(); });
  const requireAdmin = (req, res, next) => next();
  extras.register(app, { db, requireAdmin, logAudit: () => {}, getSetting: (k, d) => settings[k] ?? d, contentHeld: o => !!(o.content_flags && !o.content_cleared_at), today: () => '2026-11-23', ops: null });
  api = adminUsers.register(app, { db, requireAdmin, logAudit: () => {}, envAccounts: () => [{ user: 'owner', hash: bcrypt.hashSync(ME_PW, 4), totpSecret: null }] });
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  for (const f of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + f); } catch {} }
});

const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const mk = (o = {}) => Number(db.prepare(`INSERT INTO orders (customer_email, recipient_name, recipient_street, recipient_city, destination_country, price_cents, status, paid_at, page_count, colour_printing, scheduled_date, send_approved_at, postgrid_letter_id, postgrid_status)
  VALUES (?,?,?,?,?,?,?,datetime('now'),?,?,?,?,?,?)`).run(o.email || 'x@example.com', o.name || 'Pat Lee', '1 Main St', 'Toronto', o.cc || 'CA', o.price ?? 600, o.status || 'paid', o.pages || 2, o.colour ? 1 : 0, o.date || null, o.approved ? "2026-11-23 10:00:00" : null, o.letter || null, o.pgs || null).lastInsertRowid);

test('profit: a plain Canada letter is above the 38% floor, a cheap rest-of-world one is flagged', async () => {
  const ok = mk({ price: 600 });
  const bad = mk({ price: 600, cc: 'DE' });
  const p = await (await fetch(`${base}/api/admin/profit?days=30`)).json();
  assert.equal(p.floor, 38);
  assert.ok(p.total.orders >= 2);
  assert.ok(!p.below_floor.some(o => o.id === ok), 'Canada $6 clears the floor');
  assert.ok(p.below_floor.some(o => o.id === bad), 'a $6 order to Germany does not');
  assert.ok(p.by_country.find(c => c.key === 'CA'));
});

test('search finds an order by number, by name and by email, and ignores one character', async () => {
  const id = mk({ name: 'Zelda Quill', email: 'zq@example.com' });
  const s = async q => (await (await fetch(`${base}/api/admin/search?q=${encodeURIComponent(q)}`)).json()).orders.map(o => o.id);
  assert.ok((await s('#' + id)).includes(id));
  assert.ok((await s('quill')).includes(id));
  assert.ok((await s('zq@example')).includes(id));
  assert.deepEqual(await s('z'), []);
  assert.deepEqual(await s('%'), [], 'a wildcard is searched literally');
});

test('send date: can be changed, withdraws approval, refuses the past and orders already sent', async () => {
  const id = mk({ date: '2026-12-22', approved: true });
  const set = d => post(`/api/admin/orders/${id}/scheduled-date`, { date: d });
  assert.equal((await set('2026-11-01')).status, 400);
  assert.equal((await set('nope')).status, 400);
  assert.equal((await set('2099-01-01')).status, 400);
  assert.equal((await set('2026-12-20')).status, 200);
  const o = db.prepare('SELECT scheduled_date, schedule_for_later, send_approved_at FROM orders WHERE id = ?').get(id);
  assert.equal(o.scheduled_date, '2026-12-20');
  assert.equal(o.schedule_for_later, 1);
  assert.equal(o.send_approved_at, null, 'changing the date withdraws the approval');
  assert.equal((await set('')).status, 200);
  assert.equal(db.prepare('SELECT scheduled_date FROM orders WHERE id = ?').get(id).scheduled_date, null);
  const sent = mk({ letter: 'letter_1', pgs: 'ready' });
  assert.equal((await post(`/api/admin/orders/${sent}/scheduled-date`, { date: '2026-12-20' })).status, 400);
});

test('today lists what is due, what goes tomorrow and what is scheduled but not approved', async () => {
  const due = mk({ date: '2026-11-23', approved: true });
  const tom = mk({ date: '2026-11-24', approved: true });
  const soon = mk({ date: '2026-11-27' });
  const t = await (await fetch(`${base}/api/admin/today`)).json();
  assert.ok(t.due_today.some(o => o.id === due));
  assert.ok(t.tomorrow.some(o => o.id === tom));
  assert.ok(t.unapproved_soon.some(o => o.id === soon));
  assert.ok(!t.unapproved_soon.some(o => o.id === tom), 'an approved order is not nagged about');
});

test('admin users: needs your password, rejects weak or taken names, adds with a 2FA key, removes, and the account stops being valid', async () => {
  const add = (extra = {}) => post('/api/admin/admin-users', { username: 'helper1', password: 'a-long-password-1', current_password: ME_PW, ...extra });
  assert.equal((await add({ current_password: 'wrong' })).status, 403);
  assert.equal((await add({ password: 'short' })).status, 400);
  assert.equal((await add({ username: 'owner' })).status, 409);
  assert.equal((await add({ username: 'a b' })).status, 400);
  const r = await (await add()).json();
  assert.equal(r.ok, true);
  assert.match(r.secret, /^[A-Z2-7]{20,}$/);
  assert.equal((await add()).status, 409);
  assert.equal(api.stillValid('helper1'), true);
  assert.equal(api.stillValid('nobody'), false);
  assert.equal(api.accountsForLogin().find(a => a.user === 'helper1').totpSecret, r.secret);
  assert.ok(bcrypt.compareSync('a-long-password-1', api.accountsForLogin()[0].hash));
  const list = await (await fetch(`${base}/api/admin/admin-users`)).json();
  assert.ok(list.users.some(u => u.username === 'owner' && !u.removable));
  assert.equal((await post('/api/admin/admin-users/remove', { username: 'helper1', current_password: 'wrong' })).status, 403);
  assert.equal((await post('/api/admin/admin-users/remove', { username: 'owner', current_password: ME_PW })).status, 404, 'owner accounts cannot be removed here');
  assert.equal((await post('/api/admin/admin-users/remove', { username: 'helper1', current_password: ME_PW })).status, 200);
  assert.equal(api.stillValid('helper1'), false);
});
