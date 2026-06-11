// Validates that hreflang pairs between EN and FR pages are correct and mutual.
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '../../public');

const pairs = [
  {
    frFile: 'comment-envoyer-une-lettre-au-canada.html',
    enFile: 'how-to-send-a-letter-to-canada-from-abroad.html',
    frUrl:  'https://letterhome.ca/comment-envoyer-une-lettre-au-canada',
    enUrl:  'https://letterhome.ca/how-to-send-a-letter-to-canada-from-abroad'
  }
];

const errors = [];

for (const { frFile, enFile, frUrl, enUrl } of pairs) {
  const fr = fs.readFileSync(path.join(PUBLIC, frFile), 'utf8');
  const en = fs.readFileSync(path.join(PUBLIC, enFile), 'utf8');

  // FR page must reference itself as fr-ca and the EN page as en-ca
  if (!fr.includes('hreflang="fr-ca"') && !fr.includes("hreflang='fr-ca'"))
    errors.push(`${frFile}: missing hreflang="fr-ca"`);
  if (!fr.includes(frUrl))
    errors.push(`${frFile}: missing self-referencing hreflang URL ${frUrl}`);
  if (!fr.includes(enUrl))
    errors.push(`${frFile}: missing link to EN counterpart ${enUrl}`);

  // EN page must reference itself as en-ca and the FR page as fr-ca
  if (!en.includes('hreflang="en-ca"') && !en.includes("hreflang='en-ca'"))
    errors.push(`${enFile}: missing hreflang="en-ca"`);
  if (!en.includes(enUrl))
    errors.push(`${enFile}: missing self-referencing hreflang URL ${enUrl}`);
  if (!en.includes(frUrl))
    errors.push(`${enFile}: missing link to FR counterpart ${frUrl}`);
}

if (errors.length) {
  console.error('Hreflang errors:');
  errors.forEach(e => console.error('  ✗', e));
  process.exit(1);
} else {
  console.log(`Hreflang OK — ${pairs.length} pair(s) validated`);
}
