<div align="center">

# Letterhome

### Real mail. Sent from Canada. No matter where you are.

You're abroad. Someone back home matters. Letterhome lets you write a real letter online — we print it, seal it, stamp it with Canadian postage, and put it in the mail. All within one business day.

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![SQLite](https://img.shields.io/badge/SQLite-built--in-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://nodejs.org/api/sqlite.html)
[![Stripe](https://img.shields.io/badge/Stripe-Checkout-635BFF?style=flat-square&logo=stripe&logoColor=white)](https://stripe.com)
[![License](https://img.shields.io/badge/license-private-dc2626?style=flat-square)](LICENSE)

**[letterhome.ca](https://letterhome.ca)**

</div>

---

## The Product

Most Canadians living abroad can't easily send a letter home. International postage is a hassle, Canadian stamps aren't available, and printing services don't ship abroad.

Letterhome solves all of that. You fill out a form, write your message (or attach a document), pay once — and a real envelope with a real Canadian stamp shows up in your recipient's mailbox.

| | |
|---|---|
| **Domestic** | $10 CAD — anywhere in Canada |
| **International** | $20 CAD — 160+ countries |
| **Turnaround** | Within 1 business day of payment |
| **Delivery** | ~2 weeks domestic · ~4 weeks international |
| **Human review** | Every order is reviewed before printing |

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  Customer fills form  ──→  Stripe Checkout  ──→  Paid   │
│                                    │                     │
│              Stripe webhook fires  ↓                     │
│                           fulfillOrder()                 │
│                    ┌──────────┴──────────┐               │
│            Operator email            Customer email      │
│          (order + files)           (confirmation)        │
│                    └──────────┬──────────┘               │
│                               ↓                         │
│            Operator prints, seals, stamps, mails         │
│                               ↓                         │
│                    Letter arrives in Canada              │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

Built lean and maintainable — no unnecessary dependencies, no build toolchain, no framework overhead.

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 22+ |
| **Framework** | Express 4 |
| **Database** | SQLite via `node:sqlite` — built-in, zero compilation |
| **Payments** | Stripe Checkout + cryptographic webhook verification |
| **Email** | Nodemailer — works with Gmail, Postmark, Resend, etc. |
| **File uploads** | Multer — PDF/DOCX attachments, up to 5 files · 10 MB each |
| **Admin panel** | Full SPA — session auth, bcrypt, TOTP 2FA, audit log |
| **Security** | Helmet · rate limiting · TOTP 2FA · bcrypt · HIBP breach check |
| **Monitoring** | Sentry (errors) · UptimeRobot (uptime) |
| **Backups** | Daily AES-256-GCM encrypted → Backblaze B2 + email |
| **i18n** | English / French — 313 keys each, runtime-switched |
| **Frontend** | Vanilla HTML/CSS/JS — no framework, no bundler |
| **Infra** | PM2 · Caddy · Linux VPS |

---

## Project Layout

```
letterhome/
│
├── server.js                   # Entire backend — all routes, DB, cron, auth
├── package.json
├── .env.example                # All environment variables, documented inline
│
├── admin/
│   ├── app.html                # Admin SPA — orders, customers, settings, backups
│   └── login.html              # Login + TOTP 2FA
│
├── public/
│   ├── index.html              # Landing page
│   ├── send.html               # 3-step order form
│   ├── account.html            # Customer portal — order history, saved recipients
│   ├── order-success.html      # Post-payment confirmation
│   ├── track.html              # Order tracking (email + order ID)
│   ├── about.html / contact.html / privacy.html / terms.html / refunds.html
│   ├── lang.js                 # EN/FR i18n strings
│   ├── theme.css               # Global style overrides
│   └── theme.js                # Dark mode toggle
│
├── scripts/
│   ├── create-admin.js         # Generate admin credentials + TOTP secret
│   ├── setup-2fa.js            # Print TOTP QR code for authenticator app
│   ├── decrypt-backup.js       # Restore an encrypted .db.enc backup
│   └── restore-drill.js        # Full B2 download → decrypt → validate drill
│
├── docs/
│   └── RUNBOOK.md              # Deploy, restore, ops procedures, launch checklist
│
└── .github/workflows/
    ├── ci.yml                  # Lint, validate, security checks on every push
    └── deploy.yml              # Deploy to production VPS
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | DB ping — `200 ok` / `503 down` |
| `POST` | `/api/create-order` | Validate form, create DB record, return Stripe Checkout URL |
| `GET` | `/api/order-status` | Poll status by Stripe session ID |
| `POST` | `/api/track` | Look up an order by email + order ID |
| `GET` | `/status/:token` | Tokenized public order status page |
| `POST` | `/api/contact` | Contact form → operator email |
| `POST` | `/webhook` | Stripe webhook — `checkout.session.completed` → `fulfillOrder()` |

---

## Running Locally

```bash
git clone git@github.com:officenotfound/LetterHome.git
cd LetterHome
npm install
cp .env.example .env
```

Edit `.env`, then set up your admin account:

```bash
node scripts/create-admin.js   # writes ADMIN_PASSWORD_HASH + TOTP_SECRET to .env
node server.js
```

Requires **Node.js 22+** — uses the built-in `node:sqlite` module, no native compilation.

---

## Environment Variables

Full documentation is in `.env.example`. Key groups:

<details>
<summary>Show all variables</summary>

```env
# Server
PORT=3000
BASE_URL=https://letterhome.ca

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM="Letterhome <support@letterhome.ca>"
OPERATOR_EMAIL=support@letterhome.ca

# Admin
SESSION_SECRET=
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=        # → node scripts/create-admin.js
TOTP_SECRET=                # → node scripts/setup-2fa.js (optional)

# Backups
BACKUP_PASSPHRASE=          # AES-256-GCM key — store outside this repo
BACKUP_EMAIL_ENABLED=false
B2_KEY_ID=
B2_APPLICATION_KEY=
B2_BUCKET_ID=

# Cloudflare (optional — analytics + cache purge in admin)
CF_API_TOKEN=
CF_ZONE_ID=

# Sentry (optional — error tracking)
SENTRY_DSN=
```

</details>

---

## Deployment

Production runs on a Linux VPS behind **Caddy**:

```
letterhome.ca {
    reverse_proxy localhost:3000
    encode gzip
}
```

**First deploy:**
```bash
npm install --omit=dev
pm2 start server.js --name letterhome
pm2 save && pm2 startup
```

**Redeploy:**
```bash
git pull origin main
npm install --omit=dev   # only when package.json changed
pm2 reload letterhome
```

See [`docs/RUNBOOK.md`](docs/RUNBOOK.md) for the complete runbook — restore procedures, admin ops, and the launch-day checklist.

---

## Stripe Webhook

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**
2. URL: `https://letterhome.ca/webhook`
3. Event: `checkout.session.completed`
4. Copy the signing secret → `STRIPE_WEBHOOK_SECRET` in `.env`

---

## Excluded Countries

Available in **160+ countries**. The following are excluded due to postal restrictions or international sanctions:

Afghanistan · Belarus · Burkina Faso · Central African Republic · Eritrea · Haiti · Iraq · Iran · Libya · Mali · Myanmar · North Korea · Russia · Somalia · South Sudan · Sudan · Syria · Yemen · Zimbabwe

---

## License

Private — all rights reserved. &copy; Letterhome
