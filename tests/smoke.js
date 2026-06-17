// Smoke tests for letterhome.ca — HTTP-level checks, no browser required.
// Run: node --test tests/smoke.js
//
// Checks that key pages return 200, contain expected content, and that
// critical endpoints behave correctly. Does not fill forms or create orders.

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const BASE = (process.env.SMOKE_BASE_URL || 'https://letterhome.ca').replace(/\/$/, '');

const HEADERS = {
  'User-Agent': 'Letterhome-SmokeTest/1.0',
  ...(process.env.SMOKE_BYPASS_TOKEN
    ? { 'x-smoke-bypass': process.env.SMOKE_BYPASS_TOKEN }
    : {}),
};

async function get(path) {
  const res = await fetch(BASE + path, { headers: HEADERS, redirect: 'follow' });
  const text = await res.text();
  return { res, text };
}

// Warm up the connection before tests run. Cloudflare challenges cold IPs on
// the first request; /health is excluded from bot protection so it always
// returns 200 and primes the IP for subsequent page checks.
before(async () => {
  await fetch(BASE + '/health', { headers: HEADERS }).catch(() => {});
});

// ── Page availability ──────────────────────────────────────────────────────

test('GET / → 200, contains brand name', async () => {
  const { res, text } = await get('/');
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  assert.ok(text.includes('Letterhome') || text.includes('letterhome'), 'Page should contain brand name');
});

test('GET /send → 200, order form present', async () => {
  const { res, text } = await get('/send');
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  assert.ok(text.includes('r-name') || text.includes('recipient') || text.includes('form'), 'Send page should contain form');
});

test('GET /track → 200', async () => {
  const { res } = await get('/track');
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
});

test('GET /contact → 200', async () => {
  const { res } = await get('/contact');
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
});

test('GET /privacy → 200', async () => {
  const { res } = await get('/privacy');
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
});

test('GET /guides → 200', async () => {
  const { res } = await get('/guides');
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
});

// ── Infrastructure ─────────────────────────────────────────────────────────

test('GET /health → 200, status ok', async () => {
  const { res, text } = await get('/health');
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  const json = JSON.parse(text);
  assert.equal(json.status, 'ok', `Expected status:"ok", got ${JSON.stringify(json)}`);
});

// ── 404 handling ───────────────────────────────────────────────────────────

test('GET /nonexistent → 404', async () => {
  const { res } = await get('/this-page-does-not-exist-' + Date.now());
  assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
});

// ── Security headers ───────────────────────────────────────────────────────

test('homepage has X-Content-Type-Options header', async () => {
  const { res } = await get('/');
  assert.equal(
    res.headers.get('x-content-type-options'),
    'nosniff',
    'Missing X-Content-Type-Options: nosniff'
  );
});

// ── API sanity (non-destructive checks only) ───────────────────────────────

test('POST /api/contact with no body → 400', async () => {
  const res = await fetch(BASE + '/api/contact', {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  assert.equal(res.status, 400, `Expected 400 for empty contact, got ${res.status}`);
  const json = JSON.parse(text);
  assert.ok(json.error, 'Should return error message');
});

test('GET /api/order-status with bad token → 404', async () => {
  const { res } = await get('/api/order-status/invalid-token-00000000');
  assert.equal(res.status, 404, `Expected 404 for bad order token, got ${res.status}`);
});
