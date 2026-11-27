#!/usr/bin/env python3
"""UK and Canadian versions of the letter-writing guides, 2026-11-26.
Run from the project root:  python3 scripts/build-country-letter-guides-2026-11.py

UK pages use the shared UK guide shell (public/uk-<slug>.html, served at /uk/<slug> and on letterhome.co.uk);
Canadian pages use the house guide template (public/<slug>.html).

What we can and cannot do is stated plainly and matches the order form: letters only, printed (black and white by
default), in a window envelope with printed postage, no enclosures or return envelopes, and no BFPO, Canadian Forces
or APO/FPO/DPO addresses (the form refuses them). Nothing promises acceptance or a reply.

Facts checked 2026-11-26: gov.uk staying in touch with someone in prison, find a prisoner, BFPO how to address and
enduring families free mail, Prime Minister's Office page (10 Downing Street, London SW1A 2AA), get information about
a company (registered address free); PSI 49/2011 (what correspondence may not contain); parliament.uk contact your MP
(House of Commons, London SW1A 0AA, switchboard, Westminster mail redirected); Teaching Awards Trust (Thank a Teacher
Day, third Wednesday of June, 17 June 2026); Correctional Service Canada writing to an inmate; National Defence
instructions for mailing overseas and Canada Post Canadian Forces Postal Service (free letters up to 500 g until
31 December 2026); Canadian Nurses Association (National Nursing Week, May 11 to 17, 2026; May 12 International
Nurses Day); UNESCO (World Teachers' Day, 5 October); Postes Canada 2026 rates already on the site ($1.94 to the US).
UK stamp prices are the 7 April 2026 prices already on public/uk-how-much-is-a-stamp.html."""
import importlib.util

spec = importlib.util.spec_from_file_location('lg', 'scripts/build-local-guides.py')
lg = importlib.util.module_from_spec(spec); spec.loader.exec_module(lg)
lg.PUBLISHED = '2026-11-26'

UK_REL_ADDR = ('/uk/how-to-address-a-letter', 'How to address a letter', 'Where everything goes')
UK_REL_STAMP = ('/uk/how-much-is-a-stamp', 'How much is a stamp in 2026?', 'First and Second Class prices from April 2026')
UK_REL_FORMAL = ('/uk/how-to-write-a-formal-letter', 'How to write a formal letter', 'Layout and endings')
UK_REL_NOPRINT = ('/uk/post-a-letter-without-a-printer', 'Post a letter without a printer', 'Three ways to get a letter sent')
UK_REL_KING = ('/uk/how-to-write-to-the-king', 'How to write to the King', 'The Buckingham Palace address')
UK_REL_MP = ('/uk/how-to-write-to-your-mp', 'How to write to your MP', 'The House of Commons address')
UK_REL_PM = ('/uk/how-to-write-to-the-prime-minister', 'How to write to the Prime Minister', '10 Downing Street')
UK_REL_TEACH = ('/uk/thank-you-letter-to-a-teacher', 'Thank-you letter to a teacher', 'What to say and when')
UK_REL_NURSE = ('/uk/thank-you-letter-to-a-nurse', 'Thank-you letter to a nurse', 'Thanking NHS staff')
UK_STAMPS = 'A First Class stamp costs £1.80 and a Second Class stamp 91p, since 7 April 2026.'

UK_SEND = ('<h2>Post it without a printer</h2>\n<p>Type your letter into our order form and we print it, put it in a window envelope and post it for £4.50 within the UK, with postage included. '
           'Pages are printed in black and white unless you choose colour. We post the letter only, so anything else you want to include has to go in an envelope you post yourself.</p>')

UK = [
dict(c='uk', slug='how-to-send-fan-mail',
 title='How to Send Fan Mail in the UK: Where to Write',
 desc='Where fan mail to actors, musicians, footballers and authors really goes, how to find a current address yourself, what to write, and how to ask for an autograph by post.',
 eyebrow='Letter writing', h1='How to send<br><em>fan mail</em>',
 sub='Where letters to famous people actually go, and how to find the right address yourself.',
 answer='Send fan mail to the person\'s public business address, never a home address: their agent or management, their club, publisher or record label, or a charity they run. Find it on their official website or social media, write their name and "c/o" the organisation, and include a stamped addressed envelope if you hope for something back.',
 body='''
<h2>Where fan mail actually goes</h2>
<p>Famous people do not get fan mail at home, and you should never look for a home address. Letters go to the people who work with them, who sort them and pass them on. Write the person's name on the first line, then "c/o" (care of) and the organisation:</p>
<pre class="addr">Sam Taylor
c/o Example Management Ltd
10 Sample Street
LONDON
W1A 1AA</pre>
<p>That address is made up to show the layout. Where to send it depends on who you are writing to.</p>
<div class="cost-wrap"><table class="cost"><thead><tr><th>Who you are writing to</th><th>Where the letter usually goes</th></tr></thead><tbody>
<tr><td>Actors and presenters</td><td>Their agent or management, or the production company or broadcaster of a current show</td></tr>
<tr><td>Musicians</td><td>Their management or record label, or an official fan club</td></tr>
<tr><td>Footballers and other athletes</td><td>The club's address, with the player's name on the first line</td></tr>
<tr><td>Authors</td><td>The address on their website, or their publisher, marked "Please forward"</td></tr>
<tr><td>Someone who runs a charity</td><td>The charity's office, if your letter is about its work</td></tr>
</tbody></table></div>

<h2>How to find a current address</h2>
<ol>
<li><strong>Their official website</strong> for a contact or fan mail page. Some say they do not accept post. If they say no, respect it.</li>
<li><strong>Their verified social media bios,</strong> which often name an agent or management company.</li>
<li><strong>The club, publisher or label's own website,</strong> for its postal address.</li>
<li><strong>IMDbPro</strong> for film and TV, a paid service that lists agents and managers. IMDb itself does not pass messages on.</li>
<li><strong>A charity's entry</strong> on the charity regulator's register, which shows its contact address.</li>
</ol>
<p>Be wary of fan mail address lists online. Many are out of date. A real agent never charges you to pass on a letter.</p>

<h2>What to write</h2>
<ul>
<li>Keep it to one page, warm and specific: a song, a match, a scene, a book.</li>
<li>Do not ask for money, favours or personal details.</li>
<li>Put your name and address on the letter itself as well as on the envelope.</li>
<li>Do not send anything you cannot lose.</li>
</ul>

<h2>Asking for an autograph by post</h2>
<p>Include a <strong>stamped addressed envelope</strong> (SAE) with your address and a stamp already on it, and a small flat item to sign, such as a photo or card. ''' + UK_STAMPS + ''' Royal Mail stamps only work on post sent from the UK, so for someone abroad, include your email address instead. A reply can take months, and the biggest names often send a printed photo or do not answer.</p>
''' + UK_SEND,
 faq=[('Where do I send fan mail in the UK?', 'To the person\'s agent, management, club, publisher or record label. Write their name first, then "c/o" and the organisation\'s address.'),
      ('How do I find a celebrity\'s agent?', 'Check their official website and verified social media first. For film and TV, the paid IMDbPro service lists agents and managers.'),
      ('How do I write to a footballer?', 'Post it to the club\'s address with the player\'s name on the first line. Many clubs explain fan mail on their website.'),
      ('How do I ask for an autograph by post?', 'Send a short letter, a small item to sign and a stamped addressed envelope. Do not send anything valuable.'),
      ('Can I send fan mail to a celebrity\'s home?', 'No. Use a public business address only.')],
 sources=[('IMDb Help Center: contacting people listed on IMDb', 'https://help.imdb.com/article/imdb/general-information/can-you-help-me-contact-a-celebrity-listed-on-imdb/GFA2FEUR23PGDFXG')],
 related=[UK_REL_ADDR, UK_REL_STAMP, UK_REL_KING, UK_REL_NOPRINT]),

dict(c='uk', slug='how-to-write-to-a-prisoner',
 title='How to Write to a Prisoner in the UK (Address and Rules)',
 desc='How to send a letter to someone in prison in England and Wales: the prisoner number, the address format, your details on the back, what is not allowed, and Email a Prisoner.',
 eyebrow='Letter writing', h1='How to write<br><em>to a prisoner</em>',
 sub='Use their prisoner number, put your own name and address on the back, and check the prison\'s own rules.',
 answer='Write the person\'s full name and prisoner number on the envelope with the prison\'s address, and put your own name and address on the back. If you do not know the number, contact the prison. Staff check most post, and prisons in England and Wales also offer Email a Prisoner.',
 body='''
<h2>The address</h2>
<p>Each prison has its own page on GOV.UK with its postal address and rules. Put the person's full name and prisoner number on the envelope, then the prison's address:</p>
<pre class="addr">John Smith A1234BC
HMP Example
1 Prison Road
EXAMPLETOWN
AB1 2CD</pre>
<p>That address is made up to show the layout. Some prisons ask for the name and number under the address, so follow the prison's page. Put your own name and address on the back of the envelope. Some prisons do not accept anonymous letters.</p>

<h2>Finding the person</h2>
<p>If you do not know the prisoner number, contact the prison. If you do not know which prison someone is in, the Find a prisoner service can ask on your behalf, for prisons in England and Wales. You need their name and date of birth or age, the person has to agree to share where they are, and a reply comes within 4 weeks.</p>

<h2>What you cannot send</h2>
<p>Staff check most post. Letters cannot contain threats, indecent or grossly offensive material, knowingly false information, or plans to help commit an offence. It is a crime to send drugs, alcohol, weapons, cameras or phones. Many prisons do not accept parcels or gifts without approval first.</p>

<h2>Email a Prisoner</h2>
<p>You cannot email a prisoner directly, but most prisons in England and Wales use Email a Prisoner: staff print the message and hand it over. Each message costs 40p from credit you buy. Some prisons let prisoners reply.</p>

<h2>Scotland and Northern Ireland</h2>
<p>The Scottish Prison Service and the Northern Ireland Prison Service have their own rules. In Scotland, the person's name and date of birth can be used if you do not know their number.</p>

<h2>Sending it with Letterhome</h2>
<p>We can print and post a typed letter for £4.50 within the UK. It arrives as a printed letter in a window envelope with printed postage and your name and return address, so do not choose to send it without a return address. We cannot include photos, stamps or anything else. Check the prison's page first that printed letters are fine.</p>
''',
 faq=[('How do I address a letter to a prisoner?', 'Their full name and prisoner number, then the prison\'s postal address from its GOV.UK page. Put your own name and address on the back.'),
      ('What if I do not know the prisoner number?', 'Contact the prison. In Scotland, the person\'s name and date of birth can be used instead.'),
      ('How do I find out which prison someone is in?', 'Use the Find a prisoner service for England and Wales. The person has to agree to share their location, and a reply comes within 4 weeks.'),
      ('Can I email a prisoner?', 'Not directly. Most prisons in England and Wales use Email a Prisoner, where messages are printed and handed over, at 40p each.'),
      ('Are letters to prisoners read?', 'Staff check most post coming into prisons.')],
 sources=[('GOV.UK: staying in touch with someone in prison', 'https://www.gov.uk/staying-in-touch-with-someone-in-prison'),
          ('GOV.UK: find a prisoner', 'https://www.gov.uk/find-prisoner'),
          ('GOV.UK: Email a Prisoner', 'https://www.gov.uk/staying-in-touch-with-someone-in-prison/email-and-social-media'),
          ('HMPPS: Prison Service Instruction 49/2011', 'https://assets.publishing.service.gov.uk/media/6596a6d3614fa20014f3a8e7/PSI-49-2011-Prisoner-Communication-Services_Update_Jan_24.pdf')],
 related=[UK_REL_ADDR, UK_REL_STAMP, UK_REL_NOPRINT, UK_REL_FORMAL]),

dict(c='uk', slug='how-to-write-to-your-mp',
 title='How to Write to Your MP: Address and What to Include',
 desc='How to find your MP, the House of Commons address, what to put in the letter so it gets acted on, and why Parliament recommends writing.',
 eyebrow='Civic letters', h1='How to write<br><em>to your MP</em>',
 sub='Parliament says writing is probably the best way to contact your MP. Here is how.',
 answer='Write to your MP at House of Commons, London SW1A 0AA, and include your own address so they can see you live in their constituency. Find your MP by postcode on the UK Parliament website. Keep to one issue and say what you want them to do.',
 body='''
<h2>Find your MP</h2>
<p>Enter your postcode in Find your MP on the UK Parliament website. MPs generally only act for people in their own constituency, so write to the MP where you live.</p>

<h2>The address</h2>
<pre class="addr">Jane Doe MP
House of Commons
LONDON
SW1A 0AA</pre>
<p>Parliament suggests writing to the Westminster address rather than a constituency office or a home address, because post sent there is dealt with or redirected when MPs are away from London. Your MP's email address is in the Directory of MPs if you prefer email.</p>

<h2>Why write</h2>
<p>Parliament says writing is probably the best way to contact your MP, because it gives a written record you can refer to later.</p>

<h2>What to put in the letter</h2>
<ol>
<li><strong>Your full name and address,</strong> so the office can confirm you are a constituent and reply.</li>
<li><strong>One issue,</strong> named in the first sentence.</li>
<li><strong>Why it matters to you,</strong> in your own words.</li>
<li><strong>What you want your MP to do:</strong> raise it with a minister, vote a certain way, or help with a problem.</li>
</ol>
<p>Start with "Dear Jane Doe" or "Dear Ms Doe" and end with "Yours sincerely". Keep it to one page.</p>

<h2>Other ways to reach your MP</h2>
<p>You can call the House of Commons switchboard on 020 7219 3000 and ask for your MP by name.</p>
''' + UK_SEND,
 faq=[('What is the address to write to my MP?', 'Your MP\'s name, House of Commons, London SW1A 0AA.'),
      ('How do I find my MP?', 'Enter your postcode in Find your MP on the UK Parliament website.'),
      ('Is it better to write or email my MP?', 'Parliament says writing is probably the best way, because it gives a written record you can refer to later.'),
      ('Can I write to an MP who is not my MP?', 'You can, but MPs generally only act for people in their own constituency.')],
 sources=[('UK Parliament: contact your MP', 'https://www.parliament.uk/get-involved/contact-an-mp-or-lord/contact-your-mp/'),
          ('UK Parliament: House of Commons Enquiry Service', 'https://www.parliament.uk/site-information/contact-us/house-of-commons-enquiry-service/')],
 related=[UK_REL_PM, UK_REL_KING, UK_REL_FORMAL, UK_REL_ADDR]),

dict(c='uk', slug='how-to-write-to-the-prime-minister',
 title='How to Write to the Prime Minister: 10 Downing Street Address',
 desc='The address for writing to the UK Prime Minister, how to start the letter, what the office deals with, and when to write to your MP instead.',
 eyebrow='Civic letters', h1='How to write<br><em>to the Prime Minister</em>',
 sub='The 10 Downing Street address, and when your own MP is the better person to write to.',
 answer='Write to The Prime Minister, 10 Downing Street, London SW1A 2AA. The office only deals with matters relating directly to the Prime Minister, so for most problems your own MP is the better person to write to.',
 body='''
<h2>The address</h2>
<pre class="addr">The Prime Minister
10 Downing Street
LONDON
SW1A 2AA</pre>
<p>This is the postal address on the Prime Minister's Office page on GOV.UK. The office also has an online contact form, and it cannot guarantee a reply.</p>

<h2>What the office deals with</h2>
<p>The Prime Minister's Office says it can only deal with matters that relate directly to the Prime Minister. Other letters may be passed to the government department responsible, or to the Prime Minister's party or constituency office if they are political or about the constituency. Messages sent through social media are not treated as correspondence.</p>

<h2>Write to your MP instead if...</h2>
<p>...you need help with a problem, such as benefits, immigration, a council or a government department. Your MP's office handles these for constituents. See <a href="/uk/how-to-write-to-your-mp">how to write to your MP</a>.</p>

<h2>How to start and end it</h2>
<p>Open with "Dear Prime Minister" and end with "Yours sincerely". Keep to one page and one issue, and include your name and address.</p>
''' + UK_SEND,
 faq=[('What is the address to write to the Prime Minister?', 'The Prime Minister, 10 Downing Street, London SW1A 2AA.'),
      ('Will the Prime Minister reply?', 'The office cannot guarantee a reply, and only deals with matters that relate directly to the Prime Minister.'),
      ('Can I email the Prime Minister?', 'There is an online contact form for the Prime Minister\'s Office. Social media messages are not treated as correspondence.'),
      ('How do I start a letter to the Prime Minister?', '"Dear Prime Minister", ending with "Yours sincerely".')],
 sources=[('GOV.UK: Prime Minister\'s Office, 10 Downing Street', 'https://www.gov.uk/government/organisations/prime-ministers-office-10-downing-street'),
          ('GOV.UK: 10 Downing Street correspondence privacy notice', 'https://www.gov.uk/government/publications/10-downing-street-correspondence-communications-gifts-and-hospitality-privacy-notice/10-downing-street-correspondence-communications-gifts-and-hospitality-privacy-notice')],
 related=[UK_REL_MP, UK_REL_KING, UK_REL_FORMAL, UK_REL_ADDR]),

dict(c='uk', slug='complaint-letter-to-a-ceo',
 title='How to Write a Complaint Letter to a CEO (UK, With Template)',
 desc='When customer service has failed: how to find a company\'s registered office on Companies House for free, what to put in a letter to the chief executive, a template, and where to go next.',
 eyebrow='Letter writing', h1='How to write a complaint<br><em>letter to a CEO</em>',
 sub='A short, factual letter to the top often gets a stuck complaint to someone who can fix it.',
 answer='Send a one-page letter to the chief executive at the company\'s head office or registered office, which Companies House shows for free. Give your account or order number, what went wrong, what you have tried, and what you want done by a date.',
 body='''
<h2>Find the address</h2>
<ul>
<li><strong>The company's website,</strong> under Contact, About or Investors, for its head office.</li>
<li><strong>Companies House.</strong> Search the company's name on GOV.UK to see its registered office address for free.</li>
<li><strong>The chief executive's name</strong> is usually on the company's leadership or investor pages.</li>
</ul>

<h2>What to put in the letter</h2>
<ol>
<li>Your name, address, email and your account, order or complaint reference.</li>
<li>What happened, in short dated points.</li>
<li>What you have already tried, with dates and names.</li>
<li>What you want, and a reasonable date, such as 14 days.</li>
</ol>
<p>Stay polite and keep it to one page. Send copies of receipts, not originals.</p>

<h2>A template you can adapt</h2>
<pre class="addr">Dear Ms Lee,

I am writing about order 48213, placed on 3 September 2026.

The washing machine was delivered damaged on 8 September. I reported
it the same day (complaint 77120) and was promised a replacement
twice, on 15 September and 2 October. Nothing has arrived.

I would like a full refund of £549.00 by 10 December 2026. Copies of
my receipt and emails are enclosed.

Yours sincerely,
Alex Morgan</pre>

<h2>If nothing happens</h2>
<p>Keep a copy and the date you posted it. Many sectors have a free ombudsman that can step in once a company's complaints process is finished, and Citizens Advice can tell you which one applies.</p>
''' + UK_SEND.replace('We post the letter only, so anything else you want to include has to go in an envelope you post yourself.', 'You can attach PDF copies of receipts and emails and we print them in the same envelope.'),
 faq=[('How do I find a company\'s head office address?', 'Check the company\'s website, or search Companies House on GOV.UK, which shows a company\'s registered office address for free.'),
      ('Can I write directly to a CEO?', 'Yes. Address it to the chief executive by name at the head office or registered office.'),
      ('What should a complaint letter to a CEO include?', 'Your reference number, what happened with dates, what you have tried, and what you want done by a date.'),
      ('What if the company ignores my letter?', 'Keep a copy, then ask Citizens Advice which ombudsman covers the company.')],
 sources=[('GOV.UK: get information about a company', 'https://www.gov.uk/get-information-about-a-company')],
 related=[UK_REL_FORMAL, UK_REL_ADDR, UK_REL_STAMP, UK_REL_NOPRINT]),

dict(c='uk', slug='how-to-address-bfpo-mail',
 title='How to Address BFPO Mail to the Armed Forces',
 desc='The address format for British Forces Post Office mail: service number, rank, name, unit and BFPO number, leaving out the town and country, plus the free mail service for families.',
 eyebrow='Everyday post', h1='How to address<br><em>BFPO mail</em>',
 sub='Service number first, the BFPO number last, and never the town or country.',
 answer='Write the service number, rank and name, then the unit or ship, then the BFPO number, in capitals. Leave out the town and country, and put a return address on the back. If you are posting from outside the UK, add GB after the BFPO number.',
 body='''
<h2>The format</h2>
<pre class="addr">12345678 CPL A SMITH
1 EXAMPLE REGIMENT
BFPO 123</pre>
<p>That example is made up to show the layout. Use the exact details the person gives you, in clear capital letters or a printed label:</p>
<ul>
<li>Service number, rank or title, and name.</li>
<li>Unit or regiment, or the ship or operation if they are deployed.</li>
<li>The BFPO number, on the last line.</li>
</ul>
<p>For a family member, start with their name "c/o" the service person's number, rank and name.</p>

<h2>Common mistakes</h2>
<ul>
<li><strong>Adding the town or country.</strong> GOV.UK and Royal Mail say to leave them out.</li>
<li><strong>Forgetting GB</strong> after the BFPO number when posting from outside the UK.</li>
<li><strong>No return address.</strong> Write one on the back in capitals, with your full name and postcode.</li>
</ul>

<h2>Free mail for families</h2>
<p>The enduring families free mail service lets you send letters and parcels free to service personnel on certain ships and operations. You can only use it to send to people you know. Check GOV.UK for the current rules and prices before posting.</p>

<h2>Can Letterhome send BFPO mail?</h2>
<p>Not at the moment. Our order form does not accept BFPO addresses, so please post these letters yourself.</p>
''',
 faq=[('How do you write a BFPO address?', 'Service number, rank and name, then the unit or ship, then the BFPO number, in capitals. No town or country.'),
      ('Do I put the country on BFPO mail?', 'No. Leave out the town and country. If you post from outside the UK, write GB after the BFPO number.'),
      ('Is BFPO mail free?', 'The enduring families free mail service lets you send free to personnel on certain ships and operations, to people you know.'),
      ('Can Letterhome post to a BFPO address?', 'Not at the moment. Please post BFPO letters yourself.')],
 sources=[('GOV.UK: how to address BFPO mail', 'https://www.gov.uk/bfpo/how-to-address-bfpo-mail'),
          ('GOV.UK: enduring families free mail service', 'https://www.gov.uk/bfpo/enduring-families-free-mail-service'),
          ('GOV.UK: BFPO cost, size and weight', 'https://www.gov.uk/bfpo/cost')],
 related=[UK_REL_ADDR, UK_REL_STAMP, UK_REL_NOPRINT, UK_REL_FORMAL]),

dict(c='uk', slug='thank-you-letter-to-a-teacher',
 title='How to Write a Thank-You Letter to a Teacher (UK Examples)',
 desc='What to say in a thank-you letter to a teacher, short examples from a parent and a former pupil, and when to send it, including National Thank a Teacher Day.',
 eyebrow='Letter writing', h1='Thank-you letter<br><em>to a teacher</em>',
 sub='Teachers keep these letters for years. A few specific sentences are enough.',
 answer='Say who you are, describe one specific thing the teacher did and the difference it made, and thank them. National Thank a Teacher Day is the third Wednesday in June (17 June in 2026), and the end of the school year or years later works just as well.',
 body='''
<h2>What to say</h2>
<ol>
<li>Who you are: the pupil's name and class, or the year you were taught.</li>
<li>One specific moment, such as how they explained something or the note on your work.</li>
<li>The difference it made, then or now.</li>
<li>A plain thank-you.</li>
</ol>

<h2>Example from a parent</h2>
<pre class="addr">Dear Mrs Patel,

Thank you for this year with Ava in Year 3. In September she said she
"hated reading". By the summer she was reading under the duvet with a
torch. Letting her choose her own books made all the difference.

With thanks,
Dana Brooks</pre>

<h2>Example from a former pupil</h2>
<pre class="addr">Dear Mr Hart,

You taught me chemistry for my GCSEs in 2009. I am now a pharmacist,
and I still remember you staying behind to go over equilibrium with
me until it clicked. Thank you for believing I was good at science.

Sam Ahmed</pre>

<h2>When to send it</h2>
<ul>
<li><strong>National Thank a Teacher Day,</strong> the third Wednesday in June, run by the Teaching Awards Trust. In 2026 it was 17 June.</li>
<li><strong>The end of the summer term.</strong></li>
<li><strong>Years later,</strong> sent to the school marked for the teacher's attention.</li>
</ul>
''' + UK_SEND,
 faq=[('When is National Thank a Teacher Day?', 'The third Wednesday in June. In 2026 it was 17 June.'),
      ('What do you write in a thank-you letter to a teacher?', 'Who you are, one specific thing they did, the difference it made, and a thank-you.'),
      ('Can I write to a teacher who taught me years ago?', 'Yes. Post it to the school for their attention, and ask for it to be forwarded if they have moved.')],
 sources=[('Pearson National Teaching Awards (Teaching Awards Trust)', 'https://www.pearson.com/en-gb/schools/insights-and-events/topics/Pearson-National-Teaching-Awards.html')],
 related=[UK_REL_NURSE, UK_REL_ADDR, UK_REL_STAMP, UK_REL_NOPRINT]),

dict(c='uk', slug='thank-you-letter-to-a-nurse',
 title='How to Write a Thank-You Letter to a Nurse (NHS Examples)',
 desc='What to say to a nurse or ward team who cared for you or your family, an example letter, how to make sure it reaches them, and International Nurses Day.',
 eyebrow='Letter writing', h1='Thank-you letter<br><em>to a nurse</em>',
 sub='Nurses rarely hear how things turned out. A short letter tells them.',
 answer='Say who you are and when you were on the ward, name the nurse if you can, describe one thing they did, and say how you are now. Address it to the nurse and ward at the hospital. International Nurses Day is 12 May, Florence Nightingale\'s birthday.',
 body='''
<h2>What to say</h2>
<ol>
<li>Who you are and roughly when you were on the ward.</li>
<li>The nurse's name, or a description, such as "the night nurse on Ward 7".</li>
<li>One specific thing they did.</li>
<li>How you or your family are now.</li>
</ol>

<h2>Example</h2>
<pre class="addr">Dear Nurse Okafor and the Ward 7 team,

My mum, Ruth Klein, was with you after her hip operation in August.
You noticed she wasn't eating and found the soup she liked. It was a
small thing that made her feel cared for.

She is walking with a stick now and back in her garden.

Thank you,
Ellen Klein</pre>

<h2>Making sure it reaches them</h2>
<p>Address it to the nurse and the ward or department, at the hospital's postal address. NHS hospitals have a patient advice and liaison team that can pass compliments on to staff and their managers; ask the hospital if you are unsure where to send it.</p>

<h2>When to send it</h2>
<p>Any time. International Nurses Day is 12 May, Florence Nightingale's birthday.</p>
''' + UK_SEND,
 faq=[('How do I send a thank-you letter to an NHS nurse?', 'Address it to the nurse and the ward at the hospital\'s postal address, or ask the hospital\'s patient advice team to pass it on.'),
      ('When is International Nurses Day?', '12 May, Florence Nightingale\'s birthday.'),
      ('What if I do not know the nurse\'s name?', 'Address it to the ward team, describe the nurse and the date, and ask for it to be passed on.')],
 sources=[('Canadian Nurses Association: National Nursing Week and International Nurses Day', 'https://cna-aiic.ca/en/news-events/national-nursing-week/about-national-nursing-week')],
 related=[UK_REL_TEACH, UK_REL_ADDR, UK_REL_STAMP, UK_REL_NOPRINT]),
]

# ───────────────────────── Canada (house guide template) ─────────────────────────
REL_GUIDES = ("/guides", "All Guides", "Every Letterhome guide in one place")
REL_ADDR = ("/how-to-address-a-letter-to-canada", "How to Address a Letter to Canada", "Format and postal codes")
REL_MP = ("/write-a-letter-to-your-mp", "Write a Letter to Your MP", "The postage-free address")
REL_ABROAD = ("/how-to-send-a-letter-to-canada-from-abroad", "Sending Mail From Abroad", "The basics of mailing into Canada from anywhere")
REL_LETTERMAIL = ("/what-is-lettermail", "What Is Lettermail?", "Canada Post's everyday letter service")

def ca(slug, **k):
    d = dict(slug=slug, service_name="Letter mailing", cta_label="Send a Letter →", cta_final="Send a Letter →")
    d.update(k); return d

CA = [
ca("send-fan-mail-from-canada",
  title="How to Send Fan Mail From Canada | Letterhome",
  meta_desc="Where fan mail to actors, musicians, hockey players and authors goes, how to find a current address yourself, Canadian postage to the US, and asking for an autograph by mail.",
  breadcrumb="Send Fan Mail From Canada", eyebrow="Letter writing",
  h1_main="How to send fan mail", h1_em="from Canada.",
  hero_sub="Where letters to famous people actually go, and the postage catch when they live in the US.",
  answer_box="Send fan mail to the person's public business address, never a home address: their agent or management, their team, publisher or record label, or a charity they run. Write their name, then \"c/o\" and the organization. Many celebrities are in the US, so a letter there needs US postage, and a return envelope needs US stamps, not Canadian ones.",
  steps=[
   ("Find the right organization", "Their agent, manager, team, publisher or label. Check their official website and verified social media first."),
   ("Write a short, specific letter", "One page about what their work means to you. Put your name and address on the letter itself."),
   ("Address it c/o the organization", "Their name on the first line, then c/o and the organization's address."),
  ],
  warn=("Return envelopes to the US:", "Canadian stamps only work on mail posted in Canada. If you want a reply from someone in the US, a Canadian-stamped return envelope will not work; include your email address instead."),
  sections=[
   ("Where fan mail goes", [
    "Actors and hosts: their agent, manager or publicist, or the studio or network of a current show. Musicians: their management or record label. Hockey and other athletes: the team's office or arena, with the player's name first. Authors: their website or their publisher, marked \"Please forward\".",
    "Example layout (made up): Sam Taylor<br>c/o Example Talent Agency<br>100 Sample Street, Suite 500<br>Toronto ON  M5V 1A1",
   ]),
   ("Finding a current address", [
    "Look on their official website and verified social media bios first, then the team, publisher or label's own website. For film and TV, the paid IMDbPro service lists agents and managers. Be wary of old address lists online, and remember a real agent never charges to pass on a letter.",
   ]),
   ("Postage", [
    "A standard letter inside Canada costs $1.44 with a single stamp in 2026, or $1.24 with a booklet stamp. A letter to the US up to 30 g costs $1.94.",
   ]),
  ],
  faq=[
   ("Where do I send fan mail to a celebrity from Canada?", "To their agent, manager, team, publisher or record label, with their name first and \"c/o\" the organization."),
   ("How much postage do I need to send fan mail to the US?", "A letter to the US up to 30 g costs $1.94 in 2026."),
   ("Can I send a return envelope with Canadian stamps to the US?", "No. Canadian stamps only work on mail posted in Canada. Include your email address instead."),
   ("How do I write to an NHL player?", "Mail it to the team's office or arena with the player's name on the first line. Check the team's website for its address."),
  ],
  related=[REL_ADDR, REL_LETTERMAIL, ("/send-a-letter-from-canada-to-the-us", "Send a Letter to the US", "From Canada, without a post office trip"), REL_GUIDES],
  sources_text="Sources: Canada Post 2026 Lettermail prices; IMDb Help Center.",
  cta_h2="Send your fan letter", cta_p="Type it online and we print and mail it."),

ca("write-to-an-inmate-in-canada",
  title="How to Write to an Inmate in Canada | Letterhome",
  meta_desc="How to address a letter to someone in a federal penitentiary or provincial jail in Canada, what to put on the envelope, and what happens if you do not know where they are.",
  breadcrumb="Write to an Inmate in Canada", eyebrow="Letter writing",
  h1_main="How to write to", h1_em="an inmate in Canada.",
  hero_sub="Federal institutions accept letters by mail. Put the person's name, the institution, and your return address.",
  answer_box="For a federal institution, write the inmate's name in the centre of the envelope, then \"C/O\" and the institution's name, then its address. Put your return address in the top left corner. If you do not know where the person is held, Correctional Service Canada will try to forward a letter sent to a regional headquarters.",
  steps=[
   ("Find the institution", "Use the institution's address from Correctional Service Canada's institution profiles. Provincial jails have their own addresses and rules."),
   ("Address the envelope", "The inmate's name, then C/O and the institution's name, then the institution's address."),
   ("Add your return address", "In the top left corner, so the person can reply and undeliverable mail can come back."),
  ],
  warn=("Location is private:", "Correctional Service Canada does not disclose where an inmate is held without their consent. If you do not know, send the letter to a regional headquarters and staff will try to forward it."),
  sections=[
   ("Federal institutions", [
    "Example layout (made up): John Smith<br>C/O Example Institution<br>100 Example Road<br>Exampleville ON  K0K 0K0",
    "Correctional Service Canada accepts physical mail, by Canada Post or by hand. All mail goes through the same screening and inspection, and there is normally no limit on how much mail an inmate can receive.",
   ]),
   ("Provincial jails", [
    "People serving sentences under two years, or awaiting trial, are held in provincial or territorial facilities. Each province sets its own mail rules and addresses, so check the province's corrections website before you write.",
   ]),
   ("Sending it with Letterhome", [
    "We can print and mail a typed letter for $6 within Canada. It arrives as a printed letter in a window envelope with printed postage and your return address, so do not choose to send it without one. We cannot include photos, money or anything else.",
   ]),
  ],
  faq=[
   ("How do I address a letter to a federal inmate in Canada?", "The inmate's name, then C/O and the institution's name, then the institution's address, with your return address in the top left corner."),
   ("Can I find out where an inmate is held?", "Correctional Service Canada does not disclose locations without the inmate's consent. Send the letter to a regional headquarters and staff will try to forward it."),
   ("Is mail to inmates checked?", "Yes. All mail to federal institutions goes through screening and inspection."),
   ("Is there a limit on letters?", "Normally not, though a warden can set a limit if the volume is disruptive."),
  ],
  related=[REL_ADDR, REL_LETTERMAIL, REL_ABROAD, REL_GUIDES],
  sources_text="Sources: Correctional Service Canada, Writing to an inmate (canada.ca).",
  cta_h2="Send a letter", cta_p="Type it online and we print and mail it."),

ca("complaint-letter-to-a-ceo-canada",
  title="How to Write a Complaint Letter to a CEO in Canada | Letterhome",
  meta_desc="When customer service has failed: how to find a Canadian company's head office, what to put in a letter to the CEO, a template, and where to go next.",
  breadcrumb="Complaint Letter to a CEO", eyebrow="Letter writing",
  h1_main="How to write a complaint", h1_em="letter to a CEO.",
  hero_sub="A short, factual letter to head office often gets a stuck complaint to someone who can fix it.",
  answer_box="Send a one-page letter to the CEO at the company's head office. Give your account or order number, what went wrong, what you have tried, and exactly what you want done by a date. Many large companies pass these letters to a team that handles escalated complaints.",
  steps=[
   ("Find the head office", "On the company's website under Contact, About or Investors. The CEO's name is usually on the leadership page."),
   ("Write one factual page", "Your reference number, what happened with dates, what you tried, and what you want by when."),
   ("Mail it and keep a copy", "Note the date you sent it, and keep copies of everything."),
  ],
  warn=("Stay polite:", "an angry letter is easier to set aside. Facts, dates and a clear request get results."),
  sections=[
   ("A template you can adapt", [
    "Dear Ms. Lee,<br><br>I am writing about order 48213, placed on September 3, 2026. The laptop arrived damaged on September 8. I reported it the same day (case 77120) and was promised a replacement twice. Nothing has arrived.<br><br>I would like a full refund of $1,149.00 by December 10, 2026. Copies of my receipt and emails are enclosed.<br><br>Sincerely,<br>Alex Morgan",
   ]),
   ("If nothing happens", [
    "Keep a copy and the date sent. Banks have a federal complaint process through the Financial Consumer Agency of Canada, telecom and TV complaints go to the Commission for Complaints for Telecom-television Services, and your province's consumer protection office handles most other purchases.",
   ]),
   ("Sending it with Letterhome", [
    "Type your letter online and attach PDF copies of receipts or emails, and we print everything and mail it in one envelope for $6 within Canada. We email you the date it was mailed. If you need a signature on delivery, use Registered Mail at a post office.",
   ]),
  ],
  faq=[
   ("Can I write directly to a CEO in Canada?", "Yes. Address it to the CEO by name at the head office."),
   ("How do I find a company's head office address?", "On its website under Contact, About or Investors."),
   ("What should I include?", "Your reference number, what happened with dates, what you tried, and what you want done by a date."),
   ("What if the company ignores my letter?", "Contact the regulator or complaints body for that industry, or your province's consumer protection office."),
  ],
  related=[("/proof-of-mailing", "Proof You Sent a Letter", "What our dated confirmation emails show"), ("/registered-mail-vs-xpresspost", "Registered vs Xpresspost", "When you need a signature"), REL_ADDR, REL_GUIDES],
  sources_text="Sources: Financial Consumer Agency of Canada; Commission for Complaints for Telecom-television Services.",
  cta_h2="Send your complaint letter", cta_p="Type it online and we print and mail it."),

ca("mail-to-canadian-forces-members-overseas",
  title="How to Mail a Letter to Canadian Forces Members Overseas | Letterhome",
  meta_desc="How to address mail to a deployed Canadian Armed Forces member, the free letter service up to 500 g through December 31, 2026, and where to drop it off.",
  breadcrumb="Mail to CAF Members Overseas", eyebrow="Everyday mail",
  h1_main="How to mail a letter to", h1_em="Canadian Forces overseas.",
  hero_sub="Letters to deployed members you know personally are free through 2026. Address them to a specific member.",
  answer_box="Address the letter to a specific Canadian Armed Forces member, with their rank and mission details, at the PO Box Stn Forces, Belleville, Ontario address they give you, or to their ship at Halifax or Victoria. Letters up to 500 g to deployed members are free until December 31, 2026. Take them to a post office.",
  steps=[
   ("Get the exact address", "Ask the member or their family for the full mailing address, with rank and mission, at Stn Forces, Belleville, or their ship."),
   ("Address it to one person", "Mail must go to a specific member. Letters to \"any soldier\" are not accepted."),
   ("Take it to a post office", "Hand it in at a Canada Post counter. Unstamped mail left in a street mailbox will not be delivered."),
  ],
  warn=("We can't send these yet:", "our order form does not accept Canadian Forces addresses, so please mail these letters yourself from a post office."),
  sections=[
   ("Free letters", [
    "National Defence says free delivery of letters up to 500 g to deployed members continues until December 31, 2026. Canada Post says family and friends can send free Lettermail to deployed members they know personally.",
   ]),
   ("Parcels", [
    "Parcels follow different rules and need a customs declaration from the post office. The free parcel period that ran to February 28, 2026 has ended, so check National Defence's instructions before sending one.",
   ]),
   ("Members at a base in Canada", [
    "Members posted to a base inside Canada use the base's normal street address and postal code, and normal postage applies. We can print and mail letters to those addresses.",
   ]),
  ],
  faq=[
   ("Is it free to mail a letter to a deployed Canadian soldier?", "Yes, for letters up to 500 g to deployed members until December 31, 2026, according to National Defence."),
   ("How do I address mail to a deployed CAF member?", "To the specific member, with rank and mission details, at the PO Box Stn Forces, Belleville, Ontario address or their ship at Halifax or Victoria."),
   ("Can I send a letter to any soldier?", "No. Mail must be addressed to a specific member."),
   ("Can Letterhome mail to a Canadian Forces address?", "Not to deployed members' Stn Forces or ship addresses. Please mail those yourself. We can mail to members at a base in Canada."),
  ],
  related=[REL_ADDR, REL_LETTERMAIL, REL_MP, REL_GUIDES],
  sources_text="Sources: National Defence, Instructions for mailing overseas; Canada Post, Canadian Forces Postal Service.",
  cta_h2="Send a letter in Canada", cta_p="Type it online and we print and mail it."),

ca("thank-you-letter-to-a-teacher-canada",
  title="How to Write a Thank-You Letter to a Teacher (Canada) | Letterhome",
  meta_desc="What to say in a thank-you letter to a teacher, examples from a parent and a former student, and when to send it, including World Teachers' Day on October 5.",
  breadcrumb="Thank-You Letter to a Teacher", eyebrow="Letter writing",
  h1_main="Thank-you letter", h1_em="to a teacher.",
  hero_sub="Teachers keep these letters for years. A few specific sentences are enough.",
  answer_box="Say who you are, describe one specific thing the teacher did and the difference it made, and thank them. World Teachers' Day is October 5, and the end of the school year in June or a letter years later from a former student works just as well.",
  steps=[
   ("Say who you are", "The student's name and grade, or the year you were in their class."),
   ("Share one specific moment", "How they explained something, a book they lent you, a comment on your work."),
   ("Say what it changed", "Then or now, and thank them."),
  ],
  warn=("Specific beats long:", "one real story means more to a teacher than a page of general praise."),
  sections=[
   ("Example from a parent", [
    "Dear Ms. Tremblay,<br><br>Thank you for this year with Maya in Grade 3. In October she said she \"hated reading\", and by spring she was reading under the covers with a flashlight. Letting her choose her own books changed everything.<br><br>With thanks,<br>Dana Brooks",
   ]),
   ("When to send it", [
    "World Teachers' Day is October 5. The end of the school year in June is another natural time, and a letter from a former student years later is one of the best things a teacher can get. Mail it to the teacher at the school, or ask the school board to forward it if they have moved.",
   ]),
  ],
  faq=[
   ("When is World Teachers' Day?", "October 5 every year."),
   ("What do you write in a thank-you letter to a teacher?", "Who you are, one specific thing they did, the difference it made, and a thank-you."),
   ("Can I write to a teacher who taught me years ago?", "Yes. Mail it to the school, or the school board if they have moved, and ask for it to be forwarded."),
  ],
  related=[("/thank-you-letter-to-a-nurse-canada", "Thank-You Letter to a Nurse", "For the care you or your family got"), REL_ADDR, REL_LETTERMAIL, REL_GUIDES],
  sources_text="Sources: UNESCO, World Teachers' Day.",
  cta_h2="Send your thank-you letter", cta_p="Type it online and we print and mail it."),

ca("thank-you-letter-to-a-nurse-canada",
  title="How to Write a Thank-You Letter to a Nurse (Canada) | Letterhome",
  meta_desc="What to say to a nurse who cared for you or your family, an example, how to make sure it reaches them, and National Nursing Week dates in Canada.",
  breadcrumb="Thank-You Letter to a Nurse", eyebrow="Letter writing",
  h1_main="Thank-you letter", h1_em="to a nurse.",
  hero_sub="Nurses rarely hear how things turned out. A short letter tells them.",
  answer_box="Say who you are and when you were cared for, name the nurse if you can, describe one thing they did, and say how you are now. Address it to the nurse and unit at the hospital. National Nursing Week in Canada ran May 11 to 17 in 2026 and runs May 10 to 16 in 2027.",
  steps=[
   ("Say when you were there", "Roughly when you or your family member were on the unit."),
   ("Name the nurse", "Or describe them, such as \"the night nurse on 4 West\"."),
   ("Say how things are now", "Nurses often never find out how their patients did."),
  ],
  warn=("Make sure it arrives:", "address it to the nurse and the unit at the hospital's mailing address, and ask the hospital's patient relations office if you are unsure."),
  sections=[
   ("Example", [
    "Dear Nurse Okafor and the 4 West team,<br><br>My mother, Ruth Klein, was on your floor after her hip surgery in August. You noticed she wasn't eating and found the soup she liked. It was a small thing that made her feel cared for.<br><br>She is walking with a cane now and back in her garden.<br><br>Thank you,<br>Ellen Klein",
   ]),
   ("When to send it", [
    "Any time is right. National Nursing Week includes International Nurses Day on May 12, Florence Nightingale's birthday. The Canadian Nurses Association lists the week as May 11 to 17 in 2026 and May 10 to 16 in 2027.",
   ]),
  ],
  faq=[
   ("When is National Nursing Week in Canada?", "The week that includes May 12. The Canadian Nurses Association lists May 11 to 17 in 2026 and May 10 to 16 in 2027."),
   ("How do I send a thank-you letter to a nurse at a hospital?", "Address it to the nurse and unit at the hospital's mailing address, or ask the patient relations office to pass it on."),
   ("What if I do not know the nurse's name?", "Address it to the unit, describe the nurse and the date, and ask for it to be passed on."),
  ],
  related=[("/thank-you-letter-to-a-teacher-canada", "Thank-You Letter to a Teacher", "What to say and when"), REL_ADDR, REL_LETTERMAIL, REL_GUIDES],
  sources_text="Sources: Canadian Nurses Association, National Nursing Week.",
  cta_h2="Send your thank-you letter", cta_p="Type it online and we print and mail it."),
]

if __name__ == '__main__':
    for p in UK:
        out = f"public/uk-{p['slug']}.html"
        open(out, 'w', encoding='utf-8').write(lg.build(p)); print('wrote', out)
    spec2 = importlib.util.spec_from_file_location('bg', 'scripts/build-guides-2026-11.py')
    bg = importlib.util.module_from_spec(spec2); spec2.loader.exec_module(bg)
    for g in CA:
        out = f"public/{g['slug']}.html"
        open(out, 'w', encoding='utf-8').write(bg.build_ca(g)); print('wrote', out)
