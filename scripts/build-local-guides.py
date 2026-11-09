#!/usr/bin/env python3
"""Builds the everyday-mail guides for the US and UK sites (public/us-<slug>.html, public/uk-<slug>.html).
Each page borrows its header, theme and footer from an existing guide for that country, so it matches the site.
Run from the project root:  python3 scripts/build-local-guides.py
Facts were checked on 2026-11-09 against the sources listed on each page. Re-check them before changing dates or prices."""
import html, json, re

BASE = 'https://letterhome.ca'
TEMPLATE = {'us': 'public/how-to-send-mail-to-canada-from-us.html', 'uk': 'public/how-to-send-mail-to-usa-from-uk.html'}
LANG = {'us': 'en-US', 'uk': 'en-GB'}
LOCALE = {'us': 'en_US', 'uk': 'en_GB'}
VERB = {'us': 'mail', 'uk': 'post'}
SEND = {'us': '/send?to=US', 'uk': '/send?to=GB'}
PUBLISHED = '2026-11-09'

def esc(s): return html.escape(s, quote=True)
def strip(s): return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', s)).strip()

PAGES = [
# ───────────────────────────── US ─────────────────────────────
dict(c='us', slug='how-long-does-mail-take',
 title='How Long Does Mail Take in the US? (2026)',
 desc='USPS First-Class Mail takes 1 to 5 days to arrive. What sets the number of days, what changed in 2025 and how to send a letter without a printer.',
 eyebrow='Everyday mail', h1='How long does mail take<br><em>in the US?</em>',
 sub='A First-Class letter takes 1 to 5 days. Here is what decides which end of that range yours lands on.',
 answer='USPS aims to deliver First-Class Mail in 1 to 5 days. Letters within the same area often arrive in 1 to 2 days; letters across the country can take 4 or 5.',
 body='''
<h2>The short answer</h2>
<p>USPS sets a "service standard" for First-Class Mail of 1 to 5 days. That is a target, not a promise. A birthday card mailed across town will usually land in a day or two. A letter from Maine to Arizona sits at the slow end, around 4 or 5 days.</p>
<p>Days are counted as delivery days. USPS delivers letters Monday through Saturday, so a letter mailed on a Friday afternoon is unlikely to arrive before Monday or Tuesday.</p>

<h2>What decides the number of days</h2>
<p>Three things matter most: the distance between the two processing plants, the time you drop the letter off, and whether it has to travel by truck or plane.</p>
<p>Mail is sorted at regional processing plants, not at your local post office. A letter collected after the day's last pickup waits until the next day before it moves at all. Long trips between plants are mostly done by truck now, which is part of why cross-country letters take longer than they did a decade ago.</p>

<h2>What changed in 2025</h2>
<p>In 2025 USPS changed how it moves mail between plants. It kept the 1 to 5 day range, but moved some routes within it. By its own count, about 75% of First-Class Mail kept the same standard, 14% got faster and 11% got slower. Some rural areas had a day added.</p>
<p>If you want the exact standard between two ZIP codes, USPS publishes a service standards lookup on usps.com.</p>

<h2>Can you track a letter?</h2>
<p>Not a stamped one. An ordinary First-Class letter has no tracking number. If you need proof that a letter was delivered, use Certified Mail at the post office counter. It costs more, but you get a receipt and delivery tracking.</p>

<h2>Sending a letter without a printer or stamps</h2>
<p>If you don't have a printer or stamps at home, you can type the letter on our site and we print it, put it in an envelope and mail it. A letter within the US is $3.00, with printing, the envelope and postage included.</p>
<p>We send letters within two business days of your order. Where our US printing is running, your letter is printed and mailed inside the US. Otherwise it is printed in Canada and mailed from there, which takes longer. The order page tells you which applies before you pay.</p>
''',
 faq=[('How long does a letter take to arrive in the US?', 'USPS aims to deliver First-Class Mail in 1 to 5 days. Letters within the same region often take 1 to 2 days, and letters across the country can take 4 or 5.'),
      ('Does USPS deliver letters on Saturday?', 'Yes. USPS delivers letters Monday through Saturday. Sunday delivery is limited to some packages.'),
      ('Can I track a letter sent with a stamp?', 'No. A stamped First-Class letter has no tracking. Certified Mail, bought at the post office counter, gives you a receipt and delivery tracking.')],
 sources=[('USPS: service standard changes, FAQ (updated February 2026)', 'https://about.usps.com/what/strategic-plans/delivering-for-america/assets/service-standard-changes-faqs-2026.pdf'),
          ('USPS: service standard changes, fact sheet', 'https://about.usps.com/what/strategic-plans/delivering-for-america/assets/service-standard-changes-fact-sheet.pdf')],
 related=[('/us/how-much-is-a-stamp', 'How much is a stamp in 2026?', 'The Forever stamp price and what it covers'), ('/us/return-address-on-a-letter', 'Do you need a return address?', 'When USPS needs one and when it doesn\'t'), ('/send-a-letter-online-in-the-usa', 'Send a letter online in the US', 'Type it, we print and mail it'), ('/us/how-to-send-mail-to-canada-from-us', 'Mail a letter to Canada', 'From the US, no stamps needed')]),

dict(c='us', slug='how-much-is-a-stamp',
 title='How Much Is a Stamp in 2026? Forever Price',
 desc='A Forever stamp costs 82 cents since July 12, 2026, up from 78 cents. What it covers, why old Forever stamps still work, and what the next change may be.',
 eyebrow='Everyday mail', h1='How much is a stamp<br><em>in 2026?</em>',
 sub='A Forever stamp costs 82 cents. What it covers, and how the price got there.',
 answer='A First-Class Forever stamp costs 82 cents. The price went up from 78 cents on July 12, 2026. One stamp covers a standard letter up to 1 ounce.',
 body='''
<h2>The current price</h2>
<p>A Forever stamp costs <strong>82 cents</strong>. USPS raised it from 78 cents on July 12, 2026, as part of an average increase of about 4.8% across its mailing prices. The Postal Regulatory Commission approved the change in May.</p>
<p>One Forever stamp pays for a standard First-Class letter weighing up to 1 ounce. That is about four or five sheets of ordinary paper in a regular envelope. Heavier letters and large or stiff envelopes need extra postage, so weigh them at the counter if you're not sure.</p>

<h2>How the price has moved</h2>
<p>Stamps have gone up most years recently. The Forever stamp was 73 cents before July 2025, 78 cents from July 2025, and 82 cents from July 2026. USPS has said it wants another increase in January 2027 instead of waiting until July, but that needs approval first.</p>

<h2>Old Forever stamps still work</h2>
<p>A Forever stamp has no price printed on it. Whatever you paid, it is worth the current one-ounce First-Class price on the day you use it. A sheet bought at 73 cents still mails a letter today. Stamps with a printed value are different: they're worth what's printed, and you add stamps to make up the difference.</p>

<h2>When a stamp isn't the cheapest option</h2>
<p>For one letter, a stamp is the cheapest way to mail it if you already have a printer, an envelope and stamps at home. If you don't, the costs add up quickly. We print the letter, put it in an envelope and mail it for $3.00 within the US, with postage included.</p>
''',
 faq=[('How much is a Forever stamp right now?', 'A Forever stamp costs 82 cents. The price went up from 78 cents on July 12, 2026.'),
      ('Do Forever stamps expire?', 'No. A Forever stamp is always worth the current price of a one-ounce First-Class letter, whenever you bought it.'),
      ('How many stamps does a letter need?', 'One Forever stamp covers a standard letter up to 1 ounce. Heavier, larger or stiff envelopes need extra postage.')],
 sources=[('Money: stamp price increase, July 2026', 'https://money.com/stamp-price-increase-july-2026/'),
          ('Federal stamp price history (checked November 2026)', 'https://fedratecalc.com/stamp-price-increase/'),
          ('Saving Advice: USPS changes in 2026', 'https://www.savingadvice.com/articles/2026/08/17/10744069_usps-changes-in-2026-what-customers-should-know-about-higher-prices-and-possible-closures.html')],
 related=[('/us/how-long-does-mail-take', 'How long does mail take?', 'First-Class delivery times in 2026'), ('/us/return-address-on-a-letter', 'Do you need a return address?', 'When USPS needs one and when it doesn\'t'), ('/send-a-letter-online-in-the-usa', 'Send a letter online in the US', 'Type it, we print and mail it'), ('/us/how-to-send-mail-to-uk-from-us', 'Mail a letter to the UK', 'From the US, no stamps needed')]),

dict(c='us', slug='return-address-on-a-letter',
 title='Do You Need a Return Address? US Rules',
 desc='USPS doesn\'t require a return address on an ordinary stamped letter. When you do need one, where it goes, and what happens to a letter without one.',
 eyebrow='Everyday mail', h1='Do you need a return address<br><em>on a letter?</em>',
 sub='For an ordinary stamped letter, no. For some USPS services, yes.',
 answer='USPS doesn\'t require a return address on an ordinary First-Class letter with stamps. You need one for Priority Mail, Priority Mail Express and some other services, and without one an undeliverable letter can\'t come back to you.',
 body='''
<h2>The rule for an ordinary letter</h2>
<p>You can mail a stamped First-Class letter without a return address. USPS will still deliver it as long as the delivery address and postage are right.</p>
<p>The catch comes if the letter can't be delivered. With a return address, USPS sends it back to you. Without one, it goes to the USPS Mail Recovery Center, where staff may open it to look for a name or address inside. If they can't find one, you won't see the letter again.</p>

<h2>When USPS does need one</h2>
<p>A return address is required in some cases, including:</p>
<ul>
<li>Priority Mail and Priority Mail Express</li>
<li>Mail with an endorsement such as "Return Service Requested" or "Address Service Requested"</li>
<li>Mail paid with a permit imprint or precanceled stamps</li>
</ul>
<p>Businesses mailing in bulk usually fall into one of these, which is why almost every bill and statement you get has a return address.</p>

<h2>Where it goes</h2>
<p>Put the return address in the upper left corner of the front of the envelope, on the same side as the delivery address. Use the same layout as the delivery address: name, street, then city, state and ZIP code on one line.</p>

<h2>Sending a letter without your address on it</h2>
<p>Some people leave their address off for privacy, or because they're between homes. You can do that with a letter you write on our site too. If you leave yours off, the envelope carries our return address instead, so the letter still looks complete. We don't forward letters that come back to us, so only leave it off if you don't need the letter returned.</p>
''',
 faq=[('Is a return address required on a letter in the US?', 'Not on an ordinary stamped First-Class letter. It is required for Priority Mail, Priority Mail Express, mail with endorsements such as Return Service Requested, and some bulk mail.'),
      ('What happens to a letter with no return address that can\'t be delivered?', 'It goes to the USPS Mail Recovery Center, where it may be opened to look for an address. If none is found, it isn\'t returned.'),
      ('Where do you write the return address?', 'In the upper left corner of the front of the envelope, on the same side as the delivery address.')],
 sources=[('USPS Postal Explorer: Domestic Mail Manual, addressing (archived section 602)', 'https://pe.usps.com/archive/html/dmmarchive20130127/202.htm')],
 related=[('/us/how-long-does-mail-take', 'How long does mail take?', 'First-Class delivery times in 2026'), ('/us/how-much-is-a-stamp', 'How much is a stamp in 2026?', 'The Forever stamp price and what it covers'), ('/send-a-letter-online-in-the-usa', 'Send a letter online in the US', 'Type it, we print and mail it'), ('/us/how-to-send-mail-to-canada-from-us', 'Mail a letter to Canada', 'From the US, no stamps needed')]),

# ───────────────────────────── UK ─────────────────────────────
dict(c='uk', slug='how-long-does-post-take',
 title='How Long Does UK Post Take? 1st vs 2nd Class',
 desc='First Class aims for the next working day and Second Class for three. What changed for Second Class in 2025 and 2026, and how often Royal Mail hits its targets.',
 eyebrow='Everyday post', h1='How long does post take<br><em>in the UK?</em>',
 sub='First Class aims for the next working day and Second Class for three, though neither is guaranteed.',
 answer='Royal Mail aims to deliver First Class letters the next working day and Second Class letters within three working days. Neither is guaranteed, and Second Class is moving to deliveries on alternate weekdays.',
 body='''
<h2>The short answer</h2>
<p>First Class post aims to arrive the next working day, Monday to Saturday. Second Class post aims to arrive within three working days. These are targets set by Ofcom, the regulator, and Royal Mail doesn't always meet them.</p>

<h2>What changed for Second Class</h2>
<p>In 2025 Ofcom allowed Royal Mail to stop Second Class letter deliveries on Saturdays and to deliver them on alternate weekdays instead. Royal Mail started with pilots in a few dozen delivery offices from July 2025, agreed the national plan with the Communication Workers Union in April 2026, and has been rolling it out through 2026.</p>
<p>The three-working-day target for Second Class stays the same. First Class keeps its six-day, next-day service.</p>

<h2>How often the targets are met</h2>
<p>From 1 April 2026 Ofcom set the targets at 90% of First Class post arriving the next working day and 95% of Second Class within three working days. Both are lower than before. There is also a backstop: 99% of post should arrive no more than two days late.</p>
<p>Royal Mail has struggled to meet the old targets. In 2024/25 it delivered 77% of First Class mail and 92.5% of Second Class mail on time, and Ofcom fined it £21 million.</p>

<h2>When the date matters</h2>
<p>An ordinary stamped letter can't be tracked. If a letter must arrive by a date, Special Delivery Guaranteed promises next-day delivery by 1pm and comes with tracking. Signed For gives you a signature on delivery but no guaranteed date. Both are sold at Post Office counters.</p>

<h2>Posting a letter without a printer or stamps</h2>
<p>If you don't have a printer or stamps, you can type the letter on our site and we print it, put it in an envelope and post it. A letter within the UK is £4.50, with printing, the envelope and postage included. We send letters within two business days, and the order page shows the price and how your letter will travel before you pay.</p>
''',
 faq=[('How long does a First Class letter take?', 'Royal Mail aims to deliver First Class letters the next working day, Monday to Saturday. Ofcom\'s target is 90% on time.'),
      ('How long does a Second Class letter take?', 'Royal Mail aims to deliver Second Class letters within three working days. They are moving to delivery on alternate weekdays, with no Saturday delivery.'),
      ('Can I track a letter with a normal stamp?', 'No. Signed For adds a signature on delivery, and Special Delivery Guaranteed adds tracking and a next-day 1pm guarantee.')],
 sources=[('Royal Mail: the future of letter deliveries', 'https://www.royalmail.com/receiving/the-future-of-letter-deliveries'),
          ('Logistics Manager: Ofcom announces Royal Mail service reforms', 'https://www.logisticsmanager.com/ofcom-announces-royal-mail-service-reforms-including-reduced-delivery-days-for-second-class-post'),
          ('Express & Star: second class change delayed until 2026', 'https://www.expressandstar.com/news/royal-mail-postal-service-confirms-second-class-letter-delivery-change-delayed-until-2026-heres-what-it-means-5654522')],
 related=[('/uk/how-much-is-a-stamp', 'How much is a stamp in 2026?', 'First and Second Class prices from April 2026'), ('/uk/return-address-on-a-letter', 'Do you need a return address?', 'What Royal Mail does without one'), ('/uk/how-to-send-mail-to-canada-from-uk', 'Post a letter to Canada', 'From the UK, no stamps needed'), ('/address-a-letter-to-canada-from-the-uk', 'Address a letter to Canada', 'The format Canada Post expects')]),

dict(c='uk', slug='how-much-is-a-stamp',
 title='How Much Is a Stamp in the UK? 2026 Prices',
 desc='A First Class stamp costs £1.80 and Second Class 91p since 7 April 2026. Large letter prices, the worldwide rate, and whether old stamps still work.',
 eyebrow='Everyday post', h1='How much is a stamp<br><em>in the UK?</em>',
 sub='First Class is £1.80 and Second Class is 91p, with large letters and post abroad costing more.',
 answer='Since 7 April 2026 a First Class stamp for a standard letter costs £1.80 and a Second Class stamp costs 91p. Letter prices did not change when Royal Mail raised parcel prices in October 2026.',
 body='''
<h2>Standard letters</h2>
<p>For a standard letter up to 100g, a First Class stamp costs <strong>£1.80</strong> and a Second Class stamp costs <strong>91p</strong>. Both went up on 7 April 2026, by 10p and 4p. A standard letter is up to C5 size and 5mm thick, which covers an A4 sheet folded twice or an A5 sheet folded once.</p>

<h2>Large letters</h2>
<p>A large letter is bigger or thicker than that, up to A4 size and 2.5cm thick. Up to 100g it costs <strong>£3.30</strong> First Class and <strong>£1.55</strong> Second Class. Heavier large letters cost more.</p>

<h2>Letters abroad</h2>
<p>A standard letter or postcard to anywhere outside the UK costs <strong>£3.60</strong> by airmail from April 2026, up from £3.40.</p>

<h2>Do old stamps still work?</h2>
<p>Stamps marked "1st" or "2nd" with no price are worth the current First or Second Class price whenever you use them. The exception is everyday stamps without a barcode: those stopped being valid after 31 July 2023. Royal Mail runs a swap scheme to exchange them for barcoded stamps. Special and Christmas stamps without a barcode are still valid.</p>

<h2>When a stamp isn't the cheapest option</h2>
<p>If you already have a printer, envelopes and stamps, a stamp is the cheapest way to post one letter. If you don't, we print the letter, put it in an envelope and post it for £4.50 within the UK, with postage included.</p>
''',
 faq=[('How much is a First Class stamp in 2026?', 'A First Class stamp for a standard letter costs £1.80, since 7 April 2026.'),
      ('How much is a Second Class stamp in 2026?', 'A Second Class stamp for a standard letter costs 91p, since 7 April 2026.'),
      ('Can I still use stamps without a barcode?', 'Everyday stamps without a barcode stopped being valid after 31 July 2023 and can be swapped through Royal Mail. Special and Christmas stamps without a barcode are still valid.')],
 sources=[('Royal Mail: prices 2026', 'https://www.royalmail.com/prices2026'),
          ('Yorkshire Post: Royal Mail stamp prices rising in April 2026', 'https://www.yorkshirepost.co.uk/business/consumer/royal-mail-stamps-first-second-class-postage-stamp-prices-rising-how-much-5622882')],
 related=[('/uk/how-long-does-post-take', 'How long does post take?', 'First and Second Class delivery times'), ('/uk/return-address-on-a-letter', 'Do you need a return address?', 'What Royal Mail does without one'), ('/uk/how-to-send-mail-to-usa-from-uk', 'Post a letter to the US', 'From the UK, no stamps needed'), ('/uk/how-to-send-mail-to-canada-from-uk', 'Post a letter to Canada', 'From the UK, no stamps needed')]),

dict(c='uk', slug='return-address-on-a-letter',
 title='Do You Need a Return Address in the UK?',
 desc='A return address isn\'t required on UK post. Where to put one, and what Royal Mail does with a letter it can\'t deliver and can\'t send back.',
 eyebrow='Everyday post', h1='Do you need a return address<br><em>on a letter?</em>',
 sub='No, but it decides what happens if your letter can\'t be delivered.',
 answer='You don\'t have to put a return address on UK post. Without one, a letter that can\'t be delivered goes to Royal Mail\'s National Returns Centre, where it may be opened to look for the sender\'s details.',
 body='''
<h2>Is it required?</h2>
<p>No. Royal Mail delivers letters with or without a return address, as long as the delivery address and postage are right.</p>

<h2>What happens if the letter can't be delivered</h2>
<p>With a return address on the outside, Royal Mail can send the letter back to you unopened. Without one, it goes to Royal Mail's National Returns Centre. Staff there open it to look for a sender's address inside. If they can't find one, Royal Mail's terms allow it to dispose of the letter.</p>

<h2>Where to put it</h2>
<p>In the UK the usual place is the back of the envelope, across the top of the flap. Write it the same way as the delivery address, with the postcode on its own line. Some people write "Return address:" or "From:" above it, which helps if the envelope is reused or the writing is small.</p>

<h2>Posting without your address on it</h2>
<p>You might leave your address off for privacy, or because you're moving. You can do that with a letter you write on our site too. If you leave yours off, the envelope carries our return address instead. We don't forward letters that come back to us, so only leave it off if you don't need the letter returned.</p>
''',
 faq=[('Do you need a return address on a letter in the UK?', 'No. Royal Mail delivers letters without one. A return address only matters if the letter can\'t be delivered.'),
      ('Where does the return address go on a UK envelope?', 'Usually on the back of the envelope, across the top of the flap.'),
      ('What happens to undeliverable post with no return address?', 'It goes to Royal Mail\'s National Returns Centre, where it may be opened to find the sender. If no address is found, Royal Mail may dispose of it.')],
 sources=[('Royal Mail help: labelling on the letter or parcel was incorrect', 'https://www.royalmail.com/help/labelling-on-letter-parcel-incorrect'),
          ('The Gazette: Royal Mail general conditions', 'https://thegazette.co.uk/notice/B-7432-5')],
 related=[('/uk/how-long-does-post-take', 'How long does post take?', 'First and Second Class delivery times'), ('/uk/how-much-is-a-stamp', 'How much is a stamp in 2026?', 'First and Second Class prices from April 2026'), ('/uk/how-to-send-mail-to-canada-from-uk', 'Post a letter to Canada', 'From the UK, no stamps needed'), ('/address-a-letter-to-canada-from-the-uk', 'Address a letter to Canada', 'The format Canada Post expects')]),
]


def build(p):
    c = p['c']; tpl = open(TEMPLATE[c], encoding='utf-8').read()
    url = f"{BASE}/{c}/{p['slug']}"
    styles = tpl[tpl.index('<link rel="stylesheet" href="/fonts.css'):tpl.index('</head>')]
    styles = re.sub(r'<link rel="alternate"[^>]*>', '', styles)
    body_open = tpl[tpl.index('<body'):tpl.index('<div class="hero" id="main-content">')]
    hero_tpl = tpl[tpl.index('<div class="hero" id="main-content">'):]
    stamp = re.search(r'<div class="stamp".*?</div>', hero_tpl, re.S)
    stamp = stamp.group(0) if stamp else ''
    tail = tpl[tpl.index('<footer id="site-footer">'):]
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Article', 'headline': strip(p['h1'].replace('<br>', ' ')), 'description': p['desc'], 'datePublished': PUBLISHED, 'dateModified': PUBLISHED,
         'inLanguage': LANG[c], 'mainEntityOfPage': url, 'author': {'@type': 'Person', 'name': 'Jeffrey George', 'url': f'{BASE}/about'},
         'publisher': {'@type': 'Organization', 'name': 'Letterhome', 'url': BASE, 'logo': {'@type': 'ImageObject', 'url': f'{BASE}/apple-touch-icon.png'}}},
        {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in p['faq']]},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Letterhome', 'item': f'{BASE}/{c}'},
            {'@type': 'ListItem', 'position': 2, 'name': strip(p['h1'].replace('<br>', ' ')), 'item': url}]}]}
    faq = ''.join(f'<div class="faq-item"><p class="faq-q">{esc(q)}</p><p class="faq-a">{esc(a)}</p></div>' for q, a in p['faq'])
    src = ''.join(f'<li><a href="{esc(u)}" target="_blank" rel="noopener">{esc(t)}</a></li>' for t, u in p['sources'])
    rel = ''.join(f'<a class="related-card" href="{h}"><strong>{esc(t)}</strong><span>{esc(d)}</span></a>' for h, t, d in p['related'])
    title = p['title'] + ' | Letterhome'
    return f'''<!DOCTYPE html>
<html data-en-only lang="{LANG[c]}" data-country="{c}">
<head>
<meta charset="UTF-8">
<link rel="preload" as="font" type="font/woff2" href="/fonts/vEFI2_tTDB4M7-auWDN0ahZJW1gb8tc.woff2" crossorigin>
<link rel="dns-prefetch" href="https://www.googletagmanager.com">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="/ga.js?v=2" defer></script>
<script src="/cookie-consent.js?v=12" defer></script>
<title>{esc(title)}</title>
<meta name="description" content="{esc(p['desc'])}">
<link rel="canonical" href="{url}">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#faf8f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="{esc(p['title'])}">
<meta property="og:description" content="{esc(p['desc'])}">
<meta property="og:type" content="article">
<meta property="og:url" content="{url}">
<meta property="og:image" content="https://letterhome.ca/og-image.jpg?v=4">
<meta property="og:site_name" content="Letterhome">
<meta property="og:locale" content="{LOCALE[c]}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(p['title'])}">
<meta name="twitter:description" content="{esc(p['desc'])}">
<meta name="twitter:image" content="https://letterhome.ca/og-image.jpg?v=4">
<script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=1)}
</script>
{styles}</head>
{body_open}<div class="hero" id="main-content">
{stamp}<div class="letter">
  <p class="hero-eyebrow">{esc(p['eyebrow'])}</p>
  <h1>{p['h1']}</h1>
  <p class="hero-sub">{esc(p['sub'])}</p>
  <a href="{SEND[c]}" class="hero-cta">Send a letter →</a>
  <div class="answer-box"><p>{esc(p['answer'])}</p></div>
</div></div>

<div class="main">
<p style="font-size:13px;color:var(--ink-muted)">Updated November 2026</p>
{p['body'].strip()}

<h2>Sources</h2>
<ul class="sources">{src}</ul>

<div class="faq"><h2>Common questions</h2>{faq}</div>
<div class="related"><h2>Related guides</h2><div class="related-grid">{rel}</div></div>
<div class="cta-block"><h2>Got a letter to send?</h2><p>Type it online and we print and {VERB[c]} it for you.</p><a href="{SEND[c]}">Send a letter →</a></div>
</div>

{tail}'''


for p in PAGES:
    out = f"public/{p['c']}-{p['slug']}.html"
    open(out, 'w', encoding='utf-8').write(build(p))
    print('wrote', out)
