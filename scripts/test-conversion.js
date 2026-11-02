#!/usr/bin/env node
'use strict';
// Checks how uploaded files will be turned into the PDF we send to PostGrid.
//   node scripts/test-conversion.js file1.docx file2.doc notes.txt scan.pdf
// Writes <name>.converted.pdf into ./conversion-test-out/ and prints sheet counts so you can open the PDFs
// and compare them with the originals. Needs LibreOffice (soffice) for .doc/.docx.
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');
const { createPostGrid } = require('../postgrid');

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/test-conversion.js <file> [file...]'); process.exit(1); }
const out = path.resolve('conversion-test-out');
fs.mkdirSync(out, { recursive: true });
const pg = createPostGrid({ db: null, getSetting: (k, f) => f, orderDirPath: () => '.' });

(async () => {
  let bad = 0;
  for (const f of files) {
    const abs = path.resolve(f);
    const order = { letter_body: '', attachment_info: JSON.stringify([{ path: abs, originalName: path.basename(abs) }]) };
    try {
      const b = await pg.buildLetterPdf(order);
      const doc = await PDFDocument.load(b.pdf);
      const sizes = [...new Set(doc.getPages().map(p => `${p.getWidth()}x${p.getHeight()}`))];
      const dest = path.join(out, path.basename(abs).replace(/\.[^.]+$/, '') + '.converted.pdf');
      fs.writeFileSync(dest, b.pdf);
      const ok = !b.unsupported.length && !b.warnings.length && sizes.length === 1 && sizes[0] === '612x792' && b.sheets <= 5;
      if (!ok) bad++;
      const why = [b.sheets > 5 && `too long: ${b.sheets} sheets (max 5), would go to the manual queue`, sizes.length !== 1 || sizes[0] !== '612x792' ? 'page sizes are not all Letter' : ''].filter(Boolean).join('; ');
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${path.basename(abs)} -> ${path.relative('.', dest)}  pages=${b.pages} sheets=${b.sheets} sizes=${sizes.join(',')}` +
        (why ? `  [${why}]` : '') + (b.unsupported.length ? `  UNSUPPORTED=${b.unsupported.join(',')}` : '') + (b.warnings.length ? `  WARN=${b.warnings.join(' ')}` : ''));
    } catch (e) { bad++; console.log(`FAIL ${path.basename(abs)}: ${e.message}`); }
  }
  process.exit(bad ? 1 : 0);
})();
