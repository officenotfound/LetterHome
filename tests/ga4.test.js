const test = require('node:test');
const assert = require('node:assert');
const ga4 = require('../ga4');

test('reads client and session ids from GA cookies', () => {
  const a = ga4.gaIdsFromCookie('x=1; _ga=GA1.1.1234567890.1700000000; _ga_DF3XQ6ML41=GS1.1.1731000000.1.1.1731000100.0', 'ca');
  assert.deepStrictEqual(a, { clientId: '1234567890.1700000000', sessionId: '1731000000' });
  const b = ga4.gaIdsFromCookie('_ga=GA1.1.55.66; _ga_DF3XQ6ML41=GS2.1.s1731000001$o1$g1', 'ca');
  assert.strictEqual(b.sessionId, '1731000001');
  assert.deepStrictEqual(ga4.gaIdsFromCookie('a=b', 'ca'), { clientId: null, sessionId: null });
});

test('purchase payload has value, currency and no personal data', () => {
  const p = ga4.buildPayload({ id: 9, ga_client_id: '1.2', ga_session_id: '1731000000', charge_cents: 600, charge_currency: 'cad', destination_country: 'CA', letter_type: 'letter', recipient_name: 'Secret', sender_email: 'a@b.c' }, 'purchase', { transaction_id: 'order-9' });
  assert.strictEqual(p.client_id, '1.2');
  const e = p.events[0];
  assert.strictEqual(e.name, 'purchase');
  assert.strictEqual(e.params.value, 6);
  assert.strictEqual(e.params.currency, 'CAD');
  assert.strictEqual(e.params.session_id, 1731000000);
  assert.ok(!/Secret|a@b\.c/.test(JSON.stringify(p)));
});

test('nothing is sent without consent ids or without the API secret', async () => {
  let calls = 0; const f = async () => { calls++; return { status: 204 }; };
  delete process.env.GA4_API_SECRET;
  assert.strictEqual((await ga4.sendOrderEvent({ ga_client_id: '1.2' }, 'purchase', {}, f)).sent, false);
  process.env.GA4_API_SECRET = 'x';
  assert.strictEqual((await ga4.sendOrderEvent({ ga_client_id: null }, 'purchase', {}, f)).sent, false);
  assert.strictEqual(calls, 0);
  assert.strictEqual((await ga4.sendOrderEvent({ ga_client_id: '1.2', charge_cents: 100 }, 'purchase', {}, f)).sent, true);
  assert.strictEqual(calls, 1);
  delete process.env.GA4_API_SECRET;
});

test('each site uses its own stream, id and secret', async () => {
  assert.strictEqual(ga4.measurementIdFor('uk'), 'G-7F069ML6GE');
  assert.strictEqual(ga4.measurementIdFor('us'), 'G-HVXM35WRD2');
  assert.strictEqual(ga4.measurementIdFor('ca'), 'G-DF3XQ6ML41');
  const u = ga4.gaIdsFromCookie('_ga=GA1.1.7.8; _ga_7F069ML6GE=GS1.1.1731000009.1', 'uk');
  assert.deepStrictEqual(u, { clientId: '7.8', sessionId: '1731000009' });
  process.env.GA4_API_SECRET_UK = 'ukkey'; process.env.GA4_API_SECRET = 'cakey';
  let url = ''; const f = async (u2) => { url = u2; return { status: 204 }; };
  await ga4.sendOrderEvent({ ga_client_id: '7.8', ga_site: 'uk', charge_cents: 900 }, 'purchase', {}, f);
  assert.ok(url.includes('measurement_id=G-7F069ML6GE') && url.includes('api_secret=ukkey'));
  delete process.env.GA4_API_SECRET_UK; delete process.env.GA4_API_SECRET;
});

test('stream follows the address the visitor is on', () => {
  assert.strictEqual(ga4.siteOfHost('letterhome.co.uk'), 'uk');
  assert.strictEqual(ga4.siteOfHost('www.letterhome.us'), 'us');
  assert.strictEqual(ga4.siteOfHost('letterhome.ca'), 'ca');
  assert.strictEqual(ga4.siteOfHost('localhost'), 'ca');
});
