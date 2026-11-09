#!/usr/bin/env python3
"""Builds the careers pages: public/careers.html (/careers) and one page per open role.
Styles, header and footer come from public/bulk-mailing.html so the pages match the site.
Run from the project root:  python3 scripts/build-careers.py
To close a role, remove it from JOBS (and its sitemap entry); /careers then says there are no openings."""
import html, json, re

BASE = 'https://letterhome.ca'
POSTED = '2026-11-09'
VALID_THROUGH = '2027-02-09'
def esc(s): return html.escape(s, quote=True)

JOBS = [dict(
  slug='independent-sales-representative',
  title='Independent Sales Representative, Commission Only (Remote, Contract)',
  short='Find and sign business clients who send mail regularly. Commission only, fully remote, set your own hours.',
  summary='Commission only · Contract · Remote, anywhere in the world',
  sections=[
    ('About Letterhome', '<p>Letterhome is a Canadian online mail service. Businesses and individuals upload a letter or type it online, and we print it, put it in an envelope and mail it. Customers include landlords and property managers sending notices, law and immigration offices mailing client documents, small businesses sending invoices and statements, and real estate agents sending postcards. We serve Canada, the United States and the United Kingdom.</p>'),
    ('About the role', '<p>We are looking for independent sales representatives to find and sign business clients who send mail regularly. You set your own hours and work from wherever you like, anywhere in the world. This is a commission-only contract role: you are paid only when a client you referred pays us.</p>'),
    ('What you will do', '<ul><li>Find businesses that mail regularly, such as property managers, law offices, immigration consultants, accountants, clinics and real estate agents.</li><li>Explain how Letterhome works and send interested clients to our <a href="/business#quote">business quote form</a>, or introduce them to us directly.</li><li>Follow up with leads and keep a simple record of who you have contacted.</li><li>Follow our outreach guidelines: no spam, no bulk unsolicited email, and no claims we have not approved.</li></ul>'),
    ('How you are paid', '<ul><li>15% commission on everything a client you referred pays us in their first 12 months.</li><li>Paid monthly, by e-transfer or PayPal, for client payments received in the previous month.</li><li>Commission is tracked with a personal referral link or code and confirmed with you each month.</li><li>No fees, no starter kit and nothing to buy. You never pay us anything.</li></ul>'),
    ('What we are looking for', '<ul><li>Experience in B2B sales, lead generation or account management.</li><li>Clear written and spoken English. Spanish or French is a plus.</li><li>Comfortable working on your own and setting your own schedule.</li><li>A professional manner on email, phone and LinkedIn.</li><li>Your own computer and phone, with a reliable internet connection.</li></ul>'),
    ('What we provide', '<ul><li>Product training, pricing sheets and a sales one-pager.</li><li>A personal referral link and code.</li><li>Direct contact with the founder for quotes and questions.</li></ul>'),
    ('Contract details', '<ul><li>You will be an independent contractor, not an employee, and responsible for your own taxes in your country.</li><li>Fully remote. Work from anywhere in the world, on your own equipment.</li><li>No minimum hours or quotas.</li><li>Either side can end the agreement with 14 days’ notice. Commission already earned is still paid.</li></ul>'),
  ],
)]

src = open('public/bulk-mailing.html', encoding='utf-8').read()
styles = src[src.index('<link rel="stylesheet" href="/fonts.css'):src.index('</head>')]
body_open = src[src.index('<body'):src.index('<div class="hero"')]
tail = src[src.index('<footer id="site-footer">'):]
tail = re.sub(r'<script>(?:(?!</script>).)*</script>\s*', '', tail, flags=re.S)   # drop the bulk page's own inline form script

EXTRA_CSS = '''<style>
.job-card{display:block;background:var(--paper);border:1px solid var(--line);border-left:4px solid var(--red);padding:22px 24px;text-decoration:none;color:var(--ink);margin:16px 0}
.job-card:hover{border-color:var(--red)}
.job-card strong{display:block;font-family:'Archivo',sans-serif;font-size:19px;margin-bottom:6px}
.job-card span{display:block;color:var(--ink-muted);font-size:15px}
.job-card em{display:block;font-style:normal;font-size:13px;color:var(--red);margin-top:8px}
.job-meta{display:flex;flex-wrap:wrap;gap:8px 18px;margin:14px 0 0;font-size:14px;color:var(--ink-soft)}
.main ul{margin:10px 0 18px 20px}.main li{margin-bottom:6px}
.apply{background:var(--paper);border:1px solid var(--line);padding:28px;margin-top:36px}
.apply .field{margin-bottom:14px}.apply label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
.apply input,.apply textarea{width:100%;box-sizing:border-box;padding:12px 13px;font-size:15px;border:1px solid var(--line);border-radius:2px;background:#fff;color:#2a2a2a}
.apply textarea{min-height:110px;resize:vertical}
.apply button{background:var(--red);color:#fff;border:0;padding:14px 26px;font-size:14px;cursor:pointer}
.apply button:disabled{opacity:.6}
.apply .msg{margin:12px 0 0;font-size:14px}.apply .msg.err{color:#b3261e}.apply .msg.ok{color:#1d6b3a}
.note{font-size:14px;color:var(--ink-muted)}
</style>
'''

def head(title, desc, path, ld):
    return f'''<!DOCTYPE html>
<html data-en-only lang="en-CA">
<head>
<meta charset="UTF-8">
<link rel="preload" as="font" type="font/woff2" href="/fonts/vEFI2_tTDB4M7-auWDN0ahZJW1gb8tc.woff2" crossorigin>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="/ga.js?v=2" defer></script>
<script src="/cookie-consent.js?v=12" defer></script>
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{BASE}{path}">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{BASE}{path}">
<meta property="og:image" content="https://letterhome.ca/og-image.jpg?v=4">
<meta property="og:site_name" content="Letterhome">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=1)}
</script>
{styles}{EXTRA_CSS}</head>
{body_open}'''

# ── /careers ──
cards = ''.join(f'<a class="job-card" href="/careers/{j["slug"]}"><strong>{esc(j["title"])}</strong><span>{esc(j["short"])}</span><em>{esc(j["summary"])}</em></a>' for j in JOBS)
index_ld = {'@context': 'https://schema.org', '@type': 'WebPage', 'name': 'Careers at Letterhome', 'url': f'{BASE}/careers',
            'isPartOf': {'@id': f'{BASE}/#website'}, 'inLanguage': 'en-CA'}
index = head('Careers at Letterhome: Remote Roles', 'Open roles at Letterhome, a Canadian online mail service. Remote work from anywhere, including commission-only sales roles for business clients.', '/careers', index_ld) + f'''<div class="hero" id="main-content">
  <p class="hero-eyebrow">Careers</p>
  <h1>Work with Letterhome</h1>
  <p class="hero-sub">We are a small Canadian mail service. Every role is remote, and you can work from anywhere.</p>
</div>

<div class="main">
  <h2>Open roles</h2>
  {cards or '<p>There are no open roles right now. You are welcome to <a href="/contact">get in touch</a> anyway.</p>'}
  <h2>How we work</h2>
  <p>Letterhome prints and mails letters for people and businesses in Canada, the United States and the United Kingdom. We are a small team, so you will deal directly with the founder, and decisions are quick.</p>
  <p class="note">We never charge applicants for anything: no training fees, no starter kits and no equipment to buy from us. If anyone asks you to pay to work with Letterhome, it is not us. Please tell us at <a href="mailto:support@letterhome.ca">support@letterhome.ca</a>.</p>
</div>

{tail}'''
open('public/careers.html', 'w', encoding='utf-8').write(index)
print('wrote public/careers.html')

# ── one page per role ──
FORM_JS = '''<script>
document.getElementById('apply-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var f = e.target, msg = f.querySelector('.msg'), btn = f.querySelector('button');
  var v = function (n) { return (f.elements[n].value || '').trim(); };
  var file = f.elements.resume.files[0];
  if (!v('name') || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(v('email')) || !v('experience') || !v('businesses')) { msg.className = 'msg err'; msg.textContent = 'Please fill in your name, a valid email and both questions.'; return; }
  if (file && file.size > 5 * 1024 * 1024) { msg.className = 'msg err'; msg.textContent = 'Your resume is larger than 5 MB. Please upload a smaller file.'; return; }
  if (file && !/\\.(pdf|docx?)$/i.test(file.name)) { msg.className = 'msg err'; msg.textContent = 'Please upload your resume as a PDF or Word file.'; return; }
  var data = new FormData(f);
  data.append('role', f.getAttribute('data-role'));
  btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Sending...';
  fetch('/api/careers/apply', { method: 'POST', body: data })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ''); }); })
    .then(function () { f.querySelectorAll('input,textarea,button').forEach(function (el) { el.disabled = true; }); msg.className = 'msg ok'; msg.textContent = 'Thanks. Your application was sent, and we will reply by email.'; })
    .catch(function (err) { btn.disabled = false; msg.className = 'msg err'; msg.textContent = err.message || 'Something went wrong. Please email support@letterhome.ca instead.'; });
});
</script>
'''
for j in JOBS:
    path = f'/careers/{j["slug"]}'
    body_html = ''.join(f'<h2>{esc(h)}</h2>\n{c}\n' for h, c in j['sections'])
    ld = {'@context': 'https://schema.org', '@type': 'JobPosting', 'title': j['title'],
          'description': body_html, 'datePosted': POSTED, 'validThrough': VALID_THROUGH + 'T23:59', 'employmentType': 'CONTRACTOR',
          'hiringOrganization': {'@type': 'Organization', 'name': 'Letterhome', 'sameAs': BASE, 'logo': f'{BASE}/apple-touch-icon.png'},
          'jobLocationType': 'TELECOMMUTE',
          'applicantLocationRequirements': [{'@type': 'Country', 'name': n} for n in ('Canada', 'United States', 'United Kingdom')],
          'directApply': True, 'url': BASE + path}
    page = head(f'{j["title"]} | Letterhome', j['short'] + ' 15% of first-year revenue from each client.', path, ld) + f'''<div class="hero" id="main-content">
  <p class="hero-eyebrow"><a href="/careers" style="color:inherit">Careers</a></p>
  <h1>Independent sales representative</h1>
  <p class="hero-sub">{esc(j["short"])}</p>
  <div class="job-meta"><span>Commission only, 15%</span><span>Contract</span><span>Remote, anywhere in the world</span><span>Posted November 2026</span></div>
</div>

<div class="main">
{body_html}
<form class="apply" id="apply-form" data-role="{esc(j["title"])}" novalidate>
  <h2 style="margin-top:0">Apply</h2>
  <p>Send a short note about your sales experience and the types of businesses you would approach. We reply to every application by email.</p>
  <div class="field"><label for="a-name">Your name</label><input id="a-name" name="name" autocomplete="name" required></div>
  <div class="field"><label for="a-email">Email</label><input id="a-email" name="email" type="email" autocomplete="email" required></div>
  <div class="field"><label for="a-country">Country you work from</label><input id="a-country" name="country" autocomplete="country-name"></div>
  <div class="field"><label for="a-link">LinkedIn profile or website (optional)</label><input id="a-link" name="link" type="url" placeholder="https://"></div>
  <div class="field"><label for="a-exp">Your sales experience</label><textarea id="a-exp" name="experience" required></textarea></div>
  <div class="field"><label for="a-biz">Which businesses would you approach, and how?</label><textarea id="a-biz" name="businesses" required></textarea></div>
  <div class="field"><label for="a-resume">Resume (optional, PDF or Word, up to 5 MB)</label><input id="a-resume" name="resume" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></div>
  <p class="note" style="margin:-4px 0 16px">We only use your resume to review your application.</p>
  <button type="submit">Send application</button>
  <p class="msg" role="status" aria-live="polite"></p>
</form>
<p class="note" style="margin-top:20px">We never charge applicants for anything. If anyone asks you to pay to work with Letterhome, it is not us.</p>
</div>

{FORM_JS}{tail}'''
    open(f'public/careers-{j["slug"]}.html', 'w', encoding='utf-8').write(page)
    print(f'wrote public/careers-{j["slug"]}.html')
