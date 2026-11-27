#!/usr/bin/env python3
"""US guide: how to send fan mail (2026-11-26). Builds public/us-how-to-send-fan-mail.html with the shared US page shell.
Run from the project root:  python3 scripts/build-fan-mail-guide-2026-11.py
It teaches readers where fan mail goes and how to find a current address themselves. It never lists anyone's address,
and never a home address. Facts checked 2026-11-26: IMDb help centre (no forwarding; IMDbPro lists representation),
senate.gov contact page (address format), whitehouse.gov/contact (mailing address), USPS Postal Operations Manual
(reply coupons no longer sold since January 27, 2013), and the Forever stamp and nonmachinable prices already on
public/us-postage-rates-2026.html (USPS Notice 123)."""
import importlib.util

spec = importlib.util.spec_from_file_location('lg', 'scripts/build-local-guides.py')
lg = importlib.util.module_from_spec(spec); spec.loader.exec_module(lg)
lg.PUBLISHED = '2026-11-26'

PAGE = dict(c='us', slug='how-to-send-fan-mail',
 title='How to Send Fan Mail to a Celebrity (2026)',
 desc='Where fan mail really goes, how to find a current address for an actor, musician, athlete or author yourself, what to write, and how to ask for an autograph by mail.',
 eyebrow='Letter writing', h1='How to send<br><em>fan mail</em>',
 sub='Where letters to famous people actually go, and how to find the right address yourself.',
 answer='Send fan mail to the person\'s public business address, never a home address: their talent agency, manager or publicist, their team, their publisher or record label, or the office of a foundation they run. Find it on their official website, in their social media bio, or in an industry directory, and add a self-addressed stamped envelope if you hope for something back.',
 body='''
<h2>Where fan mail actually goes</h2>
<p>Famous people almost never get letters at home, and you should never try to find a home address. Fan mail goes to the people and organizations that work with them, who sort it and pass it on. Write the person's name on the first line, then "c/o" (care of) and the organization:</p>
<pre class="addr">Jordan Rivera
c/o Example Talent Agency
1234 Sample Avenue, Suite 500
Los Angeles, CA 90000</pre>
<p>That address is made up to show the layout. The right place depends on who you are writing to.</p>
<div class="cost-wrap"><table class="cost"><thead><tr><th>Who you are writing to</th><th>Where the letter usually goes</th></tr></thead><tbody>
<tr><td>Actors and TV hosts</td><td>Their talent agency, manager or publicist, or the studio or network of a current show</td></tr>
<tr><td>Musicians</td><td>Their management company or record label, or an official fan club</td></tr>
<tr><td>Professional athletes</td><td>The team's office or ballpark, with the player's name on the first line</td></tr>
<tr><td>Authors</td><td>The address on their website, or their publisher, marked "Please forward"</td></tr>
<tr><td>Creators and influencers</td><td>A P.O. box or business address listed in their channel or profile</td></tr>
<tr><td>Someone who runs a foundation</td><td>The foundation's office, if your letter is about its work</td></tr>
<tr><td>Politicians</td><td>Their official office (see below)</td></tr>
</tbody></table></div>

<h2>How to find the current address yourself</h2>
<p>Addresses change when people switch agents or teams, so look for one that is current and comes from an official source. Work down this list:</p>
<ol>
<li><strong>Their official website.</strong> Look for a Contact, Fan mail or About page. Some people publish a fan mail address or a P.O. box, and some say they do not accept mail at all. If they say no, respect it.</li>
<li><strong>Their social media bios.</strong> Instagram, YouTube and TikTok bios often name a manager, agency or business email. Verified accounts are the safe ones to trust.</li>
<li><strong>The organization's own website.</strong> Teams usually explain fan mail under Fans, Community or Contact. Publishers and record labels list a mailing address on their contact page. A foundation's site lists its office.</li>
<li><strong>IMDbPro for film and TV.</strong> IMDb itself does not pass messages on, but its paid IMDbPro service lists agents, managers and publicists for people in the industry, and it offers a free trial.</li>
<li><strong>The agency directly.</strong> Once you know the agency's name, its own website gives the office address. Mail addressed to a client in care of the agency is how most fan mail travels.</li>
</ol>
<p>Be careful with fan mail address lists you find online. Many are years out of date, and an old address means your letter goes nowhere. A real agent or manager never charges you to pass on a letter.</p>

<h2>Writing to a foundation</h2>
<p>If someone you admire runs a charity or foundation, its office is a good place to write, especially about its work. Use the address on the foundation's own website. Registered US charities also file a public annual return, Form 990, that shows their address, and you can look up the filings with the IRS Tax Exempt Organization Search. Keep the letter about the cause, since the staff who open it work for the foundation.</p>

<h2>Writing to a politician</h2>
<p>Politicians publish their own addresses, so there is nothing to hunt for. Senators list theirs on their websites, and the standard Senate format is:</p>
<pre class="addr">The Honorable Jane Doe
United States Senate
Washington, DC 20510</pre>
<p>The Senate asks you to include your return address, and most offices answer people from their own state. Letters to the President go to The White House, 1600 Pennsylvania Avenue NW, Washington, DC 20500.</p>

<h2>What to write</h2>
<ul>
<li><strong>Keep it to one page.</strong> Say who you are, why their work matters to you, and anything specific, such as a song, a game or a scene. Specific letters are the ones people remember.</li>
<li><strong>Be warm and polite, not demanding.</strong> Thank them. Do not ask for money, favors or personal details.</li>
<li><strong>Put your name and return address on the letter itself,</strong> not only on the envelope, because envelopes and letters often get separated when mail is sorted.</li>
<li><strong>Do not send anything you cannot lose,</strong> such as originals, valuable cards or photos you have no copy of.</li>
</ul>

<h2>Asking for an autograph by mail</h2>
<p>If you hope for a signed photo or card, make it easy to say yes:</p>
<ol>
<li>Include a <strong>self-addressed stamped envelope</strong> (SASE) with your address on the front and postage already on it.</li>
<li>Send a small, flat item to sign, such as an index card or a trading card in a sleeve, and keep the request short.</li>
<li>Check the postage. A one-ounce letter costs <strong>$0.82</strong> with a Forever stamp, and each extra ounce adds 29 cents. A rigid or lumpy envelope, like one with a card holder inside, can count as nonmachinable and needs another <strong>$0.49</strong>. Our <a href="/us/postage-rates-2026">2026 postage rates</a> list every price.</li>
<li>Know who signs by mail. Many athletes and actors sign some requests, but the biggest names often use a service that sends a standard photo, and some never answer. A reply can take weeks or months.</li>
</ol>

<h2>If the person lives outside the US</h2>
<p>US stamps only work on mail sent from the US, so a stamped return envelope will not help someone in another country send you a reply. The Postal Service also stopped selling international reply coupons in 2013. For a reply from abroad, the simplest option is to include your email address in the letter.</p>

<h2>Sending a fan letter without a printer</h2>
<p>If you type your letter, we can print it, put it in an envelope and mail it for you, from $3.00 within the US. You can add photos printed in color. Put your own name and address in the return address box so a reply comes to you. We only mail the letter itself, so if you want to enclose a return envelope or an item to sign, mail it yourself from the Post Office.</p>
''',
 faq=[('Where do I send fan mail to a celebrity?', 'To their public business address: their talent agency, manager or publicist, the studio or network of a current show, their record label, team or publisher. Write their name first, then "c/o" and the organization.'),
      ('How do I find a celebrity\'s fan mail address?', 'Check their official website and verified social media bios first, then the website of their team, label, publisher or agency. For film and TV, IMDbPro lists agents, managers and publicists.'),
      ('Can I send fan mail to a celebrity\'s home?', 'No. Use a public business address only. Home addresses are private, and fan mail is handled by the people who work with them.'),
      ('Do celebrities actually read fan mail?', 'Some read it themselves and some have staff or a fan mail service sort it. Smaller names are more likely to answer in person, while big names often send a standard signed photo or do not reply.'),
      ('How do I get an autograph through the mail?', 'Send a short, polite letter with a small item to sign and a self-addressed stamped envelope. Check that the person signs by mail, and do not send anything valuable.'),
      ('How much postage does fan mail need?', 'A one-ounce letter needs a $0.82 Forever stamp, and each extra ounce adds 29 cents. A rigid or lumpy envelope can need another $0.49.'),
      ('How do I send fan mail to an athlete?', 'Mail it to the team\'s office or ballpark with the player\'s name on the first line. Most teams explain fan mail on their official website.'),
      ('How do I send a letter to an author?', 'Use the address on the author\'s website if there is one. Otherwise write to them in care of their publisher and mark it "Please forward".')],
 sources=[('IMDb Help Center: contacting people listed on IMDb', 'https://help.imdb.com/article/imdb/general-information/can-you-help-me-contact-a-celebrity-listed-on-imdb/GFA2FEUR23PGDFXG'),
          ('U.S. Senate: contacting senators', 'https://www.senate.gov/senators/senators-contact.htm'),
          ('The White House: contact', 'https://www.whitehouse.gov/contact/'),
          ('IRS: Tax Exempt Organization Search', 'https://www.irs.gov/charities-non-profits/tax-exempt-organization-search'),
          ('USPS Notice 123: current price list', 'https://pe.usps.com/text/dmm300/Notice123.htm'),
          ('USPS International Mail Manual 380: supplemental services', 'https://pe.usps.com/text/imm/immc3_025.htm')],
 related=[('/us/how-to-address-an-envelope', 'How to address an envelope', 'Where everything goes'),
          ('/us/how-much-is-a-stamp', 'How much is a stamp in 2026?', 'The Forever stamp price and what it covers'),
          ('/us/return-address-on-a-letter', 'Do you need a return address?', 'When USPS needs one and when it does not'),
          ('/us/mail-a-letter-without-a-printer', 'Mail a letter without a printer', 'Three ways to get a letter sent')])

if __name__ == '__main__':
    out = f"public/{PAGE['c']}-{PAGE['slug']}.html"
    open(out, 'w', encoding='utf-8').write(lg.build(PAGE))
    print('wrote', out)
