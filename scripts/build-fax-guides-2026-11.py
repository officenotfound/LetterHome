#!/usr/bin/env python3
"""Fax guides, 2026-11-27: three for letterhome.ca and three for letterhome.us, written around the fax questions people
search for (sending a fax online, faxing from abroad or from a phone, fax cover sheets).
Run from the project root:  python3 scripts/build-fax-guides-2026-11.py

Every fact about the service matches fax.js and the fax pages: PDF, JPG or PNG up to 20 MB, up to 50 pages, Canadian and
US numbers only (no toll-free), a person checks every fax before it is sent, a busy line or no answer is tried twice more,
an email when the receiving machine has every page, files deleted 24 hours after the fax is finished. Prices are the
defaults in Settings ($3.00 CAD for up to 10 pages and $0.50 a page; $2.50 USD and $0.25 a page): if the prices change
in the admin, change them here and rebuild. Nothing here names the fax provider."""
import importlib.util, re

spec = importlib.util.spec_from_file_location('lg', 'scripts/build-local-guides.py')
lg = importlib.util.module_from_spec(spec); spec.loader.exec_module(lg)
lg.PUBLISHED = '2026-11-27'
spec2 = importlib.util.spec_from_file_location('bg', 'scripts/build-guides-2026-11.py')
bg = importlib.util.module_from_spec(spec2); spec2.loader.exec_module(bg)

RAIL = ('data-rail-title="We send it for you" data-rail-text="We check your fax, send it to any Canadian or US fax number, '
        'and email you when it has been delivered." data-rail-label="Send a fax" data-rail-meta="Pay securely with Stripe." ')

# ───────────────────────── Canada (house guide template) ─────────────────────────
def ca(slug, **k):
    d = dict(slug=slug, service_name="Online fax", cta_label="Send a fax →", cta_final="Send a fax →", eyebrow="Fax")
    d.update(k); return d

REL_FAX_ONLINE = ("/send-a-fax-online-canada", "Send a Fax Online in Canada", "No fax machine needed")
REL_FAX_ABROAD = ("/fax-to-canada-from-abroad", "Fax to Canada From Abroad", "From any country, to any Canadian number")
REL_FAX_COVER = ("/fax-cover-sheet", "Fax Cover Sheet", "What to put on it, with a template")
REL_FAX = ("/fax", "Send a Fax", "Upload, pay, and we send it")

CA = [
ca("send-a-fax-online-canada",
  title="How to Send a Fax Online in Canada (No Fax Machine) | Letterhome",
  meta_desc="Send a fax online to any Canadian or US fax number without a fax machine: upload a PDF or photo, pay $3 for up to 10 pages, and get an email when it is delivered.",
  breadcrumb="Send a Fax Online in Canada",
  h1_main="How to send a fax online", h1_em="in Canada.",
  hero_sub="No fax machine and no phone line. Upload the document and the number, and it is sent for you.",
  answer_box="To send a fax online in Canada, upload your document as a PDF, JPG or PNG, enter the fax number with its area code, and pay. With Letterhome it costs $3 for up to 10 pages. A person checks every fax before it is sent, and you get an email with the delivery time once the receiving machine has every page.",
  steps=[
   ("Get the document ready", "Save it as a PDF, or take a clear photo of each page. A phone's scan feature works well."),
   ("Enter the number and pay", "Type the fax number with its area code, add a cover note if you want one, and see the price before you pay."),
   ("Get the confirmation", "We email you when the receiving fax machine has every page, with the date and time."),
  ],
  warn=("Check the number first:", "use the fax number from the organization's own website or letter. Many offices list a phone number and a fax number side by side, and a fax sent to a phone line will not go through."),
  sections=[
   ("Who still asks for a fax", ["Many doctors' offices, pharmacies, insurers and law offices, and some government programs, still ask for documents by fax. If a form tells you to fax it and you do not have a machine, an online service is the simplest way."]),
   ("What you need", ["The document as a PDF, or a clear photo of each page as a JPG or PNG, up to 20 MB. The fax number, including the area code. An email address for your receipt and the delivery confirmation."]),
   ("What it costs", ["$3 CAD for up to 10 pages, including a cover page if you add one, and $0.50 for each page after that, up to 50 pages. The exact price is shown before you pay. Faxes can go to Canadian and US numbers; toll-free numbers are not accepted."]),
   ("If it does not go through", ["If the line is busy or does not answer, we try twice more. If it still does not go through, we email you about what happens next."]),
   ("Is it private?", ["Your file is stored privately and deleted 24 hours after the fax is finished. A fax travels over the phone network without encryption, so for very sensitive documents, make sure the office is expecting it."]),
  ],
  faq=[
   ("How much does it cost to send a fax in Canada?", "With Letterhome, $3 for up to 10 pages and $0.50 for each extra page. The price is shown before you pay."),
   ("Can I send a fax without a fax machine?", "Yes. Upload the document online and it is sent to the fax number for you. You do not need a machine or a phone line."),
   ("How do I know my fax went through?", "We email you once the receiving fax machine has every page, with the date and time. Keep that email as your record."),
   ("Can I send a fax to the US from Canada?", "Yes. Canadian and US fax numbers both work, at the same price."),
   ("How long does it take?", "A person checks every fax before it is sent, usually within a few hours. Sending itself takes a few minutes."),
  ],
  related=[REL_FAX_ABROAD, REL_FAX_COVER, ("/proof-of-mailing", "Proof You Sent a Letter", "When a letter is better than a fax"), REL_FAX],
  sources_text="",
  cta_h2="Send your fax", cta_p="Upload the document, enter the number, and we send it for you."),

ca("fax-to-canada-from-abroad",
  title="How to Send a Fax to Canada From Another Country | Letterhome",
  meta_desc="How to fax a document to a Canadian fax number from anywhere in the world, without a fax machine or an international call: upload it online for $3 for up to 10 pages.",
  breadcrumb="Fax to Canada From Abroad",
  h1_main="How to send a fax to Canada", h1_em="from another country.",
  hero_sub="Living abroad and asked to fax something home? You do not need a fax machine or an international line.",
  answer_box="To fax a document to Canada from another country, upload it as a PDF, JPG or PNG to an online fax service and enter the Canadian fax number with its area code. With Letterhome it costs $3 CAD for up to 10 pages, you can pay with a card from any country, and the fax is sent over a North American line, so there is no international call.",
  steps=[
   ("Scan or photograph the document", "A PDF is best. A clear photo of each page also works."),
   ("Enter the Canadian fax number", "Ten digits with the area code, such as 613-555-0123. You do not need to add a country code."),
   ("Pay and get the confirmation", "Pay by card from any country. We email you when the fax has been delivered."),
  ],
  warn=("Writing the number:", "a Canadian fax number has 10 digits, starting with the area code. If an office gives it as +1 613 555 0123, the +1 is the country code for Canada and the US, and you can leave it out."),
  sections=[
   ("Why fax from abroad", ["Canadians living abroad are often asked to fax documents home: to a doctor or pharmacy, an insurer, a bank, a lawyer or a former employer. A fax machine is rare outside offices, and calling a Canadian fax line from overseas can be costly or impossible."]),
   ("What it costs", ["$3 CAD for up to 10 pages and $0.50 for each page after that, up to 50 pages. Your card is charged in Canadian dollars, so your bank may convert the amount. The exact price is shown before you pay."]),
   ("When to mail instead", ["Some offices do not accept faxes, or need an original signature. If they want the document on paper, we can print it and mail it from inside Canada instead."]),
  ],
  faq=[
   ("Can I send a fax to Canada from another country?", "Yes. Upload the document online and enter the Canadian fax number. The fax is sent from a North American line, so it is not an international call."),
   ("How much does it cost to fax to Canada from abroad?", "With Letterhome, $3 CAD for up to 10 pages and $0.50 for each extra page."),
   ("Do I need to add a country code?", "No. Enter the 10-digit number with its area code."),
   ("Can I pay with a foreign card?", "Yes. Cards from any country are accepted, charged in Canadian dollars."),
  ],
  related=[REL_FAX_ONLINE, REL_FAX_COVER, ("/how-to-send-a-letter-to-canada-from-abroad", "Send a Letter to Canada From Abroad", "When it needs to be on paper"), REL_FAX],
  sources_text="",
  cta_h2="Fax it home", cta_p="Upload the document, enter the number, and we send it for you."),

ca("fax-cover-sheet",
  title="Fax Cover Sheet: What to Include (Free Template) | Letterhome",
  meta_desc="What to put on a fax cover sheet: who it is for, who it is from, the date, the number of pages and a short note. A plain template you can copy, and when you need one.",
  breadcrumb="Fax Cover Sheet", eyebrow="Fax",
  h1_main="Fax cover sheet:", h1_em="what to include.",
  hero_sub="The first page of a fax tells the person at the other end who it is for and how many pages to expect.",
  answer_box="A fax cover sheet lists who the fax is for, who it is from with a phone number or email, the date, the total number of pages including the cover, and a short note. It matters most when a fax goes to a shared machine, so it reaches the right person and they can tell if a page is missing.",
  steps=[
   ("Say who it is for", "The person's name and department, and their fax number."),
   ("Say who it is from", "Your name and a way to reach you, such as a phone number or email."),
   ("Count the pages and add a note", "The total pages including the cover, and one or two lines about what is attached."),
  ],
  warn=("Count the cover page:", "write the total number of pages including the cover sheet, so the person can check that nothing is missing."),
  sections=[
   ("A template you can copy", ["FAX<br><br>To: Name, department<br>Fax: 613-555-0123<br>From: Your name<br>Phone or email: how to reach you<br>Date: 2026-11-27<br>Pages: 4 including this page<br><br>Note: Please find my completed form attached, for file 12345."]),
   ("Do you need one?", ["Not always, but it helps whenever a fax goes to an office where many people share one machine. Many forms and offices also ask for a reference number, such as a file or claim number, on the first page."]),
   ("We can add it for you", ["When you send a fax with Letterhome, write a note and we add a plain cover page with who it is from, the date, the page count and your note. It counts as one of your pages."]),
  ],
  faq=[
   ("What goes on a fax cover sheet?", "Who it is for and their fax number, who it is from and how to reach you, the date, the total pages including the cover, and a short note."),
   ("Is a fax cover sheet required?", "Not usually, but many offices expect one, and it helps the fax reach the right person."),
   ("Does the cover sheet count as a page?", "Yes. Include it in the page count you write on it."),
  ],
  related=[REL_FAX_ONLINE, REL_FAX_ABROAD, ("/letter-templates", "Letter Templates", "Other templates you can copy"), REL_FAX],
  sources_text="",
  cta_h2="Send a fax with a cover page", cta_p="Write a note and we add the cover page for you."),
]

# ───────────────────────── US (shared US guide shell) ─────────────────────────
US_REL_ONLINE = ('/us/send-a-fax-online', 'How to send a fax online', 'No fax machine needed')
US_REL_PHONE = ('/us/how-to-fax-from-iphone', 'How to fax from your phone', 'iPhone or Android')
US_REL_COVER = ('/us/fax-cover-sheet', 'Fax cover sheet template', 'What to put on the first page')
US_REL_FAX = ('/us/fax', 'Send a fax', 'Upload, pay, and we send it')

US_SERVICE = '''<h2>Sending it with Letterhome</h2>
<p>Upload a PDF, JPG or PNG, enter the fax number and pay: $2.50 for up to 10 pages and $0.25 for each page after that, up to 50 pages. A person checks every fax before it is sent, usually within a few hours. If the line is busy or does not answer, we try twice more, and we email you when the receiving machine has every page. Faxes go to US and Canadian numbers; toll-free numbers are not accepted. Your file is deleted 24 hours after the fax is finished.</p>'''

US = [
dict(c='us', slug='send-a-fax-online',
 title='How to Send a Fax Online Without a Fax Machine',
 desc='Send a fax online to any US or Canadian fax number without a fax machine or phone line: upload a PDF or photo, pay $2.50 for up to 10 pages, and get an email when it is delivered.',
 eyebrow='Fax', h1='How to send a fax<br><em>online</em>',
 sub='No fax machine and no phone line. Upload the document and the number, and it is sent for you.',
 answer='To send a fax online, upload your document as a PDF, JPG or PNG, enter the fax number with its area code, and pay. With Letterhome it costs $2.50 for up to 10 pages. A person checks every fax before it is sent, and you get an email with the delivery time once the receiving machine has every page.',
 body='''
<h2>The steps</h2>
<ol>
<li><strong>Get the document ready.</strong> Save it as a PDF, or take a clear photo of each page. Your phone's document scanner works well.</li>
<li><strong>Enter the fax number.</strong> Ten digits with the area code. Use the number from the office's own website or letter.</li>
<li><strong>Add a cover note if you want one.</strong> We turn it into a cover page with your name, the date and the page count.</li>
<li><strong>Pay and wait for the confirmation.</strong> We email you when the fax has been delivered, with the date and time.</li>
</ol>

<h2>Who still asks for a fax</h2>
<p>Doctors' offices, pharmacies, insurers, law offices and some government agencies still ask for documents by fax. If a form says to fax it and you do not have a machine, sending it online is the simplest way.</p>

<h2>Common reasons a fax fails</h2>
<ul>
<li><strong>A phone number instead of a fax number.</strong> Many offices list both side by side.</li>
<li><strong>A busy line.</strong> Shared office machines are often busy; a second try usually works.</li>
<li><strong>A machine that is off or out of paper.</strong></li>
</ul>
''' + US_SERVICE,
 faq=[('How do I send a fax without a fax machine?', 'Upload the document to an online fax service, enter the fax number and pay. It is sent to the fax machine for you.'),
      ('How much does it cost to send a fax online?', 'With Letterhome, $2.50 for up to 10 pages and $0.25 for each extra page. The price is shown before you pay.'),
      ('How do I know my fax went through?', 'We email you once the receiving machine has every page, with the date and time.'),
      ('Can I send a fax to Canada?', 'Yes. US and Canadian fax numbers both work, at the same price.'),
      ('How long does it take to send a fax online?', 'A person checks every fax before it is sent, usually within a few hours. Sending takes a few minutes.')],
 sources=[],
 related=[US_REL_PHONE, US_REL_COVER, US_REL_FAX, ('/us/how-to-address-an-envelope', 'How to address an envelope', 'When it has to go by mail')]),

dict(c='us', slug='how-to-fax-from-iphone',
 title='How to Fax From an iPhone or Android Phone',
 desc='How to send a fax from your phone without an app subscription: scan the document with your phone, upload it in your browser, enter the fax number and pay $2.50 for up to 10 pages.',
 eyebrow='Fax', h1='How to fax from<br><em>your phone</em>',
 sub='Scan the pages with your phone, upload them in your browser, and the fax is sent for you.',
 answer='To fax from an iPhone or Android phone, scan the document with the phone\'s built-in scanner to make a PDF, then upload it to an online fax service in your browser and enter the fax number. With Letterhome there is no app or subscription: you pay $2.50 for up to 10 pages, and we email you when it is delivered.',
 body='''
<h2>Step 1: scan the document</h2>
<ul>
<li><strong>iPhone:</strong> the Notes app and the Files app can both scan documents. The result is a PDF you can save to Files.</li>
<li><strong>Android:</strong> the Google Drive app has a Scan button that saves a PDF to your Drive.</li>
</ul>
<p>Scan in good light on a flat, dark surface, and check that every page is straight and readable. A photo of each page also works.</p>

<h2>Step 2: upload it and enter the number</h2>
<p>Open the fax page in your phone's browser, choose the PDF from Files or Drive, type the fax number with its area code, and add a cover note if you want one. You see the exact price before you pay.</p>

<h2>Step 3: get the confirmation</h2>
<p>We email you when the receiving machine has every page, with the date and time. Keep that email as your record.</p>

<h2>Do you need a fax app?</h2>
<p>Not for an occasional fax. Many fax apps are subscriptions built for people who fax every week. If you only need to send one now and then, paying per fax is usually cheaper.</p>
''' + US_SERVICE,
 faq=[('Can I fax from my iPhone?', 'Yes. Scan the document to a PDF with the Notes or Files app, then upload it to an online fax service in your browser.'),
      ('How do I fax from an Android phone?', 'Scan the document with the Google Drive app, then upload the PDF to an online fax service in your browser.'),
      ('Do I need an app to fax from my phone?', 'No. You can upload the document in your browser and pay per fax.'),
      ('How much does it cost to fax from a phone?', 'With Letterhome, $2.50 for up to 10 pages and $0.25 for each extra page.')],
 sources=[],
 related=[US_REL_ONLINE, US_REL_COVER, US_REL_FAX, ('/us/mail-a-letter-without-a-printer', 'Mail a letter without a printer', 'When it has to go on paper')]),

dict(c='us', slug='fax-cover-sheet',
 title='Fax Cover Sheet Template: What to Include',
 desc='What to put on a fax cover sheet: who it is for, who it is from, the date, the number of pages and a short note. A plain template you can copy, and when you need one.',
 eyebrow='Fax', h1='Fax cover sheet<br><em>template</em>',
 sub='The first page of a fax tells the person at the other end who it is for and how many pages to expect.',
 answer='A fax cover sheet lists who the fax is for and their fax number, who it is from with a phone number or email, the date, the total number of pages including the cover, and a short note. It matters most when a fax goes to a shared machine, so it reaches the right person and they can tell if a page is missing.',
 body='''
<h2>A template you can copy</h2>
<pre class="addr">FAX

To:        Name, department
Fax:       (212) 555-0123
From:      Your name
Phone:     How to reach you
Date:      November 27, 2026
Pages:     4 (including this page)

Note: Please find my completed claim form attached,
for claim number 12345.</pre>

<h2>What each line is for</h2>
<ul>
<li><strong>To and fax number:</strong> so the right person gets it from a shared machine.</li>
<li><strong>From and phone or email:</strong> so they can reach you if a page is unreadable.</li>
<li><strong>Pages, including the cover:</strong> so they can tell if anything is missing.</li>
<li><strong>A reference number:</strong> a claim, account or file number, if the office gave you one.</li>
</ul>

<h2>Do you need one?</h2>
<p>Not always, but many offices expect one, and it helps any fax that goes to a shared machine.</p>

<h2>We can add it for you</h2>
<p>When you send a fax with Letterhome, write a note and we add a plain cover page with your name, the date, the page count and the note. It counts as one of your pages.</p>
''' + US_SERVICE,
 faq=[('What goes on a fax cover sheet?', 'Who it is for and their fax number, who it is from and how to reach you, the date, the total pages including the cover, and a short note.'),
      ('Is a fax cover sheet required?', 'Not usually, but many offices expect one.'),
      ('Does the cover sheet count as a page?', 'Yes. Include it in the page count you write on it.')],
 sources=[],
 related=[US_REL_ONLINE, US_REL_PHONE, US_REL_FAX, ('/us/business-letter-format', 'Business letter format', 'Layout and sign-offs')]),
]

# English pages that have a French or Spanish twin (scripts/build-fax-guides-fr-es-2026-11.py): hreflang both ways, and on the
# US pages a data-alt link for the Español switch.
B = 'https://letterhome.ca'
TWINS = {
    'send-a-fax-online-canada': [('en-CA', '/send-a-fax-online-canada'), ('fr-CA', '/comment-envoyer-un-fax-sans-telecopieur')],
    'fax-cover-sheet': [('en-CA', '/fax-cover-sheet'), ('fr-CA', '/page-couverture-fax')],
    'us/send-a-fax-online': [('en-US', '/us/send-a-fax-online'), ('es-US', '/us/es/como-enviar-un-fax-en-linea')],
    'us/fax-cover-sheet': [('en-US', '/us/fax-cover-sheet'), ('es-US', '/us/es/portada-de-fax')],
}
def with_twins(out, key):
    pairs = TWINS.get(key)
    if not pairs:
        return out
    links = ''.join(f'<link rel="alternate" hreflang="{k}" href="{B}{v}">\n' for k, v in pairs) + f'<link rel="alternate" hreflang="x-default" href="{B}{pairs[0][1]}">'
    out = re.sub(r'(<link rel="canonical"[^>]*>)', lambda m: m.group(1) + '\n' + links, out, count=1)
    if key.startswith('us/'):
        out = out.replace('<html ', f'<html data-alt="{pairs[1][1]}" data-alt-label="ES" ', 1)
    else:
        out = re.sub(r'(<html\b[^>]*?)\s+data-en-only\b', r'\1', out, count=1)
    return out

def us_page(p):
    out = lg.build(p)
    out = out.replace('<h2>Sources</h2>\n<ul class="sources"></ul>\n', '')
    out = out.replace('href="/send?to=US" class="hero-cta">Send a letter →', 'href="/us/fax" class="hero-cta">Send a fax →')
    out = out.replace('<div class="cta-block"><h2>Got a letter to send?</h2><p>Type it online and we print and mail it for you.</p><a href="/send?to=US">Send a letter →</a></div>',
                      '<div class="cta-block"><h2>Got a fax to send?</h2><p>Upload the document, enter the number, and we send it for you.</p><a href="/us/fax">Send a fax →</a></div>')
    out = out.replace('<html ', '<html ' + RAIL, 1)
    assert 'Send a fax →' in out and 'Got a letter to send' not in out
    return with_twins(out, 'us/' + p['slug'])

def ca_page(g):
    out = bg.build_ca(g)
    out = out.replace('<a href="/send" class="hero-cta">', '<a href="/fax" class="hero-cta">')
    out = re.sub(r'(<div class="cta-block">\s*<h2>[^<]*</h2>\s*<p>[^<]*</p>\s*)<a href="/send">', r'\1<a href="/fax">', out)
    out = out.replace('"price": "6"', '"price": "3"')
    out = re.sub(r'<p[^>]*>Sources:\s*</p>\s*', '', out)
    out = out.replace('<html ', '<html ' + RAIL, 1)
    assert 'href="/fax" class="hero-cta"' in out
    return with_twins(out, g['slug'])

if __name__ == '__main__':
    for g in CA:
        open(f"public/{g['slug']}.html", 'w', encoding='utf-8').write(ca_page(g)); print('wrote', g['slug'])
    for p in US:
        open(f"public/us-{p['slug']}.html", 'w', encoding='utf-8').write(us_page(p)); print('wrote us-' + p['slug'])
