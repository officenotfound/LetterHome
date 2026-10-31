#!/usr/bin/env node
// Builds the "verified details" section on the enriched from-<country> pages and
// the four regional hub guides, from scripts/data/country-facts/*.json.
// Every figure comes from an official source recorded in those files; anything
// not verified is simply left out. Safe to re-run (sections are replaced in place).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(__dirname, 'data', 'country-facts');
const PUB = path.join(ROOT, 'public');
const SITE = 'https://letterhome.ca';
const DATE = '2026-10-30';

const facts = {};
for (const f of fs.readdirSync(DATA).filter(f => f.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
  facts[j.slug] = j;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function offices(j) {
  if (j.canadian_offices && j.canadian_offices.offices) {
    return { cities: j.canadian_offices.offices.map(o => o.city), list: j.canadian_offices.offices.map(o => `${o.name}, ${o.city}`), url: j.canadian_offices.source_url };
  }
  if (j.canadian_mission) return { cities: [j.canadian_mission.city], list: [`${j.canadian_mission.name}, ${j.canadian_mission.city}`], url: j.canadian_mission.url };
  return null;
}

function factList(j) {
  const items = [];
  const po = j.postal_operator;
  if (po && po.name) items.push(`<strong>Postal operator:</strong> ${po.source_url ? `<a href="${esc(po.source_url)}" rel="nofollow noopener">${esc(po.name)}</a>` : esc(po.name)}.`);
  const il = j.international_letter;
  if (il && il.price_text) items.push(`<strong>Published letter price:</strong> ${esc(il.price_text)} (${esc(il.description)}). <a href="${esc(il.source_url)}" rel="nofollow noopener">Source</a>.`);
  const tr = j.transit_to_canada;
  if (tr && tr.text) items.push(`<strong>Stated delivery time to Canada:</strong> ${esc(tr.text)}. <a href="${esc(tr.source_url)}" rel="nofollow noopener">Source</a>.`);
  const v = j.canada_visa_application_centre;
  if (v && v.cities && v.cities.length) {
    items.push(`<strong>Canada visa application centre${v.cities.length > 1 ? 's' : ''} (IRCC):</strong> ${esc(v.cities.join(', '))}.${v.note ? ' ' + esc(v.note) : ''} <a href="${esc(v.source_url)}" rel="nofollow noopener">IRCC list</a>.`);
  }
  const o = offices(j);
  if (o) items.push(`<strong>Government of Canada office${o.list.length > 1 ? 's' : ''}:</strong> ${o.list.map(esc).join('; ')}. <a href="${esc(o.url)}" rel="nofollow noopener">Official page</a>.`);
  for (const n of (j.notes_for_senders || [])) {
    const t = typeof n === 'string' ? n : n.fact;
    if (/Canada Post \(mail from Canada\)|Canada Post:|Canada Post status/.test(t)) continue; // about mail leaving Canada, not relevant to senders here
    items.push(`${esc(t)}${n.source_url ? ` <a href="${esc(n.source_url)}" rel="nofollow noopener">Source</a>.` : ''}`);
  }
  return items;
}

// ---------- A. enrich existing pages ----------
const START = '<!-- verified-facts:start -->';
const END = '<!-- verified-facts:end -->';
const ENRICH = ['usa', 'uk', 'australia', 'uae', 'france', 'hong-kong', 'india', 'philippines', 'italy', 'germany', 'pakistan', 'singapore', 'argentina', 'dominican-republic'];

for (const slug of ENRICH) {
  const file = path.join(PUB, `from-${slug}.html`);
  if (!fs.existsSync(file) || !facts[slug]) { console.log('skip', slug); continue; }
  const j = facts[slug];
  const items = factList(j);
  if (!items.length) continue;
  const block = `${START}
  <h2>Verified details for senders in ${esc(j.country)}</h2>
  <p>Checked against official sources on ${DATE}. Figures change, so follow the source links before relying on them.</p>
  <ul class="verified-facts">
${items.map(i => `    <li>${i}</li>`).join('\n')}
  </ul>
  <p>Whichever postal option you pick, a letter that starts in ${esc(j.country)} has to cross borders. A letter ordered through Letterhome is printed and posted inside Canada instead, so it travels as ordinary Canadian lettermail to its Canadian address.</p>
  ${END}
`;
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(new RegExp(`\\s*${START}[\\s\\S]*?${END}\\n?`), '\n');
  const marker = '  <h2 data-i18n="from.shared.guides.h2">';
  if (!html.includes(marker)) { console.log('no marker', slug); continue; }
  html = html.replace(marker, `  ${block}\n${marker}`);
  fs.writeFileSync(file, html);
  console.log('enriched', slug);
}

// ---------- B. regional hubs ----------
const HUBS = [
  { slug: 'letters-from-europe-to-canada', name: 'Europe', countries: ['poland', 'portugal', 'romania', 'sweden', 'netherlands'], old: ['poland', 'portugal', 'romania', 'sweden', 'netherlands'] },
  { slug: 'letters-from-middle-east-and-north-africa-to-canada', name: 'the Middle East and North Africa', countries: ['turkey', 'israel', 'iran', 'morocco'] },
  { slug: 'letters-from-sub-saharan-africa-to-canada', name: 'Sub-Saharan Africa', countries: ['cameroon', 'senegal', 'tanzania', 'uganda'] },
  { slug: 'letters-from-latin-america-to-canada', name: 'Latin America', countries: ['peru', 'chile', 'venezuela'] },
];
const REDIRECTS = {};
for (const h of HUBS) for (const c of h.countries) REDIRECTS[`/from-${c}`] = `/${h.slug}#${c}`;

const tplFile = path.join(__dirname, 'data', 'hub-template.html'); // saved copy of the old from-poland page layout
const source = fs.readFileSync(tplFile, 'utf8');

const cssStart = source.indexOf('<link rel="stylesheet" href="/fonts.css');
const pageStart = source.indexOf('<div class="page" id="main-content">');
const headerStart = source.lastIndexOf('<body', pageStart);
const styleBlock = source.slice(cssStart, headerStart);
const bodyOpen = source.slice(headerStart, pageStart);
const tail = source.slice(source.indexOf('<footer id="site-footer">'));

function cell(v) { return v ? esc(v) : '<span style="color:var(--ink-faint)">not verified</span>'; }

for (const h of HUBS) {
  const url = `${SITE}/${h.slug}`;
  const title = `Send a Letter from ${h.name.replace(/^the /, '')} to Canada: Guide (2026)`;
  const desc = `Mailing a letter to Canada from ${h.name}? Verified postal operators, visa application centres and Canadian offices by country, plus the easiest way to send: $5 CAD via Letterhome.`;
  const cs = h.countries.map(c => facts[c]);
  const rows = cs.map(j => {
    const il = j.international_letter && j.international_letter.price_text;
    const v = j.canada_visa_application_centre && j.canada_visa_application_centre.cities;
    const o = offices(j);
    return `      <tr><td><a href="#${j.slug}">${esc(j.country)}</a></td><td>${cell(j.postal_operator && j.postal_operator.name)}</td><td>${cell(il)}</td><td>${cell(v && v.join(', '))}</td><td>${cell(o && o.cities.join('; '))}</td></tr>`;
  }).join('\n');
  const sections = cs.map(j => `  <h2 id="${j.slug}">Mailing to Canada from ${esc(j.country)}</h2>
  <ul class="verified-facts">
${factList(j).map(i => `    <li>${i}</li>`).join('\n')}
  </ul>
  <p>${j.international_letter && j.international_letter.price_text ? 'Posting directly costs the amount above plus your time at the post office, and the letter still has to be routed internationally.' : 'We could not verify a current price for a letter to Canada from the official operator, so check with them directly.'} With Letterhome you upload your letter online and it is printed and mailed from inside Canada for <strong>$6 CAD</strong>.</p>`).join('\n\n');

  const faqs = [
    [`How do I send a letter from ${h.name} to Canada without posting it?`, `Upload your document at letterhome.ca/send, enter the Canadian recipient's address and pay online. Letterhome prints it and mails it from inside Canada via Canada Post, so you never need a printer, stamps or a post office.`],
    [`How much does Letterhome cost for a letter to a Canadian address?`, `$6 CAD for a Canadian address, with 2 pages in black and white, the envelope and Canadian postage included. Colour is +$1 and extra pages are $0.45 each ($0.55 in colour).`],
    [`Do I need a Canadian address or bank account?`, `No. You only need the recipient's Canadian address. You can pay online by card from anywhere.`],
    [`How long does delivery take?`, `Letters are printed and mailed within one business day of payment, then delivered by Canada Post standard lettermail, typically within up to 2 weeks.`],
  ];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Service', name: `Send a letter from ${h.name} to Canada`, serviceType: 'Letter Mailing', provider: { '@type': 'Organization', name: 'Letterhome', url: SITE }, areaServed: { '@type': 'Country', name: 'Canada' }, description: 'Upload your document online and Letterhome prints and mails it from inside Canada, no printer or stamps needed.' },
      { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: SITE + '/guides' },
        { '@type': 'ListItem', position: 3, name: title, item: url } ] },
      { '@type': 'WebPage', '@id': url + '#webpage', url, name: title, description: desc, datePublished: DATE, dateModified: DATE, inLanguage: 'en-CA', isPartOf: { '@id': SITE + '/#website' } },
    ],
  };

  const head = `<!DOCTYPE html>
<html lang="en-CA">
<head>
<meta charset="UTF-8">
<link rel="preload" as="font" type="font/woff2" href="/fonts/vEFI2_tTDB4M7-auWDN0ahZJW1gb8tc.woff2" crossorigin>
<link rel="dns-prefetch" href="https://www.googletagmanager.com">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="/ga.js" defer></script>
<script src="/cookie-consent.js?v=2" defer></script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#f1ebde" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a1410" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.jpg?v=3">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:site_name" content="Letterhome">
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
`;
  const others = HUBS.filter(x => x !== h).map(x => `    <a href="/${x.slug}" style="font-size:15px;color:var(--red);text-decoration:none">&rarr; Letters from ${esc(x.name)} to Canada</a>`).join('\n');
  const body = `<div class="page" id="main-content">

  <div class="eyebrow">Mailing from ${esc(h.name)}</div>
  <h1>Send a letter from ${esc(h.name.replace(/^the /, ''))} to Canada</h1>
  <p class="updated" style="font-family:'DM Mono',monospace;font-size:12px;letter-spacing:0.06em;color:var(--ink-faint,#968b7d);margin-bottom:20px">Updated October 2026</p>
  <p class="answer-capsule"><strong>Short answer:</strong> you can post a letter to Canada through your national postal operator, or upload it at Letterhome and have it printed and mailed from inside Canada for <strong>$6 CAD</strong>. This guide lists the verified postal, visa-centre and Canadian-office details for ${cs.map(j => esc(j.country)).join(', ')}.</p>

  <div class="cta-row">
    <a href="/send" class="btn btn-red">Send a letter now</a>
    <span class="price-note">From $6 CAD &nbsp;·&nbsp; No account required</span>
  </div>

  <h2>At a glance</h2>
  <div style="overflow-x:auto">
  <table class="comparison-table">
    <thead><tr><th>Country</th><th>Postal operator</th><th>Published letter price</th><th>Canada visa centre</th><th>Canadian office</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  </div>
  <p>Checked against official sources on ${DATE}. Entries marked "not verified" are ones we could not confirm from an official page, so we do not guess.</p>

${sections}

  <h2>How it works from ${esc(h.name)}</h2>
  <ol>
    <li><strong>Upload</strong> your letter or document (PDF, Word or image, up to 5 files) at <a href="/send">letterhome.ca/send</a>. Documents can be in any language; we print exactly what you upload.</li>
    <li><strong>Enter the Canadian address</strong> of the recipient and pay online by card. No account is needed.</li>
    <li><strong>We print and mail it in Canada</strong> within one business day. It is delivered by Canada Post as ordinary lettermail, so there is no international routing or customs step for the letter.</li>
  </ol>
  <p>This suits family letters, immigration and tax paperwork, bank and university documents, and legal notices that must reach a Canadian address on paper. For tracked or signature delivery, registered mail is available as an add-on.</p>

  <h2>Frequently asked questions</h2>
  <div class="faq-list">
${faqs.map(([q, a], i) => `    <div class="faq-item">
      <button class="faq-q" onclick="toggle(${i})" aria-expanded="false" aria-controls="a${i}"><span>${esc(q)}</span><svg class="faq-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
      <div class="faq-a" id="a${i}" hidden>${esc(a)}</div>
    </div>`).join('\n')}
  </div>

  <h2>Related guides</h2>
  <div style="display:grid;gap:8px;margin-top:8px;margin-bottom:8px">
    <a href="/how-to-send-a-letter-to-canada-from-abroad" style="font-size:15px;color:var(--red);text-decoration:none">&rarr; How to send a letter to Canada from abroad</a>
    <a href="/how-to-address-a-letter-to-canada" style="font-size:15px;color:var(--red);text-decoration:none">&rarr; How to address a letter to Canada</a>
    <a href="/how-much-does-it-cost-to-mail-a-letter-to-canada" style="font-size:15px;color:var(--red);text-decoration:none">&rarr; How much it costs to mail a letter to Canada</a>
${others}
    <a href="/guides" style="font-size:15px;color:var(--red);text-decoration:none">&rarr; All guides</a>
  </div>

  <div class="cta-band">
    <h2>Ready to send?</h2>
    <p>Fill out the form, attach your documents, and we handle everything else.</p>
    <a href="/send" class="btn btn-paper">Send a letter &rarr;</a>
  </div>

</div>

`;
  fs.writeFileSync(path.join(PUB, `${h.slug}.html`), head + styleBlock + bodyOpen + body + tail);
  console.log('hub', h.slug);
}

fs.writeFileSync(path.join(__dirname, 'data', 'redirects.json'), JSON.stringify(REDIRECTS, null, 2) + '\n');
console.log('redirects:', Object.keys(REDIRECTS).length);
