// Database connection, schema, and migrations for Letterhome.
// Extracted from server.js. Idempotent CREATE/ALTER run on every boot;
// PRAGMA user_version (SCHEMA_VERSION) records the expected schema revision.

const { DatabaseSync: Database } = require('node:sqlite');

const db = new Database(process.env.DB_PATH || 'orders.db', { allowBareNamedParameters: true });
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

try { db.exec(`ALTER TABLE orders ADD COLUMN deleted_at DATETIME`);       } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN customer_ip TEXT`);          } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN printer_ref TEXT`);          } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN estimated_delivery TEXT`);   } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN status_token TEXT`);         } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN recovery_sent_at DATETIME`); } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN actual_cost_cents INTEGER`); } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN sla_alert_sent_at DATETIME`);} catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN discount_code TEXT`);     } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN discount_cents INTEGER`); } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN page_count INTEGER`);            } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN extra_page_cents INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN colour_printing INTEGER DEFAULT 0`);  } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN registered_mail INTEGER DEFAULT 0`);  } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN schedule_for_later INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN scheduled_date TEXT`);           } catch {}
try {
  db.exec(`CREATE TABLE IF NOT EXISTS discount_codes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description   TEXT,
    discount_pct  INTEGER,
    discount_cents INTEGER,
    max_uses      INTEGER,
    uses_count    INTEGER DEFAULT 0,
    active        INTEGER DEFAULT 1,
    expires_at    DATETIME,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) { console.error('[init] discount_codes:', e.message); }
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
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_email      ON orders(customer_email)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status)`);         } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_deleted    ON orders(deleted_at)`);     } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_deleted ON customers(deleted_at)`);  } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders(created_at)`);      } catch {}
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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_occasions_email ON occasions(customer_email)`);
} catch (e) { console.error('[init] occasions table:', e.message); }

try {
  db.exec(`CREATE TABLE IF NOT EXISTS order_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL,
    note       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_order_notes_order_id ON order_notes(order_id)`);
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

try {
  db.exec(`CREATE TABLE IF NOT EXISTS tetris_scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL,
    score      INTEGER NOT NULL,
    lines      INTEGER NOT NULL,
    level      INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tetris_score ON tetris_scores(score DESC)`);
} catch (e) { console.error('[init] tetris_scores table:', e.message); }

try {
  db.exec(`CREATE TABLE IF NOT EXISTS email_opens (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    token            TEXT NOT NULL UNIQUE,
    campaign         TEXT,
    recipient_email  TEXT,
    open_count       INTEGER DEFAULT 0,
    first_opened_at  DATETIME,
    last_opened_at   DATETIME,
    last_ip          TEXT,
    last_user_agent  TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_email_opens_campaign ON email_opens(campaign)`);
} catch (e) { console.error('[init] email_opens table:', e.message); }

try {
  db.exec(`CREATE TABLE IF NOT EXISTS outreach_contacts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign       TEXT NOT NULL,
    business_name  TEXT,
    contact_name   TEXT,
    email          TEXT NOT NULL,
    source_url     TEXT,
    status         TEXT DEFAULT 'pending',
    token          TEXT UNIQUE,
    sent_at        DATETIME,
    error          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign, email)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_outreach_campaign ON outreach_contacts(campaign)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_contacts(status)`);
} catch (e) { console.error('[init] outreach_contacts table:', e.message); }

try {
  db.exec(`CREATE TABLE IF NOT EXISTS arcade_scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    game       TEXT NOT NULL,
    username   TEXT NOT NULL,
    score      INTEGER NOT NULL,
    lines      INTEGER DEFAULT 0,
    level      INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_arcade_score ON arcade_scores(game, score DESC)`);
} catch (e) { console.error('[init] arcade_scores table:', e.message); }

// Schema version stamp. The CREATE/ALTER statements above are idempotent and
// run on every boot, so this is a marker (not a migration runner) that records
// which schema revision the code expects. Bump SCHEMA_VERSION whenever the DDL
// above changes; query `PRAGMA user_version` to see what state a given .db is in.
const SCHEMA_VERSION = 1;
try {
  const onDisk = db.prepare('PRAGMA user_version').get().user_version;
  if (onDisk !== SCHEMA_VERSION) {
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    if (onDisk) console.log(`[init] schema version ${onDisk} → ${SCHEMA_VERSION}`);
  }
} catch (e) { console.error('[init] schema version stamp:', e.message); }

module.exports = db;
