'use strict';
// Fax to Canada and the US (fax.js): quote, payment, approval, Telnyx webhooks (signed), retries, refunds and cleanup.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const { PDFDocument } = require('pdf-lib');

process.env.TEST_MODE = 'true';
process.env.SESSION_SECRET = 'fax-test-secret';
const fax = require('../fax');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-fax-'));
const db = new DatabaseSync(':memory:');
const settings = { fax_enabled: 'true' };
const getSetting = (k, d = '') => (k in settings ? settings[k] : d);
const mails = [], ownerMails = [], refunds = [], sessions = [];
const stripe = {
  checkout: { sessions: { create: async o => { sessions.push(o); return { id: 'cs_' + sessions.length, url: 'https://checkout.stripe.test/' + sessions.length }; } } },
  refunds: { create: async (o, opts) => { refunds.push({ o, opts }); return { id: 're_1' }; } },
};
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubB64 = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('base64');
let server, base, api;

before(async () => {
  const app = express();
  app.use((req, _res, next) => { req.session = { admin: { username: 'owner' } }; next(); });
  api = fax.register(app, { db, getSetting, stripe, sendMail: async m => { mails.push(m); }, sendOwnerMail: (s, t) => ownerMails.push({ s, t }),
    requireAdmin: (_q, _s, n) => n(), logAudit: () => {}, siteBase: () => 'http://localhost', dataDir: dir,
    emailShell: o => `<h1>${o.h1}</h1>` });
  api.registerWebhook(app);
  app.use(express.json());
  api.registerAdmin(app);
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server && server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

async function pdf(pages) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([612, 792]);
  return Buffer.from(await d.save());
}
async function quote(fields, file, name = 'doc.pdf') {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append('document', new Blob([file]), name);
  const r = await fetch(base + '/api/fax/quote', { method: 'POST', body: fd });
  return { status: r.status, body: await r.json() };
}
const good = { to: '613-555-0123', email: 'a@example.com', sender_name: 'Ana' };
const post = (u, b) => fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(async r => ({ status: r.status, body: await r.json() }));
function signed(body, ts = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(body);
  const sig = crypto.sign(null, Buffer.from(`${ts}|${raw}`), privateKey).toString('base64');
  return fetch(base + '/api/fax/telnyx-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'telnyx-timestamp': String(ts), 'telnyx-signature-ed25519': sig }, body: raw });
}
async function paidFax(pages = 3) {
  const q = await quote(good, await pdf(pages));
  await post('/api/fax/checkout', { ref: q.body.ref });
  const f = db.prepare('SELECT * FROM fax_orders WHERE public_ref = ?').get(q.body.ref);
  api.onCheckoutCompleted({ id: f.stripe_session_id, payment_status: 'paid', payment_intent: 'pi_' + f.id, metadata: { kind: 'fax', fax_ref: f.public_ref } });
  return db.prepare('SELECT * FROM fax_orders WHERE id = ?').get(f.id);
}

test('fax numbers: +1 numbers in any common format, never toll-free or short', () => {
  assert.equal(fax.normalizeNumber('613-555-0123'), '+16135550123');
  assert.equal(fax.normalizeNumber('+1 (212) 555-0199'), '+12125550199');
  assert.equal(fax.normalizeNumber('1 604 555 0101'), '+16045550101');
  assert.equal(fax.normalizeNumber('800-555-0100'), null);
  assert.equal(fax.normalizeNumber('+44 20 7946 0000'), null);
  assert.equal(fax.normalizeNumber('555-0123'), null);
});

test('price: $5 up to 10 pages, then $1 a page, from the settings', () => {
  assert.equal(fax.priceFor(getSetting, 1), 500);
  assert.equal(fax.priceFor(getSetting, 10), 500);
  assert.equal(fax.priceFor(getSetting, 13), 800);
});

test('quote: counts pages, adds a cover page for a note, refuses bad input', async () => {
  let r = await quote(good, await pdf(12));
  assert.equal(r.status, 200);
  assert.equal(r.body.pages, 12);
  assert.equal(r.body.price_cents, 700);
  r = await quote({ ...good, cover_note: 'Please see attached.' }, await pdf(2));
  assert.equal(r.body.pages, 3);
  assert.equal(r.body.cover, true);
  assert.equal((await quote({ ...good, to: '800-555-0100' }, await pdf(1))).status, 400);
  assert.equal((await quote(good, Buffer.from('not a document'), 'x.pdf')).status, 400);
  assert.equal((await quote({ ...good, email: 'nope' }, await pdf(1))).status, 400);
  settings.fax_enabled = 'false';
  const closed = process.env.TEST_MODE; delete process.env.TEST_MODE;
  assert.equal((await quote(good, await pdf(1))).status, 403);
  process.env.TEST_MODE = closed; settings.fax_enabled = 'true';
});

test('payment: Stripe event marks it paid once, emails the customer and the owner, then it waits for approval', async () => {
  const f = await paidFax(2);
  assert.equal(f.status, 'paid');
  assert.equal(sessions.at(-1).metadata.kind, 'fax');
  const before = mails.length;
  api.onCheckoutCompleted({ id: f.stripe_session_id, payment_status: 'paid', payment_intent: f.payment_intent, metadata: { kind: 'fax', fax_ref: f.public_ref } });
  assert.equal(mails.length, before, 'a repeated Stripe event sends nothing twice');
  assert.match(mails.at(-1).subject, /confirmed/);
  assert.match(ownerMails.at(-1).s, /waiting for approval/);
  assert.equal(api.onCheckoutCompleted({ metadata: {} }), false, 'letter orders are left to the normal handler');
});

test('approve sends (simulated in test mode); signed delivered webhook finishes it; duplicates and bad signatures are ignored', async () => {
  const f = await paidFax(4);
  const a = await post(`/api/admin/faxes/${f.id}/approve`);
  assert.equal(a.status, 200);
  assert.equal(a.body.simulated, true);
  let row = db.prepare('SELECT * FROM fax_orders WHERE id = ?').get(f.id);
  assert.equal(row.status, 'sending');
  settings.telnyx_public_key = pubB64;
  const ev = { data: { id: 'evt-' + f.id, event_type: 'fax.delivered', payload: { fax_id: row.telnyx_fax_id, page_count: 4, status: 'delivered' } } };
  const bad = await fetch(base + '/api/fax/telnyx-webhook', { method: 'POST', headers: { 'telnyx-timestamp': String(Math.floor(Date.now() / 1000)), 'telnyx-signature-ed25519': Buffer.alloc(64).toString('base64') }, body: JSON.stringify(ev) });
  assert.equal(bad.status, 401);
  const stale = await signed(ev, Math.floor(Date.now() / 1000) - 600);
  assert.equal(stale.status, 401, 'old timestamps are refused');
  assert.equal((await signed(ev)).status, 200);
  row = db.prepare('SELECT * FROM fax_orders WHERE id = ?').get(f.id);
  assert.equal(row.status, 'delivered');
  assert.match(mails.at(-1).subject, /delivered/);
  const n = mails.length;
  assert.equal((await (await signed(ev)).json()).duplicate, true);
  assert.equal(mails.length, n);
});

test('busy line retries twice, then waits for the owner; owner can refund', async () => {
  const f = await paidFax(1);
  await post(`/api/admin/faxes/${f.id}/approve`);
  for (let i = 1; i <= 3; i++) {
    let row = db.prepare('SELECT * FROM fax_orders WHERE id = ?').get(f.id);
    api.settle(row, 'failed', { reason: 'user_busy' });
    row = db.prepare('SELECT * FROM fax_orders WHERE id = ?').get(f.id);
    if (i < 3) {
      assert.equal(row.status, 'retrying');
      db.prepare("UPDATE fax_orders SET next_retry_at = datetime('now','-1 minute') WHERE id = ?").run(f.id);
      await api.sweep();
      assert.equal(db.prepare('SELECT status FROM fax_orders WHERE id = ?').get(f.id).status, 'sending');
    } else {
      assert.equal(row.status, 'failed');
      assert.equal(row.attempts, 3);
    }
  }
  assert.match(ownerMails.at(-1).s, /failed/);
  assert.equal(refunds.length, 0, 'no automatic refund');
  const r = await post(`/api/admin/faxes/${f.id}/refund`);
  assert.equal(r.status, 200);
  assert.equal(refunds.at(-1).o.payment_intent, f.payment_intent);
  assert.equal(db.prepare('SELECT status FROM fax_orders WHERE id = ?').get(f.id).status, 'refunded');
});

test('a wrong number is not retried automatically', async () => {
  const f = await paidFax(1);
  await post(`/api/admin/faxes/${f.id}/approve`);
  api.settle(db.prepare('SELECT * FROM fax_orders WHERE id = ?').get(f.id), 'failed', { reason: 'destination_invalid' });
  assert.equal(db.prepare('SELECT status FROM fax_orders WHERE id = ?').get(f.id).status, 'failed');
});

test('media link for Telnyx is signed and expires; files are deleted 24 hours after the fax is finished', async () => {
  const f = await paidFax(1);
  assert.equal((await fetch(`${base}/api/fax/media/${f.id}/9999999999/deadbeef`)).status, 404);
  db.prepare("UPDATE fax_orders SET status = 'delivered', finished_at = datetime('now','-25 hours') WHERE id = ?").run(f.id);
  const file = path.join(dir, 'faxes', f.file_name);
  assert.ok(fs.existsSync(file));
  await api.sweep();
  assert.ok(!fs.existsSync(file));
  assert.ok(db.prepare('SELECT files_deleted_at FROM fax_orders WHERE id = ?').get(f.id).files_deleted_at);
});

test('without Telnyx keys and outside test mode, approval refuses instead of pretending', async () => {
  const f = await paidFax(1);
  const saved = process.env.TEST_MODE; delete process.env.TEST_MODE;
  const r = await post(`/api/admin/faxes/${f.id}/approve`);
  process.env.TEST_MODE = saved;
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Telnyx is not set up/);
});
