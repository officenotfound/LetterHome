<div align="center">

# Letterhome

Send real physical mail to Canada from anywhere in the world.

[![version](https://img.shields.io/badge/version-0.5.0-0ea5e9?style=flat-square)](https://github.com/officenotfound/LetterHome/releases)
[![node](https://img.shields.io/badge/Node.js-22%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![stripe](https://img.shields.io/badge/Stripe-Checkout-635BFF?style=flat-square&logo=stripe&logoColor=white)](https://stripe.com)
[![license](https://img.shields.io/badge/license-private-dc2626?style=flat-square)](#license)

[**letterhome.ca**](https://letterhome.ca) &nbsp;·&nbsp; [Runbook](docs/RUNBOOK.md) &nbsp;·&nbsp; [Roadmap](ROADMAP.md)

</div>

---

## Overview

Letterhome is a postal service for Canadians living abroad. Customers write their message online, upload any attachments, and pay — we print the letter on quality paper, seal it in an envelope, apply Canadian postage, and drop it in the mail within one business day.

- **$10 CAD** — anywhere within Canada
- **$20 CAD** — 160+ countries worldwide
- Every order reviewed by a human before printing
- 2-week domestic delivery · 4-week international delivery

---

## Table of Contents

- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Stripe Webhook](#stripe-webhook)
- [Service Restrictions](#service-restrictions)
- [License](#license)

---

## How It Works

```
Customer submits order form
        │
        ▼
Stripe Checkout (payment)
        │
        ▼  checkout.session.completed webhook
fulfillOrder()
        ├──▶  Operator email (full order + attachments)
        └──▶  Customer confirmation email
                        │
                        ▼
        Operator prints, seals, stamps, and mails
                        │
                        ▼
             Letter delivered in Canada
```

---

## Tech Stack

Intentionally lean — no build toolchain, no ORM, no framework overhead.

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+ |
| Framework | Express 4 |
| Database | SQLite via `node:sqlite` — built-in, zero native compilation |
| Payments | Stripe Checkout + cryptographic webhook verification |
| Email | Nodemailer — SMTP-compatible (Gmail, Postmark, Resend, etc.) |
| File uploads | Multer — PDF / DOCX, up to 5 attachments · 10 MB each |
| Admin panel | Single-page app with session auth, bcrypt, TOTP 2FA, audit log |
| Security | Helmet · express-rate-limit · bcrypt · TOTP 2FA · HIBP breach check |
| Monitoring | Sentry (error tracking) · UptimeRobot (uptime alerts) |
| Backups | Daily AES-256-GCM encrypted backup → Backblaze B2 + email |
| i18n | English / French — 313 keys each, runtime-switched, no build step |
| Frontend | Vanilla HTML / CSS / JS — no framework, no bundler |
| Infra | PM2 · Caddy · Linux VPS |

---

## Project Structure

```
letterhome/
├── server.js                     # Express server — all routes, DB, cron, auth
├── package.json
├── .env.example                  # Full environment variable reference
│
├── admin/
│   ├── app.html                  # Admin SPA (orders, customers, settings, backups)
│   └── login.html                # Login page with TOTP 2FA
│
├── public/
│   ├── index.html                # Landing page
│   ├── send.html                 # 3-step order form
│   ├── account.html              # Customer portal (order history, saved recipients)
│   ├── order-success.html        # Post-payment confirmation
│   ├── track.html                # Order tracking by email + order ID
│   ├── about.html
│   ├── contact.html
│   ├── privacy.html
│   ├── terms.html
│   ├── refunds.html
│   ├── lang.js                   # EN / FR i18n strings
│   ├── theme.css                 # Global style overrides
│   └── theme.js                  # Dark mode toggle
│
├── scripts/
│   ├── create-admin.js           # Generate admin credentials + TOTP secret
│   ├── setup-2fa.js              # Display TOTP QR code for authenticator apps
│   ├── decrypt-backup.js         # Restore an encrypted .db.enc backup
│   └── restore-drill.js          # Full restore drill: B2 download → decrypt → verify
│
├── docs/
│   └── RUNBOOK.md                # Ops runbook: deploy, restore, launch checklist
│
└── .github/
    └── workflows/
        ├── ci.yml                # Lint, validate, and security checks on push
        └── deploy.yml            # Deploy to production VPS
```

---

## Quick Start

**Requirements:** Node.js 22+

```bash
git clone git@github.com:officenotfound/LetterHome.git
cd LetterHome
npm install
cp .env.example .env
```

Configure `.env` with your credentials, then create the admin account:

```bash
node scripts/create-admin.js
# Writes ADMIN_PASSWORD_HASH and TOTP_SECRET into .env
```

Start the server:

```bash
node server.js
# or: npm run dev   (watch mode)
```

Open `http://localhost:3000` for the storefront, `http://localhost:3000/admin` for the admin panel.

---

## Environment Variables

See [`.env.example`](.env.example) for the full reference with inline documentation.

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | Yes | Signing secret for session cookies |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret (`whsec_...`) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Yes | Outbound email credentials |
| `OPERATOR_EMAIL` | Yes | Where new order notifications are sent |
| `ADMIN_PASSWORD_HASH` | Yes | bcrypt hash — generated by `scripts/create-admin.js` |
| `TOTP_SECRET` | No | Base32 TOTP secret for 2FA — generated by `scripts/setup-2fa.js` |
| `BACKUP_PASSPHRASE` | No | AES-256-GCM key for encrypted backups — store outside this repo |
| `B2_KEY_ID` / `B2_APPLICATION_KEY` / `B2_BUCKET_ID` | No | Backblaze B2 offsite backup |
| `CF_API_TOKEN` / `CF_ZONE_ID` | No | Cloudflare analytics and cache purge in admin panel |
| `SENTRY_DSN` | No | Sentry error tracking |
| `GA4_MEASUREMENT_ID` / `GA4_PROPERTY_ID` | No | Google Analytics 4 |

---

## Deployment

Production runs on a Linux VPS behind [Caddy](https://caddyserver.com).

**Caddyfile:**

```
letterhome.ca {
    reverse_proxy localhost:3000
    encode gzip
}
```

**Initial setup:**

```bash
npm install --omit=dev
pm2 start server.js --name letterhome
pm2 save && pm2 startup
```

**Deploy update:**

```bash
git pull origin main
npm install --omit=dev   # only if package.json changed
pm2 reload letterhome
pm2 logs letterhome --lines 30 --nostream
```

For restore procedures, admin operations, and the pre-launch checklist, see [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check — `200 ok` with DB status, `503` if DB is unreachable |
| `POST` | `/api/create-order` | Validate form data, create order record, return Stripe Checkout URL |
| `GET` | `/api/order-status` | Poll order status by Stripe session ID |
| `POST` | `/api/track` | Look up order by email + order ID |
| `GET` | `/status/:token` | Tokenized public-facing order status page |
| `POST` | `/api/contact` | Contact form submission → operator email |
| `POST` | `/webhook` | Stripe webhook receiver (`checkout.session.completed`) |

---

## Stripe Webhook

1. Stripe Dashboard → **Developers** → **Webhooks** → Add endpoint
2. Endpoint URL: `https://letterhome.ca/webhook`
3. Event to listen for: `checkout.session.completed`
4. Copy the signing secret → set as `STRIPE_WEBHOOK_SECRET` in `.env`

---

## Service Restrictions

Available to **160+ countries**. The following destinations are excluded due to postal restrictions or international sanctions:

Afghanistan, Belarus, Burkina Faso, Central African Republic, Eritrea, Haiti, Iraq, Iran, Libya, Mali, Myanmar, North Korea, Russia, Somalia, South Sudan, Sudan, Syria, Yemen, Zimbabwe

---

## License

Private — all rights reserved.
