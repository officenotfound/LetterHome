'use strict';
// Mailbox inside the admin: reads and sends the Zoho mailboxes (jeff, sales, support) through Zoho's Mail API.
// Keys live in the server environment as ZOHO_<NAME>_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN (see scripts/zoho-get-keys.sh).
// Nothing here is ever sent to a customer on its own: every email is written and sent by the owner.

const { EventEmitter } = require('node:events');
const multer = require('multer');

const API = 'https://mail.zoho.com/api';
const TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';

class MailError extends Error { constructor(msg, status) { super(msg); this.status = status || 502; } }

function discoverBoxes(env) {
  const boxes = [];
  for (const k of Object.keys(env || {})) {
    const m = k.match(/^ZOHO_([A-Z0-9]+)_REFRESH_TOKEN$/);
    if (!m) continue;
    const L = m[1], id = env[`ZOHO_${L}_CLIENT_ID`], secret = env[`ZOHO_${L}_CLIENT_SECRET`];
    if (!env[k] || !id || !secret) continue;
    boxes.push({ key: L.toLowerCase(), label: L[0] + L.slice(1).toLowerCase(), clientId: id, clientSecret: secret, refreshToken: env[k] });
  }
  return boxes.sort((a, b) => a.key.localeCompare(b.key));
}

const decodeEntities = s => String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const digits = v => { const s = String(v ?? ''); if (!/^\d{1,25}$/.test(s)) throw new MailError('Bad message id.', 400); return s; };
const isEmail = s => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(s);

function normMsg(m, unreadSet) {
  const id = String(m.messageId);
  const att = m.hasAttachment;
  return {
    id, folderId: String(m.folderId),
    subject: decodeEntities(m.subject) || '(no subject)',
    from: decodeEntities(m.fromAddress || m.sender || ''), to: decodeEntities(m.toAddress || ''),
    summary: decodeEntities(m.summary || '').slice(0, 200),
    at: Number(m.receivedTime || m.receivedtime || m.sentDateInGMT) || null,
    hasAttachment: att === true || String(att) === '1' || String(att) === 'true',
    unread: unreadSet ? unreadSet.has(id) : (String(m.status) === '0' || String(m.status) === 'unread'),
  };
}

// One Zoho mailbox: keeps its access token fresh and signs every call.
function makeMailbox(cfg, fetchFn) {
  let access = null, expires = 0, info = null, folders = null;
  async function token(force) {
    if (!force && access && Date.now() < expires - 60000) return access;
    const r = await fetchFn(TOKEN_URL, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret }) });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) throw new MailError(`Zoho did not accept the saved key for ${cfg.label}${j.error ? ' (' + j.error + ')' : ''}. Make a new one with scripts/zoho-get-keys.sh.`, 502);
    access = j.access_token; expires = Date.now() + (Number(j.expires_in) || 3600) * 1000;
    return access;
  }
  async function call(method, path, o = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const t = await token(attempt > 0);
      const url = new URL(API + path);
      for (const [k, v] of Object.entries(o.query || {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
      const headers = { Authorization: 'Zoho-oauthtoken ' + t, Accept: o.raw ? 'application/octet-stream' : 'application/json' };
      let body;
      if (o.rawJson) { headers['Content-Type'] = 'application/json'; body = o.rawJson; }       // ids are 19 digits: sent as written, never through a JS number
      else if (o.json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(o.json); }
      else if (o.form) body = o.form;
      const r = await fetchFn(url, { method, headers, body });
      if (r.status === 401 && attempt === 0) continue;
      if (o.raw && r.ok) return r;
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new MailError((j && ((j.data && j.data.errorCode) || (j.status && j.status.description))) ? `Zoho said: ${(j.data && j.data.errorCode) || j.status.description}` : `Zoho answered ${r.status}`, r.status === 429 ? 429 : 502);
      return j;
    }
    throw new MailError('Zoho refused the saved key.', 502);
  }
  async function account() {
    if (info) return info;
    const j = await call('GET', '/accounts');
    const a = j && j.data && j.data[0];
    if (!a) throw new MailError(`No mail account found for ${cfg.label}.`, 502);
    const from = new Set([a.primaryEmailAddress, a.mailboxAddress, ...(a.sendMailDetails || []).map(s => s.fromAddress)].filter(Boolean));
    info = { accountId: String(a.accountId), address: a.primaryEmailAddress || a.mailboxAddress || '', name: a.displayName || a.accountDisplayName || cfg.label, from: [...from] };
    return info;
  }
  async function folderList() {
    if (folders) return folders;
    const a = await account();
    const j = await call('GET', `/accounts/${a.accountId}/folders`);
    folders = ((j && j.data) || []).map(f => ({ id: String(f.folderId), name: f.folderName, type: f.folderType, path: f.path }));
    return folders;
  }
  const folderBy = async name => { const fs = await folderList(); return fs.find(f => String(f.name).toLowerCase() === name) || fs.find(f => String(f.type).toLowerCase() === name) || null; };
  return { key: cfg.key, label: cfg.label, call, account, folderList, folderBy, state: { unread: 0, error: null } };
}

function register(app, deps) {
  const { db, requireAdmin, logAudit } = deps;
  const env = deps.env || process.env;
  const fetchFn = deps.fetch || fetch;
  const boxes = discoverBoxes(env).map(c => makeMailbox(c, fetchFn));
  const byKey = Object.fromEntries(boxes.map(b => [b.key, b]));
  const events = new EventEmitter();
  const recent = [];                                           // new-mail events from the last day, for the bell
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 30 } });

  const getBox = (req, res) => { const b = byKey[String(req.params.box || '').toLowerCase()]; if (!b) { res.status(404).json({ error: 'That mailbox is not set up.' }); return null; } return b; };
  const wrap = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (e) { const s = e instanceof MailError ? e.status : 500; if (s === 500) console.error('[mail]', e.message); res.status(s === 429 ? 429 : s === 400 ? 400 : 502).json({ error: e instanceof MailError ? e.message : 'The mailbox could not be reached.' }); }
  };
  const cursorGet = k => { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get('mail_cursor_' + k); return r ? Number(r.value) : 0; };
  const cursorSet = (k, v) => db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('mail_cursor_' + k, String(v));

  // ---- which mailboxes exist, with unread counts ----
  app.get('/api/admin/mail/mailboxes', requireAdmin, wrap(async (req, res) => {
    const out = [];
    for (const b of boxes) {
      let address = '', from = [];
      try { const a = await b.account(); address = a.address; from = a.from; b.state.error = null; } catch (e) { b.state.error = e.message; }
      out.push({ key: b.key, label: b.label, address, from, unread: b.state.unread, error: b.state.error,
        watch: { checkedAt: b.state.checkedAt || 0, cursor: b.state.cursor || 0, listed: b.state.listed || 0, parsed: b.state.parsed || 0, pollError: b.state.pollError || null } });
    }
    res.json({ configured: boxes.length > 0, mailboxes: out });
  }));

  app.get('/api/admin/mail/:box/folders', requireAdmin, wrap(async (req, res) => {
    const b = getBox(req, res); if (!b) return;
    res.json({ folders: await b.folderList() });
  }));

  // ---- message list (a folder, or a search) ----
  app.get('/api/admin/mail/:box/messages', requireAdmin, wrap(async (req, res) => {
    const b = getBox(req, res); if (!b) return;
    const a = await b.account();
    const start = Math.max(1, parseInt(req.query.start, 10) || 1), limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const q = String(req.query.q || '').trim().slice(0, 100);
    let folderId = String(req.query.folderId || '');
    if (!q && !/^\d+$/.test(folderId)) { const inbox = await b.folderBy('inbox'); folderId = inbox ? inbox.id : ''; }
    let list;
    if (q) {
      const key = /^[a-z]+:/i.test(q) ? q : `entire:${q}`;
      const j = await b.call('GET', `/accounts/${a.accountId}/messages/search`, { query: { searchKey: key, start, limit, receivedTime: 0 } });
      list = ((j && j.data) || []).map(m => normMsg(m, null));
    } else {
      const unreadOnly = req.query.filter === 'unread';
      const j = await b.call('GET', `/accounts/${a.accountId}/messages/view`, { query: { folderId, start, limit, status: unreadOnly ? 'unread' : 'all', sortBy: 'date' } });
      let unreadSet = null;
      if (!unreadOnly) {
        const u = await b.call('GET', `/accounts/${a.accountId}/messages/view`, { query: { folderId, status: 'unread', limit: 200 } }).catch(() => null);
        unreadSet = new Set(((u && u.data) || []).map(m => String(m.messageId)));
      }
      list = ((j && j.data) || []).map(m => normMsg(m, unreadSet || { has: () => true }));
    }
    res.json({ folderId, messages: list, next: list.length === limit ? start + limit : null });
  }));

  // ---- one message ----
  app.get('/api/admin/mail/:box/message', requireAdmin, wrap(async (req, res) => {
    const b = getBox(req, res); if (!b) return;
    const a = await b.account(); const id = digits(req.query.id), fid = digits(req.query.folderId);
    const base = `/accounts/${a.accountId}/folders/${fid}/messages/${id}`;
    const [content, details, atts] = await Promise.all([
      b.call('GET', base + '/content'), b.call('GET', base + '/details'), b.call('GET', base + '/attachmentinfo').catch(() => null),
    ]);
    const d = (details && details.data) || {};
    const m = normMsg({ ...d, messageId: id, folderId: fid }, null);
    if (req.query.markRead === '1' && m.unread) {
      try { await b.call('PUT', `/accounts/${a.accountId}/updatemessage`, { rawJson: `{"mode":"markAsRead","messageId":[${id}]}` }); m.unread = false; } catch {}
    }
    res.json({
      ...m, cc: decodeEntities(d.ccAddress || ''), html: String((content && content.data && content.data.content) || ''),
      attachments: (((atts && atts.data && atts.data.attachments) || [])).map(x => ({ id: String(x.attachmentId), name: x.attachmentName, size: Number(x.attachmentSize) || 0 })),
    });
  }));

  app.get('/api/admin/mail/:box/attachment', requireAdmin, wrap(async (req, res) => {
    const b = getBox(req, res); if (!b) return;
    const a = await b.account();
    const r = await b.call('GET', `/accounts/${a.accountId}/folders/${digits(req.query.folderId)}/messages/${digits(req.query.id)}/attachments/${encodeURIComponent(String(req.query.att || ''))}`, { raw: true });
    const buf = Buffer.from(await r.arrayBuffer());
    const name = String(req.query.name || 'attachment').replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'attachment';
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buf);
  }));

  // ---- send, reply ----
  app.post('/api/admin/mail/:box/send', requireAdmin, upload.array('attachments', 5), wrap(async (req, res) => {
    const b = getBox(req, res); if (!b) return;
    const a = await b.account(); const f = req.body || {};
    const list = s => String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
    const to = list(f.to), cc = list(f.cc), bcc = list(f.bcc);
    if (!to.length) throw new MailError('Add at least one recipient.', 400);
    for (const x of [...to, ...cc, ...bcc]) if (!isEmail(x)) throw new MailError(`"${x}" is not a valid email address.`, 400);
    if (to.length + cc.length + bcc.length > 25) throw new MailError('Too many recipients.', 400);
    const subject = String(f.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
    const text = String(f.body || '');
    if (!text.trim()) throw new MailError('Write a message first.', 400);
    if (text.length > 200000) throw new MailError('The message is too long.', 400);
    const from = String(f.from || a.address);
    if (!a.from.includes(from)) throw new MailError('That "from" address is not on this mailbox.', 400);
    const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">' + escapeHtml(text).replace(/\r?\n/g, '<br>') + '</div>';
    const msg = { fromAddress: from, toAddress: to.join(','), subject, content: html, mailFormat: 'html' };
    if (cc.length) msg.ccAddress = cc.join(',');
    if (bcc.length) msg.bccAddress = bcc.join(',');
    const files = req.files || [];
    if (files.length) {
      const form = new FormData();
      for (const x of files) form.append('attach', new Blob([x.buffer], { type: x.mimetype || 'application/octet-stream' }), x.originalname);
      const up = await b.call('POST', `/accounts/${a.accountId}/messages/attachments`, { query: { uploadType: 'multipart' }, form });
      const got = Array.isArray(up && up.data) ? up.data : (up && up.data ? [up.data] : []);
      if (got.length !== files.length) throw new MailError('Zoho did not accept all the attachments.', 502);
      msg.attachments = got.map(g => ({ storeName: g.storeName, attachmentPath: g.attachmentPath, attachmentName: g.attachmentName }));
    }
    const replyTo = /^\d{1,25}$/.test(String(f.replyTo || '')) ? String(f.replyTo) : '';
    if (replyTo && !files.length) await b.call('POST', `/accounts/${a.accountId}/messages/${replyTo}`, { json: { ...msg, action: 'reply' } });
    else await b.call('POST', `/accounts/${a.accountId}/messages`, { json: msg });
    logAudit(req, 'mail.send', 'mailbox', b.key, { to, cc: cc.length, subject, attachments: files.length, reply: !!replyTo });
    res.json({ ok: true });
  }));

  // ---- mark read/unread, move, trash ----
  app.post('/api/admin/mail/:box/action', requireAdmin, wrap(async (req, res) => {
    const b = getBox(req, res); if (!b) return;
    const a = await b.account(); const body = req.body || {};
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 50).map(i => ({ id: digits(i.id), folderId: digits(i.folderId) }));
    if (!items.length) throw new MailError('Nothing selected.', 400);
    const ids = items.map(i => i.id).join(',');
    if (body.action === 'read' || body.action === 'unread') {
      await b.call('PUT', `/accounts/${a.accountId}/updatemessage`, { rawJson: `{"mode":"${body.action === 'read' ? 'markAsRead' : 'markAsUnread'}","messageId":[${ids}]}` });
    } else if (body.action === 'move') {
      await b.call('PUT', `/accounts/${a.accountId}/updatemessage`, { rawJson: `{"mode":"moveMessage","destfolderId":${digits(body.destFolderId)},"messageId":[${ids}]}` });
    } else if (body.action === 'trash') {
      const trash = await b.folderBy('trash');
      for (const i of items) await b.call('DELETE', `/accounts/${a.accountId}/folders/${i.folderId}/messages/${i.id}`, { query: trash && trash.id === i.folderId ? { expunge: 'true' } : {} });
    } else throw new MailError('Unknown action.', 400);
    logAudit(req, 'mail.' + body.action, 'mailbox', b.key, { count: items.length });
    res.json({ ok: true });
  }));

  // ---- orders that belong to the person who wrote ----
  app.get('/api/admin/mail/orders', requireAdmin, (req, res) => {
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!isEmail(email)) return res.json({ orders: [] });
    res.json({ orders: db.prepare(`SELECT id, public_ref, status, recipient_name, created_at, price_cents FROM orders
      WHERE lower(customer_email) = ? AND deleted_at IS NULL AND status != 'awaiting_payment' ORDER BY id DESC LIMIT 10`).all(email) });
  });

  // ---- new-mail watcher: one quiet check per mailbox, new unread inbox mail becomes an event ----
  async function pollBox(b) {
    const a = await b.account(); const inbox = await b.folderBy('inbox'); if (!inbox) return;
    const j = await b.call('GET', `/accounts/${a.accountId}/messages/view`, { query: { folderId: inbox.id, status: 'unread', limit: 50, sortBy: 'date' } });
    const msgs = ((j && j.data) || []).map(m => normMsg(m, { has: () => true })).filter(m => m.at);
    b.state.unread = msgs.length; b.state.error = null;
    const cursor = cursorGet(b.key);
    b.state.checkedAt = Date.now(); b.state.cursor = cursor || 0; b.state.listed = (j && j.data || []).length; b.state.parsed = msgs.length;
    const newest = msgs.reduce((n, m) => Math.max(n, m.at), 0);
    if (!cursor) { cursorSet(b.key, newest || Date.now()); return; }          // first run: start from now, no flood
    const fresh = msgs.filter(m => m.at > cursor).sort((x, y) => x.at - y.at);
    for (const m of fresh) {
      const ev = { box: b.key, label: b.label, id: m.id, folderId: m.folderId, from: m.from, subject: m.subject, at: m.at };
      recent.push(ev); events.emit('mail', ev);
    }
    if (fresh.length) cursorSet(b.key, fresh[fresh.length - 1].at);
    while (recent.length && Date.now() - recent[0].at > 24 * 3600 * 1000) recent.shift();
  }
  let delay = 60000, timer = null;
  async function pollAll() {
    let worst = 60000;
    for (const b of boxes) {
      try { await pollBox(b); b.state.pollError = null; } catch (e) { b.state.pollError = e.message; b.state.error = e.message; worst = e.status === 429 ? 600000 : Math.max(worst, 120000); }
    }
    delay = worst;
  }
  function start() {
    if (!boxes.length || timer) return;
    const loop = async () => { try { await pollAll(); } finally { timer = setTimeout(loop, delay); if (timer.unref) timer.unref(); } };
    timer = setTimeout(loop, 5000); if (timer.unref) timer.unref();
  }
  const recentSince = ms => recent.filter(e => e.at > ms);

  return { boxes, events, pollAll, start, recent: () => recent.slice(-20), recentSince };
}

module.exports = { register, discoverBoxes, decodeEntities };
