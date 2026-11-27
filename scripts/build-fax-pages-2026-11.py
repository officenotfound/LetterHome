#!/usr/bin/env python3
"""Builds the fax order pages and the fax status page from live page shells, so they carry the current header, footer,
theme and asset versions. Run from the project root: python3 scripts/build-fax-pages-2026-11.py

  public/fax.html                       letterhome.ca/fax                  English, Canadian dollars
  public/envoyer-un-fax-en-ligne.html   letterhome.ca/envoyer-un-fax-en-ligne   Canadian French, Canadian dollars
  public/us-fax.html                    letterhome.us/fax  (/us/fax on .ca)    English, US dollars
  public/fax-es.html                    letterhome.us/es/fax (/us/es/fax)      US Spanish, US dollars
  public/fax-status.html                /fax/status/<token>, shared; its words follow the language the fax was ordered in

The four order pages point at each other with hreflang, so the language detection in header.js sends a French or Spanish
browser to its own page. Prices shown are the defaults in Settings; the page replaces them with the current Settings prices."""
import re, html, json, os, sys
sys.path.insert(0, os.path.join(os.getcwd(), "scripts"))
from fax_ui_strings import UI
import fax_order_template

def shell(file):
    live = open(file, encoding='utf-8').read()
    head, rest = live.split('</head>', 1)
    head = re.sub(r'<script type="application/ld\+json">.*?</script>\s*', '', head, flags=re.S)
    head = re.sub(r'<link rel="alternate"[^>]*>\s*', '', head)
    return head, rest[:rest.index('<div class="hero" id="main-content">')], rest[rest.index('<footer id="site-footer">'):]
CA_SHELL = shell('public/registered-mail-vs-xpresspost.html')
US_SHELL = shell('public/us-what-is-certified-mail.html')
ES_SHELL = shell('public/como-enviar-una-carta-a-canada-desde-ee-uu-es.html')

BASE = 'https://letterhome.ca'
ALT = {'en-CA': '/fax', 'fr-CA': '/envoyer-un-fax-en-ligne', 'en-US': '/us/fax', 'es-US': '/us/es/fax'}
ALT_LINKS = ''.join(f'<link rel="alternate" hreflang="{k}" href="{BASE}{v}">\n' for k, v in ALT.items()) + f'<link rel="alternate" hreflang="x-default" href="{BASE}/fax">\n'

def page(title, desc, url, content, sh, html_attrs, noindex=False, alternates='', extra_head='', share_image=''):
    head, body_open, tail = sh
    h = re.sub(r'<title>.*?</title>', f'<title>{html.escape(title)}</title>', head, flags=re.S)
    for pat, val in [(r'<meta name="description"[^>]*>', f'<meta name="description" content="{html.escape(desc)}">'),
                     (r'<link rel="canonical"[^>]*>', f'<link rel="canonical" href="{url}">'),
                     (r'<meta property="og:title"[^>]*>', f'<meta property="og:title" content="{html.escape(title)}">'),
                     (r'<meta property="og:description"[^>]*>', f'<meta property="og:description" content="{html.escape(desc)}">'),
                     (r'<meta property="og:url"[^>]*>', f'<meta property="og:url" content="{url}">'),
                     (r'<meta name="twitter:title"[^>]*>', f'<meta name="twitter:title" content="{html.escape(title)}">'),
                     (r'<meta name="twitter:description"[^>]*>', f'<meta name="twitter:description" content="{html.escape(desc)}">')]:
        h = re.sub(pat, val, h, count=1)
    if share_image:
        h = re.sub(r'<meta property="og:image(:width|:height|:alt)?"[^>]*>\n?', '', h)
        h = re.sub(r'<meta name="twitter:image"[^>]*>', f'<meta name="twitter:image" content="{share_image}">', h, count=1)
        h = h.replace('<meta property="og:site_name"', f'<meta property="og:image" content="{share_image}">\n<meta property="og:image:width" content="1424">\n<meta property="og:image:height" content="748">\n<meta property="og:image:alt" content="Send a fax to the US or Canada from $3">\n<meta property="og:site_name"', 1)
    h = re.sub(r'<html[^>]*>', f'<html {html_attrs}>', h, count=1)
    if alternates:
        h = h.replace(f'<link rel="canonical" href="{url}">', f'<link rel="canonical" href="{url}">\n' + alternates.rstrip('\n'), 1)
    if noindex:
        h = h.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="robots" content="noindex">', 1)
    return h + STYLE + extra_head + '</head>' + body_open + content + '\n' + tail

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

def rail(t):
    return (f'data-rail-title="{html.escape(t["rail_t"])}" data-rail-text="{html.escape(t["rail_p"])}" data-rail-href="#fx-form" '
            f'data-rail-label="{html.escape(t["rail_btn"])}" data-rail-meta="{html.escape(t["rail_meta"])}"')

EN = dict(lang='en', site='ca', cur='CAD', base='$3.00', page='$0.50', money="'$'+(c/100).toFixed(2)",
  eyebrow='Fax', h1='Send a fax to Canada or the US',
  sub='Upload a PDF or a photo of your document, enter the fax number, and we send it for you. No fax machine needed.',
  answer='A fax to any Canadian or US fax number costs {base} for up to {incl} pages, plus {page} for each extra page. We usually send it within a few hours and email you when it has been delivered.',
  closed_h='Fax is coming soon', closed_p='We are getting fax ready. In the meantime, we can <a href="/send">print and mail your document</a> anywhere in Canada.',
  l_to='Fax number', h_to='A Canadian or US fax number with its area code, such as 613-555-0123.', l_doc='Document', h_doc='PDF, JPG or PNG, up to 20 MB.',
  l_name='Your name', l_email='Your email', h_email='For your receipt and the delivery confirmation. Never shared or sold.',
  l_note='Cover page note (optional)', h_note='If you write a note, we add a cover page with your name, the date and the note. It counts as a page.',
  b_quote='See the price', b_pay='Pay and send', pay_note='Payment by Stripe.',
  how_h='How it works', steps=[('Upload and pay', 'Add your document and the fax number, see the exact price, and pay by card.'),
    ('We send it', 'Usually within a few hours. If the line is busy or does not answer, we try twice more. If it still does not go through, we email you about what happens next.'),
    ('You get a confirmation', 'We email you when the fax machine has received every page, with the time it was delivered.')],
  price_h='Price', price_p='{base} {cur} for up to {incl} pages, including the cover page if you add one, and {page} for each extra page. Faxes can be up to 50 pages. The exact price is shown before you pay.',
  can_h='What we can send', can=['Faxes to Canadian and US fax numbers. Toll-free numbers are not accepted.', 'PDF, JPG and PNG files. A password-protected PDF has to be saved without its password first.'],
  doc_h='Your document', doc_p='Your file is stored privately, is never shown to anyone outside Letterhome except the fax service that sends it, and is deleted 24 hours after the fax is finished.',
  faq_h='Common questions', faq=[('How long does it take?', 'Faxes usually go out within a few hours. Sending itself takes a few minutes, depending on the number of pages.'),
    ('How do I know it arrived?', 'We email you once the receiving fax machine has accepted every page, with the date and time. Keep that email as your record.'),
    ('What if the fax does not go through?', 'If the line is busy or does not answer, we try twice more. If it still fails, we email you about what happens next.'),
    ('Can I fax a government office?', 'Yes, to any Canadian or US fax number. Check the office\'s current fax number on its own website before you send.')],
  js=dict(sep=': ', choose='Choose a PDF, JPG or PNG file.', big='The file is larger than 20 MB.', preparing='Preparing…', again='Something went wrong. Please try again.',
    upfail='The upload did not go through. Please try again.', faxto='Fax to ', page=' page', pages=' pages', cover=' including the cover page', total='. Total ',
    pay='Pay {amt} and send', payfail='Payment could not be started.', payfail2='Payment could not be started. Please try again.'),
  rail_t='We send it for you', rail_p='We send it to any Canadian or US fax number, and email you when it has been delivered.', rail_btn='Send a fax', rail_meta='Pay securely with Stripe.',
  title='Send a Fax to Canada or the US Online | Letterhome',
  desc='Send a fax online to any Canadian or US fax number from anywhere. Upload a PDF or photo, $3 for up to 10 pages, with an email confirmation when it is delivered.')

US = dict(EN, site='us', cur='USD', base='$2.50', page='$0.25', h1='Send a fax to the US or Canada',
  answer=EN['answer'].replace('any Canadian or US', 'any US or Canadian'),
  h_to='A US or Canadian fax number with its area code, such as 212-555-0123.',
  closed_p='We are getting fax ready. In the meantime, we can <a href="/send?to=US">print and mail your document</a> anywhere in the US.',
  can=['Faxes to US and Canadian fax numbers. Toll-free numbers are not accepted.', EN['can'][1]],
  title='Send a Fax Online to the US or Canada | Letterhome',
  desc='Send a fax online to any US or Canadian fax number from anywhere. Upload a PDF or photo, $2.50 for up to 10 pages, with an email confirmation when it is delivered.')

FR = dict(lang='fr', site='ca', cur='CAD', base='3,00 $', page='0,50 $', money="(c/100).toFixed(2).replace('.',',')+' $'",
  eyebrow='Fax', h1='Envoyer un fax au Canada ou aux États-Unis',
  sub='Téléversez un PDF ou une photo de votre document, entrez le numéro de fax, et nous l’envoyons pour vous. Pas besoin de télécopieur.',
  answer='Un fax vers n’importe quel numéro canadien ou américain coûte {base} pour un maximum de {incl} pages, plus {page} par page supplémentaire. Nous l’envoyons habituellement en quelques heures et nous vous écrivons quand il a été livré.',
  closed_h='Le fax arrive bientôt', closed_p='Nous préparons le service de fax. D’ici là, nous pouvons <a href="/send">imprimer et poster votre document</a> partout au Canada.',
  l_to='Numéro de fax', h_to='Un numéro canadien ou américain avec l’indicatif régional, comme 514-555-0123.', l_doc='Document', h_doc='PDF, JPG ou PNG, jusqu’à 20 Mo.',
  l_name='Votre nom', l_email='Votre courriel', h_email='Pour votre reçu et la confirmation de livraison. Jamais partagé ni vendu.',
  l_note='Note pour la page couverture (facultatif)', h_note='Si vous écrivez une note, nous ajoutons une page couverture avec votre nom, la date et la note. Elle compte comme une page.',
  b_quote='Voir le prix', b_pay='Payer et envoyer', pay_note='Paiement par Stripe.',
  how_h='Comment ça fonctionne', steps=[('Téléversez et payez', 'Ajoutez votre document et le numéro de fax, voyez le prix exact et payez par carte.'),
    ('Nous l’envoyons', 'Habituellement en quelques heures. Si la ligne est occupée ou ne répond pas, nous réessayons deux fois. S’il ne passe toujours pas, nous vous écrivons pour la suite.'),
    ('Vous recevez une confirmation', 'Nous vous écrivons quand le télécopieur a reçu toutes les pages, avec l’heure de livraison.')],
  price_h='Prix', price_p='{base} pour un maximum de {incl} pages, page couverture comprise si vous en ajoutez une, et {page} par page supplémentaire. Un fax peut compter jusqu’à 50 pages. Le prix exact est affiché avant de payer.',
  can_h='Ce que nous pouvons envoyer', can=['Des fax vers des numéros canadiens et américains. Les numéros sans frais ne sont pas acceptés.', 'Des fichiers PDF, JPG et PNG. Un PDF protégé par mot de passe doit d’abord être enregistré sans son mot de passe.'],
  doc_h='Votre document', doc_p='Votre fichier est conservé de façon privée, n’est montré à personne en dehors de Letterhome sauf au service de fax qui l’envoie, et il est supprimé 24 heures après la fin de l’envoi.',
  faq_h='Questions fréquentes', faq=[('Combien de temps faut-il?', 'Les fax partent habituellement en quelques heures. L’envoi lui-même prend quelques minutes, selon le nombre de pages.'),
    ('Comment savoir s’il est arrivé?', 'Nous vous écrivons dès que le télécopieur a accepté toutes les pages, avec la date et l’heure. Conservez ce courriel comme preuve.'),
    ('Et si le fax ne passe pas?', 'Si la ligne est occupée ou ne répond pas, nous réessayons deux fois. S’il échoue encore, nous vous écrivons pour la suite.'),
    ('Puis-je envoyer un fax à un bureau du gouvernement?', 'Oui, à n’importe quel numéro canadien ou américain. Vérifiez le numéro de fax actuel sur le site du bureau avant d’envoyer.')],
  js=dict(sep=' : ', choose='Choisissez un fichier PDF, JPG ou PNG.', big='Le fichier dépasse 20 Mo.', preparing='Préparation…', again='Un problème est survenu. Réessayez.',
    upfail='Le téléversement n’a pas fonctionné. Réessayez.', faxto='Fax au ', page=' page', pages=' pages', cover=', page couverture comprise', total='. Total : ',
    pay='Payer {amt} et envoyer', payfail='Le paiement n’a pas pu commencer.', payfail2='Le paiement n’a pas pu commencer. Réessayez.'),
  rail_t='Nous l’envoyons pour vous', rail_p='Nous envoyons votre fax à n’importe quel numéro canadien ou américain et vous écrivons quand il a été livré.', rail_btn='Envoyer un fax', rail_meta='Paiement sécurisé par Stripe.',
  title='Envoyer un fax en ligne au Canada ou aux États-Unis | Letterhome',
  desc='Envoyez un fax en ligne vers n’importe quel numéro canadien ou américain, sans télécopieur. Téléversez un PDF ou une photo, 3 $ pour 10 pages, avec une confirmation par courriel.')

ES = dict(lang='es', site='us', cur='USD', base='$2.50', page='$0.25', money="'$'+(c/100).toFixed(2)",
  eyebrow='Fax', h1='Envíe un fax a EE. UU. o Canadá',
  sub='Suba un PDF o una foto de su documento, escriba el número de fax y nosotros lo enviamos por usted. No necesita máquina de fax.',
  answer='Un fax a cualquier número de EE. UU. o Canadá cuesta {base} por hasta {incl} páginas, más {page} por cada página adicional. Normalmente lo enviamos en unas horas y le escribimos cuando se entrega.',
  closed_h='El fax llega pronto', closed_p='Estamos preparando el servicio de fax. Mientras tanto, podemos <a href="/send?to=US">imprimir y enviar su documento por correo</a> a cualquier parte de EE. UU.',
  l_to='Número de fax', h_to='Un número de EE. UU. o Canadá con su código de área, como 212-555-0123.', l_doc='Documento', h_doc='PDF, JPG o PNG, hasta 20 MB.',
  l_name='Su nombre', l_email='Su correo electrónico', h_email='Para su recibo y la confirmación de entrega. Nunca se comparte ni se vende.',
  l_note='Nota para la portada (opcional)', h_note='Si escribe una nota, agregamos una portada con su nombre, la fecha y la nota. Cuenta como una página.',
  b_quote='Ver el precio', b_pay='Pagar y enviar', pay_note='Pago con Stripe.',
  how_h='Cómo funciona', steps=[('Suba el documento y pague', 'Agregue su documento y el número de fax, vea el precio exacto y pague con tarjeta.'),
    ('Lo enviamos', 'Normalmente en unas horas. Si la línea está ocupada o no contesta, lo intentamos dos veces más. Si aun así no pasa, le escribimos sobre los siguientes pasos.'),
    ('Recibe una confirmación', 'Le escribimos cuando la máquina de fax recibe todas las páginas, con la hora de entrega.')],
  price_h='Precio', price_p='{base} USD por hasta {incl} páginas, incluida la portada si agrega una, y {page} por cada página adicional. Un fax puede tener hasta 50 páginas. El precio exacto aparece antes de pagar.',
  can_h='Qué podemos enviar', can=['Faxes a números de EE. UU. y Canadá. No se aceptan números gratuitos (800).', 'Archivos PDF, JPG y PNG. Un PDF con contraseña debe guardarse primero sin la contraseña.'],
  doc_h='Su documento', doc_p='Su archivo se guarda en privado, nadie fuera de Letterhome lo ve salvo el servicio de fax que lo envía, y se borra 24 horas después de terminar el envío.',
  faq_h='Preguntas frecuentes', faq=[('¿Cuánto tarda?', 'Los fax suelen salir en unas horas. El envío en sí tarda unos minutos, según el número de páginas.'),
    ('¿Cómo sé que llegó?', 'Le escribimos cuando la máquina de fax acepta todas las páginas, con la fecha y la hora. Guarde ese correo como comprobante.'),
    ('¿Y si el fax no pasa?', 'Si la línea está ocupada o no contesta, lo intentamos dos veces más. Si aun así falla, le escribimos sobre los siguientes pasos.'),
    ('¿Puedo enviar un fax a una oficina del gobierno?', 'Sí, a cualquier número de EE. UU. o Canadá. Verifique el número de fax actual en el sitio de la oficina antes de enviarlo.')],
  js=dict(sep=': ', choose='Elija un archivo PDF, JPG o PNG.', big='El archivo pesa más de 20 MB.', preparing='Preparando…', again='Algo salió mal. Inténtelo de nuevo.',
    upfail='No se pudo subir el archivo. Inténtelo de nuevo.', faxto='Fax al ', page=' página', pages=' páginas', cover=', incluida la portada', total='. Total: ',
    pay='Pagar {amt} y enviar', payfail='No se pudo iniciar el pago.', payfail2='No se pudo iniciar el pago. Inténtelo de nuevo.'),
  rail_t='Lo enviamos por usted', rail_p='Enviamos su fax a cualquier número de EE. UU. o Canadá y le escribimos cuando se entrega.', rail_btn='Enviar un fax', rail_meta='Pago seguro con Stripe.',
  title='Enviar un fax en línea a EE. UU. o Canadá | Letterhome',
  desc='Envíe un fax en línea a cualquier número de EE. UU. o Canadá sin máquina de fax. Suba un PDF o una foto, $2.50 por hasta 10 páginas, con confirmación por correo.')

def order_page(t):
    e = html.escape
    span = lambda k, v: f'<span data-fx="{k}">{v}</span>'
    fill = lambda s: s.format(base=span('base', t['base']), page=span('page', t['page']), incl=span('incl', '10'), cur=t['cur'])
    steps = ''.join(f'<li><div><strong>{e(a)}</strong><p>{e(b)}</p></div></li>' for a, b in t['steps'])
    faq = ''.join(f'<div class="faq-item"><p class="faq-q">{e(q)}</p><p class="faq-a">{e(a)}</p></div>' for q, a in t['faq'])
    js = json.dumps(t['js'], ensure_ascii=False)
    hidden = (f'\n    <input type="hidden" name="site" value="{t["site"]}">' if t['site'] == 'us' else '') + f'\n    <input type="hidden" name="lang" value="{t["lang"]}">'
    return f'''<div class="hero" id="main-content">
  <p class="hero-eyebrow">{e(t['eyebrow'])}</p>
  <h1>{e(t['h1'])}</h1>
  <p class="hero-sub">{e(t['sub'])}</p>
  <div class="answer-box">
    <p>{fill(e(t['answer']))}</p>
  </div>
</div>

<div class="main">
  <div class="fx-closed" id="fx-closed"><div class="fx-card"><h2 style="margin-top:0">{e(t['closed_h'])}</h2><p>{t['closed_p']}</p></div></div>
  <form class="fx-card" id="fx-form" novalidate>{hidden}
    <div class="fx-field"><label for="fx-to">{e(t['l_to'])}</label><span class="hint">{e(t['h_to'])}</span><input id="fx-to" name="to" type="tel" autocomplete="off" inputmode="tel" required></div>
    <div class="fx-field"><label for="fx-doc">{e(t['l_doc'])}</label><span class="hint">{e(t['h_doc'])}</span><input id="fx-doc" name="document" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required></div>
    <div class="fx-field"><label for="fx-name">{e(t['l_name'])}</label><input id="fx-name" name="sender_name" type="text" autocomplete="name" maxlength="100" required></div>
    <div class="fx-field"><label for="fx-email">{e(t['l_email'])}</label><span class="hint">{e(t['h_email'])}</span><input id="fx-email" name="email" type="email" autocomplete="email" maxlength="200" required></div>
    <div class="fx-field"><label for="fx-note">{e(t['l_note'])}</label><span class="hint">{e(t['h_note'])}</span><textarea id="fx-note" name="cover_note" maxlength="2000"></textarea></div>
    <button class="fx-btn" id="fx-quote-btn" type="submit">{e(t['b_quote'])}</button>
    <p class="fx-err" id="fx-err" role="alert"></p>
    <div class="fx-quote" id="fx-quote" aria-live="polite">
      <p id="fx-quote-text"></p>
      <button class="fx-btn" id="fx-pay" type="button">{e(t['b_pay'])}</button>
      <p class="hint" style="font-size:13px;margin-top:10px">{e(t['pay_note'])}</p>
    </div>
  </form>

  <h2>{e(t['how_h'])}</h2>
  <ol class="steps">{steps}</ol>

  <h2>{e(t['price_h'])}</h2>
  <p>{fill(e(t['price_p']))}</p>

  <h2>{e(t['can_h'])}</h2>
  <ul>{''.join(f'<li>{e(x)}</li>' for x in t['can'])}</ul>

  <h2>{e(t['doc_h'])}</h2>
  <p>{e(t['doc_p'])}</p>

  <div class="faq"><h2>{e(t['faq_h'])}</h2>{faq}</div>
</div>
<script>
(function(){{
  var T={js}, site='{t['site']}', lang='{t['lang']}';
  var form=document.getElementById('fx-form'),err=document.getElementById('fx-err'),qb=document.getElementById('fx-quote-btn'),pay=document.getElementById('fx-pay'),ref=null;
  function money(c){{return {t['money']}}}
  fetch('/api/fax/config?site='+site).then(function(r){{return r.json()}}).then(function(c){{
    var set=function(k,v){{document.querySelectorAll('[data-fx="'+k+'"]').forEach(function(e){{e.textContent=v}})}};
    set('base',money(c.price_cents)); set('page',money(c.page_cents)); set('incl',String(c.included_pages));
    if(!c.open){{form.style.display='none';document.getElementById('fx-closed').style.display='block';}} }}).catch(function(){{}});
  form.addEventListener('submit',function(e){{
    e.preventDefault(); err.textContent=''; document.getElementById('fx-quote').style.display='none';
    var f=document.getElementById('fx-doc').files[0];
    if(!f){{err.textContent=T.choose;return}}
    if(f.size>20*1024*1024){{err.textContent=T.big;return}}
    var fd=new FormData(form); qb.disabled=true; var label=qb.textContent; qb.textContent=T.preparing;
    fetch('/api/fax/quote?lang='+lang,{{method:'POST',body:fd}}).then(function(r){{return r.json().then(function(j){{return {{ok:r.ok,j:j}}}})}}).then(function(x){{
      qb.disabled=false; qb.textContent=label;
      if(!x.ok){{err.textContent=x.j.error||T.again;return}}
      ref=x.j.ref;
      document.getElementById('fx-quote-text').textContent=T.faxto+x.j.to+T.sep+x.j.pages+(x.j.pages===1?T.page:T.pages)+(x.j.cover?T.cover:'')+T.total+money(x.j.price_cents)+' '+x.j.currency+'.';
      pay.textContent=T.pay.replace('{{amt}}',money(x.j.price_cents));
      document.getElementById('fx-quote').style.display='block';
    }}).catch(function(){{qb.disabled=false;qb.textContent=label;err.textContent=T.upfail}});
  }});
  ['fx-to','fx-doc','fx-name','fx-email','fx-note'].forEach(function(id){{document.getElementById(id).addEventListener('change',function(){{ref=null;document.getElementById('fx-quote').style.display='none'}})}});
  pay.addEventListener('click',function(){{
    if(!ref)return; pay.disabled=true; err.textContent='';
    fetch('/api/fax/checkout',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{ref:ref,lang:lang}})}}).then(function(r){{return r.json().then(function(j){{return {{ok:r.ok,j:j}}}})}}).then(function(x){{
      if(x.ok&&x.j.url){{location.href=x.j.url;return}}
      pay.disabled=false; err.textContent=x.j.error||T.payfail;
    }}).catch(function(){{pay.disabled=false;err.textContent=T.payfail2}});
  }});
}})();
</script>'''

STATUS = '''<div class="hero" id="main-content">
  <p class="hero-eyebrow">Fax</p>
  <h1 id="fx-h1">Your fax</h1>
  <p class="hero-sub" id="fx-lead">Loading…</p>
</div>
<div class="main">
  <div class="fx-card"><dl class="fx-status" id="fx-status" style="margin:0"></dl></div>
  <p id="fx-help">Questions about your fax? Use the <a href="/contact">contact form</a> and include your order number.</p>
</div>
<script>
(function(){
  var L={
    en:{h1:'Your fax',order:'Order',number:'Fax number',pages:'Pages',price:'Price',status:'Status',confirming:'We are confirming your payment. This page updates by itself.',missing:'We could not find this fax. Check the link in your email.',help:'Questions about your fax? Use the <a href="/contact">contact form</a> and include your order number.'},
    fr:{h1:'Votre fax',order:'Commande',number:'Numéro de fax',pages:'Pages',price:'Prix',status:'État',confirming:'Nous confirmons votre paiement. Cette page se met à jour toute seule.',missing:'Nous n’avons pas trouvé ce fax. Vérifiez le lien dans votre courriel.',help:'Des questions sur votre fax? Utilisez le <a href="/contact">formulaire de contact</a> en indiquant votre numéro de commande.'},
    es:{h1:'Su fax',order:'Pedido',number:'Número de fax',pages:'Páginas',price:'Precio',status:'Estado',confirming:'Estamos confirmando su pago. Esta página se actualiza sola.',missing:'No encontramos este fax. Revise el enlace de su correo.',help:'¿Preguntas sobre su fax? Use el <a href="/contact">formulario de contacto</a> e incluya su número de pedido.'}
  };
  var token=location.pathname.split('/').pop(), timer=null;
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function load(){
    fetch('/api/fax/status/'+encodeURIComponent(token),{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){
      var lead=document.getElementById('fx-lead');
      if(!d){lead.textContent=L.en.missing;return}
      var t=L[d.lang]||L.en;
      document.documentElement.lang=d.lang==='fr'?'fr-CA':d.lang==='es'?'es-US':'en-CA';
      document.getElementById('fx-h1').textContent=t.h1; document.getElementById('fx-help').innerHTML=t.help;
      lead.textContent=d.status==='awaiting_payment'?t.confirming:d.status_text;
      document.getElementById('fx-status').innerHTML='<dt>'+t.order+'</dt><dd>'+esc(d.ref)+'</dd><dt>'+t.number+'</dt><dd>'+esc(d.to)+'</dd><dt>'+t.pages+'</dt><dd>'+esc(d.pages)+'</dd><dt>'+t.price+'</dt><dd>'+esc(d.price)+'</dd><dt>'+t.status+'</dt><dd>'+esc(d.status_label)+'</dd>';
      clearTimeout(timer);
      if(['delivered','refunded','cancelled','failed'].indexOf(d.status)<0) timer=setTimeout(load,15000);
    }).catch(function(){timer=setTimeout(load,15000)});
  }
  load();
})();
</script>'''

if __name__ == '__main__':
    pages = [
        ('public/fax.html', EN, CA_SHELL, f'{BASE}/fax', f'lang="en-CA" data-theme="light" {rail(EN)}'),
        ('public/envoyer-un-fax-en-ligne.html', FR, CA_SHELL, f'{BASE}/envoyer-un-fax-en-ligne', f'lang="fr-CA" data-theme="light" {rail(FR)}'),
        ('public/us-fax.html', US, US_SHELL, f'{BASE}/us/fax', f'data-en-only lang="en-US" data-country="us" data-alt="/us/es/fax" data-alt-label="ES" data-theme="light" {rail(US)}'),
        ('public/fax-es.html', ES, ES_SHELL, f'{BASE}/us/es/fax', f'data-en-only lang="es-US" data-country="us" data-alt="/us/fax" data-alt-label="EN" data-theme="light" {rail(ES)}'),
    ]
    # The order pages use the letter page's own layout and styles (public/send.html), in three steps.
    send_css = fax_order_template.send_styles()
    for out, t, sh, url, attrs in pages:
        body = fax_order_template.order_page(t, UI[t['lang']])
        open(out, 'w', encoding='utf-8').write(page(t['title'], t['desc'], url, body, sh, attrs, alternates=ALT_LINKS, extra_head=send_css,
                                              share_image=f'{BASE}/og-fax.jpg' if out == 'public/fax.html' else ''))
        print('wrote', out)
    open('public/fax-status.html', 'w', encoding='utf-8').write(page('Your Fax | Letterhome', 'The status of your Letterhome fax.', f'{BASE}/fax', STATUS, CA_SHELL,
        f'data-en-only lang="en-CA" data-theme="light" {rail(EN)}', noindex=True))
    print('wrote public/fax-status.html')
