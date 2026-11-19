const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createOps, mailTags } = require('../opsAlerts');

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, postgrid_letter_id TEXT, deleted_at TEXT, recipient_name TEXT, recipient_street TEXT,
    letter_type TEXT, paid_at TEXT, created_at TEXT, postgrid_error TEXT, scheduled_date TEXT, content_flags TEXT, content_cleared_at TEXT, addr_check_status TEXT,
    addr_check_note TEXT, stuck_alert_sent_at TEXT, price_cents INTEGER, mailed_at TEXT)`);
  return db;
}
const ago = h => new Date(Date.now() - h * 3600000).toISOString().slice(0, 19).replace('T', ' ');
const add = (db, o) => db.prepare(`INSERT INTO orders (status, recipient_name, letter_type, paid_at, created_at, postgrid_error, scheduled_date, addr_check_status, price_cents)
  VALUES ('paid', ?, ?, ?, ?, ?, ?, ?, 600)`).run(o.name || 'A B', o.type || 'standard', ago(o.age), ago(o.age), o.err || null, o.sched || null, o.addr || null).lastInsertRowid;

test('stuck alert: emails once for orders waiting too long or in error, not for fresh or scheduled ones', async () => {
  const db = makeDb(); const sent = [];
  const ops = createOps({ db, sendOwnerMail: async (s, t) => sent.push({ s, t }), contentHeld: () => false });
  const old = add(db, { age: 30 }); add(db, { age: 2 });
  const santa = add(db, { age: 14, type: 'santa' });
  const err = add(db, { age: 3, err: 'MANUAL: Recipient address failed verification' });
  add(db, { age: 100, sched: '2999-01-01' });
  const r = await ops.stuckJob();
  assert.equal(r.sent, 3);
  assert.equal(sent.length, 1);
  for (const id of [old, santa, err]) assert.match(sent[0].t, new RegExp('#' + id + '\\b'));
  assert.equal((await ops.stuckJob()).sent, 0);          // each order is mentioned once
  assert.equal(sent.length, 1);
});

test('daily summary counts paid orders, waiting orders and unverified addresses', () => {
  const db = makeDb();
  const ops = createOps({ db, sendOwnerMail: async () => {}, contentHeld: () => false });
  add(db, { age: 5 }); add(db, { age: 30, addr: 'unverified' });
  const t = ops.summaryText();
  assert.match(t, /Paid orders: 1 \(\$6\.00\)/);
  assert.match(t, /2 paid orders not yet sent/);
  assert.match(t, /1 with an address PostGrid could not verify/);
});

test('mail tags spot prison, PO Box, rural and care-of addresses', () => {
  const keys = o => mailTags(o).map(t => t.key);
  assert.deepEqual(keys({ recipient_name: 'Nicholas Thew Min Number 547570', recipient_street: 'P.O. Box 666' }).sort(), ['facility', 'pobox']);
  assert.deepEqual(keys({ recipient_name: 'Ada', recipient_street: 'RR 2 Site 4' }), ['rural']);
  assert.deepEqual(keys({ recipient_name: 'Ada', recipient_street: 'c/o Sunrise Nursing Home\n5 Main St' }), ['careof']);
  assert.deepEqual(keys({ recipient_name: 'Ada', recipient_street: '1 Main St' }), []);
});
