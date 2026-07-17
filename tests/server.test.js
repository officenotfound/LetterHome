'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID, createHmac } = require('node:crypto');

// ── Test env setup (must happen before requiring server) ──────────────────────
const tmpDb = path.join(os.tmpdir(), `lh-test-${randomUUID()}.db`);
process.env.DB_PATH          = tmpDb;
process.env.TEST_MODE        = 'true';
process.env.NODE_ENV         = 'test';
process.env.SESSION_SECRET   = 'test-session-secret';
process.env.BASE_URL         = 'http://localhost';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_not_real';

// Admin credentials for exercising the protected admin surface in tests.
const ADMIN_PW = 'test-admin-pw';
process.env.ADMIN_USERNAME      = 'testadmin';
process.env.ADMIN_PASSWORD_HASH = require('bcryptjs').hashSync(ADMIN_PW, 10);
delete process.env.TOTP_SECRET; // keep admin login single-factor in tests

const WEBHOOK_SECRET = 'whsec_testabcdef1234567890abcdef';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

// ── Stripe mock (injected into require cache before server loads) ──────────────
const mockStripe = function StripeClient(_key) {
  return {
    checkout: {
      sessions: {
        create: async () => ({
          id:  'cs_test_' + randomUUID().replace(/-/g, ''),
          url: 'https://checkout.stripe.com/c/pay/test',
        }),
        retrieve: async (sessionId) => ({
          id:             sessionId,
          amount_total:   1000,
          payment_status: 'paid',
        }),
      },
    },
    webhooks: {
      constructEvent(body, sig, secret) {
        // Reproduce Stripe's t=<ts>,v1=<hmac> scheme for test isolation
        const parts = String(sig).split(',');
        const tPart  = parts.find(p => p.startsWith('t='));
        const v1Part = parts.find(p => p.startsWith('v1='));
        if (!tPart || !v1Part) throw new Error('Invalid signature format');
        const ts       = tPart.slice(2);
        const received = v1Part.slice(3);
        const expected = createHmac('sha256', secret)
          .update(`${ts}.${body}`)
          .digest('hex');
        if (received !== expected) throw new Error('No signatures found matching the expected signature for payload');
        return JSON.parse(body.toString());
      },
    },
  };
};

const stripeResolvePath = require.resolve('stripe');
require.cache[stripeResolvePath] = {
  id:       stripeResolvePath,
  filename: stripeResolvePath,
  loaded:   true,
  exports:  mockStripe,
};

// ── Load server (gets mocked stripe) ─────────────────────────────────────────
const { app, db } = require('../server');

// ── Helpers ───────────────────────────────────────────────────────────────────
function webhookSig(payload) {
  const ts   = Math.floor(Date.now() / 1000);
  const hmac = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${ts}.${payload}`)
    .digest('hex');
  return `t=${ts},v1=${hmac}`;
}

function seedOrder(overrides = {}) {
  const sessionId = 'cs_test_seed_' + randomUUID().replace(/-/g, '');
  db.prepare(`
    INSERT INTO orders
      (customer_email, recipient_name, recipient_street,
       destination_country, price_cents, status, stripe_session_id, status_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    overrides.email           ?? 'seed@example.com',
    overrides.recipientName   ?? 'Test Recipient',
    overrides.recipientStreet ?? '1 Test St',
    overrides.country         ?? 'CA',
    overrides.priceCents      ?? 1000,
    overrides.status          ?? 'awaiting_payment',
    overrides.sessionId       ?? sessionId,
    randomUUID(),
  );
  return overrides.sessionId ?? sessionId;
}

// ── Test server lifecycle ─────────────────────────────────────────────────────
let server, base;

before(async () => {
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  try { fs.unlinkSync(tmpDb); } catch {}
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /health returns 200 with db ok', async () => {
  const res  = await fetch(`${base}/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.db, 'ok');
});

test('POST /api/create-order persists order and returns checkoutUrl', async () => {
  const form = new URLSearchParams({
    'r-email':    'create@example.com',
    'r-name':     'Jane Doe',
    'r-street':   '123 Main St',
    'r-city':     'Toronto',
    'r-province': 'ON',
    'r-postal':   'M5V 1A1',
    'r-country':  'CA',
    'letter-body': 'Hello from a test.',
    'letter-type': 'standard',
  });
  const res  = await fetch(`${base}/api/create-order`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    form.toString(),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
  assert.ok(body.checkoutUrl, 'checkoutUrl missing');
  assert.ok(body.checkoutUrl.startsWith('https://'), 'checkoutUrl not a URL');

  const row = db.prepare(
    "SELECT * FROM orders WHERE customer_email = 'create@example.com' ORDER BY id DESC LIMIT 1"
  ).get();
  assert.ok(row, 'Order not found in DB');
  assert.equal(row.recipient_name, 'Jane Doe');
  assert.equal(row.status, 'awaiting_payment');
  assert.equal(row.destination_country, 'CA');
  assert.equal(row.price_cents, 1000);
});

test('POST /webhook with valid signature marks order paid', async () => {
  const sessionId = seedOrder({ status: 'awaiting_payment' });

  const payload = JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: { id: sessionId } },
  });
  const res  = await fetch(`${base}/webhook`, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'stripe-signature':  webhookSig(payload),
    },
    body: payload,
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body, { received: true });

  // fulfillOrder is async — give it a tick to commit the status update
  await new Promise(r => setTimeout(r, 100));

  const row = db.prepare(
    'SELECT status FROM orders WHERE stripe_session_id = ?'
  ).get(sessionId);
  assert.equal(row.status, 'paid');
});

test('POST /webhook with invalid signature returns 400', async () => {
  const payload = JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_irrelevant' } },
  });
  const res = await fetch(`${base}/webhook`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': 'invalid' },
    body:    payload,
  });
  assert.equal(res.status, 400);
});

test('GET /api/order-status returns order for valid session_id', async () => {
  const sessionId = seedOrder({ status: 'paid', recipientName: 'Alice Brown' });

  const res  = await fetch(`${base}/api/order-status?session_id=${sessionId}`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, 'paid');
  assert.equal(body.recipientName, 'Alice Brown');
  assert.ok(body.priceCents > 0);
});

test('GET /api/order-status returns 404 for unknown session', async () => {
  const res = await fetch(`${base}/api/order-status?session_id=cs_does_not_exist`);
  assert.equal(res.status, 404);
});

test('POST /api/create-order with missing required fields returns 400', async () => {
  const form = new URLSearchParams({
    'r-email':   'missing@example.com',
    'r-country': 'CA',
    // r-name and r-street intentionally omitted
  });
  const res  = await fetch(`${base}/api/create-order`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    form.toString(),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error, 'error field missing from 400 response');
});

test('POST /api/create-order with malformed email returns 400', async () => {
  const form = new URLSearchParams({
    'r-email':   'not-an-email',
    'r-name':    'Jane Doe',
    'r-street':  '123 Main St',
    'r-country': 'CA',
  });
  const res  = await fetch(`${base}/api/create-order`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    form.toString(),
  });
  assert.equal(res.status, 400, 'malformed email should be rejected before payment');
  const body = await res.json();
  assert.match(body.error, /valid email/i);
});

test('POST /api/track returns order data for valid email + order_id', async () => {
  const sessionId = seedOrder({ email: 'track@example.com', status: 'paid', recipientName: 'Bob Track' });
  const row = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sessionId);

  const res  = await fetch(`${base}/api/track`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: 'track@example.com', order_id: row.id }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.status, 'paid');
  assert.equal(body.recipientName, 'Bob Track');
  assert.ok(body.orderId > 0);
});

test('POST /api/track returns 404 for wrong email', async () => {
  const sessionId = seedOrder({ email: 'realowner@example.com', status: 'paid' });
  const row = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sessionId);

  const res = await fetch(`${base}/api/track`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: 'attacker@example.com', order_id: row.id }),
  });
  assert.equal(res.status, 404);
});

test('POST /api/track returns 404 for awaiting_payment orders', async () => {
  const sessionId = seedOrder({ email: 'unpaid@example.com', status: 'awaiting_payment' });
  const row = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sessionId);

  const res = await fetch(`${base}/api/track`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: 'unpaid@example.com', order_id: row.id }),
  });
  assert.equal(res.status, 404);
});

test('GET /status/:token returns status page HTML for a paid order', async () => {
  const sessionId = seedOrder({ email: 'statuspg@example.com', status: 'paid', recipientName: 'Dana Status' });
  const row = db.prepare('SELECT status_token FROM orders WHERE stripe_session_id = ?').get(sessionId);

  const res  = await fetch(`${base}/status/${row.status_token}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('Dana Status'), 'recipient name not in status page');
  assert.ok(html.includes('<!DOCTYPE html'), 'not an HTML response');
});

test('GET /status/:token returns 404 for an awaiting_payment order', async () => {
  const sessionId = seedOrder({ status: 'awaiting_payment' });
  const row = db.prepare('SELECT status_token FROM orders WHERE stripe_session_id = ?').get(sessionId);

  const res = await fetch(`${base}/status/${row.status_token}`);
  assert.equal(res.status, 404);
});

test('POST /api/contact returns 400 for missing fields', async () => {
  const res  = await fetch(`${base}/api/contact`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: 'Tester', email: 'tester@example.com' /* message omitted */ }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test('POST /api/contact returns 400 for invalid email', async () => {
  const res  = await fetch(`${base}/api/contact`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: 'Tester', email: 'not-an-email', message: 'Hello' }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

// ── Admin surface (auth enforcement + powerful mutating routes) ───────────────

async function loginAdmin() {
  const form = new URLSearchParams({ username: 'testadmin', password: ADMIN_PW });
  const res = await fetch(`${base}/admin/login`, {
    method:   'POST',
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:     form.toString(),
    redirect: 'manual',
  });
  const cookies = res.headers.getSetCookie();
  const sid = (cookies || []).map(c => c.split(';')[0]).find(c => c.startsWith('connect.sid='));
  assert.ok(sid, 'login did not return a session cookie');
  // The real admin dashboard reads its CSRF token from /api/admin/me and
  // sends it back on every mutating request — mirror that here so tests
  // exercise the same path production traffic does.
  const meRes = await fetch(`${base}/api/admin/me`, { headers: { Cookie: sid } });
  const me = await meRes.json();
  return { cookie: sid, csrfToken: me.csrfToken };
}

test('GET /api/admin/me returns 401 without a session', async () => {
  const res = await fetch(`${base}/api/admin/me`);
  assert.equal(res.status, 401);
});

test('admin can log in and /api/admin/me returns the username', async () => {
  const { cookie } = await loginAdmin();
  const res = await fetch(`${base}/api/admin/me`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.username, 'testadmin');
});

test('DELETE /api/admin/orders/:id is rejected without auth', async () => {
  const sessionId = seedOrder({ status: 'paid' });
  const id = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sessionId).id;
  const res = await fetch(`${base}/api/admin/orders/${id}`, { method: 'DELETE' });
  assert.equal(res.status, 401, 'unauthenticated delete must not be allowed');
  const stillThere = db.prepare('SELECT deleted_at FROM orders WHERE id = ?').get(id);
  assert.equal(stillThere.deleted_at, null, 'order must not be deleted by an unauthenticated request');
});

test('authenticated admin can change an order status', async () => {
  const { cookie, csrfToken } = await loginAdmin();
  const sessionId = seedOrder({ status: 'paid' });
  const id = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sessionId).id;
  const res = await fetch(`${base}/api/admin/orders/${id}/status`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrfToken },
    body:    JSON.stringify({ status: 'printing' }),
  });
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT status FROM orders WHERE id = ?').get(id);
  assert.equal(row.status, 'printing');
});

test('admin status change rejects an invalid status value', async () => {
  const { cookie, csrfToken } = await loginAdmin();
  const sessionId = seedOrder({ status: 'paid' });
  const id = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sessionId).id;
  const res = await fetch(`${base}/api/admin/orders/${id}/status`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrfToken },
    body:    JSON.stringify({ status: 'not-a-real-status' }),
  });
  assert.equal(res.status, 400);
});

test('authenticated admin can soft-delete an order', async () => {
  const { cookie, csrfToken } = await loginAdmin();
  const sessionId = seedOrder({ status: 'paid' });
  const id = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sessionId).id;
  const res = await fetch(`${base}/api/admin/orders/${id}`, {
    method:  'DELETE',
    headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
  });
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT deleted_at FROM orders WHERE id = ?').get(id);
  assert.ok(row.deleted_at, 'order should be soft-deleted (deleted_at set)');
});
