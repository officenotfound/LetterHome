#!/usr/bin/env python3
"""Letter-writing guides, 2026-11-26: writing to someone in prison, the President, Congress, a company CEO, military
(APO/FPO/DPO) addresses, teachers and nurses (US); the King (UK); the Prime Minister (Canada).
Run from the project root:  python3 scripts/build-civic-letter-guides-2026-11.py

What we can and cannot do is stated plainly on every page and matches the order form: letters only, printed (black and
white by default, colour optional), in a window envelope with printed postage, no enclosures, no stamps or return
envelopes, and no APO/FPO/DPO addresses (the form refuses them). Nothing promises that a facility, office or person
accepts or answers the letter.

Facts checked 2026-11-26 against: bop.gov inmate communications and inmate locator; usps.com military and diplomatic
mail and USPS Publication 28 section 2.10 (APO/FPO/DPO format, codes, domestic prices); whitehouse.gov/contact;
senate.gov contacting senators; house.gov find your representative; royal.uk/contact; pm.gc.ca contact; the Canada
Post Corporation Act s. 35 (free mail to members of the House of Commons); SEC Form 10-K (cover page address of
principal executive offices); nursingworld.org (National Nurses Week May 6 to 12); school and union calendars for
Teacher Appreciation Week 2026 (May 4 to 8, National Teacher Day May 5)."""
import importlib.util, os, sys

spec = importlib.util.spec_from_file_location('lg', 'scripts/build-local-guides.py')
lg = importlib.util.module_from_spec(spec); spec.loader.exec_module(lg)
lg.PUBLISHED = '2026-11-26'

US_REL_ENV = ('/us/how-to-address-an-envelope', 'How to address an envelope', 'Where everything goes')
US_REL_STAMP = ('/us/how-much-is-a-stamp', 'How much is a stamp in 2026?', 'The Forever stamp price and what it covers')
US_REL_RET = ('/us/return-address-on-a-letter', 'Do you need a return address?', 'When USPS needs one and when it does not')
US_REL_BIZ = ('/us/business-letter-format', 'Business letter format', 'Layout, spacing and sign-offs')
US_REL_FAN = ('/us/how-to-send-fan-mail', 'How to send fan mail', 'Where letters to famous people go')
US_REL_PRES = ('/us/how-to-write-to-the-president', 'How to write to the President', 'The White House address and what to include')
US_REL_CONG = ('/us/how-to-write-to-congress', 'How to write to Congress', 'Your senators and representative')
US_REL_TEACH = ('/us/thank-you-letter-to-a-teacher', 'Thank-you letter to a teacher', 'What to say and when to send it')
US_REL_NURSE = ('/us/thank-you-letter-to-a-nurse', 'Thank-you letter to a nurse', 'For the care you or your family got')
SRC_N123 = ('USPS Notice 123: current price list', 'https://pe.usps.com/text/dmm300/Notice123.htm')

US_SEND = ('<h2>Sending it without a printer</h2>\n<p>Type or paste your letter into our order form and we print it, put it in a window envelope and mail it for $3.00 within the US, postage included. '
           'Pages are printed in black and white unless you choose color. We send the letter only, so anything else you want to include has to go in an envelope you mail yourself.</p>')

PAGES = [
# ───────────────────────── Prison ─────────────────────────
dict(c='us', slug='how-to-write-to-an-inmate',
 title='How to Send a Letter to an Inmate (2026 Guide)',
 desc='How to address a letter to someone in prison or jail: finding their ID number and facility, the address format, the mail rules to check first, and what gets letters returned.',
 eyebrow='Letter writing', h1='How to send a letter<br><em>to an inmate</em>',
 sub='Find the person\'s ID number, check the facility\'s mail rules, and address it exactly the way the facility asks.',
 answer='Address the letter with the person\'s full committed name and their inmate ID number, then the mailing address the facility publishes for inmate mail, which is often different from its street address. Put your full name and return address on the envelope, and check the facility\'s mail rules before you send anything.',
 body='''
<h2>Step 1: find the person and their ID number</h2>
<p>Mail is sorted by ID number, not just by name, so you need both. Use the name the person was committed under, even if they go by another one.</p>
<ul>
<li><strong>Federal prison:</strong> the Federal Bureau of Prisons inmate locator finds anyone held in a federal facility since 1982, by name or number. A federal register number has eight digits, written like 12345-678.</li>
<li><strong>State prison:</strong> each state's department of corrections has its own offender search on its website.</li>
<li><strong>County or city jail:</strong> the sheriff's office or the jail's website usually has an inmate lookup.</li>
</ul>

<h2>Step 2: get the facility's mailing address and rules</h2>
<p>Look for a page called Mail, Correspondence or Sending mail on the facility's or department's website. Many facilities want letters sent to a special mailing address or P.O. box, and some send all personal mail to an outside center that scans it and gives the person a copy. Use exactly the address they list for inmate mail.</p>
<p>Read the rules before you write. Common ones include:</p>
<ul>
<li>Your full name and return address on the envelope. Letters with no return address are often refused.</li>
<li>Plain white paper and a plain white envelope.</li>
<li>No stickers, tape, glitter, perfume, lipstick, crayon or marker.</li>
<li>Limits on photos: how many, what size, and whether printed copies are allowed.</li>
<li>No cash or personal checks. Money is sent through the facility's own deposit options.</li>
</ul>
<p>A letter that breaks one of these rules is often sent back or thrown away. Federal prisons open and inspect general mail for contraband and for content that could threaten security.</p>

<h2>Step 3: address the envelope</h2>
<p>Most facilities use a layout like this, with the ID number on the same line as the name:</p>
<pre class="addr">John Smith #12345-678
Example Correctional Institution
P.O. Box 1000
Anytown, ST 12345</pre>
<p>That address is made up to show the layout. Copy the real one from the facility's mail page, including any housing unit if they ask for it, and put your own full name and address in the top left corner.</p>

<h2>What to write</h2>
<ul>
<li><strong>News from home matters most.</strong> Everyday details about family, friends and the neighborhood make a letter worth rereading.</li>
<li><strong>Assume someone else will read it.</strong> Staff can read general mail, so do not write about the person's case, other people's crimes, or anything that sounds like a plan or a code.</li>
<li><strong>Ask questions.</strong> It gives the person something to answer and keeps the letters going.</li>
<li><strong>Number your pages,</strong> since pages can be separated when mail is inspected or scanned.</li>
</ul>

<h2>Sending it with Letterhome</h2>
<p>We can print and mail a typed letter for you, for $3.00 within the US. Before you order, check that the facility allows what we send:</p>
<ul>
<li>A letter printed on plain white paper, black and white unless you choose color.</li>
<li>A white window envelope with printed postage. Your name and return address are printed on the envelope from the details you enter, so do not choose to send it without a return address.</li>
<li>The letter only. We cannot include photo prints, stamps, money orders, books or return envelopes.</li>
</ul>
<p>If the facility only accepts handwritten letters, stamps rather than printed postage, or mail through its own approved service, mail it yourself or use the service it names.</p>
''',
 faq=[('How do I find someone\'s inmate ID number?', 'Use the inmate locator for the system holding them: the Federal Bureau of Prisons locator for federal prisons, the state department of corrections offender search for state prisons, or the sheriff or jail website for county jails.'),
      ('What is the address format for a letter to an inmate?', 'The person\'s committed name and ID number on the first line, then the facility name and the mailing address it publishes for inmate mail. Put your full name and return address on the envelope.'),
      ('Can I send a letter to an inmate without a return address?', 'Usually not. Most facilities refuse or return mail without the sender\'s full name and address.'),
      ('Why was my letter to an inmate returned?', 'Common reasons are a missing ID number, a wrong mailing address, no return address, or something the facility does not allow, such as stickers, colored paper or too many photos.'),
      ('Do prisons read inmate mail?', 'Staff open and inspect general mail. Federal prisons inspect it for contraband and for content that could threaten security. Some facilities scan letters and give the person a copy.'),
      ('Can I send photos to an inmate?', 'Many facilities allow a small number of photos, with limits on size and content. Check the facility\'s mail rules first.'),
      ('Can Letterhome send a letter to an inmate?', 'We can print and mail a typed letter with your name and return address on the envelope. Check first that the facility accepts printed letters with printed postage. We cannot include photos, stamps or money.')],
 sources=[('Federal Bureau of Prisons: communications with inmates', 'https://www.bop.gov/inmates/communications.jsp'),
          ('Federal Bureau of Prisons: inmate locator', 'https://www.bop.gov/inmateloc/')],
 related=[US_REL_ENV, US_REL_RET, US_REL_STAMP, ('/us/mail-a-letter-without-a-printer', 'Mail a letter without a printer', 'Three ways to get a letter sent')]),

# ───────────────────────── President ─────────────────────────
dict(c='us', slug='how-to-write-to-the-president',
 title='How to Write a Letter to the President (2026)',
 desc='The White House mailing address, how to address the envelope and start the letter, what to include, and other ways to send your message.',
 eyebrow='Civic letters', h1='How to write a letter<br><em>to the President</em>',
 sub='The White House address, the right greeting, and how to make your letter count.',
 answer='Mail your letter to The White House, 1600 Pennsylvania Avenue NW, Washington, DC 20500. Start with "Dear Mr. President" or "Dear Madam President", keep it to one page on one subject, and include your full name and return address so a reply can reach you.',
 body='''
<h2>The address</h2>
<pre class="addr">The President
The White House
1600 Pennsylvania Avenue NW
Washington, DC 20500</pre>
<p>This is the address the White House lists for mail. It also has an online contact form if you would rather send your message that way.</p>

<h2>How to start and end the letter</h2>
<ul>
<li><strong>Greeting:</strong> "Dear Mr. President:" or "Dear Madam President:".</li>
<li><strong>Closing:</strong> "Respectfully," or "Sincerely," then your signature and your typed name.</li>
<li>Put your full name, address and email at the top or under your name, so the office can answer you.</li>
</ul>

<h2>What to include</h2>
<ol>
<li><strong>One subject.</strong> Say in the first sentence what you are writing about.</li>
<li><strong>Why it matters to you.</strong> A short personal example is more persuasive than a long argument.</li>
<li><strong>What you are asking for,</strong> such as support for a bill, a change to a policy, or recognition for someone.</li>
<li><strong>Your contact details,</strong> so you can get a reply.</li>
</ol>
<p>Keep it polite and to one page. Mail to the White House can take a while to be opened and answered, so if your issue has a deadline, also use the online form.</p>

<h2>Writing about a problem with a federal agency</h2>
<p>If you need help with a federal agency, such as Social Security, the IRS or Veterans Affairs, your senators and representative have staff whose job is to help people in their state or district with exactly that. A letter to them is often the faster route. See <a href="/us/how-to-write-to-congress">how to write to Congress</a>.</p>
''' + US_SEND,
 faq=[('What is the address to send a letter to the President?', 'The White House, 1600 Pennsylvania Avenue NW, Washington, DC 20500.'),
      ('How do you start a letter to the President?', 'Use "Dear Mr. President:" or "Dear Madam President:", and close with "Respectfully," or "Sincerely,".'),
      ('Does the President read the letters?', 'The White House receives a very large amount of mail, and staff handle it. Include your return address if you want a reply.'),
      ('Can I email the President?', 'The White House has an online contact form on whitehouse.gov.'),
      ('How much postage does a letter to the White House need?', 'A normal one-ounce letter needs one Forever stamp, $0.82 in 2026.')],
 sources=[('The White House: contact', 'https://www.whitehouse.gov/contact/'), SRC_N123],
 related=[US_REL_CONG, US_REL_BIZ, US_REL_ENV, US_REL_FAN]),

# ───────────────────────── Congress ─────────────────────────
dict(c='us', slug='how-to-write-to-congress',
 title='How to Write a Letter to Your Senator or Representative',
 desc='How to find your two senators and your representative, the Washington addresses, how to address the letter, and what gets a letter to Congress noticed.',
 eyebrow='Civic letters', h1='How to write<br><em>to Congress</em>',
 sub='Your two senators and your representative work for you. Here is how to reach them by mail.',
 answer='Write to the two senators for your state and the representative for your district. Senators get mail at United States Senate, Washington, DC 20510, and representatives at U.S. House of Representatives, Washington, DC 20515, or at the local office on their website. Put your home address on the letter so they know you are a constituent.',
 body='''
<h2>Find who represents you</h2>
<p>Everyone in a state has two senators and one representative. Find your representative by entering your ZIP code on house.gov, and your senators by choosing your state on senate.gov. Both sites link to each member's own website, which lists their Washington and local office addresses.</p>
<p>Write to your own members. Offices focus on people from their state or district, and the Senate notes that many senators will acknowledge but not answer mail from people outside their state.</p>

<h2>The addresses</h2>
<p><strong>A senator:</strong></p>
<pre class="addr">The Honorable Jane Doe
United States Senate
Washington, DC 20510</pre>
<p><strong>A representative:</strong></p>
<pre class="addr">The Honorable John Doe
U.S. House of Representatives
Washington, DC 20515</pre>
<p>Each member's website gives their exact room and building, and their offices back home. A local office is a good choice for a letter about a local issue or a problem with a federal agency.</p>

<h2>What to put in the letter</h2>
<ol>
<li><strong>Your full name and home address,</strong> so the office can see you live in their state or district and can reply. The Senate asks for a return address on all mail.</li>
<li><strong>One issue, named in the first sentence.</strong> If it is about a bill, give its number, such as H.R. 1234 or S. 567.</li>
<li><strong>Why it matters to you,</strong> in a few sentences of your own.</li>
<li><strong>What you want them to do:</strong> vote for or against, co-sponsor, or help with a case.</li>
</ol>
<p>Start with "Dear Senator Doe:" or "Dear Representative Doe:" and close with "Sincerely,". Keep it to one page and be polite. A short letter in your own words carries more weight than a form letter.</p>

<h2>Getting help with a federal agency</h2>
<p>Members of Congress have caseworkers who help constituents with federal agencies, such as a delayed passport, a Social Security problem or a veterans' benefits claim. Write to the local office, explain the problem and what you have already tried, and include any case or reference numbers.</p>

<h2>If it is urgent</h2>
<p>A letter takes time to arrive and be answered. If your issue has a deadline, also call the office or use the contact form on the member's website. The U.S. Capitol switchboard at (202) 224-3121 can connect you to any office.</p>
''' + US_SEND,
 faq=[('What is the address to write to a senator?', 'The Honorable (name), United States Senate, Washington, DC 20510. Each senator\'s website gives the exact office address and their state offices.'),
      ('What is the address to write to a representative?', 'The Honorable (name), U.S. House of Representatives, Washington, DC 20515. Each representative\'s website gives the exact office address and the district offices.'),
      ('How do I find my representative?', 'Enter your ZIP code on house.gov. Choose your state on senate.gov to find your two senators.'),
      ('Do members of Congress read letters?', 'Their staff handle the mail. Offices focus on letters from their own constituents, and a short, personal letter on one issue is the easiest to act on.'),
      ('Should I write to my senator\'s Washington office or local office?', 'Either works. A local office is often better for a local issue or for help with a federal agency.'),
      ('How should I start a letter to a senator?', '"Dear Senator (last name):". For a representative, "Dear Representative (last name):".')],
 sources=[('U.S. Senate: contacting senators', 'https://www.senate.gov/senators/senators-contact.htm'),
          ('U.S. House of Representatives: find your representative', 'https://www.house.gov/representatives/find-your-representative')],
 related=[US_REL_PRES, US_REL_BIZ, US_REL_ENV, US_REL_RET]),

# ───────────────────────── CEO complaint ─────────────────────────
dict(c='us', slug='complaint-letter-to-a-ceo',
 title='How to Write a Complaint Letter to a CEO (With Template)',
 desc='When customer service has failed: how to find a company CEO\'s office address, what to put in an executive complaint letter, a template, and what to do if nothing happens.',
 eyebrow='Letter writing', h1='How to write a complaint<br><em>letter to a CEO</em>',
 sub='When customer service has gone nowhere, a short, factual letter to the top often gets a problem to the right person.',
 answer='Send a one-page letter to the CEO at the company\'s headquarters. Give your account or order number, what went wrong, what you have already tried, and exactly what you want done by a date. Many large companies pass these letters to an executive customer care team that can fix things normal support cannot.',
 body='''
<h2>Why writing to the CEO works</h2>
<p>A CEO rarely reads every letter, but at many large companies, mail to the chief executive is passed to a team that handles escalated complaints. That team can often make decisions that front-line support cannot, such as refunds outside the normal rules. A clear, polite letter on paper is hard to ignore.</p>

<h2>Find the headquarters address</h2>
<ul>
<li><strong>The company's website.</strong> Look under Contact, About, Investors or Corporate information for a headquarters or corporate office address.</li>
<li><strong>Public company filings.</strong> US public companies list the address of their principal executive offices on the cover of their annual report, Form 10-K, which you can find free on the SEC's EDGAR search.</li>
<li><strong>The CEO's name.</strong> It is usually on the company's leadership or investor relations page. Address the letter to them by name.</li>
</ul>

<h2>What to put in the letter</h2>
<ol>
<li><strong>Your details:</strong> name, address, email, phone, and your account, order or case number.</li>
<li><strong>What happened,</strong> in short dated points. Stick to facts.</li>
<li><strong>What you have already tried:</strong> who you spoke to, when, and what they said.</li>
<li><strong>What you want:</strong> a refund, a repair, a replacement or a correction, and a reasonable date, such as 14 days.</li>
</ol>
<p>Keep it to one page and stay polite. Anger makes a letter easier to dismiss. Do not send original receipts; send copies and keep the originals.</p>

<h2>A template you can adapt</h2>
<pre class="addr">Dear Ms. Lee,

I am writing about order 48213, placed on September 3, 2026.

The laptop arrived with a cracked screen on September 8. I reported it
the same day (case 77120) and was promised a replacement twice, on
September 15 and October 2. No replacement has arrived.

I would like a full refund of $1,149.00 to my original card by
December 10, 2026. Copies of my receipt and case emails are enclosed.

Thank you for your help.

Sincerely,
Alex Morgan</pre>

<h2>If nothing happens</h2>
<p>Keep a copy of your letter and the date you sent it. If the company does not respond, you can file a complaint with the Consumer Financial Protection Bureau for banking and credit problems, with the Better Business Bureau, or with your state attorney general's consumer protection office.</p>

<h2>Sending it without a printer</h2>
<p>Type or paste your letter into our order form and we print it, put it in a window envelope and mail it for $3.00 within the US, postage included. You can attach PDF copies of receipts and emails and we print them in the same envelope. We email you the date your letter was mailed. If you need proof of delivery, use Certified Mail at a Post Office instead.</p>
''',
 faq=[('Can you write a letter directly to a CEO?', 'Yes. Address it to the CEO by name at the company headquarters. At many large companies, an executive customer care team answers these letters.'),
      ('How do I find a company CEO\'s address?', 'Use the headquarters address on the company\'s website, or for a US public company, the address of its principal executive offices on the cover of its Form 10-K on the SEC\'s EDGAR search.'),
      ('What should I include in a complaint letter to a CEO?', 'Your account or order number, a short dated account of what happened, what you have already tried, and what you want done by a specific date.'),
      ('Should I send a complaint letter by email or mail?', 'Either can work. A printed letter to the headquarters often reaches a different team than the support inbox, which is why people use it after support has failed.'),
      ('What if the company ignores my letter?', 'Keep a copy and the date sent, then complain to the Consumer Financial Protection Bureau, the Better Business Bureau or your state attorney general.')],
 sources=[('SEC: EDGAR full-text search', 'https://www.sec.gov/edgar/search/'), ('SEC: Form 10-K', 'https://www.sec.gov/files/form10-k.pdf')],
 related=[US_REL_BIZ, ('/us/debt-validation-letter', 'Debt validation letter', 'Ask a collector to prove a debt'), ('/us/what-is-certified-mail', 'What is Certified Mail?', 'Cost, receipts and what it proves'), US_REL_ENV]),

# ───────────────────────── Military ─────────────────────────
dict(c='us', slug='how-to-address-mail-to-apo-fpo',
 title='How to Address Mail to an APO, FPO or DPO Address',
 desc='The address format for military and diplomatic mail: the APO, FPO and DPO lines, the AA, AE and AP codes, ZIP codes, postage, and the mistakes that send letters back.',
 eyebrow='Everyday mail', h1='How to address mail to<br><em>APO, FPO and DPO</em>',
 sub='Military and diplomatic addresses follow their own format. Leave out the city and country, and use the right code.',
 answer='Write the person\'s name with rank, then their unit and box, then APO, FPO or DPO with the code AA, AE or AP and the ZIP code, for example APO AE 09021. Do not add a city or country. Mail to these addresses goes at domestic US prices.',
 body='''
<h2>The format</h2>
<p>USPS shows these samples:</p>
<pre class="addr">PFC JOHN DOE
PSC 3 BOX 4120
APO AE 09021</pre>
<pre class="addr">SEAMAN JOSEPH SMITH
UNIT 100100 BOX 4120
FPO AP 96691</pre>
<pre class="addr">JOHN ADAMS
UNIT 8400 BOX 0000
DPO AE 09498-0048</pre>
<ul>
<li><strong>Line 1:</strong> the person's full name, with rank or rating if they use one.</li>
<li><strong>Line 2:</strong> the unit, PSC or ship, and the box number.</li>
<li><strong>Line 3:</strong> APO (Army and Air Force), FPO (Navy and Marines, often ships) or DPO (diplomatic posts), then the code, then the ZIP code.</li>
</ul>
<p>Put your own return address in the top left corner, as USPS asks.</p>

<h2>The three codes</h2>
<div class="cost-wrap"><table class="cost"><thead><tr><th>Code</th><th>Where the person is</th></tr></thead><tbody>
<tr><td>AE</td><td>Europe, the Middle East, Africa and Canada</td></tr>
<tr><td>AP</td><td>The Pacific</td></tr>
<tr><td>AA</td><td>The Americas, except Canada</td></tr>
</tbody></table></div>
<p>The code goes where a state would normally go. Use the exact code and ZIP the person gives you.</p>

<h2>Mistakes that send mail back</h2>
<ul>
<li><strong>Adding a city or country,</strong> such as Germany or Japan. USPS says not to, because it can send the letter into a foreign postal system.</li>
<li><strong>A wrong or missing unit or box number.</strong></li>
<li><strong>Using a normal state code</strong> instead of AA, AE or AP.</li>
</ul>
<p>Service members at a base inside the US do not use APO addresses. They use the base's normal street address, city, state and ZIP.</p>

<h2>Postage</h2>
<p>USPS charges domestic prices for mail to APO, FPO and DPO addresses, so a one-ounce letter needs one Forever stamp, $0.82 in 2026. For a package, check USPS's military mail page first, since packages have extra rules.</p>

<h2>Can Letterhome send to these addresses?</h2>
<p>Not yet. Our order form does not accept APO, FPO or DPO addresses, so please mail these letters yourself from a Post Office or a mailbox. We can still help with letters to service members at a base inside the US, which have a normal street address.</p>
''',
 faq=[('How do you write an APO address?', 'Name with rank on line 1, unit or PSC and box on line 2, then APO with the code AA, AE or AP and the ZIP code on line 3, for example APO AE 09021. Do not add a city or country.'),
      ('What do AA, AE and AP mean?', 'They replace the state. AE is Europe, the Middle East, Africa and Canada, AP is the Pacific, and AA is the Americas except Canada.'),
      ('Should I put the country on an APO address?', 'No. USPS says not to include a city or country name on APO, FPO or DPO mail.'),
      ('How much does it cost to mail a letter to an APO address?', 'Domestic prices apply, so a one-ounce letter needs one Forever stamp, $0.82 in 2026.'),
      ('What is the difference between APO, FPO and DPO?', 'APO is used by the Army and Air Force, FPO by the Navy and Marines, and DPO by US diplomatic posts.'),
      ('Can Letterhome mail to an APO address?', 'Not at the moment. Please mail letters to APO, FPO and DPO addresses yourself from a Post Office.')],
 sources=[('USPS: military and diplomatic mail', 'https://www.usps.com/ship/apo-fpo-dpo.htm'), ('USPS Publication 28: overseas military and diplomatic addresses', 'https://pe.usps.com/text/pub28/28c2_010.htm'), SRC_N123],
 related=[US_REL_ENV, US_REL_STAMP, US_REL_RET, ('/us/how-long-does-mail-take', 'How long does mail take?', 'First-Class delivery times in 2026')]),

# ───────────────────────── Teacher ─────────────────────────
dict(c='us', slug='thank-you-letter-to-a-teacher',
 title='How to Write a Thank-You Letter to a Teacher (With Examples)',
 desc='What to say in a thank-you letter to a teacher, short examples from a parent and a former student, and when to send it, including Teacher Appreciation Week.',
 eyebrow='Letter writing', h1='Thank-you letter<br><em>to a teacher</em>',
 sub='Teachers keep these letters for years. A few specific sentences are all it takes.',
 answer='Name the teacher and the class or year, describe one specific thing they did, say what difference it made, and thank them. Teacher Appreciation Week is the first full week of May, and a letter at the end of the school year, or years later from a former student, means just as much.',
 body='''
<h2>What to say</h2>
<ol>
<li><strong>Who you are:</strong> the student's name and class, or your name and the year you were in their class.</li>
<li><strong>One specific moment.</strong> The book they lent you, how they explained fractions, the note they wrote on an essay. Specific beats general every time.</li>
<li><strong>The difference it made,</strong> then or now.</li>
<li><strong>A plain thank-you.</strong></li>
</ol>

<h2>Example from a parent</h2>
<pre class="addr">Dear Ms. Alvarez,

Thank you for this year with Maya in third grade. She came home in
October saying she "hated reading," and by spring she was reading
under the covers with a flashlight. The way you let her choose her own
books for the reading log changed everything.

We are so grateful.

With thanks,
Dana Brooks</pre>

<h2>Example from a former student</h2>
<pre class="addr">Dear Mr. Hart,

You taught me chemistry in 2009. I am now a pharmacist, and I still
think about the day you stayed after class to go over equilibrium
with me until it clicked. You made me believe I was good at science.

Thank you.

Sam Patel</pre>

<h2>When to send it</h2>
<ul>
<li><strong>Teacher Appreciation Week,</strong> the first full week of May. In 2026 it ran May 4 to 8, with National Teacher Day on Tuesday, May 5.</li>
<li><strong>The end of the school year,</strong> when the class is fresh in everyone's mind.</li>
<li><strong>Years later.</strong> A letter from a grown-up former student is one of the best things a teacher can get.</li>
</ul>

<h2>Where to send it</h2>
<p>Mail it to the teacher by name at the school's address, which is on the school or district website. For a teacher who has moved schools or retired, the district office may forward it, or you can ask a mutual contact for an address.</p>
''' + US_SEND,
 faq=[('What do you write in a thank-you letter to a teacher?', 'Who you are, one specific thing the teacher did, the difference it made, and a simple thank-you.'),
      ('When is Teacher Appreciation Week?', 'The first full week of May. In 2026 it ran May 4 to 8, with National Teacher Day on Tuesday, May 5.'),
      ('How long should a thank-you letter to a teacher be?', 'A few short paragraphs is plenty. A single specific story matters more than length.'),
      ('Can I send a thank-you letter to a teacher years later?', 'Yes. Mail it to the school, or the district office if they have moved, and ask for it to be forwarded.')],
 sources=[('Minnesota Education Association: National Teacher Day 2026', 'https://www.mnea.org/news/celebrate-national-teacher-day/week')],
 related=[US_REL_NURSE, US_REL_ENV, US_REL_STAMP, US_REL_FAN]),

# ───────────────────────── Nurse ─────────────────────────
dict(c='us', slug='thank-you-letter-to-a-nurse',
 title='How to Write a Thank-You Letter to a Nurse (With Examples)',
 desc='What to say to a nurse who cared for you or your family, short examples, how to make sure the letter reaches them, and National Nurses Week dates.',
 eyebrow='Letter writing', h1='Thank-you letter<br><em>to a nurse</em>',
 sub='Nurses rarely hear how things turned out. A short letter tells them.',
 answer='Say who you are and when you were cared for, name the nurse if you can, describe one thing they did, and say how you or your family are doing now. Mail it to the hospital unit by name. National Nurses Week runs May 6 to 12 every year.',
 body='''
<h2>What to say</h2>
<ol>
<li><strong>Who you are</strong> and roughly when you were on the unit, so they can place you.</li>
<li><strong>The nurse's name,</strong> or a description if you do not know it, such as "the night nurse who sat with my father".</li>
<li><strong>One specific thing they did.</strong> Explaining a scary result, the extra blanket, the joke at 3 a.m.</li>
<li><strong>How things are now.</strong> Nurses often never find out how their patients did.</li>
</ol>

<h2>Example</h2>
<pre class="addr">Dear Nurse Okafor and the 4 West team,

My mother, Ruth Klein, was on your floor after her hip surgery
in August. You were the one who noticed she wasn't eating and found
the soup she liked. It was a small thing that made her feel cared for.

She is walking with a cane now and back in her garden.

Thank you,
Ellen Klein</pre>

<h2>How to make sure it reaches them</h2>
<p>Address the letter to the nurse by name, with the unit or department, at the hospital's main mailing address. Many hospitals have a patient experience office that passes thank-you letters on and shares them with the nurse's manager, which can count toward recognition. If you are unsure, call the hospital and ask how to send a thank-you to a staff member.</p>

<h2>When to send it</h2>
<p>Any time is right. National Nurses Week runs May 6 to 12 every year, ending on Florence Nightingale's birthday, so a letter that week lands while the hospital is celebrating its nurses.</p>
''' + US_SEND,
 faq=[('What do you write in a thank-you letter to a nurse?', 'Who you are and when you were cared for, the nurse\'s name if you know it, one specific thing they did, and how you are doing now.'),
      ('How do I send a thank-you letter to a nurse at a hospital?', 'Address it to the nurse by name with the unit or department, at the hospital\'s main mailing address. A patient experience office can also pass it on.'),
      ('When is National Nurses Week?', 'May 6 to 12 every year, ending on Florence Nightingale\'s birthday.'),
      ('What if I do not know the nurse\'s name?', 'Address it to the unit, describe the nurse and the date or shift, and ask for it to be passed on.')],
 sources=[('American Nurses Association: National Nurses Week', 'https://www.nursingworld.org/education-events/national-nurses-week/')],
 related=[US_REL_TEACH, US_REL_ENV, US_REL_STAMP, US_REL_RET]),

# ───────────────────────── UK: the King ─────────────────────────
dict(c='uk', slug='how-to-write-to-the-king',
 title='How to Write to the King: Address and How to Start',
 desc='The address for writing to King Charles at Buckingham Palace, how to open and close a letter to the King, what to include, and what kind of reply to expect.',
 eyebrow='Letter writing', h1='How to write<br><em>to the King</em>',
 sub='The Buckingham Palace address and the forms of greeting, with the traditional ones made optional.',
 answer='Write to His Majesty The King, Buckingham Palace, London SW1A 1AA. You can open with "Sir" or "Your Majesty", though the Royal Household says the traditional forms are not required, and a polite, ordinary letter is fine. Include your name and address so a reply can reach you.',
 body='''
<h2>The address</h2>
<pre class="addr">His Majesty The King
Buckingham Palace
London
SW1A 1AA</pre>
<p>This is the address the Royal Household gives for letters to the King.</p>

<h2>How to start and end the letter</h2>
<p>The traditional opening is "Sir", and the traditional ending is "I have the honour to be, Sir, Your Majesty's humble and obedient servant". The Royal Household says these forms are by no means obligatory. Many people simply write "Your Majesty" or "Dear King Charles" and end with "Yours sincerely". Write in a way that feels natural and respectful.</p>

<h2>What to include</h2>
<ul>
<li>Your full name and postal address, so a reply can reach you.</li>
<li>Why you are writing: a birthday or anniversary, thanks for a visit, a cause you care about, or simply good wishes.</li>
<li>For a milestone such as a 100th birthday or a 60th wedding anniversary, the Royal Household has a separate anniversary messages service, so check its guidance before writing.</li>
</ul>

<h2>Will I get a reply?</h2>
<p>The Royal Household says the King is shown almost all the letters sent to him. Letters that ask him to step into political or personal disputes get a standard reply.</p>

<h2>Post it without a printer</h2>
<p>Type your letter into our order form and we print it, put it in an envelope and post it for £4.50 within the UK, with postage included. Put your own address on the order so any reply comes to you.</p>
''',
 faq=[('What is the address to write to the King?', 'His Majesty The King, Buckingham Palace, London SW1A 1AA.'),
      ('How do you start a letter to the King?', 'Traditionally "Sir". The Royal Household says the traditional forms are not obligatory, so "Your Majesty" or "Dear King Charles" is fine.'),
      ('How do you end a letter to the King?', 'Traditionally "I have the honour to be, Sir, Your Majesty\'s humble and obedient servant". "Yours sincerely" is also fine.'),
      ('Does the King read his letters?', 'The Royal Household says he is shown almost all the correspondence sent to him.'),
      ('Will the King reply to my letter?', 'The Royal Household does not promise a reply to every letter. Letters asking him to intervene in political or personal disputes get a standard reply.')],
 sources=[('The Royal Family: contact', 'https://www.royal.uk/contact')],
 related=[('/uk/how-to-address-a-letter', 'How to address a letter', 'Where everything goes'), ('/uk/how-to-write-a-formal-letter', 'How to write a formal letter', 'Layout and endings'), ('/uk/how-much-is-a-stamp', 'How much is a stamp in 2026?', 'First and Second Class prices from April 2026'), ('/uk/post-a-letter-without-a-printer', 'Post a letter without a printer', 'Three ways to get a letter sent')]),
]

# ───────────────────────── Canada: the Prime Minister (house guide template) ─────────────────────────
PM = dict(slug="write-to-the-prime-minister",
  title="How to Write a Letter to the Prime Minister of Canada | Letterhome",
  meta_desc="The mailing address of the Prime Minister's Office in Ottawa, how to start and end the letter, what to include, and when to write to your MP instead.",
  service_name="Letter mailing", breadcrumb="Write to the Prime Minister", eyebrow="Civic letters",
  h1_main="How to write a letter", h1_em="to the Prime Minister.",
  hero_sub="The Ottawa address, the right greeting, and how to make a letter count.",
  cta_label="Send a Letter →",
  answer_box="Write to the Office of the Prime Minister, 80 Wellington Street, Ottawa, ON K1A 0A2. Open with \"Dear Prime Minister\", keep to one issue, and include your name and full address so the office can reply. For a problem with a federal program, your own MP is often the faster route.",
  steps=[
   ("Pick one issue", "Say in your first sentence what you are writing about and what you want the government to do."),
   ("Add your details", "Your full name, address and postal code, so the office can reply and see where you live."),
   ("Address it and mail it", "Use the address of the Prime Minister's Office in Ottawa, or the online form on pm.gc.ca if you prefer."),
  ],
  warn=("Your MP may be faster:", "for help with a federal program such as passports, immigration, EI or the CRA, write to your own MP. Their staff help constituents with these files every day."),
  sections=[
   ("The address", [
    "Office of the Prime Minister<br>80 Wellington Street<br>Ottawa, ON<br>K1A 0A2",
    "This is the address the Prime Minister's Office gives for mail. It also takes messages through an online form on pm.gc.ca.",
   ]),
   ("How to start and end it", [
    "Open with \"Dear Prime Minister\" and close with \"Sincerely\" or \"Respectfully\", then your signature and typed name. Keep it polite and to one page, and give a personal reason the issue matters to you.",
   ]),
   ("Postage", [
    "Mail to members of the House of Commons is postage-free inside Canada under the Canada Post Corporation Act, and the Prime Minister is a member. Postage-free mail to MPs is usually sent to the House of Commons, Ottawa, Ontario K1A 0A6. If you write to the Prime Minister's Office on Wellington Street instead, a stamp is the safe choice.",
   ]),
   ("If you live abroad", [
    "Type your letter online and we print and mail it from inside Canada, so it arrives as Canadian mail.",
   ]),
  ],
  faq=[
   ("What is the address to write to the Prime Minister of Canada?", "Office of the Prime Minister, 80 Wellington Street, Ottawa, ON K1A 0A2."),
   ("How do I start a letter to the Prime Minister?", "\"Dear Prime Minister\" is the usual opening. Close with \"Sincerely\" or \"Respectfully\"."),
   ("Do I need a stamp to write to the Prime Minister?", "Mail to members of the House of Commons is postage-free inside Canada, and the Prime Minister is an MP. If you use the Wellington Street office address, add a stamp to be safe."),
   ("Will the Prime Minister reply?", "The office receives a large amount of mail, and staff handle it. Include your full address if you want a reply."),
   ("Should I write to the Prime Minister or my MP?", "For a personal problem with a federal program, your MP is usually faster. For a national issue, writing to both is common."),
  ],
  related=[("/write-a-letter-to-your-mp", "Write a Letter to Your MP", "The postage-free address and what to include"), ("/government-forms-that-require-mail", "Government Forms That Need Mail", "Forms you still have to post"), ("/how-to-address-a-letter-to-canada", "How to Address a Letter to Canada", "Format and postal codes"), ("/guides", "All Guides", "Every Letterhome guide in one place")],
  sources_text="Sources: Prime Minister of Canada, pm.gc.ca/en/connect/contact; Canada Post Corporation Act, section 35.",
  cta_h2="Write to the Prime Minister", cta_p="Type your letter online and we print and mail it.", cta_final="Send a Letter →")

if __name__ == '__main__':
    for p in PAGES:
        out = f"public/{p['c']}-{p['slug']}.html"
        open(out, 'w', encoding='utf-8').write(lg.build(p)); print('wrote', out)
    spec2 = importlib.util.spec_from_file_location('bg', 'scripts/build-guides-2026-11.py')
    bg = importlib.util.module_from_spec(spec2); spec2.loader.exec_module(bg)
    out = f"public/{PM['slug']}.html"
    open(out, 'w', encoding='utf-8').write(bg.build_ca(PM)); print('wrote', out)
