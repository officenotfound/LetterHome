#!/usr/bin/env node
'use strict';
// End-to-end check of the PostGrid integration against PostGrid's real API, in TEST mode only.
// It runs our own postgrid.js code (the same code the admin "Send via PostGrid" button uses) on a
// throwaway database, never orders.db. Test letters are never printed, mailed or charged.
//
//   cd /var/letterhome && node scripts/postgrid-selftest.js
// Once .env holds the live key, pass a test key instead (it is not echoed):
//   read -rsp "PostGrid TEST key: " K && echo && POSTGRID_TEST_KEY="$K" node scripts/postgrid-selftest.js; unset K
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const key = (process.env.POSTGRID_TEST_KEY || process.env.POSTGRID_API_KEY || '').trim();
if (!key.startsWith('test_')) {
  console.error('Refusing to run: this self-test needs a PostGrid TEST key (starts with test_).');
  console.error('Run:  read -rsp "PostGrid TEST key: " K && echo && POSTGRID_TEST_KEY="$K" node scripts/postgrid-selftest.js; unset K');
  process.exit(2);
}
process.env.POSTGRID_API_KEY = key;
const tmpDb = path.join(os.tmpdir(), `lh-selftest-${randomUUID()}.db`);
process.env.DB_PATH = tmpDb;

const db = require('../db');
const { createPostGrid } = require('../postgrid');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const settings = {
  postgrid_countries: 'CA,US,GB,AU',
  services_enabled: JSON.stringify(['CA:registered', 'CA:express', 'US:certified', 'US:express']),
};
const pg = createPostGrid({ db, getSetting: (k, f) => settings[k] ?? f, orderDirPath: () => os.tmpdir() });

const API = 'https://api.postgrid.com/print-mail/v1';
const raw = async (method, route, body) => {
  const res = await fetch(API + route, { method, headers: { 'x-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const row = id => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

const created = [];   // letter ids to cancel at the end
const tempFiles = [];
const results = [];
async function step(name, fn) {
  if (process.stdout.isTTY) process.stdout.write(`… ${name}\r`);
  try {
    const note = await fn();
    results.push({ ok: true, name, note });
    console.log(`PASS  ${name}${note ? `  (${note})` : ''}`);
  } catch (e) {
    results.push({ ok: false, name, note: e.message });
    console.log(`FAIL  ${name}  -> ${e.message}`);
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

function order(fields) {
  const r = db.prepare(`INSERT INTO orders (customer_email, recipient_name, recipient_street, recipient_city, recipient_province,
      recipient_postal, destination_country, price_cents, status, status_token, letter_body, attachment_info, skip_return,
      sender_name, sender_street, sender_city, sender_province, sender_postal, sender_country, colour_printing, paid_at)
    VALUES (?,?,?,?,?,?,?,?,'paid',?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(
    'selftest@letterhome.ca', fields.name, fields.street, fields.city, fields.province || null, fields.postal || null,
    fields.country, 600, randomUUID(), fields.body ?? 'Self-test letter. Café, cœur ♥️ 🙏🏽', fields.attach || '[]',
    fields.skip ? 1 : 0, fields.sName || 'Letterhome Self Test', fields.sStreet || '1515 Discovery St', fields.sCity || 'Vancouver',
    fields.sProvince || 'BC', fields.sPostal || 'V6R 4K5', fields.sCountry || 'Canada', fields.colour ? 1 : 0);
  return row(r.lastInsertRowid);
}

(async () => {
  console.log(`PostGrid self-test (TEST mode, key ${key.slice(0, 9)}…)\n`);
  let main;

  await step('Typed Canadian letter: emoji, accents, colour, "QC: Quebec", typed sender country "Canada"', async () => {
    main = order({ name: 'Nathalie Test', street: '2549 Rue de Alpes', city: 'Jonquière', province: 'QC: Quebec', postal: 'G7X 9W7', country: 'CA',
      sProvince: 'Québec', sCity: 'Jonquière', sStreet: '2549 Rue de Alpes', sPostal: 'G7X 9W7', sCountry: 'Canada', colour: true });
    const r = await pg.submitOrder(main);
    created.push(r.letter.id);
    const L = await raw('GET', `/letters/${r.letter.id}`);
    expect(L.live === false, 'letter is not a test letter');
    expect(L.status === 'ready', `status ${L.status}`);
    expect(L.color === true, 'colour not set');
    expect(L.addressPlacement === 'top_first_page', `placement ${L.addressPlacement}`);
    expect((L.size || 'us_letter') === 'us_letter', `size ${L.size}`);
    expect(L.metadata?.orderId === String(main.id), 'metadata.orderId missing');
    expect(L.to?.provinceOrState === 'QC', `recipient province "${L.to?.provinceOrState}"`);
    expect(L.to?.countryCode === 'CA' && L.from?.countryCode === 'CA', 'country codes');
    expect(L.from?.provinceOrState === 'QC', `sender province "${L.from?.provinceOrState}"`);
    const o = row(main.id);
    expect(o.status === 'paid' && o.postgrid_mode === 'test', `order status ${o.status}/${o.postgrid_mode} (test letters must not move the order)`);
    return `${L.id}, ${L.pageCount ?? '?'} page(s)`;
  });

  await step('PostGrid preview PDF becomes available', async () => {
    const id = row(main.id)?.postgrid_letter_id; expect(id, 'no letter');
    for (let i = 0; i < 10; i++) { const L = await raw('GET', `/letters/${id}`); if (L.url) return 'url present'; await sleep(3000); }
    throw new Error('no preview url after 30 s');
  });

  await step('Duplicate guard: a second send of the same order reuses the existing letter (metadata.orderId search)', async () => {
    const first = row(main.id).postgrid_letter_id;
    db.prepare('UPDATE orders SET postgrid_letter_id = NULL, postgrid_mode = NULL, postgrid_status = NULL WHERE id = ?').run(main.id);
    let r;
    for (let i = 0; i < 4; i++) { r = await pg.submitOrder(row(main.id)); if (r.reused) break; created.push(r.letter.id); await sleep(4000); }
    expect(r.reused && r.letter.id === first, r.reused ? `reused a different letter ${r.letter.id}` : 'search did not find the existing letter (a duplicate was created)');
    return 'no duplicate created';
  });

  await step('Status sync reads the letter and leaves the real order untouched', async () => {
    const r = await pg.refreshOrder(row(main.id));
    expect(r.test === true && r.mailed === false, 'test letter reported as mailed');
    expect(row(main.id).status === 'paid', 'order status changed');
    return `PostGrid status ${r.status}`;
  });

  await step('Test letter can be advanced through every status', async () => {
    const seen = [];
    for (let i = 0; i < 6; i++) {
      const r = await pg.progressTestLetter(row(main.id));
      seen.push(r.status);
      if (r.status === 'completed') break;
    }
    expect(seen.at(-1) === 'completed', `ended at ${seen.at(-1)}`);
    expect(row(main.id).status === 'paid', 'order status changed during test progression');
    return seen.join(' → ');
  });

  await step('PDF-only letter uses a blank address page, then cancels cleanly', async () => {
    const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([612, 792]).drawText('Self-test PDF page 1', { x: 72, y: 700, size: 14, font: f });
    doc.addPage([595, 842]).drawText('Self-test PDF page 2 (A4 source)', { x: 72, y: 700, size: 14, font: f });
    const file = path.join(os.tmpdir(), `lh-selftest-${randomUUID()}.pdf`); fs.writeFileSync(file, await doc.save()); tempFiles.push(file);
    const o = order({ name: 'Pdf Test', street: '100 Queen St W', city: 'Toronto', province: 'ON', postal: 'M5H 2N2', country: 'CA', body: '',
      attach: JSON.stringify([{ path: file, originalName: 'selftest.pdf' }]) });
    const r = await pg.submitOrder(o); created.push(r.letter.id);
    const L = await raw('GET', `/letters/${r.letter.id}`);
    expect(L.addressPlacement === 'insert_blank_page', `placement ${L.addressPlacement}`);
    await pg.cancelOrder(row(o.id));
    const C = await raw('GET', `/letters/${r.letter.id}`);
    expect(C.status === 'cancelled', `after cancel: ${C.status}`);
    return 'blank address page + cancel OK';
  });

  await step('Address verification reports "failed" status (our guard sends such orders to the manual queue)', async () => {
    const c = await raw('POST', '/contacts', { firstName: 'Fail', addressLine1: '1 Nowhere Rd', countryCode: 'CA', description: 'test failed' });
    expect(c.addressStatus === 'failed', `addressStatus ${c.addressStatus}`);
    return 'addressStatus = failed';
  });

  for (const [cc, addr] of [
    ['US', { name: 'Jane Test', street: '456 Oak Ave', city: 'Springfield', province: 'IL', postal: '62702' }],
    ['GB', { name: 'John Test', street: '10 Downing Street', city: 'London', postal: 'SW1A 2AA' }],
    ['AU', { name: 'Mia Test', street: '123 George Street', city: 'Sydney', province: 'NSW', postal: '2000' }],
  ]) {
    await step(`${cc} letter is accepted with the right page size`, async () => {
      const o = order({ ...addr, country: cc });
      const r = await pg.submitOrder(o); created.push(r.letter.id);
      const L = await raw('GET', `/letters/${r.letter.id}`);
      const want = cc === 'US' ? 'us_letter' : 'a4';
      expect((L.size || 'us_letter') === want, `size ${L.size}, expected ${want}`);
      return `size ${L.size || 'us_letter'}`;
    });
  }

  for (const [cc, svc, addr] of [
    ['CA', 'registered', { name: 'Reg Test', street: '100 Queen St W', city: 'Toronto', province: 'ON', postal: 'M5H 2N2' }],
    ['CA', 'express', { name: 'Exp Test', street: '100 Queen St W', city: 'Toronto', province: 'ON', postal: 'M5H 2N2' }],
    ['US', 'certified', { name: 'Cert Test', street: '456 Oak Ave', city: 'Springfield', province: 'IL', postal: '62702' }],
    ['US', 'express', { name: 'Exp Test', street: '456 Oak Ave', city: 'Springfield', province: 'IL', postal: '62702' }],
  ]) {
    await step(`Extra service ${cc} ${svc} is accepted by PostGrid (mailingClass)`, async () => {
      const o = order({ ...addr, country: cc });
      db.prepare(`UPDATE orders SET ${svc === 'registered' ? 'registered_mail' : svc === 'certified' ? 'certified_mail' : 'express_mail'} = 1 WHERE id = ?`).run(o.id);
      const r = await pg.submitOrder(row(o.id)); created.push(r.letter.id);
      const L = await raw('GET', `/letters/${r.letter.id}`);
      return `mailingClass ${L.mailingClass}${L.extraService ? `, extraService ${L.extraService}` : ''}`;
    });
  }

  // Clean up: cancel every test letter still waiting.
  for (const id of new Set(created)) {
    try { const L = await raw('GET', `/letters/${id}`); if (L.status === 'ready') await raw('DELETE', `/letters/${id}`); } catch {}
  }
  for (const f of [tmpDb, ...tempFiles]) { try { fs.unlinkSync(f); } catch {} }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.${failed.length ? ' Paste the FAIL lines to Claude.' : ' The PostGrid integration works end to end.'}`);
  process.exit(failed.length ? 1 : 0);
})();
