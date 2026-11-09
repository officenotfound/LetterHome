#!/usr/bin/env python3
"""Builds the four business pages (public/business.html, business-us.html, business-uk.html, business-au.html) from one template.
Run from the project root:  python3 scripts/build-business-pages.py
The country copy lives in COUNTRIES below; everything else is shared so the four pages stay in step."""
import re, html

SRC = open('public/bulk-mailing.html', encoding='utf-8').read()
STYLE = re.search(r'<style>(.*?)</style>', SRC, re.S).group(1)
THEME_SCRIPT = re.search(r'(<script>\(function\(\)\{try\{var m=window\.matchMedia.*?</script>)', SRC, re.S).group(1)

BASE = 'https://letterhome.ca'
PATHS = {'ca': '/business', 'us': '/us/business', 'uk': '/uk/business', 'au': '/au/business'}
FILES = {'ca': 'business.html', 'us': 'business-us.html', 'uk': 'business-uk.html', 'au': 'business-au.html'}
HREFLANG = [('en-CA', 'ca'), ('en-US', 'us'), ('en-GB', 'uk'), ('en-AU', 'au')]

COUNTRIES = {
  'ca': dict(
    lang='en-CA', cc='', place='Canada', title='Business Mail: Letters and Postcards at Volume | Letterhome',
    desc='Printed, addressed and mailed for your business: letters and postcards at volume, address-checked, mailed from Canada. Request a quote.',
    h1='Print and mail at volume,<br><em>without a print shop.</em>',
    sub='Letters, postcards and more, printed, addressed and mailed for you in Canada and abroad. One list in, every piece checked and posted.',
    where='Your pieces are printed and mailed in Canada through Canada Post, to Canadian addresses and to the rest of the world.',
    who=[('Property managers and landlords','Serve notices to many tenants at once, with proof of what was mailed and when.'),
         ('Immigration consultants and paralegals','Mail client documents to Canadian addresses from anywhere, for as many clients as you have.'),
         ('Small businesses','Invoices, statements, renewals and thank-you letters, printed and posted without a printer in the office.'),
         ('Clubs, schools and charities','Appeals, receipts and invitations to a membership list.'),
         ('Marketers','Postcards to a local list, sent in one batch.')],
    dests=['Mostly within Canada','Mostly the United States','A mix of Canada and the United States','Other countries too'],
    pricing='Letters have published volume pricing from 10 pieces, see <a href="/bulk-mailing">bulk letter pricing</a>. Postcards and anything custom are quoted per job.',
    single='/send', single_label='Send a single letter, from $6 →'),
  'us': dict(
    lang='en-US', cc='us', place='the U.S.', title='Business Mail in the U.S.: Letters and Postcards at Volume | Letterhome',
    desc='Printed, addressed and mailed for your U.S. business: letters and postcards at volume, address-checked. Request a quote.',
    h1='Print and mail at volume,<br><em>without a print shop.</em>',
    sub='Letters, postcards and more, printed, addressed and mailed for you, in the U.S. and abroad. One list in, every piece checked and mailed.',
    where='Where our U.S. printing is running, your pieces are printed and mailed inside the U.S. Otherwise they are printed in Canada and mailed from there, which takes longer. Your quote says which applies.',
    who=[('Property managers and landlords','Mail notices to many tenants at once, with a record of what went out and when.'),
         ('Law offices and service firms','Client letters and documents mailed in batches, in the U.S. and to Canada.'),
         ('Small businesses','Invoices, statements, renewals and thank-you letters, printed and mailed without a printer in the office.'),
         ('Nonprofits, schools and clubs','Appeals, receipts and invitations to a membership list.'),
         ('Marketers','Postcards to a local list, sent in one batch.')],
    dests=['Mostly within the U.S.','Mostly Canada','A mix of U.S. and Canada','Other countries too'],
    pricing='Volume pricing is quoted per job: send us the quantity and where the pieces are going and we reply with an exact total in U.S. dollars.',
    single='/send?to=US&cur=USD', single_label='Send a single letter →'),
  'uk': dict(
    lang='en-GB', cc='uk', place='the UK', title='Business Mail in the UK: Letters and Postcards at Volume | Letterhome',
    desc='Printed, addressed and posted for your UK business: letters and postcards at volume, address-checked. Request a quote.',
    h1='Print and post at volume,<br><em>without a print shop.</em>',
    sub='Letters, postcards and more, printed, addressed and posted for you, in the UK and abroad. One list in, every piece checked and posted.',
    where='Where our UK printing is running, your pieces are printed and posted inside the UK. Otherwise they are printed in Canada and posted from there, which takes longer. Your quote says which applies.',
    who=[('Letting agents and landlords','Send notices to many tenants at once, with a record of what went out and when.'),
         ('Solicitors and service firms','Client letters and documents posted in batches, in the UK and to Canada.'),
         ('Small businesses','Invoices, statements, renewals and thank-you letters, printed and posted without a printer in the office.'),
         ('Charities, schools and clubs','Appeals, receipts and invitations to a membership list.'),
         ('Marketers','Postcards to a local list, sent in one batch.')],
    dests=['Mostly within the UK','Mostly Canada','A mix of UK and Canada','Other countries too'],
    pricing='Volume pricing is quoted per job: send us the quantity and where the pieces are going and we reply with an exact total in pounds.',
    single='/send?to=GB&cur=GBP', single_label='Send a single letter →'),
  'au': dict(
    lang='en-AU', cc='au', place='Australia', title='Business Mail in Australia: Letters and Postcards at Volume | Letterhome',
    desc='Printed, addressed and posted for your Australian business: letters and postcards at volume, address-checked. Request a quote.',
    h1='Print and post at volume,<br><em>without a print shop.</em>',
    sub='Letters, postcards and more, printed, addressed and posted for you, in Australia and abroad. One list in, every piece checked and posted.',
    where='Where our Australian printing is running, your pieces are printed and posted inside Australia. Otherwise they are printed in Canada and posted from there, which takes longer. Your quote says which applies.',
    who=[('Property managers and landlords','Send notices to many tenants at once, with a record of what went out and when.'),
         ('Law practices and service firms','Client letters and documents posted in batches, in Australia and to Canada.'),
         ('Small businesses','Invoices, statements, renewals and thank-you letters, printed and posted without a printer in the office.'),
         ('Charities, schools and clubs','Appeals, receipts and invitations to a membership list.'),
         ('Marketers','Postcards to a local list, sent in one batch.')],
    dests=['Mostly within Australia','Mostly Canada','A mix of Australia and Canada','Other countries too'],
    pricing='Volume pricing is quoted per job: send us the quantity and where the pieces are going and we reply with an exact total in Australian dollars.',
    single='/send?to=AU&cur=AUD', single_label='Send a single letter →'),
}

PRODUCTS = [
  ('Letters', 'Available now', 'Your text or your own PDF and Word files, printed in black and white or colour, folded and sealed in a window envelope. Every recipient address is checked before printing.'),
  ('Postcards', 'By quote', 'Postcards printed and mailed in a batch to your list. Tell us the size and quantity and we confirm what we can do and the price before anything prints.'),
  ('Mailing lists', 'Available now', 'Send a spreadsheet with one row per recipient. We merge names and details into your letter and check each address before it prints.'),
  ('Mail services', 'Where offered', 'Registered, certified or express mail on routes where it is offered, when you need proof of delivery.'),
  ('Scheduled mailings', 'Available now', 'Pick the date your batch goes to print, so notices and renewals leave when they should.'),
  ('Self-mailers and snap packs', 'Coming soon', 'Folded self-mailers and snap-pack forms are on our list. Tell us what you would use them for and we will let you know when they are ready.'),
]
STEPS = [
  'Tell us what you need to send, roughly how many pieces, and where they are going.',
  'We reply within one business day with an exact total and a secure payment link. Nothing prints until you agree.',
  'You send the document and the recipient list. We check every address and look over the batch before printing.',
  'Everything is printed and mailed, and we email you when your pieces go out.',
]

def esc(s): return html.escape(s, quote=True)

def build(key):
    c = COUNTRIES[key]
    url = BASE + PATHS[key]
    alts = ''.join(f'<link rel="alternate" hreflang="{l}" href="{BASE + PATHS[k]}">\n' for l, k in HREFLANG)
    alts += f'<link rel="alternate" hreflang="x-default" href="{BASE + PATHS["ca"]}">\n'
    ld = '{"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":"%s","url":"%s","name":"%s","description":"%s","isPartOf":{"@id":"https://letterhome.ca/#website"},"inLanguage":"%s"}]}' % (url, url, esc(c['title'].split(' | ')[0]), esc(c['desc']), c['lang'])
    ctry_attr = f' data-country="{c["cc"]}"' if c['cc'] else ''
    extra_css = ('<link rel="stylesheet" href="/country-order.css?v=2">\n' if c['cc'] else '')
    hero_css = ('html[data-country] body .hero{background:var(--red) !important;color:#fff !important}'
                'html[data-country] body .hero h1,html[data-country] body .hero h1 em{color:#fff !important;font-style:normal !important}'
                'html[data-country] body .hero-eyebrow{color:rgba(255,255,255,.8) !important}html[data-country] body .hero-sub{color:rgba(255,255,255,.92) !important}'
                'html[data-country] .pill{background:var(--red)}' if c['cc'] else '')
    cards = ''.join(f'<div class="audience-card"><span class="pill{" soon" if st=="Coming soon" else ""}">{esc(st)}</span><strong>{esc(n)}</strong><p>{esc(d)}</p></div>' for n, st, d in PRODUCTS)
    who = ''.join(f'<div class="audience-card"><strong>{esc(n)}</strong><p>{esc(d)}</p></div>' for n, d in c['who'])
    steps = ''.join(f'<li>{esc(s)}</li>' for s in STEPS)
    dests = ''.join(f'<option>{esc(d)}</option>' for d in c['dests'])
    faq = [
      ('Is there a minimum order?', 'No. A single letter works from the send page. Batches of ten or more pieces are quoted individually so you get the best total.'),
      ('How long does it take?', 'Pieces go to print within two business days of your approval. Delivery is typically up to two weeks within the destination country and up to four weeks internationally.'),
      ('Can I use my own files?', 'Yes. Send PDF or Word files, or plain text, and we lay out and print them. Colour printing is available.'),
      ('Do I need an account?', 'No. We can also set up a business account for regular senders so you can upload batches yourself. Ask when you request your quote.'),
      ('What do you check before printing?', 'Every recipient address is checked for delivery problems, and every batch is reviewed before it is printed. We do not mail threats, scams or illegal content.'),
    ]
    faq_html = ''.join(f'<details class="faq-item"><summary class="faq-q">{esc(q)}</summary><p class="faq-a">{esc(a)}</p></details>' for q, a in faq)
    faq_ld = ',{"@type":"FAQPage","mainEntity":[' + ','.join('{"@type":"Question","name":"%s","acceptedAnswer":{"@type":"Answer","text":"%s"}}' % (esc(q), esc(a)) for q, a in faq) + ']}'
    ld = ld[:-2] + faq_ld + ']}'
    return f'''<!DOCTYPE html>
<html lang="{c['lang']}" data-en-only{ctry_attr}>
<head>
<meta charset="UTF-8">
<link rel="preload" as="font" type="font/woff2" href="/fonts/vEFI2_tTDB4M7-auWDN0ahZJW1gb8tc.woff2" crossorigin>
<link rel="dns-prefetch" href="https://www.googletagmanager.com">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="/ga.js" defer></script>
<script src="/cookie-consent.js?v=11" defer></script>
<title>{esc(c['title'])}</title>
<meta name="description" content="{esc(c['desc'])}">
<link rel="canonical" href="{url}">
{alts}<link rel="icon" type="image/png" href="/favicon.png">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#faf8f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="{esc(c['title'])}">
<meta property="og:description" content="{esc(c['desc'])}">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<meta property="og:image" content="https://letterhome.ca/og-image.jpg?v=4">
<meta property="og:site_name" content="Letterhome">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
{ld}
</script>
<link rel="stylesheet" href="/fonts.css?v=2">
<style>{STYLE}
.pill{{display:inline-block;background:var(--ink);color:var(--paper);font-family:'Roboto',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:3px 8px;border-radius:2px;margin-bottom:10px}}
.pill.soon{{background:transparent;color:var(--ink-muted);border:1px solid var(--line)}}
.steps-list{{list-style:none;counter-reset:s;margin:16px 0}}
.steps-list li{{counter-increment:s;display:flex;gap:14px;margin-bottom:12px;font-size:15px;color:var(--ink-soft)}}
.steps-list li::before{{content:counter(s);flex:none;width:26px;height:26px;border-radius:50%;background:var(--red);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center}}
.faq-item{{background:var(--paper);border:1px solid var(--line);border-radius:2px;padding:14px 18px;margin-bottom:8px}}
.faq-q{{cursor:pointer;font-weight:600;font-size:15px}}
.faq-a{{margin:10px 0 0 !important;font-size:14px !important}}
.cta-line{{margin-top:32px}}
.main{{max-width:860px}}
{hero_css}
</style>
{THEME_SCRIPT}
<link rel="stylesheet" href="/theme.css?v=24">
<link rel="stylesheet" href="/guide.css?v=8">
<link rel="stylesheet" href="/redesign.css?v=28"><link rel="stylesheet" href="/inner.css?v=7">
{extra_css}</head>
<body>
<a href="#main-content" class="skip-link" style="position:absolute;left:-9999px;top:4px;z-index:9999;background:#a8472d;color:#faf6ec;padding:8px 16px;font-size:14px;font-family:Georgia,serif;text-decoration:none;border-radius:2px" onfocus="this.style.left='4px'" onblur="this.style.left='-9999px'">Skip to main content</a>
<div id="site-header"></div>
<script src="/header.js?v=13"></script>

<div class="hero" id="main-content">
  <p class="hero-eyebrow">For business</p>
  <h1>{c['h1']}</h1>
  <p class="hero-sub">{esc(c['sub'])}</p>
</div>

<div class="main">
  <h2>What we mail for businesses</h2>
  <p>{esc(c['where'])}</p>
  <div class="audience-grid">{cards}</div>

  <h2>How it works</h2>
  <ol class="steps-list">{steps}</ol>

  <h2>Who uses it</h2>
  <div class="audience-grid">{who}</div>

  <h2>Pricing</h2>
  <p>{c['pricing']}</p>

  <h2>Common questions</h2>
  {faq_html}

  <div class="contact-form" id="quote">
    <h3>Request a quote</h3>
    <p class="sub">Tell us what you need to send and we will reply within one business day with an exact total.</p>
    <div class="field"><label for="biz-name">Your name</label><input type="text" id="biz-name" autocomplete="name"></div>
    <div class="field"><label for="biz-company">Business name</label><input type="text" id="biz-company" autocomplete="organization"></div>
    <div class="field"><label for="biz-email">Email</label><input type="email" id="biz-email" autocomplete="email"></div>
    <div class="field"><label for="biz-phone">Phone (optional)</label><input type="tel" id="biz-phone" autocomplete="tel"></div>
    <div class="field"><label for="biz-product">What do you want to mail?</label>
      <select id="biz-product"><option value="">Select…</option><option>Letters</option><option>Postcards</option><option>Letters and postcards</option><option>Self-mailers or snap packs (when available)</option><option>Not sure yet</option></select></div>
    <div class="field"><label for="biz-qty">About how many pieces?</label>
      <select id="biz-qty"><option value="">Select…</option><option>Under 10</option><option>10 to 49</option><option>50 to 249</option><option>250 to 999</option><option>1,000 or more</option></select></div>
    <div class="field"><label for="biz-dest">Where are they going?</label>
      <select id="biz-dest"><option value="">Select…</option>{dests}</select></div>
    <div class="field"><label for="biz-details">Details</label><textarea id="biz-details" placeholder="e.g. a one-page notice to 120 tenants, black and white, mailed on the 1st of each month."></textarea></div>
    <button class="submit-btn" id="biz-submit" onclick="submitBizForm()">Request a quote →</button>
    <div id="form-success">Thanks. We will reply within one business day with the exact total and a payment link.</div>
  </div>

  <p class="cta-line">Only need to send one? <a href="{c['single']}">{esc(c['single_label'])}</a></p>
</div>

<footer id="site-footer"></footer>
<script src="/footer.js?v=18" defer></script>
<script src="/theme.js?v=4" defer></script>
<script src="/lang.js?v=54" defer></script>
<script>
async function submitBizForm() {{
  const v = id => document.getElementById(id).value.trim();
  const name = v('biz-name'), company = v('biz-company'), email = v('biz-email'), phone = v('biz-phone'),
        product = v('biz-product'), qty = v('biz-qty'), dest = v('biz-dest'), details = v('biz-details');
  if (!name || !company || !email || !product || !qty || !dest || !details) {{ alert('Please fill in all fields except phone.'); return; }}
  const btn = document.getElementById('biz-submit');
  btn.disabled = true; btn.textContent = 'Sending…';
  const message = `BUSINESS QUOTE REQUEST ({key.upper()} site)\\n\\nBusiness: ${{company}}\\nPhone: ${{phone || 'not given'}}\\nProduct: ${{product}}\\nQuantity: ${{qty}}\\nDestination: ${{dest}}\\n\\n${{details}}`;
  try {{
    const res = await fetch('/api/contact', {{ method: 'POST', headers: {{ 'Content-Type': 'application/json' }}, body: JSON.stringify({{ name, email, message }}) }});
    if (!res.ok) throw new Error();
    document.getElementById('form-success').style.display = 'block';
    btn.style.display = 'none';
  }} catch {{
    btn.disabled = false; btn.textContent = 'Request a quote →';
    alert('Something went wrong. Please email us directly at support@letterhome.ca');
  }}
}}
</script>
</body>
</html>
'''

for k in COUNTRIES:
    open('public/' + FILES[k], 'w', encoding='utf-8').write(build(k))
    print('wrote public/' + FILES[k])
