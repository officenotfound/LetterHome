'use strict';
// Fax to Canada and the US, sent through Telnyx Programmable Fax.
//
// Flow: the customer uploads a document and a +1 fax number and sees the price (POST /api/fax/quote), then pays with
// Stripe Checkout (POST /api/fax/checkout). The Stripe webhook marks the fax paid. Nothing goes to Telnyx until the
// owner approves it in the admin. Telnyx reports progress to /api/fax/telnyx-webhook. A failed fax is retried up to
// two more times after a short wait; if it still fails, the owner decides (retry, refund or contact), never an automatic
// refund. Files are kept outside public/ and deleted 24 hours after the fax is finished.
//
// Telnyx docs used (read 2026-11-27): developers.telnyx.com/docs/programmable-fax/quickstart.md (fax app, number,
// outbound voice profile), .../send-a-fax-api.md and api-reference/programmable-fax-commands/send-a-fax.md
// (POST /v2/faxes, fields, webhook events, failure reasons), .../cancel-a-fax.md, and docs/development/api-fundamentals/
// webhooks/receiving-webhooks.md. The webhook signature check follows the official Node SDK (team-telnyx/telnyx-node,
// src/lib/webhooks.ts): Ed25519 over "<telnyx-timestamp>|<raw body>", base64 signature and base64 32-byte public key,
// timestamps within 300 seconds.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const TELNYX = 'https://api.telnyx.com/v2';
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 50;
const MAX_TRIES = 3;                       // the first send plus two retries
const RETRY_MINUTES = 10;
const KEEP_HOURS = 24;
// Failures worth trying again: the line was busy or did not answer, or the call dropped.
const RETRYABLE = /busy|no_answer|unreachable|timeout|interrupted|call_dropped|ring|disconnect|negotiation/i;
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');

function schema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS fax_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_ref TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'quote',
    email TEXT, sender_name TEXT, to_number TEXT, cover_note TEXT,
    pages INTEGER, price_cents INTEGER, currency TEXT NOT NULL DEFAULT 'CAD',
    file_name TEXT, original_name TEXT, status_token TEXT,
    stripe_session_id TEXT, payment_intent TEXT,
    telnyx_fax_id TEXT, telnyx_mode TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_retry_at TEXT, failure_reason TEXT,
    quote_ip TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, paid_at TEXT, approved_at TEXT, sent_at TEXT, delivered_at TEXT,
    failed_at TEXT, refunded_at TEXT, finished_at TEXT, files_deleted_at TEXT, paid_email_at TEXT, done_email_at TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS fax_webhook_events (event_id TEXT PRIMARY KEY, received_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE IF NOT EXISTS fax_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, fax_id INTEGER NOT NULL, note TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  db.exec('CREATE INDEX IF NOT EXISTS fax_orders_status ON fax_orders (status)');
  db.exec('CREATE INDEX IF NOT EXISTS fax_orders_session ON fax_orders (stripe_session_id)');
  db.exec('CREATE INDEX IF NOT EXISTS fax_orders_telnyx ON fax_orders (telnyx_fax_id)');
}

// A North American (+1) number written any common way, as E.164, or null. Canada and the US share +1.
function normalizeNumber(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;
  if (/^(800|833|844|855|866|877|888|900|976)/.test(d)) return null;   // toll-free and premium numbers are not accepted
  return '+1' + d;
}
const pretty = e164 => e164 && e164.length === 12 ? `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}` : (e164 || '');

const kindOf = buf => {
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
};

// Letter-size pages: an image is scaled to fit inside half-inch margins.
async function toPdf(buf, kind) {
  if (kind === 'pdf') {
    let doc;
    try { doc = await PDFDocument.load(buf, { updateMetadata: false }); }
    catch (e) { throw new Error(/encrypt/i.test(e.message) ? 'This PDF is password-protected. Save a copy without a password and try again.' : 'This PDF could not be read.'); }
    if (doc.isEncrypted) throw new Error('This PDF is password-protected. Save a copy without a password and try again.');
    return doc;
  }
  const doc = await PDFDocument.create();
  const img = kind === 'jpg' ? await doc.embedJpg(buf) : await doc.embedPng(buf);
  const W = 612, H = 792, M = 36;
  const s = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height, 1);
  const page = doc.addPage([W, H]);
  page.drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
  return doc;
}

const wrap = (text, font, size, width) => {
  const out = [];
  for (const para of String(text || '').replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      const next = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else { if (line) out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
};

// A plain cover sheet in front of the document, when the customer wrote a note.
async function addCover(doc, { to, from, note, docPages }) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.insertPage(0, [612, 792]);
  // The standard fonts only cover Latin-1: anything else is left out of the cover sheet rather than failing.
  const safe = s => String(s || '').replace(/[^\x20-\x7e\xa0-\xff\n]/g, '');
  let y = 720;
  page.drawText('FAX', { x: 54, y, size: 30, font: bold, color: rgb(0.1, 0.1, 0.1) }); y -= 44;
  const row = (label, value) => {
    page.drawText(label, { x: 54, y, size: 11, font: bold }); page.drawText(safe(value), { x: 150, y, size: 11, font }); y -= 20;
  };
  row('To:', pretty(to));
  row('From:', from);
  row('Date:', new Date().toISOString().slice(0, 10));
  row('Pages:', `${docPages + 1} including this page`);
  y -= 14;
  page.drawLine({ start: { x: 54, y }, end: { x: 558, y }, thickness: 0.8, color: rgb(0.5, 0.5, 0.5) }); y -= 28;
  for (const line of wrap(safe(note).slice(0, 2000), font, 12, 504).slice(0, 40)) { page.drawText(line, { x: 54, y, size: 12, font }); y -= 17; }
}

function priceFor(getSetting, pages) {
  const base = parseInt(getSetting('fax_price_cents', '300'), 10) || 300;
  const per = parseInt(getSetting('fax_page_cents', '50'), 10) || 50;
  const incl = parseInt(getSetting('fax_included_pages', '10'), 10) || 10;
  return base + Math.max(0, pages - incl) * per;
}

// Ed25519 check of a Telnyx webhook, as the official Node SDK does it.
function verifyTelnyx(rawBody, headers, publicKeyB64, now = Date.now()) {
  const sig = headers['telnyx-signature-ed25519'], ts = headers['telnyx-timestamp'];
  if (!sig || !ts || !/^\d+$/.test(String(ts))) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(ts)) > 300) return false;
  let key, signature;
  try {
    const raw = Buffer.from(String(publicKeyB64 || '').trim(), 'base64');
    if (raw.length !== 32) return false;
    key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, raw]), format: 'der', type: 'spki' });
    signature = Buffer.from(String(sig), 'base64');
    if (signature.length !== 64) return false;
  } catch { return false; }
  return crypto.verify(null, Buffer.from(`${ts}|${rawBody.toString('utf8')}`), key, signature);
}

function register(app, deps) {
  const { db, getSetting, stripe, sendMail, sendOwnerMail, requireAdmin, logAudit, siteBase, dataDir, emailShell, fetchImpl = fetch } = deps;
  schema(db);
  const dir = path.join(dataDir, 'faxes');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const fileOf = f => path.join(dir, path.basename(f.file_name || ''));
  const testMode = () => !!process.env.TEST_MODE;
  const mode = () => getSetting('fax_enabled', 'false');                 // 'false' | 'admin' | 'true'
  const isAdmin = req => !!req.session?.admin;
  const open = req => testMode() || mode() === 'true' || (mode() === 'admin' && isAdmin(req));
  const telnyxReady = () => !!(getSetting('telnyx_api_key', '') && getSetting('telnyx_fax_app_id', '') && normalizeNumber(getSetting('telnyx_fax_from', '')));
  const note = (id, text) => { try { db.prepare('INSERT INTO fax_notes (fax_id, note) VALUES (?,?)').run(id, text); } catch {} };
  const get = id => db.prepare('SELECT * FROM fax_orders WHERE id = ?').get(id);
  const base = () => (siteBase() || process.env.BASE_URL || 'https://letterhome.ca').replace(/\/$/, '');
  const money = (c, cur = 'CAD') => `$${(c / 100).toFixed(2)} ${cur}`;

  // ---------- public: page config, quote, checkout, status ----------
  app.get('/api/fax/config', (req, res) => {
    res.json({ open: open(req), price_cents: priceFor(getSetting, 1), page_cents: parseInt(getSetting('fax_page_cents', '50'), 10) || 50,
      included_pages: parseInt(getSetting('fax_included_pages', '10'), 10) || 10, max_pages: MAX_PAGES, max_mb: MAX_BYTES / 1048576 });
  });

  const quoteLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test', message: { error: 'Too many uploads. Please try again in an hour.' } });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 10, fieldSize: 4000 } }).single('document');

  app.post('/api/fax/quote', quoteLimiter, (req, res) => {
    if (!open(req)) return res.status(403).json({ error: 'Fax is not available yet.' });
    upload(req, res, async err => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than 20 MB.' : 'The upload could not be read.' });
      try {
        const b = req.body || {};
        const to = normalizeNumber(b.to);
        if (!to) return res.status(400).json({ error: 'Enter a Canadian or US fax number with its area code, such as 613-555-0123.' });
        const email = String(b.email || '').trim().slice(0, 200);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address for your receipt.' });
        const sender = String(b.sender_name || '').trim().slice(0, 100);
        if (!sender) return res.status(400).json({ error: 'Enter your name.' });
        const coverNote = String(b.cover_note || '').trim().slice(0, 2000);
        if (!req.file) return res.status(400).json({ error: 'Choose a PDF, JPG or PNG file.' });
        const kind = kindOf(req.file.buffer);
        if (!kind) return res.status(400).json({ error: 'Only PDF, JPG and PNG files can be faxed.' });
        const doc = await toPdf(req.file.buffer, kind);
        const docPages = doc.getPageCount();
        if (!docPages) return res.status(400).json({ error: 'This file has no pages.' });
        if (coverNote) await addCover(doc, { to, from: sender, note: coverNote, docPages });
        const pages = doc.getPageCount();
        if (pages > MAX_PAGES) return res.status(400).json({ error: `Faxes can be up to ${MAX_PAGES} pages. This one has ${pages}.` });
        const bytes = Buffer.from(await doc.save());
        if (bytes.length > MAX_BYTES * 2) return res.status(400).json({ error: 'This document is too large to fax. Try a smaller scan.' });
        const fileName = crypto.randomBytes(18).toString('hex') + '.pdf';
        fs.writeFileSync(path.join(dir, fileName), bytes, { mode: 0o600 });
        const ref = 'FX-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const price = priceFor(getSetting, pages);
        db.prepare(`INSERT INTO fax_orders (public_ref, status, email, sender_name, to_number, cover_note, pages, price_cents, file_name, original_name, status_token, quote_ip)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(ref, 'quote', email, sender, to, coverNote || null, pages, price, fileName,
          String(req.file.originalname || '').slice(0, 200), crypto.randomBytes(24).toString('hex'), String(req.ip || '').slice(0, 64));
        res.json({ ref, to: pretty(to), pages, price_cents: price, cover: !!coverNote });
      } catch (e) {
        res.status(400).json({ error: e.message && e.message.length < 160 ? e.message : 'The file could not be prepared for faxing.' });
      }
    });
  });

  app.post('/api/fax/checkout', express.json({ limit: '4kb' }), async (req, res) => {
    if (!open(req)) return res.status(403).json({ error: 'Fax is not available yet.' });
    const f = db.prepare("SELECT * FROM fax_orders WHERE public_ref = ? AND status IN ('quote','awaiting_payment')").get(String(req.body?.ref || ''));
    if (!f || f.files_deleted_at) return res.status(404).json({ error: 'That quote has expired. Please upload the document again.' });
    const recent = db.prepare("SELECT COUNT(*) n FROM fax_orders WHERE lower(email) = lower(?) AND paid_at > datetime('now','-1 hour')").get(f.email).n;
    if (recent >= 5) return res.status(429).json({ error: 'You can send up to 5 faxes an hour. Please try again later.' });
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', customer_email: f.email,
        line_items: [{ quantity: 1, price_data: { currency: 'cad', unit_amount: f.price_cents,
          product_data: { name: `Fax to ${pretty(f.to_number)}`, description: `${f.pages} page${f.pages === 1 ? '' : 's'}, sent after a quick check by our team` } } }],
        metadata: { kind: 'fax', fax_ref: f.public_ref },
        payment_intent_data: { metadata: { kind: 'fax', fax_ref: f.public_ref } },
        success_url: `${base()}/fax/status/${f.status_token}?paid=1`,
        cancel_url: `${base()}/fax?cancelled=1`,
      });
      db.prepare("UPDATE fax_orders SET status = 'awaiting_payment', stripe_session_id = ? WHERE id = ?").run(session.id, f.id);
      res.json({ url: session.url });
    } catch (e) {
      console.error('[fax] checkout failed:', e.message);
      res.status(502).json({ error: 'Payment could not be started. Please try again.' });
    }
  });

  const STATUS_TEXT = {
    quote: 'Not paid yet', awaiting_payment: 'Waiting for payment', paid: 'Paid. We check every fax before it is sent, usually within a few hours.',
    sending: 'Sending now', retrying: 'The line was busy or did not answer. We will try again shortly.',
    delivered: 'Delivered', failed: 'We could not get it through. We will email you about what happens next.',
    refunded: 'Refunded', cancelled: 'Cancelled',
  };
  const STATUS_LABEL = { quote: 'Not paid', awaiting_payment: 'Confirming payment', paid: 'Waiting for our check', sending: 'Sending',
    retrying: 'Will try again', delivered: 'Delivered', failed: 'Not delivered', refunded: 'Refunded', cancelled: 'Cancelled' };
  app.get('/api/fax/status/:token', (req, res) => {
    const f = db.prepare('SELECT * FROM fax_orders WHERE status_token = ?').get(String(req.params.token || ''));
    if (!f || f.status === 'quote') return res.status(404).json({ error: 'Not found.' });
    res.json({ ref: f.public_ref, to: pretty(f.to_number), pages: f.pages, price: money(f.price_cents, f.currency), status: f.status,
      status_text: STATUS_TEXT[f.status] || f.status, status_label: STATUS_LABEL[f.status] || f.status, paid_at: f.paid_at, delivered_at: f.delivered_at });
  });

  // ---------- Stripe: called from the main /webhook handler ----------
  function onCheckoutCompleted(session) {
    if (!session || session.metadata?.kind !== 'fax') return false;
    const f = db.prepare('SELECT * FROM fax_orders WHERE public_ref = ?').get(String(session.metadata.fax_ref || ''));
    if (!f) { console.error('[fax] paid session for unknown fax', session.metadata.fax_ref); return true; }
    if (session.payment_status !== 'paid') return true;
    const r = db.prepare("UPDATE fax_orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP, payment_intent = ?, stripe_session_id = ? WHERE id = ? AND status IN ('quote','awaiting_payment')")
      .run(String(session.payment_intent || ''), String(session.id || ''), f.id);
    if (!r.changes) return true;                                             // already handled: Stripe sent the event twice
    note(f.id, `Paid ${money(f.price_cents, f.currency)}. Waiting for approval.`);
    customerEmail(f.id, 'paid');
    try { sendOwnerMail(`Fax ${f.public_ref} is waiting for approval`, `A paid fax to ${pretty(f.to_number)} (${f.pages} pages) is waiting for you.\n\n${base()}/admin/faxes`); } catch {}
    return true;
  }

  // ---------- emails: the same two moments as letters (confirmation, then sent) ----------
  function customerEmail(id, which) {
    const f = get(id);
    if (!f?.email) return;
    const col = which === 'paid' ? 'paid_email_at' : 'done_email_at';
    if (db.prepare(`UPDATE fax_orders SET ${col} = CURRENT_TIMESTAMP WHERE id = ? AND ${col} IS NULL`).run(id).changes !== 1) return;
    const link = `${base()}/fax/status/${f.status_token}`;
    const T = which === 'paid' ? {
      subject: `Your Letterhome fax is confirmed: ${f.public_ref}`,
      h1: 'Your fax is in.',
      p: `We've received your payment. We check every fax before it is sent, usually within a few hours, and we'll email you again once it has gone through.`,
    } : {
      subject: `Your fax to ${pretty(f.to_number)} was delivered: ${f.public_ref}`,
      h1: 'Your fax was delivered.',
      p: `The fax machine at ${pretty(f.to_number)} received all ${f.pages} page${f.pages === 1 ? '' : 's'} on ${new Date(String(f.delivered_at || '').replace(' ', 'T') + 'Z').toUTCString().replace(' GMT', ' UTC')}. Keep this email as your record that it was sent.`,
    };
    const rows = [['Fax number', pretty(f.to_number)], ['Pages', String(f.pages)], ['Order', f.public_ref]];
    sendMail({ from: process.env.EMAIL_FROM, to: f.email, replyTo: process.env.OPERATOR_EMAIL, subject: T.subject,
      html: emailShell({ h1: T.h1, p: T.p, rows, link, linkText: 'Check your fax' }),
      text: [T.h1, '', T.p, '', ...rows.map(r => `${r[0]}: ${r[1]}`), '', `Check your fax: ${link}`].join('\n') },
      which === 'paid' ? 'fax_confirmation' : 'fax_delivered', null).catch(e => {
      console.error('[fax] email failed:', e.message);
      db.prepare(`UPDATE fax_orders SET ${col} = NULL WHERE id = ?`).run(id);
    });
  }

  // ---------- Telnyx ----------
  const signedMediaUrl = f => {
    const exp = Math.floor(Date.now() / 1000) + 30 * 60;
    const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'fax').update(`${f.id}.${exp}`).digest('hex').slice(0, 40);
    return `${(process.env.BASE_URL || base()).replace(/\/$/, '')}/api/fax/media/${f.id}/${exp}/${sig}`;
  };
  app.get('/api/fax/media/:id/:exp/:sig', (req, res) => {
    const id = Number(req.params.id), exp = Number(req.params.exp);
    const want = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'fax').update(`${id}.${exp}`).digest('hex').slice(0, 40);
    const got = String(req.params.sig || '');
    if (!id || !exp || exp < Date.now() / 1000 || got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return res.status(404).end();
    const f = get(id);
    if (!f || f.files_deleted_at || !fs.existsSync(fileOf(f))) return res.status(404).end();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(fileOf(f)).pipe(res);
  });

  async function send(id, why) {
    const f = get(id);
    if (!f || !['paid', 'retrying', 'failed'].includes(f.status)) return { ok: false, error: 'This fax is not waiting to be sent.' };
    if (f.files_deleted_at || !fs.existsSync(fileOf(f))) return { ok: false, error: 'The document has been deleted, so it cannot be sent.' };
    const attempt = (f.attempts || 0) + 1;
    if (!telnyxReady()) {
      if (!testMode()) return { ok: false, error: 'Telnyx is not set up yet. Add the keys in Settings first.' };
      const simId = 'sim-' + crypto.randomBytes(6).toString('hex');
      db.prepare("UPDATE fax_orders SET status = 'sending', telnyx_fax_id = ?, telnyx_mode = 'simulated', attempts = ?, next_retry_at = NULL, sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(simId, attempt, id);
      note(id, `Attempt ${attempt} (${why}): simulated send, test mode only.`);
      return { ok: true, simulated: true, fax_id: simId };
    }
    let r, body = {};
    try {
      r = await fetchImpl(`${TELNYX}/faxes`, { method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${getSetting('telnyx_api_key', '')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: getSetting('telnyx_fax_app_id', ''), media_url: signedMediaUrl(f), to: f.to_number,
          from: normalizeNumber(getSetting('telnyx_fax_from', '')), quality: 'high', client_state: Buffer.from(String(f.id)).toString('base64') }) });
      body = await r.json().catch(() => ({}));
    } catch (e) { return { ok: false, error: 'Could not reach Telnyx. Try again in a moment.' }; }
    if (r.status !== 202 && !r.ok) {
      const msg = (body.errors && body.errors[0] && (body.errors[0].detail || body.errors[0].title)) || `Telnyx answered ${r.status}.`;
      note(id, `Attempt ${attempt} (${why}) refused by Telnyx: ${msg}`);
      return { ok: false, error: msg };
    }
    const faxId = body.data && body.data.id;
    db.prepare("UPDATE fax_orders SET status = 'sending', telnyx_fax_id = ?, telnyx_mode = 'live', attempts = ?, next_retry_at = NULL, failure_reason = NULL, sent_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(String(faxId || ''), attempt, id);
    note(id, `Attempt ${attempt} (${why}) handed to Telnyx, fax ${faxId}.`);
    return { ok: true, fax_id: faxId };
  }

  // A delivered or failed result, from Telnyx or (in test mode) the admin's simulate buttons.
  function settle(f, outcome, { pages, reason } = {}) {
    if (outcome === 'delivered') {
      const r = db.prepare("UPDATE fax_orders SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP, pages = COALESCE(?, pages) WHERE id = ? AND status = 'sending'")
        .run(pages || null, f.id);
      if (r.changes) { note(f.id, `Delivered${pages ? `, ${pages} pages` : ''}.`); customerEmail(f.id, 'done'); }
      return;
    }
    const why = String(reason || 'unknown');
    const retry = (f.attempts || 0) < MAX_TRIES && RETRYABLE.test(why);
    if (retry) {
      db.prepare(`UPDATE fax_orders SET status = 'retrying', failure_reason = ?, next_retry_at = datetime('now', '+${RETRY_MINUTES} minutes') WHERE id = ? AND status = 'sending'`).run(why, f.id);
      note(f.id, `Attempt ${f.attempts} failed (${why}). Trying again in ${RETRY_MINUTES} minutes.`);
      return;
    }
    const r = db.prepare("UPDATE fax_orders SET status = 'failed', failure_reason = ?, failed_at = CURRENT_TIMESTAMP, next_retry_at = NULL WHERE id = ? AND status = 'sending'").run(why, f.id);
    if (r.changes) {
      note(f.id, `Attempt ${f.attempts} failed (${why}). No more automatic tries; waiting for your decision.`);
      try { sendOwnerMail(`Fax ${f.public_ref} failed`, `The fax to ${pretty(f.to_number)} failed after ${f.attempts} attempt(s): ${why}.\nRetry, refund or contact the customer:\n\n${base()}/admin/faxes`); } catch {}
    }
  }

  // Telnyx status webhook. Mounted before the JSON body parser so the raw bytes can be checked.
  function registerWebhook(appBeforeJson) {
    appBeforeJson.post('/api/fax/telnyx-webhook', express.raw({ type: '*/*', limit: '256kb' }), (req, res) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      if (!verifyTelnyx(raw, req.headers, getSetting('telnyx_public_key', ''))) return res.status(401).json({ error: 'bad signature' });
      let ev;
      try { ev = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).end(); }
      const data = ev.data || ev, payload = data.payload || {};
      const eventId = String(data.id || ''), type = String(data.event_type || '');
      if (eventId) {
        const fresh = db.prepare('INSERT OR IGNORE INTO fax_webhook_events (event_id) VALUES (?)').run(eventId).changes;
        if (!fresh) return res.json({ ok: true, duplicate: true });
      }
      let f = payload.fax_id ? db.prepare('SELECT * FROM fax_orders WHERE telnyx_fax_id = ?').get(String(payload.fax_id)) : null;
      if (!f && payload.client_state) { try { f = get(Number(Buffer.from(String(payload.client_state), 'base64').toString())); } catch {} }
      if (!f) return res.json({ ok: true, unknown: true });
      if (type === 'fax.delivered') settle(f, 'delivered', { pages: Number(payload.page_count) || null });
      else if (type === 'fax.failed') settle(f, 'failed', { reason: payload.failure_reason });
      else if (type) note(f.id, `Telnyx: ${type.replace(/^fax\./, '')}.`);
      res.json({ ok: true });
    });
  }

  // ---------- sweep: retries and file cleanup, every minute ----------
  async function sweep() {
    for (const f of db.prepare("SELECT id FROM fax_orders WHERE status = 'retrying' AND next_retry_at <= datetime('now') LIMIT 5").all()) {
      const r = await send(f.id, 'automatic retry');
      if (!r.ok) { db.prepare("UPDATE fax_orders SET status = 'failed', failed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'retrying'").run(f.id); note(f.id, `Retry could not start: ${r.error}`); }
    }
    const old = db.prepare(`SELECT * FROM fax_orders WHERE files_deleted_at IS NULL AND (
        (status IN ('delivered','refunded','cancelled') AND finished_at <= datetime('now','-${KEEP_HOURS} hours'))
        OR (status IN ('quote','awaiting_payment') AND created_at <= datetime('now','-${KEEP_HOURS} hours')))`).all();
    for (const f of old) {
      try { fs.unlinkSync(fileOf(f)); } catch {}
      db.prepare('UPDATE fax_orders SET files_deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(f.id);
    }
  }

  // ---------- admin (registered after the admin CSRF check, see registerAdmin) ----------
  function registerAdmin(app) {
  app.get('/api/admin/faxes', requireAdmin, (req, res) => {
    const rows = db.prepare(`SELECT id, public_ref, status, email, sender_name, to_number, cover_note, pages, price_cents, currency, attempts, failure_reason,
      telnyx_mode, created_at, paid_at, sent_at, delivered_at, failed_at, refunded_at, files_deleted_at
      FROM fax_orders WHERE status != 'quote' ORDER BY CASE status WHEN 'paid' THEN 0 WHEN 'failed' THEN 1 WHEN 'retrying' THEN 2 WHEN 'sending' THEN 3 ELSE 4 END, id DESC LIMIT 200`).all();
    const notes = db.prepare('SELECT fax_id, note, created_at FROM fax_notes WHERE fax_id IN (SELECT id FROM fax_orders ORDER BY id DESC LIMIT 200) ORDER BY id').all();
    res.json({ faxes: rows.map(f => ({ ...f, to: pretty(f.to_number), notes: notes.filter(n => n.fax_id === f.id) })),
      telnyx_ready: telnyxReady(), test_mode: testMode(), mode: mode() });
  });
  app.get('/api/admin/faxes/:id/file', requireAdmin, (req, res) => {
    const f = get(Number(req.params.id));
    if (!f || f.files_deleted_at || !fs.existsSync(fileOf(f))) return res.status(404).json({ error: 'The document has been deleted.' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${f.public_ref}.pdf"`);
    fs.createReadStream(fileOf(f)).pipe(res);
  });
  app.post('/api/admin/faxes/:id/approve', requireAdmin, async (req, res) => {
    const f = get(Number(req.params.id));
    if (!f || f.status !== 'paid') return res.status(400).json({ error: 'Only a paid fax that has not been sent can be approved.' });
    db.prepare('UPDATE fax_orders SET approved_at = CURRENT_TIMESTAMP WHERE id = ?').run(f.id);
    const r = await send(f.id, 'approved by owner');
    logAudit(req, 'fax.approve', 'fax', f.id, { ok: r.ok, error: r.error || null });
    res.status(r.ok ? 200 : 400).json(r);
  });
  app.post('/api/admin/faxes/:id/retry', requireAdmin, async (req, res) => {
    const f = get(Number(req.params.id));
    if (!f || f.status !== 'failed') return res.status(400).json({ error: 'Only a failed fax can be retried.' });
    const r = await send(f.id, 'retried by owner');
    logAudit(req, 'fax.retry', 'fax', f.id, { ok: r.ok, error: r.error || null });
    res.status(r.ok ? 200 : 400).json(r);
  });
  app.post('/api/admin/faxes/:id/refund', requireAdmin, async (req, res) => {
    const f = get(Number(req.params.id));
    if (!f || !['paid', 'failed'].includes(f.status)) return res.status(400).json({ error: 'Only a paid fax that was not delivered can be refunded here.' });
    if (!f.payment_intent) return res.status(400).json({ error: 'No payment found for this fax.' });
    try {
      await stripe.refunds.create({ payment_intent: f.payment_intent }, { idempotencyKey: `fax-refund-${f.id}` });
    } catch (e) { return res.status(502).json({ error: 'Stripe refused the refund: ' + e.message }); }
    db.prepare("UPDATE fax_orders SET status = 'refunded', refunded_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(f.id);
    note(f.id, 'Refunded in full by owner.');
    logAudit(req, 'fax.refund', 'fax', f.id, { amount_cents: f.price_cents });
    res.json({ ok: true });
  });
  app.post('/api/admin/faxes/:id/note', requireAdmin, express.json({ limit: '8kb' }), (req, res) => {
    const f = get(Number(req.params.id));
    const text = String(req.body?.note || '').trim().slice(0, 1000);
    if (!f || !text) return res.status(400).json({ error: 'Write a note first.' });
    note(f.id, text);
    res.json({ ok: true });
  });
  // Test mode only: pretend Telnyx answered, to try the whole flow without sending a real fax.
  app.post('/api/admin/faxes/:id/simulate', requireAdmin, express.json({ limit: '4kb' }), (req, res) => {
    if (!testMode()) return res.status(403).json({ error: 'Only available in test mode.' });
    const f = get(Number(req.params.id));
    if (!f || f.status !== 'sending' || f.telnyx_mode !== 'simulated') return res.status(400).json({ error: 'Only a simulated fax that is sending can be simulated.' });
    if (req.body?.outcome === 'delivered') settle(f, 'delivered', { pages: f.pages });
    else settle(f, 'failed', { reason: req.body?.reason || 'user_busy' });
    res.json({ ok: true });
  });
  }

  return { registerWebhook, registerAdmin, onCheckoutCompleted, sweep, send, settle };
}

module.exports = { register, schema, normalizeNumber, verifyTelnyx, priceFor, pretty, kindOf };
