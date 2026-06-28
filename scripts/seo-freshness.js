#!/usr/bin/env node
/**
 * SEO freshness pass:
 * 1. Adds WebPage entity with datePublished/dateModified to every @graph page
 * 2. Adds visible "Updated June 2026" after the H1 on from-* pages missing it
 */
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const DATE_PUBLISHED = '2025-11-01';
const DATE_MODIFIED  = '2026-06-28';

const SKIP_SCHEMA = new Set([
  '404.html','500.html','account.html','order-success.html',
  'send.html','track.html','privacy.html','terms.html',
  'refunds.html','contact.html','about.html','guides.html',
]);

// Pages that already have visible "Updated" text (from grep audit)
const HAS_UPDATED = new Set([
  'can-you-mail-cash-to-canada.html',
  'can-i-mail-a-package-to-canada.html',
  'combien-coute-envoyer-une-lettre-au-canada.html',
  'from-cameroon.html','format-adresse-canadienne.html',
  'cheapest-way-to-send-a-letter-to-canada.html',
  'from-belgium.html','envoyer-documents-ircc-depuis-etranger.html',
  'comment-envoyer-une-lettre-au-canada.html','from-dominican-republic.html',
  'from-argentina.html','from-chile.html','from-iran.html',
  'from-netherlands.html','from-morocco.html','from-israel.html',
  'from-senegal.html','from-portugal.html','from-poland.html',
  'from-turkey.html','from-tanzania.html','from-peru.html',
  'from-sweden.html','from-uganda.html','from-romania.html',
  'from-venezuela.html','how-to-mail-cra-tax-forms-from-outside-canada.html',
  'how-to-send-mail-to-canada-without-a-canadian-address.html',
  'how-long-does-it-take-to-mail-a-letter-to-canada.html',
  'how-much-does-it-cost-to-mail-a-letter-to-canada.html',
  'ircc-processing-times.html','how-to-send-a-letter-to-canada-from-abroad.html',
  'how-to-mail-ircc-documents-from-outside-canada.html',
  'how-to-write-a-letter-to-canada.html','how-to-track-a-letter-to-canada.html',
  'how-to-address-a-letter-to-canada.html','mail-a-letter-online.html',
  'how-to-send-a-registered-letter-to-canada.html','send-a-letter-from-home.html',
  'send-a-letter-to-canada-without-a-return-address.html',
  'what-is-lettermail.html',
]);

const UPDATED_SNIPPET =
  '<p class="updated" style="font-family:\'DM Mono\',monospace;font-size:12px;' +
  'letter-spacing:0.06em;color:var(--ink-faint,#968b7d);margin-bottom:20px">Updated June 2026</p>';

const files = fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'));

let schemaUpdated = 0, dateAdded = 0, errors = 0;

for (const file of files) {
  const filepath = path.join(PUBLIC, file);
  let html = fs.readFileSync(filepath, 'utf8');
  let changed = false;

  // ── PASS 1: WebPage schema with dates ────────────────────────────────────
  if (!SKIP_SCHEMA.has(file) && html.includes('"@graph"') && !html.includes('dateModified')) {
    const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
    const url = canonicalMatch ? canonicalMatch[1] : null;
    const titleMatch  = html.match(/<title>([^<]+)<\/title>/);
    const descMatch   = html.match(/<meta name="description" content="([^"]+)"/);

    if (!url) {
      console.log(`  SKIP (no canonical): ${file}`);
      errors++;
    } else {
      const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (!ldMatch) {
        console.log(`  SKIP (no JSON-LD): ${file}`);
        errors++;
      } else {
        let schema;
        try {
          schema = JSON.parse(ldMatch[1]);
        } catch (e) {
          console.log(`  SKIP (JSON parse error in ${file}): ${e.message.slice(0,50)}`);
          errors++;
          schema = null;
        }

        if (schema && schema['@graph'] && Array.isArray(schema['@graph'])) {
          const title = titleMatch
            ? titleMatch[1].replace(/\s*[\|—]\s*Letterhome\s*$/, '').trim()
            : '';
          const desc = descMatch ? descMatch[1] : '';

          schema['@graph'].push({
            "@type": "WebPage",
            "@id": `${url}#webpage`,
            "url": url,
            "name": title,
            "description": desc,
            "datePublished": DATE_PUBLISHED,
            "dateModified": DATE_MODIFIED,
            "inLanguage": "en-CA",
            "isPartOf": { "@id": "https://letterhome.ca/#website" }
          });

          const newBlock =
            '<script type="application/ld+json">\n' +
            JSON.stringify(schema, null, 2) +
            '\n</script>';
          html = html.replace(ldMatch[0], newBlock);
          changed = true;
          schemaUpdated++;
          console.log(`  SCHEMA: ${file}`);
        }
      }
    }
  }

  // ── PASS 2: Visible "Updated" date on from-* pages that lack it ──────────
  const isFromPage = file.startsWith('from-');
  if (isFromPage && !HAS_UPDATED.has(file) && !html.includes('Updated')) {
    // Insert after the first </h1> in the body
    const h1CloseIdx = html.indexOf('</h1>');
    if (h1CloseIdx !== -1) {
      html = html.slice(0, h1CloseIdx + 5) + '\n  ' + UPDATED_SNIPPET + html.slice(h1CloseIdx + 5);
      changed = true;
      dateAdded++;
      console.log(`  DATE:   ${file}`);
    }
  }

  if (changed) {
    fs.writeFileSync(filepath, html);
  }
}

console.log(`\nDone — schema: ${schemaUpdated}, visible dates: ${dateAdded}, errors: ${errors}`);
