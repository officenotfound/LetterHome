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
let existingLetters = [];
let liveLetters = true;   // most tests simulate live letters; one test covers test-mode isolation
let recipientStatus = 'verified';
const fakeFetch = async (url, opts) => {
  calls.push({ url, opts });
  const body = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
  if (url.endsWith('/contacts')) return body({ id: 'contact_' + calls.length, addressStatus: recipientStatus, addressErrors: recipientStatus === 'failed' ? 'generic: Unable to find a match for this address' : undefined });
  if (url.includes('/letters?') && opts.method === 'GET') return body({ object: 'list', data: existingLetters, totalCount: existingLetters.length });
  if (url.endsWith('/letters') && opts.method === 'POST') return body({ id: 'letter_1', live: liveLetters, status: 'ready', url: 'https://pg/preview.pdf' });
  if (/\/letters\/letter_1$/.test(url) && opts.method === 'GET') return body({ id: 'letter_1', live: liveLetters, status: letterStatus, url: 'https://pg/p.pdf' });
  if (/\/letters\/letter_1$/.test(url) && opts.method === 'DELETE') return body({ id: 'letter_1', status: 'cancelled' });
  return body({ error: { type: 'x', message: 'nope' } }, 404);
};
const settings = {};
// 1x1 PNG standing in for Twemoji images, so tests never touch the network.
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const emojiAsked = [];
const fakeEmoji = async name => { emojiAsked.push(name); return name === 'missing' ? null : PNG_1PX; };
const pg = createPostGrid({ db, getSetting: (k, f) => settings[k] ?? f, orderDirPath: () => os.tmpdir(), fetchImpl: fakeFetch, emojiImage: fakeEmoji });

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
  assert.equal(row.postgrid_mode, 'live');
  const post = calls.find(c => c.url.endsWith('/letters'));
  assert.equal(post.opts.headers['Idempotency-Key'], `lh-order-${o.id}`);
  assert.equal(post.opts.headers['x-api-key'], 'test_abc123');
  assert.equal(post.opts.body.get('addressPlacement'), 'top_first_page');
  assert.equal(post.opts.body.get('color'), 'false');
  // no return address -> Letterhome Vancouver is used as sender
  const fromCall = calls.filter(c => c.url.endsWith('/contacts'))[1];
  assert.equal(JSON.parse(fromCall.opts.body).addressLine1, '1515 Discovery St');
  const toBody = JSON.parse(calls.filter(c => c.url.endsWith('/contacts'))[0].opts.body);
  assert.equal(toBody.countryCode, 'CA');            // PostGrid requires countryCode, not country
  assert.equal(toBody.firstName, 'Ada'); assert.equal(toBody.lastName, 'Lovelace');
  assert.ok(calls[0].url.includes('/letters?'), 'checks for an existing letter first');
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

test('rotated source pages stay Letter-size; non-Latin text is refused instead of printing question marks', async () => {
  const { degrees } = require('pdf-lib');
  const src = await PDFDocument.create(); const p = src.addPage([612, 792]); p.drawText('x'); p.setRotation(degrees(90));
  const f = path.join(os.tmpdir(), `r-${randomUUID()}.pdf`); fs.writeFileSync(f, await src.save());
  const b = await pg.buildLetterPdf(seed({ body: '', attach: JSON.stringify([{ path: f, originalName: 'r.pdf' }]) }));
  const doc = await PDFDocument.load(b.pdf);
  assert.deepEqual([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()], [612, 792]);
  await assert.rejects(pg.submitOrder(seed({ body: 'Привет 你好' })), e => e.manual && /cannot print/.test(e.message));
  const cyr = await pg.buildLetterPdf(seed({ body: 'Привет, Ελλάδα, cœur ♥ — “quotes”' }));
  assert.deepEqual(cyr.warnings, []);                     // Cyrillic, Greek and symbols print with Noto Serif
});

test('a recipient address that fails verification goes to the manual queue instead of being mailed', async () => {
  recipientStatus = 'failed';
  try {
    calls.length = 0;
    await assert.rejects(pg.submitOrder(seed()), e => e.manual && /failed verification/.test(e.message));
    assert.ok(!calls.some(c => c.url.endsWith('/letters') && c.opts.method === 'POST'), 'no letter created');
  } finally { recipientStatus = 'verified'; }
});

test('an order that already has a letter at PostGrid is not mailed twice', async () => {
  existingLetters = [{ id: 'letter_existing', status: 'ready', live: false }];
  try {
    calls.length = 0;
    const o = seed();
    const r = await pg.submitOrder(o);
    assert.equal(r.reused, true);
    assert.equal(db.prepare('SELECT postgrid_letter_id FROM orders WHERE id = ?').get(o.id).postgrid_letter_id, 'letter_existing');
    assert.ok(!calls.some(c => c.url.endsWith('/letters') && c.opts.method === 'POST'));
  } finally { existingLetters = []; }
});

function placementMatrices(pdf) {
  const zlib = require('node:zlib');
  const buf = Buffer.from(pdf); const ops = [];
  for (let i = buf.indexOf('stream'); i !== -1; i = buf.indexOf('stream', i + 6)) {
    let s = i + 6; if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
    const e = buf.indexOf('endstream', s); if (e === -1) break;
    const chunk = buf.subarray(s, e);
    try { ops.push(zlib.inflateSync(chunk).toString('latin1')); } catch { ops.push(chunk.toString('latin1')); }
  }
  return [...ops.join('\n').matchAll(/([-\d.]+) 0 0 ([-\d.]+) ([-\d.]+) ([-\d.]+) cm/g)].map(m => m.slice(1).map(Number));
}

test('uploaded pages are scaled into the safe zone (0.25 in margins; US also clears the barcode corner)', async () => {
  const src = await PDFDocument.create(); src.addPage([612, 792]).drawText('edge');
  const f = path.join(os.tmpdir(), `s-${randomUUID()}.pdf`); fs.writeFileSync(f, await src.save());
  const attach = JSON.stringify([{ path: f, originalName: 's.pdf' }]);
  for (const [country, minY] of [['CA', 18], ['US', 43.2]]) {
    const o = seed({ body: '', attach }); db.prepare('UPDATE orders SET destination_country = ? WHERE id = ?').run(country, o.id);
    const b = await pg.buildLetterPdf(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id));
    const m = placementMatrices(b.pdf);
    const scale = m.find(x => x[0] < 1 && x[0] > 0.5);
    const move = m.find(x => x[0] === 1 && (x[2] || x[3]));
    assert.ok(scale && scale[0] <= 576 / 612 + 1e-6, `${country} scale ${scale && scale[0]}`);
    assert.ok(move[2] >= 18 - 1e-6 && move[3] >= minY - 1e-6, `${country} offset ${move[2]},${move[3]}`);
  }
});

test('UK and Australia letters are A4 and sent with size a4; a chosen service is sent as the mailing class', async () => {
  const pg2 = createPostGrid({ db, getSetting: (k, f) => ({ postgrid_countries: 'CA,US,GB,AU', services_enabled: JSON.stringify(['US:certified']) })[k] ?? f,
    orderDirPath: () => os.tmpdir(), fetchImpl: fakeFetch });
  for (const cc of ['GB', 'AU']) {
    const o = seed(); db.prepare('UPDATE orders SET destination_country = ? WHERE id = ?').run(cc, o.id);
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id);
    const doc = await PDFDocument.load((await pg2.buildLetterPdf(row)).pdf);
    assert.deepEqual([Math.round(doc.getPage(0).getWidth()), Math.round(doc.getPage(0).getHeight())], [595, 842]);
    calls.length = 0;
    await pg2.submitOrder(row);
    const post = calls.find(c => c.url.endsWith('/letters') && c.opts.method === 'POST');
    assert.equal(post.opts.body.get('size'), 'a4');
    assert.equal(post.opts.body.get('mailingClass'), null);
    const prev = await PDFDocument.load((await pg2.buildPreviewPdf(row)).pdf);
    assert.equal(prev.getPageCount(), 1);
  }
  const us = seed(); db.prepare("UPDATE orders SET destination_country = 'US', certified_mail = 1 WHERE id = ?").run(us.id);
  calls.length = 0;
  await pg2.submitOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(us.id));
  const post = calls.find(c => c.url.endsWith('/letters') && c.opts.method === 'POST');
  assert.equal(post.opts.body.get('mailingClass'), 'certified');
  assert.equal(post.opts.body.get('size'), 'us_letter');
  const search = decodeURIComponent(calls[0].url.split('search=')[1]);
  assert.deepEqual(JSON.parse(search), { 'metadata.orderId': String(us.id) });
  const ex = seed(); db.prepare("UPDATE orders SET destination_country = 'US', express_mail = 1 WHERE id = ?").run(ex.id);
  await assert.rejects(pg2.submitOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(ex.id)), e => e.manual && /express/.test(e.message));
});

test('a TEST-mode letter on a real order never changes its status or reports it as mailed, and can be cleared', async () => {
  liveLetters = false;
  try {
    const o = seed();
    await pg.submitOrder(o);
    let row = db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id);
    assert.equal(row.status, 'paid');                     // customer-facing status untouched
    assert.equal(row.postgrid_mode, 'test');
    letterStatus = 'completed';
    const r = await pg.refreshOrder(row);
    assert.equal(r.mailed, false);                        // no "mailed" email to the customer
    row = db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id);
    assert.equal(row.status, 'paid');
    assert.equal(row.postgrid_status, 'completed');
    pg.clearTestLetter(row);
    row = db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id);
    assert.equal(row.postgrid_letter_id, null);
    assert.equal(pg.eligibility(row), null);              // ready to send for real
  } finally { liveLetters = true; letterStatus = 'ready'; }
});

test('emojis print as colour images (skin tones, variation selectors, ZWJ sequences) and wrap like text', async () => {
  emojiAsked.length = 0;
  const b = await pg.buildLetterPdf(seed({ body: 'Mon cœur ♥️ Reste prêt de moi 🫶🙏🏽🫶❤️❤️❤️\nTon coco\n🩵 👩‍❤️‍👨' }));
  assert.deepEqual(b.warnings, []);
  assert.deepEqual([...new Set(emojiAsked)].sort(), ['1f469-200d-2764-fe0f-200d-1f468', '1f64f-1f3fd', '1fa75', '1faf6', '2665', '2764'].sort());
  const doc = await PDFDocument.load(b.pdf);
  assert.equal(doc.getPageCount(), 1);
  // an emoji image that cannot be fetched sends the order to the manual queue instead of printing a gap
  const pgMissing = createPostGrid({ db, getSetting: (k, f) => f, orderDirPath: () => os.tmpdir(), fetchImpl: fakeFetch, emojiImage: async () => null });
  const m = await pgMissing.buildLetterPdf(seed({ body: 'Hi ❤️' }));
  assert.match(m.warnings.join(' '), /emoji/);
});

test('typed sender countries ("Canada", "États-Unis", "UK") are sent to PostGrid as ISO codes; an unknown one goes to the manual queue', async () => {
  const { countryCodeOf } = require('../postgrid');
  for (const [name, code] of [['Canada', 'CA'], ['canada', 'CA'], ['CA', 'CA'], ['États-Unis', 'US'], ['USA', 'US'], ['UK', 'GB'],
    ['Royaume-Uni', 'GB'], ['France', 'FR'], ['Vietnam', 'VN'], ['Trinidad and Tobago', 'TT'], ['Saint Lucia', 'LC'], ['Narnia', null]]) {
    assert.equal(countryCodeOf(name), code, name);
  }
  const o = seed({ skip: 0 });
  db.prepare("UPDATE orders SET sender_name = 'Tom', sender_street = '9 Rue Cler', sender_city = 'Paris', sender_country = 'France' WHERE id = ?").run(o.id);
  calls.length = 0;
  await pg.submitOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id));
  const from = JSON.parse(calls.filter(c => c.url.endsWith('/contacts'))[1].opts.body);
  assert.equal(from.countryCode, 'FR');
  const bad = seed({ skip: 0 });
  db.prepare("UPDATE orders SET sender_name = 'Tom', sender_street = '1 Road', sender_country = 'Narnia' WHERE id = ?").run(bad.id);
  await assert.rejects(pg.submitOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(bad.id)), e => e.manual && /Narnia/.test(e.message) && /return address/.test(e.message));
});

test('provinces from the checkout list ("QC: Quebec") and typed names ("Québec") reach PostGrid as codes', async () => {
  const o = seed({ skip: 0 });
  db.prepare(`UPDATE orders SET recipient_province = 'QC: Quebec', sender_name = 'Coco', sender_street = '2549 Rue de Alpes',
              sender_city = 'Jonquière', sender_province = 'Québec', sender_postal = 'G7X 9W7', sender_country = 'Canada' WHERE id = ?`).run(o.id);
  calls.length = 0;
  await pg.submitOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id));
  const [to, from] = calls.filter(c => c.url.endsWith('/contacts')).map(c => JSON.parse(c.opts.body));
  assert.equal(to.provinceOrState, 'QC');
  assert.equal(from.provinceOrState, 'QC');
  assert.equal(from.countryCode, 'CA');
});
