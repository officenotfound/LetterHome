#!/usr/bin/env python3
"""Builds public/fax.html (the fax order page) and public/fax-status.html from the live guide shell, so they carry the
current header, footer, theme and asset versions. Run from the project root: python3 scripts/build-fax-pages-2026-11.py"""
import re, html

LIVE = open('public/registered-mail-vs-xpresspost.html', encoding='utf-8').read()
head, rest = LIVE.split('</head>', 1)
head = re.sub(r'<script type="application/ld\+json">.*?</script>\s*', '', head, flags=re.S)
body_open = rest[:rest.index('<div class="hero" id="main-content">')]
tail = rest[rest.index('<footer id="site-footer">'):]

def page(title, desc, url, content, noindex=False):
    h = head
    h = re.sub(r'<title>.*?</title>', f'<title>{html.escape(title)}</title>', h, flags=re.S)
    for pat, val in [(r'<meta name="description"[^>]*>', f'<meta name="description" content="{html.escape(desc)}">'),
                     (r'<link rel="canonical"[^>]*>', f'<link rel="canonical" href="{url}">'),
                     (r'<meta property="og:title"[^>]*>', f'<meta property="og:title" content="{html.escape(title)}">'),
                     (r'<meta property="og:description"[^>]*>', f'<meta property="og:description" content="{html.escape(desc)}">'),
                     (r'<meta property="og:url"[^>]*>', f'<meta property="og:url" content="{url}">'),
                     (r'<meta name="twitter:title"[^>]*>', f'<meta name="twitter:title" content="{html.escape(title)}">'),
                     (r'<meta name="twitter:description"[^>]*>', f'<meta name="twitter:description" content="{html.escape(desc)}">')]:
        h = re.sub(pat, val, h, count=1)
    h = h.replace('<html ', '<html data-rail-title="We send it for you" data-rail-text="We check your fax, send it to any Canadian or US fax number, and email you when it has been delivered. $5 for up to 10 pages." data-rail-href="/fax" data-rail-label="Send a fax" data-rail-meta="Pay securely with Stripe." ', 1)
    if noindex:
        h = h.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="robots" content="noindex">', 1)
    return h + STYLE + '</head>' + body_open + content + '\n' + tail

STYLE = '''<style>
.fx-card{background:var(--ds-surface,#fff);border:1px solid var(--ds-line,#e2ddd2);border-radius:12px;padding:24px;margin:0 0 32px}
.fx-field{display:flex;flex-direction:column;gap:6px;margin:0 0 18px}
.fx-field label{font-weight:600;font-size:15px}
.fx-field .hint{font-size:13px;color:var(--ink-muted,#6b6b6b)}
.fx-field input,.fx-field textarea{font:inherit;font-size:16px;padding:12px;border:1px solid var(--ds-line,#cfc8b9);border-radius:8px;background:var(--ds-bg,#fff);color:inherit;max-width:100%}
.fx-field textarea{min-height:96px;resize:vertical}
.fx-btn{font:inherit;font-size:16px;font-weight:600;padding:12px 22px;border-radius:8px;border:0;background:#a8472d;color:#fff;cursor:pointer}
.fx-btn[disabled]{opacity:.6;cursor:wait}
.fx-err{color:#b3261e;font-size:14px;margin:12px 0 0;min-height:1em}
.fx-quote{display:none;margin-top:20px;padding:18px;border-radius:10px;background:var(--ds-bg-2,#f5f0e8)}
.fx-quote p{margin:0 0 10px}
.fx-closed{display:none}
.fx-status dt{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-muted,#6b6b6b);margin-top:14px}
.fx-status dd{margin:2px 0 0;font-size:17px}
</style>
'''

FAX = '''<div class="hero" id="main-content">
  <p class="hero-eyebrow">Fax</p>
  <h1>Send a fax to Canada or the US</h1>
  <p class="hero-sub">Upload a PDF or a photo of your document, enter the fax number, and we send it for you. No fax machine needed.</p>
  <div class="answer-box">
    <p>A fax to any Canadian or US fax number costs $5 for up to 10 pages, plus $1 for each extra page. We check every fax before it is sent, usually within a few hours, and email you when it has been delivered.</p>
  </div>
</div>

<div class="main">
  <div class="fx-closed" id="fx-closed"><div class="fx-card"><h2 style="margin-top:0">Fax is coming soon</h2><p>We are getting fax ready. In the meantime, we can <a href="/send">print and mail your document</a> anywhere in Canada.</p></div></div>
  <form class="fx-card" id="fx-form" novalidate>
    <div class="fx-field"><label for="fx-to">Fax number</label><span class="hint">A Canadian or US fax number with its area code, such as 613-555-0123.</span><input id="fx-to" name="to" type="tel" autocomplete="off" inputmode="tel" required></div>
    <div class="fx-field"><label for="fx-doc">Document</label><span class="hint">PDF, JPG or PNG, up to 20 MB.</span><input id="fx-doc" name="document" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required></div>
    <div class="fx-field"><label for="fx-name">Your name</label><input id="fx-name" name="sender_name" type="text" autocomplete="name" maxlength="100" required></div>
    <div class="fx-field"><label for="fx-email">Your email</label><span class="hint">For your receipt and the delivery confirmation. Never shared or sold.</span><input id="fx-email" name="email" type="email" autocomplete="email" maxlength="200" required></div>
    <div class="fx-field"><label for="fx-note">Cover page note (optional)</label><span class="hint">If you write a note, we add a cover page with your name, the date and the note. It counts as a page.</span><textarea id="fx-note" name="cover_note" maxlength="2000"></textarea></div>
    <button class="fx-btn" id="fx-quote-btn" type="submit">See the price</button>
    <p class="fx-err" id="fx-err" role="alert"></p>
    <div class="fx-quote" id="fx-quote" aria-live="polite">
      <p id="fx-quote-text"></p>
      <button class="fx-btn" id="fx-pay" type="button">Pay and send</button>
      <p class="hint" style="font-size:13px;margin-top:10px">Payment by Stripe. We check every fax before it is sent.</p>
    </div>
  </form>

  <h2>How it works</h2>
  <ol class="steps">
    <li><div><strong>Upload and pay</strong><p>Add your document and the fax number, see the exact price, and pay by card.</p></div></li>
    <li><div><strong>We check it</strong><p>A person looks at every fax before it is sent, usually within a few hours, to make sure it will go through.</p></div></li>
    <li><div><strong>We send it</strong><p>If the line is busy or does not answer, we try twice more. If it still does not go through, we email you about what happens next.</p></div></li>
    <li><div><strong>You get a confirmation</strong><p>We email you when the fax machine has received every page, with the time it was delivered.</p></div></li>
  </ol>

  <h2>Price</h2>
  <p>$5 CAD for up to 10 pages, including the cover page if you add one, and $1 for each extra page. Faxes can be up to 50 pages. The exact price is shown before you pay.</p>

  <h2>What we can send</h2>
  <ul>
    <li>Faxes to Canadian and US fax numbers. Toll-free numbers are not accepted.</li>
    <li>PDF, JPG and PNG files. A password-protected PDF has to be saved without its password first.</li>
  </ul>

  <h2>Your document</h2>
  <p>Your file is stored privately, is never shown to anyone outside Letterhome except the fax service that sends it, and is deleted 24 hours after the fax is finished.</p>

  <div class="faq"><h2>Common questions</h2>
    <div class="faq-item"><p class="faq-q">How long does it take?</p><p class="faq-a">We check every fax before it is sent, usually within a few hours. Sending itself takes a few minutes, depending on the number of pages.</p></div>
    <div class="faq-item"><p class="faq-q">How do I know it arrived?</p><p class="faq-a">We email you once the receiving fax machine has accepted every page, with the date and time. Keep that email as your record.</p></div>
    <div class="faq-item"><p class="faq-q">What if the fax does not go through?</p><p class="faq-a">If the line is busy or does not answer, we try twice more. If it still fails, we email you about what happens next.</p></div>
    <div class="faq-item"><p class="faq-q">Can I fax a government office?</p><p class="faq-a">Yes, to any Canadian or US fax number. Check the office's current fax number on its own website before you send.</p></div>
  </div>
</div>
<script>
(function(){
  var form=document.getElementById('fx-form'),err=document.getElementById('fx-err'),qb=document.getElementById('fx-quote-btn'),pay=document.getElementById('fx-pay'),ref=null;
  fetch('/api/fax/config').then(function(r){return r.json()}).then(function(c){ if(!c.open){form.style.display='none';document.getElementById('fx-closed').style.display='block';} }).catch(function(){});
  function money(c){return '$'+(c/100).toFixed(2)}
  form.addEventListener('submit',function(e){
    e.preventDefault(); err.textContent=''; document.getElementById('fx-quote').style.display='none';
    var f=document.getElementById('fx-doc').files[0];
    if(!f){err.textContent='Choose a PDF, JPG or PNG file.';return}
    if(f.size>20*1024*1024){err.textContent='The file is larger than 20 MB.';return}
    var fd=new FormData(form); qb.disabled=true; qb.textContent='Preparing…';
    fetch('/api/fax/quote',{method:'POST',body:fd}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(x){
      qb.disabled=false; qb.textContent='See the price';
      if(!x.ok){err.textContent=x.j.error||'Something went wrong. Please try again.';return}
      ref=x.j.ref;
      document.getElementById('fx-quote-text').textContent='Fax to '+x.j.to+': '+x.j.pages+' page'+(x.j.pages===1?'':'s')+(x.j.cover?' including the cover page':'')+'. Total '+money(x.j.price_cents)+' CAD.';
      pay.textContent='Pay '+money(x.j.price_cents)+' and send';
      document.getElementById('fx-quote').style.display='block';
    }).catch(function(){qb.disabled=false;qb.textContent='See the price';err.textContent='The upload did not go through. Please try again.'});
  });
  ['fx-to','fx-doc','fx-name','fx-email','fx-note'].forEach(function(id){document.getElementById(id).addEventListener('change',function(){ref=null;document.getElementById('fx-quote').style.display='none'})});
  pay.addEventListener('click',function(){
    if(!ref)return; pay.disabled=true; err.textContent='';
    fetch('/api/fax/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:ref})}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(x){
      if(x.ok&&x.j.url){location.href=x.j.url;return}
      pay.disabled=false; err.textContent=x.j.error||'Payment could not be started.';
    }).catch(function(){pay.disabled=false;err.textContent='Payment could not be started. Please try again.'});
  });
})();
</script>'''

STATUS = '''<div class="hero" id="main-content">
  <p class="hero-eyebrow">Fax</p>
  <h1>Your fax</h1>
  <p class="hero-sub" id="fx-lead">Loading…</p>
</div>
<div class="main">
  <div class="fx-card"><dl class="fx-status" id="fx-status" style="margin:0"></dl></div>
  <p>Questions about your fax? Use the <a href="/contact">contact form</a> and include your order number.</p>
</div>
<script>
(function(){
  var token=location.pathname.split('/').pop(), timer=null;
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function load(){
    fetch('/api/fax/status/'+encodeURIComponent(token),{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){
      var lead=document.getElementById('fx-lead');
      if(!d){lead.textContent='We could not find this fax. Check the link in your email.';return}
      var waiting=d.status==='awaiting_payment';
      lead.textContent=waiting?'We are confirming your payment. This page updates by itself.':d.status_text;
      document.getElementById('fx-status').innerHTML='<dt>Order</dt><dd>'+esc(d.ref)+'</dd><dt>Fax number</dt><dd>'+esc(d.to)+'</dd><dt>Pages</dt><dd>'+esc(d.pages)+'</dd><dt>Price</dt><dd>'+esc(d.price)+'</dd><dt>Status</dt><dd>'+esc(d.status_label)+'</dd>';
      clearTimeout(timer);
      if(['delivered','refunded','cancelled','failed'].indexOf(d.status)<0) timer=setTimeout(load,15000);
    }).catch(function(){timer=setTimeout(load,15000)});
  }
  load();
})();
</script>'''

if __name__ == '__main__':
    open('public/fax.html', 'w', encoding='utf-8').write(page('Send a Fax to Canada or the US Online | Letterhome',
        'Send a fax online to any Canadian or US fax number from anywhere. Upload a PDF or photo, $5 for up to 10 pages, with an email confirmation when it is delivered.',
        'https://letterhome.ca/fax', FAX))
    open('public/fax-status.html', 'w', encoding='utf-8').write(page('Your Fax | Letterhome', 'The status of your Letterhome fax.',
        'https://letterhome.ca/fax', STATUS, noindex=True))
    print('wrote public/fax.html, public/fax-status.html')
