# Letterhome

> **Send real physical mail to Canada from anywhere in the world.**
> Write online — we print, stamp, and mail it for you.

🌐 **[letterhome.ca](https://letterhome.ca)**

---

## What it is

Letterhome is a postal service for Canadians living abroad. You write your letter online, we print it on quality letter paper, seal it in an envelope, apply Canadian postage, and drop it in the mail — all within one business day.

- **$10 CAD** — anywhere within Canada
- **$20 CAD** — anywhere in the world (160+ countries)
- Every order reviewed by a human before printing
- Delivery in 2 weeks domestic · 4 weeks international

---

## Stack

| Layer | Technology |
|---|---|
| Server | Node.js 22+ · Express |
| Database | SQLite (`node:sqlite` — built-in, no compilation) |
| Payments | Stripe Checkout |
| Email | Nodemailer (SMTP) |
| File uploads | Multer (PDF / DOCX attachments, up to 5 files · 10 MB each) |
| Address autocomplete | Google Places API |
| Frontend | Vanilla HTML/CSS/JS — no framework, no build step |
| Process manager | PM2 |
| Reverse proxy | Caddy |

---

## How it works

```
Customer fills out form  →  Stripe Checkout  →  Payment confirmed
        ↓
  Stripe webhook fires  →  fulfillOrder()
        ↓
  Operator email sent (full order + attachments)
  Customer confirmation email sent
  Order status updated to "paid"
        ↓
  Operator prints & mails within 1 business day
```

---

## Project structure

```
letterhome/
├── server.js              # Express backend — all routes & logic
├── package.json
├── .env.example           # Environment variable template
├── orders.db              # SQLite database (gitignored)
├── uploads/               # Temp attachment storage (gitignored)
└── public/
    ├── index.html         # Landing page
    ├── send.html          # Order form (3-step)
    ├── order-success.html # Post-payment confirmation page
    ├── track.html         # Order tracking by email + ID
    ├── about.html
    ├── contact.html
    ├── privacy.html
    ├── terms.html
    └── refunds.html
```

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/create-order` | Validate form, create DB record, open Stripe Checkout session |
| `GET` | `/api/order-status` | Poll order status by Stripe session ID (used by success page) |
| `POST` | `/api/track` | Track an order by email + order ID |
| `POST` | `/api/contact` | Contact form → operator email |
| `POST` | `/webhook` | Stripe webhook — fires `fulfillOrder()` on payment |

---

## Running locally

```bash
git clone git@github.com:officenotfound/LetterHome.git
cd LetterHome
npm install
cp .env.example .env
# Fill in .env with your Stripe + SMTP credentials
node server.js
```

Requires **Node.js 22+** (uses the built-in `node:sqlite` module).

---

## Environment variables

```env
PORT=3000
BASE_URL=https://letterhome.ca

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password

EMAIL_FROM="Letterhome <hello@letterhome.ca>"
OPERATOR_EMAIL=you@gmail.com
```

---

## Deployment

The production server runs on a Linux VPS with **Caddy** as a reverse proxy.

```
letterhome.ca {
    reverse_proxy localhost:3000
    encode gzip
}
```

Start with PM2:
```bash
npm install
pm2 start server.js --name letterhome
pm2 save && pm2 startup
```

---

## Stripe webhook setup

1. Dashboard → Developers → Webhooks → **Add endpoint**
2. URL: `https://letterhome.ca/webhook`
3. Event: `checkout.session.completed`
4. Copy the signing secret → `STRIPE_WEBHOOK_SECRET` in `.env`

---

## Countries

Letters can be sent to **160+ countries**. The following countries are excluded due to postal restrictions or international sanctions:

Afghanistan · Belarus · Burkina Faso · Central African Republic · Eritrea · Haiti · Iraq · Iran · Libya · Mali · Myanmar · North Korea · Russia · Somalia · South Sudan · Sudan · Syria · Yemen · Zimbabwe

---

## License

Private — all rights reserved.
