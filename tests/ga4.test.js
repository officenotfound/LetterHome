const test = require('node:test');
const assert = require('node:assert');
const ga4 = require('../ga4');

test('reads client and session ids from GA cookies', () => {
  const a = ga4.gaIdsFromCookie('x=1; _ga=GA1.1.1234567890.1700000000; _ga_DF3XQ6ML41=GS1.1.1731000000.1.1.1731000100.0', 'G-DF3XQ6ML41');
  assert.deepStrictEqual(a, { clientId: '1234567890.1700000000', sessionId: '1731000000' });
  const b = ga4.gaIdsFromCookie('_ga=GA1.1.55.66; _ga_DF3XQ6ML41=GS2.1.s1731000001$o1$g1', 'G-DF3XQ6ML41');
  assert.strictEqual(b.sessionId, '1731000001');
  assert.deepStrictEqual(ga4.gaIdsFromCookie('a=b', 'G-DF3XQ6ML41'), { clientId: null, sessionId: null });
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
