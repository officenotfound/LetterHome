require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const Stripe  = require('stripe');
const mailer  = require('nodemailer');
const { DatabaseSync: Database } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

fs.mkdirSync('uploads', { recursive: true });

const app    = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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

// ── Create order ──────────────────────────────────────────────────────────────
app.post('/api/create-order', upload.array('attachments', 5), async (req, res) => {
  const b = req.body;
  const rEmail  = (b['r-email']  || '').trim();
  const rName   = (b['r-name']   || '').trim();
  const rStreet = (b['r-street'] || '').trim();

  if (!rEmail || !rName || !rStreet) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const isDomestic = b['r-country'] === 'CA';
  const priceCents = isDomestic ? 1000 : 1600;

  const attachmentInfo = (req.files || []).map(f => ({
    tempPath:     f.path,
    originalName: f.originalname,
    mimeType:     f.mimetype,
  }));

  const row = db.prepare(`
    INSERT INTO orders (
      customer_email, skip_return,
      sender_name, sender_street, sender_city, sender_province, sender_postal, sender_country,
      recipient_name, recipient_street, recipient_city, recipient_province, recipient_postal,
      destination_country, letter_type, letter_body, attachment_info, price_cents
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    rEmail, b['skip-return'] ? 1 : 0,
    b['s-name']     || null, b['s-street']   || null, b['s-city']  || null,
    b['s-province'] || null, b['s-postal']   || null, b['s-country'] || null,
    rName, rStreet,
    b['r-city']     || null, b['r-province'] || null, b['r-postal'] || null,
    b['r-country']  || 'CA', b['letter-type'] || 'standard',
    b['letter-body'] || null,
    JSON.stringify(attachmentInfo),
    priceCents
  );

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
    metadata: { order_id: String(row.lastInsertRowid) },
  });

  db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?')
    .run(session.id, row.lastInsertRowid);

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

// ── Contact form ──────────────────────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
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
    .filter(a => fs.existsSync(a.tempPath))
    .map(a => ({ filename: a.originalName, path: a.tempPath }));

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

  // Delete uploaded files after 7 days
  const filePaths = emailAttachments.map(a => a.path);
  if (filePaths.length) {
    setTimeout(() => filePaths.forEach(p => { try { fs.unlinkSync(p); } catch {} }), 7 * 86400 * 1000);
  }
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Letterhome running on port ${PORT}`));
