#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const countries = [
  { slug: 'iran', name: 'Iran', adjective: 'Iranian', postal: 'Post Bank of Iran (بانک پست ایران)', cost: 'IRR 500,000–1,500,000 (~US$1–3)', delivery: '3–8 weeks', flag: '🇮🇷', note: 'International mail service is limited due to sanctions. DHL and FedEx may not serve all destinations.' },
  { slug: 'morocco', name: 'Morocco', adjective: 'Moroccan', postal: 'Barid Al-Maghrib (بريد المغرب)', cost: 'MAD 15–30 (~US$1.50–3)', delivery: '2–4 weeks', flag: '🇲🇦', note: 'Barid Al-Maghrib international lettermail is reliable. Tracking available on registered items.' },
  { slug: 'turkey', name: 'Turkey', adjective: 'Turkish', postal: 'PTT (Posta ve Telgraf Teşkilatı)', cost: 'TRY 50–120 (~US$1.50–3.50)', delivery: '1–3 weeks', flag: '🇹🇷', note: 'PTT offers international registered mail with tracking. Courier services like DHL and UPS also available.' },
  { slug: 'poland', name: 'Poland', adjective: 'Polish', postal: 'Poczta Polska', cost: 'PLN 8–18 (~US$2–4.50)', delivery: '7–14 days', flag: '🇵🇱', note: 'Poczta Polska is a reliable EU postal service with tracked international options.' },
  { slug: 'romania', name: 'Romania', adjective: 'Romanian', postal: 'Poșta Română', cost: 'RON 15–35 (~US$3.30–7.70)', delivery: '7–14 days', flag: '🇷🇴', note: 'Poșta Română offers international lettermail. Courier services like DHL and FedEx serve Romania.' },
  { slug: 'portugal', name: 'Portugal', adjective: 'Portuguese', postal: 'CTT (Correios de Portugal)', cost: '€1.80–3.50', delivery: '5–10 days', flag: '🇵🇹', note: 'CTT is an EU postal service with reliable international tracked options. Express delivery available.' },
  { slug: 'sweden', name: 'Sweden', adjective: 'Swedish', postal: 'PostNord', cost: 'SEK 25–55 (~US$2.35–5.20)', delivery: '5–10 days', flag: '🇸🇪', note: 'PostNord is fast and reliable. Tracking available. Some DHL and FedEx offices for express options.' },
  { slug: 'netherlands', name: 'Netherlands', adjective: 'Dutch', postal: 'PostNL', cost: '€1.60–3.00', delivery: '5–10 days', flag: '🇳🇱', note: 'PostNL is one of Europe\'s best postal services. Tracked international mail widely available.' },
  { slug: 'argentina', name: 'Argentina', adjective: 'Argentine', postal: 'Correo Argentino', cost: 'ARS 2,500–6,000 (~US$2.50–6)', delivery: '3–6 weeks', flag: '🇦🇷', note: 'International mail is slow from Argentina. Courier services are more reliable for time-sensitive documents.' },
  { slug: 'peru', name: 'Peru', adjective: 'Peruvian', postal: 'Serpost (Servicios Postales del Perú)', cost: 'PEN 18–40 (~US$4.80–10.70)', delivery: '2–6 weeks', flag: '🇵🇪', note: 'Serpost international mail is slow. DHL and FedEx offices exist in Lima for faster tracked delivery.' },
  { slug: 'chile', name: 'Chile', adjective: 'Chilean', postal: 'Correos de Chile', cost: 'CLP 2,000–4,500 (~US$2.15–4.85)', delivery: '7–21 days', flag: '🇨🇱', note: 'Correos de Chile is Latin America\'s most reliable postal service. Tracked options available.' },
  { slug: 'venezuela', name: 'Venezuela', adjective: 'Venezuelan', postal: 'Ipostel (Instituto Postal Telegráfico)', cost: 'VES varies', delivery: '4–10 weeks', flag: '🇻🇪', note: 'International postal service from Venezuela is unreliable. Use courier services like DHL for important documents.' },
  { slug: 'dominican-republic', name: 'Dominican Republic', adjective: 'Dominican', postal: 'INPOSDOM (Instituto Postal Dominicano)', cost: 'DOP 100–250 (~US$1.70–4.25)', delivery: '1–3 weeks', flag: '🇩🇴', note: 'INPOSDOM handles international mail. FedEx and DHL also have offices in major cities.' },
  { slug: 'tanzania', name: 'Tanzania', adjective: 'Tanzanian', postal: 'Tanzania Posts Corporation (TPC)', cost: 'TZS 3,000–6,000 (~US$1.15–2.30)', delivery: '2–4 weeks', flag: '🇹🇿', note: 'TPC offers international lettermail. Tracking is limited. Courier services available in Dar es Salaam.' },
  { slug: 'uganda', name: 'Uganda', adjective: 'Ugandan', postal: 'Posta Uganda', cost: 'UGX 4,000–8,000 (~US$1.05–2.10)', delivery: '2–4 weeks', flag: '🇺🇬', note: 'Posta Uganda handles international mail. DHL and FedEx offices exist in Kampala.' },
  { slug: 'cameroon', name: 'Cameroon', adjective: 'Cameroonian', postal: 'Campost (Cameroon Postal Services)', cost: 'XAF 1,500–3,500 (~US$2.50–5.80)', delivery: '2–5 weeks', flag: '🇨🇲', note: 'Campost handles international mail from Cameroon. Service reliability varies. DHL available in Yaoundé and Douala.' },
  { slug: 'senegal', name: 'Senegal', adjective: 'Senegalese', postal: 'La Poste Sénégal', cost: 'XOF 1,200–2,500 (~US$2–4.15)', delivery: '2–4 weeks', flag: '🇸🇳', note: 'La Poste Sénégal offers international lettermail. DHL available in Dakar for tracked express options.' },
  { slug: 'israel', name: 'Israel', adjective: 'Israeli', postal: 'Israel Post (דואר ישראל)', cost: 'ILS 8–18 (~US$2.15–4.85)', delivery: '7–14 days', flag: '🇮🇱', note: 'Israel Post is reliable with good international tracking. Registered mail and express options available.' },
];

const template = (c) => `<!DOCTYPE html>
<html lang="en-CA">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="/ga.js" defer><\/script>
<script src="/cookie-consent.js" defer><\/script>
<title>Send a Letter from ${c.name} to Canada — Cost, Delivery & How To (2026)</title>
<meta name="description" content="How to send a letter or document from ${c.name} to Canada. Postal options, costs, delivery times, and the easiest way to mail from ${c.name}.">
<link rel="canonical" href="https://letterhome.ca/from-${c.slug}">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#f1ebde" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a1410" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="Send a Letter from ${c.name} to Canada — Cost, Delivery & How To (2026)">
<meta property="og:description" content="How to send a letter or document from ${c.name} to Canada. Postal options, costs, and the easiest way.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://letterhome.ca/from-${c.slug}">
<meta property="og:image" content="https://letterhome.ca/og-image.jpg?v=2">
<meta property="og:site_name" content="Letterhome">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      "name": "Send a letter from ${c.name} to Canada",
      "serviceType": "Letter Mailing",
      "provider": { "@type": "Organization", "name": "Letterhome", "url": "https://letterhome.ca" },
      "areaServed": { "@type": "Country", "name": "Canada" },
      "description": "Upload your document online and Letterhome prints and mails it from inside Canada — no printer or stamps needed."
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "How do I send a letter from ${c.name} to Canada?", "acceptedAnswer": { "@type": "Answer", "text": "You can send via ${c.postal} at your local post office, use a courier like DHL or FedEx, or use Letterhome — upload your document online and we mail it from inside Canada via Canada Post." } },
        { "@type": "Question", "name": "How long does a letter from ${c.name} to Canada take?", "acceptedAnswer": { "@type": "Answer", "text": "Standard lettermail from ${c.name} to Canada takes approximately ${c.delivery}. Couriers like DHL typically arrive in 3–7 business days." } },
        { "@type": "Question", "name": "How much does it cost to mail a letter from ${c.name} to Canada?", "acceptedAnswer": { "@type": "Answer", "text": "Standard postage from ${c.name} to Canada costs approximately ${c.cost}. Courier services cost more but offer tracking and faster delivery. Letterhome costs CAD $10 regardless of your location." } }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://letterhome.ca/" },
        { "@type": "ListItem", "position": 2, "name": "Guides", "item": "https://letterhome.ca/guides" },
        { "@type": "ListItem", "position": 3, "name": "Send a letter from ${c.name} to Canada", "item": "https://letterhome.ca/from-${c.slug}" }
      ]
    }
  ]
}
<\/script>
<link rel="stylesheet" href="/fonts.css">
<link rel="stylesheet" href="/theme.css?v=1">
<link rel="stylesheet" href="/guide.css">
</head>
<body>
<a href="#main-content" class="skip-link" style="position:absolute;left:-9999px;top:4px;z-index:9999;background:#a8472d;color:#faf6ec;padding:8px 16px;font-size:14px;text-decoration:none;border-radius:2px" onfocus="this.style.left='4px'" onblur="this.style.left='-9999px'">Skip to main content</a>
<nav>
  <div class="nav-inner">
    <a href="/" class="logo">
      <img src="/logo.png" alt="Letterhome" width="32" height="34" style="height:34px;width:auto;display:block">
      <span>Letter<span style="color:var(--red)">home</span></span>
    </a>
    <a href="/send" class="btn btn-red">Send a letter</a>
  </div>
</nav>

<div class="guide-wrap" id="main-content">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/">Home</a> › <a href="/guides">Guides</a> › <span>Send a letter from ${c.name} to Canada</span>
  </nav>

  <h1>${c.flag} Send a letter from ${c.name} to Canada</h1>
  <p class="answer-capsule"><strong>The easiest way to send a letter from ${c.name} to Canada</strong> is Letterhome — upload your document, pay CAD $10, and we print and mail it from inside Canada via Canada Post. No post office, no stamps, no international postage required. Or use ${c.postal} at your local post office for ~${c.cost}.</p>

  <h2>Mailing options from ${c.name} to Canada</h2>
  <div style="overflow-x:auto">
  <table class="comparison-table">
    <thead><tr><th>Method</th><th>Cost</th><th>Delivery</th><th>Tracking</th><th>Best for</th></tr></thead>
    <tbody>
      <tr>
        <td><strong>${c.postal}</strong></td>
        <td>${c.cost}</td>
        <td>${c.delivery}</td>
        <td>Registered mail only</td>
        <td>Low-priority documents</td>
      </tr>
      <tr>
        <td><strong>DHL / FedEx / UPS</strong></td>
        <td>US$30–80</td>
        <td>3–7 business days</td>
        <td>✅ Full tracking</td>
        <td>Urgent, tracked delivery</td>
      </tr>
      <tr style="background:rgba(168,71,45,0.06)">
        <td><strong>Letterhome ✓ Recommended</strong></td>
        <td><strong>CAD $10</strong></td>
        <td>Up to 2 weeks (mailed within Canada)</td>
        <td>Order confirmation</td>
        <td>Documents, IRCC, CRA, legal letters</td>
      </tr>
    </tbody>
  </table>
  </div>

  <h2>Why Letterhome is the easier option</h2>
  <p>International mail from ${c.name} can be slow and expensive. With Letterhome:</p>
  <ul style="margin:12px 0 16px 20px;line-height:2">
    <li>Your document is uploaded online — no trip to the post office</li>
    <li>We print and mail it from <strong>inside Canada</strong> via Canada Post Lettermail</li>
    <li>The recipient gets a domestic Canadian letter — faster and more reliable</li>
    <li>Flat rate of CAD $10, regardless of your location</li>
  </ul>

  <h2>How to send a letter from ${c.name} via Letterhome</h2>
  <ol style="margin:12px 0 16px 20px;line-height:2.2">
    <li>Save your document as a PDF</li>
    <li>Go to <a href="/send">letterhome.ca/send</a> and upload your file</li>
    <li>Enter the Canadian recipient address</li>
    <li>Pay CAD $10</li>
    <li>We print and mail your letter from Canada</li>
  </ol>

  <h2>How to mail from ${c.name} via the post office</h2>
  <p>${c.note}</p>
  <ol style="margin:12px 0 16px 20px;line-height:2.2">
    <li>Write the recipient's address using <a href="/how-to-address-a-letter-to-canada">Canadian address format</a> (include "CANADA" on the last line)</li>
    <li>Visit your local branch of ${c.postal}</li>
    <li>Ask for international lettermail to Canada</li>
    <li>Pay postage (~${c.cost})</li>
    <li>For important documents, request registered/tracked mail</li>
  </ol>

  <h2>Canadian address format</h2>
  <p>Make sure to write the Canadian address correctly:</p>
  <pre style="background:var(--bg-2,#f5f0e8);border-radius:4px;padding:1rem;font-size:14px;line-height:1.9;overflow-x:auto">[Recipient Name]
[Street Address, Unit/Apt #]
[City, Province  Postal Code]
CANADA</pre>
  <p>Example: <code>Jane Smith, 245 Queen St W, Toronto, ON  M5V 1Z4, CANADA</code></p>
  <p>See the full <a href="/how-to-address-a-letter-to-canada">address format guide</a> for province abbreviations.</p>

  <h2>Frequently asked questions</h2>

  <h3>How do I send a letter from ${c.name} to Canada?</h3>
  <p>Three options: (1) ${c.postal} at your local post office, (2) a courier like DHL or FedEx, or (3) Letterhome — upload online, we mail from Canada for CAD $10.</p>

  <h3>How long does a letter from ${c.name} to Canada take?</h3>
  <p>Standard post: approximately ${c.delivery}. Courier services: 3–7 business days. Letterhome: up to 2 weeks after upload (mailed domestically within Canada).</p>

  <h3>How much does it cost to mail a letter from ${c.name} to Canada?</h3>
  <p>Standard postage costs approximately ${c.cost}. Couriers cost US$30–80. Letterhome is CAD $10 flat.</p>

  <div style="margin:32px 0 16px">
    <a href="/send" class="btn btn-red">Send your letter now →</a>
  </div>

  <h2>Related guides</h2>
  <ul>
    <li><a href="/how-to-address-a-letter-to-canada">How to address a letter to Canada</a></li>
    <li><a href="/how-long-does-it-take-to-mail-a-letter-to-canada">How long does it take to mail a letter to Canada?</a></li>
    <li><a href="/cheapest-way-to-send-a-letter-to-canada">Cheapest way to send a letter to Canada</a></li>
    <li><a href="/how-to-mail-ircc-documents-from-outside-canada">How to mail IRCC documents from outside Canada</a></li>
  </ul>
</div>

<footer id="site-footer"></footer>
<script src="/footer.js" defer><\/script>
<script src="/theme.js"><\/script>
</body>
</html>`;

const outDir = path.join(__dirname, '../public');
for (const c of countries) {
  const filename = `from-${c.slug}.html`;
  fs.writeFileSync(path.join(outDir, filename), template(c));
  console.log(`✅ ${filename}`);
}
console.log(`\nDone — ${countries.length} pages generated.`);
