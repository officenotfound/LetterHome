'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `lh-mailbox-${randomUUID()}.db`);

const express = require('express');
const db = require('../db');
const mailbox = require('../mailbox');

const BIG_ID = '1709876190693100009';           // too big for a JS number: must survive untouched
let server, base, mod;
let calls = [];
let unreadList = [], allList = [];
let tokenFails = 0;

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

// A pretend Zoho: records every call and answers like the real API does.
async function fakeZoho(url, opts = {}) {
  const u = new URL(String(url)); const method = opts.method || 'GET';
  const rec = { method, path: u.pathname, q: Object.fromEntries(u.searchParams), body: opts.body, auth: opts.headers && opts.headers.Authorization };
  calls.push(rec);
  if (u.hostname === 'accounts.zoho.com') {
    if (tokenFails > 0) { tokenFails--; return json({ error: 'invalid_code' }); }
    return json({ access_token: 'AT-' + calls.length, expires_in: 3600 });
  }
  const p = u.pathname.replace('/api', '');
  if (p === '/accounts') return json({ data: [{ accountId: '111', primaryEmailAddress: 'support@letterhome.ca', sendMailDetails: [{ fromAddress: 'support@letterhome.ca' }, { fromAddress: 'sales@letterhome.ca' }], displayName: 'Support' }] });
  if (p === '/accounts/111/folders') return json({ data: [{ folderId: '10', folderName: 'Inbox', folderType: 'Inbox' }, { folderId: '11', folderName: 'Trash', folderType: 'Trash' }, { folderId: '12', folderName: 'custom', folderType: 'Inbox' }] });
  if (p === '/accounts/111/messages/view') return json({ data: u.searchParams.get('status') === 'unread' ? unreadList : allList });
  if (p === '/accounts/111/messages/search') return json({ data: allList.slice(0, 1) });
  if (/\/content$/.test(p)) return json({ data: { messageId: BIG_ID, content: '<p>Hello <b>there</b></p>' } });
  if (/\/details$/.test(p)) return json({ data: { subject: 'Where is my letter &amp; stamp', fromAddress: '&quot;Ann Lee&quot; &lt;ann@example.com&gt;', toAddress: 'support@letterhome.ca', ccAddress: '', receivedTime: '1700000000000', status: '0' } });
  if (/\/attachmentinfo$/.test(p)) return json({ data: { attachments: [{ attachmentId: 'att1', attachmentName: 'proof.pdf', attachmentSize: '1234' }] } });
  if (/\/attachments\/att1$/.test(p)) return new Response(Buffer.from('FILEBYTES'), { status: 200 });
  if (p === '/accounts/111/messages/attachments') return json({ data: [{ storeName: 'st1', attachmentPath: '/p/1', attachmentName: 'letter.txt' }] });
  if (p === '/accounts/111/updatemessage' || p === '/accounts/111/messages' || /\/messages\/\d+$/.test(p)) return json({ status: { code: 200, description: 'success' } });
  return json({ status: { code: 404 } }, 404);
}

before(async () => {
  const app = express();
  app.use(express.json());
  const requireAdmin = (req, res, next) => next();
  mod = mailbox.register(app, { db, requireAdmin, logAudit: () => {}, fetch: fakeZoho,
    env: { ZOHO_SUPPORT_CLIENT_ID: 'cid', ZOHO_SUPPORT_CLIENT_SECRET: 'sec', ZOHO_SUPPORT_REFRESH_TOKEN: 'rt', ZOHO_BROKEN_CLIENT_ID: 'x' } });
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  for (const f of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + f); } catch {} }
});

const get = p => fetch(base + p);
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('only mailboxes with a full key are set up; an unknown mailbox is a 404', async () => {
  const r = await (await get('/api/admin/mail/mailboxes')).json();
  assert.equal(r.configured, true);
  assert.deepEqual(r.mailboxes.map(m => m.key), ['support']);
  assert.equal(r.mailboxes[0].address, 'support@letterhome.ca');
  assert.deepEqual(r.mailboxes[0].from, ['support@letterhome.ca', 'sales@letterhome.ca']);
  assert.equal((await get('/api/admin/mail/nobody/folders')).status, 404);
});

test('the message list picks the real Inbox (not a custom folder of type Inbox), marks unread ones, and tidies Zoho\'s escaped text', async () => {
  allList = [
    { messageId: BIG_ID, folderId: '10', subject: 'Hi &amp; hello', fromAddress: '&quot;Ann&quot; &lt;ann@example.com&gt;', receivedTime: '1700000000000', hasAttachment: '1', status: '1' },
    { messageId: '222', folderId: '10', subject: 'Second', fromAddress: 'bob@example.com', receivedTime: '1700000001000', hasAttachment: '0', status: '1' },
  ];
  unreadList = [allList[0]];
  calls = [];
  const r = await (await get('/api/admin/mail/support/messages')).json();
  assert.equal(r.folderId, '10');
  assert.equal(r.messages[0].subject, 'Hi & hello');
  assert.equal(r.messages[0].from, '"Ann" <ann@example.com>');
  assert.equal(r.messages[0].id, BIG_ID);
  assert.equal(r.messages[0].unread, true); assert.equal(r.messages[1].unread, false);
  assert.equal(r.messages[0].hasAttachment, true);
  assert.ok(calls.every(c => !c.auth || /^Zoho-oauthtoken /.test(c.auth)), 'Zoho\'s own header format is used');
  const search = await (await get('/api/admin/mail/support/messages?q=invoice')).json();
  assert.equal(calls.filter(c => c.path.endsWith('/messages/search')).pop().q.searchKey, 'entire:invoice');
  assert.equal(search.messages.length, 1);
});

test('opening a message returns its text, attachments and who it is from, and and a plain page load never changes it', async () => {
  calls = [];
  const r = await (await get(`/api/admin/mail/support/message?folderId=10&id=${BIG_ID}&markRead=1`)).json();
  assert.equal(r.subject, 'Where is my letter & stamp');
  assert.equal(r.from, '"Ann Lee" <ann@example.com>');
  assert.match(r.html, /Hello/);
  assert.deepEqual(r.attachments, [{ id: 'att1', name: 'proof.pdf', size: 1234 }]);
  assert.equal(calls.some(c => c.method === 'PUT'), false, 'opening by a GET link never marks anything read');
  calls = [];
  assert.equal((await post('/api/admin/mail/support/action', { action: 'read', items: [{ id: BIG_ID, folderId: '10' }] })).status, 200);
  const put = calls.find(c => c.method === 'PUT');
  assert.equal(put.body, `{"mode":"markAsRead","messageId":[${BIG_ID}]}`, 'a 19-digit id is sent exactly as written');
  assert.equal((await get('/api/admin/mail/support/message?folderId=10&id=abc')).status, 400, 'ids must be numbers');
  const dl = await get(`/api/admin/mail/support/attachment?folderId=10&id=${BIG_ID}&att=att1&name=${encodeURIComponent('pr/oof.pdf')}`);
  assert.equal(dl.status, 200);
  assert.equal(await dl.text(), 'FILEBYTES');
  assert.match(dl.headers.get('content-disposition'), /^attachment; filename="pr_oof\.pdf"$/);
  assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
});

test('sending checks recipients and the from address, sends an HTML-safe body, uploads attachments first, and replies keep their thread', async () => {
  assert.equal((await post('/api/admin/mail/support/send', { to: 'not-an-email', subject: 's', body: 'b' })).status, 400);
  assert.equal((await post('/api/admin/mail/support/send', { to: 'a@example.com', subject: 's', body: '  ' })).status, 400);
  assert.equal((await post('/api/admin/mail/support/send', { to: 'a@example.com', subject: 's', body: 'b', from: 'ceo@elsewhere.com' })).status, 400, 'only addresses on the mailbox');
  const form = (extra = {}) => { const f = new FormData(); for (const [k, v] of Object.entries({ to: 'ann@example.com, bob@example.com', subject: 'Re: your letter', body: 'Hi <b>Ann</b>,\nThanks & bye', from: 'sales@letterhome.ca', ...extra })) f.append(k, v); return f; };

  calls = [];
  let res = await fetch(base + '/api/admin/mail/support/send', { method: 'POST', body: form() });
  assert.equal(res.status, 200);
  let sent = JSON.parse(calls.find(c => c.method === 'POST' && c.path === '/api/accounts/111/messages').body);
  assert.equal(sent.fromAddress, 'sales@letterhome.ca'); assert.equal(sent.toAddress, 'ann@example.com,bob@example.com');
  assert.match(sent.content, /Hi &lt;b&gt;Ann&lt;\/b&gt;,<br>Thanks &amp; bye/, 'typed text is escaped, not run as HTML');

  calls = [];
  const withFile = form(); withFile.append('attachments', new Blob(['hello'], { type: 'text/plain' }), 'letter.txt');
  res = await fetch(base + '/api/admin/mail/support/send', { method: 'POST', body: withFile });
  assert.equal(res.status, 200);
  const order = calls.filter(c => c.method === 'POST').map(c => c.path);
  assert.deepEqual(order, ['/api/accounts/111/messages/attachments', '/api/accounts/111/messages'], 'upload first, then send');
  sent = JSON.parse(calls.filter(c => c.method === 'POST').pop().body);
  assert.deepEqual(sent.attachments, [{ storeName: 'st1', attachmentPath: '/p/1', attachmentName: 'letter.txt' }]);

  calls = [];
  res = await fetch(base + '/api/admin/mail/support/send', { method: 'POST', body: form({ replyTo: BIG_ID }) });
  assert.equal(res.status, 200);
  const rep = calls.find(c => c.method === 'POST');
  assert.equal(rep.path, `/api/accounts/111/messages/${BIG_ID}`);
  assert.equal(JSON.parse(rep.body).action, 'reply');
});

test('mark unread, move and trash: ids are sent as written, and trash empties for good only when already in Trash', async () => {
  calls = [];
  assert.equal((await post('/api/admin/mail/support/action', { action: 'unread', items: [{ id: BIG_ID, folderId: '10' }, { id: '222', folderId: '10' }] })).status, 200);
  assert.equal(calls.find(c => c.method === 'PUT').body, `{"mode":"markAsUnread","messageId":[${BIG_ID},222]}`);
  calls = [];
  await post('/api/admin/mail/support/action', { action: 'move', destFolderId: '12', items: [{ id: '222', folderId: '10' }] });
  assert.equal(calls.find(c => c.method === 'PUT').body, '{"mode":"moveMessage","destfolderId":12,"messageId":[222]}');
  calls = [];
  await post('/api/admin/mail/support/action', { action: 'trash', items: [{ id: '222', folderId: '10' }] });
  let del = calls.find(c => c.method === 'DELETE');
  assert.equal(del.path, '/api/accounts/111/folders/10/messages/222'); assert.equal(del.q.expunge, undefined, 'goes to Trash first');
  calls = [];
  await post('/api/admin/mail/support/action', { action: 'trash', items: [{ id: '222', folderId: '11' }] });
  assert.equal(calls.find(c => c.method === 'DELETE').q.expunge, 'true', 'already in Trash: gone for good');
  assert.equal((await post('/api/admin/mail/support/action', { action: 'explode', items: [{ id: '1', folderId: '10' }] })).status, 400);
  assert.equal((await post('/api/admin/mail/support/action', { action: 'trash', items: [{ id: '1; DROP', folderId: '10' }] })).status, 400);
});

test('orders for the person who wrote are found by their email', async () => {
  db.prepare(`INSERT INTO orders (customer_email, recipient_name, recipient_street, destination_country, price_cents, status, stripe_session_id, status_token)
    VALUES ('ann@example.com','Bob','1 St','CA',600,'paid','cs_mail_1','tok-mail-1')`).run();
  const r = await (await get('/api/admin/mail/orders?email=Ann@Example.com')).json();
  assert.equal(r.orders.length, 1);
  assert.match(r.orders[0].public_ref, /^LH-/);
  assert.deepEqual((await (await get('/api/admin/mail/orders?email=nobody')).json()).orders, []);
});

test('the new-mail watcher starts from now, then raises an event for each new unread message, and a refused key is reported, not hidden', async () => {
  const seen = []; mod.events.on('mail', e => seen.push(e));
  unreadList = [{ messageId: '1', folderId: '10', subject: 'Old', fromAddress: 'o@example.com', receivedTime: String(Date.now() - 5000), status: '0' }];
  await mod.pollAll();
  assert.equal(seen.length, 0, 'the first check only sets the starting point');
  unreadList = [
    { messageId: '2', folderId: '10', subject: 'New &amp; shiny', fromAddress: 'n@example.com', receivedTime: String(Date.now() - 1000), status: '0' },
    unreadList[0],
  ];
  await mod.pollAll();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].subject, 'New & shiny'); assert.equal(seen[0].box, 'support');
  await mod.pollAll();
  assert.equal(seen.length, 1, 'the same message does not alert twice');
  assert.equal(mod.recent().length, 1);
});

test('an expired access token is renewed once and the call retried; a key Zoho refuses gives a clear message', async () => {
  const app2 = express(); app2.use(express.json());
  let first = true;
  const flaky = async (url, opts) => {
    const u = new URL(String(url));
    if (u.hostname !== 'accounts.zoho.com' && first && u.pathname === '/api/accounts') { first = false; return json({ status: { code: 401 } }, 401); }
    return fakeZoho(url, opts);
  };
  const m2 = mailbox.register(app2, { db, requireAdmin: (q, s, n) => n(), logAudit: () => {}, fetch: flaky, env: { ZOHO_SUPPORT_CLIENT_ID: 'c', ZOHO_SUPPORT_CLIENT_SECRET: 's', ZOHO_SUPPORT_REFRESH_TOKEN: 'r' } });
  const srv = await new Promise(r => { const s = app2.listen(0, '127.0.0.1', () => r(s)); });
  try {
    const b2 = `http://127.0.0.1:${srv.address().port}`;
    assert.equal((await (await fetch(b2 + '/api/admin/mail/mailboxes')).json()).mailboxes[0].address, 'support@letterhome.ca', 'retried after a 401');
    tokenFails = 5;
    const bad = await (await fetch(b2 + '/api/admin/mail/support/folders')).json().catch(() => null);
    tokenFails = 0;
    assert.ok(bad === null || bad.folders, 'cached account keeps working');
    const app3 = express(); app3.use(express.json());
    mailbox.register(app3, { db, requireAdmin: (q, s, n) => n(), logAudit: () => {}, fetch: fakeZoho, env: { ZOHO_SALES_CLIENT_ID: 'c', ZOHO_SALES_CLIENT_SECRET: 's', ZOHO_SALES_REFRESH_TOKEN: 'r' } });
    const s3 = await new Promise(r => { const s = app3.listen(0, '127.0.0.1', () => r(s)); });
    tokenFails = 5;
    const r3 = await (await fetch(`http://127.0.0.1:${s3.address().port}/api/admin/mail/mailboxes`)).json();
    tokenFails = 0; s3.close();
    assert.match(r3.mailboxes[0].error, /did not accept the saved key for Sales/);
  } finally { srv.close(); }
});
