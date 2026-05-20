# Letterhome Roadmap

## v0.2 Beta — Production Hardening

**Goal:** ship a real-money Stripe launch within 2 weeks of 2026-05-20.

Currently on Stripe **test mode**. All orders in DB are test data. v0.2 ends by flipping Stripe to live keys after the checklist below is complete.

### Must-do (locked order)

- [x] **1. `/health` endpoint** — returns 200 + DB ping, 503 if DB unreachable. Used by uptime monitoring.
- [ ] **2. UptimeRobot** — free tier (50 monitors, 5-min interval) hitting `https://letterhome.ca/health`. Email + SMS alerts on downtime.
- [ ] **3. Sentry error tracking** — free tier (5k events/mo). Wire into Express to capture uncaught exceptions and `sendErrorAlert()` calls.
- [ ] **4. Offsite encrypted backup** — daily push of `backups/orders-*.db.enc` to Backblaze B2 (~$0.50/mo). Beyond the existing email backup.
- [ ] **5. Backup restore drill** — actually decrypt and restore a backup on a fresh machine. Proves the backups work end-to-end.
- [ ] **6. Runbook** — `docs/RUNBOOK.md` with: deploy steps, restore steps, add-admin steps, common troubleshooting. Write as we work through 1–5.
- [ ] **7. Wipe test data** — truncate `orders`, `customers`, `email_log`, `audit_log`, reset auto-increment IDs. **Very last step before flipping Stripe to live.**

### Strongly recommended (do if time)

- [ ] Critical-path tests: Stripe webhook paid event, order creation, order status lookup
- [ ] GitHub Actions CI — lint + test on push, manual-trigger deploy
- [ ] Institutional trust signals (Mailed from Canada, encrypted backups, deletion policy) — real testimonials need real customers first
- [ ] Pre-launch checklist doc — what to verify the day of flipping Stripe live

### Out of scope for v0.2

- Staging environment
- Customer features (recurring sends, gift cards) → v0.3+
- CSP nonce refactor — low payoff
- Status page — UptimeRobot has a free one if needed later

---

## Deploy reference

```bash
ssh letterhome@racknerd-8dd23aa
cd /var/letterhome
git pull origin main
npm install --omit=dev    # only when package.json changed
pm2 reload letterhome
pm2 logs letterhome --lines 30 --nostream
```

Live URL: https://letterhome.ca
Server: RackNerd VPS, app at `/var/letterhome`, PM2 process `letterhome` (id 0)
Reverse proxy: Caddy on 80/443 → localhost:3000
