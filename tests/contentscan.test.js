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

// Uploads are untrusted and scanned on the single server thread, so hostile files must never stall it.
const fsx = require('node:fs'), osx = require('node:os'), pathx = require('node:path'), zlibx = require('node:zlib');
function tmpFile(name, buf) { const d = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'cs-')); const f = pathx.join(d, name); fsx.writeFileSync(f, buf); return f; }

test('hostile PDF streams are scanned in linear time', () => {
  for (const evil of ['[' + '\\\\'.repeat(100000) + ' Tj', '[' + '(\\'.repeat(100000) + ' TJ', '(' + '\\('.repeat(100000) + ' Tj', '<' + '0 '.repeat(100000) + ' Tj']) {
    const f = tmpFile('evil.pdf', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nstream\n' + evil + '\nendstream\nendobj\n', 'latin1'));
    const t = Date.now();
    scanOrder({ body: 'hi', files: [{ path: f, originalName: 'evil.pdf' }] });
    assert.ok(Date.now() - t < 1500, 'scan took ' + (Date.now() - t) + 'ms');
  }
});

test('PDF text is still found inside a content stream', () => {
  const f = tmpFile('ok.pdf', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nstream\nBT (I will kill you) Tj [(wat)-20(ch your back)] TJ ET\nendstream\nendobj\n', 'latin1'));
  assert.strictEqual(scanOrder({ body: '', files: [{ path: f, originalName: 'ok.pdf' }] }).held, true);
});

test('a docx listing one zip bomb thousands of times is capped', () => {
  const bomb = zlibx.deflateRawSync(Buffer.alloc(20 * 1024 * 1024));
  const name = Buffer.from('word/document.xml');
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(name.length, 26);
  const local = Buffer.concat([lh, name, bomb]);
  const n = 3000, parts = [];
  for (let i = 0; i < n; i++) { const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(bomb.length, 20); c.writeUInt16LE(name.length, 28); parts.push(c, name); }
  const dir = Buffer.concat(parts); const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(n, 10); e.writeUInt32LE(dir.length, 12); e.writeUInt32LE(local.length, 16);
  const f = tmpFile('bomb.docx', Buffer.concat([local, dir, e]));
  const t = Date.now();
  scanOrder({ body: 'hi', files: [{ path: f, originalName: 'bomb.docx' }] });
  assert.ok(Date.now() - t < 3000, 'scan took ' + (Date.now() - t) + 'ms');
});
