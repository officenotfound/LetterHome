'use strict';
// Local content scanner. Keyword and pattern rules only: nothing is sent to any other service.
// It stores category names and counts, never the matched text. A match never rejects an order by itself:
// it holds the order for the owner to review in the admin before anything goes to the printer.
const fs = require('fs');
const zlib = require('zlib');

const CATEGORIES = [
  { id: 'threats', label: 'Threats of violence', rules: [
    /\b(i|we)\s*(will|ll|am going to|m going to|m gonna|am gonna|are going to)\s+(kill|murder|shoot|stab|strangle|rape|torture|burn down)\s+(you|him|her|them|your|his|everyone|everybody|my (ex|boss|neighbou?r|wife|husband))\b/,
    /\b(kill|murder|shoot|stab)\s+(you|your (wife|husband|kids?|children|family|dog))\b/,
    /\byou\s+(will|are going to|re going to|re gonna)\s+(die|regret|pay for this)\b/,
    /\bwatch your back\b/, /\bi know where you (live|work|sleep)\b/, /\bsleep with one eye open\b/,
  ]},
  { id: 'self_harm', label: 'Self-harm (check on the sender)', rules: [
    /\bsuicide note\b/, /\b(going to|plan to|want to|about to)\s+(kill myself|end my life|take my own life)\b/,
    /\bkill\s*yourself\b|\bkys\b|\bgo (and )?die\b/,
  ]},
  { id: 'extortion', label: 'Extortion or blackmail', rules: [
    /\bpay\s+(me|us)\b.{0,80}\bor\s+(i|we)\s*(will|ll)?\s*(leak|release|expose|publish|tell|send|post)\b/,
    /\b(send|pay|transfer)\b.{0,40}\b(bitcoin|btc|crypto|gift ?cards?)\b.{0,80}\bor\s+(else|i|we)\b/,
    /\b(i|we) (have|ve got|ll release)\b.{0,40}\b(your (photos|pictures|videos|nudes|password)|compromising)\b/,
    /\bblackmail\b/,
  ]},
  { id: 'weapons', label: 'Weapons, explosives or poisons', rules: [
    /\bhow to (make|build|assemble|construct)\s+(a |an )?(bomb|pipe bomb|explosive|silencer|ghost gun|molotov)\b/,
    /\b(ricin|sarin|anthrax|nerve agent|c-?4 explosive|detonator)\b/,
    /\b(buy|sell|selling|for sale)\b.{0,30}\b(firearms?|machine ?guns?|ar-?15|ammo|ammunition)\b/,
  ]},
  { id: 'drugs', label: 'Selling or trafficking drugs', rules: [
    /\b(fentanyl|cocaine|heroin|meth(amphetamine)?|mdma|oxycodone|oxy)\b.{0,60}\b(for sale|per gram|price|order now|discreet shipping|buy)\b/,
    /\b(for sale|buy|order)\b.{0,40}\b(fentanyl|cocaine|heroin|methamphetamine|mdma|oxycodone)\b/,
  ]},
  { id: 'child_safety', label: 'Child safety', rules: [
    /\bchild (porn|pornography|abuse material)\b/, /\bcsam\b/, /\b(underage|minor)s?\b.{0,30}\b(sex|nude|naked|explicit)\b/,
  ]},
  { id: 'harassment', label: 'Harassment or abuse', rules: [
    /\b(you are|you re|ur)\s+(a\s+)?(worthless|disgusting|pathetic)\s+(piece of|waste|loser|slut|whore|bitch|bastard|cunt)\b/,
    /\bhope you (die|get cancer|rot)\b/, /\bi will (ruin|destroy) your life\b/, /\b(following|stalking|watching) you\b/,
  ]},
  { id: 'scam', label: 'Scam or fraud', rules: [
    /\b(nigerian|foreign) (prince|barrister)\b/, /\binheritance\b.{0,80}\b(transfer|wire|processing fee|bank details)\b/,
    /\byour (account|card|bank account) (has been|was|is)\s+(suspended|compromised|locked|frozen)\b/,
    /\b(send|mail|scratch)\b.{0,30}\bgift ?card (codes?|numbers?|pins?)\b/,
    /\bcongratulations\b.{0,60}\b(you have won|you ve won|lottery|prize)\b.{0,80}\b(fee|tax|claim|send)\b/,
    /\b(verify|confirm|provide)\b.{0,40}\b(social insurance|social security|sin|ssn|bank login|pin)\b/,
  ]},
];

function normalize(text) {
  return String(text || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`']/g, '')           // we'll -> well is avoided by rules using optional apostrophe-less forms
    .replace(/[^a-z0-9$%@.\- ]+/g, ' ')
    .replace(/\s+/g, ' ');
}

// Owner-defined extra words, comma or newline separated. Plain words only; matched as whole words/phrases.
function extraRules(raw) {
  return String(raw || '').split(/[\n,]+/).map(s => normalize(s).trim()).filter(s => s.length >= 3)
    .map(s => new RegExp('\\b' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'));
}

function scanText(text, extraTerms) {
  const t = normalize(text);
  const hits = [];
  for (const c of CATEGORIES) {
    let n = 0;
    for (const r of c.rules) { const m = t.match(new RegExp(r.source, 'g')); if (m) n += m.length; }
    if (n) hits.push({ id: c.id, label: c.label, count: n });
  }
  let nx = 0;
  for (const r of extraRules(extraTerms)) { const m = t.match(new RegExp(r.source, 'g')); if (m) nx += m.length; }
  if (nx) hits.push({ id: 'custom', label: 'Your own watch words', count: nx });
  return hits;
}

// ---- text extraction (best effort, all local) ----
function inflateSafe(buf) { try { return zlib.inflateSync(buf, { maxOutputLength: 20 * 1024 * 1024 }); } catch { return null; } }

function docxText(buf) {
  // Walk the zip central directory for word/document.xml (and headers/footers/footnotes).
  const out = [];
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  let p = buf.readUInt32LE(eocd + 16);
  const n = Math.min(buf.readUInt16LE(eocd + 10), 5000);
  // A crafted zip can list the same bomb thousands of times; cap how much we will inflate in total.
  let budget = 40 * 1024 * 1024, parts = 0;
  for (let k = 0; k < n && parts < 24 && budget > 0 && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; k++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    p += 46 + nl + el + cl;
    if (!/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name)) continue;
    const lnl = buf.readUInt16LE(off + 26), lel = buf.readUInt16LE(off + 28), ds = off + 30 + lnl + lel;
    const raw = buf.subarray(ds, ds + csize);
    parts++;
    const data = method === 0 ? raw : method === 8 ? (() => { try { return zlib.inflateRawSync(raw, { maxOutputLength: Math.min(20 * 1024 * 1024, budget) }); } catch { return null; } })() : null;
    if (data) budget -= data.length;
    if (data) out.push(data.toString('utf8').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  }
  return out.join('\n');
}

// Linear-time scan for the (literal) and <hex> strings inside a content stream. Strings inside a [ ... ] array
// (the TJ operator) are joined without a gap so kerned words stay whole. Regex was used here before and a crafted
// stream made it run for minutes, so this walks the text once and gives up on a stream with an unclosed string.
function pdfStrings(str) {
  const lim = Math.min(str.length, 4 * 1024 * 1024);
  let out = '', inArr = false;
  for (let i = 0; i < lim; i++) {
    const c = str.charCodeAt(i);
    if (c === 0x5B) { inArr = true; continue; }                       // [
    if (c === 0x5D) { if (inArr) out += ' '; inArr = false; continue; } // ]
    if (c === 0x28) {                                                  // ( literal string
      let depth = 1, j = i + 1, buf = '';
      for (; j < lim && depth > 0; j++) {
        const d = str[j];
        if (d === '\\') {
          const n = str[++j];
          if (n === undefined) break;
          if (n >= '0' && n <= '7') { let o = n; while (o.length < 3 && str[j + 1] >= '0' && str[j + 1] <= '7') o += str[++j]; buf += String.fromCharCode(parseInt(o, 8) & 255); }
          else buf += ({ n: '\n', r: '', t: ' ', b: '', f: '' }[n] ?? n);
        } else if (d === '(') { depth++; buf += d; }
        else if (d === ')') { if (--depth > 0) buf += d; }
        else buf += d;
      }
      if (depth > 0) return out;   // unclosed: stop reading this stream
      out += buf; if (!inArr) out += ' ';
      i = j - 1; continue;
    }
    if (c === 0x3C && str.charCodeAt(i + 1) !== 0x3C) {                // <hex>, but not a << dictionary
      let j = i + 1, h = '';
      while (j < lim && /[0-9A-Fa-f\s]/.test(str[j])) { if (str[j] > ' ') h += str[j]; j++; }
      if (str[j] === '>') { for (let k = 0; k + 1 < h.length; k += 2) out += String.fromCharCode(parseInt(h.slice(k, k + 2), 16)); if (!inArr) out += ' '; i = j; }
    }
  }
  return out;
}

function pdfText(buf) {
  // Pulls literal text from content streams. Works on simple PDFs; scanned or font-encoded PDFs return little or nothing.
  const s = buf.toString('latin1');
  let out = '', pos = 0, streams = 0, budget = 40 * 1024 * 1024;
  while (streams++ < 3000 && budget > 0) {
    const a = s.indexOf('stream', pos); if (a < 0) break;
    let start = a + 6; if (s[start] === '\r') start++; if (s[start] === '\n') start++;
    const b = s.indexOf('endstream', start); if (b < 0) break;
    pos = b + 9;
    const chunk = buf.subarray(start, b);
    const data = inflateSafe(chunk) || chunk;
    budget -= data.length;
    const str = data.toString('latin1');
    if (!/\b(Tj|TJ)\b/.test(str)) continue;
    out += pdfStrings(str);
    out += '\n';
  }
  return out;
}

function fileText(filePath, originalName) {
  const ext = String(originalName || filePath).toLowerCase().split('.').pop();
  let buf; try { buf = fs.readFileSync(filePath); } catch { return null; }
  if (buf.length > 12 * 1024 * 1024) return null;
  try {
    if (ext === 'txt') return buf.toString('utf8');
    if (ext === 'docx') return docxText(buf);
    if (ext === 'pdf') return pdfText(buf);
    if (ext === 'doc') { // legacy Word: pull readable runs, best effort
      return buf.toString('latin1').replace(/[^\x20-\x7e\n]+/g, ' ') + ' ' + buf.toString('utf16le').replace(/[^\x20-\x7e\n]+/g, ' ');
    }
  } catch { /* fall through */ }
  return null;
}

// body: typed letter text. files: [{path, originalName}]. Returns { hits, notScanned, held }.
function scanOrder({ body, files, extraTerms }) {
  const notScanned = [];
  const parts = [body || ''];
  for (const f of files || []) {
    const t = fileText(f.path, f.originalName);
    // A file counts as readable only if it yielded real words; scanned images and font-encoded PDFs do not.
    if (t && (t.match(/[a-z]{3,}/gi) || []).length >= 5) parts.push(t); else notScanned.push(f.originalName);
  }
  const hits = scanText(parts.join('\n'), extraTerms);
  return { hits, notScanned, held: hits.length > 0 };
}

module.exports = { scanOrder, scanText, CATEGORIES };
