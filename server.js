require('dotenv').config();
const express   = require('express');
const helmet    = require('helmet');
const multer    = require('multer');
const Stripe    = require('stripe');
const mailer    = require('nodemailer');
const rateLimit = require('express-rate-limit');
const session   = require('express-session');
const FileStore = require('session-file-store')(session);
const bcrypt    = require('bcryptjs');
const { Secret, TOTP } = require('otpauth');
const cron      = require('node-cron');
const { DatabaseSync: Database } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');
const { randomUUID, createHmac, createHash, createCipheriv, scryptSync, randomBytes, timingSafeEqual } = require('node:crypto');

fs.mkdirSync('uploads', { recursive: true });
fs.mkdirSync('orders',  { recursive: true });
fs.mkdirSync('admin',   { recursive: true });
fs.mkdirSync('backups', { recursive: true });

const app    = express();
app.set('trust proxy', 1);
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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
                    'https://www.google-analytics.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:',
                    'https://www.googletagmanager.com',
                    'https://www.google-analytics.com'],
      connectSrc:  ["'self'",
                    'https://maps.googleapis.com',
                    'https://maps.gstatic.com'],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
      formAction:    ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true }
    : false,
}));

// Prevent caching of authenticated pages and admin/account APIs so they
// can't be revealed via the back button or shared-browser scenarios.
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

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database('orders.db', { allowBareNamedParameters: true });
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    stripe_session_id  TEXT UNIQUE,
    customer_email     TEXT NOT NULL,
    skip_return        INTEGER DEFAULT 0,
    sender_name        TEXT,
    sender_street      TEXT,
    sender_city        TEXT,
    sender_province    TEXT,
    sender_postal      TEXT,
    sender_country     TEXT,
    recipient_name     TEXT NOT NULL,
    recipient_street   TEXT NOT NULL,
    recipient_city     TEXT,
    recipient_province TEXT,
    recipient_postal   TEXT,
    destination_country TEXT,
    letter_type        TEXT DEFAULT 'standard',
    letter_body        TEXT,
    attachment_info    TEXT,
    price_cents        INTEGER NOT NULL,
    status             TEXT DEFAULT 'awaiting_payment',
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS customer_notes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_email TEXT NOT NULL,
    note           TEXT NOT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS customer_tags (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_email TEXT NOT NULL,
    tag            TEXT NOT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_email, tag)
  );
  CREATE TABLE IF NOT EXISTS customers (
    email        TEXT PRIMARY KEY,
    display_name TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at   DATETIME
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    actor        TEXT NOT NULL,
    action       TEXT NOT NULL,
    target_type  TEXT,
    target_id    TEXT,
    details      TEXT,
    ip           TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function logAudit(req, action, target_type, target_id, details) {
  try {
    db.prepare(`INSERT INTO audit_log (actor, action, target_type, target_id, details, ip) VALUES (?,?,?,?,?,?)`)
      .run(req.session?.admin?.username || 'system', action, target_type || null, String(target_id || ''), details ? JSON.stringify(details) : null, (req.ip || '').replace(/^::ffff:/, ''));
  } catch (e) { console.error('audit log failed:', e.message); }
}

// Add deleted_at to orders if it doesn't exist (idempotent migration)
try { db.exec(`ALTER TABLE orders ADD COLUMN deleted_at DATETIME`);       } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN customer_ip TEXT`);          } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN printer_ref TEXT`);          } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN estimated_delivery TEXT`);   } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN status_token TEXT`);         } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN recovery_sent_at DATETIME`); } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN actual_cost_cents INTEGER`); } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN sla_alert_sent_at DATETIME`);} catch {}
try { db.exec(`ALTER TABLE customers ADD COLUMN ip TEXT`);             } catch {}
try { db.exec(`ALTER TABLE customers ADD COLUMN country_code TEXT`);   } catch {}
try { db.exec(`ALTER TABLE customers ADD COLUMN country_name TEXT`);   } catch {}
try { db.exec(`ALTER TABLE customers ADD COLUMN sender_name TEXT`);    } catch {}
try { db.exec(`ALTER TABLE customers ADD COLUMN sender_street TEXT`);  } catch {}
try { db.exec(`ALTER TABLE customers ADD COLUMN sender_city TEXT`);    } catch {}
try { db.exec(`ALTER TABLE customers ADD COLUMN sender_province TEXT`);} catch {}
try { db.exec(`ALTER TABLE customers ADD COLUMN sender_postal TEXT`);  } catch {}
try { db.exec(`ALTER TABLE customers ADD COLUMN sender_country TEXT`); } catch {}
try { db.exec(`ALTER TABLE customers ADD COLUMN password_hash TEXT`);         } catch {}
try { db.exec(`ALTER TABLE customers ADD COLUMN account_created_at DATETIME`);} catch {}
try { db.exec(`ALTER TABLE customers ADD COLUMN unsubscribed_at DATETIME`);   } catch {}
try {
  db.exec(`CREATE TABLE IF NOT EXISTS saved_recipients (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_email     TEXT NOT NULL,
    label              TEXT,
    recipient_name     TEXT NOT NULL,
    recipient_street   TEXT,
    recipient_city     TEXT,
    recipient_province TEXT,
    recipient_postal   TEXT,
    destination_country TEXT DEFAULT 'CA',
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_saved_recipients_email ON saved_recipients(customer_email)`);
} catch (e) { console.error('[init] saved_recipients:', e.message); }

// New tables (schema B)
try {
  db.exec(`CREATE TABLE IF NOT EXISTS occasions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_email     TEXT NOT NULL,
    occasion_name      TEXT NOT NULL,
    occasion_date      TEXT NOT NULL,
    remind_days_before INTEGER DEFAULT 14,
    last_reminded_year INTEGER,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) { console.error('[init] occasions table:', e.message); }

try {
  db.exec(`CREATE TABLE IF NOT EXISTS order_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL,
    note       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) { console.error('[init] order_notes table:', e.message); }

try {
  db.exec(`CREATE TABLE IF NOT EXISTS email_templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    subject    TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) { console.error('[init] email_templates table:', e.message); }

// Seed default canned reply templates (INSERT OR IGNORE — never overwrites edits)
const defaultTemplates = [
  {
    name:    'Where is my letter?',
    subject: 'Re: Your Letterhome letter',
    body:
`Hi there,

Thanks for reaching out. Canada Post lettermail doesn't include tracking, so once we drop it at the post office we can't see exactly where it is in transit.

The typical delivery windows are:
  • Within Canada: within 2 weeks
  • International: within 4 weeks

If you're still within that window, it's most likely on its way. If the full window has passed and nothing has arrived, please reply and we'll arrange a resend at no charge.

Thanks for your patience,
Letterhome`,
  },
  {
    name:    'Delivery delay explanation',
    subject: 'Re: Your Letterhome letter — delivery update',
    body:
`Hi there,

Thanks for getting in touch. Canada Post is currently experiencing delays in some regions, which can push delivery past the usual window. We're sorry for the inconvenience.

We'd ask you to allow a few extra days before considering the letter lost. If it hasn't arrived within [X weeks from mailing date], please reply and we'll make it right with a resend.

We appreciate your patience.

Letterhome`,
  },
  {
    name:    'Non-delivery — goodwill resend',
    subject: 'Re: Your Letterhome letter — resend arranged',
    body:
`Hi there,

We're sorry your letter hasn't arrived. Since your delivery window has passed, we'd like to resend it at no additional charge.

Could you confirm:
  1. The full mailing address for the recipient is still the same
  2. That it's possible the letter was missed (e.g. no one home, full mailbox)

Once you confirm, we'll reprint and repost your letter right away.

Apologies again for the trouble,
Letterhome`,
  },
  {
    name:    'General enquiry — acknowledged',
    subject: 'Re: Your Letterhome enquiry',
    body:
`Hi there,

Thanks for getting in touch. We've received your message and will get back to you shortly.

If you have an order number handy, feel free to include it in your reply and we can look into it right away.

Letterhome`,
  },
  {
    name:    'Order confirmed — follow-up',
    subject: 'Re: Your Letterhome order',
    body:
`Hi there,

Just a quick note to confirm we've received your order and it's in the queue to be printed and mailed. You'll receive an update once it's been posted.

If you have any questions in the meantime, just reply here.

Thanks,
Letterhome`,
  },
  {
    name:    'Wrong address — please confirm',
    subject: 'Re: Your Letterhome order — address check',
    body:
`Hi there,

Before we print and post your letter, we wanted to flag a possible issue with the recipient address. Could you double-check the following and reply to confirm?

  Recipient: [name]
  Address: [address]

We want to make sure your letter gets where it needs to go.

Thanks,
Letterhome`,
  },
];

try {
  const insertTmpl = db.prepare('INSERT OR IGNORE INTO email_templates (name, subject, body) VALUES (?,?,?)');
  for (const t of defaultTemplates) insertTmpl.run(t.name, t.subject, t.body);
} catch (e) { console.error('[init] template seed:', e.message); }

try {
  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) { console.error('[init] settings table:', e.message); }

try {
  db.exec(`CREATE TABLE IF NOT EXISTS page_views (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    path         TEXT NOT NULL,
    ip           TEXT,
    country_code TEXT,
    country_name TEXT,
    referrer     TEXT,
    device_type  TEXT,
    browser      TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_page_views_ip      ON page_views(ip)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_page_views_country ON page_views(country_code)`);
} catch (e) { console.error('[init] page_views table:', e.message); }

try {
  db.exec(`CREATE TABLE IF NOT EXISTS contact_submissions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    message    TEXT NOT NULL,
    read_at    DATETIME,
    ip         TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) { console.error('[init] contact_submissions table:', e.message); }

try {
  db.exec(`CREATE TABLE IF NOT EXISTS email_log (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    to_email TEXT NOT NULL,
    subject  TEXT NOT NULL,
    type     TEXT DEFAULT 'general',
    order_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_email_log_to ON email_log(to_email)`);
} catch (e) { console.error('[init] email_log table:', e.message); }

// ── IP geolocation (server-side, in-memory cached) ───────────────────────────
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
  // Fallback: ip-api.com
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

// Failed admin-login tracking (in-memory, resets on restart)
const failedAdminLogins = new Map(); // ip -> [timestamps]
let lastFailedLoginAlertAt = 0;
function recordFailedAdminLogin(ip, username) {
  const now = Date.now();
  const winMs = 60 * 60 * 1000;
  const list = (failedAdminLogins.get(ip) || []).filter(t => now - t < winMs);
  list.push(now);
  failedAdminLogins.set(ip, list);
  if (list.length >= 5 && now - lastFailedLoginAlertAt > 30 * 60 * 1000) {
    lastFailedLoginAlertAt = now;
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
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
  const key  = scryptSync(passphrase, salt, 32);
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

// ── Email transport ───────────────────────────────────────────────────────────
const transport = mailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function sendMail(opts, type = 'general', orderId = null) {
  await transport.sendMail(opts);
  try {
    const toAddr = Array.isArray(opts.to) ? opts.to.join(', ') : (opts.to || '');
    db.prepare('INSERT INTO email_log (to_email, subject, type, order_id) VALUES (?,?,?,?)')
      .run(toAddr, opts.subject || '', type, orderId || null);
  } catch (e) { console.error('[email_log]', e.message); }
}

// ── File uploads ──────────────────────────────────────────────────────────────
const upload = multer({
  dest: 'uploads',
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter(req, file, cb) {
    const ext  = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    const extOk  = ['.pdf', '.doc', '.docx'].includes(ext);
    const mimeOk = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ].includes(mime);
    cb(null, extOk && mimeOk);
  },
});

// ── Order folder helpers ──────────────────────────────────────────────────────
function orderDirPath(id, createdAt) {
  const date = new Date(createdAt).toISOString().slice(0, 10);
  return path.join(__dirname, 'orders', `${date}_${String(id).padStart(5, '0')}`);
}

function safeFilePath(dir, originalName) {
  const ext  = path.extname(originalName);
  const base = path.basename(originalName, ext);
  let dest = path.join(dir, originalName);
  let i = 1;
  while (fs.existsSync(dest)) dest = path.join(dir, `${base}_${i++}${ext}`);
  return dest;
}

// Backfill status_token for any orders created before this column was added.
;(function backfillStatusTokens() {
  try {
    const rows = db.prepare('SELECT id FROM orders WHERE status_token IS NULL').all();
    const stmt = db.prepare('UPDATE orders SET status_token = ? WHERE id = ?');
    for (const r of rows) stmt.run(randomUUID(), r.id);
    if (rows.length) console.log(`[init] assigned status tokens to ${rows.length} orders`);
  } catch (e) { console.error('[init] token backfill failed:', e.message); }
})();

// Abandoned order recovery — send a one-time recovery email.
;(async function abandonedOrderRecovery() {
  try {
    const cutoff2d  = new Date(Date.now() - 2  * 86400 * 1000).toISOString();
    const cutoff7d  = new Date(Date.now() - 7  * 86400 * 1000).toISOString();
    const abandoned = db.prepare(`
      SELECT * FROM orders
      WHERE status = 'awaiting_payment'
        AND created_at < ?
        AND created_at > ?
        AND recovery_sent_at IS NULL
        AND customer_email IS NOT NULL
    `).all(cutoff2d, cutoff7d);
    for (const order of abandoned) {
      try {
        await sendMail(buildRecoveryEmail(order), 'recovery', order.id);
        db.prepare("UPDATE orders SET recovery_sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
        console.log(`[recovery] sent recovery email for order #${order.id} to ${order.customer_email}`);
      } catch (e) { console.error(`[recovery] failed for order #${order.id}:`, e.message); }
    }
  } catch (e) { console.error('[recovery] startup check failed:', e.message); }
})();

// Occasion reminders — send reminders for upcoming occasions.
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

// SLA alerts — email OPERATOR_EMAIL if any orders have been in paid/submitted_to_printer for 20h+.
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

// Privacy cleanup: delete order folders older than 7 days on every startup.
// Replaces the unreliable setTimeout approach that was lost on process restart.
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
})();

// ── Stripe webhook (must come before express.json middleware) ─────────────────
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

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ limit: '64kb', extended: true }));

// Clean URLs for all pages
['send', 'privacy', 'terms', 'refunds', 'about', 'contact', 'track', 'order-success'].forEach(p =>
  app.get(`/${p}`, (req, res) =>
    res.sendFile(path.join(__dirname, 'public', `${p}.html`))
  )
);
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public', 'account.html')));
app.get('/account/:page', (req, res) => res.sendFile(path.join(__dirname, 'public', 'account.html')));

app.get('/faq', (req, res) => res.redirect('/#faq'));

function unsubPage(state, email = '') {
  const safeEmail = String(email).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const headings = {
    invalid:    { title: 'Invalid unsubscribe link', body: "We couldn't verify this unsubscribe link. It may be malformed, or copied incompletely from an email. If you want to opt out, reply to any email from us and we'll handle it manually." },
    confirm:    { title: 'Unsubscribe from Letterhome emails?', body: `We'll stop sending marketing or update emails to <strong>${safeEmail}</strong>. You'll still receive transactional messages tied to orders you place (payment confirmations, status updates).` },
    done:       { title: "You've been unsubscribed.", body: `We've removed <strong>${safeEmail}</strong> from our marketing list. You won't receive any more update emails from us. If you change your mind, email <a href="mailto:hello@letterhome.ca">hello@letterhome.ca</a>.` },
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
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Source+Serif+4:wght@400;500&display=swap" rel="stylesheet">
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
  if (!email || token !== unsubscribeToken(email)) return res.status(400).send(unsubPage('invalid'));
  const row = db.prepare('SELECT unsubscribed_at FROM customers WHERE email = ?').get(email);
  if (row?.unsubscribed_at) return res.send(unsubPage('already', email));
  res.send(unsubPage('confirm', email));
});

app.post('/unsubscribe', (req, res) => {
  const email = (req.body.email || '').toString().trim().toLowerCase();
  const token = (req.body.token || '').toString();
  if (!email || token !== unsubscribeToken(email)) return res.status(400).send(unsubPage('invalid'));
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

app.use(express.static('public'));

// ── GA4 tracking snippet (served to all public pages) ─────────────────────────
app.get('/ga.js', (req, res) => {
  const id = process.env.GA4_MEASUREMENT_ID || 'G-DF3XQ6ML41';
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(`
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${id}');
(function(){var s=document.createElement('script');s.async=true;
s.src='https://www.googletagmanager.com/gtag/js?id=${id}';
document.head.appendChild(s);})();
`.trim());
});


// ── Public site config ────────────────────────────────────────────────────────
app.get('/api/site-config', (req, res) => {
  res.json({
    orders_open:               getSetting('service_paused', 'false') !== 'true',
    announcement:              getSetting('announcement', ''),
    price_domestic_cents:      parseInt(getSetting('price_domestic_cents',      '1000')) || 1000,
    price_international_cents: parseInt(getSetting('price_international_cents', '2000')) || 2000,
    blocked_countries:         JSON.parse(getSetting('blocked_countries', '[]') || '[]'),
  });
});

// ── Visitor country (server-side IP detection for the ticker) ────────────────
app.get('/api/visitor-country', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const result = await lookupCountry(ip);
    res.json({ country_code: result?.country_code || null });
  } catch {
    res.json({ country_code: null });
  }
});

// ── Page-view tracking middleware ────────────────────────────────────────────
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

// ── Rate limiting ─────────────────────────────────────────────────────────────
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP. Please try again in an hour.' },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages sent. Please try again later.' },
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

// ── Create order ──────────────────────────────────────────────────────────────
app.post('/api/create-order', orderLimiter, upload.array('attachments', 5), async (req, res) => {
  if (getSetting('service_paused', 'false') === 'true')
    return res.status(503).json({ error: 'Orders are currently paused. Please check back soon.' });

  const b = req.body;
  const rEmail  = (b['r-email']  || '').trim().toLowerCase();
  const rName   = (b['r-name']   || '').trim();
  const rStreet = (b['r-street'] || '').trim();

  if (!rEmail || !rName || !rStreet)
    return res.status(400).json({ error: 'Missing required fields.' });

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
    b['r-country']  || 'CA', ['standard'].includes(b['letter-type']) ? b['letter-type'] : 'standard',
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
    letter_type:  b['letter-type'] || 'standard',
    price_cents:  priceCents,
    attachments:  movedFiles.map(f => path.basename(f.path)),
  }, null, 2), 'utf8');

  db.prepare('UPDATE orders SET attachment_info = ? WHERE id = ?')
    .run(JSON.stringify(movedFiles), orderId);

  const session = await stripe.checkout.sessions.create({
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

  db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?')
    .run(session.id, orderId);

  res.json({ checkoutUrl: session.url });
});

// ── Order status (used by success page) ──────────────────────────────────────
app.get('/api/order-status', (req, res) => {
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

// ── Order tracking ────────────────────────────────────────────────────────────
app.post('/api/track', trackLimiter, (req, res) => {
  const { email, order_id } = req.body;
  if (!email || !order_id) return res.status(400).json({ error: 'Email and order ID are required.' });

  const order = db.prepare(
    "SELECT * FROM orders WHERE id = ? AND customer_email = ? AND status != 'awaiting_payment'"
  ).get(Number(order_id), email.trim().toLowerCase());

  if (!order) return res.status(404).json({ error: 'No order found. Double-check your order ID and the email used at checkout.' });

  const messages = {
    paid:      'Payment confirmed — your letter is being prepared for printing.',
    printing:  'Printing in progress.',
    mailed:    'Mailed — in transit with Canada Post.',
    delivered: 'Delivered.',
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

// ── Admin auth ───────────────────────────────────────────────────────────────
app.get('/admin/login', (req, res) => {
  if (req.session?.admin) return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.post('/admin/login', loginLimiter, async (req, res) => {
  const { username, password, code } = req.body;
  const ip = getClientIp(req);
  const validUser = username === process.env.ADMIN_USERNAME;
  const validPass = process.env.ADMIN_PASSWORD_HASH
    ? await bcrypt.compare(password || '', process.env.ADMIN_PASSWORD_HASH)
    : false;
  if (!validUser || !validPass) {
    recordFailedAdminLogin(ip, username);
    return res.redirect('/admin/login?error=1');
  }

  if (process.env.TOTP_SECRET) {
    if (!code) return res.redirect('/admin/login?error=2fa');
    const totp = new TOTP({
      issuer: 'Letterhome Admin', label: 'admin',
      secret: Secret.fromBase32(process.env.TOTP_SECRET),
    });
    if (totp.validate({ token: code.replace(/\s/g,''), window: 1 }) === null) {
      recordFailedAdminLogin(ip, username);
      return res.redirect('/admin/login?error=2fa');
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

// ── Admin API ─────────────────────────────────────────────────────────────────
app.get('/api/admin/me', requireAdmin, (req, res) =>
  res.json({ username: req.session.admin.username }));

// Cost & fee constants (in cents CAD)
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

app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
  db.prepare("UPDATE orders SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(Number(req.params.id));
  logAudit(req, 'order.delete', 'order', req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/orders/:id/restore', requireAdmin, (req, res) => {
  db.prepare("UPDATE orders SET deleted_at = NULL WHERE id = ?").run(Number(req.params.id));
  logAudit(req, 'order.restore', 'order', req.params.id);
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

  // Fire "Letter sent" email when status transitions to 'mailed' via the generic dropdown
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
  }, 'mailed_notification', id).catch(console.error);

  res.json({ ok: true });
});

app.get('/api/admin/orders/:id/files/:filename', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Not found' });
  const dir  = orderDirPath(order.id, order.created_at);
  const file = path.resolve(dir, req.params.filename);
  if (!file.startsWith(path.resolve(dir))) return res.status(403).json({ error: 'Forbidden' });
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
  res.json({ ok: true });
});

// CSV export — must be registered before /api/admin/customers/:email to avoid being shadowed by the param route
app.get('/api/admin/customers/export.csv', requireAdmin, (req, res) => {
  const csvEscape = s => {
    const str = String(s ?? '');
    return /[,"\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
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
             `If you did NOT request this, contact us immediately at ${process.env.OPERATOR_EMAIL || 'hello@letterhome.ca'}.\n\n— Letterhome`,
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

// Send a custom message to a specific order's customer
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

// Broadcast email — to all customers, or filtered by tag
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

  // Send in background — don't block the response. Throttle ~1/sec to be nice to SMTP.
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

// Preview broadcast recipient count
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

// List all unique tags (for broadcast UI)
app.get('/api/admin/tags', requireAdmin, (req, res) => {
  const tags = db.prepare(`SELECT tag, COUNT(*) as n FROM customer_tags GROUP BY tag ORDER BY tag`).all();
  res.json(tags);
});

// Bulk status update — apply a status to a list of order IDs
app.post('/api/admin/orders/bulk-status', requireAdmin, async (req, res) => {
  const { ids, status } = req.body;
  const valid = ['awaiting_payment', 'paid', 'submitted_to_printer', 'printing', 'mailed', 'delivered', 'refunded'];
  if (!valid.includes(status) || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Invalid input' });
  const stmt = db.prepare('UPDATE orders SET status = ? WHERE id = ?');
  ids.forEach(id => stmt.run(status, Number(id)));
  logAudit(req, 'order.bulk_status', 'order', ids.join(','), { status, count: ids.length });
  res.json({ ok: true, count: ids.length });
});

// Refund via Stripe — calls stripe.refunds.create with the order's payment_intent
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

// Generate a prefilled /send URL for reorder (admin shares with customer)
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

// Global search — order ID, customer email, recipient name, street
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

// Audit log listing
app.get('/api/admin/audit', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200`).all();
  res.json(rows);
});

// D. Chart data
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

// Geographic breakdown
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

// ── Visitor analytics ────────────────────────────────────────────────────────
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

// Order notes
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

// Occasions (per customer)
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

// Email templates
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

// Settings
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { key, value } = req.body;
  if (!key?.trim() || typeof value !== 'string') return res.status(400).json({ error: 'key and value are required' });
  setSetting(key.trim(), value);
  logAudit(req, 'settings.change', 'settings', key.trim(), { value });
  res.json({ ok: true });
});

app.post('/api/admin/settings/batch', requireAdmin, (req, res) => {
  const allowed = ['service_paused','announcement','price_domestic_cents','price_international_cents','daily_order_cap','blocked_countries'];
  const updates = req.body || {};
  for (const key of allowed) {
    if (key in updates) setSetting(key, updates[key]);
  }
  logAudit(req, 'settings.batch_update', 'settings', null, updates);
  res.json({ ok: true });
});

// Actual cost per order
app.post('/api/admin/orders/:id/actual-cost', requireAdmin, (req, res) => {
  const cost = req.body.actual_cost_cents;
  if (!Number.isInteger(cost) || cost < 0) return res.status(400).json({ error: 'actual_cost_cents must be a non-negative integer' });
  const id = Number(req.params.id);
  db.prepare('UPDATE orders SET actual_cost_cents = ? WHERE id = ?').run(cost, id);
  logAudit(req, 'order.actual_cost', 'order', id, { actual_cost_cents: cost });
  res.json({ ok: true });
});

// P&L monthly digest
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

// Print-ready view for an order
app.get('/admin/orders/:id/print', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).send('Not found');
  const dir = orderDirPath(order.id, order.created_at);
  let letterBody = order.letter_body || '';
  if (!letterBody && fs.existsSync(path.join(dir, 'letter.txt'))) {
    letterBody = fs.readFileSync(path.join(dir, 'letter.txt'), 'utf8');
  }
  const attachments = order.attachment_info ? JSON.parse(order.attachment_info).map(a => a.originalName) : [];
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

// ── Contact form ──────────────────────────────────────────────────────────────
app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'All fields are required.' });

  try {
    db.prepare('INSERT INTO contact_submissions (name, email, message, ip) VALUES (?,?,?,?)')
      .run(String(name).slice(0, 200), String(email).slice(0, 200), String(message).slice(0, 5000), getClientIp(req));
  } catch (e) { console.error('[contact] db log failed:', e.message); }

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

  res.json({ ok: true });
});

// ── Customer accounts ─────────────────────────────────────────────────────────
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
  delete req.session.customer;
  req.session.save(() => res.json({ ok: true }));
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
    // Always succeed regardless of whether the account exists.
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
               `If this wasn't you, contact us immediately at ${process.env.OPERATOR_EMAIL || 'hello@letterhome.ca'}.\n\n— Letterhome`,
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
               `If you did NOT change your password, contact us immediately at ${process.env.OPERATOR_EMAIL || 'hello@letterhome.ca'} ` +
               `and reset your password at ${process.env.BASE_URL}/account/forgot\n\n— Letterhome`,
    }, 'password_changed').catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error('[account/password]', e.message);
    res.status(500).json({ error: 'Could not change password.' });
  }
});

// ── Order fulfilment ──────────────────────────────────────────────────────────
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
    attachments: emailAttachments,
  }, 'order_operator_notification', order.id);

  await sendMail({
    from:    process.env.EMAIL_FROM,
    to:      order.customer_email,
    subject: `Your Letterhome order is confirmed — letter to ${order.recipient_name}`,
    html:    buildCustomerEmail(order, toAddr, amountCAD, isDomestic),
  }, 'order_confirmation', order.id);

  // Upsert customer record — persists even if this order is later deleted
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

function buildCustomerEmail(o, toAddr, amountCAD, isDomestic) {
  const delivery = isDomestic ? 'within 2 weeks' : 'within 4 weeks';
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
    </div>
  </div>
</body></html>`;
}

function buildMailedEmail(o, toAddr, deliveryText) {
  const delivery = deliveryText || (o.destination_country === 'CA' ? 'within 2 weeks' : 'within 4 weeks');
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
    </div>
  </div>
</body></html>`;
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
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
  <p style="font-size:13px;color:#6b6258;line-height:1.6">Questions about your letter? Email <a href="mailto:hello@letterhome.ca" style="color:#a8472d">hello@letterhome.ca</a> and include your order number.</p>
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

// F. New email builder functions

function buildRecoveryEmail(order) {
  const recipientHint = order.recipient_name ? ` to ${order.recipient_name}` : '';
  return {
    from:    process.env.EMAIL_FROM,
    to:      order.customer_email,
    subject: 'You left a letter unsent — Letterhome',
    html: `<!DOCTYPE html><html>
<body style="font-family:Georgia,serif;background:#ede5d3;padding:40px 20px;color:#2a2a2a;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#faf6ec;border:1px solid rgba(42,42,42,0.12);padding:48px">
    <div style="width:38px;height:38px;background:#a8472d;display:inline-flex;align-items:center;justify-content:center;color:#faf6ec;font-size:20px;font-family:Georgia,serif;margin-bottom:28px">L</div>
    <h1 style="font-size:28px;font-weight:400;margin:0 0 10px;letter-spacing:-0.02em">Someone back home is waiting.</h1>
    <p style="color:#6b6258;margin:0 0 32px;font-size:16px;line-height:1.6">Someone back home is waiting to hear from you. Your letter${recipientHint} is still ready to go.</p>
    <a href="${process.env.BASE_URL || ''}/send" style="display:inline-block;background:#a8472d;color:#faf6ec;padding:14px 28px;font-family:Georgia,serif;font-size:15px;text-decoration:none;letter-spacing:0.02em;margin-bottom:32px">Send Your Letter →</a>
    <div style="border-top:1px solid rgba(42,42,42,0.1);padding-top:20px;font-size:12px;color:#968b7d">
      <p style="margin:0">We only send this reminder once.</p>
    </div>
  </div>
</body></html>`,
  };
}

function buildOccasionReminderEmail(occ, lastOrder) {
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const [mm, dd] = occ.occasion_date.split('-').map(Number);
  const dateFormatted = `${monthNames[mm - 1]} ${dd}`;
  const lastOrderHint = lastOrder ? ` Last year you sent a letter to ${lastOrder.recipient_name}.` : '';
  return {
    from:    process.env.EMAIL_FROM,
    to:      occ.customer_email,
    subject: `${occ.occasion_name} is coming up — send a letter?`,
    html: `<!DOCTYPE html><html>
<body style="font-family:Georgia,serif;background:#ede5d3;padding:40px 20px;color:#2a2a2a;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#faf6ec;border:1px solid rgba(42,42,42,0.12);padding:48px">
    <div style="width:38px;height:38px;background:#a8472d;display:inline-flex;align-items:center;justify-content:center;color:#faf6ec;font-size:20px;font-family:Georgia,serif;margin-bottom:28px">L</div>
    <h1 style="font-size:28px;font-weight:400;margin:0 0 10px;letter-spacing:-0.02em">${occ.occasion_name} is coming up.</h1>
    <p style="color:#6b6258;margin:0 0 32px;font-size:16px;line-height:1.6">${occ.occasion_name} is ${occ.remind_days_before} days away (${dateFormatted}).${lastOrderHint} Send a letter — it'll mean more than a text.</p>
    <a href="${process.env.BASE_URL || ''}/send" style="display:inline-block;background:#a8472d;color:#faf6ec;padding:14px 28px;font-family:Georgia,serif;font-size:15px;text-decoration:none;letter-spacing:0.02em;margin-bottom:32px">Send a Letter →</a>
    <div style="border-top:1px solid rgba(42,42,42,0.1);padding-top:20px;font-size:12px;color:#968b7d">
      <p style="margin:0">You set this reminder via Letterhome. Reply to stop.</p>
    </div>
  </div>
</body></html>`,
  };
}

// ── Admin: contact submissions ────────────────────────────────────────────────
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

// ── Admin: Stripe ─────────────────────────────────────────────────────────────
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

// ── Admin: Cloudflare analytics ───────────────────────────────────────────────
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

// ── Admin: server health ──────────────────────────────────────────────────────
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

// API: list backups
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

// API: trigger manual backup
app.post('/api/admin/backups/run', requireAdmin, async (req, res) => {
  const result = await runBackup();
  if (result.ok) logAudit(req, 'backup.manual', 'backup', result.filename);
  res.json(result);
});

// API: download a backup
app.get('/api/admin/backups/:filename', requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.startsWith('orders-') || !(filename.endsWith('.db') || filename.endsWith('.db.enc'))) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' });
  res.download(filepath, filename);
});

// API: delete a backup
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

// ── Error monitoring ──────────────────────────────────────────────────────────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.SMTP_USER;

function sendErrorAlert(subject, body) {
  if (!ADMIN_EMAIL) return;
  transport.sendMail({
    from:    process.env.SMTP_FROM || ADMIN_EMAIL,
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
  sendErrorAlert('Uncaught Exception — process may be unstable', msg);
});

// ── Automated backups ─────────────────────────────────────────────────────────
const BACKUP_DIR      = path.join(__dirname, 'backups');
const BACKUP_KEEP     = 14;


async function runBackup() {
  try {
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const passphrase = process.env.BACKUP_PASSPHRASE;
    const ext  = passphrase ? '.db.enc' : '.db';
    const dest = path.join(BACKUP_DIR, `orders-${ts}${ext}`);

    if (passphrase) {
      encryptFile('orders.db', dest, passphrase);
    } else {
      fs.copyFileSync('orders.db', dest);
    }

    // Prune old backups — keep newest BACKUP_KEEP files (of either format)
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('orders-') && (f.endsWith('.db') || f.endsWith('.db.enc')))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    files.slice(BACKUP_KEEP).forEach(f => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch {}
    });

    console.log(`[backup] created ${path.basename(dest)}${passphrase ? ' (encrypted)' : ''}`);

    // Optional: email a copy to the admin (off-site safety net).
    if (process.env.BACKUP_EMAIL_ENABLED === 'true') {
      const stat = fs.statSync(dest);
      const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
      if (stat.size > 20 * 1024 * 1024) {
        console.warn(`[backup] email skipped: ${(stat.size/1024/1024).toFixed(1)}MB exceeds 20MB limit`);
      } else if (!adminEmail) {
        console.warn('[backup] email skipped: no ADMIN_EMAIL or SMTP_USER set');
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

// Daily at 2:00 AM
cron.schedule('0 2 * * *', async () => {
  console.log('[backup] running scheduled backup');
  await runBackup();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Letterhome running on port ${PORT}`));
