# Letterhome Runbook

The operational reference for running, deploying, and recovering Letterhome.
Everything in here has been tested in production.

---

## Quick reference

| Thing | Where |
|---|---|
| Live URL | https://letterhome.ca |
| Server | RackNerd VPS, user `letterhome`, app at `/var/letterhome` |
| Process manager | PM2, app name `letterhome`, id `0` |
| Reverse proxy | Caddy on 80/443 → `localhost:3000` |
| Health check | `https://letterhome.ca/health` |
| Uptime monitoring | UptimeRobot — alerts via email/SMS |
| Error tracking | Sentry — project "letterhome" |
| Backups | Daily 02:00 UTC → local `backups/` + Backblaze B2 (encrypted) |
| GitHub | `git@github.com:officenotfound/LetterHome.git` |

---

## Deploy a new version

```bash
ssh letterhome@<server-ip>
cd /var/letterhome
git pull origin main
npm install --omit=dev        # only when package.json changed
pm2 reload letterhome         # use --update-env if .env changed
pm2 logs letterhome --lines 30 --nostream
```

`pm2 reload` does a zero-downtime rolling restart. Use `pm2 restart` only if reload misbehaves.

If you edited `.env`, you MUST add `--update-env`:

```bash
pm2 reload letterhome --update-env
```

Verify after deploy:

```bash
curl -s https://letterhome.ca/health
# Expected: {"status":"ok","db":"ok","uptime":...}
```

---

## When the site goes down

UptimeRobot will email/SMS within ~5 min of `/health` failing.

### Triage

```bash
ssh letterhome@<server-ip>

# Is the process running?
pm2 list

# Recent errors
pm2 logs letterhome --lines 50 --nostream --err

# Is the DB accessible?
sqlite3 /var/letterhome/orders.db "SELECT COUNT(*) FROM orders;"

# Is Caddy reverse-proxying correctly?
sudo systemctl status caddy
sudo tail -50 /var/log/caddy/access.log
```

### Common fixes

| Symptom | Fix |
|---|---|
| `pm2 list` shows `errored` | `pm2 logs letterhome --lines 100 --nostream --err` then `pm2 restart letterhome` |
| `/health` returns 503 | DB is unreachable — check disk space `df -h /var`, check file perms on `orders.db` |
| Caddy down | `sudo systemctl restart caddy` |
| Out of disk | Old sessions: `find /var/letterhome/sessions -mtime +30 -delete`. Old backups: kept to 14 already. |
| Out of memory | `free -h` — if low, `pm2 restart letterhome` |

---

## Restore from backup (disaster recovery)

You've already validated this works end-to-end. Two scenarios:

### Scenario A: server is alive but DB is corrupted

```bash
# 1. Stop the app so it doesn't write to a broken DB
pm2 stop letterhome

# 2. Move the bad DB aside (don't delete — keep it for forensics)
mv /var/letterhome/orders.db /var/letterhome/orders.db.bad-$(date +%Y%m%d)

# 3. Find the most recent good backup
ls -lat /var/letterhome/backups/ | head -5

# 4. If it's a .db.enc, decrypt it first
node /var/letterhome/scripts/decrypt-backup.js \
  /var/letterhome/backups/orders-YYYY-MM-DD...db.enc \
  /var/letterhome/orders.db

# If it's a .db (unencrypted), just copy:
# cp /var/letterhome/backups/orders-YYYY-MM-DD...db /var/letterhome/orders.db

# 5. Restart
pm2 start letterhome
pm2 logs letterhome --lines 20 --nostream

# 6. Verify
curl -s https://letterhome.ca/health
```

### Scenario B: server is gone entirely

```bash
# 1. Provision a new VPS (Ubuntu, Node 24, sqlite3, caddy, pm2)
# 2. Clone the repo
git clone git@github.com:officenotfound/LetterHome.git /var/letterhome
cd /var/letterhome

# 3. Restore the .env file from your password manager
nano .env

# 4. Install deps
npm install --omit=dev

# 5. Pull the most recent encrypted backup from Backblaze B2 and decrypt:
node scripts/restore-drill.js
#    This downloads the latest .db.enc, decrypts it to /tmp,
#    and verifies it's intact. Then move it into place:
cp /tmp/letterhome-restore-test/orders-restored.db /var/letterhome/orders.db

# 6. Start under pm2
pm2 start server.js --name letterhome
pm2 save
pm2 startup    # follow the printed sudo command to install autostart

# 7. Point Caddy / DNS at the new server, test, done
```

### Verify backups regularly

Run the drill at least monthly — proves the chain still works:

```bash
node /var/letterhome/scripts/restore-drill.js
```

---

## Manage admin users

### Create a new admin user

```bash
cd /var/letterhome
node scripts/create-admin.js
# Follow prompts — generates bcrypt hash, prints what to set in .env
```

Then update `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` in `.env` and reload pm2 with `--update-env`.

### Reset 2FA (lost authenticator)

```bash
cd /var/letterhome
node scripts/setup-2fa.js
# Prints a QR code (or text secret) and a new TOTP_SECRET to set in .env
```

Update `TOTP_SECRET` in `.env`, then `pm2 reload letterhome --update-env`.

---

## Backups (how they work)

- Scheduled by `node-cron` inside `server.js`, runs daily at 02:00 UTC
- Encrypted with AES-256-GCM using the `BACKUP_PASSPHRASE` env var (scrypt-derived 32-byte key, 16-byte salt, 12-byte IV, 16-byte auth tag — all prepended to the ciphertext)
- Local copy: `backups/orders-YYYY-MM-DD...db.enc` (last 14 kept, older auto-pruned)
- Offsite copy: pushed to Backblaze B2 bucket
- Optional: email copy of the encrypted file to `OPERATOR_EMAIL` (controlled by `BACKUP_EMAIL_ENABLED`)

### Trigger a manual backup

Via admin panel: log into `/admin` → Backups → Run Backup

Via CLI:

```bash
curl -X POST https://letterhome.ca/api/admin/backups/run \
     -b "<your-session-cookie>"
```

(or simpler: just use the admin panel button)

### Verify a backup

```bash
node /var/letterhome/scripts/restore-drill.js
```

---

## Logs

```bash
pm2 logs letterhome                    # live tail
pm2 logs letterhome --lines 100        # last 100 lines, live tail
pm2 logs letterhome --lines 50 --nostream         # last 50, exit
pm2 logs letterhome --lines 50 --nostream --err   # errors only
pm2 flush letterhome                   # wipe log files (after rotating)
```

Log file paths:
- `/home/letterhome/.pm2/logs/letterhome-out.log`
- `/home/letterhome/.pm2/logs/letterhome-error.log`

Errors are also captured by Sentry — check https://sentry.io for stack traces + request context.

---

## Environment variables

All in `/var/letterhome/.env`. To view keys without values:

```bash
sed 's/=.*$/=<set>/' /var/letterhome/.env
```

| Var | Required | Purpose |
|---|---|---|
| `PORT` | ✓ | Listening port (3000) |
| `BASE_URL` | ✓ | Public-facing URL — used in emails & Stripe redirects |
| `SESSION_SECRET` | ✓ | Cookie signing secret |
| `STRIPE_SECRET_KEY` | ✓ | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | ✓ | Stripe webhook signature secret |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_SECURE` | ✓ | Email transport |
| `EMAIL_FROM` | ✓ | "From" address on outgoing email |
| `OPERATOR_EMAIL` | ✓ | Address that receives SLA alerts, contact-form submissions, admin notifications |
| `ADMIN_USERNAME` `ADMIN_PASSWORD_HASH` `TOTP_SECRET` | ✓ | Admin login |
| `BACKUP_PASSPHRASE` | ✓ | AES-256-GCM key derivation for backups. **NEVER LOSE THIS** — without it, encrypted backups are unrecoverable. Stored in password manager. |
| `BACKUP_EMAIL_ENABLED` | optional | If `true`, email an encrypted copy of each daily backup to `OPERATOR_EMAIL` |
| `B2_KEY_ID` `B2_APPLICATION_KEY` `B2_BUCKET_ID` | ✓ | Backblaze B2 offsite backup credentials |
| `SENTRY_DSN` | ✓ | Error tracking |
| `CF_API_TOKEN` `CF_ZONE_ID` | optional | Cloudflare API access |

Reload after any change:

```bash
pm2 reload letterhome --update-env
```

---

## Pre-launch checklist (the day you flip Stripe to live)

1. **Run a final restore drill** — `node scripts/restore-drill.js` must pass
2. **Verify all monitors are green** — UptimeRobot, Sentry inbox is clean
3. **Wipe test data** — see below
4. **Swap Stripe to live keys** — update `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env`, reload pm2 with `--update-env`
5. **Test one real $10 order** with your own card to verify the full flow
6. **Confirm webhook fires** — check `email_log` for the order_confirmation entry
7. **Refund yourself** in Stripe dashboard

### Wipe test data (run ONCE, right before flipping Stripe live)

```bash
# Stop the app to avoid races
pm2 stop letterhome

# Backup first
cp /var/letterhome/orders.db /var/letterhome/orders.db.pre-launch-$(date +%Y%m%d)

# Truncate the data tables, reset auto-increment IDs
sqlite3 /var/letterhome/orders.db <<SQL
DELETE FROM orders;
DELETE FROM customers;
DELETE FROM email_log;
DELETE FROM audit_log;
DELETE FROM customer_notes;
DELETE FROM customer_tags;
DELETE FROM saved_recipients;
DELETE FROM occasions;
DELETE FROM order_notes;
DELETE FROM contact_submissions;
DELETE FROM page_views;
DELETE FROM sqlite_sequence;   -- resets all AUTOINCREMENT counters
VACUUM;
SQL

# Verify it's clean
sqlite3 /var/letterhome/orders.db "SELECT 'orders:' || COUNT(*) FROM orders UNION SELECT 'customers:' || COUNT(*) FROM customers;"

# Restart
pm2 start letterhome
```

Now your first real order will be order #1. Clean slate.

---

## Contacts

- Hosting: RackNerd
- DNS / CDN: Cloudflare
- Payment: Stripe
- Email: SMTP provider (see `.env` SMTP_HOST)
- Monitoring: UptimeRobot, Sentry
- Backups: Backblaze B2
