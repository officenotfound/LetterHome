#!/usr/bin/env python3
"""Builds the late-November 2026 search pages:
  public/send-mail-in-canada.html
  public/mail-a-letter-without-a-printer.html
  public/letter-templates.html
  public/tools.html
  public/tools/postage-calculator.html
  public/tools/how-many-pages-per-stamp.html
  public/tools/canadian-address-formatter.html
Run from the project root:  python3 scripts/build-seo-pages-2026-11.py
Facts were checked on 2026-11-22 against the sources named on each page (Canada Post's lettermail pricing page and the
competitor pricing pages quoted in the comparison). Re-check dates, rates and competitor prices before changing the copy.
The route list in server.js, the sitemap and the hub links are edited by hand, not by this script."""
import html, json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
BASE = 'https://letterhome.ca'
TODAY = '2026-11-22'
MONTH = 'November 2026'

LIVE = open('public/how-much-does-it-cost-to-mail-a-letter-to-canada.html', encoding='utf-8').read()
VER = {m.group(1): m.group(2) for m in re.finditer(r'((?:header|footer|lang|theme|ga|cookie-consent)\.js)\?v=(\d+)', LIVE)}
CSS_VER = re.search(r'redesign\.css\?v=(\d+)', LIVE).group(1)

def esc(s): return html.escape(s, quote=True)
def strip(s): return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', s)).strip()

# The shared top and bottom of a live page: preamble, the house style block, header and footer.
PRE = LIVE[:LIVE.index('<title>')]
STYLE = LIVE[LIVE.index('<link rel="stylesheet" href="/fonts.css'):LIVE.index('</head>')]
HEADER = LIVE[LIVE.index('<body>'):LIVE.index('<div class="page">')]
FOOTER = LIVE[LIVE.index('<footer id="site-footer">'):]

EXTRA_CSS = """<style>
.capsule{background:#f0f7f0;border-left:4px solid #2a7a2a;padding:.9rem 1.1rem;margin:.5rem 0 1.6rem;border-radius:0 4px 4px 0;font-size:1.02rem;line-height:1.65;color:var(--ink)}
.capsule strong{color:var(--ink)}
.cost-wrap{overflow-x:auto;margin:8px 0 12px}
table.cost td.no{color:var(--ink-faint)}
table.cost td.best{color:#1f6b3a;font-weight:600}
.tool{background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:22px 22px 18px;margin:18px 0 8px}
.tool .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px 16px}
.tool label{display:block;font-size:13px;font-weight:600;color:var(--ink-muted);margin-bottom:5px}
.tool input,.tool select{width:100%}
.tool .hint{font-size:12px;color:var(--ink-faint);margin-top:4px}
.result{margin-top:18px;padding:16px 18px;background:#fff;border:1px solid var(--line);border-radius:4px;font-size:15px}
.result .big{font-family:'Archivo',serif;font-size:30px;line-height:1.1;margin:2px 0 6px;color:var(--ink)}
.result.warn{border-left:4px solid var(--red)}
.result.ok{border-left:4px solid #2a7a2a}
.addr{font-family:'Roboto','Courier New',monospace;font-size:16px;line-height:1.7;white-space:pre;background:#fff;border:1px solid var(--line);border-radius:4px;padding:14px 18px;overflow-x:auto}
.mini-btn{display:inline-block;margin-top:10px;padding:8px 16px;border:1px solid var(--ink-muted);background:transparent;color:var(--ink);border-radius:3px;font:inherit;font-size:13px;cursor:pointer}
.mini-btn:hover{background:var(--kraft-deep)}
.tool-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:12px 0 8px}
.tool-cards a{display:block;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:18px 18px 16px;text-decoration:none;color:var(--ink)}
.tool-cards a:hover{border-color:var(--red)}
.tool-cards strong{display:block;font-family:'Archivo',serif;font-size:18px;margin-bottom:6px}
.tool-cards span{font-size:14px;color:var(--ink-soft)}
.tpl-group{margin:0 0 6px}
.tpl-group ul{list-style:none;display:grid;gap:8px;margin:8px 0 14px}
.tpl-group li{background:var(--paper);border:1px solid var(--line);border-radius:3px;padding:12px 16px;font-size:15px}
.tpl-group li a{color:var(--red);text-decoration:none;font-weight:600}
.tpl-group li a:hover{text-decoration:underline}
.tpl-group li span{display:block;color:var(--ink-soft);font-size:14px;margin-top:3px}
[data-theme=dark] .capsule{background:#1b2a1d;color:#f0e6d3}
[data-theme=dark] .tool,[data-theme=dark] .tpl-group li,[data-theme=dark] .tool-cards a{background:#231d18;border-color:rgba(240,230,211,0.1);color:#f0e6d3}
[data-theme=dark] .result,[data-theme=dark] .addr{background:#1a1410;border-color:rgba(240,230,211,0.12);color:#f0e6d3}
[data-theme=dark] table.cost td.best{color:#7bd08e}
</style>
"""

def faq_block(faqs):
    out = []
    for i, (q, a) in enumerate(faqs):
        out.append(f'''    <div class="faq-item">
      <button class="faq-q" onclick="toggle({i})" aria-expanded="false" aria-controls="a{i}"><span>{esc(q)}</span><svg class="faq-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
      <div class="faq-a" id="a{i}" hidden>{a}</div>
    </div>''')
    return '  <div class="faq-list">\n' + '\n'.join(out) + '\n  </div>'

def related(links):
    return '<div class="related">\n' + '\n'.join(f'    <a href="{h}">{t}</a>' for h, t in links) + '\n  </div>'

def cta_band(h, p, btn='Send a letter'):
    return f'''  <div class="cta-band">
    <h2>{h}</h2>
    <p>{p}</p>
    <a href="/send" class="btn btn-paper">{btn}</a>
  </div>'''

def page(slug, title, desc, h1, crumb, body, faqs=None, eyebrow='Guide', extra_ld=None, app=False, og_title=None, extra_script=''):
    url = f'{BASE}/{slug}'
    graph = []
    if faqs:
        graph.append({'@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': strip(a)}} for q, a in faqs]})
    crumbs = [('Home', BASE + '/')]
    if slug.startswith('tools/'): crumbs.append(('Tools', BASE + '/tools'))
    crumbs.append((crumb, url))
    graph.append({'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': u} for i, (n, u) in enumerate(crumbs)]})
    wp = {'@type': 'WebPage', '@id': url + '#webpage', 'url': url, 'name': h1, 'description': desc,
          'datePublished': TODAY, 'dateModified': TODAY, 'inLanguage': 'en-CA', 'isPartOf': {'@id': BASE + '/#website'}}
    graph.append(wp)
    if extra_ld: graph.append(extra_ld)
    ld = json.dumps({'@context': 'https://schema.org', '@graph': graph}, indent=2, ensure_ascii=False)
    ogt = og_title or title
    head = PRE + f'''<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<link rel="alternate" hreflang="en-CA" href="{url}">
<link rel="alternate" hreflang="x-default" href="{url}">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#faf8f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="{esc(ogt)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:type" content="{'website' if app else 'article'}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE}/og-image.jpg?v=4">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="Letterhome">
<meta property="og:locale" content="en_CA">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(ogt)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{BASE}/og-image.jpg?v=4">
<script type="application/ld+json">
{ld}
</script>
''' + STYLE.replace('</head>', '') + EXTRA_CSS + '</head>\n'
    main = f'''<div class="page">

  <div class="eyebrow">{eyebrow}</div>
  <h1>{h1}</h1>
{body}
</div>

'''
    foot = FOOTER
    if extra_script:
        foot = foot.replace('</body>', extra_script + '\n</body>')
    out = head + HEADER + main + foot
    path = f'public/{slug}.html'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(out)
    print('wrote', path, len(out))

SRC_CP = '<a href="https://www.canadapost-postescanada.ca/cpc/en/support/articles/lettermail/pricing.page" rel="noopener noreferrer" style="color:inherit">Canada Post, Lettermail pricing</a>'

RATE_ROWS = [
    ('Standard letter, up to 30 g', '$1.44 (single stamp), $1.24 (booklet or coil)'),
    ('Standard letter, over 30 g to 50 g', '$1.75'),
    ('Large letter, up to 100 g', '$2.61'),
    ('Large letter, over 100 g to 200 g', '$4.29'),
    ('Large letter, over 200 g to 300 g', '$5.98'),
    ('Large letter, over 300 g to 400 g', '$6.85'),
    ('Large letter, over 400 g to 500 g', '$7.36'),
]
def rate_table():
    rows = '\n'.join(f'      <tr><td>{a}</td><td>{b}</td></tr>' for a, b in RATE_ROWS)
    return f'''  <div class="cost-wrap"><table class="cost">
    <thead><tr><th>Letter size and weight</th><th>Domestic postage, 2026</th></tr></thead>
    <tbody>
{rows}
    </tbody>
  </table></div>
  <p class="caption">Source: {SRC_CP}, checked {MONTH}. Domestic rates only. A "large letter" is Canada Post's "other Lettermail": over 245 by 156 mm or over 50 g, up to 380 by 270 by 20 mm and 500 g.</p>'''

# ═════════════════════════════ 1. Send mail in Canada (flagship) ═════════════════════════════
FAQ1 = [
    ('How much does it cost to send a letter in Canada?',
     'A standard letter up to 30 g costs $1.44 with a single Canada Post stamp in 2026, or $1.24 each from a booklet or coil. From 30 g to 50 g it is $1.75. Larger letters start at $2.61. Those prices are postage only: you also need an envelope, paper and a way to print. Letterhome prints and mails a letter anywhere in Canada for $6, with two pages, the envelope and postage included.'),
    ('How long does mail take in Canada?',
     'Canada Post does not guarantee delivery times for standard letters, but they usually arrive in 2 to 9 business days. Nearby addresses are at the fast end, and rural or remote addresses are slower. Xpresspost is usually 1 to 2 business days.'),
    ('Can I send mail in Canada online?',
     'Yes. An online print-and-mail service takes your letter on a website, prints it, puts it in an envelope with postage and hands it to Canada Post. Letterhome does this for $6 to any Canadian address, and you do not need an account.'),
    ('Can I track a letter sent in Canada?',
     'Not a standard letter. Regular Lettermail has no tracking or delivery scan. Registered Mail and Xpresspost, both bought at a Canada Post counter, include tracking, and Registered Mail adds a signature. Letterhome sends standard Lettermail and does not offer tracking or registered mail.'),
    ('Do I need a return address on a letter in Canada?',
     'It is not required to deliver the letter, but without one the post office cannot send the letter back if it cannot be delivered. A return address goes in the top left corner of the envelope.'),
    ('How do I address a letter in Canada?',
     'Write the recipient on the first line, the street address on the second, and the city, two-letter province code and postal code on the third, for example OTTAWA ON K1A 0B1. Canada Post prefers capital letters and no punctuation. Add CANADA on a last line if you are mailing from another country.'),
    ('How many pages can I send for one stamp?',
     'About five sheets of standard 20 lb paper in a regular business envelope stay under 30 g, so one $1.44 stamp covers them. Up to about nine sheets stay under 50 g and need the $1.75 rate. The page-per-stamp calculator on this site shows the weight for your paper and envelope.'),
    ('How do I send mail in Canada if I do not have a printer?',
     'Handwrite the letter and post it yourself, or use an online service that prints it for you. With Letterhome you type the letter on your phone or computer, or attach a PDF or Word file, and we print and mail it.'),
]
body1 = f'''
  <p class="updated">Updated {MONTH}</p>
  <div class="capsule"><strong>To send mail in Canada, put the letter in an envelope, write the address, add postage and post it at a mailbox or post office.</strong> A standard letter up to 30 g costs $1.44 in 2026 and usually arrives in 2 to 9 business days. If you have no printer, no stamps or no time, or you are outside Canada, <a href="/send">Letterhome</a> prints and mails the letter for you for $6.</div>
  <div class="cta-row">
    <a href="/send" class="btn btn-red">Print &amp; mail a letter, $6</a>
    <span class="price-note">Envelope and postage included &nbsp;·&nbsp; No account needed</span>
  </div>

  <h2>The ways to send mail in Canada</h2>
  <p class="body">There are three practical routes for a letter. Which one is right depends on whether you already have a printed letter, where you are, and whether you need proof it arrived.</p>
  <div class="cost-wrap"><table class="cost">
    <thead><tr><th>Way</th><th>Best for</th><th>Cost</th><th>Tracking</th></tr></thead>
    <tbody>
      <tr><td>Stamp and mailbox</td><td>One letter you have already printed, when you are in Canada</td><td>$1.44 for up to 30 g, plus the envelope and paper</td><td class="no">None</td></tr>
      <tr><td>Canada Post counter</td><td>Registered Mail or Xpresspost, when you need a signature or tracking</td><td>Postage plus a service fee, set by Canada Post</td><td>Yes</td></tr>
      <tr><td>Online print and mail</td><td>No printer, no stamps, no time, or you are outside Canada</td><td>$6 with Letterhome, all in</td><td class="no">None (standard mail)</td></tr>
    </tbody>
  </table></div>

  <h2>What it costs to mail a letter in Canada in 2026</h2>
  <p class="body">Postage depends on the size and the weight of the sealed envelope with everything inside it. A letter folded in three in a business envelope is a standard letter. A 9 by 12 inch envelope is not, even when it is light, because it is longer than 245 mm.</p>
{rate_table()}
  <p class="body">Budget 2026 puts the domestic stamp at $2 in 2027. <a href="/canada-post-stamp-price-2027">What is confirmed so far</a>. To work out the exact postage for your letter, use the <a href="/tools/postage-calculator">postage calculator</a>.</p>

  <h2>How to send a standard letter, step by step</h2>
  <ol class="tips" style="list-style:none">
    <li><strong>Print and fold it.</strong> Three folds fit a #10 business envelope. Check the weight first if the letter is more than a few pages (<a href="/tools/how-many-pages-per-stamp">pages per stamp</a>).</li>
    <li><strong>Address the envelope.</strong> Recipient, street address, then city, province code and postal code on one line. The <a href="/tools/canadian-address-formatter">address formatter</a> builds it in the form Canada Post prefers, and <a href="/how-to-address-a-letter-to-canada">this guide</a> explains each part.</li>
    <li><strong>Add a return address</strong> in the top left corner.</li>
    <li><strong>Put on the right postage.</strong> A single $1.44 stamp covers a standard letter up to 30 g.</li>
    <li><strong>Post it</strong> in a street mailbox, a community mailbox or at a post office.</li>
  </ol>

  <h2>Worked examples: what a real letter costs to post</h2>
  <p class="body">These use US Letter paper at 20 lb (4.5 g a sheet) and a plain #10 envelope (about 6 g). They are estimates, so weigh the real thing if it is close to a limit.</p>
  <div class="cost-wrap"><table class="cost">
    <thead><tr><th>What you are sending</th><th>Weight</th><th>Postage</th></tr></thead>
    <tbody>
      <tr><td>A one-page letter</td><td>about 10.5 g</td><td>$1.44</td></tr>
      <tr><td>A five-page letter</td><td>about 28.5 g</td><td>$1.44</td></tr>
      <tr><td>An eight-page letter or form</td><td>about 42 g</td><td>$1.75</td></tr>
      <tr><td>A twelve-page contract or application</td><td>about 60 g</td><td>$2.61 (large letter)</td></tr>
    </tbody>
  </table></div>
  <p class="body">A ten-page letter in a #10 envelope also lands at about 51 g, one gram over the 50 g line, which is why checking the weight matters.</p>

  <h2>What people most often mail in Canada</h2>
  <p class="body">Most mail in Canada is still the ordinary stamped letter, but a few kinds of mail have their own rules and deadlines.</p>
  <ul class="tips">
    <li><strong>Government forms and applications.</strong> Many still go by mail. See <a href="/government-forms-that-require-mail">which Canadian government forms still require mail</a>, and the guides for the <a href="/how-to-mail-cra-tax-forms-from-outside-canada">CRA</a> and <a href="/how-to-mail-ircc-documents-from-outside-canada">IRCC</a>.</li>
    <li><strong>Legal and tenancy notices.</strong> These often depend on proof of delivery. See <a href="/landlord-notices">landlord notices</a> and <a href="/proof-of-mailing">how to keep proof you sent a letter</a>.</li>
    <li><strong>Cancellations and complaints</strong> to companies that ask for a written notice, such as <a href="/cancel-gym-membership-by-mail">a gym membership</a>.</li>
    <li><strong>Personal letters and cards</strong> to family, a <a href="/mail-to-retirement-and-nursing-homes">care home</a>, a <a href="/mail-a-letter-to-a-university-student-in-canada">student</a> or a <a href="/write-to-a-child-at-summer-camp">child at camp</a>.</li>
    <li><strong>Holiday mail.</strong> Dates matter near Christmas. See the <a href="/canada-post-christmas-mailing-deadlines-2026">2026 Christmas mailing deadlines</a>.</li>
  </ul>

  <h2>A quick checklist before you post</h2>
  <ul class="tips">
    <li>The postal code has six characters, in the form A1A 1A1, and matches the city and province.</li>
    <li>The sealed envelope has been weighed, or counted against the <a href="/tools/how-many-pages-per-stamp">pages-per-stamp chart</a>.</li>
    <li>The return address is in the top left corner, in case the letter comes back.</li>
    <li>You have kept a copy of what you sent and the date you posted it.</li>
    <li>If a deadline depends on arrival, you have chosen Registered Mail or Xpresspost and allowed extra days.</li>
  </ul>

  <h2>How long mail takes in Canada</h2>
  <p class="body">Canada Post does not guarantee delivery times for standard Lettermail. In practice a letter takes 2 to 9 business days. Mail between nearby addresses is quicker, and mail across the country or to remote areas is slower. Allow up to two weeks if the date matters. Xpresspost, which adds tracking, is usually 1 to 2 business days. More detail is in <a href="/how-long-does-it-take-to-mail-a-letter-to-canada">how long a letter takes in Canada</a>.</p>

  <h2>Tracking and proof of delivery</h2>
  <p class="body">Standard Lettermail is not tracked, so there is no scan when it is posted or delivered. If you need to show that a letter arrived, for a legal notice or a government deadline for example, buy Registered Mail or Xpresspost at a Canada Post counter. The differences are in <a href="/registered-mail-vs-xpresspost">registered mail vs Xpresspost vs regular mail</a>. Letterhome sends standard Lettermail and cannot add either service, so for proof of delivery use the post office.</p>

  <h2>What not to mail</h2>
  <p class="body">Canada Post advises against mailing cash, and anything over 500 g or larger than 380 by 270 by 20 mm is no longer Lettermail. See <a href="/can-you-mail-cash-to-canada">whether you can mail cash in Canada</a> and <a href="/can-i-mail-a-package-to-canada">letters versus packages</a>.</p>

  <h2>When you cannot post it yourself</h2>
  <p class="body">Sometimes the usual route does not work. You are travelling or living abroad and the letter has to go out from a Canadian address. You do not own a printer. The document only exists on your phone. Or you would rather not spend an hour on one letter.</p>
  <p class="body">Letterhome handles those cases. You type the letter, or attach a PDF or Word file, and enter the two addresses. We check the address, print the letter, put it in an envelope with Canadian postage and give it to Canada Post within two business days. It is $6 to any Canadian address, including the first two pages in black and white. Colour is $1 more, and each extra page is $0.55.</p>
  <div class="callout"><strong>When a stamp is the better deal.</strong> If you are in Canada, already have a printer, paper and envelopes, and are mailing one letter, a $1.44 stamp is cheaper than any service. The online route earns its price when printing, envelopes, the trip or being outside Canada are the problem.</div>

  <h2>Sending mail to Canada from another country</h2>
  <p class="body">International postage into Canada is slower and costs more than a domestic stamp. From the United States, a letter to Canada takes about 7 to 21 days, and from the UK about 7 to 14 business days. A letter posted from inside Canada travels as domestic mail instead. The guides for each country cover the details: <a href="/us/how-to-send-mail-to-canada-from-us">from the United States</a>, <a href="/uk/how-to-send-mail-to-canada-from-uk">from the UK</a>, <a href="/au/how-to-send-mail-to-canada-from-au">from Australia</a> and <a href="/how-to-send-a-letter-to-canada-from-abroad">from anywhere</a>.</p>

  <h2>Frequently asked questions</h2>
{faq_block(FAQ1)}

  <h2>Related guides</h2>
  {related([
      ('/tools/postage-calculator', 'Canada Post letter postage calculator'),
      ('/tools/how-many-pages-per-stamp', 'How many pages can you mail with one stamp'),
      ('/tools/canadian-address-formatter', 'Canadian address formatter and postal code checker'),
      ('/how-to-address-a-letter-to-canada', 'How to address a letter to Canada'),
      ('/what-is-lettermail', 'What Lettermail is and what it covers'),
      ('/postage-for-a-large-letter-in-canada', 'Postage for a large letter in Canada, by weight'),
      ('/how-much-does-it-cost-to-mail-a-letter-to-canada', 'How much it costs to mail a letter to Canada'),
      ('/mail-a-letter-without-a-printer', 'Mail a letter without a printer'),
  ])}

{cta_band('No printer, no stamps, no trip', 'Type your letter or attach a document. We print it, add postage and mail it from Canada, $6 all in.')}
'''
page('send-mail-in-canada',
     'Send Mail in Canada: Every Way, 2026 Prices | Letterhome',
     'How to send mail in Canada in 2026: stamp prices, delivery times, tracking, and how to mail a letter online without a printer or a post office trip.',
     'Send mail in Canada: every way to do it, with 2026 prices', 'Send mail in Canada', body1, FAQ1)

# ═════════════════════════════ 3. Mail a letter without a printer ═════════════════════════════
FAQ3 = [
    ('Can I mail a letter in Canada without a printer?',
     'Yes. Type the letter on a website, or attach a PDF or Word file, and an online service prints it, puts it in an envelope and mails it. With Letterhome it is $6 to any Canadian address.'),
    ('Can I send a letter from my phone?',
     'Yes. The order form works on a phone. You can type the letter in the box or attach a document saved on the phone, enter the addresses and pay by card or Apple Pay or Google Pay.'),
    ('What file types can I attach?',
     'PDF and Word documents. You can also type the letter straight into the order form.'),
    ('How many pages can I send?',
     'Up to five pages in one letter. Two pages in black and white are included in the $6, and each extra page is $0.55, or $0.75 in colour.'),
    ('Is the letter printed in colour?',
     'Black and white by default. Colour printing is $1 more per order.'),
    ('How long does it take?',
     'We mail it within two business days of your order, after the address check. Delivery inside Canada then usually takes 2 to 9 business days, and Canada Post does not guarantee a date.'),
]
body3 = f'''
  <p class="updated">Updated {MONTH}</p>
  <div class="capsule"><strong>You can mail a letter in Canada without a printer by typing it online or attaching a file, and letting a print-and-mail service do the rest.</strong> Letterhome prints the letter, adds an envelope and postage and mails it for $6, including two pages in black and white.</div>
  <div class="cta-row">
    <a href="/send" class="btn btn-red">Write the letter, $6</a>
    <span class="price-note">Works on a phone &nbsp;·&nbsp; No account needed</span>
  </div>

  <h2>Your options with no printer</h2>
  <div class="cost-wrap"><table class="cost">
    <thead><tr><th>Option</th><th>What you do</th><th>Cost</th></tr></thead>
    <tbody>
      <tr><td>Handwrite it</td><td>Write on paper, address an envelope, buy a stamp and post it</td><td>$1.44 plus paper and an envelope</td></tr>
      <tr><td>Print shop or library</td><td>Print the file, then buy an envelope and a stamp, then post it</td><td>A few dollars for printing, plus the stamp, plus the trip</td></tr>
      <tr><td>Online print and mail</td><td>Type or attach the letter, enter the addresses, pay</td><td>$6 with Letterhome</td></tr>
    </tbody>
  </table></div>

  <h2>How it works with Letterhome</h2>
  <ol class="tips" style="list-style:none">
    <li><strong>Enter the two addresses.</strong> The sender address becomes the return address on the envelope. You can skip it and send without one.</li>
    <li><strong>Write the letter.</strong> Type it in the box, or attach a PDF or Word file. You see the exact printed page before you pay.</li>
    <li><strong>Pay.</strong> We check the address, print the letter, put it in an envelope with postage and mail it within two business days.</li>
  </ol>
  <p class="body">The order form works on a phone, so a document that only lives on your phone is fine. There is no app to install and no account to make.</p>

  <h2>If the letter is a document on your phone</h2>
  <p class="body">Most things people need to mail already exist as a file: a signed form, a scan, an email attachment, a Word document. Save it or export it as a PDF, then attach it on the order form. Most phones can scan a paper document to a PDF with the built-in camera or notes app, which is the quickest way to turn a paper form into a file. The order page shows the exact printed page before you pay, so you can check that nothing is cut off.</p>

  <h2>Who uses it</h2>
  <ul class="tips">
    <li><strong>People outside Canada</strong> who need a letter posted from a Canadian address. See <a href="/how-to-send-a-letter-to-canada-from-abroad">how to send a letter to Canada from abroad</a>.</li>
    <li><strong>Students and renters</strong> who do not own a printer and need to mail a form or a notice.</li>
    <li><strong>Older relatives and anyone who cannot get to a post office</strong> and would rather send a letter from home. See <a href="/send-a-letter-from-home">send a letter from home</a>.</li>
    <li><strong>Anyone with a deadline</strong> and a document that only exists on a phone or in an email.</li>
  </ul>

  <h2>What to check before you pay</h2>
  <ul class="tips">
    <li>The recipient address is complete, with the postal code. The <a href="/tools/canadian-address-formatter">address formatter</a> shows the correct form.</li>
    <li>The preview matches what you want printed, including page breaks.</li>
    <li>You have chosen colour only if you need it. Black and white is the default.</li>
    <li>If a deadline depends on the letter arriving, allow for delivery time. Standard mail usually takes 2 to 9 business days after we mail it, and Canada Post does not guarantee a date.</li>
  </ul>

  <h2>What it costs and what is included</h2>
  <p class="body">$6 to any address in Canada or the United States. That covers two pages printed in black and white, the envelope and the postage. Colour is $1 more per order. Each page after the second is $0.55, or $0.75 in colour. A letter can run to five pages. Sending to the UK or Australia is $9, and $15 to other countries.</p>
  <div class="callout"><strong>The honest comparison.</strong> If you can print at home and have a stamp, mailing the letter yourself costs less. The online route is for the cases where there is no printer, no envelope, no time for the trip, or you are not in Canada.</div>

  <h2>Frequently asked questions</h2>
{faq_block(FAQ3)}

  <h2>Related guides</h2>
  {related([
      ('/send-mail-in-canada', 'Send mail in Canada: every way, with 2026 prices'),
      ('/mail-a-letter-online', 'Mail a letter online in Canada'),
      ('/send-a-letter-from-home', 'Send a letter from home, no stamps or printer'),
      ('/schedule-a-letter-for-later', 'Schedule a letter to mail on a future date'),
      ('/how-to-address-a-letter-to-canada', 'How to address a letter to Canada'),
  ])}

{cta_band('Send it from your phone', 'Type the letter or attach a file. We print it and mail it, $6 all in.')}
'''
page('mail-a-letter-without-a-printer',
     'Mail a Letter Without a Printer in Canada | Letterhome',
     'No printer, no stamps? Type your letter or attach a PDF or Word file and Letterhome prints it and mails it in Canada for $6. Works on a phone.',
     'Mail a letter without a printer', 'Mail a letter without a printer', body3, FAQ3)

# ═════════════════════════════ 4. Letter templates hub ═════════════════════════════
GROUPS = [
    ('Money, contracts and consumer letters', [
        ('/demand-letter-unpaid-invoice', 'Demand letter for an unpaid invoice', 'Ask for payment in writing before small claims.'),
        ('/security-deposit-demand-letter', 'Security deposit demand letter', 'Ask a landlord to return a deposit.'),
        ('/cancel-gym-membership-by-mail', 'Cancel a gym membership by letter', 'A written cancellation for contracts that require mail.'),
        ('/respond-to-debt-collection-letter', 'Respond to a debt collection letter', 'What to write back, and what to keep.'),
        ('/dispute-credit-report-error', 'Dispute a credit report error', 'Letters to Equifax and TransUnion.'),
        ('/cease-and-desist-letter', 'Cease and desist letter', 'Write and send one in Canada.'),
    ]),
    ('Housing and tenancy notices', [
        ('/n9-notice', 'N9 notice to end a tenancy (Ontario)', 'Tenant notice, with where and how to deliver it.'),
        ('/n4-notice', 'N4 notice for non-payment (Ontario)', 'Mail it from outside Canada.'),
        ('/n12-notice', 'N12 notice (Ontario)', 'Landlord notice for personal use.'),
        ('/landlord-notices', 'Landlord notices from anywhere', 'Serve notices when you live elsewhere.'),
        ('/serve-eviction-notice-from-abroad', 'Serve an eviction notice from abroad', 'The steps and the proof to keep.'),
    ]),
    ('Work and official letters', [
        ('/resignation-letter-by-mail', 'Resignation letter', 'Write and mail one.'),
        ('/write-a-letter-to-your-mp', 'Letter to your MP', 'Format and where to send it.'),
        ('/cra-notice-of-objection', 'CRA notice of objection (RC592)', 'Where to mail it and the 90-day deadline.'),
        ('/how-to-write-a-letter-to-canada', 'How to write a letter to Canada', 'Format and template.'),
    ]),
    ('Personal letters', [
        ('/how-to-write-a-condolence-letter', 'Condolence letter', 'What to say and what to leave out.'),
        ('/what-to-write-in-a-letter-to-a-grandparent', 'Letter to a grandparent', 'Ideas for what to write.'),
        ('/open-when-letters', 'Open-when letters', 'Ideas and what to write.'),
        ('/write-a-letter-to-your-future-self', 'Letter to your future self', 'Mailed on a date you choose.'),
        ('/write-to-a-child-at-summer-camp', 'Letters to a child at summer camp', 'Mail tips and what to write.'),
        ('/love-letters-and-personal-mail', 'Love letters and personal mail', 'Cards and letters to Canada.'),
    ]),
    ('Holiday letters', [
        ('/christmas-family-letter-template', 'Christmas family letter template', 'Copy and fill in.'),
        ('/free-letter-from-santa-template', 'Free letter from Santa template', 'Copy and print.'),
        ('/write-a-letter-to-santa', 'Write a letter to Santa', 'How to get a reply in Canada.'),
    ]),
]
tpl = '\n'.join(
    f'  <div class="tpl-group"><h2>{g}</h2>\n  <ul>\n' + '\n'.join(
        f'    <li><a href="{h}">{t}</a><span>{d}</span></li>' for h, t, d in items) + '\n  </ul></div>'
    for g, items in GROUPS)
body4 = f'''
  <p class="updated">Updated {MONTH}</p>
  <div class="capsule"><strong>These are the letters people most often write and mail in Canada, with the wording, the rules that apply and where to send them.</strong> Write any of them online and Letterhome prints and mails the finished letter for $6.</div>
  <p class="body">Each guide explains what the letter needs to say and who it goes to. None of them is legal advice. For a deadline or a dispute, check the rules for your province and keep a record of what you sent.</p>
{tpl}

  <h2>Before you send</h2>
  <ul class="tips">
    <li>Keep a copy of the letter and note the date you mailed it. See <a href="/proof-of-mailing">how to keep proof you sent a letter</a>.</li>
    <li>If a notice or a deadline depends on proof of delivery, use Registered Mail from a Canada Post counter. Compare the options in <a href="/registered-mail-vs-xpresspost">registered mail vs Xpresspost</a>.</li>
    <li>Check the address format with the <a href="/tools/canadian-address-formatter">address formatter</a>.</li>
  </ul>

{cta_band('Write it, we mail it', 'Type your letter or attach a file. We print it and mail it from Canada, $6 all in.')}
'''
page('letter-templates',
     'Letter Templates for Canada: Notices and Demands | Letterhome',
     'Letter guides and templates for Canada: demand letters, tenancy notices, cancellations, resignation and holiday letters, and where to send each.',
     'Letter templates and guides for Canada', 'Letter templates', body4, None, eyebrow='Templates')

# ═════════════════════════════ 5. Tools hub ═════════════════════════════
body5 = f'''
  <p class="updated">Updated {MONTH}</p>
  <p class="answer">Three free tools for sending mail in Canada. They run in your browser, nothing you type is sent to us, and there is nothing to sign up for.</p>
  <div class="tool-cards">
    <a href="/tools/postage-calculator"><strong>Postage calculator</strong><span>Work out the Canada Post letter rate from the size and weight of your envelope.</span></a>
    <a href="/tools/how-many-pages-per-stamp"><strong>Pages per stamp</strong><span>See how many sheets fit under the 30 g and 50 g limits for your paper and envelope.</span></a>
    <a href="/tools/canadian-address-formatter"><strong>Address formatter</strong><span>Build a Canadian address the way Canada Post prefers, and check the postal code.</span></a>
  </div>
  <p class="body">The rates come from Canada Post's published Lettermail prices, checked {MONTH}. They cover domestic letters. Always confirm on Canada Post's site before you buy postage for something close to a weight or size limit.</p>

  <h2>More guides</h2>
  {related([
      ('/send-mail-in-canada', 'Send mail in Canada: every way, with 2026 prices'),
      ('/letter-templates', 'Letter templates and guides'),
      ('/how-to-address-a-letter-to-canada', 'How to address a letter to Canada'),
      ('/what-is-lettermail', 'What Lettermail is'),
  ])}

{cta_band('Skip the post office', 'Type a letter or attach a file. We print it and mail it, $6 all in.')}
'''
page('tools', 'Free Mailing Tools for Canada | Letterhome',
     'Free mailing tools for Canada: a Canada Post postage calculator, a pages-per-stamp chart and an address formatter with postal code check.',
     'Free mailing tools for Canada', 'Tools', body5, None, eyebrow='Tools', app=True)

# ═════════════════════════════ 6. Postage calculator ═════════════════════════════
FAQ6 = [
    ('How much is a stamp for a letter in Canada in 2026?',
     'A standard letter up to 30 g costs $1.44 with a single stamp, or $1.24 from a booklet or coil. Over 30 g and up to 50 g it is $1.75.'),
    ('What counts as a standard letter?',
     'Canada Post treats a letter as standard when it weighs 50 g or less and is at least 140 by 90 mm and no more than 245 by 156 mm and 5 mm thick. Anything larger or heavier up to 380 by 270 by 20 mm and 500 g is "other Lettermail" and costs more.'),
    ('Does this calculator cover the United States and other countries?',
     'No. It covers domestic Canadian letters only. International rates are different, so check Canada Post before you buy stamps for a letter leaving Canada.'),
    ('Do I weigh the envelope too?',
     'Yes. Canada Post prices the whole item, so weigh the sealed envelope with everything inside it.'),
]
calc_js = r'''
<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var PRESETS = { '10': [241, 105, 3], '6x9': [229, 152, 3], '9x12': [305, 229, 5], 'card': [152, 102, 1] };
  function fmt(n) { return '$' + n.toFixed(2); }
  function calc() {
    var size = $('size').value, L, W, T;
    if (size === 'custom') { L = +$('len').value; W = +$('wid').value; T = +$('thk').value; }
    else { var p = PRESETS[size]; L = p[0]; W = p[1]; T = p[2]; $('len').value = L; $('wid').value = W; $('thk').value = T; }
    var g = +$('wt').value; if ($('unit').value === 'oz') g = g * 28.3495;
    var box = $('result'), cls = 'result', html = '';
    $('customrow').style.display = size === 'custom' ? '' : 'none';
    if (!(g > 0) || !(L > 0) || !(W > 0) || !(T > 0)) { box.className = 'result'; box.innerHTML = 'Enter the weight to see the postage.'; return; }
    var long = Math.max(L, W), short = Math.min(L, W);
    var tooSmall = long < 140 || short < 90;
    var standardSize = long <= 245 && short <= 156 && T <= 5 && !tooSmall;
    var maxSize = long <= 380 && short <= 270 && T <= 20;
    var gr = Math.round(g * 10) / 10;
    if (tooSmall) {
      cls = 'result warn'; html = '<div class="big">Too small</div>Canada Post Lettermail has to be at least 140 by 90 mm. A smaller envelope needs a bigger one around it.';
    } else if (!maxSize || g > 500) {
      cls = 'result warn'; html = '<div class="big">Not Lettermail</div>Over 380 by 270 by 20 mm or over 500 g goes by a parcel service, not Lettermail.';
    } else if (standardSize && g <= 30) {
      cls = 'result ok'; html = '<div class="big">$1.44</div>Standard letter, ' + gr + ' g. One stamp. $1.24 if you buy stamps in a booklet or coil.';
    } else if (standardSize && g <= 50) {
      cls = 'result ok'; html = '<div class="big">$1.75</div>Standard letter, over 30 g and up to 50 g (' + gr + ' g).';
    } else {
      var price = g <= 100 ? 2.61 : g <= 200 ? 4.29 : g <= 300 ? 5.98 : g <= 400 ? 6.85 : 7.36;
      var why = !standardSize ? 'The envelope is larger than a standard letter' : 'The letter is over 50 g';
      cls = 'result ok'; html = '<div class="big">' + fmt(price) + '</div>Large letter (other Lettermail), ' + gr + ' g. ' + why + '.';
    }
    box.className = cls; box.innerHTML = html;
  }
  function est() {
    var n = +$('sheets').value || 0, per = +$('paper').value, env = +$('env').value;
    var g = n * per + env; $('wt').value = (Math.round(g * 10) / 10); $('unit').value = 'g'; calc();
    $('estnote').textContent = n + ' sheet' + (n === 1 ? '' : 's') + ' at ' + per + ' g plus a ' + env + ' g envelope is about ' + (Math.round(g * 10) / 10) + ' g.';
  }
  ['size','len','wid','thk','wt','unit'].forEach(function (id) { $(id).addEventListener('input', calc); });
  ['sheets','paper','env'].forEach(function (id) { $(id).addEventListener('input', est); });
  calc();
})();
</script>'''
body6 = f'''
  <p class="updated">Rates checked {MONTH}</p>
  <p class="answer">Pick your envelope, enter the weight of the sealed letter, and the calculator gives the Canada Post domestic letter rate. Don't know the weight? Enter the number of sheets below and it estimates it.</p>
  <div class="tool">
    <div class="grid">
      <div class="field"><label for="size">Envelope</label><select id="size">
        <option value="10">#10 business envelope (241 x 105 mm)</option>
        <option value="6x9">6 x 9 inch (229 x 152 mm)</option>
        <option value="9x12">9 x 12 inch (305 x 229 mm)</option>
        <option value="card">Card or small envelope (152 x 102 mm)</option>
        <option value="custom">Other size</option></select></div>
      <div class="field"><label for="wt">Weight of the sealed letter</label><input id="wt" type="number" min="0" step="0.1" value="20" inputmode="decimal"></div>
      <div class="field"><label for="unit">Unit</label><select id="unit"><option value="g">grams</option><option value="oz">ounces</option></select></div>
    </div>
    <div class="grid" id="customrow" style="display:none;margin-top:14px">
      <div class="field"><label for="len">Length (mm)</label><input id="len" type="number" min="0" step="1" value="241" inputmode="numeric"></div>
      <div class="field"><label for="wid">Width (mm)</label><input id="wid" type="number" min="0" step="1" value="105" inputmode="numeric"></div>
      <div class="field"><label for="thk">Thickness (mm)</label><input id="thk" type="number" min="0" step="0.5" value="3" inputmode="decimal"></div>
    </div>
    <div class="result" id="result" aria-live="polite"></div>
    <h2 style="margin-top:22px">Estimate the weight from the number of sheets</h2>
    <div class="grid">
      <div class="field"><label for="sheets">Sheets of paper</label><input id="sheets" type="number" min="0" step="1" placeholder="e.g. 3" inputmode="numeric"></div>
      <div class="field"><label for="paper">Paper</label><select id="paper"><option value="4.5">US Letter, 20 lb (75 gsm), 4.5 g a sheet</option><option value="5.4">US Letter, 24 lb (90 gsm), 5.4 g a sheet</option><option value="4.7">A4, 75 gsm, 4.7 g a sheet</option></select></div>
      <div class="field"><label for="env">Envelope</label><select id="env"><option value="6">Plain #10 envelope, about 6 g</option><option value="4">Light envelope, about 4 g</option><option value="9">Heavy or padded envelope, about 9 g</option></select></div>
    </div>
    <p class="hint" id="estnote">A sheet counts once whether it is printed on one side or both. These weights are typical, so weigh the real letter on a kitchen scale if it is close to 30 g or 50 g.</p>
  </div>
  <p class="caption">Source: {SRC_CP}, checked {MONTH}. Domestic letters only. Prices are Canada Post's and can change.</p>

  <h2>The rates</h2>
{rate_table()}

  <h2>Frequently asked questions</h2>
{faq_block(FAQ6)}

  <h2>Related</h2>
  {related([
      ('/tools/how-many-pages-per-stamp', 'How many pages can you mail with one stamp'),
      ('/tools/canadian-address-formatter', 'Canadian address formatter'),
      ('/send-mail-in-canada', 'Send mail in Canada: every way, with 2026 prices'),
      ('/postage-for-a-large-letter-in-canada', 'Postage for a large letter in Canada'),
      ('/canada-post-stamp-price-2027', 'Canada Post stamp price rising to $2 in 2027'),
  ])}

{cta_band('Rather not deal with stamps?', 'Type a letter or attach a file. We print it, add postage and mail it, $6 all in.')}
'''
ld_tool = lambda name, desc, url: {'@type': 'WebApplication', 'name': name, 'description': desc, 'url': url,
    'applicationCategory': 'UtilitiesApplication', 'operatingSystem': 'Any', 'browserRequirements': 'Requires JavaScript',
    'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'CAD'},
    'publisher': {'@type': 'Organization', 'name': 'Letterhome', 'url': BASE + '/'}}
page('tools/postage-calculator', 'Canada Post Letter Postage Calculator (2026 Rates)',
     'Work out the Canada Post letter rate from envelope size and weight. Standard letters from $1.44, large from $2.61. Rates checked November 2026.',
     'Canada Post letter postage calculator', 'Postage calculator', body6, FAQ6, eyebrow='Tool', app=True,
     extra_ld=ld_tool('Canada Post letter postage calculator', 'Domestic Canada Post letter rates by envelope size and weight.', BASE + '/tools/postage-calculator'),
     extra_script=calc_js)

# ═════════════════════════════ 7. Pages per stamp ═════════════════════════════
def sheets_table(per, env=6):
    rows = []
    for n in range(1, 13):
        g = n * per + env
        if g <= 30: tier = '$1.44'
        elif g <= 50: tier = '$1.75'
        elif g <= 100: tier = '$2.61 (large letter)'
        else: tier = '$4.29 (large letter)'
        rows.append(f'      <tr><td>{n}</td><td>{g:.1f} g</td><td>{tier}</td></tr>')
    return '\n'.join(rows)
FAQ7 = [
    ('How many pages can I mail with one stamp in Canada?',
     'About five sheets of 20 lb paper in a plain #10 envelope weigh under 30 g, so a single $1.44 stamp covers them. Six to nine sheets fall between 30 g and 50 g and need $1.75 in postage.'),
    ('How much does a sheet of paper weigh?',
     'A US Letter sheet of 20 lb (75 gsm) paper weighs about 4.5 g. A4 at 75 gsm is about 4.7 g, and heavier 24 lb (90 gsm) Letter paper is about 5.4 g. A plain #10 envelope adds about 6 g.'),
    ('Does printing on both sides change the weight?',
     'Not meaningfully. Two pages on one sheet use one sheet of paper, so the weight is the same as one page. Toner adds a fraction of a gram.'),
    ('What happens if the letter is over 50 g?',
     'It mails as other Lettermail, $2.61 up to 100 g. Over 245 by 156 mm or 5 mm thick also moves it out of the standard rate.'),
]
body7 = f'''
  <p class="updated">Rates checked {MONTH}</p>
  <div class="capsule"><strong>One $1.44 stamp covers about five sheets of 20 lb paper in a plain #10 envelope, and up to nine sheets with the $1.75 rate.</strong> The chart below shows the weight and postage from one to twelve sheets. Use the <a href="/tools/postage-calculator">postage calculator</a> if your paper or envelope is different.</div>

  <h2>Weight and postage by number of sheets</h2>
  <p class="body">US Letter, 20 lb (75 gsm) paper at about 4.5 g a sheet, in a plain #10 envelope at about 6 g, folded in three.</p>
  <div class="cost-wrap"><table class="cost">
    <thead><tr><th>Sheets</th><th>Weight with envelope</th><th>Domestic postage</th></tr></thead>
    <tbody>
{sheets_table(4.5)}
    </tbody>
  </table></div>
  <p class="caption">Weights are estimates from the paper weight, not a guarantee. Rates: {SRC_CP}, checked {MONTH}. Weigh the real letter if it is within a couple of grams of a limit.</p>

  <h2>Heavier paper</h2>
  <p class="body">With 24 lb (90 gsm) paper at about 5.4 g a sheet, four sheets plus the envelope come to 27.6 g, and five sheets come to 33 g, which moves the letter into the $1.75 rate. So the heavier the paper, the sooner you cross the 30 g line.</p>
  <div class="cost-wrap"><table class="cost">
    <thead><tr><th>Sheets</th><th>Weight with envelope</th><th>Domestic postage</th></tr></thead>
    <tbody>
{sheets_table(5.4)}
    </tbody>
  </table></div>

  <h2>Why the weight matters</h2>
  <p class="body">Canada Post prices the sealed envelope and everything in it. A letter under 30 g is $1.44, up to 50 g is $1.75, and over 50 g it moves to the large letter rates. A letter that is too thick (over 5 mm) or too large (over 245 by 156 mm) is a large letter even if it is light. The details are in <a href="/postage-for-a-large-letter-in-canada">postage for a large letter in Canada</a>.</p>

  <h2>Frequently asked questions</h2>
{faq_block(FAQ7)}

  <h2>Related</h2>
  {related([
      ('/tools/postage-calculator', 'Canada Post letter postage calculator'),
      ('/postage-for-a-large-letter-in-canada', 'Postage for a large letter in Canada'),
      ('/what-is-lettermail', 'What Lettermail is'),
      ('/send-mail-in-canada', 'Send mail in Canada: every way, with 2026 prices'),
  ])}

{cta_band('A long letter, no weighing', 'Letterhome prints up to five pages and mails them for you, $6 for the first two pages and the envelope and postage included.')}
'''
page('tools/how-many-pages-per-stamp', 'How Many Pages Can You Mail With One Stamp in Canada?',
     'One $1.44 stamp covers about five sheets of 20 lb paper in a #10 envelope. A chart of weight and postage from one to twelve sheets, with Canada Post 2026 rates.',
     'How many pages can you mail with one stamp in Canada?', 'Pages per stamp', body7, FAQ7, eyebrow='Tool')

# ═════════════════════════════ 8. Address formatter ═════════════════════════════
FAQ8 = [
    ('What is the correct format for a Canadian address?',
     'Recipient name on the first line, the street address on the second, then the city, two-letter province code and postal code on the third, for example OTTAWA ON K1A 0B1. For a unit, Canada Post prefers the unit number first, then a hyphen and the street number, as in 4-123 MAIN ST. Add CANADA on a last line when mailing from another country.'),
    ('How is a Canadian postal code written?',
     'Six characters in the pattern letter, number, letter, space, number, letter, number, such as K1A 0B1. The letters D, F, I, O, Q and U are not used, and W and Z are never the first letter.'),
    ('Why does Canada Post prefer capital letters and no punctuation?',
     'Mail is sorted by machines that read the address, and capital letters with no punctuation are the easiest for them to read. Mixed case is still delivered.'),
    ('Does the first letter of the postal code match the province?',
     'Yes. K, L, M, N and P are Ontario, G, H and J are Quebec, V is British Columbia, T is Alberta, and so on. The tool warns you when the first letter does not match the province you chose.'),
]
fmt_js = r'''
<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var PROV = { AB:'T', BC:'V', MB:'R', NB:'E', NL:'A', NS:'B', NT:'X', NU:'X', ON:'KLMNP', PE:'C', QC:'GHJ', SK:'S', YT:'Y' };
  function clean(s) { return (s || '').toUpperCase().replace(/[.,#]/g, '').replace(/\s+/g, ' ').trim(); }
  function build() {
    var name = clean($('name').value), unit = clean($('unit').value), num = clean($('num').value), street = clean($('street').value);
    var city = clean($('city').value), prov = $('prov').value, pc = clean($('pc').value).replace(/\s/g, '');
    var msgs = [], ok = true;
    if (pc) {
      if (!/^[ABCEGHJ-NPRSTVXY]\d[A-CEGHJ-NPRSTV-Z]\d[A-CEGHJ-NPRSTV-Z]\d$/.test(pc)) { msgs.push('That postal code is not in a valid Canadian format. Check for the letters D, F, I, O, Q and U, which are not used, and W or Z at the start.'); ok = false; }
      else if (prov && PROV[prov] && PROV[prov].indexOf(pc.charAt(0)) < 0) { msgs.push('A postal code starting with ' + pc.charAt(0) + ' does not match ' + prov + '. Check the province or the code.'); ok = false; }
      pc = pc.slice(0, 3) + ' ' + pc.slice(3);
    }
    var line2 = (unit ? unit + '-' : '') + [num, street].filter(Boolean).join(' ');
    var line3 = [city, prov, pc].filter(Boolean).join(' ');
    var lines = [name, line2, line3];
    if ($('abroad').checked) lines.push('CANADA');
    var out = lines.filter(Boolean).join('\n');
    $('out').textContent = out || 'Your address appears here.';
    var m = $('msg'); m.className = 'result ' + (msgs.length ? 'warn' : 'ok'); m.style.display = (msgs.length || (pc && ok)) ? '' : 'none';
    m.innerHTML = msgs.length ? msgs.join('<br>') : 'The postal code is in a valid format. This checks the format only, not that the address exists.';
  }
  ['name','unit','num','street','city','prov','pc','abroad'].forEach(function (id) { $(id).addEventListener('input', build); $(id).addEventListener('change', build); });
  $('copy').addEventListener('click', function () {
    var t = $('out').textContent, b = $('copy');
    function done() { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy address'; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, function () {}); }
    else { var r = document.createRange(); r.selectNodeContents($('out')); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
  });
  build();
})();
</script>'''
provs = [('', 'Select'), ('AB', 'Alberta'), ('BC', 'British Columbia'), ('MB', 'Manitoba'), ('NB', 'New Brunswick'),
         ('NL', 'Newfoundland and Labrador'), ('NS', 'Nova Scotia'), ('NT', 'Northwest Territories'), ('NU', 'Nunavut'),
         ('ON', 'Ontario'), ('PE', 'Prince Edward Island'), ('QC', 'Quebec'), ('SK', 'Saskatchewan'), ('YT', 'Yukon')]
popts = '\n'.join(f'<option value="{c}">{n}{(" (" + c + ")") if c else ""}</option>' for c, n in provs)
body8 = f'''
  <p class="updated">Updated {MONTH}</p>
  <p class="answer">Fill in the address and the tool writes it in the form Canada Post prefers: capital letters, no punctuation, the unit before the street number, and the postal code spaced correctly. It also checks the postal code format and whether it matches the province.</p>
  <div class="tool">
    <div class="grid">
      <div class="field"><label for="name">Recipient name</label><input id="name" type="text" autocomplete="off" value="Marie Tremblay"></div>
      <div class="field"><label for="unit">Unit or apartment (optional)</label><input id="unit" type="text" autocomplete="off" value="4"></div>
      <div class="field"><label for="num">Street number</label><input id="num" type="text" autocomplete="off" value="123"></div>
      <div class="field"><label for="street">Street name</label><input id="street" type="text" autocomplete="off" value="Main St"></div>
      <div class="field"><label for="city">City</label><input id="city" type="text" autocomplete="off" value="Ottawa"></div>
      <div class="field"><label for="prov">Province or territory</label><select id="prov">
{popts}
</select></div>
      <div class="field"><label for="pc">Postal code</label><input id="pc" type="text" autocomplete="off" value="K1A 0B1" maxlength="8"></div>
    </div>
    <p style="margin-top:14px"><label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="abroad" style="width:auto"> I am mailing from another country (adds CANADA)</label></p>
    <div class="result" id="msg" style="display:none" aria-live="polite"></div>
    <h2 style="margin-top:20px">Address for the envelope</h2>
    <div class="addr" id="out" aria-live="polite">Your address appears here.</div>
    <button class="mini-btn" id="copy" type="button">Copy address</button>
  </div>
  <p class="caption">Format source: Canada Post's addressing guidelines. The tool runs in your browser and does not store or send what you type.</p>

  <h2>How a Canadian address is built</h2>
  <p class="body">The recipient goes on the first line. The second line is the delivery address: the unit number, a hyphen, the street number and the street name with its type and direction abbreviated, as in <code>4-123 MAIN ST NW</code>. The third line holds the municipality, the two-letter province or territory code and the postal code, separated by a space, with no comma. A letter from another country adds <code>CANADA</code> on a fourth line. The full guide is in <a href="/how-to-address-a-letter-to-canada">how to address a letter to Canada</a>.</p>

  <h2>Frequently asked questions</h2>
{faq_block(FAQ8)}

  <h2>Related</h2>
  {related([
      ('/how-to-address-a-letter-to-canada', 'How to address a letter to Canada'),
      ('/tools/postage-calculator', 'Canada Post letter postage calculator'),
      ('/send-mail-in-canada', 'Send mail in Canada: every way, with 2026 prices'),
      ('/format-adresse-canadienne', "Format d'adresse canadienne (en français)"),
  ])}

{cta_band('We check the address before we print', 'Enter the recipient on the order form and Letterhome verifies the address before your letter is printed.')}
'''
page('tools/canadian-address-formatter', 'Canadian Address Formatter and Postal Code Checker',
     'Format a Canadian address the way Canada Post prefers and check the postal code. Capitals, no punctuation, unit first. Free, runs in your browser.',
     'Canadian address formatter and postal code checker', 'Address formatter', body8, FAQ8, eyebrow='Tool', app=True,
     extra_ld=ld_tool('Canadian address formatter and postal code checker', 'Formats a Canadian mailing address and checks the postal code format.', BASE + '/tools/canadian-address-formatter'),
     extra_script=fmt_js)
