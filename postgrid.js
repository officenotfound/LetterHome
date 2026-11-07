'use strict';
// PostGrid Print & Mail integration: turns a paid order into one mailed letter.
// Everything is off until POSTGRID_API_KEY is set; a key starting "test_" never mails anything.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { makeDestinations, destinationOf, pageSizeOf, ADDRESS_CLEARANCE_IN, MARGIN_IN } = require('./destinations');

const BASE_URL = 'https://api.postgrid.com/print-mail/v1';
const IN = 72;                                // points per inch
const MARGIN = 72;                            // 1 in text margin for typed letters
const ADDRESS_CLEARANCE = ADDRESS_CLEARANCE_IN * IN;   // blank top of page 1 for the address zone (top_first_page)
// Letter text: Noto Serif (SIL OFL, assets/fonts/OFL.txt) covers Latin, Greek, Cyrillic and common symbols.
const TEXT_FONT_PATH = path.join(__dirname, 'assets', 'fonts', 'NotoSerif-Regular.ttf');
// Emoji: Twemoji colour images (CC-BY 4.0), fetched once from jsDelivr and cached on disk.
const TWEMOJI_URL = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/';
const EMOJI_CACHE = path.join(__dirname, '.cache', 'emoji');
const FONT_SIZE = 11;
const LEADING = 15;
const FREE_PAGES = 2;                         // pages included in the base price (matches server.js)
const MAX_SHEETS = 5;                         // PostGrid: max 5 sheets per standard envelope
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

// Twemoji file name for an emoji grapheme: lowercase hex code points joined by "-",
// dropping U+FE0F unless the sequence contains a zero-width joiner (Twemoji's own rule).
function twemojiName(g) {
  const cps = [...g].map(c => c.codePointAt(0).toString(16));
  return (g.includes('\u200d') ? cps : cps.filter(c => c !== 'fe0f')).join('-');
}

// Turns whatever a customer typed as a country ("Canada", "canada", "États-Unis", "USA", "UK", "CA")
// into the ISO 3166-1 alpha-2 code PostGrid requires. Returns null when it can't be recognised.
const COUNTRY_ALIASES = {
  usa: 'US', 'u s a': 'US', 'u s': 'US', us: 'US', 'united states of america': 'US', america: 'US',
  uk: 'GB', 'u k': 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  'republic of ireland': 'IE', holland: 'NL', 'the netherlands': 'NL', 'south korea': 'KR', korea: 'KR', 'north korea': 'KP',
  russia: 'RU', 'czech republic': 'CZ', 'ivory coast': 'CI', uae: 'AE', 'hong kong': 'HK', macau: 'MO', macao: 'MO',
  palestine: 'PS', vatican: 'VA', burma: 'MM', turkey: 'TR', turquie: 'TR', turkiye: 'TR',
};
// Two-letter codes Intl knows that are reserved or obsolete, never valid for mail.
const NOT_COUNTRIES = new Set(['UK', 'FX', 'EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ', 'AN', 'BU', 'CS', 'DD', 'DY', 'HV', 'NH', 'RH', 'SU', 'TP', 'YU', 'ZR', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA', 'CQ', 'XK', 'VD', 'NT', 'PC', 'PZ', 'JT', 'MI', 'WK', 'PU', 'YD', 'ZR']);
const normCountry = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ').replace(/[\u2019'.]/g, ' ').replace(/[-_,]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\bsaint\b/g, 'st').replace(/\bthe /g, '');
let COUNTRY_NAMES = null;
function countryCodeOf(input) {
  const key = normCountry(input);
  if (!key) return null;
  if (!COUNTRY_NAMES) {
    COUNTRY_NAMES = new Map();
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const lang of ['en', 'fr', 'es', 'de']) {
      const dn = new Intl.DisplayNames([lang], { type: 'region' });
      for (const a of A) for (const b of A) {
        const code = a + b;
        if (NOT_COUNTRIES.has(code)) continue;
        let name; try { name = dn.of(code); } catch { continue; }
        if (!name || name === code) continue;
        const n = normCountry(name);
        if (!COUNTRY_NAMES.has(code.toLowerCase())) COUNTRY_NAMES.set(code.toLowerCase(), code);
        if (!COUNTRY_NAMES.has(n)) COUNTRY_NAMES.set(n, code);
      }
    }
  }
  return COUNTRY_ALIASES[key] || COUNTRY_NAMES.get(key) || null;
}

// The checkout's province list stores "QC: Quebec"; PostGrid and Canada Post want "QC".
const CA_PROVINCES = {
  alberta: 'AB', 'british columbia': 'BC', 'colombie britannique': 'BC', manitoba: 'MB', 'new brunswick': 'NB', 'nouveau brunswick': 'NB',
  'newfoundland and labrador': 'NL', newfoundland: 'NL', 'terre neuve et labrador': 'NL', 'nova scotia': 'NS', 'nouvelle ecosse': 'NS',
  ontario: 'ON', 'prince edward island': 'PE', 'ile du prince edouard': 'PE', quebec: 'QC', saskatchewan: 'SK',
  'northwest territories': 'NT', 'territoires du nord ouest': 'NT', nunavut: 'NU', yukon: 'YT',
};
function provinceOf(v) {
  const s = String(v || '').trim();
  const m = s.match(/^([A-Za-z]{2,3})\s*:/);
  if (m) return m[1].toUpperCase();
  const key = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-.]/g, ' ').replace(/\s+/g, ' ').trim();
  return CA_PROVINCES[key] || s || undefined;
}

async function fetchTwemoji(name) {
  const file = path.join(EMOJI_CACHE, name + '.png');
  try { return fs.readFileSync(file); } catch {}
  try {
    const res = await fetch(TWEMOJI_URL + name + '.png', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    try { fs.mkdirSync(EMOJI_CACHE, { recursive: true }); fs.writeFileSync(file, buf); } catch {}
    return buf;
  } catch { return null; }
}
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
// LibreOffice is heavy (a few hundred MB each) and the preview endpoints are public, so every conversion goes
// through one limiter: 2 at a time, at most 8 waiting. A request that arrives with the queue full is answered
// with null straight away (the caller treats that as "could not convert") instead of piling up.
let _soffActive = 0;
const _soffQueue = [];
const SOFFICE_PARALLEL = 2, SOFFICE_MAX_WAITING = 8;
function libreOfficeConvert(file, name) {
  return new Promise(resolve => {
    const run = () => {
      _soffActive++;
      libreOfficeConvertNow(file, name).then(resolve, () => resolve(null)).finally(() => {
        _soffActive--;
        const next = _soffQueue.shift();
        if (next) next();
      });
    };
    if (_soffActive < SOFFICE_PARALLEL) return run();
    if (_soffQueue.length >= SOFFICE_MAX_WAITING) { console.error('[convert] queue full, refusing conversion'); return resolve(null); }
    _soffQueue.push(run);
  });
}

function libreOfficeConvertNow(file, name) {
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

function createPostGrid({ db, getSetting, orderDirPath, fetchImpl, convertWord = libreOfficeConvert, destinations, emojiImage = fetchTwemoji, rateLimitWaitMs = 20000 }) {
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
    // PostGrid rate-limits bursts (HTTP 429, "try again in a minute"): wait and retry, up to 3 times.
    for (let attempt = 0; ; attempt++) {
      try {
        res = await doFetch(BASE_URL + route, { method, headers, body, signal: AbortSignal.timeout(30000) });
      } catch (e) {
        throw new PostGridError(`PostGrid request failed: ${e.message}`);
      }
      if (res.status !== 429 || attempt >= 3) break;
      await new Promise(r => setTimeout(r, rateLimitWaitMs * (attempt + 1)));
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
  // Splits text into words made of runs: { text } for the font, { emoji } for an image.
  // Characters the font cannot draw (e.g. CJK, Arabic) are reported so the order goes to the manual queue.
  function tokenize(text, charset, warnings) {
    const paras = [];
    for (const para of text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
      const words = [];
      let word = [], run = '';
      const flushRun = () => { if (run) { word.push({ text: run }); run = ''; } };
      const flushWord = () => { flushRun(); if (word.length) words.push(word); word = []; };
      for (const { segment: g } of segmenter.segment(para)) {
        if (/^\s+$/u.test(g)) { flushWord(); continue; }
        if (EMOJI_RE.test(g)) { flushRun(); word.push({ emoji: twemojiName(g) }); continue; }
        let ok = '';
        for (const ch of g) {
          const cp = ch.codePointAt(0);
          if (cp === 0xFE0F || cp === 0xFE0E || cp === 0x200D) continue;     // stray variation selectors / joiners
          if (charset.has(cp)) ok += ch;
          else { ok += '?'; warnings.add('The text has characters our printer font cannot print (for example Chinese, Japanese, Korean, Arabic or Hebrew).'); }
        }
        run += ok;
      }
      flushWord();
      paras.push(words);
    }
    return paras;
  }

  // Lays out tokenized paragraphs into lines no wider than maxWidth.
  function layoutLines(paras, font, maxWidth) {
    const EM = FONT_SIZE * 1.2;
    const runW = r => r.emoji ? EM : font.widthOfTextAtSize(r.text, FONT_SIZE);
    const wordW = w => w.reduce((s, r) => s + runW(r), 0);
    const space = font.widthOfTextAtSize(' ', FONT_SIZE);
    const lines = [];
    for (const words of paras) {
      if (!words.length) { lines.push([]); continue; }
      let line = [], width = 0;
      for (let w of words) {
        const ww = wordW(w);
        if (line.length && width + space + ww <= maxWidth) { line.push(w); width += space + ww; continue; }
        if (line.length) lines.push(line);
        line = []; width = 0;
        if (ww <= maxWidth) { line = [w]; width = ww; continue; }
        // a single word wider than the line: break it between characters
        let piece = [], pw = 0;
        for (const r of w) {
          const parts = r.emoji ? [r] : [...r.text].map(c => ({ text: c }));
          for (const part of parts) {
            const cw = runW(part);
            if (pw + cw > maxWidth && piece.length) { lines.push([piece]); piece = []; pw = 0; }
            piece.push(part); pw += cw;
          }
        }
        line = [piece]; width = pw;
      }
      lines.push(line);
    }
    return lines;
  }

  // Builds the single PDF PostGrid will print. Returns { pdf, pages, placement, warnings, unsupported }.
  async function buildLetterPdf(order, { noReturnBlock = false } = {}) {
    const warnings = new Set();
    const notices = [];
    const unsupported = [];
    const PAGE = pageSizeOf(order.destination_country);   // US Letter, or A4 for the UK and Australia
    // PostGrid safe zone: 0.25 in on every side (non-bleed). US printing also adds a barcode in the bottom-left corner.
    const reserve = destinationOf(order.destination_country)?.bottomLeftReserved;
    const SAFE = { x: MARGIN_IN * IN, y: (reserve ? reserve[1] : MARGIN_IN) * IN };
    SAFE.w = PAGE.w - 2 * SAFE.x; SAFE.h = PAGE.h - SAFE.y - MARGIN_IN * IN;
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fs.readFileSync(TEXT_FONT_PATH), { subset: true });

    let attachments = [];
    try { attachments = JSON.parse(order.attachment_info || '[]'); } catch {}

    // Text = typed body + any .txt attachments
    const textParts = [];
    // Optional (set by the admin): the customer's return address printed at the top of the letter itself.
    const wantBlock = !!order.return_in_body && !!order.sender_street && !noReturnBlock;
    const returnBlock = wantBlock
      ? [order.sender_name, ...String(order.sender_street).split(/\r?\n/), [order.sender_city, provinceOf(order.sender_province), order.sender_postal].filter(Boolean).join(' '), order.sender_country]
          .map(x => String(x || '').trim()).filter(Boolean).join('\n')
      : '';
    if ((order.letter_body || '').trim()) textParts.push(returnBlock ? `${returnBlock}\n\n${order.letter_body}` : order.letter_body);
    else if (returnBlock && textParts.length === 0) textParts.push(returnBlock);
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
      const charset = new Set(font.getCharacterSet());
      const paras = tokenize(textParts.join('\n\n'), charset, warnings);
      // Fetch each distinct emoji image once; an emoji we cannot get sends the order to the manual queue.
      const images = new Map();
      for (const name of new Set(paras.flat(2).filter(r => r.emoji).map(r => r.emoji))) {
        const png = await emojiImage(name);
        if (png) { try { images.set(name, await doc.embedPng(png)); continue; } catch {} }
        warnings.add(`An emoji in the letter could not be loaded for printing (${name}).`);
      }
      const lines = layoutLines(paras, font, PAGE.w - 2 * MARGIN);
      const EM = FONT_SIZE * 1.2, space = font.widthOfTextAtSize(' ', FONT_SIZE);
      let page = doc.addPage([PAGE.w, PAGE.h]);
      let y = PAGE.h - ADDRESS_CLEARANCE;
      for (const line of lines) {
        if (y < MARGIN) { page = doc.addPage([PAGE.w, PAGE.h]); y = PAGE.h - MARGIN; }
        let x = MARGIN;
        line.forEach((word, wi) => {
          if (wi) x += space;
          for (const r of word) {
            if (r.emoji) {
              const img = images.get(r.emoji);
              if (img) page.drawImage(img, { x, y: y - FONT_SIZE * 0.22, width: EM, height: EM });
              x += EM;
            } else {
              page.drawText(r.text, { x, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
              x += font.widthOfTextAtSize(r.text, FONT_SIZE);
            }
          }
        });
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
    const result = { pdf: bytes, pages: pageCount, sheets, placement, warnings: [...warnings], unsupported, notices };
    if (wantBlock && !unsupported.length) {
      // Never print more pages than the customer paid for (two are included in the base price).
      const plain = await buildLetterPdf(order, { noReturnBlock: true });
      const paid = Math.max(Number(order.page_count) || 0, FREE_PAGES);
      if (result.pages > plain.pages && result.pages > paid) {
        plain.notices = [...(plain.notices || []), `The customer's return address was not added to the letter: it would go over the ${paid} page${paid === 1 ? '' : 's'} paid for.`];
        return plain;
      }
      result.notices.push("The customer's return address was printed at the top of the letter.");
    }
    return result;
  }

  // ---- contacts ------------------------------------------------------------
  function splitName(name) {
    const parts = String(name || '').trim().split(/\s+/);
    return parts.length > 1 ? { firstName: parts[0], lastName: parts.slice(1).join(' ') } : { firstName: parts[0] || '', lastName: '' };
  }
  function contact(p) {
    const lines = String(p.street || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    // A unit written on its own first line ('Ap. 402' above the street) is not a street: PostGrid wants it on line 2.
    if (lines.length > 1 && /^(ap\.?|apt\.?|apto\.?|apartamento|apartment|unit|suite|ste\.?|piso|oficina|of\.?|#)\s*[\w-]+$/i.test(lines[0])) lines.push(lines.shift());
    const c = {
      ...splitName(p.name),
      addressLine1: lines[0] || '',
      city: p.city || undefined,
      provinceOrState: provinceOf(p.province),
      postalOrZip: p.postal || undefined,
      countryCode: countryCodeOf(p.country || 'CA'),
    };
    if (lines[1]) c.addressLine2 = lines.slice(1).join(', ');
    if (!c.countryCode) throw new PostGridError(`Country "${p.country}" in the ${p.role || 'address'} was not recognised; fix the address and resend.`, { manual: true });
    if (!c.firstName) { delete c.firstName; c.companyName = 'Resident'; }   // PostGrid needs firstName or companyName
    if (!c.lastName) delete c.lastName;
    return c;
  }
  const recipientOf = o => ({ role: 'recipient address', name: o.recipient_name, street: o.recipient_street, city: o.recipient_city,
    province: o.recipient_province, postal: o.recipient_postal, country: o.destination_country });
  const senderOf = o => (o.skip_return || !o.sender_street)
    ? FALLBACK_FROM
    : { role: 'return address', name: o.sender_name || 'Sender', street: o.sender_street, city: o.sender_city,
        province: o.sender_province, postal: o.sender_postal, country: o.sender_country || 'CA' };


  // What the customer sees before paying: the exact print PDF, plus the address block where it will sit in the envelope window.
  async function buildPreviewPdf(order) {
    const built = await buildLetterPdf(order);
    const doc = await PDFDocument.load(built.pdf);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const regionName = code => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()); } catch { return code; } };
    const dc = String(order.destination_country || 'CA').toUpperCase();
    const addr = c => [c.name, ...String(c.street || '').split(/\r?\n/), [[c.city, provinceOf(c.province)].filter(Boolean).join(', '), c.postal].filter(Boolean).join(' '),
      c.country && countryCodeOf(c.country) !== dc ? regionName(countryCodeOf(c.country) || c.country) : ''].map(s => String(s || '').trim()).filter(Boolean);
    const safe = (f, t) => { try { f.encodeText(t); return t; } catch { return t.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?'); } };
    const PAGE = pageSizeOf(order.destination_country);
    const page = built.placement === 'insert_blank_page' ? doc.insertPage(0, [PAGE.w, PAGE.h]) : doc.getPage(0);
    // Draw lines inside a zone given in inches from the top-left, as PostGrid stamps them (see destinations.js).
    const block = (lines, [zx, zy, zw, zh], { center = false, valign = 'middle' } = {}) => {
      if (!lines.length) return;
      let size = 7.5; while (size > 6 && lines.length * size * 1.25 > zh * IN - 6) size -= 0.5;
      const lead = size * 1.25, total = lines.length * lead;
      const top = zy * IN + (valign === 'top' ? 6 : valign === 'bottom' ? zh * IN - total - 6 : (zh * IN - total) / 2);
      let y = PAGE.h - top - size;
      const texts = lines.map(raw => safe(font, raw.toUpperCase()));
      const sizes = texts.map(t => { let s = size; while (s > 5 && font.widthOfTextAtSize(t, s) > zw * IN - 12) s -= 0.5; return s; });
      const blockW = Math.max(...texts.map((t, i) => font.widthOfTextAtSize(t, sizes[i])));
      const x = center ? zx * IN + (zw * IN - blockW) / 2 : zx * IN + 8;   // block centred, lines left-aligned
      texts.forEach((t, i) => { page.drawText(t, { x, y, size: sizes[i], font, color: rgb(0.1, 0.1, 0.1) }); y -= lead; });
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
    // The customer's own return address must never stop a letter that is otherwise good: if PostGrid cannot take it
    // (a country it will not mail from, an address it rejects), fall back to the Letterhome return address and say so.
    const warnings = [...built.warnings, ...(built.notices || [])];
    let from, usedFallback = false;
    const useFallback = async why => {
      usedFallback = true;
      warnings.push(`The return address could not be used (${String(why).slice(0, 160)}); the Letterhome return address was printed instead.`);
      from = await api('POST', '/contacts', { json: contact(FALLBACK_FROM), idempotencyKey: `${key}-from-lh` });
    };
    const customerReturn = senderOf(order) !== FALLBACK_FROM;
    try {
      from = await api('POST', '/contacts', { json: contact(senderOf(order)), idempotencyKey: `${key}-from` });
      if (customerReturn && from.addressStatus === 'failed') await useFallback(`address check failed: ${from.addressErrors || 'no details'}`);
    } catch (e) {
      if (!customerReturn) throw e;
      await useFallback(e.message);
    }

    const buildForm = () => {
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
      return form;
    };

    let letter;
    try {
      letter = await api('POST', '/letters', { form: buildForm(), idempotencyKey: key });
    } catch (e) {
      // PostGrid sometimes only objects to the return address when the letter is created.
      if (usedFallback || !customerReturn || !(e instanceof PostGridError) || !(e.status >= 400 && e.status < 500) || e.status === 429) throw e;
      if (!/from|return|sender/i.test(e.message)) throw e;
      await useFallback(e.message);
      letter = await api('POST', '/letters', { form: buildForm(), idempotencyKey: `${key}-lh` });
    }
    saveLetter(order.id, letter);
    return { letter, warnings, sheets: built.sheets, addressStatus: to.addressStatus, usedFallbackReturn: usedFallback };
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
                postgrid_tracking_number = COALESCE(?, postgrid_tracking_number),
                postgrid_error = ?, status = COALESCE(?, status) WHERE id = ?`)
      .run(st, letter.url || null, letter.trackingNumber || null, st === 'cancelled' ? 'Cancelled at PostGrid; needs manual fulfilment.' : null, next || null, order.id);
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

module.exports = { createPostGrid, PostGridError, MAX_SHEETS, countryCodeOf };
