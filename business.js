'use strict';
// Business portal (TEST): companies sign in, upload a CSV, write one letter with merge fields, and submit the batch
// for the owner's approval. Approving a batch only marks it approved: nothing is sent to PostGrid from here yet.
//
// Two registrars, because the admin API must come after the admin CSRF middleware in server.js while the portal API
// needs its own larger body parser (a batch is a few hundred rows) and so must come before the global 64 kB one:
//   registerPortal(app, deps)  → /api/portal/*  and the /portal page
//   registerAdmin(app, deps)   → /api/admin/businesses*, /api/admin/business-*

const path = require('node:path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');

const HARD_MAX_ROWS = 500;
const DEFAULT_MAX_ROWS = 200;
const TEMPLATE_MAX = 10000;
const COUNTRY_CODES = { CA: 'Canada', US: 'United States', GB: 'United Kingdom', AU: 'Australia' };
const COUNTRY_ALIASES = {
  canada: 'CA', ca: 'CA', can: 'CA',
  'united states': 'US', usa: 'US', us: 'US', 'u.s.': 'US', 'u.s.a.': 'US', america: 'US',
  'united kingdom': 'GB', uk: 'GB', gb: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  australia: 'AU', au: 'AU',
};
const CA_PROVINCES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);
const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP'.split(' '));

// CSV column names we understand for the address, after lower-casing and turning punctuation into underscores.
const FIELD_ALIASES = {
  name:     ['name', 'full_name', 'recipient', 'recipient_name', 'to', 'contact', 'contact_name'],
  street:   ['street', 'address', 'address1', 'address_1', 'street_address', 'address_line_1', 'mailing_address'],
  city:     ['city', 'town', 'municipality'],
  province: ['province', 'prov', 'state', 'state_province', 'province_state', 'region'],
  postal:   ['postal', 'postal_code', 'postcode', 'zip', 'zip_code', 'zipcode'],
  country:  ['country', 'country_code'],
};

// ── Pure helpers (exported for tests) ──────────────────────────────────────────────────────────────────────────────
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanText = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
const mergeKey = h => String(h ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no look-alike characters
  const bytes = randomBytes(14);
  let out = '';
  for (let i = 0; i < 14; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function validPassword(p) {
  if (typeof p !== 'string' || p.length < 10) return 'Use at least 10 characters.';
  if (p.length > 128) return 'Use 128 characters or fewer.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Use letters and at least one number.';
  return null;
}

// One CSV row (header → value) into a cleaned piece plus a list of plain-language problems.
function normalizeRow(raw) {
  const row = {};
  for (const [k, v] of Object.entries(raw || {})) { const key = mergeKey(k); if (key && !(key in row)) row[key] = clean(v, 500); }
  const pick = f => { for (const a of FIELD_ALIASES[f]) if (row[a]) return row[a]; return ''; };
  const issues = [];

  const name = pick('name'), street = pick('street'), city = pick('city');
  let province = pick('province').toUpperCase().replace(/\./g, ''), postal = pick('postal').toUpperCase();
  const countryRaw = pick('country');
  let country = 'CA';
  if (countryRaw) {
    country = COUNTRY_ALIASES[countryRaw.toLowerCase()] || (COUNTRY_CODES[countryRaw.toUpperCase()] ? countryRaw.toUpperCase() : '');
    if (!country) issues.push(`Country "${countryRaw}" is not supported in the test (Canada, US, UK, Australia)`);
  }

  if (!name) issues.push('Missing name');
  if (!street) issues.push('Missing street address');
  if (!city) issues.push('Missing city');
  if (country === 'CA') {
    postal = postal.replace(/[^A-Z0-9]/g, '');
    if (!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(postal)) issues.push(`Postal code "${pick('postal')}" is not a valid Canadian postal code`);
    else postal = postal.slice(0, 3) + ' ' + postal.slice(3);
    if (!CA_PROVINCES.has(province)) issues.push(`Province "${pick('province')}" needs a two-letter code like ON or BC`);
  } else if (country === 'US') {
    if (!/^\d{5}(-\d{4})?$/.test(postal)) issues.push(`ZIP code "${pick('postal')}" is not valid`);
    if (!US_STATES.has(province)) issues.push(`State "${pick('province')}" needs a two-letter code like NY`);
  } else if (country && !postal) issues.push('Missing postal code');

  return { piece: { name, street, city, province, postal, country: country || '', merge: row }, issues };
}

// Fills {{field}} placeholders from a row. Values are inserted as plain text (the letter becomes a PDF, not a web page).
function renderTemplate(template, merge) {
  const missing = new Set();
  const body = String(template).replace(/\{\{\s*([A-Za-z0-9_ .-]{1,40}?)\s*\}\}/g, (_m, k) => {
    const key = mergeKey(k);
    const aliasGroup = Object.values(FIELD_ALIASES).find(g => g.includes(key));
    const v = merge[key] || (aliasGroup ? aliasGroup.map(a => merge[a]).find(Boolean) : '');
    if (!v) missing.add(k.trim());
    return v || '';
  });
  return { body, missing: [...missing] };
}

function templateFields(template) {
  return [...new Set([...String(template).matchAll(/\{\{\s*([A-Za-z0-9_ .-]{1,40}?)\s*\}\}/g)].map(m => m[1].trim()))];
}

const money = c => '$' + (c / 100).toFixed(2);

// ── Registrars ─────────────────────────────────────────────────────────────────────────────────────────────────────
function registerPortal(app, { db, getSetting, sendMail }) {
  const enabled = () => getSetting('business_portal_enabled', 'true') === 'true';
  const router = express.Router();

  // Never cached, never indexed.
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });
  router.use((req, res, next) => enabled() ? next() : res.status(503).json({ error: 'The business portal is switched off right now.' }));

  // Cross-site request protection for everything that changes data: a custom header (which a browser will not send
  // across sites without permission) plus an Origin check, on top of the SameSite=Lax session cookie.
  router.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const origin = req.headers.origin;
    const base = (process.env.BASE_URL || '').replace(/\/$/, '');
    if (origin && base && origin !== base && origin !== base.replace('://', '://www.') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      return res.status(403).json({ error: 'Forbidden' });
    if (req.headers['x-requested-with'] !== 'portal') return res.status(403).json({ error: 'Forbidden' });
    next();
  });

  const skipInTest = () => process.env.NODE_ENV === 'test';
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, skip: skipInTest, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' } });
  const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 120, skip: skipInTest, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' } });

  // Per-account throttle on top of the per-IP limiter: 8 failures, then 15 minutes.
  const fails = new Map();
  const locked = k => { const r = fails.get(k); if (!r) return false; if (Date.now() > r.until) { fails.delete(k); return false; } return r.count >= 8; };
  const failed = k => {
    const now = Date.now(), r = fails.get(k) && now <= fails.get(k).until ? fails.get(k) : { count: 0 };
    r.count++; r.until = now + 15 * 60 * 1000; fails.set(k, r);
    if (fails.size > 5000) for (const [kk, v] of fails) if (now > v.until) fails.delete(kk);
  };

  const DUMMY_HASH = '$2a$12$invalidhashpaddingtopreventiumenumeration000000000000000';

  router.post('/login', loginLimiter, express.json({ limit: '4kb' }), async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 200) : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' });
    if (locked(email)) return res.status(429).json({ error: 'Too many failed sign-ins. Try again in 15 minutes.' });
    const u = db.prepare(`SELECT u.*, b.status AS business_status, b.deleted_at AS business_deleted FROM business_users u
                          JOIN businesses b ON b.id = u.business_id WHERE u.email = ?`).get(email);
    const ok = await bcrypt.compare(password, u?.password_hash || DUMMY_HASH);
    if (!u || !ok || u.disabled_at || u.business_deleted) { failed(email); return res.status(401).json({ error: 'Incorrect email or password.' }); }
    if (u.business_status !== 'active') return res.status(403).json({ error: 'This business account is paused. Please contact Letterhome.' });
    fails.delete(email);
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Could not sign in. Please try again.' });
      req.session.business = { userId: u.id, businessId: u.business_id };
      db.prepare('UPDATE business_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(u.id);
      req.session.save(e2 => e2 ? res.status(500).json({ error: 'Could not sign in. Please try again.' }) : res.json({ ok: true, mustChangePassword: !!u.must_change_password }));
    });
  });

  router.post('/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

  // Everything below needs a signed-in business user whose business is still active.
  function requireBusiness(req, res, next) {
    const s = req.session?.business;
    if (!s) return res.status(401).json({ error: 'Please sign in.' });
    const usr = db.prepare('SELECT id, email, name, role, must_change_password, disabled_at FROM business_users WHERE id = ? AND business_id = ?').get(s.userId, s.businessId);
    const biz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(s.businessId);
    if (!usr || !biz || usr.disabled_at || biz.deleted_at || biz.status !== 'active') {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Please sign in.' });
    }
    req.biz = { user: { id: usr.id, email: usr.email, name: usr.name, role: usr.role, mustChangePassword: !!usr.must_change_password }, business: biz };
    next();
  }
  router.use(requireBusiness);
  router.use(writeLimiter);

  // While the temporary password is still in use, nothing but changing it (and signing out) works.
  router.use((req, res, next) => {
    if (req.biz.user.mustChangePassword && !(req.method === 'GET' && req.path === '/me') && req.path !== '/change-password')
      return res.status(403).json({ error: 'Please choose a new password first.', mustChangePassword: true });
    next();
  });

  router.get('/me', (req, res) => {
    const b = req.biz.business;
    const stats = db.prepare(`SELECT
        COUNT(*) AS batches,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN piece_count END), 0) AS pieces_approved,
        COALESCE(SUM(CASE WHEN status = 'approved' AND strftime('%Y-%m', decided_at) = strftime('%Y-%m', 'now') THEN total_cents END), 0) AS month_cents,
        COALESCE(SUM(CASE WHEN status = 'pending_approval' THEN 1 END), 0) AS pending
      FROM business_batches WHERE business_id = ?`).get(b.id);
    res.json({
      user: req.biz.user,
      business: { name: b.name, pricePerPieceCents: b.price_per_piece_cents, maxBatchSize: Math.min(b.max_batch_size || DEFAULT_MAX_ROWS, HARD_MAX_ROWS) },
      stats,
      testMode: true,
    });
  });

  router.post('/change-password', express.json({ limit: '4kb' }), async (req, res) => {
    const cur = typeof req.body?.current === 'string' ? req.body.current : '';
    const next = typeof req.body?.next === 'string' ? req.body.next : '';
    const row = db.prepare('SELECT password_hash FROM business_users WHERE id = ?').get(req.biz.user.id);
    if (!(await bcrypt.compare(cur, row.password_hash))) return res.status(400).json({ error: 'Your current password is not right.' });
    const err = validPassword(next);
    if (err) return res.status(400).json({ error: err });
    if (next === cur) return res.status(400).json({ error: 'Choose a password you have not used before.' });
    db.prepare('UPDATE business_users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(await bcrypt.hash(next, 12), req.biz.user.id);
    res.json({ ok: true });
  });

  router.use(express.json({ limit: '1mb' }));

  router.get('/batches', (req, res) => {
    res.json(db.prepare(`SELECT id, name, status, piece_count, issue_count, total_cents, created_at, submitted_at, decided_at, admin_note
                         FROM business_batches WHERE business_id = ? ORDER BY id DESC LIMIT 100`).all(req.biz.business.id));
  });

  // Dry run: check rows and render the first few without saving, so the page can show problems before anything is stored.
  function processRows(template, rows, maxRows) {
    const out = []; let issueCount = 0;
    rows.forEach((raw, i) => {
      const { piece, issues } = normalizeRow(raw);
      const { body, missing } = renderTemplate(template, piece.merge);
      for (const m of missing) issues.push(`The letter uses {{${m}}} but this row has no "${m}" value`);
      if (issues.length) issueCount++;
      out.push({ row_num: i + 1, piece, body, issues });
    });
    return { pieces: out, issueCount };
  }

  function validateBatchInput(b, maxRows) {
    const name = clean(b?.name, 120);
    const template = cleanText(b?.template, TEMPLATE_MAX + 1);
    if (!name) return { error: 'Give the batch a name.' };
    if (!template.trim()) return { error: 'Write the letter first.' };
    if (template.length > TEMPLATE_MAX) return { error: `The letter is too long (limit ${TEMPLATE_MAX} characters).` };
    if (!Array.isArray(b?.rows) || !b.rows.length) return { error: 'Add at least one recipient.' };
    if (b.rows.length > maxRows) return { error: `This test allows up to ${maxRows} recipients per batch. Split the file and upload it in parts.` };
    for (const r of b.rows) if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).length > 40) return { error: 'The recipient list could not be read.' };
    return { name, template };
  }

  router.post('/batches/check', (req, res) => {
    const maxRows = Math.min(req.biz.business.max_batch_size || DEFAULT_MAX_ROWS, HARD_MAX_ROWS);
    const v = validateBatchInput(req.body, maxRows);
    if (v.error) return res.status(400).json({ error: v.error });
    const { pieces, issueCount } = processRows(v.template, req.body.rows, maxRows);
    res.json({
      count: pieces.length, issueCount,
      totalCents: pieces.length * req.biz.business.price_per_piece_cents,
      problems: pieces.filter(p => p.issues.length).slice(0, 50).map(p => ({ row: p.row_num, name: p.piece.name, issues: p.issues })),
      sample: pieces.slice(0, 3).map(p => ({ row: p.row_num, to: [p.piece.name, p.piece.street, `${p.piece.city} ${p.piece.province} ${p.piece.postal}`.trim(), COUNTRY_CODES[p.piece.country] || ''].filter(Boolean), body: p.body })),
    });
  });

  router.post('/batches', (req, res) => {
    const b = req.biz.business;
    const maxRows = Math.min(b.max_batch_size || DEFAULT_MAX_ROWS, HARD_MAX_ROWS);
    const v = validateBatchInput(req.body, maxRows);
    if (v.error) return res.status(400).json({ error: v.error });
    const { pieces, issueCount } = processRows(v.template, req.body.rows, maxRows);
    let batchId;
    db.exec('BEGIN');
    try {
      batchId = Number(db.prepare(`INSERT INTO business_batches (business_id, created_by, name, template, piece_count, issue_count, price_per_piece_cents, total_cents)
                                   VALUES (?,?,?,?,?,?,?,?)`)
        .run(b.id, req.biz.user.id, v.name, v.template, pieces.length, issueCount, b.price_per_piece_cents, pieces.length * b.price_per_piece_cents).lastInsertRowid);
      const ins = db.prepare(`INSERT INTO business_pieces (batch_id, row_num, recipient_name, street, city, province, postal, country, merge_json, body, issues)
                              VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      for (const p of pieces) ins.run(batchId, p.row_num, p.piece.name, p.piece.street, p.piece.city, p.piece.province, p.piece.postal, p.piece.country,
        JSON.stringify(p.piece.merge), p.body, JSON.stringify(p.issues));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); console.error('[portal] batch save failed:', e.message); return res.status(500).json({ error: 'Could not save the batch.' }); }
    res.json({ ok: true, id: batchId, issueCount });
  });

  function ownBatch(req, res) {
    const batch = db.prepare('SELECT * FROM business_batches WHERE id = ? AND business_id = ?').get(Number(req.params.id), req.biz.business.id);
    if (!batch) { res.status(404).json({ error: 'Batch not found.' }); return null; }
    return batch;
  }

  router.get('/batches/:id', (req, res) => {
    const batch = ownBatch(req, res); if (!batch) return;
    const pieces = db.prepare(`SELECT row_num, recipient_name, street, city, province, postal, country, issues FROM business_pieces WHERE batch_id = ? ORDER BY row_num LIMIT 500`).all(batch.id)
      .map(p => ({ ...p, issues: JSON.parse(p.issues || '[]') }));
    const first = db.prepare('SELECT body FROM business_pieces WHERE batch_id = ? ORDER BY row_num LIMIT 1').get(batch.id);
    res.json({ batch: { id: batch.id, name: batch.name, status: batch.status, piece_count: batch.piece_count, issue_count: batch.issue_count, total_cents: batch.total_cents,
      price_per_piece_cents: batch.price_per_piece_cents, created_at: batch.created_at, submitted_at: batch.submitted_at, decided_at: batch.decided_at, admin_note: batch.admin_note, template: batch.template },
      pieces, sample: first?.body || '' });
  });

  router.get('/batches/:id/pieces/:row', (req, res) => {
    const batch = ownBatch(req, res); if (!batch) return;
    const p = db.prepare('SELECT row_num, recipient_name, street, city, province, postal, country, body FROM business_pieces WHERE batch_id = ? AND row_num = ?').get(batch.id, Number(req.params.row));
    if (!p) return res.status(404).json({ error: 'Not found.' });
    res.json(p);
  });

  router.post('/batches/:id/submit', (req, res) => {
    const batch = ownBatch(req, res); if (!batch) return;
    if (batch.status !== 'draft') return res.status(409).json({ error: 'This batch has already been submitted.' });
    if (batch.issue_count > 0) return res.status(409).json({ error: `${batch.issue_count} recipient${batch.issue_count === 1 ? ' has' : 's have'} problems. Fix your file and upload it again.` });
    if (batch.piece_count < 1) return res.status(409).json({ error: 'This batch is empty.' });
    db.prepare("UPDATE business_batches SET status = 'pending_approval', submitted_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'draft'").run(batch.id);
    const owner = process.env.OPERATOR_EMAIL || process.env.EMAIL_FROM;
    if (owner) sendMail({ from: process.env.EMAIL_FROM, to: owner, subject: `Business batch to approve: ${req.biz.business.name} (${batch.piece_count} pieces)`,
      text: `${req.biz.business.name} submitted "${batch.name}" with ${batch.piece_count} pieces (${money(batch.total_cents)}).\n\nReview it in the admin panel: ${process.env.BASE_URL}/admin/businesses/${req.biz.business.id}\n` }, 'business_batch_submitted').catch(() => {});
    res.json({ ok: true });
  });

  router.post('/batches/:id/cancel', (req, res) => {
    const batch = ownBatch(req, res); if (!batch) return;
    if (!['draft', 'pending_approval'].includes(batch.status)) return res.status(409).json({ error: 'This batch can no longer be cancelled.' });
    db.prepare("UPDATE business_batches SET status = 'cancelled', decided_at = CURRENT_TIMESTAMP WHERE id = ?").run(batch.id);
    res.json({ ok: true });
  });

  app.use('/api/portal', router);

  // The page itself (outside /public so it is never served as a static file or listed in the sitemap).
  const sendPage = (_req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.sendFile(path.join(__dirname, 'portal', 'portal.html'));
  };
  app.get('/portal', sendPage);
  app.get('/portal/', sendPage);
}

function registerAdmin(app, { db, requireAdmin, logAudit, getSetting, setSetting }) {
  const asInt = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
  const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;

  function businessFields(b, existing) {
    const f = {
      name: clean(b.name ?? existing?.name, 120),
      contact_name: clean(b.contact_name ?? existing?.contact_name, 120),
      contact_email: clean(b.contact_email ?? existing?.contact_email, 200).toLowerCase(),
      phone: clean(b.phone ?? existing?.phone, 40),
      industry: clean(b.industry ?? existing?.industry, 80),
      billing_terms: clean(b.billing_terms ?? existing?.billing_terms, 200),
      notes: cleanText(b.notes ?? existing?.notes, 2000),
      price_per_piece_cents: asInt(b.price_per_piece_cents ?? existing?.price_per_piece_cents, 50, 10000, 600),
      monthly_fee_cents: asInt(b.monthly_fee_cents ?? existing?.monthly_fee_cents, 0, 1000000, 0),
      max_batch_size: asInt(b.max_batch_size ?? existing?.max_batch_size, 1, HARD_MAX_ROWS, DEFAULT_MAX_ROWS),
      status: (b.status ?? existing?.status) === 'paused' ? 'paused' : 'active',
    };
    if (!f.name) return { error: 'Business name is required.' };
    if (f.contact_email && !emailOk(f.contact_email)) return { error: 'Contact email does not look right.' };
    return { f };
  }

  app.get('/api/admin/businesses', requireAdmin, (_req, res) => {
    const rows = db.prepare(`SELECT b.*,
        (SELECT COUNT(*) FROM business_users u WHERE u.business_id = b.id AND u.disabled_at IS NULL) AS users,
        (SELECT COUNT(*) FROM business_batches x WHERE x.business_id = b.id) AS batches,
        (SELECT COUNT(*) FROM business_batches x WHERE x.business_id = b.id AND x.status = 'pending_approval') AS pending,
        (SELECT COALESCE(SUM(piece_count),0) FROM business_batches x WHERE x.business_id = b.id AND x.status = 'approved') AS pieces_approved
      FROM businesses b WHERE b.deleted_at IS NULL ORDER BY b.id DESC`).all();
    const queue = db.prepare(`SELECT x.id, x.name, x.piece_count, x.total_cents, x.submitted_at, b.id AS business_id, b.name AS business_name
      FROM business_batches x JOIN businesses b ON b.id = x.business_id WHERE x.status = 'pending_approval' ORDER BY x.submitted_at`).all();
    res.json({ businesses: rows, queue, portalEnabled: getSetting('business_portal_enabled', 'true') === 'true' });
  });

  app.post('/api/admin/businesses/portal-switch', requireAdmin, (req, res) => {
    const on = req.body?.enabled === true;
    setSetting('business_portal_enabled', on ? 'true' : 'false');
    logAudit(req, 'business.portal_switch', 'setting', 'business_portal_enabled', { enabled: on });
    res.json({ ok: true, portalEnabled: on });
  });

  // Creates the business and its first (owner) login. The temporary password is returned once and never stored in plain text.
  app.post('/api/admin/businesses', requireAdmin, async (req, res) => {
    const v = businessFields(req.body || {}); if (v.error) return res.status(400).json({ error: v.error });
    const ownerEmail = clean(req.body?.owner_email, 200).toLowerCase();
    if (!emailOk(ownerEmail)) return res.status(400).json({ error: 'Enter the email the business owner will sign in with.' });
    if (db.prepare('SELECT 1 FROM business_users WHERE email = ?').get(ownerEmail)) return res.status(409).json({ error: 'That email already has a portal login.' });
    const pw = tempPassword();
    const hash = await bcrypt.hash(pw, 12);
    let id;
    db.exec('BEGIN');
    try {
      id = Number(db.prepare(`INSERT INTO businesses (name, contact_name, contact_email, phone, industry, status, price_per_piece_cents, monthly_fee_cents, max_batch_size, billing_terms, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(v.f.name, v.f.contact_name, v.f.contact_email, v.f.phone, v.f.industry, v.f.status, v.f.price_per_piece_cents, v.f.monthly_fee_cents, v.f.max_batch_size, v.f.billing_terms, v.f.notes).lastInsertRowid);
      db.prepare("INSERT INTO business_users (business_id, email, name, role, password_hash) VALUES (?,?,?,'owner',?)").run(id, ownerEmail, v.f.contact_name, hash);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); console.error('[business] create failed:', e.message); return res.status(500).json({ error: 'Could not create the business.' }); }
    logAudit(req, 'business.create', 'business', id, { name: v.f.name, owner: ownerEmail });
    res.json({ ok: true, id, login: { email: ownerEmail, tempPassword: pw } });
  });

  app.get('/api/admin/businesses/:id', requireAdmin, (req, res) => {
    const b = db.prepare('SELECT * FROM businesses WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
    if (!b) return res.status(404).json({ error: 'Not found' });
    const users = db.prepare('SELECT id, email, name, role, must_change_password, disabled_at, last_login_at, created_at FROM business_users WHERE business_id = ? ORDER BY id').all(b.id);
    const batches = db.prepare(`SELECT id, name, status, piece_count, issue_count, total_cents, created_at, submitted_at, decided_at, admin_note FROM business_batches WHERE business_id = ? ORDER BY id DESC LIMIT 100`).all(b.id);
    res.json({ business: b, users, batches });
  });

  app.put('/api/admin/businesses/:id', requireAdmin, (req, res) => {
    const b = db.prepare('SELECT * FROM businesses WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
    if (!b) return res.status(404).json({ error: 'Not found' });
    const v = businessFields(req.body || {}, b); if (v.error) return res.status(400).json({ error: v.error });
    const f = v.f;
    db.prepare(`UPDATE businesses SET name=?, contact_name=?, contact_email=?, phone=?, industry=?, status=?, price_per_piece_cents=?, monthly_fee_cents=?, max_batch_size=?, billing_terms=?, notes=? WHERE id=?`)
      .run(f.name, f.contact_name, f.contact_email, f.phone, f.industry, f.status, f.price_per_piece_cents, f.monthly_fee_cents, f.max_batch_size, f.billing_terms, f.notes, b.id);
    logAudit(req, 'business.update', 'business', b.id, { status: f.status, price_per_piece_cents: f.price_per_piece_cents });
    res.json({ ok: true });
  });

  app.post('/api/admin/businesses/:id/users', requireAdmin, async (req, res) => {
    const b = db.prepare('SELECT id FROM businesses WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
    if (!b) return res.status(404).json({ error: 'Not found' });
    const email = clean(req.body?.email, 200).toLowerCase();
    if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email.' });
    if (db.prepare('SELECT 1 FROM business_users WHERE email = ?').get(email)) return res.status(409).json({ error: 'That email already has a portal login.' });
    const pw = tempPassword();
    const r = db.prepare("INSERT INTO business_users (business_id, email, name, role, password_hash) VALUES (?,?,?,'member',?)").run(b.id, email, clean(req.body?.name, 120), await bcrypt.hash(pw, 12));
    logAudit(req, 'business.user_add', 'business', b.id, { email });
    res.json({ ok: true, id: Number(r.lastInsertRowid), login: { email, tempPassword: pw } });
  });

  app.post('/api/admin/business-users/:id/reset-password', requireAdmin, async (req, res) => {
    const u = db.prepare('SELECT id, email, business_id FROM business_users WHERE id = ?').get(Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'Not found' });
    const pw = tempPassword();
    db.prepare('UPDATE business_users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(await bcrypt.hash(pw, 12), u.id);
    logAudit(req, 'business.user_reset', 'business', u.business_id, { email: u.email });
    res.json({ ok: true, login: { email: u.email, tempPassword: pw } });
  });

  app.post('/api/admin/business-users/:id/disable', requireAdmin, (req, res) => {
    const u = db.prepare('SELECT id, email, business_id, disabled_at FROM business_users WHERE id = ?').get(Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'Not found' });
    const disable = req.body?.disabled !== false;
    db.prepare(`UPDATE business_users SET disabled_at = ${disable ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = ?`).run(u.id);
    logAudit(req, disable ? 'business.user_disable' : 'business.user_enable', 'business', u.business_id, { email: u.email });
    res.json({ ok: true });
  });

  app.get('/api/admin/business-batches/:id', requireAdmin, (req, res) => {
    const batch = db.prepare('SELECT x.*, b.name AS business_name FROM business_batches x JOIN businesses b ON b.id = x.business_id WHERE x.id = ?').get(Number(req.params.id));
    if (!batch) return res.status(404).json({ error: 'Not found' });
    const pieces = db.prepare('SELECT row_num, recipient_name, street, city, province, postal, country, issues FROM business_pieces WHERE batch_id = ? ORDER BY row_num LIMIT 500').all(batch.id)
      .map(p => ({ ...p, issues: JSON.parse(p.issues || '[]') }));
    const first = db.prepare('SELECT body FROM business_pieces WHERE batch_id = ? ORDER BY row_num LIMIT 1').get(batch.id);
    res.json({ batch, pieces, sample: first?.body || '' });
  });

  // TEST: approving records the decision only. Nothing is printed or sent to PostGrid from here.
  app.post('/api/admin/business-batches/:id/decision', requireAdmin, (req, res) => {
    const batch = db.prepare('SELECT * FROM business_batches WHERE id = ?').get(Number(req.params.id));
    if (!batch) return res.status(404).json({ error: 'Not found' });
    if (batch.status !== 'pending_approval') return res.status(409).json({ error: 'This batch is not waiting for approval.' });
    const approve = req.body?.decision === 'approve';
    if (!approve && req.body?.decision !== 'reject') return res.status(400).json({ error: 'Choose approve or reject.' });
    const note = clean(req.body?.note, 500);
    db.prepare('UPDATE business_batches SET status = ?, admin_note = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?').run(approve ? 'approved' : 'rejected', note || null, batch.id);
    logAudit(req, approve ? 'business.batch_approve' : 'business.batch_reject', 'business_batch', batch.id, { business_id: batch.business_id, pieces: batch.piece_count });
    res.json({ ok: true });
  });
}

module.exports = { registerPortal, registerAdmin, normalizeRow, renderTemplate, templateFields, validPassword, tempPassword, mergeKey };
