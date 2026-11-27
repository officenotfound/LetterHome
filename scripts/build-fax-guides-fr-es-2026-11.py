#!/usr/bin/env python3
"""French (letterhome.ca) and Spanish (letterhome.us) fax guides, 2026-11-27, each paired with its English twin by hreflang.
Run from the project root after build-fax-pages-2026-11.py:  python3 scripts/build-fax-guides-fr-es-2026-11.py

  public/comment-envoyer-un-fax-sans-telecopieur.html   twin of /send-a-fax-online-canada
  public/page-couverture-fax.html                       twin of /fax-cover-sheet
  public/como-enviar-un-fax-en-linea-es.html            /us/es/como-enviar-un-fax-en-linea, twin of /us/send-a-fax-online
  public/portada-de-fax-es.html                         /us/es/portada-de-fax, twin of /us/fax-cover-sheet

Service facts and prices match fax.js and the fax order pages ($3.00 CAD for up to 10 pages and $0.50 a page on .ca;
$2.50 USD and $0.25 a page on .us). Canadian French follows the site's conventions (courriel, téléverser, no space before
? ! ;); Spanish is Mexican Spanish in the usted form."""
import importlib.util, html, json

spec = importlib.util.spec_from_file_location('fp', 'scripts/build-fax-pages-2026-11.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
BASE = fp.BASE
e = html.escape

def alts(pairs, default):
    return ''.join(f'<link rel="alternate" hreflang="{k}" href="{BASE}{v}">\n' for k, v in pairs) + f'<link rel="alternate" hreflang="x-default" href="{BASE}{default}">\n'

def article(a):
    L = a['L']
    faq = ''.join(f'<div class="faq-item"><p class="faq-q">{e(q)}</p><p class="faq-a">{e(x)}</p></div>' for q, x in a['faq'])
    rel = ''.join(f'<a class="related-card" href="{h}"><strong>{e(t)}</strong><span>{e(d)}</span></a>' for h, t, d in a['related'])
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Article', 'headline': a['h1'].replace('<em>', '').replace('</em>', ''), 'description': a['desc'], 'inLanguage': a['lang'],
         'datePublished': '2026-11-27', 'dateModified': '2026-11-27', 'mainEntityOfPage': a['url'],
         'author': {'@type': 'Person', 'name': 'Jeffrey George', 'url': f'{BASE}/about'},
         'publisher': {'@type': 'Organization', 'name': 'Letterhome', 'url': BASE, 'logo': {'@type': 'ImageObject', 'url': f'{BASE}/apple-touch-icon.png'}}},
        {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': x}} for q, x in a['faq']]}]}
    content = f'''<script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=1)}
</script>
<div class="hero" id="main-content">
  <p class="hero-eyebrow">Fax</p>
  <h1>{a['h1']}</h1>
  <p class="hero-sub">{e(a['sub'])}</p>
  <a href="{a['cta_href']}" class="hero-cta">{e(L['btn'])} →</a>
  <div class="answer-box"><p>{e(a['answer'])}</p></div>
</div>

<div class="main">
<p style="font-size:13px;color:var(--ink-muted)">{L['updated']}</p>
{a['body'].strip()}

<div class="faq"><h2>{L['faq']}</h2>{faq}</div>
<div class="related"><h2>{L['related']}</h2><div class="related-grid">{rel}</div></div>
<div class="cta-block"><h2>{e(L['cta_h'])}</h2><p>{e(L['cta_p'])}</p><a href="{a['cta_href']}">{e(L['btn'])} →</a></div>
</div>'''
    return fp.page(a['title'], a['desc'], a['url'], content, a['shell'], a['attrs'], alternates=a['alts'])

LFR = dict(btn='Envoyer un fax', updated='Mis à jour en novembre 2026', faq='Questions fréquentes', related='Guides connexes',
           cta_h='Un fax à envoyer?', cta_p='Téléversez le document, entrez le numéro, et nous l’envoyons pour vous.')
LES = dict(btn='Enviar un fax', updated='Actualizado en noviembre de 2026', faq='Preguntas frecuentes', related='Guías relacionadas',
           cta_h='¿Tiene un fax que enviar?', cta_p='Suba el documento, escriba el número y nosotros lo enviamos.')
FR_ATTRS = f'lang="fr-CA" data-theme="light" {fp.rail(fp.FR)}'
ES_ATTRS = lambda en: f'data-en-only lang="es-US" data-country="us" data-alt="{en}" data-alt-label="EN" data-theme="light" {fp.rail(fp.ES)}'

FR_SERVICE = '''<h2>Le prix</h2>
<p>3 $ pour un maximum de 10 pages, page couverture comprise, et 0,50 $ par page supplémentaire, jusqu’à 50 pages. Le prix exact est affiché avant de payer. Les fax peuvent aller vers des numéros canadiens et américains; les numéros sans frais ne sont pas acceptés.</p>'''
ES_SERVICE = '''<h2>Enviarlo con Letterhome</h2>
<p>Suba un PDF, JPG o PNG, escriba el número de fax y pague: $2.50 por hasta 10 páginas y $0.25 por cada página adicional, hasta 50 páginas. Si la línea está ocupada o no contesta, lo intentamos dos veces más, y le escribimos cuando la máquina recibe todas las páginas. Los faxes van a números de EE. UU. y Canadá; no se aceptan números gratuitos (800). Su archivo se borra 24 horas después de terminar el envío.</p>'''

PAGES = [
dict(out='public/comment-envoyer-un-fax-sans-telecopieur.html', lang='fr-CA', L=LFR, shell=fp.CA_SHELL, attrs=FR_ATTRS, cta_href='/envoyer-un-fax-en-ligne',
  url=f'{BASE}/comment-envoyer-un-fax-sans-telecopieur',
  alts=alts([('en-CA', '/send-a-fax-online-canada'), ('fr-CA', '/comment-envoyer-un-fax-sans-telecopieur')], '/send-a-fax-online-canada'),
  title='Comment envoyer un fax sans télécopieur | Letterhome',
  desc='Envoyez un fax en ligne vers n’importe quel numéro canadien ou américain sans télécopieur : téléversez un PDF ou une photo, 3 $ pour 10 pages, confirmation par courriel.',
  h1='Comment envoyer un fax<br><em>sans télécopieur</em>',
  sub='Pas de télécopieur ni de ligne téléphonique. Téléversez le document et le numéro, et il est envoyé pour vous.',
  answer='Pour envoyer un fax sans télécopieur, téléversez votre document en PDF, JPG ou PNG sur un service de fax en ligne, entrez le numéro de fax avec l’indicatif régional et payez. Avec Letterhome, c’est 3 $ pour un maximum de 10 pages. Vous recevez un courriel avec l’heure de livraison quand le télécopieur a reçu toutes les pages.',
  body='''
<h2>Les étapes</h2>
<ol>
<li><strong>Préparez le document.</strong> Enregistrez-le en PDF ou prenez une photo claire de chaque page. La fonction de numérisation de votre téléphone fonctionne bien.</li>
<li><strong>Entrez le numéro de fax.</strong> Dix chiffres avec l’indicatif régional, pris sur le site ou la lettre du bureau.</li>
<li><strong>Ajoutez une note si vous voulez.</strong> Nous en faisons une page couverture avec votre nom, la date et le nombre de pages.</li>
<li><strong>Payez et attendez la confirmation.</strong> Nous vous écrivons quand le fax a été livré, avec la date et l’heure.</li>
</ol>

<h2>Qui demande encore un fax</h2>
<p>Bien des cliniques, pharmacies, assureurs et bureaux d’avocats, et certains programmes gouvernementaux, demandent encore des documents par fax. Si un formulaire vous demande de le faxer et que vous n’avez pas de télécopieur, un service en ligne est la façon la plus simple.</p>
''' + FR_SERVICE + '''
<h2>Si le fax ne passe pas</h2>
<p>Si la ligne est occupée ou ne répond pas, nous réessayons deux fois. S’il ne passe toujours pas, nous vous écrivons pour la suite. Vérifiez qu’il s’agit bien d’un numéro de fax : bien des bureaux affichent le téléphone et le fax côte à côte.</p>

<h2>Est-ce confidentiel?</h2>
<p>Votre fichier est conservé de façon privée et supprimé 24 heures après la fin de l’envoi. Un fax passe par le réseau téléphonique sans chiffrement; pour un document très sensible, assurez-vous que le bureau l’attend.</p>
''',
  faq=[('Combien coûte l’envoi d’un fax au Canada?', 'Avec Letterhome, 3 $ pour un maximum de 10 pages et 0,50 $ par page supplémentaire. Le prix est affiché avant de payer.'),
       ('Peut-on envoyer un fax sans télécopieur?', 'Oui. Téléversez le document en ligne et il est envoyé au numéro de fax pour vous, sans appareil ni ligne téléphonique.'),
       ('Comment savoir si mon fax est passé?', 'Nous vous écrivons dès que le télécopieur a reçu toutes les pages, avec la date et l’heure. Conservez ce courriel comme preuve.'),
       ('Puis-je envoyer un fax aux États-Unis?', 'Oui. Les numéros canadiens et américains fonctionnent, au même prix.'),
       ],
  related=[('/page-couverture-fax', 'Page couverture de fax', 'Quoi inclure, avec un modèle'), ('/envoyer-un-fax-en-ligne', 'Envoyer un fax en ligne', 'Téléversez, payez, et nous l’envoyons'),
           ('/quest-ce-que-la-poste-lettres', 'Qu’est-ce que le Poste-lettres?', 'Quand il faut l’envoyer sur papier')]),

dict(out='public/page-couverture-fax.html', lang='fr-CA', L=LFR, shell=fp.CA_SHELL, attrs=FR_ATTRS, cta_href='/envoyer-un-fax-en-ligne',
  url=f'{BASE}/page-couverture-fax',
  alts=alts([('en-CA', '/fax-cover-sheet'), ('fr-CA', '/page-couverture-fax')], '/fax-cover-sheet'),
  title='Page couverture de fax : quoi inclure (modèle gratuit) | Letterhome',
  desc='Quoi mettre sur une page couverture de fax : le destinataire, l’expéditeur, la date, le nombre de pages et une courte note. Un modèle simple à copier.',
  h1='Page couverture de fax :<br><em>quoi inclure</em>',
  sub='La première page d’un fax indique à la personne qui le reçoit à qui il est destiné et combien de pages attendre.',
  answer='Une page couverture de fax indique à qui le fax est destiné et son numéro de fax, qui l’envoie avec un numéro de téléphone ou un courriel, la date, le nombre total de pages, couverture comprise, et une courte note. Elle est surtout utile quand le fax arrive sur un appareil partagé, pour qu’il se rende à la bonne personne et qu’on voie s’il manque une page.',
  body='''
<h2>Un modèle à copier</h2>
<pre class="addr">FAX

À :        Nom, service
Fax :      514-555-0123
De :       Votre nom
Tél. :     Comment vous joindre
Date :     27 novembre 2026
Pages :    4, incluant cette page

Note : Vous trouverez ci-joint mon formulaire rempli,
pour le dossier 12345.</pre>

<h2>À quoi sert chaque ligne</h2>
<ul>
<li><strong>À et numéro de fax :</strong> pour que le fax se rende à la bonne personne sur un appareil partagé.</li>
<li><strong>De et téléphone ou courriel :</strong> pour qu’on puisse vous joindre si une page est illisible.</li>
<li><strong>Pages, couverture comprise :</strong> pour qu’on voie s’il manque quelque chose.</li>
<li><strong>Un numéro de référence :</strong> un numéro de dossier, de compte ou de réclamation, si le bureau vous en a donné un.</li>
</ul>

<h2>Est-elle obligatoire?</h2>
<p>Pas toujours, mais bien des bureaux s’y attendent, et elle aide tout fax qui arrive sur un appareil partagé.</p>

<h2>Nous pouvons l’ajouter pour vous</h2>
<p>Quand vous envoyez un fax avec Letterhome, choisissez Ajouter une page couverture et remplissez seulement ce que vous voulez y voir: le destinataire, votre nom, un numéro de fax pour la réponse ou une note. Nous ajoutons la date et le nombre de pages. Elle compte comme une de vos pages.</p>
''',
  faq=[('Que met-on sur une page couverture de fax?', 'Le destinataire et son numéro de fax, l’expéditeur et comment le joindre, la date, le nombre total de pages couverture comprise, et une courte note.'),
       ('La page couverture est-elle obligatoire?', 'Habituellement non, mais bien des bureaux s’y attendent.'),
       ('La page couverture compte-t-elle comme une page?', 'Oui. Incluez-la dans le nombre de pages que vous y inscrivez.')],
  related=[('/comment-envoyer-un-fax-sans-telecopieur', 'Envoyer un fax sans télécopieur', 'Les étapes et le prix'), ('/envoyer-un-fax-en-ligne', 'Envoyer un fax en ligne', 'Téléversez, payez, et nous l’envoyons'),
           ('/format-adresse-canadienne', 'Format d’adresse canadienne', 'Quand il faut l’envoyer par la poste')]),

dict(out='public/como-enviar-un-fax-en-linea-es.html', lang='es-US', L=LES, shell=fp.ES_SHELL, attrs=ES_ATTRS('/us/send-a-fax-online'), cta_href='/us/es/fax',
  url=f'{BASE}/us/es/como-enviar-un-fax-en-linea',
  alts=alts([('en-US', '/us/send-a-fax-online'), ('es-US', '/us/es/como-enviar-un-fax-en-linea')], '/us/send-a-fax-online'),
  title='Cómo enviar un fax en línea sin máquina de fax | Letterhome',
  desc='Envíe un fax en línea a cualquier número de EE. UU. o Canadá sin máquina de fax: suba un PDF o una foto, $2.50 por hasta 10 páginas y confirmación por correo.',
  h1='Cómo enviar un fax<br><em>en línea</em>',
  sub='Sin máquina de fax ni línea telefónica. Suba el documento y el número, y nosotros lo enviamos.',
  answer='Para enviar un fax en línea, suba su documento en PDF, JPG o PNG, escriba el número de fax con su código de área y pague. Con Letterhome cuesta $2.50 por hasta 10 páginas. Le escribimos con la hora de entrega cuando la máquina recibe todas las páginas.',
  body='''
<h2>Los pasos</h2>
<ol>
<li><strong>Prepare el documento.</strong> Guárdelo en PDF o tome una foto clara de cada página.</li>
<li><strong>Escriba el número de fax.</strong> Diez dígitos con el código de área, tomado del sitio o de la carta de la oficina.</li>
<li><strong>Agregue una nota si quiere.</strong> La convertimos en una portada con su nombre, la fecha y el número de páginas.</li>
<li><strong>Pague y espere la confirmación.</strong> Le escribimos cuando el fax se entrega, con la fecha y la hora.</li>
</ol>

<h2>Desde su celular</h2>
<p>En iPhone, las apps Notas y Archivos pueden escanear documentos y guardarlos en PDF. En Android, la app Google Drive tiene un botón para escanear. Después, abra la página de fax en el navegador del celular y suba el PDF.</p>

<h2>¿Quién pide todavía un fax?</h2>
<p>Consultorios médicos, farmacias, aseguradoras, despachos de abogados y algunas oficinas de gobierno todavía piden documentos por fax. Si un formulario dice que lo mande por fax y usted no tiene máquina, enviarlo en línea es lo más sencillo.</p>
''' + ES_SERVICE,
  faq=[('¿Cómo envío un fax sin máquina de fax?', 'Suba el documento a un servicio de fax en línea, escriba el número de fax y pague. Se envía a la máquina de fax por usted.'),
       ('¿Cuánto cuesta enviar un fax en línea?', 'Con Letterhome, $2.50 por hasta 10 páginas y $0.25 por cada página adicional. El precio aparece antes de pagar.'),
       ('¿Cómo sé que mi fax llegó?', 'Le escribimos cuando la máquina recibe todas las páginas, con la fecha y la hora.'),
       ('¿Puedo enviar un fax a Canadá?', 'Sí. Los números de EE. UU. y Canadá funcionan, al mismo precio.'),
       ('¿Puedo enviar un fax desde mi celular?', 'Sí. Escanee el documento con el celular y súbalo desde el navegador.')],
  related=[('/us/es/portada-de-fax', 'Portada de fax', 'Qué incluir, con plantilla'), ('/us/es/fax', 'Enviar un fax', 'Suba el documento, pague y lo enviamos'),
           ('/us/es/send-a-letter-online-in-the-usa', 'Enviar una carta por internet', 'Cuando tiene que ir en papel')]),

dict(out='public/portada-de-fax-es.html', lang='es-US', L=LES, shell=fp.ES_SHELL, attrs=ES_ATTRS('/us/fax-cover-sheet'), cta_href='/us/es/fax',
  url=f'{BASE}/us/es/portada-de-fax',
  alts=alts([('en-US', '/us/fax-cover-sheet'), ('es-US', '/us/es/portada-de-fax')], '/us/fax-cover-sheet'),
  title='Portada de fax: qué incluir (plantilla gratis) | Letterhome',
  desc='Qué poner en la portada de un fax: para quién es, de quién es, la fecha, el número de páginas y una nota breve. Una plantilla sencilla para copiar.',
  h1='Portada de fax:<br><em>qué incluir</em>',
  sub='La primera página de un fax le dice a quien lo recibe para quién es y cuántas páginas esperar.',
  answer='La portada de un fax indica para quién es y su número de fax, quién lo envía con un teléfono o correo, la fecha, el total de páginas incluida la portada, y una nota breve. Es más útil cuando el fax llega a una máquina compartida, para que llegue a la persona correcta y se note si falta una página.',
  body='''
<h2>Una plantilla para copiar</h2>
<pre class="addr">FAX

Para:      Nombre, departamento
Fax:       (212) 555-0123
De:        Su nombre
Teléfono:  Cómo contactarle
Fecha:     27 de noviembre de 2026
Páginas:   4 (incluida esta página)

Nota: Le envío adjunto mi formulario de reclamo,
número de reclamo 12345.</pre>

<h2>Para qué sirve cada línea</h2>
<ul>
<li><strong>Para y número de fax:</strong> para que llegue a la persona correcta en una máquina compartida.</li>
<li><strong>De y teléfono o correo:</strong> para que puedan contactarle si una página no se lee.</li>
<li><strong>Páginas, incluida la portada:</strong> para que noten si falta algo.</li>
<li><strong>Un número de referencia:</strong> de reclamo, cuenta o expediente, si la oficina le dio uno.</li>
</ul>

<h2>¿Es obligatoria?</h2>
<p>No siempre, pero muchas oficinas la esperan, y ayuda a cualquier fax que llega a una máquina compartida.</p>

<h2>Podemos agregarla por usted</h2>
<p>Cuando envía un fax con Letterhome, elija Agregar una portada y llene solo lo que quiera que aparezca: para quién es, su nombre, un número de fax para la respuesta o una nota. Nosotros agregamos la fecha y el número de páginas. Cuenta como una de sus páginas.</p>
''',
  faq=[('¿Qué lleva la portada de un fax?', 'Para quién es y su número de fax, quién lo envía y cómo contactarle, la fecha, el total de páginas incluida la portada, y una nota breve.'),
       ('¿La portada de fax es obligatoria?', 'Normalmente no, pero muchas oficinas la esperan.'),
       ('¿La portada cuenta como página?', 'Sí. Inclúyala en el número de páginas que escribe en ella.')],
  related=[('/us/es/como-enviar-un-fax-en-linea', 'Cómo enviar un fax en línea', 'Los pasos y el precio'), ('/us/es/fax', 'Enviar un fax', 'Suba el documento, pague y lo enviamos'),
           ('/us/es', 'Letterhome en español', 'Cartas por internet en EE. UU.')]),
]

if __name__ == '__main__':
    for a in PAGES:
        open(a['out'], 'w', encoding='utf-8').write(article(a)); print('wrote', a['out'])
