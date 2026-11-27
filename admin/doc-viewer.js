// Reads documents inside the admin (web, Mac and Android apps) instead of downloading them: PDFs, text, pictures
// and Word .docx. Nothing in a document is run: PDFs are drawn to canvas, text and Word files are put on the page as text.
(() => {
  'use strict';
  const LINKS = /^\/api\/admin\/(orders\/\d+\/(files\/[^/]+|postgrid\/preview)|mail\/[^/]+\/attachment|applicants\/\d+\/resume|faxes\/\d+\/file)$/;
  const TEXT_EXT = ['txt', 'csv', 'tsv', 'md', 'json', 'log', 'eml', 'ics', 'vcf', 'xml', 'html', 'htm', 'rtf'];
  const MAX_TEXT = 2 * 1024 * 1024, MAX_DOCX = 8 * 1024 * 1024;

  const style = document.createElement('style');
  style.textContent = `
  #doc-view{position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;background:#e9ecf1;color:#14202e;font-family:'Noto Sans',system-ui,sans-serif}
  .dv-bar{display:flex;align-items:center;gap:8px;padding:10px 14px;padding-top:max(10px,env(safe-area-inset-top));background:#17293d;color:#fff;flex:none}
  html.mac-app .dv-bar{padding-top:34px}
  .dv-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;font-size:14px}
  .dv-bar button,.dv-bar a{height:36px;min-width:36px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.25);border-radius:8px;background:transparent;color:#fff;font:500 13px 'Noto Sans',system-ui,sans-serif;cursor:pointer;text-decoration:none;flex:none}
  .dv-bar button:hover,.dv-bar a:hover{background:rgba(255,255,255,.1)}
  .dv-body{flex:1;scrollbar-gutter:stable;overflow:auto;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom));overscroll-behavior:contain}
  .dv-page{display:block;margin:0 auto 14px;background:#fff;box-shadow:0 1px 6px rgba(20,32,46,.18)}
  .dv-sheet{max-width:760px;margin:0 auto;background:#fff;color:#14202e;border-radius:6px;box-shadow:0 1px 6px rgba(20,32,46,.18);padding:28px 32px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;font-family:inherit}
  .dv-img{display:block;margin:0 auto;background:#fff;box-shadow:0 1px 6px rgba(20,32,46,.18)}
  .dv-note{max-width:760px;margin:0 auto 12px;font-size:12.5px;color:#586779;text-align:center;line-height:1.5}
  html[data-theme="dark"] #doc-view{background:#10151c}
  html[data-theme="dark"] .dv-note{color:#9aa7b8}
  .doc-inline{max-height:540px;scrollbar-gutter:stable;overflow:auto;background:#e9ecf1;padding:12px}
  .doc-inline .dv-page{margin-bottom:12px}
  @media(max-width:600px){.dv-bar{gap:6px;padding-left:10px;padding-right:10px}.dv-body{padding:10px}.dv-sheet{padding:18px 16px}.dv-zoom{display:none!important}.dv-zoom.dv-in,.dv-zoom.dv-out{display:inline-flex!important}}
  `;
  document.head.appendChild(style);

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const extOf = name => (String(name || '').match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';

  let pdfjs = null;
  async function loadPdfjs() {
    if (!pdfjs) {
      pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    }
    return pdfjs;
  }

  async function get(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (r.status === 401) { location.href = '/admin/login'; throw new Error('Please sign in again.'); }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `The server answered with error ${r.status}.`);
    }
    const named = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
    const missing = decodeURIComponent(r.headers.get('X-Letter-Unsupported') || '');
    return { bytes: new Uint8Array(await r.arrayBuffer()), name: named ? named[1] : '', missing };
  }

  function kindOf(b, name) {
    const head = (...v) => v.every((x, i) => b[i] === x);
    const ext = extOf(name);
    if (head(0x25, 0x50, 0x44, 0x46)) return 'pdf';
    if (head(0x89, 0x50, 0x4e, 0x47) || head(0xff, 0xd8, 0xff) || head(0x47, 0x49, 0x46) || head(0x42, 0x4d) && ext === 'bmp' || ext === 'webp' || ext === 'heic') return 'image';
    if (head(0x50, 0x4b, 0x03, 0x04)) return ext === 'docx' ? 'docx' : 'other';
    if (head(0xd0, 0xcf, 0x11, 0xe0)) return 'other';                       // old Word and Excel files
    if (head(0xff, 0xfe) || head(0xfe, 0xff)) return 'text';                 // UTF-16
    if (TEXT_EXT.includes(ext)) return 'text';
    return b.length && !b.subarray(0, 4000).includes(0) ? 'text' : 'other';
  }

  function decodeText(b) {
    if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
    if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
    catch { return new TextDecoder('windows-1252').decode(b); }               // older Windows files
  }

  // A .docx is a zip; the words are in word/document.xml.
  async function docxText(b) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let end = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('This Word file could not be read.');
    let at = v.getUint32(end + 16, true);
    for (let n = v.getUint16(end + 10, true); n > 0 && at + 46 <= b.length; n--) {
      const method = v.getUint16(at + 10, true), size = v.getUint32(at + 20, true), nameLen = v.getUint16(at + 28, true);
      const local = v.getUint32(at + 42, true);
      const name = new TextDecoder().decode(b.subarray(at + 46, at + 46 + nameLen));
      if (name === 'word/document.xml') {
        const from = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
        const packed = b.subarray(from, from + size);
        let xml = packed;
        if (method === 8) {
          const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
          const parts = []; let total = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if ((total += value.length) > MAX_DOCX) throw new Error('This Word file is too large to show here.');
            parts.push(value);
          }
          xml = new Uint8Array(await new Blob(parts).arrayBuffer());
        }
        const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), 'application/xml');
        return [...doc.getElementsByTagName('w:p')].map(p => [...p.getElementsByTagName('*')]
          .map(x => x.nodeName === 'w:t' ? x.textContent : x.nodeName === 'w:tab' ? (x.parentNode.nodeName === 'w:r' ? '\t' : '') : x.nodeName === 'w:br' ? '\n' : '').join('')).join('\n');
      }
      at += 46 + nameLen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
    }
    throw new Error('This Word file could not be read.');
  }

  // Draws each page when it comes near the screen, so a long PDF doesn't use up a phone's memory.
  async function drawPdf(box, scroller, bytes, zoom) {
    const lib = await loadPdfjs();
    const task = lib.getDocument({ data: bytes.slice() });
    const pdf = await task.promise;
    const first = await pdf.getPage(1);
    const base = first.getViewport({ scale: 1 });
    const room = Math.max(200, scroller.clientWidth - 24);
    const width = Math.min(room, 860) * zoom;
    const seen = new IntersectionObserver(entries => entries.forEach(async e => {
      if (!e.isIntersecting) return;
      const canvas = e.target; seen.unobserve(canvas);
      try {
        const page = await pdf.getPage(Number(canvas.dataset.page));
        const natural = page.getViewport({ scale: 1 });
        const sharp = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.min((width / natural.width) * sharp, 4000 / natural.width);
        const view = page.getViewport({ scale });
        canvas.width = view.width; canvas.height = view.height;
        canvas.style.height = width * natural.height / natural.width + 'px';
        await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport: view }).promise;
      } catch (err) { console.error('[doc-viewer] page', err); }
    }), { root: scroller, rootMargin: '600px' });
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const c = el('canvas', 'dv-page');
      c.dataset.page = i;
      c.style.width = width + 'px'; c.style.height = width * base.height / base.width + 'px';
      c.setAttribute('aria-label', `Page ${i} of ${pdf.numPages}`);
      pages.push(c);
    }
    box.replaceChildren(...pages);
    pages.forEach(c => seen.observe(c));
    return () => { seen.disconnect(); task.destroy(); };
  }

  async function drawImage(box, scroller, bytes, zoom) {
    const picture = await createImageBitmap(new Blob([bytes]));
    const c = el('canvas', 'dv-img');
    c.width = picture.width; c.height = picture.height;
    c.getContext('2d').drawImage(picture, 0, 0);
    c.style.width = Math.min(picture.width, scroller.clientWidth - 24) * zoom + 'px';
    box.replaceChildren(c);
    picture.close();
  }

  const leftOut = names => el('div', 'dv-note', `Not in this preview, because it could not be converted: ${names}`);

  let open = null;

  function close() {
    if (!open) return;
    const o = open; open = null;
    o.stop?.();
    o.root.remove();
    document.body.style.overflow = o.overflow;
    o.opener?.focus?.({ preventScroll: true });
  }
  const dismiss = () => { if (history.state?.docView) history.back(); else close(); };

  async function show(url, name) {
    close();
    const root = el('div'); root.id = 'doc-view';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    const bar = el('div', 'dv-bar'), body = el('div', 'dv-body'), title = el('div', 'dv-name', name || 'Document');
    const button = (label, cls, aria, onClick) => { const b = el('button', cls, label); b.type = 'button'; b.setAttribute('aria-label', aria); b.onclick = onClick; return b; };
    const zoomOut = button('−', 'dv-zoom dv-out', 'Smaller', () => paint(open.zoom / 1.25));
    const zoomIn = button('+', 'dv-zoom dv-in', 'Larger', () => paint(open.zoom * 1.25));
    const save = el('a', '', 'Download');
    save.href = url.includes('/attachment?') || /\/resume$/.test(url) ? url : url + (url.includes('?') ? '&' : '?') + 'download=1';
    save.setAttribute('download', name || '');
    const done = button('Close', '', 'Close the document', dismiss);
    bar.append(done, title, zoomOut, zoomIn, save);
    body.appendChild(el('div', 'dv-note', 'Opening…'));
    root.append(bar, body);
    open = { root, zoom: 1, overflow: document.body.style.overflow, opener: document.activeElement, stop: null };
    const mine = open;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    done.focus();
    // So the phone's back button (and the Mac swipe) closes the document and not the page behind it.
    if (!history.state?.docView) history.pushState({ docView: true }, '', location.pathname + location.search);

    let file, kind, text = null, painting = 0;
    function note(message) { body.replaceChildren(el('div', 'dv-note', message)); zoomIn.hidden = zoomOut.hidden = true; }
    async function paint(zoom) {
      if (open !== mine || !file) return;
      mine.zoom = Math.max(0.5, Math.min(4, zoom));
      const turn = ++painting;
      try {
        const box = el('div');
        if (kind === 'pdf') {
          body.replaceChildren(box);
          mine.stop?.();
          const stop = await drawPdf(box, body, file.bytes, mine.zoom);
          if (open !== mine || turn !== painting) return stop();
          mine.stop = stop;
          if (file.missing) box.prepend(leftOut(file.missing));
        } else if (kind === 'image') {
          await drawImage(box, body, file.bytes, mine.zoom);
          body.replaceChildren(box);
        } else {
          const sheet = el('div', 'dv-sheet', text.trim() ? text : 'This file is empty.');
          sheet.style.fontSize = 15 * mine.zoom + 'px';
          body.replaceChildren(...(kind === 'docx' ? [el('div', 'dv-note', 'Word file: the words are shown, not the page layout.'), sheet] : [sheet]));
        }
      } catch (err) {
        console.error('[doc-viewer]', err);
        if (open === mine) note('This file could not be shown here. Use Download to open it.');
      }
    }

    try {
      const got = await get(url);
      if (open !== mine) return;
      file = got;
      const fileName = name || got.name || 'Document';
      title.textContent = fileName;
      save.setAttribute('download', got.name || fileName);
      kind = kindOf(got.bytes, got.name || name);
      if (kind === 'other') return note('This kind of file cannot be shown here. Use Download to open it.');
      if (kind === 'text') {
        text = decodeText(got.bytes.subarray(0, MAX_TEXT));
        if (got.bytes.length > MAX_TEXT) text += '\n\n[Only the first part of this file is shown.]';
      }
      if (kind === 'docx') text = await docxText(got.bytes);
      await paint(1);
    } catch (err) {
      if (open === mine) note(err.message || 'This file could not be opened.');
    }
  }

  // PDF previews that sit inside a screen, such as the approval queue.
  function fill(scope) {
    (scope || document).querySelectorAll('.doc-inline[data-doc]').forEach(async box => {
      if (box.dataset.filled) return;
      box.dataset.filled = '1';
      box.replaceChildren(el('div', 'dv-note', 'Loading the letter…'));
      try {
        const got = await get(box.dataset.doc);
        if (!box.isConnected) return;
        await drawPdf(box, box, got.bytes, 1);
        if (got.missing) box.prepend(leftOut(got.missing));
      } catch (err) { box.replaceChildren(el('div', 'dv-note', err.message || 'The letter could not be shown.')); }
    });
  }

  function nameFor(u) {
    if (u.pathname.endsWith('/attachment')) return u.searchParams.get('name') || 'Attachment';
    if (u.pathname.endsWith('/preview')) return u.searchParams.get('raw') ? 'File sent to print' : 'Letter preview';
    if (u.pathname.endsWith('/resume')) return '';
    if (/\/faxes\/\d+\/file$/.test(u.pathname)) return 'Fax document';
    return decodeURIComponent(u.pathname.split('/').pop());
  }

  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || a.hasAttribute('download')) return;
    const u = new URL(a.getAttribute('href'), location.origin);
    if (u.origin !== location.origin || !LINKS.test(u.pathname)) return;
    e.preventDefault();
    show(u.pathname + u.search, nameFor(u));
  });
  // Registered before the admin's own handler and stops it: closing a document must not redraw the screen behind it.
  window.addEventListener('popstate', e => { if (open) { close(); e.stopImmediatePropagation(); } }, true);
  // While a document is open, keys must not reach the screen behind it (the approval queue acts on single letters).
  window.addEventListener('keydown', e => { if (!open) return; e.stopPropagation(); if (e.key === 'Escape') dismiss(); }, true);

  window.DocView = { open: show, fill, close };
})();
