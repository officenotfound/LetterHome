#!/usr/bin/env python3
"""Builds the four business pages (public/business.html, business-us.html, business-uk.html, business-au.html) from one template.
Run from the project root:  python3 scripts/build-business-pages.py
The country copy lives in COUNTRIES below; everything else is shared so the four pages stay in step."""
import re, html

SRC = open('public/bulk-mailing.html', encoding='utf-8').read()
STYLE = re.search(r'<style>(.*?)</style>', SRC, re.S).group(1)
THEME_SCRIPT = re.search(r'(<script>\(function\(\)\{try\{var m=window\.matchMedia.*?</script>)', SRC, re.S).group(1)

BASE = 'https://letterhome.ca'
PATHS = {'ca': '/business', 'us': '/us/business', 'uk': '/uk/business', 'au': '/au/business', 'us-es': '/us/es/business'}
FILES = {'ca': 'business.html', 'us': 'business-us.html', 'uk': 'business-uk.html', 'au': 'business-au.html'}
HREFLANG = [('en-CA', 'ca'), ('en-US', 'us'), ('es-US', 'us-es'), ('en-GB', 'uk'), ('en-AU', 'au')]

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
         ('Marketers','Postcards to a local list, sent in one batch.'),
         ('Real estate agents', 'Just listed and just sold postcards, open house invitations and market updates, sent to a neighbourhood list.')],
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
         ('Marketers','Postcards to a local list, sent in one batch.'),
         ('Real estate agents', 'Just listed and just sold postcards, open house invitations and market updates, sent to a neighbourhood list.')],
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
         ('Marketers','Postcards to a local list, sent in one batch.'),
         ('Estate agents', 'Just listed and just sold postcards, viewing invitations and market updates, sent to a local list.')],
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
         ('Marketers','Postcards to a local list, sent in one batch.'),
         ('Real estate agents', 'Just listed and just sold postcards, open home invitations and market updates, sent to a neighbourhood list.')],
    dests=['Mostly within Australia','Mostly Canada','A mix of Australia and Canada','Other countries too'],
    pricing='Volume pricing is quoted per job: send us the quantity and where the pieces are going and we reply with an exact total in Australian dollars.',
    single='/send?to=AU&cur=AUD', single_label='Send a single letter →'),
}

PRODUCTS = [
  ('Letters', 'Available now', 'Your text or your own PDF and Word files, printed in black and white or colour, folded and sealed in a window envelope. Every recipient address is checked before printing.'),
  ('Postcards', 'By quote', 'Postcards printed and mailed in a batch to your list. We can design them in-house, or print your own artwork. Tell us the size and quantity and we confirm what we can do and the price before anything prints.'),
  ('Mailing lists', 'Available now', 'Send a spreadsheet with one row per recipient. We merge names and details into your letter and check each address before it prints.'),
  ('Mail services', 'Where offered', 'Registered, certified or express mail on routes where it is offered, when you need proof of delivery.'),
  ('Scheduled mailings', 'Available now', 'Pick the date your batch goes to print, so notices and renewals leave when they should.'),
  ('Self-mailers and snap packs', 'Coming soon', 'Folded self-mailers and snap-pack forms are on our list. Tell us what you would use them for and we will let you know when they are ready.'),
]
STEPS = [
  'Tell us what you need to send, roughly how many pieces, and where they are going.',
  'We reply within one business day with an exact total and a secure payment link. Nothing prints until you agree.',
  'You send the document and the recipient list, or ask us to design your postcards. We check every address and look over the batch before printing.',
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
    extra_css = ('<link rel="stylesheet" href="/country-order.css?v=4">\n' if c['cc'] else '')
    hero_css = ('html[data-country] body .hero{background:var(--red) !important;color:#fff !important}'
                'html[data-country] body .hero h1,html[data-country] body .hero h1 em{color:#fff !important;font-style:normal !important}'
                'html[data-country] body .hero-eyebrow{color:rgba(255,255,255,.8) !important}html[data-country] body .hero-sub{color:rgba(255,255,255,.92) !important}'
                'html[data-country] .pill{background:var(--red)}' if c['cc'] else '')
    c = dict(c, mark={'ca':'Canada','us':'U.S.A.','uk':'U.K.','au':'Australia'}[key])
    LL = ' <a href="/landlord-notices">Landlord notices &rarr;</a>'
    extra = {'Postcards': ' <a href="/postcards">Postcard sizes and options &rarr;</a>'}
    cards = ''.join(f'<div class="bz-card{" soon" if st=="Coming soon" else ""}"><span class="bz-status">{esc(st)}</span><h3>{esc(n)}</h3><p>{esc(d)}{extra.get(n, "")}</p></div>' for n, st, d in PRODUCTS)
    who = ''.join(f'<div class="bz-use"><span class="n">{i+1:02d}</span><div><h3>{esc(n)}</h3><p>{esc(d)}{LL if i == 0 else ""}</p></div></div>' for i, (n, d) in enumerate(c['who']))
    steps = ''.join(f'<li>{esc(s)}</li>' for s in STEPS)
    dests = ''.join(f'<option>{esc(d)}</option>' for d in c['dests'])
    faq = [
      ('Is there a minimum order?', 'No. A single letter works from the send page. Batches of ten or more pieces are quoted individually so you get the best total.'),
      ('How long does it take?', 'Pieces go to print within two business days of your approval. Delivery is typically up to two weeks within the destination country and up to four weeks internationally.'),
      ('Can you design the postcards?', 'Yes. We can design them in-house, so you do not need a designer. Tell us what the postcard is for and send your logo and any photos, and we send a proof for your approval before anything prints. You can also send your own finished artwork.'),
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
<script src="/ga.js?v=2" defer></script>
<script src="/cookie-consent.js?v=12" defer></script>
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
.bz-wrap{{max-width:1120px;margin:0 auto;padding:0 24px}}
.bz-hero{{background:var(--paper);padding:64px 0 56px;position:relative;overflow:hidden}}
.bz-hero::after{{content:'';position:absolute;left:0;right:0;bottom:0;height:6px;background:repeating-linear-gradient(135deg,#c8483f 0 14px,transparent 14px 20px,#2f5d8a 20px 34px,transparent 34px 40px);opacity:.85}}
.bz-hero-in{{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:64px;align-items:center}}
.bz-kicker{{font-family:'Roboto',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--red);margin:0 0 16px}}
.bz-copy h1{{font-size:clamp(38px,5vw,60px)!important;line-height:1.04!important;text-align:left;margin:0 0 22px}}
.bz-copy h1 em{{color:var(--red)!important}}
.bz-lede{{font-size:18px;line-height:1.55;color:var(--ink-muted);max-width:520px;margin:0 0 30px}}
.bz-actions{{display:flex;flex-wrap:wrap;gap:20px;align-items:center}}
.bz-btn{{display:inline-block;background:var(--red);color:#fff!important;padding:16px 30px;font-family:'Roboto',monospace;font-size:13px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none!important;border:2px dashed rgba(255,255,255,.85);outline:2px solid var(--red);outline-offset:-1px}}
.bz-btn:hover{{background:var(--red-deep);outline-color:var(--red-deep)}}
.bz-second{{color:var(--ink)!important;font-weight:600;text-decoration:underline;text-underline-offset:4px}}
.bz-fine{{font-size:14px;color:var(--ink-muted);margin:18px 0 0}}
.bz-visual{{position:relative;max-width:460px;margin:0 auto;width:100%;padding:0 0 34px}}
.bz-env{{position:relative;background:#fbf7ec;border:1px solid rgba(0,0,0,.12);border-radius:2px;aspect-ratio:1.5;padding:22px 24px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 16px 32px -12px rgba(0,0,0,.18);color:#2b2622;font-family:'Roboto',monospace;font-size:11.5px;line-height:1.55}}
.bz-env.f{{transform:rotate(-2deg);z-index:3}}
.bz-env.b1{{position:absolute;inset:0 0 auto 0;transform:rotate(3deg) translate(14px,-8px);z-index:2;opacity:.9}}
.bz-env.b2{{position:absolute;inset:0 0 auto 0;transform:rotate(7deg) translate(28px,-14px);z-index:1;opacity:.75}}
.bz-env::before{{content:'';position:absolute;left:0;right:0;top:0;height:6px;background:repeating-linear-gradient(135deg,#c8483f 0 14px,transparent 14px 20px,#2f5d8a 20px 34px,transparent 34px 40px);opacity:.85}}
.bz-from{{opacity:.8}}
.bz-to{{position:absolute;left:24%;bottom:22%;font-size:13px;line-height:1.6}}
.bz-stamp{{position:absolute;right:20px;top:26px;width:52px;height:62px;border:1.5px solid var(--red);color:var(--red);display:flex;align-items:center;justify-content:center;background:rgba(168,71,45,.06)}}
.bz-pm{{position:absolute;right:58px;top:34px;width:74px;height:74px;border:1.5px solid rgba(43,38,34,.55);border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(-10deg);font-size:8px;letter-spacing:.06em;text-transform:uppercase;line-height:1.25;color:rgba(43,38,34,.7)}}
.bz-pm b{{font-family:'Archivo',serif;font-size:15px;letter-spacing:0;text-transform:none;font-weight:400}}
.bz-tag{{position:absolute;z-index:4;right:-6px;bottom:0;background:var(--paper);border:1px solid var(--line);border-left:4px solid var(--red);padding:10px 16px;box-shadow:0 12px 28px -12px rgba(0,0,0,.25);font-size:13px;line-height:1.4;color:var(--ink)}}
.bz-tag b{{display:block;font-family:'Archivo',sans-serif;font-size:20px;color:var(--ink)}}
.bz-proof{{background:var(--kraft);border-bottom:1px solid var(--line)}}
.bz-proof ul{{list-style:none;margin:0 auto;padding:20px 24px;max-width:1120px;display:flex;flex-wrap:wrap;gap:12px 40px;justify-content:space-between}}
.bz-proof li{{display:flex;align-items:center;gap:10px;font-size:14.5px;color:var(--ink-soft)}}
.bz-proof svg{{width:20px;height:20px;flex:none;fill:none;stroke:var(--red);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}}
.bz-sec{{padding:72px 0}}
.bz-sec.alt{{background:var(--kraft)}}
.bz-head{{max-width:640px;margin:0 0 36px}}
.bz-head h2{{margin:0 0 12px!important}}
.bz-head p{{margin:0;color:var(--ink-muted);font-size:17px}}
.bz-grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}}
.bz-card{{position:relative;background:var(--paper);border:1px solid var(--line);border-top:4px solid var(--ink);padding:22px 22px 24px;min-width:0}}
.bz-card.soon{{border-top-color:var(--ink-faint);border-style:dashed;border-top-style:solid}}
.bz-card h3{{margin:0 0 8px;font-size:19px}}
.bz-card p{{margin:0;font-size:15px;color:var(--ink-muted)}}
.bz-status{{display:inline-block;font-family:'Roboto',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--red);margin-bottom:10px}}
.bz-card.soon .bz-status{{color:var(--ink-faint)}}
.bz-steps{{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:28px;counter-reset:z}}
.bz-steps li{{counter-increment:z;border-top:2px solid var(--ink);padding-top:16px;font-size:15.5px;line-height:1.55;color:var(--ink-soft)}}
.bz-steps li::before{{content:'0' counter(z);display:block;font-family:'Archivo',sans-serif;font-weight:800;font-size:34px;line-height:1;color:var(--red);margin-bottom:12px}}
.bz-uses{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 56px}}
.bz-use{{display:flex;gap:16px;min-width:0}}
.bz-use .n{{font-family:'Roboto',monospace;font-size:12px;color:var(--ink-faint);padding-top:5px;flex:none}}
.bz-use h3{{margin:0 0 4px;font-size:18px}}
.bz-use p{{margin:0;color:var(--ink-muted);font-size:15px}}
.bz-price{{display:flex;gap:32px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--paper);border:1px solid var(--line);border-left:5px solid var(--red);padding:28px 32px;box-shadow:0 1px 2px rgba(42,42,42,.06),0 12px 32px -14px rgba(42,42,42,.16)}}
.bz-price div{{flex:1 1 380px;min-width:0}}
.bz-price h2{{margin:0 0 8px!important}}
.bz-price p{{margin:0;color:var(--ink-soft);font-size:16px;max-width:60ch}}
.bz-price p a{{color:var(--red)}}
.bz-faq{{max-width:820px}}
.bz-quote{{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:56px;align-items:start}}
.bz-quote h2{{margin:0 0 14px!important}}
.bz-quote .lead{{color:var(--ink-muted);font-size:17px;margin:0 0 22px}}
.bz-quote ul{{list-style:none;margin:0;padding:0;display:grid;gap:14px}}
.bz-quote li{{display:flex;gap:10px;font-size:15px;color:var(--ink-soft)}}
.bz-quote li svg{{width:20px;height:20px;flex:none;fill:none;stroke:var(--red);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;margin-top:2px}}
.bz-form{{position:relative;background:var(--paper);border:1px solid var(--line);padding:34px 30px 30px;box-shadow:0 1px 2px rgba(42,42,42,.06),0 16px 36px -16px rgba(42,42,42,.2);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px}}
.bz-form::before{{content:'';position:absolute;left:0;right:0;top:0;height:6px;background:repeating-linear-gradient(135deg,#c8483f 0 14px,transparent 14px 20px,#2f5d8a 20px 34px,transparent 34px 40px);opacity:.85}}
.bz-form .field{{margin:0;min-width:0}}
.bz-form .field.full{{grid-column:1/-1}}
.bz-form label{{display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--ink)}}
.bz-form input,.bz-form select,.bz-form textarea{{width:100%;box-sizing:border-box;padding:12px 13px;font-size:15px;border:1px solid var(--line);border-radius:2px;background:#fff;color:#2a2a2a}}
.bz-form textarea{{min-height:110px;resize:vertical}}
.bz-form input:focus,.bz-form select:focus,.bz-form textarea:focus{{outline:2px solid var(--red);outline-offset:1px;border-color:var(--red)}}
.bz-form .bz-btn{{grid-column:1/-1;justify-self:start;cursor:pointer}}
.bz-form .bz-btn:disabled{{opacity:.6;cursor:wait}}
#form-success{{display:none;grid-column:1/-1;background:var(--kraft);border-left:4px solid var(--red);padding:14px 16px;font-size:15px}}
.bz-foot{{margin:36px 0 0;font-size:15px;color:var(--ink-muted)}}
.bz-foot a{{color:var(--red)}}
.bz-sec-grid{{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}}
.bz-cert{{background:var(--paper);border:1px solid var(--line);padding:16px 16px 18px;min-width:0}}
.bz-cert svg{{width:22px;height:22px;fill:none;stroke:var(--red);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;margin-bottom:8px}}
.bz-cert strong{{display:block;font-family:'Archivo',sans-serif;font-size:16px;margin-bottom:4px;color:var(--ink)}}
.bz-cert span{{font-size:13.5px;line-height:1.45;color:var(--ink-muted)}}
.bz-secnote{{margin:22px 0 0;font-size:14.5px;color:var(--ink-muted);max-width:75ch}}
@media(max-width:900px){{.bz-sec-grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}
@media(max-width:600px){{.bz-sec-grid{{grid-template-columns:1fr}}}}
@media(max-width:900px){{.bz-hero-in,.bz-quote{{grid-template-columns:1fr;gap:40px}}.bz-visual{{max-width:380px}}.bz-grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}.bz-steps{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}
@media(max-width:600px){{.bz-hero{{padding:40px 0 44px}}.bz-sec{{padding:48px 0}}.bz-grid,.bz-uses,.bz-steps,.bz-form{{grid-template-columns:1fr}}.bz-form{{padding:30px 18px 22px}}.bz-price{{padding:22px 20px}}.bz-proof ul{{flex-direction:column}}}}
</style>
{THEME_SCRIPT}
<link rel="stylesheet" href="/theme.css?v=24">
<link rel="stylesheet" href="/guide.css?v=8">
<link rel="stylesheet" href="/redesign.css?v=29"><link rel="stylesheet" href="/inner.css?v=7">
{extra_css}</head>
<body>
<a href="#main-content" class="skip-link" style="position:absolute;left:-9999px;top:4px;z-index:9999;background:#a8472d;color:#faf6ec;padding:8px 16px;font-size:14px;font-family:'Noto Sans',system-ui,sans-serif;text-decoration:none;border-radius:2px" onfocus="this.style.left='4px'" onblur="this.style.left='-9999px'">Skip to main content</a>
<div id="site-header"><nav aria-label="Main"><a href="/">Letterhome</a> · <a href="/send">Send a letter</a> · <a href="/track">Track an order</a> · <a href="/guides">Guides</a> · <a href="/business">Business mail</a></nav></div>
<script src="/header.js?v=15"></script>

<main id="main-content">
<section class="bz-hero"><div class="bz-wrap bz-hero-in">
  <div class="bz-copy">
    <p class="bz-kicker">For business</p>
    <h1>{c['h1']}</h1>
    <p class="bz-lede">{esc(c['sub'])}</p>
    <div class="bz-actions"><a class="bz-btn" href="#quote">Request a quote</a><a class="bz-second" href="#what">See what we mail</a></div>
    <p class="bz-fine">We reply within one business day. Nothing prints until you agree to the price.</p>
  </div>
  <div class="bz-visual" aria-hidden="true">
    <div class="bz-env b2"></div><div class="bz-env b1"></div>
    <div class="bz-env f">
      <div class="bz-from">Your business<br>Your return address<br>On every envelope</div>
      <div class="bz-stamp"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7 15l3-4 2 3 2-2 3 3"/></svg></div>
      <div class="bz-to">Each name on your list<br>Each address checked<br>{esc(c['mark'].upper())}</div>
      <div class="bz-pm"><span>Mailed from</span><b>{esc(c['mark'])}</b><span>2026</span></div>
    </div>
    <div class="bz-tag"><b>One list in</b>every piece checked and mailed</div>
  </div>
</div></section>

<div class="bz-proof"><ul>
  <li><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6"/></svg>Every address checked before printing</li>
  <li><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 9h18"/></svg>A set price before anything prints</li>
  <li><svg viewBox="0 0 24 24"><path d="M4 8l8 5 8-5"/><rect x="3" y="5" width="18" height="14" rx="1.5"/></svg>An email when your pieces go out</li>
</ul></div>

<section class="bz-sec" id="what"><div class="bz-wrap">
  <div class="bz-head"><h2>What we mail for businesses</h2><p>{esc(c['where'])}</p></div>
  <div class="bz-grid">{cards}</div>
</div></section>

<section class="bz-sec alt"><div class="bz-wrap">
  <div class="bz-head"><h2>How it works</h2></div>
  <ol class="bz-steps">{steps}</ol>
</div></section>

<section class="bz-sec"><div class="bz-wrap">
  <div class="bz-head"><h2>Who uses it</h2></div>
  <div class="bz-uses">{who}</div>
</div></section>

<section class="bz-sec alt"><div class="bz-wrap">
  <div class="bz-head"><h2>Security and privacy</h2><p>Business mail often carries personal, financial or health information. The print and mail facility that produces your pieces follows these compliance standards:</p></div>
  <div class="bz-sec-grid">
    <div class="bz-cert"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg><strong>HIPAA</strong><span>US health information privacy</span></div>
    <div class="bz-cert"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg><strong>SOC 2 Type 2</strong><span>Independently audited security controls</span></div>
    <div class="bz-cert"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg><strong>PCI DSS</strong><span>Payment card data security</span></div>
    <div class="bz-cert"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg><strong>PIPEDA</strong><span>Canadian federal privacy law</span></div>
    <div class="bz-cert"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg><strong>PHIPA</strong><span>Ontario health information privacy</span></div>
  </div>
</div></section>

<section class="bz-sec"><div class="bz-wrap">
  <div class="bz-price"><div><h2>Pricing</h2><p>{c['pricing']}</p></div><a class="bz-btn" href="#quote">Request a quote</a></div>
</div></section>

<section class="bz-sec alt"><div class="bz-wrap bz-faq">
  <div class="bz-head"><h2>Common questions</h2></div>
  {faq_html}
</div></section>

<section class="bz-sec" id="quote"><div class="bz-wrap bz-quote">
  <div>
    <h2>Request a quote</h2>
    <p class="lead">Tell us what you need to send and we will reply within one business day with an exact total.</p>
    <ul>
      <li><svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>No minimum, no account needed</li>
      <li><svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>An exact total and a secure payment link</li>
      <li><svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>Nothing prints until you agree</li>
    </ul>
    <p class="bz-foot">Only need to send one? <a href="{c['single']}">{esc(c['single_label'])}</a></p>
  </div>
  <div class="bz-form">
    <div class="field"><label for="biz-name">Your name</label><input type="text" id="biz-name" autocomplete="name"></div>
    <div class="field"><label for="biz-company">Business name</label><input type="text" id="biz-company" autocomplete="organization"></div>
    <div class="field"><label for="biz-email">Email</label><input type="email" id="biz-email" autocomplete="email"></div>
    <div class="field"><label for="biz-phone">Phone (optional)</label><input type="tel" id="biz-phone" autocomplete="tel"></div>
    <div class="field"><label for="biz-product">What do you want to mail?</label>
      <select id="biz-product"><option value="">Select…</option><option>Letters</option><option>Postcards</option><option>Letters and postcards</option><option>Self-mailers or snap packs (when available)</option><option>Not sure yet</option></select></div>
    <div class="field"><label for="biz-qty">About how many pieces?</label>
      <select id="biz-qty"><option value="">Select…</option><option>Under 10</option><option>10 to 49</option><option>50 to 249</option><option>250 to 999</option><option>1,000 or more</option></select></div>
    <div class="field full"><label for="biz-dest">Where are they going?</label>
      <select id="biz-dest"><option value="">Select…</option>{dests}</select></div>
    <div class="field full"><label for="biz-details">Details</label><textarea id="biz-details" placeholder="e.g. a one-page notice to 120 tenants, black and white, mailed on the 1st of each month."></textarea></div>
    <button type="button" class="bz-btn" id="biz-submit" onclick="submitBizForm()">Request a quote →</button>
    <div id="form-success">Thanks. We will reply within one business day with the exact total and a payment link.</div>
  </div>
</div></section>
</main>

<footer id="site-footer"><nav aria-label="Site links" style="padding:24px;font-size:14px"><a href="/about">About</a> · <a href="/careers">Careers</a> · <a href="/contact">Contact</a> · <a href="/guides">Mailing guides</a> · <a href="/business">Business mail</a> · <a href="/monthly-letters">Monthly letters</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refund policy</a> · <a href="https://letterhome.ca/">Canada</a> · <a href="/us">United States</a> · <a href="/uk">United Kingdom</a> · <a href="/au">Australia</a></nav></footer>
<script src="/footer.js?v=21" defer></script>
<script src="/theme.js?v=4" defer></script>
<script src="/lang.js?v=57" defer></script>
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
    page = build(k)
    if k == 'us': page = page.replace('<p class="bz-fine">', '<p class="bz-fine"><a href="/us/es/business" hreflang="es-US" lang="es">Leer en español</a> · ', 1)
    open('public/' + FILES[k], 'w', encoding='utf-8').write(page)
    print('wrote public/' + FILES[k])

# ── Spanish US page (letterhome.us/es/business), translated from the US page ─────────────────────────────────────────────
ES = [
 ('For business', 'Para empresas'),
 ('Print and mail at volume,', 'Imprima y envíe por volumen,'),
 ('without a print shop.', 'sin pasar por una imprenta.'),
 ('Letters, postcards and more, printed, addressed and mailed for you, in the U.S. and abroad. One list in, every piece checked and mailed.', 'Cartas, postales y más: las imprimimos, les ponemos la dirección y las enviamos en su nombre, en EE. UU. y al extranjero. Usted nos manda una lista y nosotros revisamos y enviamos cada pieza.'),
 ('See what we mail', 'Vea lo que enviamos'),
 ('We reply within one business day. Nothing prints until you agree to the price.', 'Respondemos en un día hábil. No se imprime nada hasta que usted acepte el precio.'),
 ('Your business', 'Su empresa'), ('Your return address', 'Su dirección de remitente'), ('On every envelope', 'En cada sobre'),
 ('Each name on your list', 'Cada nombre de su lista'), ('Each address checked', 'Cada dirección revisada'), ('Mailed from', 'Enviado desde'),
 ('One list in', 'Una sola lista'), ('every piece checked and mailed', 'cada pieza revisada y enviada'),
 ('Every address checked before printing', 'Revisamos cada dirección antes de imprimir'),
 ('A set price before anything prints', 'Un precio fijo antes de imprimir'),
 ('An email when your pieces go out', 'Un correo cuando salen sus envíos'),
 ('What we mail for businesses', 'Lo que enviamos para empresas'),
 ('Where our U.S. printing is running, your pieces are printed and mailed inside the U.S. Otherwise they are printed in Canada and mailed from there, which takes longer. Your quote says which applies.', 'Donde nuestra impresión en EE. UU. está activa, sus envíos se imprimen y se envían dentro de EE. UU. Si no, se imprimen en Canadá y se envían desde allí, lo que tarda más. Su cotización indica cuál aplica.'),
 ('Available now', 'Disponible'), ('By quote', 'Con cotización'), ('Where offered', 'Donde se ofrece'), ('Coming soon', 'Próximamente'),
 ('Your text or your own PDF and Word files, printed in black and white or colour, folded and sealed in a window envelope. Every recipient address is checked before printing.', 'Su texto o sus propios archivos PDF y Word, impresos en blanco y negro o a color, doblados y cerrados en un sobre con ventana. Revisamos la dirección de cada destinatario antes de imprimir.'),
 ('Postcards printed and mailed in a batch to your list. We can design them in-house, or print your own artwork. Tell us the size and quantity and we confirm what we can do and the price before anything prints.', 'Postales impresas y enviadas en un solo lote a su lista. Podemos diseñarlas nosotros o imprimir su propio diseño. Díganos el tamaño y la cantidad y le confirmamos lo que podemos hacer y el precio antes de imprimir.'),
 ('Postcard sizes and options &rarr;', 'Tamaños y opciones de postales (en inglés) &rarr;'),
 ('Mailing lists', 'Listas de envío'),
 ('Send a spreadsheet with one row per recipient. We merge names and details into your letter and check each address before it prints.', 'Mándenos una hoja de cálculo con una fila por destinatario. Combinamos los nombres y datos en su carta y revisamos cada dirección antes de imprimir.'),
 ('Mail services', 'Servicios de correo'),
 ('Registered, certified or express mail on routes where it is offered, when you need proof of delivery.', 'Correo registrado, certificado o exprés en las rutas donde se ofrece, cuando necesita comprobante de entrega.'),
 ('Scheduled mailings', 'Envíos programados'),
 ('Pick the date your batch goes to print, so notices and renewals leave when they should.', 'Elija la fecha en que su lote se imprime, para que los avisos y las renovaciones salgan a tiempo.'),
 ('Self-mailers and snap packs', 'Autoenvíos y formularios sellados'),
 ('Folded self-mailers and snap-pack forms are on our list. Tell us what you would use them for and we will let you know when they are ready.', 'Los autoenvíos plegados y los formularios sellados (snap packs) están en nuestros planes. Cuéntenos para qué los usaría y le avisaremos cuando estén listos.'),
 ('How it works', 'Cómo funciona'),
 ('Tell us what you need to send, roughly how many pieces, and where they are going.', 'Díganos qué necesita enviar, cuántas piezas aproximadamente y a dónde van.'),
 ('We reply within one business day with an exact total and a secure payment link. Nothing prints until you agree.', 'Respondemos en un día hábil con el total exacto y un enlace de pago seguro. No se imprime nada hasta que usted acepte.'),
 ('You send the document and the recipient list, or ask us to design your postcards. We check every address and look over the batch before printing.', 'Usted nos manda el documento y la lista de destinatarios, o nos pide que diseñemos sus postales. Revisamos cada dirección y el lote completo antes de imprimir.'),
 ('Everything is printed and mailed, and we email you when your pieces go out.', 'Todo se imprime y se envía, y le escribimos cuando salen sus envíos.'),
 ('Who uses it', 'Quién lo usa'),
 ('Property managers and landlords', 'Administradores de propiedades y arrendadores'),
 ('Mail notices to many tenants at once, with a record of what went out and when.', 'Envíe avisos a muchos inquilinos a la vez, con un registro de lo que salió y cuándo.'),
 ('Landlord notices &rarr;', 'Avisos para inquilinos (en inglés) &rarr;'),
 ('Law offices and service firms', 'Despachos legales y empresas de servicios'),
 ('Client letters and documents mailed in batches, in the U.S. and to Canada.', 'Cartas y documentos para clientes enviados por lotes, en EE. UU. y a Canadá.'),
 ('Small businesses', 'Pequeñas empresas'),
 ('Invoices, statements, renewals and thank-you letters, printed and mailed without a printer in the office.', 'Facturas, estados de cuenta, renovaciones y cartas de agradecimiento, impresas y enviadas sin impresora en la oficina.'),
 ('Nonprofits, schools and clubs', 'Organizaciones sin fines de lucro, escuelas y clubes'),
 ('Appeals, receipts and invitations to a membership list.', 'Campañas de donación, recibos e invitaciones a su lista de miembros.'),
 ('Marketers', 'Mercadólogos'),
 ('Postcards to a local list, sent in one batch.', 'Postales a una lista local, enviadas en un solo lote.'),
 ('Real estate agents', 'Agentes inmobiliarios'),
 ('Just listed and just sold postcards, open house invitations and market updates, sent to a neighbourhood list.', 'Postales de "recién listada" y "recién vendida", invitaciones a casa abierta y novedades del mercado, enviadas a una lista del vecindario.'),
 ('Security and privacy', 'Seguridad y privacidad'),
 ('Business mail often carries personal, financial or health information. The print and mail facility that produces your pieces follows these compliance standards:', 'El correo de empresa suele llevar información personal, financiera o de salud. Las instalaciones de impresión y envío que producen sus piezas cumplen estas normas:'),
 ('US health information privacy', 'Privacidad de la información de salud en EE. UU.'),
 ('Independently audited security controls', 'Controles de seguridad auditados de forma independiente'),
 ('Payment card data security', 'Seguridad de los datos de tarjetas de pago'),
 ('Canadian federal privacy law', 'Ley federal de privacidad de Canadá'),
 ('Ontario health information privacy', 'Privacidad de la información de salud en Ontario'),
 ('<h2>Pricing</h2>', '<h2>Precios</h2>'),
 ('Volume pricing is quoted per job: send us the quantity and where the pieces are going and we reply with an exact total in U.S. dollars.', 'Los precios por volumen se cotizan por trabajo: díganos la cantidad y a dónde van las piezas y le respondemos con el total exacto en dólares estadounidenses.'),
 ('Common questions', 'Preguntas frecuentes'),
 ('Is there a minimum order?', '¿Hay un pedido mínimo?'),
 ('No. A single letter works from the send page. Batches of ten or more pieces are quoted individually so you get the best total.', 'No. Una sola carta se envía desde la página de envío. Los lotes de diez piezas o más se cotizan por separado para darle el mejor total.'),
 ('How long does it take?', '¿Cuánto tarda?'),
 ('Pieces go to print within two business days of your approval. Delivery is typically up to two weeks within the destination country and up to four weeks internationally.', 'Las piezas se imprimen en un plazo de dos días hábiles después de su aprobación. La entrega suele tardar hasta dos semanas dentro del país de destino y hasta cuatro semanas a otros países.'),
 ('Can you design the postcards?', '¿Pueden diseñar las postales?'),
 ('Yes. We can design them in-house, so you do not need a designer. Tell us what the postcard is for and send your logo and any photos, and we send a proof for your approval before anything prints. You can also send your own finished artwork.', 'Sí. Podemos diseñarlas nosotros, así que no necesita un diseñador. Díganos para qué es la postal y mándenos su logotipo y fotos, y le enviamos una prueba para su aprobación antes de imprimir. También puede mandar su propio diseño terminado.'),
 ('Can I use my own files?', '¿Puedo usar mis propios archivos?'),
 ('Yes. Send PDF or Word files, or plain text, and we lay out and print them. Colour printing is available.', 'Sí. Mande archivos PDF o Word, o texto simple, y nosotros les damos formato y los imprimimos. Hay impresión a color.'),
 ('Do I need an account?', '¿Necesito una cuenta?'),
 ('No. We can also set up a business account for regular senders so you can upload batches yourself. Ask when you request your quote.', 'No. También podemos crear una cuenta de empresa para quienes envían con frecuencia, para que suba sus lotes usted mismo. Pregúntelo al pedir su cotización.'),
 ('What do you check before printing?', '¿Qué revisan antes de imprimir?'),
 ('Every recipient address is checked for delivery problems, and every batch is reviewed before it is printed. We do not mail threats, scams or illegal content.', 'Revisamos cada dirección para detectar problemas de entrega, y cada lote se revisa antes de imprimirse. No enviamos amenazas, estafas ni contenido ilegal.'),
 ('Tell us what you need to send and we will reply within one business day with an exact total.', 'Díganos qué necesita enviar y le responderemos en un día hábil con el total exacto.'),
 ('No minimum, no account needed', 'Sin mínimo y sin cuenta'),
 ('An exact total and a secure payment link', 'Un total exacto y un enlace de pago seguro'),
 ('Nothing prints until you agree', 'No se imprime nada hasta que usted acepte'),
 ('Only need to send one?', '¿Solo necesita enviar una?'),
 ('Send a single letter →', 'Enviar una sola carta →'),
 ('>Your name<', '>Su nombre<'), ('>Business name<', '>Nombre de la empresa<'), ('>Email<', '>Correo electrónico<'), ('>Phone (optional)<', '>Teléfono (opcional)<'),
 ('What do you want to mail?', '¿Qué quiere enviar?'), ('Select…', 'Elija…'),
 ('<option>Letters</option>', '<option value="Letters">Cartas</option>'), ('<option>Postcards</option>', '<option value="Postcards">Postales</option>'),
 ('<option>Letters and postcards</option>', '<option value="Letters and postcards">Cartas y postales</option>'),
 ('<option>Self-mailers or snap packs (when available)</option>', '<option value="Self-mailers or snap packs">Autoenvíos o formularios sellados (cuando estén disponibles)</option>'),
 ('<option>Not sure yet</option>', '<option value="Not sure yet">Todavía no lo sé</option>'),
 ('About how many pieces?', '¿Cuántas piezas, aproximadamente?'),
 ('<option>Under 10</option>', '<option value="Under 10">Menos de 10</option>'), ('<option>10 to 49</option>', '<option value="10 to 49">10 a 49</option>'),
 ('<option>50 to 249</option>', '<option value="50 to 249">50 a 249</option>'), ('<option>250 to 999</option>', '<option value="250 to 999">250 a 999</option>'),
 ('<option>1,000 or more</option>', '<option value="1,000 or more">1,000 o más</option>'),
 ('Where are they going?', '¿A dónde van?'),
 ('<option>Mostly within the U.S.</option>', '<option value="Mostly within the U.S.">Sobre todo dentro de EE. UU.</option>'),
 ('<option>Mostly Canada</option>', '<option value="Mostly Canada">Sobre todo a Canadá</option>'),
 ('<option>A mix of U.S. and Canada</option>', '<option value="A mix of U.S. and Canada">EE. UU. y Canadá</option>'),
 ('<option>Other countries too</option>', '<option value="Other countries too">También otros países</option>'),
 ('>Details<', '>Detalles<'),
 ('e.g. a one-page notice to 120 tenants, black and white, mailed on the 1st of each month.', 'p. ej., un aviso de una página a 120 inquilinos, en blanco y negro, enviado el día 1 de cada mes.'),
 ('Thanks. We will reply within one business day with the exact total and a payment link.', 'Gracias. Le responderemos en un día hábil con el total exacto y un enlace de pago.'),
 ("alert('Please fill in all fields except phone.')", "alert('Complete todos los campos, excepto el teléfono.')"),
 ("btn.textContent = 'Sending…'", "btn.textContent = 'Enviando…'"),
 ("alert('Something went wrong. Please email us directly at support@letterhome.ca')", "alert('Algo salió mal. Escríbanos directamente a support@letterhome.ca')"),
 ('BUSINESS QUOTE REQUEST (US site)', 'BUSINESS QUOTE REQUEST (US site, Spanish)'),
 ("'Request a quote →'", "'Pedir cotización →'"), ('Request a quote →', 'Pedir cotización →'),
 ('Request a quote', 'Pedir cotización'),
]
ES_TITLE = 'Correo para empresas en EE. UU.: cartas y postales por volumen | Letterhome'
ES_DESC = 'Imprimimos, ponemos dirección y enviamos el correo de su empresa: cartas y postales por volumen, con direcciones revisadas. Pida una cotización.'

def build_us_es():
    en = build('us')
    en_title = COUNTRIES['us']['title']; en_desc = COUNTRIES['us']['desc']
    t = en.replace(esc(en_title), esc(ES_TITLE)).replace(esc(en_desc), esc(ES_DESC)).replace(en_title, ES_TITLE).replace(en_desc, ES_DESC)
    for a, b in ES:
        if a not in t: raise SystemExit(f'Spanish page: text not found in the US page: {a[:70]}')
        t = t.replace(a, b)
    t = t.replace('<html lang="en-US" data-en-only', '<html lang="es-US" data-en-only', 1)
    t = t.replace(f'<link rel="canonical" href="{BASE}/us/business">', f'<link rel="canonical" href="{BASE}/us/es/business">', 1)
    t = t.replace(f'<meta property="og:url" content="{BASE}/us/business">', f'<meta property="og:url" content="{BASE}/us/es/business">', 1)
    t = t.replace('"@id":"%s/us/business","url":"%s/us/business"' % (BASE, BASE), '"@id":"%s/us/es/business","url":"%s/us/es/business"' % (BASE, BASE), 1)
    t = t.replace('"inLanguage":"en-US"', '"inLanguage":"es-US"', 1)
    t = t.replace('<meta property="og:locale" content="en_US">', '<meta property="og:locale" content="es_US">')
    t = t.replace('<p class="bz-fine">', '<p class="bz-fine"><a href="/us/business" hreflang="en-US" lang="en">Read in English</a> · ', 1)
    leftovers = [w for w in ['What we mail', 'How it works', 'Who uses it', 'Common questions', 'Your name', 'Business name', 'Request a quote'] if w in t]
    if leftovers: raise SystemExit(f'Spanish page still has English: {leftovers}')
    return t

open('public/business-us-es.html', 'w', encoding='utf-8').write(build_us_es())
print('wrote public/business-us-es.html')
