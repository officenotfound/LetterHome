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
        create: async (o) => ({
          ...((globalThis.__lastSession = o), {}),
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

const { app, db, thankYouCouponJob, cartOfferJob, sendAtPrinterEmail, sendMailedNotification, fxRefreshJob, niceGbp } = require('../server');

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
  assert.equal(row.price_cents, 600);
});

test('pricing: rest-of-world base plus colour and free scheduling; retired large envelope is ignored', async () => {
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
  // $15 rest-of-world + $1 colour + $0 scheduling; a posted large_envelope flag no longer charges
  assert.equal(row.price_cents, 1600);
  assert.equal(row.large_envelope, 0);
  assert.equal(row.schedule_for_later, 1);
});

test('pricing: Canada and United States $6, UK/AU sold as international until their network is enabled, everywhere else $20', async () => {
  const mk = (email, country) => new URLSearchParams({
    'r-email': email, 'r-name': 'Tier Test', 'r-street': '1 Main St', 'r-city': 'Town',
    'r-postal': '12345', 'r-country': country, 'letter-body': 'Hi there.', 'letter-type': 'standard',
  }).toString();
  for (const [email, country, cents] of [['tier-us@example.com','US',600],['tier-ca@example.com','CA',600],['tier-de@example.com','DE',1500],['tier-gb@example.com','GB',1500]]) {
    const res = await fetch(`${base}/api/create-order`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: mk(email, country),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const row = db.prepare('SELECT price_cents FROM orders WHERE customer_email = ? ORDER BY id DESC LIMIT 1').get(email);
    assert.equal(row.price_cents, cents, `${country} should cost ${cents}`);
  }
  const cfg = await (await fetch(`${base}/api/site-config`)).json();
  assert.equal(cfg.price_usa_cents, 600);
  assert.equal(cfg.destinations.GB.price_cents, 1500);
  assert.equal(cfg.destinations.GB.local, false);
  assert.deepEqual(cfg.destinations.CA.services, {});
  assert.equal(cfg.price_domestic_cents, 600);
  assert.equal(cfg.price_international_cents, 1500);
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
  // $6 base + $1 colour = $7.00; 20% off = $5.60
  assert.equal((await order('d1@example.com', 'TEST20', { colour_printing: '1' })).price_cents, 560);
  // fixed $1.00 off $6 = $5.00
  assert.equal((await order('d2@example.com', 'TEST100')).price_cents, 500);
  // no code: unchanged
  assert.equal((await order('d3@example.com', '', { colour_printing: '1' })).price_cents, 700);
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

test('extra pages: $0.45 each in B&W, $0.55 each in colour, counted from an uploaded PDF', async () => {
  const { PDFDocument } = require('pdf-lib');
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 3; i++) pdf.addPage();   // 3 PDF pages + the typed note = 4 printed pages
  const bytes = await pdf.save();
  const send = async (email, extra) => {
    const fd = new FormData();
    Object.entries({ 'r-email': email, 'r-name': 'Page Test', 'r-street': '1 Main St', 'r-city': 'Toronto', 'r-province': 'ON',
      'r-postal': 'M5V 1A1', 'r-country': 'CA', 'letter-body': 'See attached.', 'letter-type': 'standard', ...extra }).forEach(([k, v]) => fd.append(k, v));
    fd.append('attachments', new Blob([bytes], { type: 'application/pdf' }), 'three-pages.pdf');
    const res = await fetch(`${base}/api/create-order`, { method: 'POST', body: fd });
    assert.equal(res.status, 200, await res.clone().text());
    return db.prepare('SELECT price_cents, page_count, extra_page_cents FROM orders WHERE customer_email = ? ORDER BY id DESC LIMIT 1').get(email);
  };
  const bw = await send('pages-bw@example.com', {});
  assert.equal(bw.page_count, 4);
  assert.equal(bw.extra_page_cents, 110);         // 2 extra pages x $0.55
  assert.equal(bw.price_cents, 710);              // $6 + $1.10
  const col = await send('pages-col@example.com', { colour_printing: '1' });
  assert.equal(col.extra_page_cents, 150);        // 2 extra pages x $0.75
  assert.equal(col.price_cents, 850);             // $6 + $1 colour + $1.50
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

test('status page: mailed is the final step, and only tracked orders show Delivered', async () => {
  const page = async (status, extra) => {
    const sid = seedOrder({ email: 'steps@example.com', status });
    if (extra) db.prepare(`UPDATE orders SET ${extra} = 1 WHERE stripe_session_id = ?`).run(sid);
    const { status_token } = db.prepare('SELECT status_token FROM orders WHERE stripe_session_id = ?').get(sid);
    return (await fetch(`${base}/status/${status_token}`)).text();
  };
  const ticks = html => (html.match(/✓/g) || []).length;

  const mailed = await page('mailed');
  assert.match(mailed, />Mailed</);
  assert.equal(ticks(mailed), 3);
  assert.ok(!mailed.includes('◉'));
  assert.ok(!mailed.includes('>Delivered<'));

  const printing = await page('printing');
  assert.match(printing, />On Its Way</);
  assert.ok(!printing.includes('>Mailed<'));

  const tracked = await page('mailed', 'registered_mail');
  assert.equal(ticks(tracked), 3);
  assert.match(tracked, />Delivered</);
  assert.ok(tracked.includes('◉'));

  assert.match(tracked, /tracking number will appear/);

  const sid = seedOrder({ email: 'steps@example.com', status: 'mailed' });
  db.prepare("UPDATE orders SET registered_mail = 1, postgrid_tracking_number = 'RN123456789CA' WHERE stripe_session_id = ?").run(sid);
  const { status_token } = db.prepare('SELECT status_token FROM orders WHERE stripe_session_id = ?').get(sid);
  assert.match(await (await fetch(`${base}/status/${status_token}`)).text(), /Tracking number: RN123456789CA/);

  assert.equal(ticks(await page('delivered', 'registered_mail')), 4);
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

let _adminSession = null;   // the login route allows 5 attempts per 15 minutes, so every test shares one session
async function loginAdmin() {
  if (_adminSession) return _adminSession;
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
  return (_adminSession = { cookie: sid, csrfToken: me.csrfToken });
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

test('admin can fix an order\'s addresses; edits are audited, clean the old error, and are refused once mailed', async () => {
  const { cookie, csrfToken } = await loginAdmin();
  const id = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(seedOrder({ status: 'paid' })).id;
  db.prepare("UPDATE orders SET sender_street = '1 Calle', sender_country = 'Colombia', postgrid_error = 'MANUAL: Return address failed' WHERE id = ?").run(id);
  const call = (oid, body) => fetch(`${base}/api/admin/orders/${oid}/addresses`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body) });
  let res = await call(id, { skip_return: 1, recipient_city: 'Ottawa', recipient_name: '   ' });
  assert.equal(res.status, 400, 'empty recipient name is refused');
  res = await call(id, { skip_return: 1, recipient_city: 'Ottawa' });
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT skip_return, recipient_city, postgrid_error FROM orders WHERE id = ?').get(id);
  assert.equal(row.skip_return, 1); assert.equal(row.recipient_city, 'Ottawa'); assert.equal(row.postgrid_error, null);
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'order.edit_addresses' AND target_id = ?").get(String(id)));
  db.prepare("UPDATE orders SET status = 'mailed' WHERE id = ?").run(id);
  assert.equal((await call(id, { recipient_city: 'Elsewhere' })).status, 409);
  const noAuth = await fetch(`${base}/api/admin/orders/${id}/addresses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noAuth.status, 401);
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

test('thank-you coupon: one single-use 15% code per customer, 14 days after mailing, skips unmailed, unsubscribed and old orders', async () => {
  process.env.SMTP_HOST = 'smtp.test';
  try {
    const mk = (email, mailedAgo, status = 'mailed') => {
      const sid = seedOrder({ email, status });
      db.prepare("UPDATE orders SET paid_at = datetime('now', '-30 days'), mailed_at = datetime('now', ?) WHERE stripe_session_id = ?").run(mailedAgo, sid);
      return db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sid).id;
    };
    const fresh   = mk('fresh@example.com',   '-10 days');
    const due     = mk('due@example.com',     '-15 days');
    const dup     = mk('due@example.com',     '-16 days');
    const old     = mk('old@example.com',     '-90 days');
    const unsub   = mk('unsub@example.com',   '-15 days');
    const refund  = mk('refund@example.com',  '-15 days', 'refunded');
    const unmailed = mk('unmailed@example.com', '-15 days', 'paid');
    db.prepare('UPDATE orders SET mailed_at = NULL WHERE id = ?').run(unmailed);
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
    assert.equal(dc.discount_cents, 50);
    assert.equal(dc.max_uses, 1);
    assert.ok(dc.expires_at);

    const res = await fetch(base + '/api/validate-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, country: 'CA' }) });
    const body = await res.json();
    assert.equal(body.valid, true);
    assert.equal(body.discount_cents, 50);

    const r2 = await thankYouCouponJob();          // nothing left to send
    assert.equal(r2.sent, 0);
    for (const id of [fresh, dup, old, unsub, refund, unmailed]) {
      assert.equal(db.prepare('SELECT thankyou_sent_at FROM orders WHERE id = ?').get(id).thankyou_sent_at, null);
    }
  } finally {
    delete process.env.SMTP_HOST;
  }
});

test('abandoned cart offer: one email after 24 hours with a code that applies on resume, skipping paid, unsubscribed, fresh and repeat customers', async () => {
  process.env.SMTP_HOST = 'smtp.test';
  try {
    const mk = (email, status, age) => {
      const sid = seedOrder({ email, status, priceCents: 1000 });
      const { id } = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sid);
      db.prepare("UPDATE orders SET created_at = datetime('now', ?), sender_name = 'Sam Lee', recipient_city = 'Leeds' WHERE id = ?").run(age, id);
      return id;
    };
    const due    = mk('cart-due@example.com', 'awaiting_payment', '-26 hours');
    const fresh  = mk('cart-fresh@example.com', 'awaiting_payment', '-3 hours');
    const stale  = mk('cart-stale@example.com', 'awaiting_payment', '-5 days');
    const unsub  = mk('cart-unsub@example.com', 'awaiting_payment', '-26 hours');
    db.prepare("INSERT OR REPLACE INTO customers (email, unsubscribed_at) VALUES ('cart-unsub@example.com', CURRENT_TIMESTAMP)").run();
    const paidLater = mk('cart-paid@example.com', 'awaiting_payment', '-30 hours');
    const paid = mk('cart-paid@example.com', 'paid', '-26 hours');
    db.prepare("UPDATE orders SET paid_at = CURRENT_TIMESTAMP WHERE id = ?").run(paid);

    sentMail.length = 0;
    const r1 = await cartOfferJob();
    assert.equal(r1.sent, 1);
    assert.equal(sentMail.length, 1);
    assert.equal(sentMail[0].to, 'cart-due@example.com');
    assert.match(sentMail[0].subject, /15% off/);
    assert.match(sentMail[0].text, /COMEBACK-[A-Z2-9]{6}/);
    assert.ok(sentMail[0].headers['List-Unsubscribe']);
    assert.ok(!sentMail[0].text.includes('\u2014') && !sentMail[0].html.includes('\u2014'));
    assert.ok(!/postgrid/i.test(sentMail[0].html));
    const code = sentMail[0].text.match(/COMEBACK-[A-Z2-9]{6}/)[0];
    const dc = db.prepare('SELECT * FROM discount_codes WHERE code = ?').get(code);
    assert.equal(dc.discount_pct, 15); assert.equal(dc.max_uses, 1);
    for (const id of [fresh, stale, unsub, paidLater, paid]) assert.equal(db.prepare('SELECT cart_offer_sent_at FROM orders WHERE id = ?').get(id).cart_offer_sent_at, null);

    assert.equal((await cartOfferJob()).sent, 0);               // once only

    // clicking through applies the code to the unpaid order (price 1000 -> 850)
    const token = db.prepare('SELECT status_token FROM orders WHERE id = ?').get(due).status_token;
    await fetch(`${base}/resume/${token}?code=${code}`, { redirect: 'manual' }).catch(() => {});
    const o = db.prepare('SELECT price_cents, discount_code, discount_cents FROM orders WHERE id = ?').get(due);
    assert.equal(o.discount_code, code); assert.equal(o.price_cents, 850); assert.equal(o.discount_cents, 150);
    // a different code is not accepted for the order
    const other = mk('cart-other@example.com', 'awaiting_payment', '-1 hours');
    const t2 = db.prepare('SELECT status_token FROM orders WHERE id = ?').get(other).status_token;
    await fetch(`${base}/resume/${t2}?code=${code}`, { redirect: 'manual' }).catch(() => {});
    assert.equal(db.prepare('SELECT price_cents FROM orders WHERE id = ?').get(other).price_cents, 1000);

    // the switch turns it off
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cart_offer_enabled', 'false')").run();
    mk('cart-off@example.com', 'awaiting_payment', '-26 hours');
    assert.equal((await cartOfferJob()).sent, 0);
    db.prepare("DELETE FROM settings WHERE key = 'cart_offer_enabled'").run();
  } finally { delete process.env.SMTP_HOST; }
});

test('admin email log: needs a login, lists sent and failed emails, filters by type, status and search', async () => {
  assert.equal((await fetch(`${base}/api/admin/email-log`)).status, 401);
  db.prepare("INSERT INTO email_log (to_email, subject, type, order_id) VALUES ('log-a@example.com', 'Hello A', 'cart_offer', 7)").run();
  db.prepare("INSERT INTO email_log (to_email, subject, type, status, error) VALUES ('log-b@example.com', 'Hello B', 'recovery', 'failed', 'mailbox full')").run();
  const { cookie } = await loginAdmin();
  const get = async q => (await fetch(`${base}/api/admin/email-log${q}`, { headers: { Cookie: cookie } })).json();
  const all = await get('');
  assert.ok(all.total >= 2 && all.rows.length >= 2);
  assert.ok(all.types.some(t => t.type === 'cart_offer'));
  assert.ok(all.stats.failed_week >= 1);
  const failed = await get('?status=failed&search=log-b');
  assert.equal(failed.total, 1);
  assert.equal(failed.rows[0].error, 'mailbox full');
  assert.equal((await get('?type=cart_offer&search=log-a')).total, 1);
  assert.equal((await get('?search=H_llo%20A')).total, 0);   // wildcard characters are matched literally
});

test('mailed_at is stamped once, the first time an order reaches mailed', () => {
  const sid = seedOrder({ email: 'stamp@example.com', status: 'paid' });
  const { id } = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sid);
  const mailedAt = () => db.prepare('SELECT mailed_at FROM orders WHERE id = ?').get(id).mailed_at;
  assert.equal(mailedAt(), null);
  db.prepare("UPDATE orders SET status = 'mailed' WHERE id = ?").run(id);
  assert.ok(mailedAt());
  db.prepare("UPDATE orders SET mailed_at = '2026-01-01 00:00:00' WHERE id = ?").run(id);
  db.prepare("UPDATE orders SET status = 'delivered' WHERE id = ?").run(id);
  assert.equal(mailedAt(), '2026-01-01 00:00:00');
});

test('a mail service that is not switched on is rejected, and the send page has no hard-coded registered checkbox', async () => {
  const res = await fetch(`${base}/api/create-order`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ 'r-email': 'reg@example.com', 'r-name': 'Reg Test', 'r-street': '1 Main St', 'r-city': 'Town',
      'r-postal': 'M5V 1A1', 'r-country': 'CA', 'letter-body': 'Hi.', 'letter-type': 'standard', registered_mail: '1' }).toString(),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /registered/i);
  const html = await (await fetch(`${base}/send`)).text();
  assert.ok(!/id="opt-registered"/.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'registered checkbox should not render');
});

test('bulk mailing page is served and lists the volume tiers', async () => {
  const res = await fetch(`${base}/bulk-mailing`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('rel="canonical" href="https://letterhome.ca/bulk-mailing"'));
  for (const price of ['$5.50']) assert.ok(html.includes(price), price);
  assert.ok(!html.includes('$6.50'), 'US tiers match Canada');
});

test('page count comes from the real letter builder: typed text is counted and a too-long letter is refused', async () => {
  const post = (body) => fetch(`${base}/api/create-order`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ 'r-email': 'pg@example.com', 'r-name': 'Pg Test', 'r-street': '1 Main St', 'r-city': 'Town',
      'r-postal': 'M5V 1A1', 'r-country': 'CA', 'letter-type': 'standard', 'letter-body': body }).toString(),
  });
  const ok = await post('Hello there.');
  assert.equal(ok.status, 200);
  const longBody = Array.from({ length: 400 }, (_, i) => `Line ${i} of a very long letter that keeps going.`).join('\n');
  const bad = await post(longBody);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /most we can mail in one envelope is 5/);
  const fd = new FormData(); fd.append('letter-body', longBody);
  const chk = await (await fetch(`${base}/api/letter-pages`, { method: 'POST', body: fd })).json();
  assert.equal(chk.ok, true); assert.equal(chk.too_long, true); assert.ok(chk.pages > 5);
  const fd2 = new FormData(); fd2.append('letter-body', 'Short note.');
  const chk2 = await (await fetch(`${base}/api/letter-pages`, { method: 'POST', body: fd2 })).json();
  assert.equal(chk2.pages, 1); assert.equal(chk2.too_long, false);
});

test('letter preview returns the print PDF with the address block, as one Letter page for a short note', async () => {
  const { PDFDocument } = require('pdf-lib');
  const fd = new FormData();
  Object.entries({ 'letter-body': 'Hello.', 'r-name': 'Ada Lovelace', 'r-street': '1 Main St', 'r-city': 'Toronto', 'r-province': 'ON', 'r-postal': 'M5V 1A1', 'r-country': 'CA' })
    .forEach(([k, v]) => fd.append(k, v));
  const res = await fetch(`${base}/api/letter-preview`, { method: 'POST', body: fd });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  const doc = await PDFDocument.load(Buffer.from(await res.arrayBuffer()));
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()], [612, 792]);
});

test('destinations and services follow the admin switches: local UK price, Canada registered add-on, US certified', async () => {
  const set = (k, v) => db.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, v);
  const clear = () => db.prepare("DELETE FROM settings WHERE key IN ('postgrid_countries','services_enabled')").run();
  try {
    set('postgrid_countries', 'CA,US,GB');
    set('services_enabled', JSON.stringify(['CA:registered', 'US:certified']));
    const cfg = await (await fetch(`${base}/api/site-config`)).json();
    assert.equal(cfg.destinations.GB.price_cents, 900);
    assert.equal(cfg.destinations.GB.local, true);
    assert.equal(cfg.destinations.AU.price_cents, 1500);           // network not enabled: international price
    assert.equal(cfg.destinations.CA.services.registered.cents, 6200);
    assert.equal(cfg.destinations.US.services.certified.cents, 1700);
    assert.equal(cfg.destinations.US.services.express, undefined);
    const order = async (email, country, extra) => {
      const res = await fetch(`${base}/api/create-order`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'r-email': email, 'r-name': 'Svc Test', 'r-street': '1 Main St', 'r-city': 'Town', 'r-postal': '12345',
          'r-country': country, 'letter-body': 'Hello.', 'letter-type': 'standard', ...extra }).toString() });
      return { res, row: db.prepare('SELECT * FROM orders WHERE customer_email = ? ORDER BY id DESC LIMIT 1').get(email) };
    };
    let r = await order('svc-gb@example.com', 'GB', {});
    assert.equal(r.res.status, 200); assert.equal(r.row.price_cents, 900);
    r = await order('svc-ca@example.com', 'CA', { mail_service: 'registered' });
    assert.equal(r.res.status, 200); assert.equal(r.row.price_cents, 600 + 6200); assert.equal(r.row.registered_mail, 1);
    r = await order('svc-us@example.com', 'US', { mail_service: 'certified' });
    assert.equal(r.res.status, 200); assert.equal(r.row.price_cents, 600 + 1700); assert.equal(r.row.certified_mail, 1);
    r = await order('svc-us2@example.com', 'US', { mail_service: 'express' });
    assert.equal(r.res.status, 400);                               // not switched on
    r = await order('svc-gb2@example.com', 'GB', { mail_service: 'certified' });
    assert.equal(r.res.status, 400);                               // not offered for the UK
  } finally { clear(); }
});

test('checkout stores the province code, not the dropdown label', async () => {
  const res = await fetch(`${base}/api/create-order`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ 'r-email': 'prov@example.com', 'r-name': 'Prov Test', 'r-street': '1 Rue', 'r-city': 'Jonquière',
      'r-province': 'QC: Quebec', 'r-postal': 'G7X 9W7', 'r-country': 'CA', 'letter-body': 'Bonjour.', 'letter-type': 'standard' }).toString() });
  assert.equal(res.status, 200);
  assert.equal(db.prepare("SELECT recipient_province FROM orders WHERE customer_email = 'prov@example.com'").get().recipient_province, 'QC');
});

test('Santa letter template: uses only what is given, cleans input, empty without a name', () => {
  const SantaLetter = require('../public/santa-letter.js');
  assert.equal(SantaLetter.build({}), '');
  assert.equal(SantaLetter.build({ child: '   ' }), '');
  const bare = SantaLetter.build({ child: 'Emma' });
  assert.match(bare, /^From Santa's Workshop\n/);
  assert.match(bare, /Dear Emma,/);
  assert.doesNotMatch(bare, /I heard that|Word around|Please give|small thing to ask/);
  const full = SantaLetter.build({ child: ' Emma. ', nice: 'you learned to ride your bike!', interest: 'dinosaurs', pet: 'Biscuit', goal: 'keep reading' });
  assert.match(full, /I heard that you learned to ride your bike\. That is/);
  assert.match(full, /you love dinosaurs\./);
  assert.match(full, /Please give Biscuit a pat from me\./);
  assert.match(full, /one small thing to ask of you: keep reading\./);
  assert.doesNotMatch(full, /\.\./);
  assert.ok(!full.includes('—'), 'no em dashes');
  assert.equal(SantaLetter.fields({ child: 'x'.repeat(100) }).child.length, 40);
  assert.equal(SantaLetter.clean('a\n\tb\u0000c'), 'a b c');
});

test('Santa order: own price, server-written letter, Canada only, colour add-on, kill switch', async () => {
  const send = async (extra = {}) => {
    const res = await fetch(`${base}/api/create-order`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ product: 'santa', santa_child: 'Emma', santa_pet: 'Biscuit', 'r-email': 'parent@example.com', 'r-name': 'Emma Tremblay',
        'r-street': '1 Rue Test', 'r-city': 'Montreal', 'r-province': 'QC', 'r-postal': 'H2X 1Y4', 'r-country': 'CA',
        'letter-body': 'IGNORED CLIENT TEXT', ...extra }).toString() });
    return { res, body: await res.json() };
  };
  const last = () => db.prepare("SELECT * FROM orders WHERE customer_email = 'parent@example.com' ORDER BY id DESC LIMIT 1").get();

  const ok = await send();
  assert.equal(ok.res.status, 200);
  let o = last();
  assert.equal(o.letter_type, 'santa');
  assert.equal(o.price_cents, 1200);
  assert.equal(o.skip_return, 1);
  assert.match(o.letter_body, /Dear Emma,/);
  assert.match(o.letter_body, /Please give Biscuit a pat/);
  assert.doesNotMatch(o.letter_body, /IGNORED CLIENT TEXT/);

  await send({ colour_printing: '1' });
  assert.equal(last().price_cents, 1300);

  const us = await send({ 'r-country': 'US' });
  assert.equal(us.res.status, 400);
  assert.match(us.body.error, /Canada/);

  const noName = await send({ santa_child: '' });
  assert.equal(noName.res.status, 400);

  const cfg = await (await fetch(`${base}/api/site-config`)).json();
  assert.equal(cfg.price_santa_cents, 1200);
  assert.equal(cfg.santa_enabled, true);

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('price_santa_cents', '1500')").run();
  await send();
  assert.equal(last().price_cents, 1500);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('santa_enabled', '0')").run();
  const off = await send();
  assert.equal(off.res.status, 400);
  assert.equal((await (await fetch(`${base}/api/site-config`)).json()).santa_enabled, false);
  db.prepare("DELETE FROM settings WHERE key IN ('price_santa_cents','santa_enabled')").run();

  // a normal order is unaffected
  const plain = await fetch(`${base}/api/create-order`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ 'r-email': 'plain-santa-check@example.com', 'r-name': 'A B', 'r-street': '1 St', 'r-city': 'Toronto', 'r-province': 'ON', 'r-postal': 'M5V 1A1', 'r-country': 'CA', 'letter-body': 'Hello there.' }).toString() });
  assert.equal(plain.status, 200);
  const po = db.prepare("SELECT letter_type, price_cents FROM orders WHERE customer_email = 'plain-santa-check@example.com'").get();
  assert.equal(po.letter_type, 'standard');
  assert.equal(po.price_cents, 600);
});

test('pound estimate: rounds UP to the next 50p, never oddly precise', () => {
  const rate = 0.53156;                                     // GBP per CAD
  assert.equal(niceGbp(600, rate), 3.5);                    // 3.19
  assert.equal(niceGbp(900, rate), 5);                      // 4.78
  assert.equal(niceGbp(1500, rate), 8);                     // 7.97
  assert.equal(niceGbp(1000, 0.5365), 5.5);                 // 5.365 -> 5.50
  assert.equal(niceGbp(1000, 0.5601), 6);                   // 5.601 -> 6
  assert.equal(niceGbp(1000, 0.55), 5.5);                   // exactly 5.50 stays
  assert.equal(niceGbp(1, rate), 0.5);                      // never below 50p
  for (const cents of [100, 450, 600, 900, 1200, 1500, 2000]) assert.equal((niceGbp(cents, rate) * 2) % 1, 0, `${cents} is a multiple of 50p`);
});

test('weekly exchange rate job: updates, skips when fresh, falls back, and ignores bad rates', async () => {
  const clear = () => db.prepare("DELETE FROM settings WHERE key IN ('fx_gbp_per_cad','fx_updated_at','fx_source')").run();
  const get = k => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value;
  const reply = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 503, json: async () => body });
  try {
    clear();
    const calls = [];
    let r = await fxRefreshJob({ fetchImpl: async url => { calls.push(url); return reply({ rates: { GBP: 0.5316 } })(); } });
    assert.deepEqual([r.updated, r.rate, r.source], [true, 0.5316, 'frankfurter']);
    assert.equal(get('fx_gbp_per_cad'), '0.5316');
    assert.ok(get('fx_updated_at'));

    r = await fxRefreshJob({ fetchImpl: async () => { throw new Error('should not be called'); } });
    assert.equal(r.skipped, true);                                   // updated less than a week ago

    let cfg = await (await fetch(`${base}/api/site-config`)).json();
    assert.equal(cfg.gbp_per_cad, 0.5316);
    assert.deepEqual(cfg.gbp_display, { domestic: 3.5, usa: 3.5, international: 8, gb: 8 });
    assert.ok(cfg.fx_updated_at);

    // forced refresh: first source down, backup answers
    let n = 0;
    r = await fxRefreshJob({ force: true, fetchImpl: async () => (++n === 1 ? reply({}, false)() : reply({ rates: { GBP: 0.5} })()) });
    assert.deepEqual([r.updated, r.source, get('fx_gbp_per_cad')], [true, 'er-api', '0.5']);

    // an implausible rate from both sources keeps the old rate
    r = await fxRefreshJob({ force: true, fetchImpl: reply({ rates: { GBP: 5.3 } }) });
    assert.equal(r.updated, false);
    assert.equal(get('fx_gbp_per_cad'), '0.5');

    // stale after a week
    db.prepare("UPDATE settings SET value = ? WHERE key = 'fx_updated_at'").run(new Date(Date.now() - 8 * 864e5).toISOString());
    r = await fxRefreshJob({ fetchImpl: reply({ rates: { GBP: 0.54 } }) });
    assert.equal(r.updated, true);
  } finally { clear(); }
});

test('site-config feeds the UK page: GB tile is hidden until the UK network is on, then priced', async () => {
  const cfg = async () => (await fetch(`${base}/api/site-config`)).json();
  let c = await cfg();
  assert.equal(c.destinations.GB.local, false);
  assert.equal(c.destinations.GB.price_cents, 1500);          // sold from Canada at the international price
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('postgrid_countries', 'CA,GB')").run();
  try {
    c = await cfg();
    assert.equal(c.destinations.GB.local, true);
    assert.equal(c.destinations.GB.price_cents, 900);
    assert.equal(c.price_domestic_cents, 600);
    assert.equal(c.price_international_cents, 1500);
  } finally { db.prepare("DELETE FROM settings WHERE key = 'postgrid_countries'").run(); }
});

test('new pages: served, have schema, titles and canonicals, and are in the sitemap', async () => {
  const slugs = ['santa-letter', 'uk', 'send-a-letter-to-the-uk', 'monthly-letters', 'landlord-notices', 'postcards', 'letter-from-santa-canada',
    'free-letter-from-santa-template', 'christmas-family-letter-template', 'what-to-write-in-a-letter-to-a-grandparent',
    'keep-in-touch-with-family-abroad-by-mail'];
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  for (const slug of slugs) {
    const res = await fetch(`${base}/${slug}`);
    assert.equal(res.status, 200, slug);
    const html = await res.text();
    assert.ok(html.includes(`<link rel="canonical" href="https://letterhome.ca/${slug}">`), `${slug} canonical`);
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    assert.ok(title.length > 20 && title.length <= 60, `${slug} title length ${title.length}`);
    const desc = html.match(/name="description" content="([^"]*)"/)[1];
    assert.ok(desc.length >= 100 && desc.length <= 160, `${slug} description length ${desc.length}`);
    for (const block of html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || []) JSON.parse(block.replace(/<\/?script[^>]*>/g, ''));
    assert.ok(sitemap.includes(`https://letterhome.ca/${slug}</loc>`), `${slug} in sitemap`);
    assert.ok(!html.includes('—'), `${slug} has an em dash`);
  }
});

test('country pages: own language, theme and canonical, no French toggle, listed in the sitemap, with hreflang on the US pair', async () => {
  const pages = [
    ['us', 'us', 'en-US'], ['us/es', 'us', 'es-US'], ['send-a-letter-online-in-the-usa', 'us', 'en-US'], ['us/es/send-a-letter-online-in-the-usa', 'us', 'es-US'],
    ['uk', 'uk', 'en-GB'], ['send-a-letter-to-the-uk', 'uk', 'en-GB'], ['address-a-letter-to-canada-from-the-uk', 'uk', 'en-GB'],
    ['au', 'au', 'en-AU'], ['aussies-in-canada-send-a-letter-home', 'au', 'en-AU'],
  ];
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  for (const [slug, cc, lang] of pages) {
    const res = await fetch(`${base}/${slug}`);
    assert.equal(res.status, 200, slug);
    const html = await res.text();
    assert.ok(html.includes(`<link rel="canonical" href="https://letterhome.ca/${slug}">`), `${slug} canonical`);
    assert.ok(html.includes(`<html data-en-only lang="${lang}" data-country="${cc}"`), `${slug} lang and country`);
    assert.ok(html.includes(`<body class="c-${cc}">`), `${slug} theme class`);
    assert.ok(html.includes('/country.js'), `${slug} loads the country logo script`);
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    assert.ok(title.length > 20 && title.length <= 60, `${slug} title length ${title.length}`);
    const desc = html.match(/name="description" content="([^"]*)"/)[1];
    assert.ok(desc.length >= 100 && desc.length <= 160, `${slug} description length ${desc.length}`);
    for (const block of html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || []) JSON.parse(block.replace(/<\/?script[^>]*>/g, ''));
    assert.ok(sitemap.includes(`https://letterhome.ca/${slug}</loc>`), `${slug} in sitemap`);
    assert.ok(!html.includes('\u2014'), `${slug} has an em dash`);
    if (cc === 'us') assert.ok(html.includes('hreflang="es-US"') || html.includes('data-alt='), `${slug} links its twin`);
  }
  // Spelling check: US pages say color, UK/AU say colour
  assert.match(await (await fetch(`${base}/us`)).text(), /Color printing/);
  for (const slug of ['uk', 'au']) assert.match(await (await fetch(`${base}/${slug}`)).text(), /Colour printing/);
  assert.equal((await fetch(`${base}/us/es/not-a-real-page`)).status, 404);
});

test('letters between countries: every route page is served with its own canonical and is in the sitemap', async () => {
  const cc = ['us', 'uk', 'au'], dest = { ca: 'canada', us: 'usa', uk: 'uk', au: 'australia' };
  const slugs = ['send-a-letter-from-canada-to-the-us', 'send-a-letter-from-canada-to-australia'];
  for (const o of cc) for (const d of Object.keys(dest)) if (o !== d) slugs.push(`${o}/how-to-send-mail-to-${dest[d]}-from-${o}`);
  const es = ['canada', 'reino-unido', 'australia'].map(d => `us/es/como-enviar-una-carta-a-${d}-desde-ee-uu`);
  slugs.push(...es);
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  for (const slug of slugs) {
    const res = await fetch(`${base}/${slug}`);
    assert.equal(res.status, 200, slug);
    const html = await res.text();
    assert.ok(html.includes(`<link rel="canonical" href="https://letterhome.ca/${slug}">`), `${slug} canonical`);
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    assert.ok(title.length > 20 && title.length <= 60, `${slug} title length ${title.length}`);
    const desc = html.match(/name="description" content="([^"]*)"/)[1];
    assert.ok(desc.length >= 100 && desc.length <= 160, `${slug} description length ${desc.length}`);
    for (const block of html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || []) JSON.parse(block.replace(/<\/?script[^>]*>/g, ''));
    assert.ok(sitemap.includes(`https://letterhome.ca/${slug}</loc>`), `${slug} in sitemap`);
    assert.ok(!html.includes('\u2014'), `${slug} has an em dash`);
  }
  // sender's spelling
  assert.match(await (await fetch(`${base}/us/how-to-send-mail-to-australia-from-us`)).text(), /Color printing/);
  assert.match(await (await fetch(`${base}/au/how-to-send-mail-to-usa-from-au`)).text(), /Colour printing/);
  // the Spanish guide has the toggle back to English, and old flat URLs redirect
  assert.match(await (await fetch(`${base}/us/es/como-enviar-una-carta-a-canada-desde-ee-uu`)).text(), /data-alt="\/us\/how-to-send-mail-to-canada-from-us"/);
  const old = await fetch(`${base}/send-a-letter-from-the-uk-to-canada`, { redirect: 'manual' });
  assert.equal(old.status, 301);
  assert.equal(old.headers.get('location'), '/uk/how-to-send-mail-to-canada-from-uk');
  const older = await fetch(`${base}/from-australia`, { redirect: 'manual' });
  assert.equal(older.status, 301);
  assert.equal(older.headers.get('location'), '/au/how-to-send-mail-to-canada-from-au');
});

test('site-config: estimates in dollars, pounds, Australian and New Zealand dollars, all rounded up to the next half unit', async () => {
  const c = await (await fetch(`${base}/api/site-config`)).json();
  for (const cur of ['GBP', 'USD', 'AUD', 'NZD']) {
    const f = c.fx_display[cur];
    for (const v of [f.domestic, f.usa, f.international, f.local.US, f.local.GB, f.local.AU]) assert.equal((v * 2) % 1, 0, `${cur} ${v} is a multiple of 0.50`);
    assert.ok(f.international > f.domestic, `${cur} international costs more than domestic`);
  }
  assert.deepEqual(c.fx_display.GBP.international, c.gbp_display.international);
});

test('Google review line: on the status page once mailed, in the mailed email, and never emailed to unsubscribed customers', async () => {
  const REVIEW = /Leave a review on Google/;
  const orderFor = (email, status) => {
    const sid = seedOrder({ email, status });
    return db.prepare('SELECT id, status_token FROM orders WHERE stripe_session_id = ?').get(sid);
  };
  const statusPage = async token => (await fetch(`${base}/status/${token}`)).text();

  assert.match(await statusPage(orderFor('review-page@example.com', 'mailed').status_token), REVIEW);
  assert.doesNotMatch(await statusPage(orderFor('review-page@example.com', 'printing').status_token), REVIEW);

  db.prepare('INSERT INTO customers (email, unsubscribed_at) VALUES (?, CURRENT_TIMESTAMP)').run('review-optout@example.com');
  const markMailed = async email => {
    const { id } = orderFor(email, 'mailed');
    const before = sentMail.length;
    sendMailedNotification(db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
    await new Promise(r => setTimeout(r, 50));
    return sentMail.slice(before)[0];
  };

  process.env.SMTP_HOST = 'smtp.test';
  try {
    const normal = await markMailed('review-yes@example.com');
    assert.match(normal.text, REVIEW);
    assert.match(normal.html, REVIEW);
    const optedOut = await markMailed('REVIEW-OPTOUT@example.com');
    assert.doesNotMatch(optedOut.text, REVIEW);
    assert.doesNotMatch(optedOut.html, REVIEW);
  } finally { delete process.env.SMTP_HOST; }
});

test('"at the printer" email goes once to a live PostGrid order (like #17, sent before the feature), never to test letters', async () => {
  process.env.SMTP_HOST = 'smtp.test';
  try {
    const mk = (mode, status) => {
      const sid = seedOrder({ email: `printer-${mode}-${status}@example.com`, status, recipientName: 'Nathalie Villeneuve' });
      db.prepare("UPDATE orders SET postgrid_letter_id = 'letter_x', postgrid_mode = ?, postgrid_status = 'ready' WHERE stripe_session_id = ?").run(mode, sid);
      return db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(sid).id;
    };
    const live = mk('live', 'submitted_to_printer');
    const test = mk('test', 'submitted_to_printer');
    const mailed = mk('live', 'mailed');
    const before = sentMail.length;
    for (const id of [live, live, test, mailed]) sendAtPrinterEmail(id);
    await new Promise(r => setTimeout(r, 50));
    const sent = sentMail.slice(before);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'printer-live-submitted_to_printer@example.com');
    assert.match(sent[0].subject, /at the printer/);
    assert.match(sent[0].text, /within two business days/);
    assert.ok(db.prepare('SELECT printer_email_sent_at FROM orders WHERE id = ?').get(live).printer_email_sent_at);
  } finally { delete process.env.SMTP_HOST; }
});

test('fixed local prices: a UK order is charged in pounds, reports stay in CAD, Canada is unchanged', async () => {
  db.prepare("INSERT INTO settings (key, value) VALUES ('postgrid_countries', 'CA,US,GB,AU') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  const post = fields => fetch(`${base}/api/create-order`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
    'r-email': 'cur@example.com', 'r-name': 'Pat Local', 'r-street': '1 High St', 'r-city': 'London', 'r-postal': 'SW1A 1AA',
    'letter-body': 'Hello.', 'letter-type': 'standard', ...fields }) });
  const line = () => globalThis.__lastSession.line_items[0].price_data;
  assert.equal((await post({ 'r-country': 'GB', currency: 'GBP' })).status, 200);
  assert.equal(line().currency, 'gbp');
  assert.equal(line().unit_amount, 450);
  const o = db.prepare("SELECT * FROM orders WHERE customer_email = 'cur@example.com' ORDER BY id DESC").get();
  assert.equal(o.charge_currency, 'GBP');
  assert.equal(o.charge_cents, 450);
  assert.ok(o.price_cents > 450, 'price_cents is a CAD figure for reports');
  assert.equal((await post({ 'r-country': 'CA', currency: 'USD' })).status, 200);
  assert.equal(line().currency, 'usd');
  assert.equal(line().unit_amount, 500);
  assert.equal((await post({ 'r-country': 'FR', currency: 'AUD' })).status, 200);
  assert.equal(line().unit_amount, 1950);
  assert.equal((await post({ 'r-country': 'CA', currency: 'EUR' })).status, 200);   // unknown currency falls back to CAD
  assert.equal(line().currency, 'cad');
  assert.equal(line().unit_amount, 600);
  assert.equal((await post({ 'r-country': 'CA' })).status, 200);
  assert.equal(line().currency, 'cad');
  db.prepare("DELETE FROM settings WHERE key = 'postgrid_countries'").run();
});

test('admin login: a malformed body (password[]=x) is answered, not left hanging', async () => {
  const form = 'username=testadmin&password[]=x&code[]=1';
  const res = await fetch(`${base}/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form, redirect: 'manual', signal: AbortSignal.timeout(5000),
  });
  assert.ok([302, 400, 401].includes(res.status), `expected a normal rejection, got ${res.status}`);
  assert.match(res.headers.get('location') || '', /error=1/);
});

test('async route errors reach the error handler instead of hanging the request', async () => {
  // /api/contact is async: an object where a string is expected must not leave the socket open.
  const res = await fetch(`${base}/api/contact`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: { a: 1 }, email: ['x@y.com'], message: 'hi' }), signal: AbortSignal.timeout(5000),
  });
  assert.ok(res.status < 600, "the request was answered");
});

// ── Business portal (test) ─────────────────────────────────────────────────────────────────────────────────────────
test('business portal: onboarding, forced password change, batch checks, approval, isolation, switch', async () => {
  const { cookie, csrfToken } = await loginAdmin();
  const adminPost = (p, body, method = 'POST') => fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body) });

  // The admin API needs an admin session and a CSRF token.
  assert.equal((await fetch(`${base}/api/admin/businesses`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/businesses`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{}' })).status, 403);

  const mk = async (name, email) => (await adminPost('/api/admin/businesses', { name, owner_email: email, price_per_piece_cents: 550, contact_name: 'Pat' })).json();
  const a = await mk('Acme Property Mgmt', 'owner@acme.test');
  const other = await mk('Other Co', 'owner@other.test');
  assert.ok(a.ok && a.login.tempPassword.length >= 12 && other.ok);
  assert.equal((await adminPost('/api/admin/businesses', { name: 'Dup', owner_email: 'owner@acme.test' })).status, 409);
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM business_users').all()).includes(a.login.tempPassword), 'the temporary password is never stored in plain text');

  // Portal calls: custom header required; session kept in a cookie jar.
  const portal = async (jar, p, { method = 'GET', body } = {}) => {
    const r = await fetch(`${base}/api/portal${p}`, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'portal', ...(jar.c ? { Cookie: jar.c } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = (r.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).find(c => c.startsWith('connect.sid='));
    if (sc) jar.c = sc;
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  const A = {}, B = {};
  assert.equal((await portal({}, '/batches')).status, 401, 'no session, no data');
  assert.equal((await fetch(`${base}/api/portal/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403, 'login needs the portal header');
  assert.equal((await portal(A, '/login', { method: 'POST', body: { email: 'owner@acme.test', password: 'wrong-password-1' } })).status, 401);
  assert.equal((await portal(A, '/login', { method: 'POST', body: { email: ['x'], password: { a: 1 } } })).status, 400, 'malformed login body is rejected, not thrown');
  const li = await portal(A, '/login', { method: 'POST', body: { email: 'owner@acme.test', password: a.login.tempPassword } });
  assert.equal(li.status, 200); assert.equal(li.json.mustChangePassword, true);

  // Until the temporary password is replaced, nothing else works.
  assert.equal((await portal(A, '/batches')).status, 403);
  assert.equal((await portal(A, '/change-password', { method: 'POST', body: { current: a.login.tempPassword, next: 'short' } })).status, 400);
  const NEWPW = 'a-Better-passw0rd';
  assert.equal((await portal(A, '/change-password', { method: 'POST', body: { current: a.login.tempPassword, next: NEWPW } })).status, 200);
  const me = await portal(A, '/me');
  assert.equal(me.status, 200); assert.equal(me.json.business.name, 'Acme Property Mgmt'); assert.equal(me.json.business.pricePerPieceCents, 550);

  // Checking a batch: good rows, a bad postal code, a missing merge value, and a field filled safely as plain text.
  const rows = [
    { name: 'Jane Smith', street: '123 Main St', city: 'Toronto', province: 'ON', postal: 'm5v2t6', country: 'Canada', first_name: 'Jane' },
    { name: 'Raj <b>Patel</b>', street: '88 Granville St', city: 'Vancouver', province: 'BC', postal: 'V6C 1T2', first_name: 'Raj' },
    { name: 'Bad Postal', street: '1 St', city: 'Calgary', province: 'AB', postal: 'ZZZ', first_name: 'Bad' },
    { name: 'No Name Field', street: '2 St', city: 'Calgary', province: 'AB', postal: 'T2P 1J9', first_name: '' },
  ];
  const tpl = 'Dear {{first_name}},\n\nYour address on file is {{street}}.';
  const chk = await portal(A, '/batches/check', { method: 'POST', body: { name: 'Nov', template: tpl, rows } });
  assert.equal(chk.status, 200);
  assert.equal(chk.json.count, 4); assert.equal(chk.json.issueCount, 2); assert.equal(chk.json.totalCents, 4 * 550);
  assert.match(chk.json.sample[0].body, /^Dear Jane,/);
  assert.match(chk.json.problems.map(p => p.issues.join()).join(), /postal code/i);
  assert.match(chk.json.problems.map(p => p.issues.join()).join(), /first_name/);
  assert.equal((await portal(A, '/batches/check', { method: 'POST', body: { name: 'x', template: 'hi', rows: new Array(201).fill(rows[0]) } })).status, 400, 'over the per-batch limit');

  // A batch with problems saves, but cannot be submitted.
  const bad = await portal(A, '/batches', { method: 'POST', body: { name: 'Has problems', template: tpl, rows } });
  assert.equal(bad.status, 200); assert.equal(bad.json.issueCount, 2);
  assert.equal((await portal(A, `/batches/${bad.json.id}/submit`, { method: 'POST', body: {} })).status, 409);

  // A clean batch goes through submit → admin approval.
  const good = await portal(A, '/batches', { method: 'POST', body: { name: 'Clean', template: tpl, rows: rows.slice(0, 2) } });
  assert.equal(good.json.issueCount, 0);
  const piece = db.prepare('SELECT postal, country, body, recipient_name FROM business_pieces WHERE batch_id = ? ORDER BY row_num').all(good.json.id);
  assert.equal(piece[0].postal, 'M5V 2T6', 'postal code normalised'); assert.equal(piece[0].country, 'CA');
  assert.equal(piece[1].recipient_name, 'Raj <b>Patel</b>', 'stored as plain text; the pages escape it');
  assert.equal((await portal(A, `/batches/${good.json.id}/submit`, { method: 'POST', body: {} })).status, 200);
  assert.equal((await portal(A, `/batches/${good.json.id}/submit`, { method: 'POST', body: {} })).status, 409, 'cannot submit twice');

  // Another business cannot see or touch it.
  await portal(B, '/login', { method: 'POST', body: { email: 'owner@other.test', password: other.login.tempPassword } });
  await portal(B, '/change-password', { method: 'POST', body: { current: other.login.tempPassword, next: 'another-Good-pw9' } });
  assert.equal((await portal(B, `/batches/${good.json.id}`)).status, 404);
  assert.equal((await portal(B, `/batches/${good.json.id}/cancel`, { method: 'POST', body: {} })).status, 404);
  assert.deepEqual((await portal(B, '/batches')).json, []);

  // The admin sees it in the queue and approves. Approving sends nothing anywhere.
  const list = await (await fetch(`${base}/api/admin/businesses`, { headers: { Cookie: cookie } })).json();
  assert.ok(list.queue.some(q => q.id === good.json.id));
  assert.equal((await adminPost(`/api/admin/business-batches/${good.json.id}/decision`, { decision: 'approve', note: 'Looks right' })).status, 200);
  assert.equal((await adminPost(`/api/admin/business-batches/${good.json.id}/decision`, { decision: 'approve' })).status, 409, 'already decided');
  const after = await portal(A, `/batches/${good.json.id}`);
  assert.equal(after.json.batch.status, 'approved'); assert.equal(after.json.batch.admin_note, 'Looks right');
  assert.equal((await portal(A, `/batches/${good.json.id}/cancel`, { method: 'POST', body: {} })).status, 409);

  // Pausing a business locks it out; the kill switch turns the whole portal off.
  assert.equal((await adminPost(`/api/admin/businesses/${a.id}`, { status: 'paused' }, 'PUT')).status, 200);
  assert.equal((await portal(A, '/batches')).status, 401);
  assert.equal((await portal({}, '/login', { method: 'POST', body: { email: 'owner@acme.test', password: NEWPW } })).status, 403);
  assert.equal((await adminPost(`/api/admin/businesses/${a.id}`, { status: 'active' }, 'PUT')).status, 200);
  assert.equal((await adminPost('/api/admin/businesses/portal-switch', { enabled: false })).status, 200);
  assert.equal((await portal(B, '/me')).status, 503);
  assert.equal((await fetch(`${base}/portal`)).status, 200, 'the page itself still loads');
  await adminPost('/api/admin/businesses/portal-switch', { enabled: true });

  // Lock-out after repeated failures on one account (the per-IP limiter is off in tests).
  for (let i = 0; i < 8; i++) await portal({}, '/login', { method: 'POST', body: { email: 'owner@other.test', password: 'nope-nope-nope' } });
  assert.equal((await portal({}, '/login', { method: 'POST', body: { email: 'owner@other.test', password: 'another-Good-pw9' } })).status, 429);
});

// ── Country domains (letterhome.us, letterhome.co.uk) ─────────────────────────────────────────────────────────────
const siteGet = (host, p) => new Promise((resolve, reject) => {
  const http = require('node:http');
  const u = new URL(base);
  http.get({ host: u.hostname, port: u.port, path: p, headers: { Host: host } }, r => {
    let body = ''; r.setEncoding('utf8'); r.on('data', d => { body += d; });
    r.on('end', () => resolve({ status: r.statusCode, location: r.headers.location, body }));
  }).on('error', reject);
});
const setFlag = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);

test('country domains, switch OFF: they only redirect to the matching page on letterhome.ca', async () => {
  setFlag('us_domain_live', 'false'); setFlag('uk_domain_live', 'false');
  assert.deepEqual(await siteGet('letterhome.us', '/').then(({ status, location }) => ({ status, location })), { status: 301, location: 'https://letterhome.ca/us' });
  assert.equal((await siteGet('letterhome.us', '/send?to=US')).location, 'https://letterhome.ca/send?to=US');
  assert.equal((await siteGet('letterhome.us', '/es')).location, 'https://letterhome.ca/us/es');
  assert.equal((await siteGet('letterhome.us', '//evil.example/x')).location, 'https://letterhome.ca//evil.example/x', 'the target host can never be changed by the request');
  assert.equal((await siteGet('www.letterhome.us', '/')).location, 'https://letterhome.us/');
  assert.equal((await siteGet('letterhome.co.uk', '/')).location, 'https://letterhome.ca/uk');
  const ca = await siteGet('letterhome.ca', '/us');
  assert.equal(ca.status, 200, 'letterhome.ca/us is unchanged while the switch is off');
  assert.match(ca.body, /<link rel="canonical" href="https:\/\/letterhome\.ca\/us">/);
});

test('country domains, switch ON: real pages, canonical and hreflang on the country domain, one address per page', async () => {
  setFlag('us_domain_live', 'true'); setFlag('uk_domain_live', 'true');
  try {
    const canon = b => (b.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    const hl = (b, lang) => (b.match(new RegExp(`hreflang="${lang}" href="([^"]*)"`)) || [])[1];

    const us = await siteGet('letterhome.us', '/');
    assert.equal(us.status, 200);
    assert.equal(canon(us.body), 'https://letterhome.us/');
    assert.equal(hl(us.body, 'en-US'), 'https://letterhome.us/');
    assert.equal(hl(us.body, 'es-US'), 'https://letterhome.us/es');
    assert.equal(hl(us.body, 'en-GB'), 'https://letterhome.co.uk/');
    assert.equal(hl(us.body, 'en-AU'), 'https://letterhome.ca/au');
    assert.equal(hl(us.body, 'en-CA'), 'https://letterhome.ca/');
    assert.equal(hl(us.body, 'x-default'), 'https://letterhome.ca/');
    assert.ok(!/https:\/\/letterhome\.ca\/us/.test(us.body), 'no stale letterhome.ca/us URLs on the US page');

    assert.equal(canon((await siteGet('letterhome.us', '/es')).body), 'https://letterhome.us/es');
    const guide = await siteGet('letterhome.us', '/how-to-send-mail-to-canada-from-us');
    assert.equal(guide.status, 200); assert.equal(canon(guide.body), 'https://letterhome.us/how-to-send-mail-to-canada-from-us');
    assert.equal((await siteGet('letterhome.co.uk', '/')).status, 200);
    assert.equal(canon((await siteGet('letterhome.co.uk', '/')).body), 'https://letterhome.co.uk/');

    // Old and foreign addresses redirect once, to the one right place.
    assert.equal((await siteGet('letterhome.us', '/us')).location, 'https://letterhome.us/');
    assert.equal((await siteGet('letterhome.us', '/us/es')).location, 'https://letterhome.us/es');
    assert.equal((await siteGet('letterhome.us', '/uk')).location, 'https://letterhome.co.uk/');
    assert.equal((await siteGet('letterhome.us', '/au')).location, 'https://letterhome.ca/au');
    assert.equal((await siteGet('letterhome.us', '/admin/login')).location, 'https://letterhome.ca/admin/login');
    assert.equal((await siteGet('letterhome.us', '/portal')).location, 'https://letterhome.ca/portal');
    assert.equal((await siteGet('letterhome.ca', '/us')).location, 'https://letterhome.us/');
    assert.equal((await siteGet('letterhome.ca', '/us/es')).location, 'https://letterhome.us/es');
    assert.equal((await siteGet('letterhome.ca', '/uk')).location, 'https://letterhome.co.uk/');

    // Shared pages work on the country domain but keep letterhome.ca as their canonical (never indexed twice).
    const terms = await siteGet('letterhome.us', '/terms');
    assert.equal(terms.status, 200); assert.equal(canon(terms.body), 'https://letterhome.ca/terms');

    // The main site's home page now points its US and UK alternates at the country domains.
    const home = await siteGet('letterhome.ca', '/');
    assert.equal(home.status, 200); assert.equal(canon(home.body), 'https://letterhome.ca/');
    assert.equal(hl(home.body, 'en-US'), 'https://letterhome.us/'); assert.equal(hl(home.body, 'en-GB'), 'https://letterhome.co.uk/');

    // Own sitemap and robots.txt per domain; the main sitemap drops the moved URLs.
    const smUs = (await siteGet('letterhome.us', '/sitemap.xml')).body;
    assert.match(smUs, /<loc>https:\/\/letterhome\.us\/<\/loc>/); assert.match(smUs, /<loc>https:\/\/letterhome\.us\/es<\/loc>/);
    assert.ok(!/letterhome\.ca\/us/.test(smUs));
    const smCa = (await siteGet('letterhome.ca', '/sitemap.xml')).body;
    assert.match(smCa, /<loc>https:\/\/letterhome\.ca\/<\/loc>/);
    assert.ok(!/<loc>https:\/\/letterhome\.ca\/(us|uk)(\/|<)/.test(smCa), 'moved pages are not listed on the main sitemap');
    assert.match((await siteGet('letterhome.us', '/robots.txt')).body, /Sitemap: https:\/\/letterhome\.us\/sitemap\.xml/);
  } finally { setFlag('us_domain_live', 'false'); setFlag('uk_domain_live', 'false'); }
});

test('country domains: customers can do everything on the country domain and the order is tagged with its site', async () => {
  setFlag('us_domain_live', 'true'); setFlag('uk_domain_live', 'true');
  try {
    for (const host of ['letterhome.us', 'letterhome.co.uk']) {
      for (const p of ['/send', '/track', '/account/login', '/api/site-config', '/terms']) {
        const r = await siteGet(host, p);
        assert.equal(r.status, 200, `${host}${p} should be served on the country domain, got ${r.status}`);
      }
    }
    const post = (host, email) => new Promise((resolve, reject) => {
      const http = require('node:http'); const u = new URL(base);
      const data = new URLSearchParams({ 'r-email': email, 'r-name': 'Site Test', 'r-street': '1 Main St', 'r-city': 'Toronto', 'r-province': 'ON', 'r-postal': 'M5V 1A1', 'r-country': 'CA', 'letter-body': 'Hi', 'letter-type': 'standard' }).toString();
      const rq = http.request({ host: u.hostname, port: u.port, path: '/api/create-order', method: 'POST', headers: { Host: host, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) } },
        r => { let b = ''; r.on('data', d => { b += d; }); r.on('end', () => resolve({ status: r.statusCode, body: b })); });
      rq.on('error', reject); rq.end(data);
    });
    for (const [host, key] of [['letterhome.us', 'us'], ['letterhome.co.uk', 'uk'], ['letterhome.ca', 'ca']]) {
      const email = `site-${key}@example.com`;
      const r = await post(host, email);
      assert.equal(r.status, 200, `${host}: ${r.body}`);
      const row = db.prepare('SELECT order_site FROM orders WHERE customer_email = ? ORDER BY id DESC LIMIT 1').get(email);
      assert.equal(row.order_site, key, `order placed on ${host} should be tagged ${key}`);
    }
  } finally { setFlag('us_domain_live', 'false'); setFlag('uk_domain_live', 'false'); }
});

test('country domains: each country owns the guides written for its readers, and tracking works on the domain', async () => {
  setFlag('us_domain_live', 'true'); setFlag('uk_domain_live', 'true');
  try {
    const canon = b => (b.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    const us = await siteGet('letterhome.us', '/send-a-letter-online-in-the-usa');
    assert.equal(us.status, 200); assert.equal(canon(us.body), 'https://letterhome.us/send-a-letter-online-in-the-usa');
    const uk = await siteGet('letterhome.co.uk', '/address-a-letter-to-canada-from-the-uk');
    assert.equal(uk.status, 200); assert.equal(canon(uk.body), 'https://letterhome.co.uk/address-a-letter-to-canada-from-the-uk');
    // One address per page: the other domains and letterhome.ca send readers to the owner.
    assert.equal((await siteGet('letterhome.co.uk', '/send-a-letter-online-in-the-usa')).location, 'https://letterhome.us/send-a-letter-online-in-the-usa');
    assert.equal((await siteGet('letterhome.us', '/address-a-letter-to-canada-from-the-uk')).location, 'https://letterhome.co.uk/address-a-letter-to-canada-from-the-uk');
    assert.equal((await siteGet('letterhome.ca', '/send-a-letter-online-in-the-usa')).location, 'https://letterhome.us/send-a-letter-online-in-the-usa');
    assert.equal((await siteGet('letterhome.ca', '/address-a-letter-to-canada-from-the-uk')).location, 'https://letterhome.co.uk/address-a-letter-to-canada-from-the-uk');
    // Sitemaps follow the pages.
    assert.ok((await siteGet('letterhome.us', '/sitemap.xml')).body.includes('https://letterhome.us/send-a-letter-online-in-the-usa'));
    assert.ok((await siteGet('letterhome.co.uk', '/sitemap.xml')).body.includes('https://letterhome.co.uk/address-a-letter-to-canada-from-the-uk'));
    const main = (await siteGet('letterhome.ca', '/sitemap.xml')).body;
    assert.ok(!main.includes('send-a-letter-online-in-the-usa') && !main.includes('address-a-letter-to-canada-from-the-uk'));
    // The tracking pages work on the country domain.
    db.prepare("INSERT INTO orders (customer_email, recipient_name, recipient_street, price_cents, status, status_token) VALUES ('track-site@example.com','T','1 St',600,'paid','track-site-token')").run();
    const row = { status_token: 'track-site-token' };
    for (const host of ['letterhome.us', 'letterhome.co.uk']) {
      assert.equal((await siteGet(host, '/track')).status, 200);
      assert.equal((await siteGet(host, '/how-to-track-a-letter-to-canada')).status, 200);
      if (row) assert.equal((await siteGet(host, `/status/${row.status_token}`)).status, 200);
    }
  } finally { setFlag('us_domain_live', 'false'); setFlag('uk_domain_live', 'false'); }
});

test('ordering pages carry the country look and a complete Spanish dictionary', () => {
  const fs = require('node:fs'), path = require('node:path');
  const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
  const es = new Function(pub('lang-es.js').replace('window.LH_ES =', 'return'))();
  for (const f of ['send', 'track', 'order-success', 'account']) {
    const html = pub(`${f}.html`);
    assert.ok(html.includes('/order-country.js') && html.includes('/country-order.css') && html.includes('/lang-es.js'), `${f}.html wires order-country.js, country-order.css and lang-es.js`);
    const keys = new Set([...html.matchAll(/data-i18n(?:-html|-placeholder|-aria)?="([a-z]+\.[a-z0-9._-]+)"/g)].map(m => m[1]).filter(k => !k.startsWith('x.')));
    const missing = [...keys].filter(k => es[k] === undefined && !['send.svc.', 'country.'].includes(k));
    assert.deepEqual(missing, [], `${f}.html keys missing from lang-es.js`);
  }
  const css = pub('country-order.css');
  for (const c of ['us', 'uk', 'au']) assert.ok(css.includes(`html[data-country="${c}"] body{`), `${c} palette`);
});

test('business pages: one per site, own canonical, quote form works, and the country domains serve them at /business', async () => {
  const canon = b => (b.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  for (const [p, c] of [['/business', 'https://letterhome.ca/business'], ['/us/business', 'https://letterhome.ca/us/business'], ['/uk/business', 'https://letterhome.ca/uk/business'], ['/au/business', 'https://letterhome.ca/au/business']]) {
    const r = await fetch(`${base}${p}`); const b = await r.text();
    assert.equal(r.status, 200, p); assert.equal(canon(b), c, p);
    assert.ok(!/postgrid/i.test(b), `${p} must not name the print partner`);
    assert.ok(b.includes('id="biz-submit"'), `${p} has the quote form`);
  }
  setFlag('us_domain_live', 'true'); setFlag('uk_domain_live', 'true');
  try {
    const us = await siteGet('letterhome.us', '/business'); assert.equal(us.status, 200); assert.equal(canon(us.body), 'https://letterhome.us/business');
    const uk = await siteGet('letterhome.co.uk', '/business'); assert.equal(uk.status, 200); assert.equal(canon(uk.body), 'https://letterhome.co.uk/business');
    assert.equal((await siteGet('letterhome.ca', '/us/business')).location, 'https://letterhome.us/business');
    assert.equal((await siteGet('letterhome.ca', '/uk/business')).location, 'https://letterhome.co.uk/business');
    assert.ok((await siteGet('letterhome.us', '/sitemap.xml')).body.includes('https://letterhome.us/business'));
    assert.ok(!(await siteGet('letterhome.ca', '/sitemap.xml')).body.includes('https://letterhome.ca/us/business'));
    assert.ok(us.body.includes('hreflang="en-GB" href="https://letterhome.co.uk/business"'));
  } finally { setFlag('us_domain_live', 'false'); setFlag('uk_domain_live', 'false'); }
});

test('admin visitor stats: page views are tagged with their domain and can be filtered by site', async () => {
  setFlag('us_domain_live', 'true'); setFlag('uk_domain_live', 'true');
  try {
    db.prepare('DELETE FROM page_views').run();
    await siteGet('letterhome.us', '/');
    await siteGet('letterhome.co.uk', '/business');
    await fetch(`${base}/about`);
    await fetch(`${base}/from-uk`, { redirect: 'manual' });
    await fetch(`${base}/no-such-page-here`);
    await new Promise(r => setTimeout(r, 50));
    const rows = db.prepare('SELECT site, path FROM page_views ORDER BY id').all();
    assert.deepEqual(rows.map(r => r.site + ' ' + r.path), ['us /', 'uk /business', 'ca /about'], 'the visitor-facing path and domain are stored; redirects and 404s are not counted');
    const { cookie } = await loginAdmin();
    const get = q => fetch(`${base}/api/admin/visitors/stats${q}`, { headers: { Cookie: cookie } }).then(r => r.json());
    assert.equal((await get('')).total, 3);
    assert.equal((await get('?site=us')).total, 1);
    assert.equal((await get('?site=uk')).topPages[0].path, '/business');
    assert.equal((await get('?site=ca')).total, 1);
    assert.equal((await get('?site=bogus')).total, 3, 'an unknown site falls back to all sites');
    const recent = await fetch(`${base}/api/admin/visitors/recent?site=us`, { headers: { Cookie: cookie } }).then(r => r.json());
    assert.deepEqual(recent.map(r => r.site), ['us']);
  } finally { setFlag('us_domain_live', 'false'); setFlag('uk_domain_live', 'false'); }
});

test('US and UK everyday-mail guides: served on their own domain with a self canonical, listed in that domain sitemap', async () => {
  setFlag('us_domain_live', 'true'); setFlag('uk_domain_live', 'true');
  try {
    const guides = { 'letterhome.us': ['how-long-does-mail-take', 'how-much-is-a-stamp', 'return-address-on-a-letter'],
                     'letterhome.co.uk': ['how-long-does-post-take', 'how-much-is-a-stamp', 'return-address-on-a-letter'] };
    for (const [host, slugs] of Object.entries(guides)) {
      const sm = (await siteGet(host, '/sitemap.xml')).body;
      for (const slug of slugs) {
        const r = await siteGet(host, `/${slug}`);
        assert.equal(r.status, 200, `${host}/${slug}`);
        assert.ok(r.body.includes(`<link rel="canonical" href="https://${host}/${slug}">`), `${host}/${slug} canonical`);
        assert.ok(!r.body.includes('—'), `${host}/${slug} has no em dashes`);
        assert.ok(sm.includes(`<loc>https://${host}/${slug}</loc>`), `${host}/${slug} in sitemap`);
        const ld = JSON.parse(r.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
        const faq = ld['@graph'].find(x => x['@type'] === 'FAQPage');
        for (const q of faq.mainEntity) assert.ok(r.body.includes(q.name.replace(/'/g, '&#x27;')) || r.body.includes(q.name), `${slug}: FAQ "${q.name}" is visible on the page`);
      }
    }
    const ca = await fetch(`${base}/us/how-much-is-a-stamp`, { redirect: 'manual' });
    assert.equal(ca.status, 301, 'on letterhome.ca the US guide moves to letterhome.us');
  } finally { setFlag('us_domain_live', 'false'); setFlag('uk_domain_live', 'false'); }
});
