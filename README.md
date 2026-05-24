<div align="center">

# Letterhome

Send real physical mail to Canada from anywhere in the world.

[![version](https://img.shields.io/badge/version-0.5.0-0ea5e9?style=flat-square)](https://github.com/officenotfound/LetterHome/releases)
[![node](https://img.shields.io/badge/Node.js-22%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![stripe](https://img.shields.io/badge/Stripe-Checkout-635BFF?style=flat-square&logo=stripe&logoColor=white)](https://stripe.com)
[![license](https://img.shields.io/badge/license-private-dc2626?style=flat-square)](#license)

**[letterhome.ca](https://letterhome.ca)**

</div>

---

## What It Is

Letterhome is a postal service for Canadians living abroad. You write your letter online, we print it, seal it, stamp it with Canadian postage, and drop it in the mail — all within one business day.

- **$10 CAD** — anywhere within Canada
- **$20 CAD** — 160+ countries worldwide
- Human review before every order is printed
- ~2 weeks domestic · ~4 weeks international

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+ · Express 4 |
| Database | SQLite (`node:sqlite` — built-in, no compilation) |
| Payments | Stripe Checkout |
| Email | Nodemailer (SMTP) |
| Admin | Session auth · bcrypt · TOTP 2FA · audit log |
| Security | Helmet · rate limiting · HIBP breach check |
| Monitoring | Sentry · UptimeRobot |
| Backups | AES-256-GCM encrypted daily backup → Backblaze B2 |
| i18n | English / French |
| Frontend | Vanilla HTML / CSS / JS |
| Infra | PM2 · Caddy · Linux VPS |

---

## License

Private — all rights reserved.
