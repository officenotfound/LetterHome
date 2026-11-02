'use strict';
// PostGrid Print & Mail integration: turns a paid order into one mailed letter.
// Everything is off until POSTGRID_API_KEY is set; a key starting "test_" never mails anything.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const BASE_URL = 'https://api.postgrid.com/print-mail/v1';
const LETTER = { w: 612, h: 792 };            // US Letter in points; PostGrid needs consistent Letter pages
const MARGIN = 72;
const ADDRESS_CLEARANCE = 288;                // 4 in blank at top of page 1 for the address window (top_first_page)
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
function libreOfficeConvert(file) {
  return new Promise(resolve => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-conv-'));
    const profile = path.join(out, 'profile');
    execFile(process.env.SOFFICE_PATH || 'soffice', [
      `-env:UserInstallation=file://${profile}`, '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', out, file,
    ], { timeout: 60000 }, err => {
      let buf = null;
      if (!err) {
        try { buf = fs.readFileSync(path.join(out, path.basename(file).replace(/\.[^.]+$/, '') + '.pdf')); } catch {}
      }
      try { fs.rmSync(out, { recursive: true, force: true }); } catch {}
      resolve(buf);
    });
  });
}

function createPostGrid({ db, getSetting, orderDirPath, fetchImpl, convertWord = libreOfficeConvert }) {
  const doFetch = (...a) => (fetchImpl || fetch)(...a);

  const apiKey = () => (process.env.POSTGRID_API_KEY || '').trim();
  const isConfigured = () => !!apiKey();
  const mode = () => (!apiKey() ? 'off' : apiKey().startsWith('test_') ? 'test' : 'live');
  const autoSubmit = () => isConfigured() && getSetting('postgrid_auto_submit', 'false') === 'true';
  const countries = () => (getSetting('postgrid_countries', 'CA') || 'CA')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

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
        else { out += '?'; warnings.add('Some characters could not be printed and were replaced with "?".'); }
      }
    }
    return out;
  }

  function wrapLines(font, text, maxWidth) {
    const lines = [];
    for (const para of text.split('\n')) {
      if (!para.trim()) { lines.push(''); continue; }
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const t = line ? line + ' ' + word : word;
        if (font.widthOfTextAtSize(t, FONT_SIZE) <= LETTER.w - 2 * MARGIN) { line = t; continue; }
        if (line) lines.push(line);
        // a single word longer than the line: hard-split it
        let w = word;
        while (font.widthOfTextAtSize(w, FONT_SIZE) > LETTER.w - 2 * MARGIN) {
          let n = w.length;
          while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), FONT_SIZE) > LETTER.w - 2 * MARGIN) n--;
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
        const converted = await convertWord(a.path);
        if (converted) pdfFiles.push({ ...a, bytes: converted });
        else unsupported.push(a.originalName || path.basename(a.path || 'file'));   // converter missing or failed
      } else unsupported.push(a.originalName || path.basename(a.path || 'file'));
    }

    const hasText = textParts.some(t => t.trim());
    if (hasText) {
      const lines = wrapLines(font, toWinAnsi(font, textParts.join('\n\n'), warnings), LETTER.w - 2 * MARGIN);
      let page = doc.addPage([LETTER.w, LETTER.h]);
      let y = LETTER.h - ADDRESS_CLEARANCE;
      for (const line of lines) {
        if (y < MARGIN) { page = doc.addPage([LETTER.w, LETTER.h]); y = LETTER.h - MARGIN; }
        if (line) page.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
        y -= LEADING;
      }
    }

    for (const a of pdfFiles) {
      let src;
      try { src = await PDFDocument.load(a.bytes || fs.readFileSync(a.path)); }
      catch { unsupported.push(a.originalName || 'PDF'); continue; }
      for (const idx of src.getPageIndices()) {
        const page = doc.addPage([LETTER.w, LETTER.h]);
        let p;
        if (!src.getPage(idx).node.Contents()) continue;   // blank page (no contents): keep it blank
        try { [p] = await doc.embedPdf(src, [idx]); } catch { continue; }
        const scale = Math.min(LETTER.w / p.width, LETTER.h / p.height);
        const w = p.width * scale, h = p.height * scale;
        page.drawPage(p, { x: (LETTER.w - w) / 2, y: (LETTER.h - h) / 2, width: w, height: h });
      }
    }

    // Address goes on the top of page 1 only when we own page 1 (typed text). Uploaded PDFs get a blank address page.
    const placement = hasText ? 'top_first_page' : 'insert_blank_page';
    const pages = doc.getPageCount() + (placement === 'insert_blank_page' ? 1 : 0);
    const bytes = Buffer.from(await doc.save());
    return { pdf: bytes, pages: doc.getPageCount(), sheets: pages, placement, warnings: [...warnings], unsupported };
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
      country: (p.country || 'CA').toUpperCase(),
    };
    if (lines[1]) c.addressLine2 = lines.slice(1).join(', ');
    return c;
  }
  const recipientOf = o => ({ name: o.recipient_name, street: o.recipient_street, city: o.recipient_city,
    province: o.recipient_province, postal: o.recipient_postal, country: o.destination_country });
  const senderOf = o => (o.skip_return || !o.sender_street)
    ? FALLBACK_FROM
    : { name: o.sender_name || 'Sender', street: o.sender_street, city: o.sender_city,
        province: o.sender_province, postal: o.sender_postal, country: o.sender_country || 'CA' };

  // ---- eligibility ---------------------------------------------------------
  function eligibility(order) {
    if (!isConfigured()) return 'PostGrid is not configured.';
    if (order.postgrid_letter_id) return 'Already submitted to PostGrid.';
    if (order.status !== 'paid') return `Order status is "${order.status}", not "paid".`;
    if (!countries().includes(String(order.destination_country).toUpperCase()))
      return `Destination ${order.destination_country} is not enabled for PostGrid; fulfil manually.`;
    if (order.registered_mail) return 'Registered mail is not automated; fulfil manually.';
    if (order.large_envelope) return 'Large envelope is not automated; fulfil manually.';
    return null;
  }

  // ---- actions -------------------------------------------------------------
  async function submitOrder(order, { force = false } = {}) {
    const why = eligibility(order);
    if (why) throw new PostGridError(why, { manual: true });
    if (!force && order.scheduled_date && order.scheduled_date > new Date().toISOString().slice(0, 10))
      throw new PostGridError(`Scheduled for ${order.scheduled_date}; will submit on that date.`, { manual: true });

    const built = await buildLetterPdf(order);
    if (built.unsupported.length)
      throw new PostGridError(`Cannot auto-print: ${built.unsupported.join(', ')} (convert to PDF and upload by hand).`, { manual: true });
    if (!built.pages) throw new PostGridError('The order has no printable content.', { manual: true });
    if (built.sheets > MAX_SHEETS)
      throw new PostGridError(`${built.sheets} sheets exceeds the ${MAX_SHEETS}-sheet envelope limit; fulfil manually.`, { manual: true });

    const key = `lh-order-${order.id}`;
    const to   = await api('POST', '/contacts', { json: contact(recipientOf(order)), idempotencyKey: `${key}-to` });
    const from = await api('POST', '/contacts', { json: contact(senderOf(order)),    idempotencyKey: `${key}-from` });

    const form = new FormData();
    form.append('to', to.id);
    form.append('from', from.id);
    form.append('addressPlacement', built.placement);
    form.append('color', order.colour_printing ? 'true' : 'false');
    form.append('doubleSided', 'false');
    form.append('description', `Letterhome order #${order.id}`);
    form.append('metadata[orderId]', String(order.id));
    form.append('pdf', new Blob([built.pdf], { type: 'application/pdf' }), `order-${order.id}.pdf`);

    const letter = await api('POST', '/letters', { form, idempotencyKey: key });
    db.prepare(`UPDATE orders SET postgrid_letter_id = ?, postgrid_status = ?, postgrid_url = ?, postgrid_error = NULL,
                postgrid_submitted_at = CURRENT_TIMESTAMP, postgrid_mode = ?,
                status = 'submitted_to_printer', printer_ref = ? WHERE id = ?`)
      .run(letter.id, letter.status || 'ready', letter.url || null, letter.live ? 'live' : 'test', `postgrid:${letter.id}`, order.id);
    return { letter, warnings: built.warnings, sheets: built.sheets };
  }

  // Pulls the latest status. Returns { changed, status, mailed }.
  async function refreshOrder(order) {
    if (!order.postgrid_letter_id) throw new PostGridError('Order was not sent through PostGrid.', { manual: true });
    const letter = await api('GET', `/letters/${encodeURIComponent(order.postgrid_letter_id)}`);
    const st = letter.status;
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

  // Test mode only: advance a test letter through the statuses.
  async function progressTestLetter(order) {
    if (order.postgrid_mode !== 'test') throw new PostGridError('Only test-mode letters can be progressed.', { manual: true });
    await api('POST', `/letters/${encodeURIComponent(order.postgrid_letter_id)}/progressions`);
    return refreshOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id));
  }

  return { isConfigured, mode, autoSubmit, countries, eligibility, buildLetterPdf, submitOrder, refreshOrder, cancelOrder, progressTestLetter, PostGridError };
}

module.exports = { createPostGrid, PostGridError };
