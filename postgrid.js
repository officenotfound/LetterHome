'use strict';
// PostGrid Print & Mail integration: turns a paid order into one mailed letter.
// Everything is off until POSTGRID_API_KEY is set; a key starting "test_" never mails anything.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const { makeDestinations, destinationOf, pageSizeOf, ADDRESS_CLEARANCE_IN, MARGIN_IN } = require('./destinations');

const BASE_URL = 'https://api.postgrid.com/print-mail/v1';
const IN = 72;                                // points per inch
const MARGIN = 72;                            // 1 in text margin for typed letters
const ADDRESS_CLEARANCE = ADDRESS_CLEARANCE_IN * IN;   // blank top of page 1 for the address zone (top_first_page)
const FONT_SIZE = 11;
const LEADING = 15;
const MAX_SHEETS = 5;                         // PostGrid: max 5 sheets per standard envelope
const FALLBACK_FROM = {
  name: 'Letterhome', street: '1515 Discovery St', city: 'Vancouver',
  province: 'BC', postal: 'V6R 4K5', country: 'CA',
};

class PostGridError extends Error {
  constructor(message, { status, type, manual } = {}) {
    super(message);
    this.name = 'PostGridError';
    this.status = status;
    this.type = type;
    this.manual = !!manual;   // true = order can't be automated; fulfil by hand
  }
}

// Word -> PDF through headless LibreOffice (apt install libreoffice-writer). Returns PDF bytes, or null if unavailable/failed.
function libreOfficeConvert(file, name) {
  return new Promise(resolve => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-conv-'));
    const profile = path.join(out, 'profile');
    const input = path.join(out, 'input' + (path.extname(name || file).toLowerCase() || '.docx'));   // uploads are stored without an extension
    try { fs.copyFileSync(file, input); } catch { try { fs.rmSync(out, { recursive: true, force: true }); } catch {} return resolve(null); }
    const label = path.basename(name || file);
    execFile(process.env.SOFFICE_PATH || 'soffice', [
      `-env:UserInstallation=file://${profile}`, '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', out, input,
    ], { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) console.error(`[convert] soffice failed for ${label}: ${err.code === 'ENOENT' ? 'soffice not found (set SOFFICE_PATH or install libreoffice-writer)' : err.message} ${String(stderr || '').trim().slice(0, 300)}`);
      let buf = null;
      if (!err) {
        try { buf = fs.readFileSync(path.join(out, 'input.pdf')); }
        catch { console.error(`[convert] soffice exited OK but produced no PDF for ${label}: ${String(stdout || '').trim().slice(0, 300)}`); }
      }
      try { fs.rmSync(out, { recursive: true, force: true }); } catch {}
      resolve(buf);
    });
  });
}

function createPostGrid({ db, getSetting, orderDirPath, fetchImpl, convertWord = libreOfficeConvert, destinations }) {
  const doFetch = (...a) => (fetchImpl || fetch)(...a);
  const dest = destinations || makeDestinations(getSetting);

  const apiKey = () => (process.env.POSTGRID_API_KEY || '').trim();
  const isConfigured = () => !!apiKey();
  const mode = () => (!apiKey() ? 'off' : apiKey().startsWith('test_') ? 'test' : 'live');
  const autoSubmit = () => isConfigured() && getSetting('postgrid_auto_submit', 'false') === 'true';
  const countries = () => dest.liveCountries();

  async function api(method, route, { json, form, idempotencyKey } = {}) {
    if (!isConfigured()) throw new PostGridError('PostGrid is not configured (POSTGRID_API_KEY missing).', { manual: true });
    const headers = { 'x-api-key': apiKey() };
    let body;
    if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;                       // fetch sets the multipart boundary itself
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    let res;
    try {
      res = await doFetch(BASE_URL + route, { method, headers, body, signal: AbortSignal.timeout(30000) });
    } catch (e) {
      throw new PostGridError(`PostGrid request failed: ${e.message}`);
    }
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = data?.error || {};
      throw new PostGridError(err.message || `PostGrid HTTP ${res.status}`, { status: res.status, type: err.type });
    }
    return data;
  }

  // ---- PDF -----------------------------------------------------------------
  function toWinAnsi(font, text, warnings) {
    let out = '';
    for (const ch of text.normalize('NFC').replace(/\r\n?/g, '\n')) {
      if (ch === '\n' || ch === '\t') { out += ch === '\t' ? '    ' : ch; continue; }
      try { font.encodeText(ch); out += ch; } catch {
        const map = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', ' ': ' ' };
        if (map[ch]) out += map[ch];
        else { out += '?'; warnings.add('The text has characters outside the Latin alphabet (for example Cyrillic, CJK or emoji) that our printer font cannot print.'); }
      }
    }
    return out;
  }

  function wrapLines(font, text, maxWidth) {
    const fits = t => font.widthOfTextAtSize(t, FONT_SIZE) <= maxWidth;
    const lines = [];
    for (const para of text.split('\n')) {
      if (!para.trim()) { lines.push(''); continue; }
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const t = line ? line + ' ' + word : word;
        if (fits(t)) { line = t; continue; }
        if (line) lines.push(line);
        // a single word longer than the line: hard-split it
        let w = word;
        while (!fits(w)) {
          let n = w.length;
          while (n > 1 && !fits(w.slice(0, n))) n--;
          lines.push(w.slice(0, n)); w = w.slice(n);
        }
        line = w;
      }
      lines.push(line);
    }
    return lines;
  }

  // Builds the single PDF PostGrid will print. Returns { pdf, pages, placement, warnings, unsupported }.
  async function buildLetterPdf(order) {
    const warnings = new Set();
    const unsupported = [];
    const PAGE = pageSizeOf(order.destination_country);   // US Letter, or A4 for the UK and Australia
    // PostGrid safe zone: 0.25 in on every side (non-bleed). US printing also adds a barcode in the bottom-left corner.
    const reserve = destinationOf(order.destination_country)?.bottomLeftReserved;
    const SAFE = { x: MARGIN_IN * IN, y: (reserve ? reserve[1] : MARGIN_IN) * IN };
    SAFE.w = PAGE.w - 2 * SAFE.x; SAFE.h = PAGE.h - SAFE.y - MARGIN_IN * IN;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.TimesRoman);

    let attachments = [];
    try { attachments = JSON.parse(order.attachment_info || '[]'); } catch {}

    // Text = typed body + any .txt attachments
    const textParts = [];
    if ((order.letter_body || '').trim()) textParts.push(order.letter_body);
    const pdfFiles = [];
    for (const a of attachments) {
      const ext = path.extname(a.originalName || a.path || '').toLowerCase();
      if (ext === '.txt') {
        try { textParts.push(fs.readFileSync(a.path, 'utf8')); } catch { unsupported.push(a.originalName); }
      } else if (ext === '.pdf') pdfFiles.push(a);
      else if (ext === '.doc' || ext === '.docx') {
        const converted = await convertWord(a.path, a.originalName);
        if (converted) pdfFiles.push({ ...a, bytes: converted });
        else unsupported.push(a.originalName || path.basename(a.path || 'file'));   // converter missing or failed
      } else unsupported.push(a.originalName || path.basename(a.path || 'file'));
    }

    const hasText = textParts.some(t => t.trim());
    if (hasText) {
      const lines = wrapLines(font, toWinAnsi(font, textParts.join('\n\n'), warnings), PAGE.w - 2 * MARGIN);
      let page = doc.addPage([PAGE.w, PAGE.h]);
      let y = PAGE.h - ADDRESS_CLEARANCE;
      for (const line of lines) {
        if (y < MARGIN) { page = doc.addPage([PAGE.w, PAGE.h]); y = PAGE.h - MARGIN; }
        if (line) page.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
        y -= LEADING;
      }
    }

    for (const a of pdfFiles) {
      let src;
      try { src = await PDFDocument.load(a.bytes || fs.readFileSync(a.path)); }
      catch { unsupported.push(a.originalName || 'PDF'); continue; }
      for (const idx of src.getPageIndices()) {
        const page = doc.addPage([PAGE.w, PAGE.h]);
        let p;
        if (!src.getPage(idx).node.Contents()) continue;   // blank page (no contents): keep it blank
        try { [p] = await doc.embedPdf(src, [idx]); } catch { continue; }
        // Honour the source page's /Rotate so scans keep their orientation, then fit inside the safe zone.
        const rot = ((src.getPage(idx).getRotation().angle % 360) + 360) % 360;
        const sideways = rot === 90 || rot === 270;
        const scale = Math.min(SAFE.w / (sideways ? p.height : p.width), SAFE.h / (sideways ? p.width : p.height));
        const w = p.width * scale, h = p.height * scale;
        const dispW = sideways ? h : w, dispH = sideways ? w : h;
        const left = SAFE.x + (SAFE.w - dispW) / 2, bottom = SAFE.y + (SAFE.h - dispH) / 2;
        const at = { 0: { x: left, y: bottom }, 90: { x: left, y: bottom + dispH },
                     180: { x: left + dispW, y: bottom + dispH }, 270: { x: left + dispW, y: bottom } }[rot] || { x: left, y: bottom };
        page.drawPage(p, { ...at, width: w, height: h, rotate: degrees(-rot) });
      }
    }

    // Address goes on the top of page 1 only when we own page 1 (typed text). Uploaded PDFs get a blank address page.
    const placement = hasText ? 'top_first_page' : 'insert_blank_page';
    const pageCount = doc.getPageCount();
    const sheets = pageCount + (placement === 'insert_blank_page' ? 1 : 0);
    const bytes = Buffer.from(await doc.save({ addDefaultPage: false }));
    return { pdf: bytes, pages: pageCount, sheets, placement, warnings: [...warnings], unsupported };
  }

  // ---- contacts ------------------------------------------------------------
  function splitName(name) {
    const parts = String(name || '').trim().split(/\s+/);
    return parts.length > 1 ? { firstName: parts[0], lastName: parts.slice(1).join(' ') } : { firstName: parts[0] || '', lastName: '' };
  }
  function contact(p) {
    const lines = String(p.street || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const c = {
      ...splitName(p.name),
      addressLine1: lines[0] || '',
      city: p.city || undefined,
      provinceOrState: p.province || undefined,
      postalOrZip: p.postal || undefined,
      countryCode: (p.country || 'CA').toUpperCase(),
    };
    if (lines[1]) c.addressLine2 = lines.slice(1).join(', ');
    if (!c.firstName) { delete c.firstName; c.companyName = 'Resident'; }   // PostGrid needs firstName or companyName
    if (!c.lastName) delete c.lastName;
    return c;
  }
  const recipientOf = o => ({ name: o.recipient_name, street: o.recipient_street, city: o.recipient_city,
    province: o.recipient_province, postal: o.recipient_postal, country: o.destination_country });
  const senderOf = o => (o.skip_return || !o.sender_street)
    ? FALLBACK_FROM
    : { name: o.sender_name || 'Sender', street: o.sender_street, city: o.sender_city,
        province: o.sender_province, postal: o.sender_postal, country: o.sender_country || 'CA' };


  // What the customer sees before paying: the exact print PDF, plus the address block where it will sit in the envelope window.
  async function buildPreviewPdf(order) {
    const built = await buildLetterPdf(order);
    const doc = await PDFDocument.load(built.pdf);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const regionName = code => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()); } catch { return code; } };
    const addr = c => [c.name, ...String(c.street || '').split(/\r?\n/), [c.city, c.province, c.postal].filter(Boolean).join(' '), c.country ? regionName(c.country) : ''].map(s => String(s || '').trim()).filter(Boolean);
    const safe = (f, t) => { try { f.encodeText(t); return t; } catch { return t.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?'); } };
    const PAGE = pageSizeOf(order.destination_country);
    const page = built.placement === 'insert_blank_page' ? doc.insertPage(0, [PAGE.w, PAGE.h]) : doc.getPage(0);
    // Draw lines inside a zone given in inches from the top-left, as PostGrid stamps them (see destinations.js).
    const block = (lines, [zx, zy, zw, zh], { center = false, valign = 'middle' } = {}) => {
      if (!lines.length) return;
      let size = 9; while (size > 6 && lines.length * size * 1.18 > zh * IN - 6) size -= 0.5;
      const lead = size * 1.18, total = lines.length * lead;
      const top = zy * IN + (valign === 'top' ? 6 : valign === 'bottom' ? zh * IN - total - 6 : (zh * IN - total) / 2);
      let y = PAGE.h - top - size;
      for (const raw of lines) {
        const t = safe(font, raw.toUpperCase());
        let s = size; while (s > 5 && font.widthOfTextAtSize(t, s) > zw * IN - 12) s -= 0.5;
        const x = center ? zx * IN + (zw * IN - font.widthOfTextAtSize(t, s)) / 2 : zx * IN + 8;
        page.drawText(t, { x, y, size: s, font, color: rgb(0.1, 0.1, 0.1) });
        y -= lead;
      }
    };
    const d = destinationOf(order.destination_country) || destinationOf('CA');
    const to = addr(recipientOf(order)), from = addr(senderOf(order));
    if (d.layout === 'ca_two_windows') {
      block(from, d.zones.from, { center: true });
      block(to, d.zones.to, { center: true });
    } else if (d.layout === 'us_stacked') {
      const [x, y, w, h] = d.zones.block;
      block(from, [x, y, w, h / 2], { valign: 'top' });
      block(to, [x, y + h / 2, w, h / 2], { valign: 'bottom' });
    } else if (d.layout === 'uk_return_below') {
      const [x, y, w, h] = d.zones.block;
      block(to, [x, y, w, h * 0.55], { valign: 'top' });
      block(['Return to:', ...from], [x, y + h * 0.5, w, h * 0.5], { valign: 'bottom' });
    } else {
      block(to, d.zones.to, { center: true });   // Australia: return address goes on the envelope
    }
    const bytes = Buffer.from(await doc.save({ addDefaultPage: false }));
    return { pdf: bytes, pages: doc.getPageCount(), placement: built.placement, warnings: built.warnings, unsupported: built.unsupported };
  }

  // ---- eligibility ---------------------------------------------------------
  // The one extra mail service an order bought, if any (they are mutually exclusive at checkout).
  const serviceOf = o => o.registered_mail ? 'registered' : o.certified_mail ? 'certified' : o.express_mail ? 'express' : null;

  function eligibility(order) {
    if (!isConfigured()) return 'PostGrid is not configured.';
    if (order.postgrid_letter_id) return 'Already submitted to PostGrid.';
    if (order.status !== 'paid') return `Order status is "${order.status}", not "paid".`;
    if (!countries().includes(String(order.destination_country).toUpperCase()))
      return `Destination ${order.destination_country} is not enabled for PostGrid; fulfil manually.`;
    if (order.large_envelope) return 'Large envelope is not automated; fulfil manually.';
    const svc = serviceOf(order);
    if (svc && !dest.servicesFor(order.destination_country)[svc])
      return `${svc} for ${order.destination_country} is not enabled for PostGrid; fulfil manually.`;
    return null;
  }

  // ---- actions -------------------------------------------------------------
  // Test-mode letters are never mailed, so they must not move the customer's order or trigger customer emails.
  function saveLetter(orderId, letter) {
    const live = !!letter.live;
    db.prepare(`UPDATE orders SET postgrid_letter_id = ?, postgrid_status = ?, postgrid_url = ?, postgrid_error = NULL,
                postgrid_submitted_at = CURRENT_TIMESTAMP, postgrid_mode = ?,
                status = CASE WHEN ? THEN 'submitted_to_printer' ELSE status END,
                printer_ref = CASE WHEN ? THEN ? ELSE printer_ref END WHERE id = ?`)
      .run(letter.id, letter.status || 'ready', letter.url || null, live ? 'live' : 'test', live ? 1 : 0, live ? 1 : 0, `postgrid:${letter.id}`, orderId);
  }

  async function submitOrder(order, { force = false } = {}) {
    const why = eligibility(order);
    if (why) throw new PostGridError(why, { manual: true });
    if (!force && order.scheduled_date && order.scheduled_date > new Date().toISOString().slice(0, 10))
      throw new PostGridError(`Scheduled for ${order.scheduled_date}; will submit on that date.`, { manual: true });

    const built = await buildLetterPdf(order);
    if (built.unsupported.length)
      throw new PostGridError(`Cannot auto-print: ${built.unsupported.join(', ')} (convert to PDF and upload by hand).`, { manual: true });
    if (built.warnings.length)
      throw new PostGridError(`Cannot auto-print: ${built.warnings.join(' ')} Fulfil by hand or ask the customer for a PDF.`, { manual: true });
    if (!built.pages) throw new PostGridError('The order has no printable content.', { manual: true });
    if (built.sheets > MAX_SHEETS)
      throw new PostGridError(`${built.sheets} sheets exceeds the ${MAX_SHEETS}-sheet envelope limit; fulfil manually.`, { manual: true });

    const key = `lh-order-${order.id}`;
    // Idempotency keys only last 24 h; before creating, make sure no letter already exists for this order.
    const search = encodeURIComponent(JSON.stringify({ 'metadata.orderId': String(order.id) }));
    const existing = (await api('GET', `/letters?limit=5&search=${search}`))?.data?.find(l => l.status !== 'cancelled');
    if (existing) {
      saveLetter(order.id, existing);
      return { letter: existing, warnings: built.warnings, sheets: built.sheets, reused: true };
    }
    const to   = await api('POST', '/contacts', { json: contact(recipientOf(order)), idempotencyKey: `${key}-to` });
    if (to.addressStatus === 'failed')
      throw new PostGridError(`Recipient address failed verification: ${to.addressErrors || 'no details'}. Check the address with the customer.`, { manual: true });
    const from = await api('POST', '/contacts', { json: contact(senderOf(order)),    idempotencyKey: `${key}-from` });

    const form = new FormData();
    form.append('to', to.id);
    form.append('from', from.id);
    form.append('addressPlacement', built.placement);
    form.append('color', order.colour_printing ? 'true' : 'false');
    form.append('doubleSided', 'false');
    form.append('size', destinationOf(order.destination_country)?.size || 'us_letter');
    const svc = serviceOf(order);
    if (svc) form.append('mailingClass', dest.servicesFor(order.destination_country)[svc].mailingClass);
    form.append('description', `Letterhome order #${order.id}`);
    form.append('metadata[orderId]', String(order.id));
    form.append('pdf', new Blob([built.pdf], { type: 'application/pdf' }), `order-${order.id}.pdf`);

    const letter = await api('POST', '/letters', { form, idempotencyKey: key });
    saveLetter(order.id, letter);
    return { letter, warnings: built.warnings, sheets: built.sheets, addressStatus: to.addressStatus };
  }

  // Pulls the latest status. Returns { changed, status, mailed }.
  async function refreshOrder(order) {
    if (!order.postgrid_letter_id) throw new PostGridError('Order was not sent through PostGrid.', { manual: true });
    const letter = await api('GET', `/letters/${encodeURIComponent(order.postgrid_letter_id)}`);
    const st = letter.status;
    if (!letter.live) {   // test letter: record PostGrid's status only
      db.prepare('UPDATE orders SET postgrid_status = ?, postgrid_url = COALESCE(?, postgrid_url) WHERE id = ?').run(st, letter.url || null, order.id);
      return { changed: st !== order.postgrid_status, status: st, mailed: false, test: true };
    }
    const map = { ready: 'submitted_to_printer', printing: 'printing', processed_for_delivery: 'mailed', completed: 'mailed' };
    let next = map[st];
    if (st === 'cancelled') next = 'paid';             // back to the manual queue
    const mailedNow = next === 'mailed' && order.status !== 'mailed' && order.status !== 'delivered';
    // never move an order backwards from mailed/delivered
    if (order.status === 'delivered' || (order.status === 'mailed' && next !== 'mailed')) next = order.status;
    db.prepare(`UPDATE orders SET postgrid_status = ?, postgrid_url = COALESCE(?, postgrid_url),
                postgrid_error = ?, status = COALESCE(?, status) WHERE id = ?`)
      .run(st, letter.url || null, st === 'cancelled' ? 'Cancelled at PostGrid; needs manual fulfilment.' : null, next || null, order.id);
    return { changed: st !== order.postgrid_status || next !== order.status, status: st, mailed: mailedNow };
  }

  async function cancelOrder(order) {
    if (!order.postgrid_letter_id) throw new PostGridError('Order was not sent through PostGrid.', { manual: true });
    await api('DELETE', `/letters/${encodeURIComponent(order.postgrid_letter_id)}`);
    db.prepare(`UPDATE orders SET postgrid_status = 'cancelled', status = 'paid', printer_ref = NULL,
                postgrid_error = 'Cancelled by admin; needs manual fulfilment or resubmission.' WHERE id = ?`).run(order.id);
  }

  // Clears a test letter from a real order so it can be sent for real later (live key).
  function clearTestLetter(order) {
    if (order.postgrid_mode !== 'test') throw new PostGridError('Only a test-mode letter can be cleared.', { manual: true });
    db.prepare(`UPDATE orders SET postgrid_letter_id = NULL, postgrid_status = NULL, postgrid_url = NULL, postgrid_error = NULL,
                postgrid_submitted_at = NULL, postgrid_mode = NULL WHERE id = ?`).run(order.id);
  }

  // Test mode only: advance a test letter through the statuses.
  async function progressTestLetter(order) {
    if (order.postgrid_mode !== 'test') throw new PostGridError('Only test-mode letters can be progressed.', { manual: true });
    await api('POST', `/letters/${encodeURIComponent(order.postgrid_letter_id)}/progressions`);
    return refreshOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id));
  }

  return { isConfigured, mode, autoSubmit, countries, serviceOf, eligibility, buildLetterPdf, buildPreviewPdf, submitOrder, refreshOrder, cancelOrder, clearTestLetter, progressTestLetter, PostGridError };
}

module.exports = { createPostGrid, PostGridError, MAX_SHEETS };
