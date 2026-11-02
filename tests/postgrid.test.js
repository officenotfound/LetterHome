'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `lh-pg-${randomUUID()}.db`);
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'x';
process.env.BASE_URL = 'http://localhost';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.POSTGRID_API_KEY = 'test_abc123';

const { db } = require('../server');
const { createPostGrid } = require('../postgrid');
const { PDFDocument } = require('pdf-lib');

const calls = [];
let letterStatus = 'ready';
const fakeFetch = async (url, opts) => {
  calls.push({ url, opts });
  const body = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
  if (url.endsWith('/contacts')) return body({ id: 'contact_' + calls.length });
  if (url.endsWith('/letters') && opts.method === 'POST') return body({ id: 'letter_1', live: false, status: 'ready', url: 'https://pg/preview.pdf' });
  if (/\/letters\/letter_1$/.test(url) && opts.method === 'GET') return body({ id: 'letter_1', status: letterStatus, url: 'https://pg/p.pdf' });
  if (/\/letters\/letter_1$/.test(url) && opts.method === 'DELETE') return body({ id: 'letter_1', status: 'cancelled' });
  return body({ error: { type: 'x', message: 'nope' } }, 404);
};
const settings = {};
const pg = createPostGrid({ db, getSetting: (k, f) => settings[k] ?? f, orderDirPath: () => os.tmpdir(), fetchImpl: fakeFetch });

function seed(o = {}) {
  const r = db.prepare(`INSERT INTO orders (customer_email, recipient_name, recipient_street, recipient_city, recipient_province, recipient_postal,
    destination_country, price_cents, status, status_token, letter_body, attachment_info, skip_return, colour_printing, paid_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(
    'c@example.com', 'Ada Lovelace', '1 Main St', 'Toronto', 'ON', 'M5V 1A1', o.country ?? 'CA', 600, o.status ?? 'paid', randomUUID(),
    o.body ?? 'Dear Ada,\n\nHello from Letterhome. Café “quotes” — fine.', o.attach ?? '[]', o.skip ?? 1, o.colour ?? 0);
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(r.lastInsertRowid);
}

test('typed letter builds a Letter-size PDF with address on the first page', async () => {
  const b = await pg.buildLetterPdf(seed());
  const doc = await PDFDocument.load(b.pdf);
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()], [612, 792]);
  assert.equal(b.placement, 'top_first_page');
  assert.equal(b.sheets, 1);
});

test('uploaded PDF is normalised to Letter and gets a blank address page', async () => {
  const src = await PDFDocument.create(); src.addPage([300, 400]); src.addPage([595, 842]);
  const f = path.join(os.tmpdir(), `a-${randomUUID()}.pdf`); fs.writeFileSync(f, await src.save());
  const b = await pg.buildLetterPdf(seed({ body: '', attach: JSON.stringify([{ path: f, originalName: 'a.pdf' }]) }));
  const doc = await PDFDocument.load(b.pdf);
  assert.equal(doc.getPageCount(), 2);
  for (const p of doc.getPages()) assert.deepEqual([p.getWidth(), p.getHeight()], [612, 792]);
  assert.equal(b.placement, 'insert_blank_page');
  assert.equal(b.sheets, 3);
});

test('submit creates contacts and a letter, stores the id, and marks the order submitted', async () => {
  calls.length = 0;
  const o = seed();
  const r = await pg.submitOrder(o);
  assert.equal(r.letter.id, 'letter_1');
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id);
  assert.equal(row.status, 'submitted_to_printer');
  assert.equal(row.postgrid_letter_id, 'letter_1');
  assert.equal(row.postgrid_mode, 'test');
  const post = calls.find(c => c.url.endsWith('/letters'));
  assert.equal(post.opts.headers['Idempotency-Key'], `lh-order-${o.id}`);
  assert.equal(post.opts.headers['x-api-key'], 'test_abc123');
  assert.equal(post.opts.body.get('addressPlacement'), 'top_first_page');
  assert.equal(post.opts.body.get('color'), 'false');
  // no return address -> Letterhome Vancouver is used as sender
  const fromCall = calls.filter(c => c.url.endsWith('/contacts'))[1];
  assert.equal(JSON.parse(fromCall.opts.body).addressLine1, '1515 Discovery St');
});

test('refresh maps PostGrid statuses; completed means mailed; cancelled returns the order to the manual queue', async () => {
  const o = seed(); await pg.submitOrder(o);
  letterStatus = 'printing';
  let r = await pg.refreshOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id));
  assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(o.id).status, 'printing');
  assert.equal(r.mailed, false);
  letterStatus = 'processed_for_delivery';
  r = await pg.refreshOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id));
  assert.equal(r.mailed, true);
  assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(o.id).status, 'mailed');
  letterStatus = 'completed';
  r = await pg.refreshOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id));
  assert.equal(r.mailed, false);             // no duplicate "mailed" email
  letterStatus = 'ready';
});

test('cancel calls DELETE and puts the order back to paid', async () => {
  const o = seed(); await pg.submitOrder(o);
  await pg.cancelOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id));
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id);
  assert.equal(row.status, 'paid'); assert.equal(row.postgrid_status, 'cancelled');
});

test('orders PostGrid should not automate are refused as manual', async () => {
  await assert.rejects(pg.submitOrder(seed({ country: 'US' })), e => e.manual && /not enabled/.test(e.message));
  settings.postgrid_countries = 'CA,US';
  const r = await pg.submitOrder(seed({ country: 'US' })); assert.ok(r.letter.id);
  await assert.rejects(pg.submitOrder(seed({ attach: JSON.stringify([{ path: '/x/y.docx', originalName: 'y.docx' }]) })), e => e.manual && /y\.docx/.test(e.message));
  const big = 'word '.repeat(4000);
  await assert.rejects(pg.submitOrder(seed({ body: big })), e => e.manual && /sheets exceeds/.test(e.message));
  const reg = seed(); db.prepare('UPDATE orders SET registered_mail = 1 WHERE id = ?').run(reg.id);
  await assert.rejects(pg.submitOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(reg.id)), e => e.manual);
  const sch = seed(); db.prepare("UPDATE orders SET scheduled_date = '2999-01-01' WHERE id = ?").run(sch.id);
  await assert.rejects(pg.submitOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(sch.id)), e => /Scheduled for/.test(e.message));
});

test('Word files are converted to PDF and printed; a missing converter falls back to manual', async () => {
  const conv = await PDFDocument.create(); conv.addPage([612, 792]).drawText('from word');
  const bytes = Buffer.from(await conv.save());
  const ok = createPostGrid({ db, getSetting: (k, f) => f, orderDirPath: () => os.tmpdir(), fetchImpl: fakeFetch, convertWord: async () => bytes });
  const attach = JSON.stringify([{ path: '/x/letter.docx', originalName: 'letter.docx' }]);
  const b = await ok.buildLetterPdf(seed({ body: '', attach }));
  assert.equal(b.unsupported.length, 0);
  assert.equal(b.placement, 'insert_blank_page');
  assert.equal(b.pages, 1);
  const none = createPostGrid({ db, getSetting: (k, f) => f, orderDirPath: () => os.tmpdir(), fetchImpl: fakeFetch, convertWord: async () => null });
  assert.deepEqual((await none.buildLetterPdf(seed({ body: '', attach }))).unsupported, ['letter.docx']);
});
