'use strict';
// Admin tools: Search Console import and growth insights, checkout funnel and revenue, server health,
// backup restore drill, and the site content audit.
//
// Registered from server.js after the admin CSRF middleware, so every change here is protected.
//   registerAdmin(app, deps)   -> /api/admin/growth*, /api/admin/funnel, /api/admin/health-detail,
//                                  /api/admin/backups/drill, /api/admin/seo-audit*
//
// Everything here is light on purpose: it reads files and runs a few indexed queries, nothing runs continuously.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const tls = require('node:tls');
const { execFile } = require('node:child_process');
const { createDecipheriv, scryptSync, randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');

const SITES = ['ca', 'us', 'uk', 'au'];
const MAX_UPLOAD = 6 * 1024 * 1024;
const MAX_UNZIPPED = 25 * 1024 * 1024;
const KEEP_SNAPSHOTS = 12;

// ---------------------------------------------------------------------------------------------
// Reading Search Console exports (a .zip of CSV files, an .xlsx workbook, or a single CSV)
// ---------------------------------------------------------------------------------------------

// Minimal zip reader: stored and deflated entries only, which is all Search Console and Excel produce.
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > 200) throw new Error('Zip has too many files');
  const out = new Map();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Zip is damaged');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    total += usize;
    if (total > MAX_UNZIPPED) throw new Error('Zip is too large');
    const lnlen = buf.readUInt16LE(off + 26);
    const lelen = buf.readUInt16LE(off + 28);
    const data = buf.subarray(off + 30 + lnlen + lelen, off + 30 + lnlen + lelen + csize);
    let content;
    if (method === 0) content = data;
    else if (method === 8) content = zlib.inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED });
    else continue;
    out.set(name, content);
  }
  return out;
}

const xmlUnescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function readXlsx(files) {
  const get = n => (files.get(n) ? files.get(n).toString('utf8') : '');
  const shared = [];
  for (const m of get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push(xmlUnescape([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
  }
  const names = [...get('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]*)"/g)].map(m => xmlUnescape(m[1]));
  const sheets = {};
  names.forEach((name, i) => {
    const xml = get(`xl/worksheets/sheet${i + 1}.xml`);
    const rows = [];
    for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1], inner = c[2] || '';
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        let val = '';
        if (v) val = /t="s"/.test(attrs) ? (shared[parseInt(v[1], 10)] || '') : xmlUnescape(v[1]);
        else if (t) val = xmlUnescape(t[1]);
        cells.push(val);
      }
      rows.push(cells);
    }
    sheets[name] = rows;
  });
  return sheets;
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = v => {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace('%', '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// One normalized shape out of any of the three formats: { queries, pages, countries, devices, chart }
function normalizeExport(sheets) {
  const pick = (...names) => {
    for (const n of names) {
      const hit = Object.keys(sheets).find(k => k.toLowerCase().replace(/\.csv$/, '') === n);
      if (hit) return sheets[hit];
    }
    return null;
  };
  const toRows = (rows, isDate) => {
    if (!rows || rows.length < 2) return [];
    return rows.slice(1).filter(r => r[0] !== '' && r[0] != null).map(r => {
      const impressions = num(r[2]);
      const clicks = num(r[1]);
      let ctr = num(r[3]);
      if (!isDate && String(r[3] || '').includes('%')) ctr = ctr / 100;
      else if (ctr > 1) ctr = ctr / 100;
      if (!ctr && impressions) ctr = clicks / impressions;
      return { key: String(r[0]).slice(0, 500), clicks, impressions, ctr, position: num(r[4]) };
    });
  };
  const out = {
    queries: toRows(pick('queries'), false),
    pages: toRows(pick('pages'), false),
    countries: toRows(pick('countries'), false),
    devices: toRows(pick('devices'), false),
    chart: toRows(pick('chart', 'dates'), true),
  };
  if (!out.queries.length && !out.pages.length && !out.chart.length) throw new Error('No Search Console tables found in that file');
  return out;
}

function parseUpload(buf, filename) {
  const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (isZip) {
    const files = readZip(buf);
    if (files.has('xl/workbook.xml')) return normalizeExport(readXlsx(files));
    const sheets = {};
    for (const [name, content] of files) {
      if (name.toLowerCase().endsWith('.csv')) sheets[path.basename(name)] = parseCsv(content.toString('utf8'));
    }
    return normalizeExport(sheets);
  }
  const rows = parseCsv(buf.toString('utf8'));
  const head = String(rows[0] && rows[0][0] || '').toLowerCase();
  const key = head.includes('quer') ? 'Queries' : head.includes('page') ? 'Pages' : head.startsWith('country') ? 'Countries' : head.startsWith('device') ? 'Devices' : head.startsWith('date') ? 'Chart' : null;
  if (!key) throw new Error('Could not tell what that file is. Upload the .zip or .xlsx export from Search Console.');
  return normalizeExport({ [key]: rows });
}

// ---------------------------------------------------------------------------------------------
// Insights from stored snapshots
// ---------------------------------------------------------------------------------------------

function register(app, { db, requireAdmin, logAudit, getSetting, backupDir, appRoot, baseUrl }) {
  db.exec(`CREATE TABLE IF NOT EXISTS gsc_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, site TEXT NOT NULL, imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_from TEXT, date_to TEXT, clicks INTEGER DEFAULT 0, impressions INTEGER DEFAULT 0, filename TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS gsc_rows (
    snapshot_id INTEGER NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL,
    clicks REAL, impressions REAL, ctr REAL, position REAL)`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_gsc_rows_snap ON gsc_rows(snapshot_id, kind)');
  db.exec(`CREATE TABLE IF NOT EXISTS seo_audit_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at DATETIME DEFAULT CURRENT_TIMESTAMP, result TEXT NOT NULL)`);

  const rowsOf = (id, kind) => db.prepare('SELECT key, clicks, impressions, ctr, position FROM gsc_rows WHERE snapshot_id = ? AND kind = ?').all(id, kind);
  const siteOk = s => SITES.includes(s);

  function growthFor(site) {
    const snaps = db.prepare('SELECT * FROM gsc_snapshots WHERE site = ? ORDER BY id DESC LIMIT ?').all(site, KEEP_SNAPSHOTS);
    if (!snaps.length) return { site, snapshots: [], empty: true };
    const latest = snaps[0];
    const prev = snaps[1] || null;
    const pages = rowsOf(latest.id, 'page');
    const queries = rowsOf(latest.id, 'query');
    const countries = rowsOf(latest.id, 'country');
    const devices = rowsOf(latest.id, 'device');
    const chart = rowsOf(latest.id, 'date').sort((a, b) => a.key.localeCompare(b.key));
    const prevPages = prev ? new Map(rowsOf(prev.id, 'page').map(r => [r.key, r])) : new Map();
    const prevQueries = prev ? new Map(rowsOf(prev.id, 'query').map(r => [r.key, r])) : new Map();
    const short = u => u.replace(/^https?:\/\/[^/]+/, '') || '/';

    // Ranks on page 1 but few people click: the title or snippet is the problem, not the ranking.
    const pageOneQuiet = pages.filter(r => r.position > 0 && r.position <= 10.5 && r.impressions >= 40 && r.ctr < 0.01)
      .sort((a, b) => b.impressions - a.impressions).slice(0, 15).map(r => ({ ...r, key: short(r.key) }));
    // Close to page 1: a small push (links, better answer) can move these.
    const nearPageOne = queries.filter(r => r.position > 10.5 && r.position <= 20 && r.impressions >= 8)
      .sort((a, b) => b.impressions - a.impressions).slice(0, 20);
    // Where people look for you from, but you rank deep.
    const deepCountries = countries.filter(r => r.impressions >= 50 && r.position > 25).sort((a, b) => b.impressions - a.impressions).slice(0, 8);
    // Biggest changes since the previous import.
    const movers = prev ? pages.map(r => {
      const p = prevPages.get(r.key);
      return { key: short(r.key), impressions: r.impressions, delta: r.impressions - (p ? p.impressions : 0), clicks: r.clicks, position: r.position, isNew: !p };
    }).filter(r => Math.abs(r.delta) >= 20).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 12) : [];
    const newQueries = prev ? queries.filter(r => !prevQueries.has(r.key) && r.impressions >= 5).sort((a, b) => b.impressions - a.impressions).slice(0, 12) : [];
    // Questions people ask: ideas for guides.
    const questions = queries.filter(r => /^(how|what|where|when|why|can|do|does|is|are|which|who)\b/i.test(r.key) && r.impressions >= 5)
      .sort((a, b) => b.impressions - a.impressions).slice(0, 20);
    const cleanPages = pages.map(r => ({ ...r, key: short(r.key) })).sort((a, b) => b.impressions - a.impressions);

    return {
      site,
      snapshots: snaps.map(s => ({ id: s.id, imported_at: s.imported_at, date_from: s.date_from, date_to: s.date_to, clicks: s.clicks, impressions: s.impressions })),
      latest: { id: latest.id, imported_at: latest.imported_at, date_from: latest.date_from, date_to: latest.date_to, clicks: latest.clicks, impressions: latest.impressions },
      previous: prev ? { id: prev.id, clicks: prev.clicks, impressions: prev.impressions, date_to: prev.date_to } : null,
      avgPosition: (() => { const w = chart.filter(r => r.impressions > 0 && r.position > 0); const t = w.reduce((a, r) => a + r.impressions, 0); return t ? w.reduce((a, r) => a + r.position * r.impressions, 0) / t : 0; })(),
      chart,
      topPages: cleanPages.slice(0, 15),
      topQueries: queries.sort((a, b) => b.impressions - a.impressions).slice(0, 20),
      countries: countries.sort((a, b) => b.impressions - a.impressions).slice(0, 12),
      devices,
      pageOneQuiet, nearPageOne, deepCountries, movers, newQueries, questions,
    };
  }

  app.get('/api/admin/growth', requireAdmin, (req, res) => {
    const site = siteOk(req.query.site) ? req.query.site : 'ca';
    try { res.json(growthFor(site)); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/growth/import', requireAdmin, express.raw({ type: '*/*', limit: MAX_UPLOAD }), (req, res) => {
    const site = String(req.headers['x-site'] || '');
    if (!siteOk(site)) return res.status(400).json({ error: 'Choose which site this export is for.' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No file received.' });
    const filename = String(req.headers['x-filename'] || '').slice(0, 200);
    let data;
    try { data = parseUpload(req.body, filename); } catch (e) { return res.status(400).json({ error: e.message }); }
    const dates = data.chart.map(r => r.key).sort();
    const clicks = data.chart.length ? data.chart.reduce((a, r) => a + r.clicks, 0) : data.pages.reduce((a, r) => a + r.clicks, 0);
    const impressions = data.chart.length ? data.chart.reduce((a, r) => a + r.impressions, 0) : data.pages.reduce((a, r) => a + r.impressions, 0);
    db.exec('BEGIN');
    try {
      const id = Number(db.prepare('INSERT INTO gsc_snapshots (site, date_from, date_to, clicks, impressions, filename) VALUES (?,?,?,?,?,?)')
        .run(site, dates[0] || null, dates[dates.length - 1] || null, Math.round(clicks), Math.round(impressions), filename).lastInsertRowid);
      const ins = db.prepare('INSERT INTO gsc_rows (snapshot_id, kind, key, clicks, impressions, ctr, position) VALUES (?,?,?,?,?,?,?)');
      const put = (kind, rows) => rows.slice(0, 2000).forEach(r => ins.run(id, kind, r.key, r.clicks, r.impressions, r.ctr, r.position));
      put('query', data.queries); put('page', data.pages); put('country', data.countries); put('device', data.devices); put('date', data.chart);
      const old = db.prepare('SELECT id FROM gsc_snapshots WHERE site = ? ORDER BY id DESC LIMIT -1 OFFSET ?').all(site, KEEP_SNAPSHOTS);
      for (const o of old) { db.prepare('DELETE FROM gsc_rows WHERE snapshot_id = ?').run(o.id); db.prepare('DELETE FROM gsc_snapshots WHERE id = ?').run(o.id); }
      db.exec('COMMIT');
      logAudit(req, 'growth.import', 'search-console', `${site} ${filename}`);
      res.json({ ok: true, id, queries: data.queries.length, pages: data.pages.length });
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/admin/growth/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM gsc_rows WHERE snapshot_id = ?').run(id);
    db.prepare('DELETE FROM gsc_snapshots WHERE id = ?').run(id);
    logAudit(req, 'growth.delete', 'search-console', String(id));
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------------------------
  // Funnel and revenue
  // -------------------------------------------------------------------------------------------
  app.get('/api/admin/funnel', requireAdmin, (req, res) => {
    try {
      const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
      const site = siteOk(req.query.site) ? req.query.site : 'all';
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const siteSql = site === 'all' ? '' : ` AND COALESCE(NULLIF(order_site, ''), 'ca') = '${site}'`;
      const pvSite = site === 'all' ? '' : ` AND COALESCE(NULLIF(site, ''), 'ca') = '${site}'`;

      const f = Object.fromEntries(db.prepare('SELECT step, COUNT(*) n FROM funnel_events WHERE day >= ? GROUP BY step').all(since).map(r => [r.step, r.n]));
      const views = db.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT ip) u FROM page_views WHERE created_at >= datetime('now', ?)${pvSite}`).get(`-${days} days`);
      const paidWhere = `status != 'awaiting_payment' AND deleted_at IS NULL AND created_at >= datetime('now', ?)${siteSql}`;
      const paid = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(price_cents),0) cents FROM orders WHERE ${paidWhere}`).get(`-${days} days`);
      const unpaid = db.prepare(`SELECT COUNT(*) n FROM orders WHERE status = 'awaiting_payment' AND deleted_at IS NULL AND created_at >= datetime('now', ?)${siteSql}`).get(`-${days} days`).n;
      const mailed = db.prepare(`SELECT COUNT(*) n FROM orders WHERE status IN ('mailed','delivered') AND deleted_at IS NULL AND created_at >= datetime('now', ?)${siteSql}`).get(`-${days} days`).n;
      const refunded = db.prepare(`SELECT COUNT(*) n FROM orders WHERE status = 'refunded' AND deleted_at IS NULL AND created_at >= datetime('now', ?)${siteSql}`).get(`-${days} days`).n;
      const weekly = db.prepare(`SELECT strftime('%Y-W%W', created_at) week, COUNT(*) orders, COALESCE(SUM(price_cents),0) cents
        FROM orders WHERE ${paidWhere} GROUP BY week ORDER BY week`).all(`-${days} days`);
      const byCountry = db.prepare(`SELECT COALESCE(destination_country,'?') country, COUNT(*) orders, COALESCE(SUM(price_cents),0) cents
        FROM orders WHERE ${paidWhere} GROUP BY country ORDER BY orders DESC LIMIT 12`).all(`-${days} days`);
      const bySite = db.prepare(`SELECT COALESCE(NULLIF(order_site,''),'ca') site, COUNT(*) orders, COALESCE(SUM(price_cents),0) cents
        FROM orders WHERE status != 'awaiting_payment' AND deleted_at IS NULL AND created_at >= datetime('now', ?) GROUP BY site`).all(`-${days} days`);
      const hours = db.prepare(`SELECT (julianday(mailed_at) - julianday(paid_at)) * 24 h FROM orders
        WHERE mailed_at IS NOT NULL AND paid_at IS NOT NULL AND created_at >= datetime('now', ?)${siteSql}`).all(`-${days} days`).map(r => r.h).filter(h => h >= 0).sort((a, b) => a - b);
      const median = hours.length ? hours[Math.floor(hours.length / 2)] : null;
      const repeat = db.prepare(`SELECT COUNT(*) n FROM (SELECT customer_email FROM orders WHERE status != 'awaiting_payment' AND deleted_at IS NULL GROUP BY customer_email HAVING COUNT(*) > 1)`).get().n;
      const customers = db.prepare(`SELECT COUNT(DISTINCT customer_email) n FROM orders WHERE status != 'awaiting_payment' AND deleted_at IS NULL`).get().n;
      const topPages = db.prepare(`SELECT path, COUNT(*) n FROM page_views WHERE created_at >= datetime('now', ?)${pvSite} GROUP BY path ORDER BY n DESC LIMIT 8`).all(`-${days} days`);

      res.json({
        days, site,
        steps: { visitors: views.u, views: views.n, send_view: f.send_view || 0, step2: f.step2 || 0, step3: f.step3 || 0, pay_click: f.pay_click || 0, paid: paid.n, mailed },
        resume_click: f.resume_click || 0,
        revenue_cents: paid.cents, orders: paid.n, unpaid, refunded,
        aov_cents: paid.n ? Math.round(paid.cents / paid.n) : 0,
        weekly, byCountry, bySite, topPages,
        median_hours_to_mail: median == null ? null : Math.round(median * 10) / 10,
        repeat_customers: repeat, customers,
        note: 'Revenue is in Canadian dollars (the base price). Checkout steps are not split by site.',
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // -------------------------------------------------------------------------------------------
  // Server health
  // -------------------------------------------------------------------------------------------
  let healthCache = { at: 0, data: null };
  const run = (cmd, args, ms = 2500) => new Promise(resolve => {
    try { execFile(cmd, args, { timeout: ms, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : String(stdout).trim())); }
    catch { resolve(null); }
  });

  async function certDays() {
    return new Promise(resolve => {
      let host = 'letterhome.ca';
      try { host = new URL(baseUrl || 'https://letterhome.ca').hostname; } catch {}
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      try {
        const s = tls.connect({ host: '127.0.0.1', port: 443, servername: host, rejectUnauthorized: false, timeout: 2000 }, () => {
          const c = s.getPeerCertificate();
          s.end();
          finish(c && c.valid_to ? Math.floor((new Date(c.valid_to) - Date.now()) / 86400000) : null);
        });
        s.on('error', () => finish(null));
        s.on('timeout', () => { s.destroy(); finish(null); });
      } catch { finish(null); }
    });
  }

  function lastBackup() {
    try {
      const files = fs.readdirSync(backupDir).filter(f => f.startsWith('orders-')).map(f => ({ f, s: fs.statSync(path.join(backupDir, f)) }))
        .sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
      if (!files.length) return null;
      return { file: files[0].f, size: files[0].s.size, ageHours: Math.round((Date.now() - files[0].s.mtimeMs) / 360000) / 10, count: files.length };
    } catch { return null; }
  }

  async function healthDetail() {
    const mem = { total: os.totalmem(), free: os.freemem() };
    let swap = null;
    try {
      const m = fs.readFileSync('/proc/meminfo', 'utf8');
      const g = k => { const r = m.match(new RegExp('^' + k + ':\\s+(\\d+) kB', 'm')); return r ? parseInt(r[1], 10) * 1024 : 0; };
      mem.available = g('MemAvailable');
      swap = { total: g('SwapTotal'), used: g('SwapTotal') - g('SwapFree') };
    } catch {}
    let disk = null;
    try { const s = fs.statfsSync(appRoot); disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch {}
    let db_bytes = 0;
    for (const ext of ['', '-wal', '-shm']) { try { db_bytes += fs.statSync(path.join(appRoot, 'orders.db' + ext)).size; } catch {} }
    const [clam, pm2, cert] = await Promise.all([
      run('systemctl', ['is-active', 'clamav-daemon']),
      run('pm2', ['jlist'], 3500),
      certDays(),
    ]);
    let restarts = null;
    try {
      const list = JSON.parse(pm2 || '[]');
      const me = list.find(p => p.name === 'letterhome') || list[0];
      if (me) restarts = { count: me.pm2_env.restart_time, status: me.pm2_env.status };
    } catch {}
    return {
      at: new Date().toISOString(),
      cpus: os.cpus().length, load: os.loadavg(),
      mem, swap, disk, db_bytes,
      uptime_s: Math.floor(process.uptime()), host_uptime_s: Math.floor(os.uptime()),
      clamav: clam, pm2: restarts, cert_days: cert,
      backup: lastBackup(), node: process.version,
    };
  }

  app.get('/api/admin/health-detail', requireAdmin, async (req, res) => {
    try {
      if (!healthCache.data || Date.now() - healthCache.at > 20000) healthCache = { at: Date.now(), data: await healthDetail() };
      res.json(healthCache.data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // -------------------------------------------------------------------------------------------
  // Restore drill: decrypt the newest backup into a scratch file, check it, delete it
  // -------------------------------------------------------------------------------------------
  let drilling = false;
  app.post('/api/admin/backups/drill', requireAdmin, (req, res) => {
    if (drilling) return res.status(409).json({ ok: false, error: 'A drill is already running.' });
    drilling = true;
    const started = Date.now();
    let scratch = null;
    try {
      const files = fs.readdirSync(backupDir).filter(f => f.startsWith('orders-') && (f.endsWith('.db') || f.endsWith('.db.enc')))
        .map(f => ({ f, s: fs.statSync(path.join(backupDir, f)) })).sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
      if (!files.length) return res.json({ ok: false, error: 'No local backup found.' });
      const pick = files[0];
      const src = path.join(backupDir, pick.f);
      scratch = path.join(os.tmpdir(), `drill-${randomBytes(6).toString('hex')}.db`);
      if (pick.f.endsWith('.enc')) {
        const pass = process.env.BACKUP_PASSPHRASE;
        if (!pass) return res.json({ ok: false, error: 'BACKUP_PASSPHRASE is not set, so the backup cannot be opened.' });
        const buf = fs.readFileSync(src);
        if (buf.length < 44 + 1) return res.json({ ok: false, error: 'The backup file is too small to be valid.' });
        const key = scryptSync(pass, buf.subarray(0, 16), 32, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
        const d = createDecipheriv('aes-256-gcm', key, buf.subarray(16, 28));
        d.setAuthTag(buf.subarray(28, 44));
        let plain;
        try { plain = Buffer.concat([d.update(buf.subarray(44)), d.final()]); }
        catch { return res.json({ ok: false, error: 'Decryption failed: wrong passphrase or damaged file.', file: pick.f }); }
        fs.writeFileSync(scratch, plain, { mode: 0o600 });
      } else {
        fs.copyFileSync(src, scratch);
        fs.chmodSync(scratch, 0o600);
      }
      const t = new DatabaseSync(scratch, { readOnly: true });
      let integrity, orders, lastId;
      try {
        integrity = t.prepare('PRAGMA integrity_check').get().integrity_check;
        orders = t.prepare('SELECT COUNT(*) n, COALESCE(MAX(id),0) m FROM orders').get();
        lastId = orders.m;
      } finally { t.close(); }
      const live = db.prepare('SELECT COUNT(*) n, COALESCE(MAX(id),0) m FROM orders').get();
      const ok = integrity === 'ok';
      logAudit(req, 'backup.drill', 'backup', `${pick.f} ${ok ? 'ok' : 'FAILED'}`);
      res.json({
        ok, file: pick.f, ageHours: Math.round((Date.now() - pick.s.mtimeMs) / 360000) / 10, size: pick.s.size,
        integrity, backupOrders: orders.n, backupLastId: lastId, liveOrders: live.n, liveLastId: live.m,
        ms: Date.now() - started,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    } finally {
      drilling = false;
      if (scratch) { try { fs.unlinkSync(scratch); } catch {} }
    }
  });

  // -------------------------------------------------------------------------------------------
  // Content audit: reads the page files, so it never touches the live site
  // -------------------------------------------------------------------------------------------
  const pubDir = path.join(appRoot, 'public');
  const SKIP_PAGES = new Set(['404.html', '500.html', 'account.html', 'order-success.html']);
  const KNOWN_PATHS = new Set(['/', '/send', '/track', '/portal', '/admin', '/health', '/sitemap.xml', '/robots.txt', '/llms.txt', '/account', '/order-success', '/unsubscribe']);

  // Some page files are served under a country prefix (uk-return-address-on-a-letter.html is /uk/return-address-on-a-letter
  // on letterhome.ca), so a file counts as listed if any of the addresses it can be served at is in the sitemap.
  function urlVariants(slug) {
    const v = new Set(['/' + slug]);
    let m;
    if ((m = slug.match(/^(us|uk|au)-(.+)$/))) { v.add(`/${m[1]}/${m[2]}`); v.add('/' + m[2]); }
    if ((m = slug.match(/^business-(us|uk|au)(-es)?$/))) v.add(m[2] ? `/${m[1]}/es/business` : `/${m[1]}/business`);
    if ((m = slug.match(/^careers-(.+)$/))) v.add(`/careers/${m[1]}`);
    if ((m = slug.match(/^(.+)-es$/))) v.add(`/us/es/${m[1]}`);
    if ((m = slug.match(/-from-(us|uk|au)$/))) v.add(`/${m[1]}/${slug}`);
    return [...v];
  }

  function auditSite() {
    const started = Date.now();
    const files = fs.readdirSync(pubDir).filter(f => f.endsWith('.html') && !SKIP_PAGES.has(f));
    let sitemap = '';
    try { sitemap = fs.readFileSync(path.join(pubDir, 'sitemap.xml'), 'utf8'); } catch {}
    const inSitemap = new Set([...sitemap.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map(m => m[1] || '/'));
    const issues = [];
    const titles = new Map(), descs = new Map();
    const add = (sev, page, msg) => issues.push({ sev, page, msg });
    const exists = p => {
      const clean = p.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';
      if (KNOWN_PATHS.has(clean) || inSitemap.has(clean)) return true;
      const rel = clean.replace(/^\//, '');
      return fs.existsSync(path.join(pubDir, rel + '.html')) || fs.existsSync(path.join(pubDir, rel)) || fs.existsSync(path.join(pubDir, rel, 'index.html'));
    };
    const dateOld = txt => {
      const m = txt.match(/Updated (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})/);
      if (!m) return null;
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const d = new Date(Date.UTC(parseInt(m[2], 10), months.indexOf(m[1]), 1));
      return Math.floor((Date.now() - d.getTime()) / 86400000);
    };
    let pages = 0;
    for (const f of files) {
      const html = fs.readFileSync(path.join(pubDir, f), 'utf8');
      const urlPath = f === 'index.html' ? '/' : '/' + f.replace(/\.html$/, '');
      const noindex = /<meta[^>]+name="robots"[^>]+noindex/i.test(html);
      pages++;
      const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
      const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
      const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
      const h1s = (html.match(/<h1[\s>]/g) || []).length;
      const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
      if (noindex) continue;
      if (!title) add('high', urlPath, 'Missing title');
      else {
        const t = title.trim();
        if (t.length > 65) add('low', urlPath, `Title is ${t.length} characters (Google may cut it off)`);
        if (t.length < 20) add('low', urlPath, `Title is short (${t.length} characters)`);
        if (titles.has(t)) add('med', urlPath, `Same title as ${titles.get(t)}`); else titles.set(t, urlPath);
      }
      if (!desc) add('med', urlPath, 'Missing meta description');
      else {
        if (desc.length > 170) add('low', urlPath, `Description is ${desc.length} characters (may be cut off)`);
        if (desc.length < 70) add('low', urlPath, `Description is short (${desc.length} characters)`);
        if (descs.has(desc)) add('med', urlPath, `Same description as ${descs.get(desc)}`); else descs.set(desc, urlPath);
      }
      if (!canon) add('med', urlPath, 'Missing canonical link');
      if (h1s !== 1) add('med', urlPath, h1s === 0 ? 'No H1 heading' : `${h1s} H1 headings`);
      if (f !== 'index.html' && !urlVariants(f.replace(/\.html$/, '')).some(v => inSitemap.has(v))) add('med', urlPath, 'Not listed in the sitemap');
      const dashes = (text.match(/—/g) || []).length;
      if (dashes) add('low', urlPath, `${dashes} em dash${dashes > 1 ? 'es' : ''} in the text`);
      const old = dateOld(text);
      if (old != null && old > 150) add('low', urlPath, `"Updated" date is ${Math.round(old / 30)} months old`);
      const seen = new Set();
      for (const m of html.matchAll(/<a [^>]*href="(\/[^"#?]*)[^"]*"/g)) {
        const href = m[1];
        if (seen.has(href) || href.startsWith('//')) continue;
        seen.add(href);
        if (/\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?|json|xml|txt|pdf)$/i.test(href)) continue;
        if (!exists(href)) add('high', urlPath, `Link to ${href} goes nowhere`);
      }
    }
    for (const p of inSitemap) { if (!exists(p)) add('high', 'sitemap.xml', `Sitemap lists ${p} but no page exists`); }
    const order = { high: 0, med: 1, low: 2 };
    issues.sort((a, b) => order[a.sev] - order[b.sev] || a.page.localeCompare(b.page));
    return {
      pages, ms: Date.now() - started,
      counts: { high: issues.filter(i => i.sev === 'high').length, med: issues.filter(i => i.sev === 'med').length, low: issues.filter(i => i.sev === 'low').length },
      issues: issues.slice(0, 400), truncated: issues.length > 400,
    };
  }

  function runAudit() {
    const result = auditSite();
    db.prepare('INSERT INTO seo_audit_runs (result) VALUES (?)').run(JSON.stringify(result));
    db.prepare('DELETE FROM seo_audit_runs WHERE id NOT IN (SELECT id FROM seo_audit_runs ORDER BY id DESC LIMIT 14)').run();
    return result;
  }

  app.get('/api/admin/seo-audit', requireAdmin, (req, res) => {
    const row = db.prepare('SELECT ran_at, result FROM seo_audit_runs ORDER BY id DESC LIMIT 1').get();
    const prev = db.prepare('SELECT result FROM seo_audit_runs ORDER BY id DESC LIMIT 1 OFFSET 1').get();
    if (!row) return res.json({ empty: true });
    const result = JSON.parse(row.result);
    result.ran_at = row.ran_at;
    if (prev) { try { result.previous_counts = JSON.parse(prev.result).counts; } catch {} }
    res.json(result);
  });

  app.post('/api/admin/seo-audit/run', requireAdmin, (req, res) => {
    try { const r = runAudit(); r.ran_at = new Date().toISOString(); res.json(r); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  return { runAudit };
}

module.exports = { register, parseUpload, readZip, parseCsv, normalizeExport };
