const test = require('node:test');
const assert = require('node:assert');
const { scanText, scanOrder } = require('../contentscan');

test('flags threats and extortion without storing the text', () => {
  const hits = scanText("I'll kill you. Pay me 500 or I will leak the photos.");
  assert.deepStrictEqual(hits.map(h => h.id).sort(), ['extortion', 'threats']);
  assert.ok(!JSON.stringify(hits).includes('photos'));
});

test('ordinary letters are not flagged', () => {
  assert.deepStrictEqual(scanText('This is a cease and desist about your fence. Our condolences on the loss of your mother. I will kill the weeds.'), []);
});

test('owner watch words are matched', () => {
  assert.strictEqual(scanText('the secret word is plugh', 'plugh, xyzzy').length, 1);
});

test('scanOrder reads typed body and reports a hit as held', () => {
  const r = scanOrder({ body: 'watch your back', files: [] });
  assert.strictEqual(r.held, true);
});

test('unreadable files are reported, not held', () => {
  const r = scanOrder({ body: 'hello', files: [{ path: '/nonexistent.pdf', originalName: 'x.pdf' }] });
  assert.strictEqual(r.held, false);
  assert.deepStrictEqual(r.notScanned, ['x.pdf']);
});
