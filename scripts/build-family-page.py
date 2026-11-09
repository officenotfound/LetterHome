#!/usr/bin/env python3
"""Rebuilds public/monthly-letters.html (the family / loved-ones mail waitlist) in the same look as the business pages.
Keeps the existing <head>, structured data, FAQ and waitlist form wiring; reuses the .bz-* styles from public/business.html.
Run from the project root after public/business.html exists:  python3 scripts/build-family-page.py"""
import re, html, subprocess

OLD = open('/tmp/ml-old.html', encoding='utf-8').read() if False else subprocess.check_output(['git', 'show', 'dac014a:public/monthly-letters.html']).decode('utf-8')
BIZ = open('public/business.html', encoding='utf-8').read()

head = OLD[:OLD.index('<style>')]                                        # everything up to the styles (meta, canonical, JSON-LD)
biz_css = re.search(r'(\.bz-wrap\{.*?)\n</style>', BIZ, re.S).group(1)
theme_script = re.search(r'(<script>\(function\(\)\{try\{var m=window\.matchMedia.*?</script>)', OLD, re.S).group(1)
faq = re.findall(r'<p class="faq-q">(.*?)</p><p class="faq-a">(.*?)</p>', OLD, re.S)
faq_html = ''.join(f'<details class="faq-item"><summary class="faq-q">{q}</summary><p class="faq-a">{a}</p></details>' for q, a in faq)
related = re.search(r'<div class="related">.*?</div></div>', OLD, re.S).group(0)

extra_css = '''
.fm-people{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.fm-note{margin:28px 0 0;font-size:15px;color:var(--ink-muted);max-width:70ch}
.fm-note a{color:var(--red)}
.bz-form .check{grid-column:1/-1;display:flex;gap:10px;align-items:flex-start;font-size:14px;color:var(--ink-soft)}
.bz-form .check input{width:auto;margin-top:3px;flex:none}
.bz-form .form-msg{grid-column:1/-1;margin:0;font-size:14px;min-height:1.2em}
.bz-form .form-msg.err{color:#b3261e}.bz-form .form-msg.ok{color:#1d6b3a}
.fm-related{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.fm-related a{display:block;background:var(--paper);border:1px solid var(--line);padding:16px 18px;text-decoration:none;color:var(--ink)}
.fm-related a:hover{border-color:var(--red)}
.fm-related strong{display:block;font-family:'Archivo',sans-serif;font-size:16px;margin-bottom:4px}
.fm-related span{font-size:13.5px;color:var(--ink-muted)}
.fm-cta{text-align:center;max-width:640px;margin:0 auto}
.fm-cta h2{margin:0 0 10px!important}.fm-cta p{color:var(--ink-muted);margin:0 0 22px}
@media(max-width:900px){.fm-people{grid-template-columns:repeat(2,minmax(0,1fr))}.fm-related{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.fm-people,.fm-related{grid-template-columns:1fr}}
'''

people = [
  ('A grandparent in a care home', 'A retirement or long-term care home often has a mail table or a name on the door. A letter on the same day each month gives them something to look forward to.'),
  ('A relative in hospital or recovery', 'For a long stay, a letter or postcard a month from home. Check the hospital\'s mail rules first, and we will help you address it.'),
  ('A veteran or someone who served', 'Letters and photos to a veteran at home, in a care facility or in a veterans\' residence, on a day you pick.'),
  ('Someone serving or deployed', 'Where the address and the country allow mail, a letter from home on a schedule. Delivery can be slow, so we plan around it.'),
  ('Family living abroad', 'A parent, sibling or friend in another country. Letters go to over 160 countries, delivered typically up to four weeks.'),
  ('Someone who travels a lot', 'Hard to reach by phone and always moving? A monthly letter to a home address waits for them.'),
]
steps = ['Add the recipient\'s address once, in Canada or abroad.',
         'Pick a day each month, say the 1st, or the Sunday nearest the 15th.',
         'We email you a reminder a few days before, with a prompt if you are stuck. Write online or attach a PDF with photos.',
         'We verify the address, print and mail it. If you skip a month, nothing is mailed.']
step_t = ['Choose who it goes to', 'Pick a day each month', 'Get a reminder, then write', 'We print and mail it']
cards = ''.join(f'<div class="bz-card"><h3>{html.escape(n)}</h3><p>{html.escape(d)}</p></div>' for n, d in people)
steps_html = ''.join(f'<li><strong style="display:block;color:var(--ink);font-family:\'Archivo\',sans-serif;font-size:17px;margin-bottom:4px">{t}</strong>{s}</li>' for t, s in zip(step_t, steps))

body = f'''<body>
<a href="#main-content" class="skip-link" style="position:absolute;left:-9999px;top:4px;z-index:9999;background:#a8472d;color:#faf6ec;padding:8px 16px;font-size:14px;font-family:Georgia,serif;text-decoration:none;border-radius:2px" onfocus="this.style.left='4px'" onblur="this.style.left='-9999px'">Skip to main content</a>
<div id="site-header"></div>
<script src="/header.js?v=14"></script>
<main id="main-content">
<section class="bz-hero"><div class="bz-wrap bz-hero-in">
  <div class="bz-copy">
    <p class="bz-kicker">Coming soon</p>
    <h1>A real letter,<br><em>every month.</em></h1>
    <p class="bz-lede">For someone who loves getting mail: a grandparent in a care home, a veteran, a relative in hospital or far from home. Pick the day, write when the reminder arrives, and we print and mail it.</p>
    <div class="bz-actions"><a class="bz-btn" href="#join">Join the list</a><a class="bz-second" href="/send">Send a single letter now</a></div>
    <p class="bz-fine">Not open yet. We will email you once when it is. No payment on this page.</p>
  </div>
  <div class="bz-visual" aria-hidden="true">
    <div class="bz-env b2"></div><div class="bz-env b1"></div>
    <div class="bz-env f">
      <div class="bz-from">From someone<br>who thinks of you<br>on the 1st of the month</div>
      <div class="bz-stamp"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7 15l3-4 2 3 2-2 3 3"/></svg></div>
      <div class="bz-to">Grandma Rose<br>Room 14, Maple Court<br>CANADA</div>
      <div class="bz-pm"><span>Mailed from</span><b>Canada</b><span>every month</span></div>
    </div>
    <div class="bz-tag"><b>You write it</b>we print, address and mail it</div>
  </div>
</div></section>

<section class="bz-sec"><div class="bz-wrap">
  <div class="bz-head"><h2>Who it is for</h2><p>People who would love to get real mail, and the people who miss them.</p></div>
  <div class="fm-people">{cards}</div>
  <p class="fm-note">Run a care home, a hospital programme or a veterans\' group and want to send to many people? <a href="/business#quote">Ask about group mailing</a>.</p>
</div></section>

<section class="bz-sec alt"><div class="bz-wrap">
  <div class="bz-head"><h2>How it would work</h2></div>
  <ol class="bz-steps">{steps_html}</ol>
</div></section>

<section class="bz-sec" id="join"><div class="bz-wrap bz-quote">
  <div>
    <h2>Tell me when it opens</h2>
    <p class="lead">Nothing is open yet. We want to hear how you would use it before we set a price, so there is no payment on this page.</p>
    <ul>
      <li><svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>One email when it opens</li>
      <li><svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>No payment now, no obligation</li>
      <li><svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>Remove yourself any time</li>
    </ul>
    <p class="bz-foot">Prices are not set yet. Today a single letter is $6.00 to Canada or the United States and $15.00 elsewhere, and you can already <a href="/schedule-a-letter-for-later">schedule a letter for later</a>.</p>
  </div>
  <form class="bz-form" data-interest="Monthly letters" novalidate>
    <div class="field"><label for="i-name">Your name</label><input id="i-name" name="name" autocomplete="name" required></div>
    <div class="field"><label for="i-email">Email</label><input id="i-email" name="email" type="email" autocomplete="email" required></div>
    <div class="field full"><label for="i-note">Who would you write to, and how often?</label><textarea id="i-note" name="note" rows="3" placeholder="For example: my grandmother in a care home, every month"></textarea></div>
    <label class="check"><input type="checkbox" name="consent" required><span>Email me once when this opens. No other emails, and you can ask us to remove you any time.</span></label>
    <button class="bz-btn" type="submit">Tell me when it opens</button>
    <p class="form-msg" role="status" aria-live="polite"></p>
  </form>
</div></section>

<section class="bz-sec alt"><div class="bz-wrap bz-faq">
  <div class="bz-head"><h2>Common questions</h2></div>
  {faq_html}
</div></section>

<section class="bz-sec"><div class="bz-wrap">
  <div class="bz-head"><h2>Related guides</h2></div>
  <div class="fm-related">{''.join(re.findall(r'<a class="related-card".*?</a>', related, re.S)).replace('class="related-card"','')}</div>
</div></section>

<section class="bz-sec alt"><div class="bz-wrap fm-cta">
  <h2>Start with one letter.</h2><p>Write it now and choose the mailing date.</p>
  <a class="bz-btn" href="/send">Send a letter, from $6.00</a>
</div></section>
</main>

<footer id="site-footer"></footer>
<script src="/footer.js?v=19" defer></script>
<script src="/theme.js?v=4" defer></script>
<script src="/lang.js?v=54" defer></script>
<script src="/interest-form.js?v=1" defer></script>
</body>
</html>
'''
out = head + '<style>:root{--sans:inherit}\n' + biz_css + extra_css + '</style>\n' + theme_script + \
  '\n<link rel="stylesheet" href="/theme.css?v=24">\n<link rel="stylesheet" href="/guide.css?v=8">\n<link rel="stylesheet" href="/redesign.css?v=28"><link rel="stylesheet" href="/inner.css?v=7">\n</head>\n' + body
open('public/monthly-letters.html', 'w', encoding='utf-8').write(out)
print('wrote public/monthly-letters.html', len(out))
