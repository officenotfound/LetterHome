require('dotenv').config();
const express   = require('express');
const multer    = require('multer');
const Stripe    = require('stripe');
const mailer    = require('nodemailer');
const rateLimit = require('express-rate-limit');
const session   = require('express-session');
const FileStore = require('session-file-store')(session);
const bcrypt    = require('bcryptjs');
const { Secret, TOTP } = require('otpauth');
const { DatabaseSync: Database } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

fs.mkdirSync('uploads', { recursive: true });
fs.mkdirSync('orders',  { recursive: true });
fs.mkdirSync('admin',   { recursive: true });

const app    = express();
app.set('trust proxy', 1);
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(session({
  store:             new FileStore({ path: './sessions', ttl: 30 * 24 * 60 * 60, retries: 1 }),
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
`);

// Add deleted_at to orders if it doesn't exist (idempotent migration)
try { db.exec(`ALTER TABLE orders ADD COLUMN deleted_at DATETIME`); } catch {}
try { db.exec(`ALTER TABLE orders ADD COLUMN customer_ip TEXT`);  } catch {}

// ── Email transport ───────────────────────────────────────────────────────────
const transport = mailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// ── File uploads ──────────────────────────────────────────────────────────────
const upload = multer({
  dest: 'uploads',
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ['.pdf', '.doc', '.docx'].includes(ext));
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clean URLs for all pages
['send', 'privacy', 'terms', 'refunds', 'about', 'contact', 'track', 'order-success'].forEach(p =>
  app.get(`/${p}`, (req, res) =>
    res.sendFile(path.join(__dirname, 'public', `${p}.html`))
  )
);

app.get('/faq', (req, res) => res.redirect('/#faq'));

app.use(express.static('public'));

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
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function requireAdmin(req, res, next) {
  if (req.session?.admin) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/admin/login');
}

// ── Create order ──────────────────────────────────────────────────────────────
app.post('/api/create-order', orderLimiter, upload.array('attachments', 5), async (req, res) => {
  const b = req.body;
  const rEmail  = (b['r-email']  || '').trim();
  const rName   = (b['r-name']   || '').trim();
  const rStreet = (b['r-street'] || '').trim();

  if (!rEmail || !rName || !rStreet) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const isDomestic = b['r-country'] === 'CA';
  const priceCents = isDomestic ? 1000 : 2000;

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
      destination_country, letter_type, letter_body, attachment_info, price_cents, customer_ip
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    rEmail, b['skip-return'] ? 1 : 0,
    b['s-name']     || null, b['s-street']   || null, b['s-city']  || null,
    b['s-province'] || null, b['s-postal']   || null, b['s-country'] || null,
    rName, rStreet,
    b['r-city']     || null, b['r-province'] || null, b['r-postal'] || null,
    b['r-country']  || 'CA', b['letter-type'] || 'standard',
    b['letter-body'] || null,
    '[]',
    priceCents,
    customerIp || null
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
  });
});

// ── Order tracking ────────────────────────────────────────────────────────────
app.post('/api/track', (req, res) => {
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
  const validUser = username === process.env.ADMIN_USERNAME;
  const validPass = process.env.ADMIN_PASSWORD_HASH
    ? await bcrypt.compare(password || '', process.env.ADMIN_PASSWORD_HASH)
    : false;
  if (!validUser || !validPass) return res.redirect('/admin/login?error=1');

  if (process.env.TOTP_SECRET) {
    if (!code) return res.redirect('/admin/login?error=2fa');
    const totp = new TOTP({
      issuer: 'Letterhome Admin', label: 'admin',
      secret: Secret.fromBase32(process.env.TOTP_SECRET),
    });
    if (totp.validate({ token: code.replace(/\s/g,''), window: 1 }) === null)
      return res.redirect('/admin/login?error=2fa');
  }

  req.session.admin = { username };
  res.redirect('/admin');
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

  res.json({
    total:       db.prepare('SELECT COUNT(*) as n FROM orders WHERE deleted_at IS NULL').get().n,
    paid:        paidOrders.length,
    revenue,
    stripe_fees: stripeFees,
    cogs,
    net:         revenue - stripeFees - cogs,
    customers:   customers.size,
  });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare("SELECT * FROM orders WHERE status = ? AND deleted_at IS NULL ORDER BY created_at DESC").all(status)
    : db.prepare("SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC").all();
  res.json(rows);
});

app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
  db.prepare("UPDATE orders SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/orders/:id/restore', requireAdmin, (req, res) => {
  db.prepare("UPDATE orders SET deleted_at = NULL WHERE id = ?").run(Number(req.params.id));
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
  const valid = ['awaiting_payment', 'paid', 'printing', 'mailed', 'delivered'];
  if (!valid.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });

  const id = Number(req.params.id);
  const before = db.prepare('SELECT status FROM orders WHERE id = ?').get(id);
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(req.body.status, id);

  // Fire "Letter sent" email when status transitions to 'mailed'
  if (req.body.status === 'mailed' && before?.status !== 'mailed') {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (order?.customer_email) {
      const isDomestic = order.destination_country === 'CA';
      const toAddr = [
        order.recipient_name, order.recipient_street,
        `${order.recipient_city || ''} ${order.recipient_province || ''} ${order.recipient_postal || ''}`.trim(),
        order.destination_country,
      ].filter(Boolean).join('\n');
      transport.sendMail({
        from:    process.env.EMAIL_FROM,
        to:      order.customer_email,
        subject: `Your Letterhome letter has been mailed — order #${order.id}`,
        html:    buildMailedEmail(order, toAddr, isDomestic),
      }).catch(console.error);
    }
  }

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
  const manual = db.prepare(`SELECT email, display_name, created_at FROM customers WHERE deleted_at IS NULL`).all();

  const map = {};
  manual.forEach(m => { map[m.email] = { email: m.email, display_name: m.display_name, order_count: 0, total_spent: 0, last_order: m.created_at }; });
  fromOrders.forEach(o => {
    if (!map[o.email]) map[o.email] = { email: o.email, display_name: null };
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
  res.json({ ok: true });
});

app.post('/api/admin/customers/:email/restore', requireAdmin, (req, res) => {
  db.prepare('UPDATE customers SET deleted_at = NULL WHERE email = ?').run(req.params.email);
  db.prepare("UPDATE orders SET deleted_at = NULL WHERE customer_email = ?").run(req.params.email);
  res.json({ ok: true });
});

app.get('/api/admin/customers/:email', requireAdmin, (req, res) => {
  const email   = req.params.email;
  const orders  = db.prepare('SELECT * FROM orders WHERE customer_email = ? AND deleted_at IS NULL ORDER BY created_at DESC').all(email);
  const notes   = db.prepare('SELECT * FROM customer_notes WHERE customer_email = ? ORDER BY created_at DESC').all(email);
  const tags    = db.prepare('SELECT tag FROM customer_tags WHERE customer_email = ?').all(email).map(r => r.tag);
  const manual  = db.prepare('SELECT display_name FROM customers WHERE email = ? AND deleted_at IS NULL').get(email);
  res.json({ email, display_name: manual?.display_name || null, orders, notes, tags });
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

// ── Contact form ──────────────────────────────────────────────────────────────
app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'All fields are required.' });

  await transport.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      process.env.OPERATOR_EMAIL,
    replyTo: email,
    subject: `[Letterhome Contact] From ${name}`,
    text:    `From: ${name} <${email}>\n\n${message}`,
  });

  res.json({ ok: true });
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

  await transport.sendMail({
    from:        process.env.EMAIL_FROM,
    to:          process.env.OPERATOR_EMAIL,
    subject:     `[Letterhome] Order #${order.id} — ${order.recipient_name}`,
    html:        buildOperatorEmail(order, fromAddr, toAddr, amountCAD, emailAttachments.length),
    attachments: emailAttachments,
  });

  await transport.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      order.customer_email,
    subject: `Your Letterhome order is confirmed — letter to ${order.recipient_name}`,
    html:    buildCustomerEmail(order, toAddr, amountCAD, isDomestic),
  });

  // Delete entire order folder after 7 days per privacy policy
  const orderDir = orderDirPath(order.id, order.created_at);
  setTimeout(() => {
    try { fs.rmSync(orderDir, { recursive: true, force: true }); } catch {}
  }, 7 * 86400 * 1000);
}

function buildOperatorEmail(o, fromAddr, toAddr, amountCAD, attachCount) {
  return `
<div style="font-family:Georgia,serif;max-width:600px;padding:24px;color:#2a2a2a">
  <h2 style="font-size:24px;margin:0 0 4px">New Order #${o.id}</h2>
  <p style="color:#6b6258;margin:0 0 24px;font-size:14px">$${amountCAD} CAD &nbsp;·&nbsp; ${o.destination_country === 'CA' ? 'Domestic' : 'International'} &nbsp;·&nbsp; ${o.letter_type} &nbsp;·&nbsp; ${o.customer_email}</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px">
    <tr style="background:#f7f2e6"><td style="padding:12px 16px;font-weight:bold;width:50%;vertical-align:top">
      FROM<br><span style="font-weight:400;white-space:pre-line">${fromAddr}</span>
    </td><td style="padding:12px 16px;background:#2a2a2a;color:#faf6ec;vertical-align:top">
      TO<br><span style="white-space:pre-line">${toAddr}</span>
    </td></tr>
  </table>
  <div style="background:#f7f2e6;padding:20px;border-left:4px solid #a8472d;margin-bottom:16px">
    <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#6b6258;margin:0 0 12px">Letter content</p>
    <p style="white-space:pre-wrap;font-size:15px;line-height:1.7;margin:0">${o.letter_body || '<em>(no message body — see attachments)</em>'}</p>
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
      <p style="margin:0">Questions? Reply to this email.</p>
    </div>
  </div>
</body></html>`;
}

function buildMailedEmail(o, toAddr, isDomestic) {
  const delivery = isDomestic ? 'within 2 weeks' : 'within 4 weeks';
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
      <p style="margin:0">Thank you for trusting us with your letter.</p>
    </div>
  </div>
</body></html>`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Letterhome running on port ${PORT}`));
