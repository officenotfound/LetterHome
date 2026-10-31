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
          status:         'open',
        }),
        expire: async (sessionId) => ({ id: sessionId, status: 'expired' }),
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
// Capture outgoing mail instead of sending it (the SMTP_HOST gate stays off except inside tests that set it).
const sentMail = [];
require('nodemailer').createTransport = () => ({ sendMail: async (o) => { sentMail.push(o); return {}; } });

const { app, db, thankYouCouponJob } = require('../server');

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
  assert.equal(row.price_cents, 500);
});

test('pricing: rest-of-world base plus colour, large envelope and free scheduling', async () => {
  const form = new URLSearchParams({
    'r-email':    'pricing@example.com',
    'r-name':     'Marie Dupont',
    'r-street':   '1 Rue de Rivoli',
    'r-city':     'Paris',
    'r-postal':   '75001',
    'r-country':  'FR',
    'letter-body': 'Bonjour.',
    'letter-type': 'standard',
    'colour_printing':    '1',
    'large_envelope':     '1',
    'schedule_for_later': '1',
    'scheduled_date':     '2026-12-10',
  });
  const res  = await fetch(`${base}/api/create-order`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    form.toString(),
  });
  assert.equal(res.status, 200, await res.clone().text());
  const row = db.prepare(
    "SELECT * FROM orders WHERE customer_email = 'pricing@example.com' ORDER BY id DESC LIMIT 1"
  ).get();
  // $11 rest-of-world + $1 colour + $3 large envelope + $0 scheduling
  assert.equal(row.price_cents, 1500);
  assert.equal(row.large_envelope, 1);
  assert.equal(row.schedule_for_later, 1);
});

test('pricing: United States has its own tier ($11) and Canada stays $5', async () => {
  const mk = (email, country) => new URLSearchParams({
    'r-email': email, 'r-name': 'Tier Test', 'r-street': '1 Main St', 'r-city': 'Town',
    'r-postal': '12345', 'r-country': country, 'letter-body': 'Hi there.', 'letter-type': 'standard',
  }).toString();
  for (const [email, country, cents] of [['tier-us@example.com','US',1100],['tier-ca@example.com','CA',500],['tier-de@example.com','DE',1100]]) {
    const res = await fetch(`${base}/api/create-order`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: mk(email, country),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const row = db.prepare('SELECT price_cents FROM orders WHERE customer_email = ? ORDER BY id DESC LIMIT 1').get(email);
    assert.equal(row.price_cents, cents, `${country} should cost ${cents}`);
  }
  const cfg = await (await fetch(`${base}/api/site-config`)).json();
  assert.equal(cfg.price_usa_cents, 1100);
});

test('discount codes apply to base plus add-ons, matching what checkout displays', async () => {
  db.prepare("INSERT OR REPLACE INTO discount_codes (code, discount_pct, active) VALUES ('TEST20', 20, 1)").run();
  db.prepare("INSERT OR REPLACE INTO discount_codes (code, discount_cents, active) VALUES ('TEST100', 100, 1)").run();
  const order = async (email, code, extra = {}) => {
    const form = new URLSearchParams({
      'r-email': email, 'r-name': 'Disc Test', 'r-street': '1 Main St', 'r-city': 'Toronto', 'r-province': 'ON',
      'r-postal': 'M5V 1A1', 'r-country': 'CA', 'letter-body': 'Hello there.', 'letter-type': 'standard',
      discount_code: code, ...extra,
    });
    const res = await fetch(`${base}/api/create-order`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    assert.equal(res.status, 200, await res.clone().text());
    return db.prepare('SELECT price_cents, discount_cents FROM orders WHERE customer_email = ? ORDER BY id DESC LIMIT 1').get(email);
  };
  // $5 base + $1 colour = $6.00; 20% off = $4.80
  assert.equal((await order('d1@example.com', 'TEST20', { colour_printing: '1' })).price_cents, 480);
  // fixed $1.00 off $5 = $4.00
  assert.equal((await order('d2@example.com', 'TEST100')).price_cents, 400);
  // no code: unchanged
  assert.equal((await order('d3@example.com', '', { colour_printing: '1' })).price_cents, 600);
});

test('resume link rebuilds checkout for an unpaid order and rotates the session id', async () => {
  const form = new URLSearchParams({
    'r-email': 'resume@example.com', 'r-name': 'Res Ume', 'r-street': '1 Main St', 'r-city': 'Toronto',
    'r-province': 'ON', 'r-postal': 'M5V 1A1', 'r-country': 'CA', 'letter-body': 'Hello again.', 'letter-type': 'standard',
  });
  const created = await fetch(`${base}/api/create-order`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  assert.equal(created.status, 200);
  const before = db.prepare("SELECT id, status_token, stripe_session_id FROM orders WHERE customer_email = 'resume@example.com' ORDER BY id DESC LIMIT 1").get();
  assert.ok(before.status_token, 'order needs a status token');
  const res = await fetch(`${base}/resume/${before.status_token}`, { redirect: 'manual' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), 'https://checkout.stripe.com/c/pay/test');
  const after = db.prepare('SELECT stripe_session_id FROM orders WHERE id = ?').get(before.id);
  assert.notEqual(after.stripe_session_id, before.stripe_session_id, 'session id must rotate');
  // unknown token goes back to the form, a paid order goes to its status page
  const bad = await fetch(`${base}/resume/not-a-real-token`, { redirect: 'manual' });
  assert.equal(bad.headers.get('location'), '/send');
  db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(before.id);
  const paid = await fetch(`${base}/resume/${before.status_token}`, { redirect: 'manual' });
  assert.equal(paid.headers.get('location'), `/status/${before.status_token}`);
});

test('funnel endpoint records only known steps, anonymously', async () => {
  const post = (b) => fetch(`${base}/api/funnel`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(b) });
  assert.equal((await post({ step: 'send_view', country: 'FR' })).status, 204);
  assert.equal((await post({ step: 'DROP TABLE orders' })).status, 204);
  const rows = db.prepare('SELECT step, country FROM funnel_events').all();
  assert.ok(rows.some(r => r.step === 'send_view' && r.country === 'FR'));
  assert.ok(!rows.some(r => r.step === 'DROP TABLE orders'));
});

test('extra pages: $0.40 each in B&W, $0.55 each in colour, counted from an uploaded PDF', async () => {
  const { PDFDocument } = require('pdf-lib');
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 4; i++) pdf.addPage();
  const bytes = await pdf.save();
  const send = async (email, extra) => {
    const fd = new FormData();
    Object.entries({ 'r-email': email, 'r-name': 'Page Test', 'r-street': '1 Main St', 'r-city': 'Toronto', 'r-province': 'ON',
      'r-postal': 'M5V 1A1', 'r-country': 'CA', 'letter-body': 'See attached.', 'letter-type': 'standard', ...extra }).forEach(([k, v]) => fd.append(k, v));
    fd.append('attachments', new Blob([bytes], { type: 'application/pdf' }), 'four-pages.pdf');
    const res = await fetch(`${base}/api/create-order`, { method: 'POST', body: fd });
    assert.equal(res.status, 200, await res.clone().text());
    return db.prepare('SELECT price_cents, page_count, extra_page_cents FROM orders WHERE customer_email = ? ORDER BY id DESC LIMIT 1').get(email);
  };
  const bw = await send('pages-bw@example.com', {});
  assert.equal(bw.page_count, 4);
  assert.equal(bw.extra_page_cents, 80);          // 2 extra pages x $0.40
  assert.equal(bw.price_cents, 580);              // $5 + $0.80
  const col = await send('pages-col@example.com', { colour_printing: '1' });
  assert.equal(col.extra_page_cents, 110);        // 2 extra pages x $0.55
  assert.equal(col.price_cents, 710);             // $5 + $1 colour + $1.10
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

test('consolidated country pages 301 to their regional hub', async () => {
  const map = {
    '/from-poland': '/letters-from-europe-to-canada#poland',
    '/from-turkey': '/letters-from-middle-east-and-north-africa-to-canada#turkey',
    '/from-uganda': '/letters-from-sub-saharan-africa-to-canada#uganda',
    '/from-chile': '/letters-from-latin-america-to-canada#chile',
  };
  for (const [from, to] of Object.entries(map)) {
    const res = await fetch(`${base}${from}`, { redirect: 'manual' });
    assert.equal(res.status, 301, from);
    assert.equal(res.headers.get('location'), to, from);
  }
});

test('regional hub pages are served and canonical', async () => {
  for (const slug of ['letters-from-europe-to-canada', 'letters-from-middle-east-and-north-africa-to-canada',
                      'letters-from-sub-saharan-africa-to-canada', 'letters-from-latin-america-to-canada']) {
    const res = await fetch(`${base}/${slug}`);
    assert.equal(res.status, 200, slug);
    const html = await res.text();
    assert.ok(html.includes(`<link rel="canonical" href="https://letterhome.ca/${slug}">`), slug);
  }
});

test('admin notifications, plus per-order email history', async () => {
  const anon = await fetch(`${base}/api/admin/notifications`);
  assert.equal(anon.status, 401);

  const { cookie } = await loginAdmin();
  const sessionId = seedOrder({ status: 'paid', priceCents: 500, recipientName: 'Notif Person' });
  db.prepare("UPDATE orders SET paid_at = strftime('%Y-%m-%d %H:%M:%S','now') WHERE stripe_session_id = ?").run(sessionId);
  db.prepare('INSERT INTO contact_submissions (name, email, message) VALUES (?,?,?)').run('Contact Tester', 'c@example.com', 'Where is my letter?');

  const res = await fetch(`${base}/api/admin/notifications?since=2000-01-01%2000:00:00`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.orders.some(o => o.recipient_name === 'Notif Person' && o.price_cents === 500));
  assert.ok(body.contacts.some(c => c.name === 'Contact Tester'));
  assert.ok(body.unreadContacts >= 1);

  // Nothing is "new" relative to a timestamp in the future.
  const later = await fetch(`${base}/api/admin/notifications?since=2999-01-01%2000:00:00`, { headers: { Cookie: cookie } });
  const l = await later.json();
  assert.equal(l.orders.length, 0);
  assert.equal(l.contacts.length, 0);

  // Operator messages are logged with their body and listed on the order (same login: the login limiter is tight).
  const sid2 = seedOrder({ status: 'paid', email: 'cust@example.com' });
  const id = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sid2).id;
  db.prepare("INSERT INTO email_log (to_email, subject, type, order_id, body) VALUES (?,?,?,?,?)")
    .run('cust@example.com', 'Re: order', 'operator_message', id, 'We need a different address.');
  const emailsRes = await fetch(`${base}/api/admin/orders/${id}/emails`, { headers: { Cookie: cookie } });
  assert.equal(emailsRes.status, 200);
  const rows = await emailsRes.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body, 'We need a different address.');
});

test('the retired mailing address never appears in served pages, scripts or server code', () => {
  const root = path.join(__dirname, '..');
  const dirs = ['public', 'admin'];
  const files = ['server.js', 'db.js', ...dirs.flatMap(d => fs.readdirSync(path.join(root, d)).filter(f => /\.(html|js|txt|json|xml|md)$/.test(f)).map(f => path.join(d, f)))];
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/90 King St/i.test(text) && !/L8G\s?1K7/i.test(text), `${f} still contains the old mailing address`);
  }
});

test('thank-you coupon: one single-use 15% code per customer, 7 days after payment, skips unsubscribed and old orders', async () => {
  process.env.SMTP_HOST = 'smtp.test';
  try {
    const mk = (email, paidAgo, status = 'paid') => {
      const sid = seedOrder({ email, status });
      db.prepare("UPDATE orders SET paid_at = datetime('now', ?) WHERE stripe_session_id = ?").run(paidAgo, sid);
      return db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sid).id;
    };
    const fresh   = mk('fresh@example.com',   '-2 days');
    const due     = mk('due@example.com',     '-8 days');
    const dup     = mk('due@example.com',     '-9 days');
    const old     = mk('old@example.com',     '-90 days');
    const unsub   = mk('unsub@example.com',   '-8 days');
    const refund  = mk('refund@example.com',  '-8 days', 'refunded');
    db.prepare("INSERT OR REPLACE INTO customers (email, unsubscribed_at) VALUES ('unsub@example.com', CURRENT_TIMESTAMP)").run();

    sentMail.length = 0;
    const r1 = await thankYouCouponJob();
    assert.equal(r1.sent, 1);
    assert.equal(sentMail.length, 1);
    assert.equal(sentMail[0].to, 'due@example.com');
    assert.match(sentMail[0].text, /THANKS-[A-Z2-9]{6}/);
    assert.match(sentMail[0].text, /Vancouver/);
    assert.ok(sentMail[0].headers['List-Unsubscribe']);

    const code = sentMail[0].text.match(/THANKS-[A-Z2-9]{6}/)[0];
    const dc = db.prepare('SELECT * FROM discount_codes WHERE code = ?').get(code);
    assert.equal(dc.discount_pct, 15);
    assert.equal(dc.max_uses, 1);
    assert.ok(dc.expires_at);

    const res = await fetch(base + '/api/validate-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, country: 'CA' }) });
    const body = await res.json();
    assert.equal(body.valid, true);
    assert.equal(body.discount_pct, 15);

    const r2 = await thankYouCouponJob();          // nothing left to send
    assert.equal(r2.sent, 0);
    for (const id of [fresh, dup, old, unsub, refund]) {
      assert.equal(db.prepare('SELECT thankyou_sent_at FROM orders WHERE id = ?').get(id).thankyou_sent_at, null);
    }
  } finally {
    delete process.env.SMTP_HOST;
  }
});
