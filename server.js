require('dotenv').config();

const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn:              process.env.SENTRY_DSN,
    environment:      process.env.NODE_ENV || 'production',
    tracesSampleRate: 0,  // performance monitoring off — errors only
  });
}

const express      = require('express');
const compression  = require('compression');
const helmet       = require('helmet');
const multer    = require('multer');
const Stripe    = require('stripe');
const mailer    = require('nodemailer');
const rateLimit = require('express-rate-limit');
const session   = require('express-session');
const FileStore = require('session-file-store')(session);
const bcrypt    = require('bcryptjs');
const { Secret, TOTP } = require('otpauth');
const cron      = require('node-cron');
const path = require('path');
const fs   = require('fs');
const { randomUUID, createHmac, createHash, createCipheriv, scryptSync, randomBytes, timingSafeEqual } = require('node:crypto');
const B2 = require('backblaze-b2');

fs.mkdirSync('uploads', { recursive: true });
fs.mkdirSync('orders',  { recursive: true });
fs.mkdirSync('backups', { recursive: true });

if (process.env.NODE_ENV === 'production') {
  const required = ['SESSION_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'BASE_URL', 'EMAIL_FROM'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('[startup] Missing required env vars:', missing.join(', '));
    process.exit(1);
  }
}

const app    = express();
// Request chain is: visitor → Cloudflare → Caddy → Node, so two trusted proxies
// sit in front of the app. With the wrong count, req.ip resolves to a proxy IP
// instead of the real visitor, breaking rate-limiting and IP logging/alerts.
app.set('trust proxy', 2);
app.use(compression());
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

app.use(session({
  store:             new FileStore({ path: './sessions', ttl: 30 * 24 * 60 * 60, retries: 1, reapInterval: 3600, reapAsync: true }),
  secret:            process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   30 * 24 * 60 * 60 * 1000,
  },
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'",
                    'https://maps.googleapis.com',
                    'https://www.googletagmanager.com',
                    'https://www.google-analytics.com',
                    'https://static.cloudflareinsights.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:',
                    'https://www.googletagmanager.com',
                    'https://www.google-analytics.com'],
      connectSrc:  ["'self'",
                    'https://maps.googleapis.com',
                    'https://places.googleapis.com',
                    'https://maps.gstatic.com',
                    'https://www.google-analytics.com',
                    'https://analytics.google.com',
                    'https://cloudflareinsights.com'],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
      formAction:    ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      upgradeInsecureRequests: [],
    },
  },
  // COEP intentionally disabled: 'require-corp' blocks Google Maps Places
  // assets (used for address autocomplete) since they don't send CORP opt-in
  // headers. Cross-origin isolation provides no benefit here (no SharedArrayBuffer).
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'sameorigin' },
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

app.use((req, res, next) => {
  const p = req.path;
  if (
    p.startsWith('/admin') ||
    p.startsWith('/account') ||
    p.startsWith('/api/admin') ||
    p.startsWith('/api/account')
  ) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma',        'no-cache');
    res.setHeader('Expires',       '0');
  }
  next();
});

const db = require('./db');

function logAudit(req, action, target_type, target_id, details) {
  try {
    db.prepare(`INSERT INTO audit_log (actor, action, target_type, target_id, details, ip) VALUES (?,?,?,?,?,?)`)
      .run(req.session?.admin?.username || 'system', action, target_type || null, String(target_id || ''), details ? JSON.stringify(details) : null, (req.ip || '').replace(/^::ffff:/, ''));
  } catch (e) { console.error('audit log failed:', e.message); }
}

const ipCountryCache = new Map();
const IP_CACHE_TTL_MS = 24 * 3600 * 1000;

function getClientIp(req) {
  const xff = ((req.headers['x-forwarded-for'] || '').toString().split(',')[0] || '').trim();
  const raw = xff || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  return raw.replace(/^::ffff:/, '');
}

function isPrivateIp(ip) {
  if (!ip) return true;
  return /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fe80:|fc00:|fd)/i.test(ip);
}

async function lookupCountry(ip) {
  if (!ip || isPrivateIp(ip)) return null;
  const cached = ipCountryCache.get(ip);
  if (cached && Date.now() - cached.time < IP_CACHE_TTL_MS) return cached;
  try {
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,country`, {
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const d = await r.json();
      if (d && d.success && d.country_code) {
        const result = { country_code: d.country_code, country_name: d.country || '', time: Date.now() };
        if (ipCountryCache.size > 5000) {
          const sorted = [...ipCountryCache.entries()].sort((a,b) => a[1].time - b[1].time);
          for (let i = 0; i < sorted.length / 2; i++) ipCountryCache.delete(sorted[i][0]);
        }
        ipCountryCache.set(ip, result);
        return result;
      }
    }
  } catch {}
  try {
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode`, {
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const d = await r.json();
      if (d && d.status === 'success' && d.countryCode) {
        const result = { country_code: d.countryCode, country_name: d.country || '', time: Date.now() };
        ipCountryCache.set(ip, result);
        return result;
      }
    }
  } catch {}
  return null;
}

function unsubscribeToken(email) {
  const key = process.env.SESSION_SECRET || 'unsubscribe-fallback-key';
  return createHmac('sha256', key).update(String(email).toLowerCase()).digest('hex').slice(0, 24);
}
function unsubscribeLink(email) {
  const base = process.env.BASE_URL || '';
  return `${base}/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubscribeToken(email)}`;
}

// Have-I-Been-Pwned k-anonymity check. Fail-open if the API is down.
async function isPasswordBreached(password) {
  try {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const r = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: AbortSignal.timeout(2500),
      headers: { 'User-Agent': 'Letterhome', 'Add-Padding': 'true' },
    });
    if (!r.ok) return false;
    const text = await r.text();
    return text.split('\n').some(line => line.split(':')[0].trim() === suffix);
  } catch { return false; }
}

// Password reset tokens bind to the current password_hash so they invalidate
// the moment the password changes.
function passwordResetToken(email, currentHash) {
  const ts = Date.now();
  const key = process.env.SESSION_SECRET || 'reset-fallback-key';
  const data = `${String(email).toLowerCase()}.${ts}.${currentHash || ''}.reset`;
  const hmac = createHmac('sha256', key).update(data).digest('hex');
  return `${ts}.${hmac}`;
}
function verifyPasswordResetToken(email, currentHash, token, maxAgeMs = 30 * 60 * 1000) {
  const [tsStr, hmac] = String(token || '').split('.');
  const ts = Number(tsStr);
  if (!ts || !hmac) return false;
  if (Date.now() - ts > maxAgeMs) return false;
  const key = process.env.SESSION_SECRET || 'reset-fallback-key';
  const data = `${String(email).toLowerCase()}.${ts}.${currentHash || ''}.reset`;
  const expected = createHmac('sha256', key).update(data).digest('hex');
  try { return timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex')); }
  catch { return false; }
}

const failedAdminLogins = new Map(); // ip -> [timestamps]
let lastFailedLoginAlertAt = 0;
function recordFailedAdminLogin(ip, username) {
  const now = Date.now();
  const winMs = 60 * 60 * 1000;
  // Sweep expired/empty entries so credential-stuffing from many IPs can't
  // grow this map without bound (the public /admin/login endpoint is a target).
  for (const [k, ts] of failedAdminLogins) {
    const live = ts.filter(t => now - t < winMs);
    if (live.length) failedAdminLogins.set(k, live);
    else failedAdminLogins.delete(k);
  }
  const list = (failedAdminLogins.get(ip) || []).filter(t => now - t < winMs);
  list.push(now);
  failedAdminLogins.set(ip, list);
  if (list.length >= 5 && now - lastFailedLoginAlertAt > 30 * 60 * 1000) {
    lastFailedLoginAlertAt = now;
    const adminEmail = process.env.ADMIN_EMAIL || process.env.OPERATOR_EMAIL || process.env.SMTP_USER;
    if (adminEmail) {
      sendMail({
        from:    process.env.EMAIL_FROM,
        to:      adminEmail,
        subject: '[Letterhome] Multiple failed admin login attempts',
        text:    `${list.length} failed admin login attempts in the last hour from IP ${ip}.\n` +
                 `Last attempted username: ${username || '(blank)'}\n\n` +
                 `If this is you, you can ignore this. Otherwise consider blocking this IP at Cloudflare.\n\n` +
                 `Time: ${new Date(now).toISOString()}`,
      }, 'failed_login_alert').catch(() => {});
    }
  }
}

// Encrypted backup helpers. Format: salt(16) || iv(12) || authTag(16) || ciphertext.
function encryptFile(srcPath, destPath, passphrase) {
  const salt = randomBytes(16);
  const iv   = randomBytes(12);
  const key  = scryptSync(passphrase, salt, 32, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plain  = fs.readFileSync(srcPath);
  const cipherText = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  fs.writeFileSync(destPath, Buffer.concat([salt, iv, authTag, cipherText]));
}

function validateCustomerPassword(pwd) {
  if (!pwd || pwd.length < 8)          return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pwd))           return 'Password must include at least one letter.';
  if (!/[0-9!@#$%^&*()\-_=+[\]{}|;:,.<>?]/.test(pwd))
    return 'Password must include at least one number or symbol.';
  return null;
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`)
    .run(key, String(value ?? ''));
}

const transport = mailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// CASL: commercial electronic messages must carry a valid physical mailing address.
const MAILING_ADDRESS = '90 King St E, Hamilton, ON L8G 1K7, Canada';

async function sendMail(opts, type = 'general', orderId = null) {
  if (!process.env.SMTP_HOST) return;
  await transport.sendMail(opts);
  try {
    const toAddr = Array.isArray(opts.to) ? opts.to.join(', ') : (opts.to || '');
    db.prepare('INSERT INTO email_log (to_email, subject, type, order_id) VALUES (?,?,?,?)')
      .run(toAddr, opts.subject || '', type, orderId || null);
  } catch (e) { console.error('[email_log]', e.message); }
}

const upload = multer({
  dest: 'uploads',
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter(req, file, cb) {
    const ext  = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    const extOk  = ['.pdf', '.doc', '.docx', '.txt'].includes(ext);
    const mimeOk = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ].includes(mime);
    if (extOk && mimeOk) return cb(null, true);
    // Reject loudly so the customer gets a clear error instead of having the
    // file silently dropped and the order placed without their attachment.
    const err = new Error('Unsupported file type. Please upload PDF, DOC, DOCX, or TXT files.');
    err.code = 'UNSUPPORTED_FILE_TYPE';
    cb(err);
  },
});

// Wraps upload.array so multer errors (size limit, file count, bad type) become
// friendly 400s rather than a generic 500 from the global error handler.
function uploadAttachments(req, res, next) {
  upload.array('attachments', 5)(req, res, err => {
    if (!err) return next();
    const messages = {
      LIMIT_FILE_SIZE:       'One of your files is too large. The limit is 10 MB per file.',
      LIMIT_FILE_COUNT:      'Too many files. You can attach up to 5.',
      UNSUPPORTED_FILE_TYPE: err.message,
    };
    return res.status(400).json({ error: messages[err.code] || 'Could not process your attachments. Please try again.' });
  });
}

function orderDirPath(id, createdAt) {
  const date = new Date(createdAt).toISOString().slice(0, 10);
  return path.join(__dirname, 'orders', `${date}_${String(id).padStart(5, '0')}`);
}

function safeFilePath(dir, originalName) {
  // path.basename strips any directory components (e.g. ../../etc/passwd → passwd)
  const safe = path.basename(originalName).replace(/[\x00-\x1f\x7f]/g, '');
  const ext  = path.extname(safe);
  const base = path.basename(safe, ext) || 'file';
  let dest = path.join(dir, safe);
  let i = 1;
  while (fs.existsSync(dest)) dest = path.join(dir, `${base}_${i++}${ext}`);
  if (!path.resolve(dest).startsWith(path.resolve(dir) + path.sep)) {
    throw new Error('Invalid upload path');
  }
  return dest;
}

;(function backfillStatusTokens() {
  try {
    const rows = db.prepare('SELECT id FROM orders WHERE status_token IS NULL').all();
    const stmt = db.prepare('UPDATE orders SET status_token = ? WHERE id = ?');
    for (const r of rows) stmt.run(randomUUID(), r.id);
    if (rows.length) console.log(`[init] assigned status tokens to ${rows.length} orders`);
  } catch (e) { console.error('[init] token backfill failed:', e.message); }
})();

;(async function abandonedOrderRecovery() {
  try {
    const cutoff2d  = new Date(Date.now() - 2  * 86400 * 1000).toISOString();
    const cutoff7d  = new Date(Date.now() - 7  * 86400 * 1000).toISOString();
    const cutoff30d = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const abandoned = db.prepare(`
      SELECT * FROM orders
      WHERE status = 'awaiting_payment'
        AND created_at < ?
        AND created_at > ?
        AND recovery_sent_at IS NULL
        AND customer_email IS NOT NULL
        AND customer_email LIKE '%_@_%.__%'
        AND NOT EXISTS (
          SELECT 1 FROM orders o2
          WHERE o2.customer_email = orders.customer_email
            AND o2.recovery_sent_at > ?
        )
    `).all(cutoff2d, cutoff7d, cutoff30d);
    for (const order of abandoned) {
      try {
        await sendMail(buildRecoveryEmail(order), 'recovery', order.id);
        db.prepare("UPDATE orders SET recovery_sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
        console.log(`[recovery] sent recovery email for order #${order.id} to ${order.customer_email}`);
      } catch (e) { console.error(`[recovery] failed for order #${order.id}:`, e.message); }
    }
  } catch (e) { console.error('[recovery] startup check failed:', e.message); }
})();

;(async function occasionReminders() {
  try {
    const occasions = db.prepare('SELECT * FROM occasions').all();
    const now = new Date();
    const currentYear = now.getFullYear();
    for (const occ of occasions) {
      try {
        const [mm, dd] = occ.occasion_date.split('-').map(Number);
        const occasionThisYear = new Date(currentYear, mm - 1, dd);
        const remindOn = new Date(occasionThisYear.getTime() - occ.remind_days_before * 86400 * 1000);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (today >= remindOn && today <= occasionThisYear && occ.last_reminded_year !== currentYear) {
          const lastOrder = db.prepare(`
            SELECT * FROM orders
            WHERE customer_email = ? AND status IN ('paid','submitted_to_printer','mailed','delivered')
            ORDER BY created_at DESC LIMIT 1
          `).get(occ.customer_email);
          await sendMail(buildOccasionReminderEmail(occ, lastOrder), 'occasion_reminder');
          db.prepare('UPDATE occasions SET last_reminded_year = ? WHERE id = ?').run(currentYear, occ.id);
          console.log(`[occasions] sent reminder for occasion #${occ.id} to ${occ.customer_email}`);
        }
      } catch (e) { console.error(`[occasions] failed for occasion #${occ.id}:`, e.message); }
    }
  } catch (e) { console.error('[occasions] startup check failed:', e.message); }
})();

;(async function slaAlerts() {
  if (!process.env.OPERATOR_EMAIL) return;
  try {
    const cutoff20h = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const overdue = db.prepare(`
      SELECT * FROM orders
      WHERE status IN ('paid','submitted_to_printer')
        AND created_at < ?
        AND sla_alert_sent_at IS NULL
        AND deleted_at IS NULL
    `).all(cutoff20h);
    if (overdue.length) {
      const lines = overdue.map(o =>
        `  Order #${o.id} — ${o.recipient_name} — ${o.status} — created ${o.created_at}`
      ).join('\n');
      await sendMail({
        from:    process.env.EMAIL_FROM,
        to:      process.env.OPERATOR_EMAIL,
        subject: `[Letterhome] SLA Alert — ${overdue.length} order${overdue.length > 1 ? 's' : ''} overdue`,
        text:    `The following orders have been in paid/submitted_to_printer status for over 20 hours:\n\n${lines}\n\nPlease take action.`,
      }, 'sla_alert');
      const stmt = db.prepare('UPDATE orders SET sla_alert_sent_at = CURRENT_TIMESTAMP WHERE id = ?');
      for (const o of overdue) stmt.run(o.id);
      console.log(`[sla] sent alert for ${overdue.length} overdue orders`);
    }
  } catch (e) { console.error('[sla] startup check failed:', e.message); }
})();

;(function cleanupOldOrderFolders() {
  const cutoff = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  try {
    const old = db.prepare(
      "SELECT id, created_at FROM orders WHERE status IN ('mailed','delivered','refunded') AND created_at < ?"
    ).all(cutoff);
    for (const o of old) {
      const dir = orderDirPath(o.id, o.created_at);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`[privacy] deleted order folder: ${path.basename(dir)}`);
      }
    }
  } catch (e) { console.error('[privacy] startup cleanup failed:', e.message); }

  // Purge abandoned orders that were never paid. Stripe checkout sessions expire
  // within 24h, so anything still 'awaiting_payment' after 30 days is dead — but
  // it still holds the customer's address, letter text, and attachments on disk
  // and in the DB. Delete the folder and soft-delete the row.
  const abandonedCutoff = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  try {
    const abandoned = db.prepare(
      "SELECT id, created_at FROM orders WHERE status = 'awaiting_payment' AND created_at < ? AND deleted_at IS NULL"
    ).all(abandonedCutoff);
    for (const o of abandoned) {
      const dir = orderDirPath(o.id, o.created_at);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`[privacy] deleted abandoned order folder: ${path.basename(dir)}`);
      }
      db.prepare("UPDATE orders SET deleted_at = CURRENT_TIMESTAMP, letter_body = NULL, attachment_info = '[]' WHERE id = ?").run(o.id);
    }
    if (abandoned.length) console.log(`[privacy] purged ${abandoned.length} abandoned unpaid orders`);
  } catch (e) { console.error('[privacy] abandoned-order cleanup failed:', e.message); }
})();

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    await fulfillOrder(event.data.object.id).catch(console.error);
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ limit: '64kb', extended: true }));

app.get('/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', db: 'ok', uptime: Math.floor(process.uptime()) });
  } catch (e) {
    res.status(503).json({ status: 'error', db: 'error', message: e.message });
  }
});

// RFC 9116 security.txt — vulnerability disclosure channel. Served at both the
// canonical /.well-known/ path and the legacy root path.
const SECURITY_TXT = [
  'Contact: mailto:support@letterhome.ca',
  'Expires: 2027-06-09T00:00:00.000Z',
  'Preferred-Languages: en',
  'Canonical: https://letterhome.ca/.well-known/security.txt',
].join('\n') + '\n';
['/.well-known/security.txt', '/security.txt'].forEach(p =>
  app.get(p, (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(SECURITY_TXT);
  })
);

['send', 'guides', 'privacy', 'terms', 'refunds', 'about', 'contact', 'track', 'order-success',
 'from-usa', 'from-uk', 'from-australia', 'from-uae', 'from-france',
 'from-hong-kong', 'from-india', 'from-philippines',
 'from-china', 'from-italy', 'from-germany', 'from-pakistan', 'send-documents-to-canada',
 'how-to-send-a-letter-to-canada-from-abroad', 'how-to-mail-cra-tax-forms-from-outside-canada',
 'how-to-address-a-letter-to-canada', 'how-much-does-it-cost-to-mail-a-letter-to-canada',
 'comment-envoyer-une-lettre-au-canada',
].forEach(p =>
  app.get(`/${p}`, (req, res) =>
    res.sendFile(path.join(__dirname, 'public', `${p}.html`))
  )
);
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public', 'account.html')));
app.get('/account/:page', (req, res) => res.sendFile(path.join(__dirname, 'public', 'account.html')));

app.get('/faq', (req, res) => res.redirect('/#faq'));

function unsubPage(state, email = '') {
  const safeEmail = String(email).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const headings = {
    invalid:    { title: 'Invalid unsubscribe link', body: "We couldn't verify this unsubscribe link. It may be malformed, or copied incompletely from an email. If you want to opt out, reply to any email from us and we'll handle it manually." },
    confirm:    { title: 'Unsubscribe from Letterhome emails?', body: `We'll stop sending marketing or update emails to <strong>${safeEmail}</strong>. You'll still receive transactional messages tied to orders you place (payment confirmations, status updates).` },
    done:       { title: "You've been unsubscribed.", body: `We've removed <strong>${safeEmail}</strong> from our marketing list. You won't receive any more update emails from us. If you change your mind, email <a href="mailto:support@letterhome.ca">support@letterhome.ca</a>.` },
    already:    { title: "Already unsubscribed.", body: `<strong>${safeEmail}</strong> is already opted out of our marketing emails.` },
  }[state];
  const action = state === 'confirm' ? `
    <form method="POST" action="/unsubscribe" style="margin-top:24px">
      <input type="hidden" name="email" value="${safeEmail}">
      <input type="hidden" name="token" value="${unsubscribeToken(email)}">
      <button type="submit" style="background:#a8472d;color:#faf6ec;border:none;padding:14px 28px;font-size:14px;font-weight:500;letter-spacing:0.02em;text-transform:uppercase;border-radius:2px;cursor:pointer;font-family:inherit">Confirm Unsubscribe</button>
    </form>` : '';
  return `<!DOCTYPE html><html lang="en-CA"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${headings.title} — Letterhome</title>
<meta name="robots" content="noindex,nofollow">
<link rel="stylesheet" href="/fonts.css">
<style>body{font-family:'Source Serif 4',Georgia,serif;background:#f1ebde;color:#2a2a2a;margin:0;padding:80px 24px;line-height:1.6}
.box{max-width:520px;margin:0 auto;background:#faf6ec;border:1px solid rgba(42,42,42,0.14);padding:48px 40px;border-radius:2px;box-shadow:0 2px 6px rgba(42,42,42,0.06)}
h1{font-family:'DM Serif Display',serif;font-size:32px;font-weight:400;margin:0 0 16px;letter-spacing:-0.02em}
p{color:#6b6258;font-size:16px;margin:0}
a{color:#a8472d}</style></head><body>
<div class="box"><h1>${headings.title}</h1><p>${headings.body}</p>${action}
<p style="margin-top:32px;font-size:13px"><a href="/">← Back to Letterhome</a></p></div></body></html>`;
}

app.get('/unsubscribe', (req, res) => {
  const email = (req.query.email || '').toString().trim().toLowerCase();
  const token = (req.query.token || '').toString();
  const expected = unsubscribeToken(email);
  const safe = token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!email || !safe) return res.status(400).send(unsubPage('invalid'));
  const row = db.prepare('SELECT unsubscribed_at FROM customers WHERE email = ?').get(email);
  if (row?.unsubscribed_at) return res.send(unsubPage('already', email));
  res.send(unsubPage('confirm', email));
});

app.post('/unsubscribe', (req, res) => {
  const email = (req.body.email || '').toString().trim().toLowerCase();
  const token = (req.body.token || '').toString();
  const expected2 = unsubscribeToken(email);
  const safe2 = token.length === expected2.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected2));
  if (!email || !safe2) return res.status(400).send(unsubPage('invalid'));
  const existing = db.prepare('SELECT email FROM customers WHERE email = ?').get(email);
  if (existing) {
    db.prepare('UPDATE customers SET unsubscribed_at = CURRENT_TIMESTAMP WHERE email = ? AND unsubscribed_at IS NULL').run(email);
  } else {
    db.prepare('INSERT INTO customers (email, unsubscribed_at) VALUES (?, CURRENT_TIMESTAMP)').run(email);
  }
  res.send(unsubPage('done', email));
});

app.get('/status/:token', (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE status_token = ? AND deleted_at IS NULL").get(req.params.token);
  if (!order || order.status === 'awaiting_payment') return res.status(404).send(buildStatusNotFound());
  res.send(buildStatusPage(order));
});

app.use(express.static('public', {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    } else if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  },
}));

app.get('/ga.js', (req, res) => {
  const id = process.env.GA4_MEASUREMENT_ID;
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  // No measurement ID configured — serve an inert script rather than a stray default property.
  if (!id) return res.send('/* analytics disabled: GA4_MEASUREMENT_ID not set */');
  res.send(`
(function(){
  try{if(localStorage.getItem('lh-analytics-consent')!=='yes')return;}catch(e){return;}
  window.dataLayer=window.dataLayer||[];
  function gtag(){dataLayer.push(arguments);}
  gtag('js',new Date());
  gtag('config','${id}');
  (function(){var s=document.createElement('script');s.async=true;
  s.src='https://www.googletagmanager.com/gtag/js?id=${id}';
  document.head.appendChild(s);})();
})();
`.trim());
});

app.get('/api/site-config', (req, res) => {
  res.json({
    orders_open:               getSetting('service_paused', 'false') !== 'true',
    announcement:              getSetting('announcement', ''),
    price_domestic_cents:      parseInt(getSetting('price_domestic_cents',      '1000')) || 1000,
    price_international_cents: parseInt(getSetting('price_international_cents', '2000')) || 2000,
    blocked_countries:         JSON.parse(getSetting('blocked_countries', '[]') || '[]'),
  });
});

app.get('/api/visitor-country', async (req, res) => {
  try {
    // Cloudflare hands us the visitor's country for free on every request —
    // instant and rate-limit-proof, unlike the external IP-geo fallback.
    const cf = (req.headers['cf-ipcountry'] || '').toString().toUpperCase();
    if (cf.length === 2 && cf !== 'XX' && cf !== 'T1') {
      return res.json({ country_code: cf });
    }
    const ip = getClientIp(req);
    const result = await lookupCountry(ip);
    res.json({ country_code: result?.country_code || null });
  } catch {
    res.json({ country_code: null });
  }
});

function parseUA(ua) {
  let device = 'desktop';
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua))    device = 'tablet';
  else if (/Mobile|iPhone|Android/i.test(ua))         device = 'mobile';
  let browser = 'Other';
  if      (/Edg\//i.test(ua))                         browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua))                   browser = 'Opera';
  else if (/Firefox/i.test(ua))                       browser = 'Firefox';
  else if (/Chrome/i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua))                        browser = 'Safari';
  return { device, browser };
}

app.use((req, res, next) => {
  try {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/'))      return next();
    if (req.path.startsWith('/admin'))     return next();
    if (req.path === '/webhook')           return next();
    if (req.path.startsWith('/status/'))   return next();
    if (req.path === '/ga.js')             return next();
    if (/\.[a-z0-9]+$/i.test(req.path))    return next();

    const ip  = getClientIp(req);
    const ua  = req.headers['user-agent'] || '';
    const ref = req.headers['referer'] || req.headers['referrer'] || '';

    let referrer = '';
    try {
      if (ref) {
        const u = new URL(ref);
        const host = (req.headers.host || '').split(':')[0];
        if (u.hostname && u.hostname !== host) referrer = u.hostname;
      }
    } catch {}

    const { device, browser } = parseUA(ua);

    let rowId;
    try {
      const result = db.prepare(
        'INSERT INTO page_views (path, ip, referrer, device_type, browser) VALUES (?, ?, ?, ?, ?)'
      ).run(req.path, ip, referrer, device, browser);
      rowId = result.lastInsertRowid;
    } catch (e) {
      console.error('[pageview]', e.message);
      return next();
    }

    if (rowId && ip && !isPrivateIp(ip)) {
      lookupCountry(ip).then(r => {
        if (r) {
          try {
            db.prepare('UPDATE page_views SET country_code = ?, country_name = ? WHERE id = ?')
              .run(r.country_code, r.country_name, rowId);
          } catch {}
        }
      }).catch(() => {});
    }
  } catch {}
  next();
});

const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.set('Retry-After', '3600');
    res.status(429).json({ error: 'Too many requests from this IP. Please try again in an hour.' });
  },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.set('Retry-After', '3600');
    res.status(429).json({ error: 'Too many messages sent. Please try again in an hour.' });
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tracking requests. Please try again in a few minutes.' },
});

// Per-email failed-attempt lockout for /api/track
const trackFailures = new Map();
const TRACK_MAX_FAILURES = 5;
const TRACK_LOCKOUT_MS = 60 * 60 * 1000; // 1 hour
function checkTrackLockout(email) {
  const rec = trackFailures.get(email);
  if (!rec) return false;
  if (Date.now() > rec.until) { trackFailures.delete(email); return false; }
  return rec.count >= TRACK_MAX_FAILURES;
}
function recordTrackFailure(email) {
  // Drop expired entries so this map can't grow without bound under enumeration.
  const now = Date.now();
  for (const [k, v] of trackFailures) if (now > v.until) trackFailures.delete(k);
  const rec = trackFailures.get(email) || { count: 0, until: now + TRACK_LOCKOUT_MS };
  rec.count += 1;
  rec.until = now + TRACK_LOCKOUT_MS;
  trackFailures.set(email, rec);
}
function clearTrackFailures(email) { trackFailures.delete(email); }

const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
function requireAdmin(req, res, next) {
  if (req.session?.admin) {
    const loginAt = req.session.admin.loginAt || 0;
    if (Date.now() - loginAt > ADMIN_SESSION_MAX_AGE_MS) {
      delete req.session.admin;
      return req.session.save(() => {
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
        res.redirect('/admin/login');
      });
    }
    return next();
  }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/admin/login');
}

function requireCustomer(req, res, next) {
  if (req.session?.customer?.email) return next();
  res.status(401).json({ error: 'Not logged in.' });
}

app.post('/api/create-order', orderLimiter, uploadAttachments, async (req, res) => {
  if (getSetting('service_paused', 'false') === 'true')
    return res.status(503).json({ error: 'Orders are currently paused. Please check back soon.' });

  const b = req.body;
  const rEmail  = (b['r-email']  || '').trim().toLowerCase();
  const rName   = (b['r-name']   || '').trim();
  const rStreet = (b['r-street'] || '').trim();

  if (!rEmail || !rName || !rStreet)
    return res.status(400).json({ error: 'Missing required fields.' });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rEmail))
    return res.status(400).json({ error: 'Please enter a valid email address.' });

  const blockedCountries = JSON.parse(getSetting('blocked_countries', '[]') || '[]');
  if (blockedCountries.includes(b['r-country']))
    return res.status(400).json({ error: 'We are not currently shipping to that destination.' });

  const dailyCap = parseInt(getSetting('daily_order_cap', '0')) || 0;
  if (dailyCap > 0) {
    const todayCount = db.prepare(`
      SELECT COUNT(*) as n FROM orders
      WHERE status != 'awaiting_payment' AND deleted_at IS NULL
        AND date(created_at) = date('now')
    `).get().n;
    if (todayCount >= dailyCap)
      return res.status(503).json({ error: "We've reached our order limit for today. Please try again tomorrow." });
  }

  const isDomestic = b['r-country'] === 'CA';
  const priceCents = isDomestic
    ? (parseInt(getSetting('price_domestic_cents',      '1000')) || 1000)
    : (parseInt(getSetting('price_international_cents', '2000')) || 2000);

  const tempFiles = (req.files || []).map(f => ({
    tempPath:     f.path,
    originalName: f.originalname,
    mimeType:     f.mimetype,
  }));

  const customerIp = (req.ip || '').replace(/^::ffff:/, '');

  const row = db.prepare(`
    INSERT INTO orders (
      customer_email, skip_return,
      sender_name, sender_street, sender_city, sender_province, sender_postal, sender_country,
      recipient_name, recipient_street, recipient_city, recipient_province, recipient_postal,
      destination_country, letter_type, letter_body, attachment_info, price_cents, customer_ip,
      status_token
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    rEmail, b['skip-return'] ? 1 : 0,
    b['s-name']     || null, b['s-street']   || null, b['s-city']  || null,
    b['s-province'] || null, b['s-postal']   || null, b['s-country'] || null,
    rName, rStreet,
    b['r-city']     || null, b['r-province'] || null, b['r-postal'] || null,
    b['r-country']  || 'CA', 'standard',
    b['letter-body'] || null,
    '[]',
    priceCents,
    customerIp || null,
    randomUUID()
  );

  const orderId  = row.lastInsertRowid;
  const now      = new Date();
  const orderDir = orderDirPath(orderId, now);
  fs.mkdirSync(orderDir, { recursive: true });

  const movedFiles = tempFiles.map(f => {
    const dest = safeFilePath(orderDir, f.originalName);
    fs.renameSync(f.tempPath, dest);
    return { path: dest, originalName: f.originalName, mimeType: f.mimeType };
  });

  if (b['letter-body']) {
    fs.writeFileSync(path.join(orderDir, 'letter.txt'), b['letter-body'], 'utf8');
  }

  fs.writeFileSync(path.join(orderDir, 'order.json'), JSON.stringify({
    id:             orderId,
    created:        now.toISOString(),
    customer_email: rEmail,
    recipient: {
      name: rName, street: rStreet,
      city:     b['r-city']     || null,
      province: b['r-province'] || null,
      postal:   b['r-postal']   || null,
      country:  b['r-country']  || 'CA',
    },
    sender: b['skip-return'] ? null : {
      name:     b['s-name']     || null,
      street:   b['s-street']   || null,
      city:     b['s-city']     || null,
      province: b['s-province'] || null,
      postal:   b['s-postal']   || null,
      country:  b['s-country']  || null,
    },
    letter_type:  'standard',
    price_cents:  priceCents,
    attachments:  movedFiles.map(f => path.basename(f.path)),
  }, null, 2), 'utf8');

  db.prepare('UPDATE orders SET attachment_info = ? WHERE id = ?')
    .run(JSON.stringify(movedFiles), orderId);

  let stripeSession;
  try {
    stripeSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: rEmail,
      line_items: [{
        price_data: {
          currency: 'cad',
          product_data: {
            name: isDomestic ? 'Letterhome — Domestic Letter' : 'Letterhome — International Letter',
            description: `To: ${rName}, ${[b['r-city'], b['r-country']].filter(Boolean).join(' ')}`,
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.BASE_URL}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.BASE_URL}/send`,
      metadata: { order_id: String(orderId) },
    });
  } catch (e) {
    console.error('[create-order] Stripe error:', e.message);
    // Clean up the order and files — payment won't proceed so there's nothing to print
    try {
      db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);
      if (fs.existsSync(orderDir)) fs.rmSync(orderDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error('[create-order] cleanup error after Stripe failure:', cleanupErr.message);
    }
    return res.status(502).json({ error: 'Payment service is temporarily unavailable. Please try again in a moment.' });
  }

  db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?')
    .run(stripeSession.id, orderId);

  res.json({ checkoutUrl: stripeSession.url });
});

app.get('/api/order-status', trackLimiter, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE stripe_session_id = ?')
    .get(req.query.session_id || '');
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.json({
    id:                 order.id,
    status:             order.status,
    recipientName:      order.recipient_name,
    recipientCity:      order.recipient_city,
    destinationCountry: order.destination_country,
    createdAt:          order.created_at,
    priceCents:         order.price_cents,
  });
});

app.post('/api/track', trackLimiter, (req, res) => {
  const { email, order_id } = req.body;
  if (!email || !order_id) return res.status(400).json({ error: 'Email and order ID are required.' });

  const normalizedEmail = email.trim().toLowerCase();
  if (checkTrackLockout(normalizedEmail)) {
    return res.status(429).json({ error: 'Too many failed attempts. Please try again in an hour or contact support.' });
  }

  const order = db.prepare(
    "SELECT * FROM orders WHERE id = ? AND customer_email = ? AND status != 'awaiting_payment'"
  ).get(Number(order_id), normalizedEmail);

  if (!order) {
    recordTrackFailure(normalizedEmail);
    return res.status(404).json({ error: 'No order found. Double-check your order ID and the email used at checkout.' });
  }
  clearTrackFailures(normalizedEmail);

  const messages = {
    paid:                  'Payment confirmed — your letter is being prepared for printing.',
    submitted_to_printer:  'Submitted to printer — being prepared for mailing.',
    printing:              'Printing in progress.',
    mailed:                'Mailed — in transit with Canada Post.',
    delivered:             'Delivered.',
    refunded:              'Refunded.',
  };

  res.json({
    orderId:            order.id,
    status:             order.status,
    statusText:         messages[order.status] || 'In progress.',
    recipientName:      order.recipient_name,
    destinationCountry: order.destination_country,
    createdAt:          order.created_at,
  });
});

app.get('/admin/login', (req, res) => {
  if (req.session?.admin) return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.post('/admin/login', loginLimiter, async (req, res) => {
  const { username, password, code } = req.body;
  // Use Express's req.ip (derived from the trusted-proxy chain) rather than the
  // raw, client-spoofable X-Forwarded-For so the failed-login alert can't be evaded.
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  const validUser = username === process.env.ADMIN_USERNAME;
  const validPass = process.env.ADMIN_PASSWORD_HASH
    ? await bcrypt.compare(password || '', process.env.ADMIN_PASSWORD_HASH)
    : false;
  if (!validUser || !validPass) {
    recordFailedAdminLogin(ip, username);
    return res.redirect('/admin/login?error=1');
  }

  if (process.env.TOTP_SECRET) {
    if (!code) return res.redirect('/admin/login?error=1');
    const totp = new TOTP({
      issuer: 'Letterhome Admin', label: 'admin',
      secret: Secret.fromBase32(process.env.TOTP_SECRET),
    });
    if (totp.validate({ token: code.replace(/\s/g,''), window: 1 }) === null) {
      recordFailedAdminLogin(ip, username);
      return res.redirect('/admin/login?error=1');
    }
  }

  req.session.regenerate(err => {
    if (err) return res.status(500).send('Session error');
    req.session.admin = { username, loginAt: Date.now() };
    req.session.save(err2 => {
      if (err2) return res.status(500).send('Session error');
      res.redirect('/admin');
    });
  });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

app.get('/admin', requireAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, 'admin', 'app.html')));
app.get('/admin/*', requireAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, 'admin', 'app.html')));

// CSRF: reject admin API mutations where a browser Origin header is present
// but doesn't match our own origin. Covers all POST/DELETE/PUT on /api/admin/*.
// sameSite:lax already blocks cross-site form CSRF; this adds a second layer
// for fetch()-based attacks. No-Origin requests (cURL, server tools) pass through.
app.use('/api/admin', (req, res, next) => {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const base = (process.env.BASE_URL || '').replace(/\/$/, '');
  if (base && !origin.startsWith(base)) return res.status(403).json({ error: 'Forbidden' });
  next();
});

app.get('/api/admin/me', requireAdmin, (req, res) =>
  res.json({ username: req.session.admin.username }));

app.get('/api/admin/tetris/scores', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT username, score, lines, level, created_at FROM tetris_scores ORDER BY score DESC LIMIT 10'
    ).all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/tetris/scores', requireAdmin, (req, res) => {
  try {
    const { score, lines, level } = req.body;
    if (typeof score !== 'number' || score < 0) return res.status(400).json({ error: 'Invalid score' });
    const username = req.session.admin.username;
    const info = db.prepare(
      'INSERT INTO tetris_scores (username, score, lines, level) VALUES (?, ?, ?, ?)'
    ).run(username, Math.round(score), Math.round(lines || 0), Math.round(level || 1));
    res.json({ id: info.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/arcade/scores/:game', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT username, score, lines, level, created_at FROM arcade_scores WHERE game = ? ORDER BY score DESC LIMIT 10'
    ).all(req.params.game);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/arcade/scores/:game', requireAdmin, (req, res) => {
  try {
    const { score, lines, level } = req.body;
    if (typeof score !== 'number' || score < 0) return res.status(400).json({ error: 'Invalid score' });
    const info = db.prepare(
      'INSERT INTO arcade_scores (game, username, score, lines, level) VALUES (?,?,?,?,?)'
    ).run(req.params.game, req.session.admin.username, Math.round(score), Math.round(lines || 0), Math.round(level || 1));
    res.json({ id: info.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/arcade/hall-of-fame', requireAdmin, (req, res) => {
  try {
    const games = ['tetris', 'snake', 'breakout', 'invaders', 'postbird'];
    const result = {};
    for (const game of games) {
      result[game] = db.prepare(
        'SELECT username, score FROM arcade_scores WHERE game = ? ORDER BY score DESC LIMIT 1'
      ).get(game) || null;
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const COST_DOMESTIC      = 600;     // $6 per Canadian letter
const COST_INTERNATIONAL = 1200;    // $12 per international letter
const STRIPE_PCT         = 0.029;   // 2.9% Canadian card rate
const STRIPE_FIXED       = 30;      // $0.30 per transaction

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const paidOrders = db.prepare(`
      SELECT price_cents, destination_country, customer_email
      FROM orders WHERE status != 'awaiting_payment' AND deleted_at IS NULL
    `).all();

    let revenue = 0, stripeFees = 0, cogs = 0;
    const customers = new Set();
    paidOrders.forEach(o => {
      revenue    += o.price_cents;
      stripeFees += Math.round(o.price_cents * STRIPE_PCT) + STRIPE_FIXED;
      cogs       += o.destination_country === 'CA' ? COST_DOMESTIC : COST_INTERNATIONAL;
      customers.add(o.customer_email);
    });

    const custOrderCounts = db.prepare(`
      SELECT customer_email, COUNT(*) as n
      FROM orders WHERE status != 'awaiting_payment' AND deleted_at IS NULL
      GROUP BY customer_email
    `).all();

    let oneTime = 0, returning = 0, loyal = 0, repeatCount = 0;
    for (const c of custOrderCounts) {
      if (c.n === 1)      oneTime++;
      else if (c.n <= 4)  returning++;
      else                loyal++;
      if (c.n > 1) repeatCount++;
    }
    const totalCusts = custOrderCounts.length;
    const repeat_rate = totalCusts ? Math.round((repeatCount / totalCusts) * 100) : 0;

    // Find avg days between first and second order using a CTE to avoid
    // aggregate-in-subquery which node:sqlite rejects
    const avgRow = db.prepare(`
      WITH first_orders AS (
        SELECT customer_email, MIN(created_at) AS first_order
        FROM orders
        WHERE status != 'awaiting_payment' AND deleted_at IS NULL
        GROUP BY customer_email
        HAVING COUNT(*) >= 2
      ),
      second_orders AS (
        SELECT o.customer_email,
               MIN(o.created_at) AS second_order,
               f.first_order
        FROM orders o
        JOIN first_orders f ON f.customer_email = o.customer_email
        WHERE o.status != 'awaiting_payment'
          AND o.deleted_at IS NULL
          AND o.created_at > f.first_order
        GROUP BY o.customer_email
      )
      SELECT AVG(CAST((julianday(second_order) - julianday(first_order)) AS REAL)) AS avg_days
      FROM second_orders
    `).get();

    res.json({
      total:       db.prepare('SELECT COUNT(*) as n FROM orders WHERE deleted_at IS NULL').get().n,
      paid:        paidOrders.length,
      revenue,
      stripe_fees: stripeFees,
      cogs,
      net:         revenue - stripeFees - cogs,
      customers:   customers.size,
      repeat_rate,
      segments:    { one_time: oneTime, returning, loyal },
      avg_days_between_orders: avgRow?.avg_days != null ? Math.round(avgRow.avg_days) : null,
    });
  } catch (err) {
    console.error('Stats endpoint error:', err.message);
    res.status(500).json({ error: 'Failed to load stats', detail: err.message });
  }
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare("SELECT * FROM orders WHERE status = ? AND deleted_at IS NULL ORDER BY created_at DESC").all(status)
    : db.prepare("SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC").all();
  res.json(rows);
});

app.get('/api/admin/orders/csv', requireAdmin, (req, res) => {
  const orders = db.prepare(`
    SELECT id, created_at, status, customer_email,
           recipient_name, recipient_street, recipient_city, recipient_province, recipient_postal, destination_country,
           sender_name, sender_country, price_cents, printer_ref
    FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC
  `).all();
  const cols = ['id','created_at','status','customer_email','recipient_name','recipient_street',
                'recipient_city','recipient_province','recipient_postal','destination_country',
                'sender_name','sender_country','price_cents','printer_ref'];
  const rows = orders.map(o => cols.map(c => `"${String(o[c]??'').replace(/"/g,'""')}"`).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send([cols.join(','), ...rows].join('\r\n'));
});

// Soft-delete an order. INVARIANT: never touches the customers table — deleting
// orders must never remove the customer account that placed them.
app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
  db.prepare("UPDATE orders SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(Number(req.params.id));
  logAudit(req, 'order.delete', 'order', Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/orders/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No order IDs provided' });
  const cleanIds = ids.map(Number).filter(Number.isInteger);
  if (!cleanIds.length) return res.status(400).json({ error: 'No valid order IDs' });
  const stmt = db.prepare("UPDATE orders SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL");
  const tx = db.transaction((arr) => { for (const id of arr) stmt.run(id); });
  tx(cleanIds);
  logAudit(req, 'order.bulk_delete', 'order', cleanIds.join(','), { count: cleanIds.length });
  res.json({ ok: true, count: cleanIds.length });
});

app.post('/api/admin/orders/:id/restore', requireAdmin, (req, res) => {
  db.prepare("UPDATE orders SET deleted_at = NULL WHERE id = ?").run(Number(req.params.id));
  logAudit(req, 'order.restore', 'order', Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Not found' });
  const dir   = orderDirPath(order.id, order.created_at);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  res.json({ ...order, files });
});

app.post('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const valid = ['awaiting_payment', 'paid', 'submitted_to_printer', 'printing', 'mailed', 'delivered', 'refunded'];
  if (!valid.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });

  const id = Number(req.params.id);
  const before = db.prepare('SELECT status FROM orders WHERE id = ?').get(id);
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(req.body.status, id);
  logAudit(req, 'order.status_change', 'order', id, { from: before?.status, to: req.body.status });

  if (req.body.status === 'mailed' && before?.status !== 'mailed') {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (order?.customer_email) {
      const isDomestic = order.destination_country === 'CA';
      const deliveryText = order.estimated_delivery || (isDomestic ? 'within 2 weeks' : 'within 4 weeks');
      const toAddr = [
        order.recipient_name, order.recipient_street,
        `${order.recipient_city || ''} ${order.recipient_province || ''} ${order.recipient_postal || ''}`.trim(),
        order.destination_country,
      ].filter(Boolean).join('\n');
      sendMail({
        from:    process.env.EMAIL_FROM,
        to:      order.customer_email,
        subject: `Your letter to ${order.recipient_name} has been mailed — order #${order.id}`,
        html:    buildMailedEmail(order, toAddr, deliveryText),
        text:    buildMailedEmailText(order, toAddr, deliveryText),
      }, 'mailed_notification', id).catch(console.error);
    }
  }

  res.json({ ok: true });
});

app.post('/api/admin/orders/:id/submit-to-printer', requireAdmin, (req, res) => {
  const { printer_ref } = req.body;
  if (!printer_ref?.trim()) return res.status(400).json({ error: 'Printer reference number required' });
  const id    = Number(req.params.id);
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  db.prepare("UPDATE orders SET status = 'submitted_to_printer', printer_ref = ? WHERE id = ?")
    .run(printer_ref.trim(), id);
  logAudit(req, 'order.submitted_to_printer', 'order', id, { printer_ref: printer_ref.trim() });
  res.json({ ok: true });
});

app.post('/api/admin/orders/:id/mark-mailed', requireAdmin, async (req, res) => {
  const { estimated_delivery } = req.body;
  if (!estimated_delivery?.trim()) return res.status(400).json({ error: 'Estimated delivery required' });
  const id    = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'mailed') return res.status(400).json({ error: 'Already marked as mailed' });

  db.prepare("UPDATE orders SET status = 'mailed', estimated_delivery = ? WHERE id = ?")
    .run(estimated_delivery.trim(), id);
  logAudit(req, 'order.mark_mailed', 'order', id, { estimated_delivery: estimated_delivery.trim() });

  const toAddr = [
    order.recipient_name, order.recipient_street,
    `${order.recipient_city || ''} ${order.recipient_province || ''} ${order.recipient_postal || ''}`.trim(),
    order.destination_country,
  ].filter(Boolean).join('\n');

  sendMail({
    from:    process.env.EMAIL_FROM,
    to:      order.customer_email,
    subject: `Your letter to ${order.recipient_name} has been mailed — order #${order.id}`,
    html:    buildMailedEmail(order, toAddr, estimated_delivery.trim()),
    text:    buildMailedEmailText(order, toAddr, estimated_delivery.trim()),
  }, 'mailed_notification', id).catch(console.error);

  res.json({ ok: true });
});

app.get('/api/admin/orders/:id/files/:filename', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Not found' });
  const dir  = orderDirPath(order.id, order.created_at);
  const file = path.resolve(dir, path.basename(req.params.filename));
  if (!file.startsWith(path.resolve(dir) + path.sep)) return res.status(403).json({ error: 'Forbidden' });
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(file);
});

app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const fromOrders = db.prepare(`
    SELECT customer_email as email,
      COUNT(*) as order_count,
      COALESCE(SUM(CASE WHEN status != 'awaiting_payment' THEN price_cents ELSE 0 END), 0) as total_spent,
      MAX(created_at) as last_order
    FROM orders WHERE deleted_at IS NULL GROUP BY customer_email
  `).all();
  const manual = db.prepare(`SELECT email, display_name, created_at, password_hash FROM customers WHERE deleted_at IS NULL`).all();

  const map = {};
  manual.forEach(m => { map[m.email] = { email: m.email, display_name: m.display_name, order_count: 0, total_spent: 0, last_order: m.created_at, has_account: !!m.password_hash }; });
  fromOrders.forEach(o => {
    if (!map[o.email]) map[o.email] = { email: o.email, display_name: null, has_account: false };
    Object.assign(map[o.email], { order_count: o.order_count, total_spent: o.total_spent, last_order: o.last_order });
  });

  const deletedEmails = new Set(db.prepare(`SELECT email FROM customers WHERE deleted_at IS NOT NULL`).all().map(r => r.email));
  const list = Object.values(map).filter(c => !deletedEmails.has(c.email));

  const tags = db.prepare('SELECT customer_email, tag FROM customer_tags').all();
  const tagMap = {};
  tags.forEach(t => { (tagMap[t.customer_email] = tagMap[t.customer_email] || []).push(t.tag); });

  list.forEach(c => { c.tags = tagMap[c.email] || []; });
  list.sort((a, b) => (b.last_order || '').localeCompare(a.last_order || ''));
  res.json(list);
});

app.post('/api/admin/customers', requireAdmin, (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const name  = (req.body.display_name || '').trim() || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
  try {
    db.prepare('INSERT INTO customers (email, display_name) VALUES (?,?)').run(email, name);
  } catch {
    db.prepare('UPDATE customers SET deleted_at = NULL, display_name = COALESCE(?, display_name) WHERE email = ?').run(name, email);
  }
  res.json({ ok: true, email });
});

app.delete('/api/admin/customers/:email', requireAdmin, (req, res) => {
  const email = req.params.email;
  const exists = db.prepare('SELECT email FROM customers WHERE email = ?').get(email);
  if (exists) db.prepare('UPDATE customers SET deleted_at = CURRENT_TIMESTAMP WHERE email = ?').run(email);
  else        db.prepare('INSERT INTO customers (email, deleted_at) VALUES (?, CURRENT_TIMESTAMP)').run(email);
  db.prepare("UPDATE orders SET deleted_at = CURRENT_TIMESTAMP WHERE customer_email = ? AND deleted_at IS NULL").run(email);
  logAudit(req, 'customer.delete', 'customer', email);
  res.json({ ok: true });
});

app.post('/api/admin/customers/:email/restore', requireAdmin, (req, res) => {
  db.prepare('UPDATE customers SET deleted_at = NULL WHERE email = ?').run(req.params.email);
  db.prepare("UPDATE orders SET deleted_at = NULL WHERE customer_email = ?").run(req.params.email);
  logAudit(req, 'customer.restore', 'customer', req.params.email);
  res.json({ ok: true });
});

// CSV export — must be registered before /api/admin/customers/:email to avoid being shadowed by the param route
app.get('/api/admin/customers/export.csv', requireAdmin, (req, res) => {
  const csvEscape = s => {
    const str = String(s ?? '');
    // Prefix formula-triggering chars so Excel/LibreOffice don't execute them as formulas
    const safe = /^[=+\-@]/.test(str) ? ' ' + str : str;
    return /[,"\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };
  const fromOrders = db.prepare(`
    SELECT customer_email as email,
      COUNT(*) as order_count,
      COALESCE(SUM(CASE WHEN status != 'awaiting_payment' THEN price_cents ELSE 0 END),0) as total_spent_cents,
      MAX(created_at) as last_order
    FROM orders WHERE deleted_at IS NULL GROUP BY customer_email
  `).all();
  const manual = db.prepare(`SELECT email, display_name, created_at FROM customers WHERE deleted_at IS NULL`).all();
  const tagRows = db.prepare('SELECT customer_email, tag FROM customer_tags').all();
  const tagMap = {};
  tagRows.forEach(t => { (tagMap[t.customer_email] = tagMap[t.customer_email] || []).push(t.tag); });
  const map = {};
  manual.forEach(m => { map[m.email] = { email: m.email, display_name: m.display_name, order_count: 0, total_spent_cents: 0, last_order: m.created_at }; });
  fromOrders.forEach(o => {
    if (!map[o.email]) map[o.email] = { email: o.email, display_name: '' };
    Object.assign(map[o.email], o);
  });
  const rows = Object.values(map);
  const lines = ['email,name,orders,total_spent_cad,last_order,tags'];
  rows.forEach(r => {
    lines.push([
      csvEscape(r.email), csvEscape(r.display_name || ''),
      r.order_count || 0, ((r.total_spent_cents || 0) / 100).toFixed(2),
      r.last_order || '', csvEscape((tagMap[r.email] || []).join('|')),
    ].join(','));
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="letterhome-customers-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(lines.join('\n'));
});

app.get('/api/admin/customers/:email', requireAdmin, (req, res) => {
  const email   = req.params.email;
  const orders  = db.prepare('SELECT * FROM orders WHERE customer_email = ? AND deleted_at IS NULL ORDER BY created_at DESC').all(email);
  const notes   = db.prepare('SELECT * FROM customer_notes WHERE customer_email = ? ORDER BY created_at DESC').all(email);
  const tags    = db.prepare('SELECT tag FROM customer_tags WHERE customer_email = ?').all(email).map(r => r.tag);
  const manual  = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
  res.json({
    email,
    display_name:    manual?.display_name    || null,
    ip:              manual?.ip              || null,
    country_code:    manual?.country_code    || null,
    country_name:    manual?.country_name    || null,
    sender_name:     manual?.sender_name     || null,
    sender_street:   manual?.sender_street   || null,
    sender_city:     manual?.sender_city     || null,
    sender_province: manual?.sender_province || null,
    sender_postal:   manual?.sender_postal   || null,
    sender_country:  manual?.sender_country  || null,
    has_account:        !!manual?.password_hash,
    account_created_at: manual?.account_created_at || null,
    saved_recipients_count: db.prepare('SELECT COUNT(*) as n FROM saved_recipients WHERE customer_email = ?').get(email).n,
    orders, notes, tags,
  });
});

app.get('/api/admin/audit-log', requireAdmin, (req, res) => {
  const limit  = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const search = (req.query.search || '').toString().trim();
  const action = (req.query.action || '').toString().trim();
  let where = [], params = [];
  if (search) {
    where.push('(actor LIKE ? OR action LIKE ? OR target_id LIKE ? OR ip LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (action) { where.push('action LIKE ?'); params.push(`${action}%`); }
  const sql = `SELECT * FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
  params.push(limit);
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/admin/accounts', requireAdmin, (req, res) => {
  const accounts = db.prepare(`
    SELECT c.email, c.display_name, c.account_created_at,
           (SELECT COUNT(*) FROM saved_recipients WHERE customer_email = c.email) AS recipients_count,
           (SELECT COUNT(*) FROM orders WHERE customer_email = c.email AND deleted_at IS NULL) AS order_count,
           (SELECT MAX(created_at) FROM orders WHERE customer_email = c.email AND deleted_at IS NULL) AS last_order
    FROM customers c
    WHERE c.password_hash IS NOT NULL AND c.deleted_at IS NULL
    ORDER BY c.account_created_at DESC
  `).all();
  res.json(accounts);
});

app.post('/api/admin/customers/:email/reset-password', requireAdmin, async (req, res) => {
  const email = req.params.email;
  const { new_password } = req.body;
  const customer = db.prepare('SELECT email, password_hash FROM customers WHERE email = ? AND deleted_at IS NULL').get(email);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  if (!customer.password_hash) return res.status(400).json({ error: 'This customer does not have an account.' });
  const pwErr = validateCustomerPassword(new_password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const hash = await bcrypt.hash(new_password, 12);
  db.prepare('UPDATE customers SET password_hash = ? WHERE email = ?').run(hash, email);
  logAudit(req, 'customer.password_reset', 'customer', email);
  sendMail({
    from:    process.env.EMAIL_FROM,
    to:      email,
    subject: 'Your Letterhome password was reset by support',
    text:    `Hi,\n\nA Letterhome administrator has reset the password on your account at your request.\n\n` +
             `Your new password has been shared with you separately. After signing in, you can change it from your account page: ${process.env.BASE_URL}/account\n\n` +
             `If you did NOT request this, contact us immediately at ${process.env.OPERATOR_EMAIL || 'support@letterhome.ca'}.\n\n— Letterhome`,
  }, 'password_reset_admin').catch(() => {});
  res.json({ ok: true });
});

app.post('/api/admin/customers/:email/remove-account', requireAdmin, (req, res) => {
  const email = req.params.email;
  const customer = db.prepare('SELECT email, password_hash FROM customers WHERE email = ?').get(email);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  if (!customer.password_hash) return res.status(400).json({ error: 'This customer does not have an account.' });
  db.prepare('UPDATE customers SET password_hash = NULL, account_created_at = NULL WHERE email = ?').run(email);
  db.prepare('DELETE FROM saved_recipients WHERE customer_email = ?').run(email);
  logAudit(req, 'customer.account_removed', 'customer', email);
  res.json({ ok: true });
});

app.get('/api/admin/customers/:email/email-log', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, subject, type, order_id, created_at FROM email_log WHERE to_email = ? ORDER BY created_at DESC LIMIT 100').all(req.params.email);
  res.json(rows);
});

app.get('/api/admin/trash', requireAdmin, (req, res) => {
  const customers = db.prepare(`SELECT email, display_name, deleted_at FROM customers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all();
  const orders    = db.prepare(`SELECT id, recipient_name, destination_country, status, price_cents, created_at, deleted_at, customer_email FROM orders WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all();
  res.json({ customers, orders });
});

app.post('/api/admin/customers/:email/notes', requireAdmin, (req, res) => {
  const { note } = req.body;
  if (!note?.trim()) return res.status(400).json({ error: 'Note is required' });
  db.prepare('INSERT INTO customer_notes (customer_email, note) VALUES (?,?)').run(req.params.email, note.trim());
  res.json({ ok: true });
});

app.post('/api/admin/customers/:email/tags', requireAdmin, (req, res) => {
  const { tag } = req.body;
  if (!tag?.trim()) return res.status(400).json({ error: 'Tag required' });
  try { db.prepare('INSERT INTO customer_tags (customer_email, tag) VALUES (?,?)').run(req.params.email, tag.trim().toLowerCase()); } catch {}
  res.json({ ok: true });
});

app.delete('/api/admin/customers/:email/tags/:tag', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM customer_tags WHERE customer_email = ? AND tag = ?').run(req.params.email, req.params.tag);
  res.json({ ok: true });
});

app.post('/api/admin/orders/:id/message', requireAdmin, async (req, res) => {
  const { subject, body } = req.body;
  if (!subject?.trim() || !body?.trim()) return res.status(400).json({ error: 'Subject and body required' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  try {
    await sendMail({
      from:    process.env.EMAIL_FROM,
      to:      order.customer_email,
      replyTo: process.env.OPERATOR_EMAIL,
      subject: subject.trim(),
      text:    body.trim(),
    }, 'operator_message', order.id);
    logAudit(req, 'order.message_sent', 'order', req.params.id, { to: order.customer_email, subject: subject.trim() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/broadcast', requireAdmin, async (req, res) => {
  const { subject, body, tag } = req.body;
  if (!subject?.trim() || !body?.trim()) return res.status(400).json({ error: 'Subject and body required' });
  let recipients;
  if (tag) {
    recipients = db.prepare(`SELECT DISTINCT customer_email FROM customer_tags WHERE tag = ?`).all(tag.trim().toLowerCase())
      .map(r => r.customer_email);
  } else {
    const fromOrders = db.prepare(`SELECT DISTINCT customer_email as email FROM orders WHERE deleted_at IS NULL AND status != 'awaiting_payment'`).all().map(r => r.email);
    const manual    = db.prepare(`SELECT email FROM customers WHERE deleted_at IS NULL`).all().map(r => r.email);
    recipients = Array.from(new Set([...fromOrders, ...manual]));
  }

  // Filter out unsubscribed customers (CASL compliance)
  const unsubed = new Set(
    db.prepare(`SELECT email FROM customers WHERE unsubscribed_at IS NOT NULL`).all().map(r => r.email)
  );
  const skipped = recipients.length;
  recipients = recipients.filter(e => !unsubed.has(e));
  if (!recipients.length) return res.status(400).json({ error: 'No recipients match (everyone has unsubscribed or no one matches).' });

  logAudit(req, 'broadcast.send', 'broadcast', tag || 'all', { subject, recipients: recipients.length, skipped_unsubscribed: skipped - recipients.length });
  res.json({ ok: true, sentTo: recipients.length, skippedUnsubscribed: skipped - recipients.length });
  (async () => {
    for (const email of recipients) {
      try {
        const link = unsubscribeLink(email);
        await sendMail({
          from:    process.env.EMAIL_FROM,
          to:      email,
          replyTo: process.env.OPERATOR_EMAIL,
          subject: subject.trim(),
          text:    body.trim() +
            '\n\n— Letterhome' +
            `\nYou're receiving this because you've placed an order with us. To stop receiving update emails, visit:\n${link}`,
          headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        }, 'broadcast');
      } catch (err) { console.error('Broadcast to', email, 'failed:', err.message); }
      await new Promise(r => setTimeout(r, 1000));
    }
  })();
});

app.get('/api/admin/broadcast/preview', requireAdmin, (req, res) => {
  const { tag } = req.query;
  const unsubed = new Set(db.prepare(`SELECT email FROM customers WHERE unsubscribed_at IS NOT NULL`).all().map(r => r.email));
  let emails;
  if (tag) {
    emails = db.prepare(`SELECT DISTINCT customer_email AS email FROM customer_tags WHERE tag = ?`).all(String(tag).toLowerCase()).map(r => r.email);
  } else {
    const fromOrders = db.prepare(`SELECT DISTINCT customer_email AS email FROM orders WHERE deleted_at IS NULL AND status != 'awaiting_payment'`).all().map(r => r.email);
    const manual    = db.prepare(`SELECT email FROM customers WHERE deleted_at IS NULL`).all().map(r => r.email);
    emails = Array.from(new Set([...fromOrders, ...manual]));
  }
  const total = emails.length;
  const willSend = emails.filter(e => !unsubed.has(e)).length;
  res.json({ count: willSend, total, unsubscribed: total - willSend });
});

app.get('/api/admin/tags', requireAdmin, (req, res) => {
  const tags = db.prepare(`SELECT tag, COUNT(*) as n FROM customer_tags GROUP BY tag ORDER BY tag`).all();
  res.json(tags);
});

app.post('/api/admin/orders/bulk-status', requireAdmin, async (req, res) => {
  const { ids, status } = req.body;
  const valid = ['awaiting_payment', 'paid', 'submitted_to_printer', 'printing', 'mailed', 'delivered', 'refunded'];
  if (!valid.includes(status) || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Invalid input' });

  const cleanIds = ids.map(Number).filter(Number.isInteger);
  if (!cleanIds.length) return res.status(400).json({ error: 'No valid order IDs' });

  // Snapshot which orders were NOT already mailed before the bulk update,
  // so we only send "mailed" notifications to customers who haven't received one.
  const alreadyMailed = status === 'mailed'
    ? new Set(
        db.prepare(`SELECT id FROM orders WHERE id IN (${cleanIds.map(() => '?').join(',')}) AND status = 'mailed'`)
          .all(...cleanIds).map(r => r.id)
      )
    : new Set();

  const stmt = db.prepare('UPDATE orders SET status = ? WHERE id = ?');
  cleanIds.forEach(id => stmt.run(status, id));
  logAudit(req, 'order.bulk_status', 'order', cleanIds.join(','), { status, count: cleanIds.length });

  if (status === 'mailed') {
    for (const id of cleanIds) {
      if (alreadyMailed.has(id)) continue;
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
      if (!order?.customer_email) continue;
      const isDomestic = order.destination_country === 'CA';
      const deliveryText = order.estimated_delivery || (isDomestic ? 'within 2 weeks' : 'within 4 weeks');
      const toAddr = [
        order.recipient_name, order.recipient_street,
        `${order.recipient_city || ''} ${order.recipient_province || ''} ${order.recipient_postal || ''}`.trim(),
        order.destination_country,
      ].filter(Boolean).join('\n');
      sendMail({
        from:    process.env.EMAIL_FROM,
        to:      order.customer_email,
        subject: `Your letter to ${order.recipient_name} has been mailed — order #${order.id}`,
        html:    buildMailedEmail(order, toAddr, deliveryText),
        text:    buildMailedEmailText(order, toAddr, deliveryText),
      }, 'mailed_notification', id).catch(console.error);
    }
  }

  res.json({ ok: true, count: cleanIds.length });
});

app.post('/api/admin/orders/:id/refund', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order)                       return res.status(404).json({ error: 'Order not found' });
  if (!order.stripe_session_id)     return res.status(400).json({ error: 'No Stripe session for this order' });
  if (order.status === 'refunded')  return res.status(400).json({ error: 'Order already refunded' });
  try {
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    if (!session.payment_intent) return res.status(400).json({ error: 'No payment to refund' });
    const refund = await stripe.refunds.create({ payment_intent: session.payment_intent });
    db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").run(id);
    logAudit(req, 'order.refund', 'order', id, { reason: req.body.reason || null, refund_id: refund.id, amount: refund.amount });
    res.json({ ok: true, refund_id: refund.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/orders/:id/reorder-url', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Not found' });
  const params = new URLSearchParams({
    'r-name':     order.recipient_name || '',
    'r-street':   order.recipient_street || '',
    'r-city':     order.recipient_city || '',
    'r-province': order.recipient_province || '',
    'r-postal':   order.recipient_postal || '',
    'r-country':  order.destination_country || 'CA',
  });
  const url = `${process.env.BASE_URL || ''}/send?${params.toString()}`;
  res.json({ url });
});

app.get('/api/admin/search', requireAdmin, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ orders: [], customers: [] });
  const like = `%${q}%`;
  const orders = db.prepare(`
    SELECT id, recipient_name, customer_email, status, created_at, price_cents, destination_country
    FROM orders
    WHERE deleted_at IS NULL AND (
      CAST(id AS TEXT) = ? OR
      customer_email LIKE ? OR
      recipient_name LIKE ? OR
      recipient_street LIKE ? OR
      recipient_city LIKE ?
    )
    ORDER BY created_at DESC LIMIT 20
  `).all(q, like, like, like, like);
  const customers = db.prepare(`
    SELECT DISTINCT customer_email FROM orders
    WHERE deleted_at IS NULL AND customer_email LIKE ?
    LIMIT 10
  `).all(like).map(r => r.customer_email);
  res.json({ orders, customers });
});

app.get('/api/admin/audit', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200`).all();
  res.json(rows);
});

app.get('/api/admin/stats/chart', requireAdmin, (req, res) => {
  const period = req.query.period === 'weekly' ? 'weekly' : 'monthly';
  let rows;
  if (period === 'monthly') {
    rows = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as label,
             COUNT(*) as orders,
             COALESCE(SUM(price_cents), 0) as revenue_cents
      FROM orders
      WHERE status != 'awaiting_payment' AND deleted_at IS NULL
        AND created_at >= date('now', '-12 months')
      GROUP BY label ORDER BY label ASC
    `).all();
  } else {
    rows = db.prepare(`
      SELECT strftime('%Y-W%W', created_at) as label,
             COUNT(*) as orders,
             COALESCE(SUM(price_cents), 0) as revenue_cents
      FROM orders
      WHERE status != 'awaiting_payment' AND deleted_at IS NULL
        AND created_at >= date('now', '-84 days')
      GROUP BY label ORDER BY label ASC
    `).all();
  }
  res.json(rows);
});

app.get('/api/admin/stats/geo', requireAdmin, (req, res) => {
  const from = db.prepare(`
    SELECT sender_country as country, COUNT(*) as orders
    FROM orders
    WHERE status != 'awaiting_payment' AND deleted_at IS NULL AND sender_country IS NOT NULL
    GROUP BY sender_country ORDER BY orders DESC LIMIT 15
  `).all();
  const to = db.prepare(`
    SELECT destination_country as country, COUNT(*) as orders
    FROM orders
    WHERE status != 'awaiting_payment' AND deleted_at IS NULL
    GROUP BY destination_country ORDER BY orders DESC LIMIT 15
  `).all();
  res.json({ from, to });
});

app.get('/api/admin/visitors/stats', requireAdmin, (req, res) => {
  try {
    const c = (sql, ...args) => db.prepare(sql).get(...args).c;
    const today      = c(`SELECT COUNT(*) as c FROM page_views WHERE date(created_at) = date('now')`);
    const week       = c(`SELECT COUNT(*) as c FROM page_views WHERE created_at >= datetime('now', '-7 days')`);
    const month      = c(`SELECT COUNT(*) as c FROM page_views WHERE created_at >= datetime('now', '-30 days')`);
    const total      = c(`SELECT COUNT(*) as c FROM page_views`);
    const todayUniq  = c(`SELECT COUNT(DISTINCT ip) as c FROM page_views WHERE date(created_at) = date('now')`);
    const weekUniq   = c(`SELECT COUNT(DISTINCT ip) as c FROM page_views WHERE created_at >= datetime('now', '-7 days')`);
    const monthUniq  = c(`SELECT COUNT(DISTINCT ip) as c FROM page_views WHERE created_at >= datetime('now', '-30 days')`);

    const topPages = db.prepare(`
      SELECT path, COUNT(*) as count FROM page_views
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY path ORDER BY count DESC LIMIT 10
    `).all();

    const topCountries = db.prepare(`
      SELECT country_code, country_name, COUNT(*) as count FROM page_views
      WHERE country_code IS NOT NULL AND created_at >= datetime('now', '-30 days')
      GROUP BY country_code ORDER BY count DESC LIMIT 15
    `).all();

    const devices = db.prepare(`
      SELECT device_type, COUNT(*) as count FROM page_views
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY device_type ORDER BY count DESC
    `).all();

    const browsers = db.prepare(`
      SELECT browser, COUNT(*) as count FROM page_views
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY browser ORDER BY count DESC
    `).all();

    const referrers = db.prepare(`
      SELECT referrer, COUNT(*) as count FROM page_views
      WHERE referrer != '' AND referrer IS NOT NULL AND created_at >= datetime('now', '-30 days')
      GROUP BY referrer ORDER BY count DESC LIMIT 10
    `).all();

    const daily = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count, COUNT(DISTINCT ip) as unique_count
      FROM page_views
      WHERE created_at >= date('now', '-14 days')
      GROUP BY day ORDER BY day
    `).all();

    const hourly = db.prepare(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count
      FROM page_views
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY hour ORDER BY hour
    `).all();

    res.json({
      today, week, month, total,
      todayUniq, weekUniq, monthUniq,
      topPages, topCountries, devices, browsers, referrers, daily, hourly,
    });
  } catch (e) {
    console.error('[admin/visitors/stats]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/visitors/recent', requireAdmin, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const rows = db.prepare(`
      SELECT id, path, ip, country_code, country_name, referrer, device_type, browser, created_at
      FROM page_views
      ORDER BY created_at DESC LIMIT ?
    `).all(limit);
    res.json(rows);
  } catch (e) {
    console.error('[admin/visitors/recent]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/orders/:id/notes', requireAdmin, (req, res) => {
  const notes = db.prepare('SELECT * FROM order_notes WHERE order_id = ? ORDER BY created_at DESC')
    .all(Number(req.params.id));
  res.json(notes);
});

app.post('/api/admin/orders/:id/notes', requireAdmin, (req, res) => {
  const { note } = req.body;
  if (!note?.trim()) return res.status(400).json({ error: 'Note is required' });
  db.prepare('INSERT INTO order_notes (order_id, note) VALUES (?,?)').run(Number(req.params.id), note.trim());
  res.json({ ok: true });
});

app.get('/api/admin/customers/:email/occasions', requireAdmin, (req, res) => {
  const occasions = db.prepare('SELECT * FROM occasions WHERE customer_email = ? ORDER BY created_at DESC')
    .all(req.params.email);
  res.json(occasions);
});

app.post('/api/admin/customers/:email/occasions', requireAdmin, (req, res) => {
  const { occasion_name, occasion_date, remind_days_before } = req.body;
  if (!occasion_name?.trim()) return res.status(400).json({ error: 'occasion_name is required' });
  if (!/^\d{2}-\d{2}$/.test(occasion_date || '')) return res.status(400).json({ error: 'occasion_date must match MM-DD' });
  const days = parseInt(remind_days_before, 10);
  db.prepare(`INSERT INTO occasions (customer_email, occasion_name, occasion_date, remind_days_before) VALUES (?,?,?,?)`)
    .run(req.params.email, occasion_name.trim(), occasion_date, isNaN(days) ? 14 : days);
  res.json({ ok: true });
});

app.delete('/api/admin/occasions/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM occasions WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/templates', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM email_templates ORDER BY created_at DESC').all());
});

app.post('/api/admin/templates', requireAdmin, (req, res) => {
  const { name, subject, body } = req.body;
  if (!name?.trim() || !subject?.trim() || !body?.trim()) return res.status(400).json({ error: 'name, subject, and body are required' });
  try {
    db.prepare('INSERT INTO email_templates (name, subject, body) VALUES (?,?,?)').run(name.trim(), subject.trim(), body.trim());
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'A template with that name already exists' });
  }
});

app.delete('/api/admin/templates/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM email_templates WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

const ALLOWED_SETTING_KEYS = new Set([
  'service_paused', 'announcement', 'price_domestic_cents', 'price_international_cents',
  'daily_order_cap', 'blocked_countries', 'away_mode', 'away_message',
]);

app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { key, value } = req.body;
  if (!key?.trim() || typeof value !== 'string') return res.status(400).json({ error: 'key and value are required' });
  if (!ALLOWED_SETTING_KEYS.has(key.trim())) return res.status(400).json({ error: 'Unknown setting key.' });
  setSetting(key.trim(), value);
  logAudit(req, 'settings.change', 'settings', key.trim(), { value });
  res.json({ ok: true });
});

app.post('/api/admin/settings/batch', requireAdmin, (req, res) => {
  const updates = req.body || {};
  for (const key of ALLOWED_SETTING_KEYS) {
    if (key in updates) setSetting(key, updates[key]);
  }
  logAudit(req, 'settings.batch_update', 'settings', null, updates);
  res.json({ ok: true });
});

app.post('/api/admin/orders/:id/actual-cost', requireAdmin, (req, res) => {
  const cost = req.body.actual_cost_cents;
  if (!Number.isInteger(cost) || cost < 0) return res.status(400).json({ error: 'actual_cost_cents must be a non-negative integer' });
  const id = Number(req.params.id);
  db.prepare('UPDATE orders SET actual_cost_cents = ? WHERE id = ?').run(cost, id);
  logAudit(req, 'order.actual_cost', 'order', id, { actual_cost_cents: cost });
  res.json({ ok: true });
});

app.post('/api/admin/pnl-digest', requireAdmin, async (req, res) => {
  if (!process.env.OPERATOR_EMAIL) return res.status(400).json({ error: 'OPERATOR_EMAIL not configured' });
  const month = (req.body.month || new Date().toISOString().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });

  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE status != 'awaiting_payment' AND deleted_at IS NULL
      AND strftime('%Y-%m', created_at) = ?
  `).all(month);

  let revenue = 0, stripeFees = 0, estCogs = 0, actualCogs = 0, actualCogsCounted = 0;
  const custSet = new Set();
  for (const o of orders) {
    revenue += o.price_cents;
    stripeFees += Math.round(o.price_cents * STRIPE_PCT) + STRIPE_FIXED;
    estCogs += o.destination_country === 'CA' ? COST_DOMESTIC : COST_INTERNATIONAL;
    if (o.actual_cost_cents != null) { actualCogs += o.actual_cost_cents; actualCogsCounted++; }
    custSet.add(o.customer_email);
  }
  const net = revenue - stripeFees - estCogs;
  const fmtCAD = c => '$' + (c / 100).toFixed(2) + ' CAD';

  const lines = [
    `Letterhome P&L Digest — ${month}`,
    '='.repeat(40),
    `Orders:           ${orders.length}`,
    `Unique customers: ${custSet.size}`,
    '',
    `Gross revenue:    ${fmtCAD(revenue)}`,
    `Stripe fees:      ${fmtCAD(stripeFees)}`,
    `Est. COGS:        ${fmtCAD(estCogs)}`,
    actualCogsCounted ? `Actual COGS:      ${fmtCAD(actualCogs)} (${actualCogsCounted} orders with recorded cost)` : '',
    '',
    `Net profit:       ${fmtCAD(net)}`,
  ].filter(l => l !== undefined);

  try {
    await sendMail({
      from:    process.env.EMAIL_FROM,
      to:      process.env.OPERATOR_EMAIL,
      subject: `[Letterhome] P&L Digest — ${month}`,
      text:    lines.join('\n'),
    }, 'pl_digest');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/admin/orders/:id/print', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).send('Not found');
  const dir = orderDirPath(order.id, order.created_at);
  let letterBody = order.letter_body || '';
  if (!letterBody && fs.existsSync(path.join(dir, 'letter.txt'))) {
    letterBody = fs.readFileSync(path.join(dir, 'letter.txt'), 'utf8');
  }
  let attachments = [];
  try { attachments = order.attachment_info ? JSON.parse(order.attachment_info).map(a => a.originalName) : []; } catch {}
  const fromAddr = order.skip_return
    ? 'No return address'
    : [order.sender_name, order.sender_street,
       [order.sender_city, order.sender_province, order.sender_postal].filter(Boolean).join(' '),
       order.sender_country].filter(Boolean).join('\n');
  const toAddr = [order.recipient_name, order.recipient_street,
       [order.recipient_city, order.recipient_province, order.recipient_postal].filter(Boolean).join(' '),
       order.destination_country].filter(Boolean).join('\n');

  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  res.send(`<!DOCTYPE html><html><head><title>Order #${order.id} — Print</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Georgia,serif;color:#111;padding:40px;max-width:800px;margin:0 auto;line-height:1.5}
.head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:30px;padding-bottom:20px;border-bottom:2px solid #111}
.title{font-size:18px;font-weight:700}
.meta{font-size:12px;color:#666;font-family:monospace}
.addr-block{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:40px}
.addr-card{padding:20px;border:1px solid #ccc}
.addr-label{font-size:10px;text-transform:uppercase;letter-spacing:0.15em;color:#666;margin-bottom:10px}
.addr-text{font-size:18px;white-space:pre-line;line-height:1.6}
.to-card{background:#111;color:#fff;border-color:#111}
.to-card .addr-label{color:rgba(255,255,255,0.6)}
.letter-section{margin-bottom:30px}
.letter-label{font-size:10px;text-transform:uppercase;letter-spacing:0.15em;color:#666;margin-bottom:14px;border-bottom:1px solid #ccc;padding-bottom:8px}
.letter-body{font-size:15px;line-height:1.8;white-space:pre-wrap;font-family:Georgia,serif}
.attachments{font-size:12px;color:#666;margin-top:20px;padding:10px;background:#f5f5f5;border:1px dashed #999}
.checklist{margin-top:40px;padding:20px;background:#f5f5f5;font-size:12px}
.checklist h3{font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#666;margin-bottom:10px}
.checklist label{display:block;padding:6px 0;font-size:13px}
@media print {
  body{padding:20px}
  .no-print{display:none}
  .checklist{page-break-before:always}
}
.no-print{position:fixed;top:20px;right:20px;display:flex;gap:10px}
.no-print button{padding:10px 20px;background:#111;color:#fff;border:none;cursor:pointer;font-family:inherit;font-size:13px;border-radius:4px}
</style></head><body>
<div class="no-print">
  <button onclick="window.print()">Print</button>
  <button onclick="window.close()">Close</button>
</div>
<div class="head">
  <div class="title">Letterhome · Order #${order.id}</div>
  <div class="meta">${new Date(order.created_at).toLocaleString('en-CA')}</div>
</div>
<div class="addr-block">
  <div class="addr-card">
    <div class="addr-label">From</div>
    <div class="addr-text">${esc(fromAddr)}</div>
  </div>
  <div class="addr-card to-card">
    <div class="addr-label">To</div>
    <div class="addr-text">${esc(toAddr)}</div>
  </div>
</div>
<div class="letter-section">
  <div class="letter-label">Letter content</div>
  <div class="letter-body">${esc(letterBody) || '<em>(no letter body — see attachments)</em>'}</div>
</div>
${attachments.length ? `<div class="attachments"><strong>${attachments.length} attached file${attachments.length > 1 ? 's' : ''}:</strong> ${attachments.map(esc).join(' · ')}</div>` : ''}
<div class="checklist">
  <h3>Fulfillment checklist</h3>
  <label><input type="checkbox"> Letter printed on quality paper</label>
  <label><input type="checkbox"> Attachments printed and included</label>
  <label><input type="checkbox"> Letter signed (if applicable)</label>
  <label><input type="checkbox"> Letter folded and sealed in envelope</label>
  <label><input type="checkbox"> Recipient address written on envelope</label>
  <label><input type="checkbox"> Return address written (or omitted per customer)</label>
  <label><input type="checkbox"> Canadian postage applied</label>
  <label><input type="checkbox"> Dropped at Canada Post</label>
  <label><input type="checkbox"> Status updated to 'mailed' in admin panel</label>
</div>
</body></html>`);
});

app.post('/api/contact', contactLimiter, async (req, res, next) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'All fields are required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email))) return res.status(400).json({ error: 'Invalid email address.' });

  try {
    db.prepare('INSERT INTO contact_submissions (name, email, message, ip) VALUES (?,?,?,?)')
      .run(String(name).slice(0, 200), String(email).slice(0, 200), String(message).slice(0, 5000), getClientIp(req));
  } catch (e) { console.error('[contact] db log failed:', e.message); }

  try {
    await sendMail({
      from:    process.env.EMAIL_FROM,
      to:      process.env.OPERATOR_EMAIL,
      replyTo: email,
      subject: `[Letterhome Contact] From ${name}`,
      text:    `From: ${name} <${email}>\n\n${message}`,
    }, 'contact_notification');

    const awayOn  = getSetting('away_mode') === 'true';
    const awayMsg = getSetting('away_message') || "Thanks for reaching out — I'm currently away and will get back to you as soon as possible.";
    if (awayOn) {
      await sendMail({
        from:    process.env.EMAIL_FROM,
        to:      email,
        subject: 'We received your message — Letterhome',
        text:    `Hi ${String(name).split(' ')[0]},\n\n${awayMsg}\n\n— Letterhome`,
      }, 'away_autoreply');
    }
  } catch (e) {
    return next(e);
  }

  res.json({ ok: true });
});

app.post('/api/account/register', accountLimiter, async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

    const pwErr = validateCustomerPassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    if (await isPasswordBreached(password)) {
      return res.status(400).json({ error: "This password has appeared in known data breaches. Please choose a different one — your security matters." });
    }

    const existing = db.prepare('SELECT email, password_hash FROM customers WHERE email = ?').get(email);
    if (existing?.password_hash) {
      // Don't reveal that the email is taken. Notify the rightful owner instead
      // and return the same shape we'd return on a successful new registration.
      sendMail({
        from:    process.env.EMAIL_FROM,
        to:      email,
        subject: 'Account already exists — Letterhome',
        text:    `Hi,\n\nSomeone (possibly you) just tried to register a Letterhome account using this email address. ` +
                 `An account already exists, so we didn't create a duplicate.\n\n` +
                 `If this was you:\n  • Sign in: ${process.env.BASE_URL}/account/login\n  • Forgot your password? ${process.env.BASE_URL}/account/forgot\n\n` +
                 `If this wasn't you, no action is needed — your account is safe.\n\n— Letterhome`,
      }, 'register_collision').catch(() => {});
      return res.json({ ok: true });
    }

    const hash = await bcrypt.hash(password, 12);
    if (existing) {
      db.prepare('UPDATE customers SET password_hash = ?, account_created_at = CURRENT_TIMESTAMP, deleted_at = NULL WHERE email = ?').run(hash, email);
    } else {
      db.prepare('INSERT INTO customers (email, password_hash, account_created_at) VALUES (?,?,CURRENT_TIMESTAMP)').run(email, hash);
    }

    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Session error.' });
      req.session.customer = { email };
      req.session.save(err2 => {
        if (err2) return res.status(500).json({ error: 'Session error.' });
        res.json({ ok: true });
      });
    });
  } catch (e) {
    console.error('[account/register]', e.message);
    res.status(500).json({ error: 'Could not create account. Please try again.' });
  }
});

app.post('/api/account/login', accountLimiter, async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const customer = db.prepare('SELECT * FROM customers WHERE email = ? AND deleted_at IS NULL').get(email);
    if (!customer?.password_hash) return res.status(401).json({ error: 'Invalid email or password.' });

    const match = await bcrypt.compare(password, customer.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Session error.' });
      req.session.customer = { email: customer.email };
      req.session.save(err2 => {
        if (err2) return res.status(500).json({ error: 'Session error.' });
        res.json({ ok: true });
      });
    });
  } catch (e) {
    console.error('[account/login]', e.message);
    res.status(500).json({ error: 'Sign in failed. Please try again.' });
  }
});

app.post('/api/account/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.post('/api/account/forgot', accountLimiter, async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // Same generic response regardless to prevent enumeration.
      return res.json({ ok: true });
    }
    const customer = db.prepare('SELECT email, password_hash FROM customers WHERE email = ? AND deleted_at IS NULL').get(email);
    if (customer?.password_hash) {
      const token = passwordResetToken(email, customer.password_hash);
      const link  = `${process.env.BASE_URL}/account/reset?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
      sendMail({
        from:    process.env.EMAIL_FROM,
        to:      email,
        subject: 'Reset your Letterhome password',
        text:    `Hi,\n\nWe received a request to reset your Letterhome password. Click the link below within the next 30 minutes to set a new one:\n\n${link}\n\n` +
                 `If you didn't request this, you can safely ignore this email — your password won't change.\n\n— Letterhome`,
      }, 'password_reset_request').catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[account/forgot]', e.message);
    res.json({ ok: true });
  }
});

app.post('/api/account/reset-password', accountLimiter, async (req, res) => {
  try {
    const email    = (req.body.email || '').trim().toLowerCase();
    const token    = req.body.token || '';
    const password = req.body.new_password || '';
    if (!email || !token || !password) return res.status(400).json({ error: 'Missing required fields.' });

    const customer = db.prepare('SELECT email, password_hash FROM customers WHERE email = ? AND deleted_at IS NULL').get(email);
    if (!customer?.password_hash) return res.status(400).json({ error: 'This reset link is no longer valid.' });
    if (!verifyPasswordResetToken(email, customer.password_hash, token)) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const pwErr = validateCustomerPassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    if (await isPasswordBreached(password)) {
      return res.status(400).json({ error: "This password has appeared in known data breaches. Please choose a different one." });
    }

    const hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE customers SET password_hash = ? WHERE email = ?').run(hash, email);
    sendMail({
      from:    process.env.EMAIL_FROM,
      to:      email,
      subject: 'Your Letterhome password was reset',
      text:    `Hi,\n\nYour Letterhome account password was just reset using the forgot-password link.\n\n` +
               `If this wasn't you, contact us immediately at ${process.env.OPERATOR_EMAIL || 'support@letterhome.ca'}.\n\n— Letterhome`,
    }, 'password_reset_completed').catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error('[account/reset-password]', e.message);
    res.status(500).json({ error: 'Could not reset password.' });
  }
});

app.get('/api/account/me', requireCustomer, (req, res) => {
  const email = req.session.customer.email;
  const customer = db.prepare(
    'SELECT email, display_name, sender_name, sender_street, sender_city, sender_province, sender_postal, sender_country, account_created_at FROM customers WHERE email = ?'
  ).get(email);
  if (!customer) return res.status(404).json({ error: 'Account not found.' });
  const orders = db.prepare(
    'SELECT id, created_at, status, recipient_name, destination_country, price_cents FROM orders WHERE customer_email = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50'
  ).all(email);
  const recipients = db.prepare('SELECT * FROM saved_recipients WHERE customer_email = ? ORDER BY created_at DESC').all(email);
  res.json({ ok: true, customer, orders, recipients });
});

app.put('/api/account/return-address', requireCustomer, (req, res) => {
  const email = req.session.customer.email;
  const { sender_name, sender_street, sender_city, sender_province, sender_postal, sender_country } = req.body;
  db.prepare('UPDATE customers SET sender_name=?,sender_street=?,sender_city=?,sender_province=?,sender_postal=?,sender_country=? WHERE email=?')
    .run(sender_name||null, sender_street||null, sender_city||null, sender_province||null, sender_postal||null, sender_country||null, email);
  res.json({ ok: true });
});

app.get('/api/account/recipients', requireCustomer, (req, res) => {
  const rows = db.prepare('SELECT * FROM saved_recipients WHERE customer_email = ? ORDER BY created_at DESC').all(req.session.customer.email);
  res.json({ ok: true, recipients: rows });
});

app.post('/api/account/recipients', requireCustomer, (req, res) => {
  const email = req.session.customer.email;
  const { label, recipient_name, recipient_street, recipient_city, recipient_province, recipient_postal, destination_country } = req.body;
  if (!recipient_name || !recipient_street) return res.status(400).json({ error: 'Name and street address are required.' });
  const count = db.prepare('SELECT COUNT(*) as n FROM saved_recipients WHERE customer_email = ?').get(email).n;
  if (count >= 20) return res.status(400).json({ error: 'Maximum 20 saved recipients.' });
  db.prepare('INSERT INTO saved_recipients (customer_email, label, recipient_name, recipient_street, recipient_city, recipient_province, recipient_postal, destination_country) VALUES (?,?,?,?,?,?,?,?)')
    .run(email, (label||'').slice(0,100)||null, String(recipient_name).slice(0,200), String(recipient_street).slice(0,200), (recipient_city||'').slice(0,100)||null, (recipient_province||'').slice(0,50)||null, (recipient_postal||'').slice(0,20)||null, destination_country||'CA');
  res.json({ ok: true });
});

app.delete('/api/account/recipients/:id', requireCustomer, (req, res) => {
  const email = req.session.customer.email;
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM saved_recipients WHERE id = ? AND customer_email = ?').get(id, email);
  if (!row) return res.status(404).json({ error: 'Recipient not found.' });
  db.prepare('DELETE FROM saved_recipients WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.put('/api/account/password', requireCustomer, accountLimiter, async (req, res) => {
  try {
    const email = req.session.customer.email;
    const { current_password, new_password } = req.body;
    const customer = db.prepare('SELECT password_hash FROM customers WHERE email = ?').get(email);
    if (!customer?.password_hash) return res.status(400).json({ error: 'No password set on this account.' });
    const match = await bcrypt.compare(current_password || '', customer.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });
    const pwErr = validateCustomerPassword(new_password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    if (await isPasswordBreached(new_password)) {
      return res.status(400).json({ error: "This password has appeared in known data breaches. Please choose a different one." });
    }
    const hash = await bcrypt.hash(new_password, 12);
    db.prepare('UPDATE customers SET password_hash = ? WHERE email = ?').run(hash, email);
    sendMail({
      from:    process.env.EMAIL_FROM,
      to:      email,
      subject: 'Your Letterhome password was changed',
      text:    `Hi,\n\nYour Letterhome account password was just changed.\n\n` +
               `If this was you, no action is needed.\n\n` +
               `If you did NOT change your password, contact us immediately at ${process.env.OPERATOR_EMAIL || 'support@letterhome.ca'} ` +
               `and reset your password at ${process.env.BASE_URL}/account/forgot\n\n— Letterhome`,
    }, 'password_changed').catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error('[account/password]', e.message);
    res.status(500).json({ error: 'Could not change password.' });
  }
});

async function fulfillOrder(sessionId) {
  const order = db.prepare('SELECT * FROM orders WHERE stripe_session_id = ?').get(sessionId);
  if (!order || order.status !== 'awaiting_payment') return;

  db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(order.id);

  const session    = await stripe.checkout.sessions.retrieve(sessionId);
  const amountCAD  = (session.amount_total / 100).toFixed(2);
  const isDomestic = order.destination_country === 'CA';

  const fromAddr = order.skip_return
    ? 'No return address'
    : [
        order.sender_name,
        order.sender_street,
        `${order.sender_city || ''} ${order.sender_province || ''} ${order.sender_postal || ''}`.trim(),
        order.sender_country,
      ].filter(Boolean).join('\n');

  const toAddr = [
    order.recipient_name,
    order.recipient_street,
    `${order.recipient_city || ''} ${order.recipient_province || ''} ${order.recipient_postal || ''}`.trim(),
    order.destination_country,
  ].filter(Boolean).join('\n');

  const attachInfos = order.attachment_info ? JSON.parse(order.attachment_info) : [];
  const emailAttachments = attachInfos
    .filter(a => fs.existsSync(a.path))
    .map(a => ({ filename: a.originalName, path: a.path }));

  await sendMail({
    from:        process.env.EMAIL_FROM,
    to:          process.env.OPERATOR_EMAIL,
    subject:     `[Letterhome] Order #${order.id} — ${order.recipient_name}`,
    html:        buildOperatorEmail(order, fromAddr, toAddr, amountCAD, emailAttachments.length),
    text:        buildOperatorEmailText(order, fromAddr, toAddr, amountCAD, emailAttachments.length),
    attachments: emailAttachments,
  }, 'order_operator_notification', order.id).catch(err => {
    console.error(`[email] operator notification failed for order #${order.id}:`, err.message);
  });

  await sendMail({
    from:    process.env.EMAIL_FROM,
    to:      order.customer_email,
    subject: `Your Letterhome order is confirmed — letter to ${order.recipient_name}`,
    html:    buildCustomerEmail(order, toAddr, amountCAD, isDomestic),
    text:    buildCustomerEmailText(order, toAddr, amountCAD, isDomestic),
  }, 'order_confirmation', order.id).catch(err => {
    console.error(`[email] order_confirmation failed for order #${order.id}:`, err.message);
    sendErrorAlert(`Order #${order.id} confirmation email failed`, err.message);
  });

  try {
    const geo = await lookupCountry(order.customer_ip).catch(() => null);
    db.prepare(`
      INSERT INTO customers (email, ip, country_code, country_name, sender_name, sender_street, sender_city, sender_province, sender_postal, sender_country)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(email) DO UPDATE SET
        deleted_at      = NULL,
        ip              = COALESCE(excluded.ip,              ip),
        country_code    = COALESCE(excluded.country_code,    country_code),
        country_name    = COALESCE(excluded.country_name,    country_name),
        sender_name     = COALESCE(excluded.sender_name,     sender_name),
        sender_street   = COALESCE(excluded.sender_street,   sender_street),
        sender_city     = COALESCE(excluded.sender_city,     sender_city),
        sender_province = COALESCE(excluded.sender_province, sender_province),
        sender_postal   = COALESCE(excluded.sender_postal,   sender_postal),
        sender_country  = COALESCE(excluded.sender_country,  sender_country)
    `).run(
      order.customer_email,
      order.customer_ip    || null,
      geo?.country_code    || null,
      geo?.country_name    || null,
      order.sender_name    || null,
      order.sender_street  || null,
      order.sender_city    || null,
      order.sender_province || null,
      order.sender_postal  || null,
      order.sender_country || null,
    );
  } catch (e) { console.error('[fulfillOrder] customer upsert failed:', e.message); }

}

function buildOperatorEmail(o, fromAddr, toAddr, amountCAD, attachCount) {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
<div style="font-family:Georgia,serif;max-width:600px;padding:24px;color:#2a2a2a">
  <h2 style="font-size:24px;margin:0 0 4px">New Order #${o.id}</h2>
  <p style="color:#6b6258;margin:0 0 24px;font-size:14px">$${amountCAD} CAD &nbsp;·&nbsp; ${o.destination_country === 'CA' ? 'Domestic' : 'International'} &nbsp;·&nbsp; ${esc(o.letter_type)} &nbsp;·&nbsp; ${esc(o.customer_email)}</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px">
    <tr style="background:#f7f2e6"><td style="padding:12px 16px;font-weight:bold;width:50%;vertical-align:top">
      FROM<br><span style="font-weight:400;white-space:pre-line">${esc(fromAddr)}</span>
    </td><td style="padding:12px 16px;background:#2a2a2a;color:#faf6ec;vertical-align:top">
      TO<br><span style="white-space:pre-line">${esc(toAddr)}</span>
    </td></tr>
  </table>
  <div style="background:#f7f2e6;padding:20px;border-left:4px solid #a8472d;margin-bottom:16px">
    <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#6b6258;margin:0 0 12px">Letter content</p>
    <p style="white-space:pre-wrap;font-size:15px;line-height:1.7;margin:0">${esc(o.letter_body) || '<em>(no message body — see attachments)</em>'}</p>
  </div>
  ${attachCount > 0 ? `<p style="font-size:13px;color:#6b6258">${attachCount} attachment${attachCount > 1 ? 's' : ''} included in this email.</p>` : ''}
</div>`;
}

function buildOperatorEmailText(o, fromAddr, toAddr, amountCAD, attachCount) {
  return [
    `New Order #${o.id}`,
    `$${amountCAD} CAD · ${o.destination_country === 'CA' ? 'Domestic' : 'International'} · ${o.letter_type || ''} · ${o.customer_email}`,
    '',
    'FROM',
    fromAddr,
    '',
    'TO',
    toAddr,
    '',
    'LETTER CONTENT',
    o.letter_body || '(no message body — see attachments)',
    attachCount > 0 ? `\n${attachCount} attachment${attachCount > 1 ? 's' : ''} included.` : '',
  ].join('\n');
}

function buildCustomerEmailText(o, toAddr, amountCAD, isDomestic) {
  const delivery = isDomestic ? 'within 2 weeks' : 'within 4 weeks';
  return [
    'Your letter is in.',
    '',
    `We've received your payment. Your letter will be printed and mailed within one business day.`,
    '',
    'Delivering to:',
    toAddr,
    `Estimated delivery: ${delivery}`,
    '',
    `Order #${o.id} · $${amountCAD} CAD`,
    o.status_token ? `Track your letter: ${process.env.BASE_URL}/status/${o.status_token}` : '',
    'Questions? Reply to this email.',
    '',
    `Letterhome · ${MAILING_ADDRESS}`,
    '',
    '— Letterhome',
  ].filter(s => s !== undefined).join('\n');
}

function buildCustomerEmail(o, toAddr, amountCAD, isDomestic) {
  const delivery = isDomestic ? 'within 2 weeks' : 'within 4 weeks';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  toAddr = esc(toAddr);
  return `
<!DOCTYPE html><html>
<body style="font-family:Georgia,serif;background:#ede5d3;padding:40px 20px;color:#2a2a2a;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#faf6ec;border:1px solid rgba(42,42,42,0.12);padding:48px">
    <div style="width:38px;height:38px;background:#a8472d;display:inline-flex;align-items:center;justify-content:center;color:#faf6ec;font-size:20px;font-family:Georgia,serif;margin-bottom:28px">L</div>
    <h1 style="font-size:28px;font-weight:400;margin:0 0 10px;letter-spacing:-0.02em">Your letter is in.</h1>
    <p style="color:#6b6258;margin:0 0 32px;font-size:16px;line-height:1.6">We've received your payment. Your letter will be printed and mailed within one business day.</p>
    <div style="background:#2a2a2a;color:#faf6ec;padding:24px;margin-bottom:28px">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:rgba(250,246,236,0.55);margin:0 0 10px">Delivering to</p>
      <p style="font-size:18px;line-height:1.5;white-space:pre-line;margin:0 0 16px">${toAddr}</p>
      <p style="font-size:12px;color:rgba(250,246,236,0.55);margin:0">Estimated delivery: ${delivery}</p>
    </div>
    <div style="border-top:1px solid rgba(42,42,42,0.1);padding-top:20px;font-size:13px;color:#6b6258">
      <p style="margin:0 0 8px">Order #${o.id} &nbsp;·&nbsp; $${amountCAD} CAD</p>
      ${o.status_token ? `<p style="margin:0 0 8px">Track your letter: <a href="${process.env.BASE_URL}/status/${o.status_token}" style="color:#a8472d">${process.env.BASE_URL}/status/${o.status_token}</a></p>` : ''}
      <p style="margin:0">Questions? Reply to this email.</p>
      <p style="margin:12px 0 0;color:#968b7d;font-size:11px">Letterhome · ${MAILING_ADDRESS}</p>
    </div>
  </div>
</body></html>`;
}

function buildMailedEmail(o, toAddr, deliveryText) {
  const delivery = deliveryText || (o.destination_country === 'CA' ? 'within 2 weeks' : 'within 4 weeks');
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  toAddr = esc(toAddr);
  return `
<!DOCTYPE html><html>
<body style="font-family:Georgia,serif;background:#ede5d3;padding:40px 20px;color:#2a2a2a;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#faf6ec;border:1px solid rgba(42,42,42,0.12);padding:48px">
    <div style="width:38px;height:38px;background:#a8472d;display:inline-flex;align-items:center;justify-content:center;color:#faf6ec;font-size:20px;font-family:Georgia,serif;margin-bottom:28px">L</div>
    <h1 style="font-size:28px;font-weight:400;margin:0 0 10px;letter-spacing:-0.02em">Your letter is on its way.</h1>
    <p style="color:#6b6258;margin:0 0 32px;font-size:16px;line-height:1.6">Order #${o.id} has been printed, sealed, stamped, and dropped in the post. From here, it's in Canada Post's hands.</p>
    <div style="background:#2a2a2a;color:#faf6ec;padding:24px;margin-bottom:28px">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:rgba(250,246,236,0.55);margin:0 0 10px">Delivering to</p>
      <p style="font-size:18px;line-height:1.5;white-space:pre-line;margin:0 0 16px">${toAddr}</p>
      <p style="font-size:12px;color:rgba(250,246,236,0.55);margin:0">Estimated arrival: ${delivery}</p>
    </div>
    <p style="color:#6b6258;font-size:14px;line-height:1.7;margin:0 0 24px">Lettermail doesn't have tracking, so we can't tell you exactly when it'll land. If you don't see it after the estimated window, reply to this email and we'll work it out.</p>
    <div style="border-top:1px solid rgba(42,42,42,0.1);padding-top:20px;font-size:13px;color:#6b6258">
      <p style="margin:0 0 8px">Order #${o.id}</p>
      ${o.status_token ? `<p style="margin:0 0 8px">Track your letter: <a href="${process.env.BASE_URL}/status/${o.status_token}" style="color:#a8472d">${process.env.BASE_URL}/status/${o.status_token}</a></p>` : ''}
      <p style="margin:0">Thank you for trusting us with your letter.</p>
      <p style="margin:12px 0 0;color:#968b7d;font-size:11px">Letterhome · ${MAILING_ADDRESS}</p>
    </div>
  </div>
</body></html>`;
}

function buildMailedEmailText(o, toAddr, deliveryText) {
  const delivery = deliveryText || (o.destination_country === 'CA' ? 'within 2 weeks' : 'within 4 weeks');
  return [
    'Your letter is on its way.',
    '',
    `Order #${o.id} has been printed, sealed, stamped, and dropped in the post. From here, it's in Canada Post's hands.`,
    '',
    'Delivering to:',
    toAddr,
    `Estimated arrival: ${delivery}`,
    '',
    `Lettermail doesn't have tracking, so we can't tell you exactly when it'll land. If you don't see it after the estimated window, reply to this email and we'll work it out.`,
    '',
    `Order #${o.id}`,
    o.status_token ? `Track your letter: ${process.env.BASE_URL}/status/${o.status_token}` : '',
    'Thank you for trusting us with your letter.',
    '',
    '— Letterhome',
  ].filter(s => s !== undefined).join('\n');
}

function buildStatusPage(order) {
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const stageIndex = { paid: 0, submitted_to_printer: 1, printing: 1, mailed: 2, delivered: 2 }[order.status] ?? 0;

  function stepHTML(index, label, desc) {
    const done    = stageIndex > index;
    const active  = stageIndex === index;
    const icon    = done ? '✓' : active ? '◉' : '○';
    const iconBg  = done ? 'background:#a8472d;color:#faf6ec' : active ? 'background:#2a2a2a;color:#faf6ec' : 'background:transparent;border:2px solid rgba(42,42,42,0.2);color:#968b7d';
    const labelStyle = done || active ? 'font-size:15px;font-weight:600;color:#2a2a2a;margin-bottom:4px' : 'font-size:15px;font-weight:400;color:#968b7d;margin-bottom:4px';
    const descStyle  = done || active ? 'font-size:13px;color:#6b6258;line-height:1.6' : 'font-size:13px;color:#b0a898;line-height:1.6';
    return `
    <div style="display:flex;gap:18px;padding:20px 0;border-bottom:1px solid rgba(42,42,42,0.1)">
      <div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;margin-top:2px;${iconBg}">${icon}</div>
      <div style="flex:1">
        <div style="${labelStyle}">${label}</div>
        <div style="${descStyle}">${desc}</div>
      </div>
    </div>`;
  }

  const deliveryLine = order.estimated_delivery ? esc(order.estimated_delivery) : (order.destination_country === 'CA' ? 'within 2 weeks' : 'within 4 weeks');
  const step3Desc = stageIndex >= 2
    ? `Dropped off with Canada Post. Estimated arrival: ${deliveryLine}`
    : 'Once mailed, your estimated delivery will appear here.';

  return `<!DOCTYPE html>
<html lang="en-CA">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Letter Status — Letterhome</title>
<link rel="stylesheet" href="/fonts.css">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;background:#ede5d3;color:#2a2a2a;min-height:100vh}
nav{background:rgba(237,229,211,0.94);backdrop-filter:blur(14px);border-bottom:1px solid rgba(42,42,42,0.14);padding:16px 36px;display:flex;align-items:center;justify-content:space-between}
@media(max-width:600px){nav,.main{padding-left:20px!important;padding-right:20px!important}.main{padding-top:40px!important;padding-bottom:80px!important}}
</style>
<script>(function(){try{var t=localStorage.getItem('lh-theme')||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
<link rel="stylesheet" href="/theme.css">
</head>
<body>
<nav>
  <a href="/" style="display:flex;align-items:center;gap:10px;font-family:'DM Serif Display',serif;font-size:22px;color:#2a2a2a;text-decoration:none">
    <span style="width:32px;height:32px;background:#a8472d;display:grid;place-items:center;border-radius:2px;color:#faf6ec;font-size:17px">L</span>
    Letterhome
  </a>
  <a href="/send" style="background:#a8472d;color:#faf6ec;padding:10px 20px;font-size:13px;font-weight:500;text-decoration:none;border-radius:4px">Send a Letter</a>
</nav>
<div class="main" style="max-width:580px;margin:0 auto;padding:64px 36px 100px">
  <div style="display:inline-flex;align-items:center;gap:10px;font-family:'DM Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#a8472d;margin-bottom:20px">
    <span style="width:28px;height:1px;background:#a8472d;display:inline-block"></span>Order #${esc(String(order.id))}
  </div>
  <h1 style="font-family:'DM Serif Display',serif;font-size:clamp(28px,5vw,40px);font-weight:400;letter-spacing:-0.02em;margin-bottom:6px">Letter to ${esc(order.recipient_name)}</h1>
  <p style="font-family:'DM Mono',monospace;font-size:12px;color:#6b6258;letter-spacing:0.08em;margin-bottom:48px">${new Date(order.created_at).toLocaleDateString('en-CA',{year:'numeric',month:'long',day:'numeric'})}</p>
  <div style="margin-bottom:40px">
    ${stepHTML(0, 'Order Received', `Payment confirmed &nbsp;·&nbsp; Order #${esc(String(order.id))}`)}
    ${stepHTML(1, 'Being Prepared', 'Your letter has been submitted for printing.')}
    <div style="border-bottom:none">${stepHTML(2, 'On Its Way', step3Desc)}</div>
  </div>
  ${stageIndex >= 2 && order.estimated_delivery ? `
  <div style="background:#2a2a2a;color:#faf6ec;padding:24px;border-radius:4px;margin-bottom:32px">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:rgba(250,246,236,0.5);margin-bottom:8px;font-family:'DM Mono',monospace">Estimated delivery</div>
    <div style="font-family:'DM Serif Display',serif;font-size:24px">${esc(order.estimated_delivery)}</div>
  </div>` : ''}
  <p style="font-size:13px;color:#6b6258;line-height:1.6">Questions about your letter? Email <a href="mailto:support@letterhome.ca" style="color:#a8472d">support@letterhome.ca</a> and include your order number.</p>
</div>
<footer style="background:#2a2a2a;color:rgba(250,246,236,0.6);padding:32px 36px;font-family:'DM Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
  <span>© 2026 Letterhome</span>
  <div style="display:flex;gap:24px">
    <a href="/privacy" style="color:rgba(250,246,236,0.5);text-decoration:none">Privacy</a>
    <a href="/terms" style="color:rgba(250,246,236,0.5);text-decoration:none">Terms</a>
  </div>
</footer>
<script src="/theme.js"></script>
</body>
</html>`;
}

function buildStatusNotFound() {
  return `<!DOCTYPE html>
<html lang="en-CA"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not Found — Letterhome</title>
<style>body{font-family:Georgia,serif;background:#ede5d3;color:#2a2a2a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;padding:40px}h1{font-size:32px;font-weight:400;margin-bottom:12px}p{color:#6b6258;margin-bottom:24px}
a{color:#a8472d}</style></head>
<body><div class="box"><h1>Order not found</h1>
<p>The status link may have expired or the order was not found.</p>
<a href="/">← Back to Letterhome</a></div></body></html>`;
}

function buildRecoveryEmail(order) {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const recipientHint    = order.recipient_name ? ` to ${order.recipient_name}` : '';
  const recipientHintEsc = order.recipient_name ? ` to ${esc(order.recipient_name)}` : '';
  return {
    from:    process.env.EMAIL_FROM,
    to:      order.customer_email,
    subject: 'You left a letter unsent — Letterhome',
    text:    `You left a letter unsent.\n\nSomeone back home is waiting to hear from you. Your letter${recipientHint} is still ready to go.\n\nSend your letter: ${process.env.BASE_URL || ''}/send\n\nWe only send this reminder once.\n\nLetterhome · ${MAILING_ADDRESS}\n\n— Letterhome`,
    html: `<!DOCTYPE html><html>
<body style="font-family:Georgia,serif;background:#ede5d3;padding:40px 20px;color:#2a2a2a;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#faf6ec;border:1px solid rgba(42,42,42,0.12);padding:48px">
    <div style="width:38px;height:38px;background:#a8472d;display:inline-flex;align-items:center;justify-content:center;color:#faf6ec;font-size:20px;font-family:Georgia,serif;margin-bottom:28px">L</div>
    <h1 style="font-size:28px;font-weight:400;margin:0 0 10px;letter-spacing:-0.02em">You left a letter unsent.</h1>
    <p style="color:#6b6258;margin:0 0 32px;font-size:16px;line-height:1.6">Someone back home is waiting to hear from you. Your letter${recipientHintEsc} is still ready to go.</p>
    <a href="${process.env.BASE_URL || ''}/send" style="display:inline-block;background:#a8472d;color:#faf6ec;padding:14px 28px;font-family:Georgia,serif;font-size:15px;text-decoration:none;letter-spacing:0.02em;margin-bottom:32px">Send Your Letter →</a>
    <div style="border-top:1px solid rgba(42,42,42,0.1);padding-top:20px;font-size:12px;color:#968b7d">
      <p style="margin:0">We only send this reminder once.</p>
      <p style="margin:12px 0 0;font-size:11px">Letterhome · ${MAILING_ADDRESS}</p>
    </div>
  </div>
</body></html>`,
  };
}

function buildOccasionReminderEmail(occ, lastOrder) {
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const [mm, dd] = occ.occasion_date.split('-').map(Number);
  const dateFormatted = `${monthNames[mm - 1]} ${dd}`;
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lastOrderHint    = lastOrder ? ` Last year you sent a letter to ${lastOrder.recipient_name}.` : '';
  const lastOrderHintEsc = lastOrder ? ` Last year you sent a letter to ${esc(lastOrder.recipient_name)}.` : '';
  const occasionNameEsc  = esc(occ.occasion_name);
  return {
    from:    process.env.EMAIL_FROM,
    to:      occ.customer_email,
    subject: `${occ.occasion_name} is coming up — send a letter?`,
    text:    `${occ.occasion_name} is coming up.\n\n${occ.occasion_name} is ${occ.remind_days_before} days away (${dateFormatted}).${lastOrderHint} Send a letter — it'll mean more than a text.\n\nSend a letter: ${process.env.BASE_URL || ''}/send\n\nYou set this reminder via Letterhome. Reply to stop.\n\nLetterhome · ${MAILING_ADDRESS}\n\n— Letterhome`,
    html: `<!DOCTYPE html><html>
<body style="font-family:Georgia,serif;background:#ede5d3;padding:40px 20px;color:#2a2a2a;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#faf6ec;border:1px solid rgba(42,42,42,0.12);padding:48px">
    <div style="width:38px;height:38px;background:#a8472d;display:inline-flex;align-items:center;justify-content:center;color:#faf6ec;font-size:20px;font-family:Georgia,serif;margin-bottom:28px">L</div>
    <h1 style="font-size:28px;font-weight:400;margin:0 0 10px;letter-spacing:-0.02em">${occasionNameEsc} is coming up.</h1>
    <p style="color:#6b6258;margin:0 0 32px;font-size:16px;line-height:1.6">${occasionNameEsc} is ${occ.remind_days_before} days away (${dateFormatted}).${lastOrderHintEsc} Send a letter — it'll mean more than a text.</p>
    <a href="${process.env.BASE_URL || ''}/send" style="display:inline-block;background:#a8472d;color:#faf6ec;padding:14px 28px;font-family:Georgia,serif;font-size:15px;text-decoration:none;letter-spacing:0.02em;margin-bottom:32px">Send a Letter →</a>
    <div style="border-top:1px solid rgba(42,42,42,0.1);padding-top:20px;font-size:12px;color:#968b7d">
      <p style="margin:0">You set this reminder via Letterhome. Reply to stop.</p>
      <p style="margin:12px 0 0;font-size:11px">Letterhome · ${MAILING_ADDRESS}</p>
    </div>
  </div>
</body></html>`,
  };
}

app.get('/api/admin/contacts/unread', requireAdmin, (req, res) => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM contact_submissions WHERE read_at IS NULL').get().n;
  res.json({ unread: n });
});

app.get('/api/admin/contacts', requireAdmin, (req, res) => {
  const submissions = db.prepare('SELECT * FROM contact_submissions ORDER BY created_at DESC LIMIT 200').all();
  const unread = db.prepare('SELECT COUNT(*) AS n FROM contact_submissions WHERE read_at IS NULL').get().n;
  res.json({ submissions, unread });
});

app.post('/api/admin/contacts/:id/read', requireAdmin, (req, res) => {
  db.prepare('UPDATE contact_submissions SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND read_at IS NULL')
    .run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/contacts/read-all', requireAdmin, (req, res) => {
  db.prepare('UPDATE contact_submissions SET read_at = CURRENT_TIMESTAMP WHERE read_at IS NULL').run();
  res.json({ ok: true });
});

app.post('/api/admin/contacts/:id/reply', requireAdmin, async (req, res) => {
  const { subject, body } = req.body;
  if (!subject?.trim() || !body?.trim()) return res.status(400).json({ error: 'Subject and body required' });
  const sub = db.prepare('SELECT * FROM contact_submissions WHERE id = ?').get(Number(req.params.id));
  if (!sub) return res.status(404).json({ error: 'Not found' });
  try {
    await sendMail({
      from:    process.env.EMAIL_FROM,
      to:      sub.email,
      replyTo: process.env.OPERATOR_EMAIL,
      subject: subject.trim(),
      text:    body.trim(),
    }, 'contact_reply');
    db.prepare('UPDATE contact_submissions SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ?').run(sub.id);
    logAudit(req, 'contact.reply_sent', 'contact', req.params.id, { to: sub.email, subject: subject.trim() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/stripe/overview', requireAdmin, async (req, res) => {
  try {
    const [balance, disputesList, payoutsList] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.disputes.list({ limit: 10 }),
      stripe.payouts.list({ limit: 5 }),
    ]);
    const available = balance.available.reduce((s, b) => s + b.amount, 0);
    const pending   = balance.pending.reduce((s, b) => s + b.amount, 0);
    const currency  = (balance.available[0]?.currency || 'cad').toUpperCase();
    const openDisputes = disputesList.data.filter(d => d.status === 'needs_response' || d.status === 'under_review');
    const lastPayout = payoutsList.data[0] || null;
    res.json({
      available, pending, currency,
      openDisputeCount: openDisputes.length,
      lastPayout: lastPayout ? {
        amount: lastPayout.amount,
        currency: lastPayout.currency.toUpperCase(),
        status: lastPayout.status,
        arrival_date: lastPayout.arrival_date,
        created: lastPayout.created,
      } : null,
    });
  } catch (e) {
    console.error('[stripe/overview]', e.message);
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/admin/stripe/payouts', requireAdmin, async (req, res) => {
  try {
    const list = await stripe.payouts.list({ limit: 20 });
    res.json(list.data.map(p => ({
      id: p.id, amount: p.amount, currency: p.currency.toUpperCase(),
      status: p.status, arrival_date: p.arrival_date, created: p.created,
    })));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/admin/stripe/disputes', requireAdmin, async (req, res) => {
  try {
    const list = await stripe.disputes.list({ limit: 20 });
    res.json(list.data.map(d => ({
      id: d.id, amount: d.amount, currency: d.currency.toUpperCase(),
      status: d.status, reason: d.reason, created: d.created, charge: d.charge,
    })));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/admin/stripe/revenue', requireAdmin, async (req, res) => {
  try {
    const days  = Math.min(90, Math.max(7, parseInt(req.query.days) || 30));
    const since = Math.floor((Date.now() - days * 86400 * 1000) / 1000);
    const charges = await stripe.charges.list({ limit: 100, created: { gte: since } });
    const byDate = {};
    for (const c of charges.data) {
      if (c.status !== 'succeeded') continue;
      const d = new Date(c.created * 1000).toISOString().slice(0, 10);
      if (!byDate[d]) byDate[d] = { date: d, amount: 0, count: 0 };
      byDate[d].amount += c.amount;
      byDate[d].count++;
    }
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
      result.push(byDate[d] || { date: d, amount: 0, count: 0 });
    }
    const total = charges.data.filter(c => c.status === 'succeeded').reduce((s, c) => s + c.amount, 0);
    res.json({ daily: result, total, days });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/admin/cloudflare/analytics', requireAdmin, async (req, res) => {
  const token  = process.env.CF_API_TOKEN;
  const zoneId = process.env.CF_ZONE_ID;
  if (!token || !zoneId) return res.status(503).json({ error: 'Cloudflare not configured', configured: false });

  const days  = Math.min(30, Math.max(1, parseInt(req.query.days) || 7));
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);

  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{
          viewer {
            zones(filter: {zoneTag: "${zoneId}"}) {
              daily: httpRequests1dGroups(
                limit: 31,
                filter: {date_geq: "${since}", date_leq: "${until}"},
                orderBy: [date_ASC]
              ) {
                dimensions { date }
                sum { requests pageViews cachedRequests bytes threats }
                uniq { uniques }
              }
            }
          }
        }`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`CF API ${r.status}`);
    const data = await r.json();
    if (data.errors) throw new Error(data.errors[0]?.message || 'CF GraphQL error');
    const daily = data?.data?.viewer?.zones?.[0]?.daily || [];
    const totals = daily.reduce((acc, d) => {
      acc.requests       += d.sum.requests       || 0;
      acc.pageViews      += d.sum.pageViews       || 0;
      acc.cachedRequests += d.sum.cachedRequests  || 0;
      acc.bytes          += d.sum.bytes           || 0;
      acc.threats        += d.sum.threats         || 0;
      acc.uniques        += d.uniq?.uniques       || 0;
      return acc;
    }, { requests: 0, pageViews: 0, cachedRequests: 0, bytes: 0, threats: 0, uniques: 0 });
    res.json({ ok: true, totals, daily, days });
  } catch (e) {
    console.error('[CF analytics]', e.message);
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/admin/cloudflare/purge', requireAdmin, async (req, res) => {
  const token  = process.env.CF_API_TOKEN;
  const zoneId = process.env.CF_ZONE_ID;
  if (!token || !zoneId) return res.status(503).json({ error: 'Cloudflare not configured', configured: false });
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ purge_everything: true }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    if (!r.ok || !data.success) {
      const msg = data.errors?.[0]?.message || `CF API ${r.status}`;
      return res.status(502).json({ error: msg });
    }
    logAudit(req, 'cloudflare_purge', 'cache', null);
    res.json({ ok: true });
  } catch (e) {
    console.error('[CF purge]', e.message);
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/admin/server-health', requireAdmin, (req, res) => {
  const mem = process.memoryUsage();
  let dbSize = 0;
  try { dbSize = fs.statSync('orders.db').size; } catch {}
  res.json({
    uptime:      Math.floor(process.uptime()),
    heapUsed:    mem.heapUsed,
    heapTotal:   mem.heapTotal,
    rss:         mem.rss,
    dbSize,
    nodeVersion: process.version,
  });
});

app.get('/api/admin/backups', requireAdmin, (req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('orders-') && (f.endsWith('.db') || f.endsWith('.db.enc')))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { filename: f, size: stat.size, created_at: stat.mtime.toISOString(), encrypted: f.endsWith('.db.enc') };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    res.json({
      files,
      config: {
        encrypted:     !!process.env.BACKUP_PASSPHRASE,
        email_enabled: process.env.BACKUP_EMAIL_ENABLED === 'true',
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/backups/run', requireAdmin, async (req, res) => {
  const result = await runBackup();
  if (result.ok) logAudit(req, 'backup.manual', 'backup', result.filename);
  res.json(result);
});

app.get('/api/admin/backups/:filename', requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.startsWith('orders-') || !(filename.endsWith('.db') || filename.endsWith('.db.enc'))) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' });
  res.download(filepath, filename);
});

app.delete('/api/admin/backups/:filename', requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.startsWith('orders-') || !(filename.endsWith('.db') || filename.endsWith('.db.enc'))) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(filepath);
  logAudit(req, 'backup.delete', 'backup', filename);
  res.json({ ok: true });
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

if (process.env.SENTRY_DSN) Sentry.setupExpressErrorHandler(app);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.OPERATOR_EMAIL || process.env.SMTP_USER;

function sendErrorAlert(subject, body) {
  if (!ADMIN_EMAIL) return;
  transport.sendMail({
    from:    process.env.SMTP_FROM || process.env.EMAIL_FROM || ADMIN_EMAIL,
    to:      ADMIN_EMAIL,
    subject: `[Letterhome Error] ${subject}`,
    text:    body,
  }).catch(() => {});
}

app.use((err, req, res, next) => {
  const detail = [
    `Method: ${req.method} ${req.originalUrl}`,
    `IP: ${req.ip}`,
    `Error: ${err.stack || err.message || err}`,
  ].join('\n');
  console.error('[express error]', detail);
  sendErrorAlert(`Unhandled Express error on ${req.method} ${req.originalUrl}`, detail);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.stack : String(reason);
  console.error('[unhandledRejection]', msg);
  sendErrorAlert('Unhandled Promise Rejection', msg);
});

process.on('uncaughtException', (err) => {
  const msg = err.stack || err.message || String(err);
  console.error('[uncaughtException]', msg);
  // After an uncaught exception the process is in an undefined state, so we
  // exit and let pm2 restart it cleanly rather than serving from a corrupted
  // state. The brief delay gives the alert email a chance to flush first.
  try { sendErrorAlert('Uncaught Exception — restarting process', msg); } catch {}
  setTimeout(() => process.exit(1), 1000).unref();
});

const BACKUP_DIR      = path.join(__dirname, 'backups');
const BACKUP_KEEP     = 14;

async function uploadToB2(filePath) {
  if (!process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY || !process.env.B2_BUCKET_ID) {
    return;
  }
  const b2 = new B2({
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey:   process.env.B2_APPLICATION_KEY,
  });
  await b2.authorize();
  const { data: up } = await b2.getUploadUrl({ bucketId: process.env.B2_BUCKET_ID });
  const data = fs.readFileSync(filePath);
  await b2.uploadFile({
    uploadUrl:       up.uploadUrl,
    uploadAuthToken: up.authorizationToken,
    fileName:        path.basename(filePath),
    data,
  });
  console.log(`[backup] uploaded to B2: ${path.basename(filePath)}`);
}

async function runBackup() {
  try {
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const passphrase = process.env.BACKUP_PASSPHRASE;
    const ext  = passphrase ? '.db.enc' : '.db';
    const dest = path.join(BACKUP_DIR, `orders-${ts}${ext}`);

    const dbPath = process.env.DB_PATH || 'orders.db';
    if (passphrase) {
      encryptFile(dbPath, dest, passphrase);
    } else {
      fs.copyFileSync(dbPath, dest);
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('orders-') && (f.endsWith('.db') || f.endsWith('.db.enc')))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    files.slice(BACKUP_KEEP).forEach(f => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch {}
    });

    console.log(`[backup] created ${path.basename(dest)}${passphrase ? ' (encrypted)' : ''}`);

    uploadToB2(dest).catch(err => console.error('[backup] B2 upload failed:', err.message));

    if (process.env.BACKUP_EMAIL_ENABLED === 'true') {
      const stat = fs.statSync(dest);
      const adminEmail = process.env.ADMIN_EMAIL || process.env.OPERATOR_EMAIL || process.env.SMTP_USER;
      if (!passphrase) {
        // Never email an unencrypted database — the attachment contains every
        // customer's address, email, and letter contents. Require BACKUP_PASSPHRASE
        // to enable emailed off-site backups.
        console.warn('[backup] email skipped: BACKUP_PASSPHRASE not set — refusing to email an unencrypted database');
      } else if (stat.size > 20 * 1024 * 1024) {
        console.warn(`[backup] email skipped: ${(stat.size/1024/1024).toFixed(1)}MB exceeds 20MB limit`);
      } else if (!adminEmail || !adminEmail.includes('@')) {
        console.warn('[backup] email skipped: no valid ADMIN_EMAIL, OPERATOR_EMAIL, or SMTP_USER set');
      } else {
        sendMail({
          from:    process.env.EMAIL_FROM,
          to:      adminEmail,
          subject: `[Letterhome] Backup ${ts}${passphrase ? ' (encrypted)' : ''}`,
          text:    `Daily Letterhome backup attached. File: ${path.basename(dest)}\nSize: ${(stat.size/1024).toFixed(1)} KB\n` +
                   (passphrase ? 'This backup is AES-256-GCM encrypted. Use scripts/decrypt-backup.js to restore.\n' : '\n'),
          attachments: [{ filename: path.basename(dest), path: dest }],
        }, 'backup_email').catch(err => console.error('[backup] email send failed:', err.message));
      }
    }

    return { ok: true, filename: path.basename(dest) };
  } catch (e) {
    console.error('[backup] failed:', e.message);
    return { ok: false, error: e.message };
  }
}

cron.schedule('0 2 * * *', async () => {
  console.log('[backup] running scheduled backup');
  await runBackup();
});

const PORT = process.env.PORT || 3000;
if (!process.env.TEST_MODE) {
  app.listen(PORT, () => console.log(`Letterhome running on port ${PORT}`));
}
module.exports = { app, db };
