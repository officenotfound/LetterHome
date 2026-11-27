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
const MAX_FILES = 5;
const MAX_TRIES = 3;                       // the first send plus two retries
const RETRY_MINUTES = 10;
const KEEP_HOURS = 24;
// Failures worth trying again: the line was busy or did not answer, or the call dropped.
const RETRYABLE = /busy|no_answer|unreachable|timeout|interrupted|call_dropped|ring|disconnect|negotiation/i;
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');

// The customer's language: English, Canadian French (letterhome.ca) or US Spanish (letterhome.us).
const langOf = v => (v === 'fr' || v === 'es') ? v : 'en';
const MSG = {
  en: { closed: 'Fax is not available yet.', big: 'The file is larger than 20 MB.', unread: 'The upload could not be read.',
    number: 'Enter a Canadian or US fax number with its area code, such as 613-555-0123.', email: 'Enter a valid email address for your receipt.',
    name: 'Enter your name.', file: 'Choose a PDF, JPG or PNG file.', type: 'Only PDF, JPG and PNG files can be faxed.', empty: 'This file has no pages.',
    pages: (m, n) => `Faxes can be up to ${m} pages. This one has ${n}.`, huge: 'This document is too large to fax. Try a smaller scan.',
    prep: 'The file could not be prepared for faxing.', expired: 'That quote has expired. Please upload the document again.',
    hourly: 'You can send up to 5 faxes an hour. Please try again later.', pay: 'Payment could not be started. Please try again.',
    pdfpw: 'This PDF is password-protected. Save a copy without a password and try again.', pdfbad: 'This PDF could not be read.', files: 'Attach up to 5 files.' },
  fr: { closed: 'Le fax n’est pas encore offert.', big: 'Le fichier dépasse 20 Mo.', unread: 'Le fichier téléversé n’a pas pu être lu.',
    number: 'Entrez un numéro de fax canadien ou américain avec l’indicatif régional, comme 514-555-0123.', email: 'Entrez une adresse courriel valide pour votre reçu.',
    name: 'Entrez votre nom.', file: 'Choisissez un fichier PDF, JPG ou PNG.', type: 'Seuls les fichiers PDF, JPG et PNG peuvent être envoyés par fax.', empty: 'Ce fichier n’a aucune page.',
    pages: (m, n) => `Un fax peut compter jusqu’à ${m} pages. Celui-ci en a ${n}.`, huge: 'Ce document est trop lourd pour un fax. Essayez une numérisation plus légère.',
    prep: 'Le fichier n’a pas pu être préparé pour le fax.', expired: 'Ce prix a expiré. Téléversez le document de nouveau.',
    hourly: 'Vous pouvez envoyer jusqu’à 5 fax par heure. Réessayez plus tard.', pay: 'Le paiement n’a pas pu commencer. Réessayez.',
    pdfpw: 'Ce PDF est protégé par un mot de passe. Enregistrez une copie sans mot de passe et réessayez.', pdfbad: 'Ce PDF n’a pas pu être lu.', files: 'Joignez au plus 5 fichiers.' },
  es: { closed: 'El fax todavía no está disponible.', big: 'El archivo pesa más de 20 MB.', unread: 'No se pudo leer el archivo.',
    number: 'Ingrese un número de fax de EE. UU. o Canadá con su código de área, como 212-555-0123.', email: 'Ingrese un correo electrónico válido para su recibo.',
    name: 'Ingrese su nombre.', file: 'Elija un archivo PDF, JPG o PNG.', type: 'Solo se pueden enviar por fax archivos PDF, JPG y PNG.', empty: 'Este archivo no tiene páginas.',
    pages: (m, n) => `Un fax puede tener hasta ${m} páginas. Este tiene ${n}.`, huge: 'Este documento es demasiado grande para un fax. Pruebe con un escaneo más ligero.',
    prep: 'No se pudo preparar el archivo para el fax.', expired: 'Esta cotización venció. Suba el documento otra vez.',
    hourly: 'Puede enviar hasta 5 faxes por hora. Inténtelo más tarde.', pay: 'No se pudo iniciar el pago. Inténtelo de nuevo.',
    pdfpw: 'Este PDF tiene contraseña. Guarde una copia sin contraseña e inténtelo de nuevo.', pdfbad: 'No se pudo leer este PDF.', files: 'Adjunte hasta 5 archivos.' },
};
const COVER = {
  en: { to: 'To:', toFax: 'Fax:', from: 'From:', fax: 'Reply fax:', phone: 'Phone:', email: 'Email:', address: 'Address:', date: 'Date:', pages: 'Pages:', count: n => `${n} including this page` },
  fr: { to: 'À :', toFax: 'Fax :', from: 'De :', fax: 'Fax de retour :', phone: 'Tél. :', email: 'Courriel :', address: 'Adresse :', date: 'Date :', pages: 'Pages :', count: n => `${n}, incluant cette page` },
  es: { to: 'Para:', toFax: 'Fax:', from: 'De:', fax: 'Fax de respuesta:', phone: 'Teléfono:', email: 'Correo:', address: 'Dirección:', date: 'Fecha:', pages: 'Páginas:', count: n => `${n}, incluida esta página` },
};
// The fax order page for each site and language, as a path on letterhome.ca.
const PAGE_PATH = { 'ca-en': '/fax', 'ca-fr': '/envoyer-un-fax-en-ligne', 'us-en': '/us/fax', 'us-es': '/us/es/fax' };

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
    quote_ip TEXT, site TEXT NOT NULL DEFAULT 'ca', lang TEXT NOT NULL DEFAULT 'en', cover_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, paid_at TEXT, approved_at TEXT, sent_at TEXT, delivered_at TEXT,
    failed_at TEXT, refunded_at TEXT, finished_at TEXT, files_deleted_at TEXT, paid_email_at TEXT, done_email_at TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS fax_webhook_events (event_id TEXT PRIMARY KEY, received_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE IF NOT EXISTS fax_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, fax_id INTEGER NOT NULL, note TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  try { db.exec("ALTER TABLE fax_orders ADD COLUMN site TEXT NOT NULL DEFAULT 'ca'"); } catch {}
  try { db.exec("ALTER TABLE fax_orders ADD COLUMN lang TEXT NOT NULL DEFAULT 'en'"); } catch {}
  try { db.exec('ALTER TABLE fax_orders ADD COLUMN cover_json TEXT'); } catch {}
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
    catch (e) { throw Object.assign(new Error('pdf'), { code: /encrypt/i.test(e.message) ? 'pdfpw' : 'pdfbad' }); }
    if (doc.isEncrypted) throw Object.assign(new Error('pdf'), { code: 'pdfpw' });
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
async function addCover(doc, { to, cover = {}, docPages, lang = 'en' }) {
  const C = COVER[langOf(lang)];
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.insertPage(0, [612, 792]);
  // The standard fonts only cover Latin-1: anything else is left out of the cover sheet rather than failing.
  const safe = s => String(s || '').replace(/[^\x20-\x7e\xa0-\xff\n]/g, '');
  let y = 720;
  page.drawText('FAX', { x: 54, y, size: 30, font: bold, color: rgb(0.1, 0.1, 0.1) }); y -= 44;
  const row = (label, value) => {
    const lines = wrap(safe(value), font, 11, 400).slice(0, 4);
    if (!lines.join('').trim()) return;
    page.drawText(label, { x: 54, y, size: 11, font: bold });
    lines.forEach((l, i) => { page.drawText(l, { x: 160, y: y - i * 15, size: 11, font }); });
    y -= 20 + (lines.length - 1) * 15;
  };
  row(C.to, cover.to);
  row(C.toFax, pretty(to));
  row(C.from, cover.from);
  row(C.fax, cover.fax ? (pretty(normalizeNumber(cover.fax)) || cover.fax) : '');
  row(C.phone, cover.phone);
  row(C.email, cover.email);
  row(C.address, cover.address);
  row(C.date, new Date().toISOString().slice(0, 10));
  row(C.pages, C.count(docPages + 1));
  if (cover.note) {
    y -= 14;
    page.drawLine({ start: { x: 54, y }, end: { x: 558, y }, thickness: 0.8, color: rgb(0.5, 0.5, 0.5) }); y -= 28;
    for (const line of wrap(safe(cover.note).slice(0, 2000), font, 12, 504).slice(0, 30)) { page.drawText(line, { x: 54, y, size: 12, font }); y -= 17; }
  }
}

// Prices per site: letterhome.ca in Canadian dollars, letterhome.us in US dollars. Each is set in the admin Settings.
const PRICE_KEYS = { CAD: ['fax_price_cents', 300, 'fax_page_cents', 50], USD: ['fax_price_usd_cents', 250, 'fax_page_usd_cents', 25] };
function priceParts(getSetting, cur = 'CAD') {
  const [bk, bd, pk, pd] = PRICE_KEYS[cur] || PRICE_KEYS.CAD;
  return { base: parseInt(getSetting(bk, String(bd)), 10) || bd, per: parseInt(getSetting(pk, String(pd)), 10) || pd,
    incl: parseInt(getSetting('fax_included_pages', '10'), 10) || 10 };
}
function priceFor(getSetting, pages, cur = 'CAD') {
  const { base, per, incl } = priceParts(getSetting, cur);
  return base + Math.max(0, pages - incl) * per;
}
const currencyOf = site => site === 'us' ? 'USD' : 'CAD';

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
    const cur = currencyOf(req.query.site);
    const p = priceParts(getSetting, cur);
    res.json({ open: open(req), currency: cur, price_cents: p.base, page_cents: p.per, included_pages: p.incl, max_pages: MAX_PAGES, max_mb: MAX_BYTES / 1048576 });
  });

  const quoteLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test', message: { error: 'Too many uploads. Please try again in an hour.' } });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: MAX_FILES, fields: 20, fieldSize: 4000 } }).array('document', MAX_FILES);

  app.post('/api/fax/quote', quoteLimiter, (req, res) => {
    const M = MSG[langOf(req.query.lang)];
    if (!open(req)) return res.status(403).json({ error: M.closed });
    upload(req, res, async err => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? M.big : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? M.files : M.unread });
      try {
        const b = req.body || {};
        const lang = langOf(b.lang || req.query.lang);
        const to = normalizeNumber(b.to);
        if (!to) return res.status(400).json({ error: M.number });
        // Only the fax number and a document are needed. The email can come from Stripe at payment.
        const email = String(b.email || '').trim().slice(0, 200);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: M.email });
        const clip = (v, n) => String(v || '').replace(/\r/g, '').trim().slice(0, n);
        const cover = b.cover === '1' ? { to: clip(b.cover_to, 100), from: clip(b.cover_from, 100), fax: clip(b.cover_fax, 30), phone: clip(b.cover_phone, 30),
          email: clip(b.cover_email, 200), address: clip(b.cover_address, 300), note: clip(b.cover_note, 2000) } : null;
        const files = (req.files || []).filter(f => f && f.size);
        if (!files.length) return res.status(400).json({ error: M.file });
        if (files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) return res.status(400).json({ error: M.big });
        const doc = await PDFDocument.create();
        for (const file of files) {
          const kind = kindOf(file.buffer);
          if (!kind) return res.status(400).json({ error: M.type });
          const part = await toPdf(file.buffer, kind);
          (await doc.copyPages(part, part.getPageIndices())).forEach(pg => doc.addPage(pg));
        }
        const docPages = doc.getPageCount();
        if (!docPages) return res.status(400).json({ error: M.empty });
        if (cover) await addCover(doc, { to, cover, docPages, lang });
        const pages = doc.getPageCount();
        if (pages > MAX_PAGES) return res.status(400).json({ error: M.pages(MAX_PAGES, pages) });
        const bytes = Buffer.from(await doc.save());
        if (bytes.length > MAX_BYTES * 2) return res.status(400).json({ error: M.huge });
        const fileName = crypto.randomBytes(18).toString('hex') + '.pdf';
        fs.writeFileSync(path.join(dir, fileName), bytes, { mode: 0o600 });
        const ref = 'FX-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const site = b.site === 'us' ? 'us' : 'ca', currency = currencyOf(site);
        const price = priceFor(getSetting, pages, currency);
        const token = crypto.randomBytes(24).toString('hex');
        db.prepare(`INSERT INTO fax_orders (public_ref, status, email, sender_name, to_number, cover_note, cover_json, pages, price_cents, currency, site, lang, file_name, original_name, status_token, quote_ip)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(ref, 'quote', email || null, (cover && cover.from) || null, to, (cover && cover.note) || null, cover ? JSON.stringify(cover) : null,
          pages, price, currency, site, lang, fileName, files.map(f => String(f.originalname || '')).join(', ').slice(0, 300), token, String(req.ip || '').slice(0, 64));
        res.json({ ref, to: pretty(to), pages, price_cents: price, currency, cover: !!cover, preview: `/api/fax/preview/${token}` });
      } catch (e) {
        res.status(400).json({ error: (e.code && M[e.code]) || M.prep });
      }
    });
  });

  app.get('/api/fax/preview/:token', (req, res) => {
    const f = db.prepare("SELECT * FROM fax_orders WHERE status_token = ? AND status IN ('quote','awaiting_payment')").get(String(req.params.token || ''));
    if (!f || f.files_deleted_at || !fs.existsSync(fileOf(f))) return res.status(404).end();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(fileOf(f)).pipe(res);
  });

  app.post('/api/fax/checkout', express.json({ limit: '4kb' }), async (req, res) => {
    let M = MSG[langOf(req.body?.lang)];
    if (!open(req)) return res.status(403).json({ error: M.closed });
    const f = db.prepare("SELECT * FROM fax_orders WHERE public_ref = ? AND status IN ('quote','awaiting_payment')").get(String(req.body?.ref || ''));
    if (!f || f.files_deleted_at) return res.status(404).json({ error: M.expired });
    M = MSG[langOf(f.lang)];
    const recent = f.email
      ? db.prepare("SELECT COUNT(*) n FROM fax_orders WHERE lower(email) = lower(?) AND paid_at > datetime('now','-1 hour')").get(f.email).n
      : db.prepare("SELECT COUNT(*) n FROM fax_orders WHERE quote_ip = ? AND paid_at > datetime('now','-1 hour')").get(f.quote_ip || '').n;
    if (recent >= 5) return res.status(429).json({ error: M.hourly });
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', ...(f.email ? { customer_email: f.email } : {}),
        line_items: [{ quantity: 1, price_data: { currency: String(f.currency || 'CAD').toLowerCase(), unit_amount: f.price_cents,
          product_data: {
            name: { fr: `Fax au ${pretty(f.to_number)}`, es: `Fax al ${pretty(f.to_number)}` }[f.lang] || `Fax to ${pretty(f.to_number)}`,
            description: ({ fr: `${f.pages} page${f.pages === 1 ? '' : 's'}, envoyé à un télécopieur`,
              es: `${f.pages} página${f.pages === 1 ? '' : 's'}, enviado a una máquina de fax` }[f.lang])
              || `${f.pages} page${f.pages === 1 ? '' : 's'}, sent to a fax machine` } } }],
        locale: f.lang === 'fr' ? 'fr-CA' : f.lang === 'es' ? 'es-419' : 'auto',
        metadata: { kind: 'fax', fax_ref: f.public_ref },
        payment_intent_data: { metadata: { kind: 'fax', fax_ref: f.public_ref } },
        success_url: `${base()}/fax/status/${f.status_token}?paid=1`,
        // The order page the customer came from; on letterhome.us the US pages drop their /us prefix.
        cancel_url: `${base()}${(p => /letterhome\.us/.test(base()) ? p.replace(/^\/us(?=\/)/, '') : p)(PAGE_PATH[`${f.site}-${f.lang}`] || (f.site === 'us' ? '/us/fax' : '/fax'))}?cancelled=1`,
      });
      db.prepare("UPDATE fax_orders SET status = 'awaiting_payment', stripe_session_id = ? WHERE id = ?").run(session.id, f.id);
      res.json({ url: session.url });
    } catch (e) {
      console.error('[fax] checkout failed:', e.message);
      res.status(502).json({ error: M.pay });
    }
  });

  const STATUS_TEXT = {
    en: { quote: 'Not paid yet', awaiting_payment: 'Waiting for payment', paid: 'Paid. We’ll email you when it has been delivered.',
      sending: 'Sending now', retrying: 'The line was busy or did not answer. We will try again shortly.',
      delivered: 'Delivered', failed: 'We could not get it through. We will email you about what happens next.', refunded: 'Refunded', cancelled: 'Cancelled' },
    fr: { quote: 'Pas encore payé', awaiting_payment: 'En attente du paiement', paid: 'Payé. Nous vous écrirons quand il aura été livré.',
      sending: 'Envoi en cours', retrying: 'La ligne était occupée ou n’a pas répondu. Nous allons réessayer sous peu.',
      delivered: 'Livré', failed: 'Le fax n’a pas pu passer. Nous vous écrirons pour la suite.', refunded: 'Remboursé', cancelled: 'Annulé' },
    es: { quote: 'Todavía sin pagar', awaiting_payment: 'Esperando el pago', paid: 'Pagado. Le escribiremos cuando se haya entregado.',
      sending: 'Enviándose', retrying: 'La línea estaba ocupada o no contestó. Lo intentaremos de nuevo en breve.',
      delivered: 'Entregado', failed: 'No pudimos enviarlo. Le escribiremos sobre los siguientes pasos.', refunded: 'Reembolsado', cancelled: 'Cancelado' },
  };
  const STATUS_LABEL = {
    en: { quote: 'Not paid', awaiting_payment: 'Confirming payment', paid: 'Waiting for our check', sending: 'Sending',
      retrying: 'Will try again', delivered: 'Delivered', failed: 'Not delivered', refunded: 'Refunded', cancelled: 'Cancelled' },
    fr: { quote: 'Non payé', awaiting_payment: 'Confirmation du paiement', paid: 'En attente de vérification', sending: 'Envoi en cours',
      retrying: 'Nouvel essai sous peu', delivered: 'Livré', failed: 'Non livré', refunded: 'Remboursé', cancelled: 'Annulé' },
    es: { quote: 'Sin pagar', awaiting_payment: 'Confirmando el pago', paid: 'En espera de envío', sending: 'Enviándose',
      retrying: 'Se intentará de nuevo', delivered: 'Entregado', failed: 'No entregado', refunded: 'Reembolsado', cancelled: 'Cancelado' },
  };
  app.get('/api/fax/status/:token', (req, res) => {
    const f = db.prepare('SELECT * FROM fax_orders WHERE status_token = ?').get(String(req.params.token || ''));
    if (!f || f.status === 'quote') return res.status(404).json({ error: 'Not found.' });
    const lg = langOf(f.lang);
    res.json({ ref: f.public_ref, lang: lg, to: pretty(f.to_number), pages: f.pages, price: money(f.price_cents, f.currency), status: f.status,
      status_text: STATUS_TEXT[lg][f.status] || f.status, status_label: STATUS_LABEL[lg][f.status] || f.status, paid_at: f.paid_at, delivered_at: f.delivered_at });
  });

  // ---------- Stripe: called from the main /webhook handler ----------
  function onCheckoutCompleted(session) {
    if (!session || session.metadata?.kind !== 'fax') return false;
    const f = db.prepare('SELECT * FROM fax_orders WHERE public_ref = ?').get(String(session.metadata.fax_ref || ''));
    if (!f) { console.error('[fax] paid session for unknown fax', session.metadata.fax_ref); return true; }
    if (session.payment_status !== 'paid') return true;
    const stripeEmail = String((session.customer_details && session.customer_details.email) || session.customer_email || '').slice(0, 200) || null;
    const r = db.prepare("UPDATE fax_orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP, payment_intent = ?, stripe_session_id = ?, email = COALESCE(email, ?) WHERE id = ? AND status IN ('quote','awaiting_payment')")
      .run(String(session.payment_intent || ''), String(session.id || ''), stripeEmail, f.id);
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
    const lg = langOf(f.lang), num = pretty(f.to_number), n = f.pages, s = n === 1 ? '' : 's';
    const when = new Date(String(f.delivered_at || '').replace(' ', 'T') + 'Z')
      .toLocaleString({ fr: 'fr-CA', es: 'es-US' }[lg] || 'en-CA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
    const W = {
      en: { paid: { subject: `Your Letterhome fax is confirmed: ${f.public_ref}`, h1: 'Your fax is in.',
          p: `We've received your payment. We'll email you again once it has gone through.` },
        done: { subject: `Your fax to ${num} was delivered: ${f.public_ref}`, h1: 'Your fax was delivered.',
          p: `The fax machine at ${num} received all ${n} page${s} on ${when}. Keep this email as your record that it was sent.` },
        rows: ['Fax number', 'Pages', 'Order'], linkText: 'Check your fax' },
      fr: { paid: { subject: `Votre fax Letterhome est confirmé : ${f.public_ref}`, h1: 'Nous avons reçu votre fax.',
          p: `Nous avons reçu votre paiement. Nous vous écrirons de nouveau une fois qu’il sera passé.` },
        done: { subject: `Votre fax au ${num} a été livré : ${f.public_ref}`, h1: 'Votre fax a été livré.',
          p: `Le télécopieur du ${num} a reçu les ${n} page${s} le ${when}. Conservez ce courriel comme preuve de l’envoi.` },
        rows: ['Numéro de fax', 'Pages', 'Commande'], linkText: 'Suivre votre fax' },
      es: { paid: { subject: `Su fax de Letterhome está confirmado: ${f.public_ref}`, h1: 'Recibimos su fax.',
          p: `Recibimos su pago. Le escribiremos otra vez cuando se haya entregado.` },
        done: { subject: `Su fax al ${num} se entregó: ${f.public_ref}`, h1: 'Su fax se entregó.',
          p: `La máquina de fax del ${num} recibió ${n === 1 ? 'la página' : `las ${n} páginas`} el ${when}. Guarde este correo como comprobante del envío.` },
        rows: ['Número de fax', 'Páginas', 'Pedido'], linkText: 'Consulte su fax' },
    }[lg];
    const T = which === 'paid' ? W.paid : W.done;
    const rows = [[W.rows[0], num], [W.rows[1], String(n)], [W.rows[2], f.public_ref]];
    sendMail({ from: process.env.EMAIL_FROM, to: f.email, replyTo: process.env.OPERATOR_EMAIL, subject: T.subject,
      html: emailShell({ h1: T.h1, p: T.p, rows, link, linkText: W.linkText, lang: lg }),
      text: [T.h1, '', T.p, '', ...rows.map(r => `${r[0]}: ${r[1]}`), '', `${W.linkText}: ${link}`].join('\n') },
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
    const rows = db.prepare(`SELECT id, public_ref, status, email, sender_name, to_number, cover_note, cover_json, pages, price_cents, currency, attempts, failure_reason,
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

module.exports = { register, schema, normalizeNumber, verifyTelnyx, priceFor, priceParts, pretty, kindOf, MSG, PAGE_PATH };
