#!/usr/bin/env python3
"""Builds the November 2026 use-case guides: Canadian pages (public/<slug>.html), US pages (public/us-<slug>.html)
and Spanish pages for the US site (public/<slug>-es.html, served at /us/es/<slug>).
Run from the project root:  python3 scripts/build-guides-2026-11.py
It only writes the pages listed here. Facts were checked on 2026-11-17 against the sources named on each page, so
re-check dates and rules before changing them. Sitemap, route list and hub links are edited by hand, not by this script."""
import html, json, re, sys, importlib.util, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
BASE = 'https://letterhome.ca'
TODAY = '2026-11-17'

def esc(s): return html.escape(s, quote=True)
def strip(s): return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', s)).strip()
def jesc(s): return s.replace('\\', '\\\\').replace('"', '\\"')

# Shared parts of the live pages, so new pages always carry the current asset versions.
LIVE = open('public/registered-mail-vs-xpresspost.html', encoding='utf-8').read()
VER = {m.group(1): m.group(2) for m in re.finditer(r'((?:header|footer|lang|theme)\.js)\?v=(\d+)', LIVE)}

# ───────────────────────── Canadian pages (the house guide template) ─────────────────────────
spec = importlib.util.spec_from_file_location('gg', 'scripts/gen-guides.py')
gg = importlib.util.module_from_spec(spec); spec.loader.exec_module(gg)
gg.TODAY = TODAY

def build_ca(g):
    new = gg.build(g)
    ni = new.index('<body'); li = LIVE.index('<body')
    head, body = LIVE[:li], new[ni:]
    for p in [r'<title>.*?</title>', r'<meta name="description"[^>]*>', r'<link rel="canonical"[^>]*>', r'<meta property="og:title"[^>]*>',
              r'<meta property="og:description"[^>]*>', r'<meta property="og:url"[^>]*>', r'<meta name="twitter:title"[^>]*>', r'<meta name="twitter:description"[^>]*>']:
        a = re.search(p, head, re.S); b = re.search(p, new[:ni], re.S)
        if a and b: head = head.replace(a.group(0), b.group(0))
    jl = re.compile(r'<script type="application/ld\+json">.*?</script>', re.S)
    for a, b in zip(jl.findall(head), jl.findall(new[:ni])):
        b = b.replace('"price": "10"', '"price": "6"')
        b = re.sub(r'"dateModified": "[^"]*"', f'"dateModified": "{TODAY}"', b)
        head = head.replace(a, b)
    body = (body.replace('/header.js?v=6', f'/header.js?v={VER["header.js"]}').replace('/footer.js"', f'/footer.js?v={VER["footer.js"]}"')
                .replace('/theme.js?v=2" defer></script>', f'/theme.js?v={VER["theme.js"]}" defer></script>\n<script src="/lang.js?v={VER["lang.js"]}" defer></script>')
                .replace('$6 CAD', '$6'))
    return head + body

# ───────────────────────── US and Spanish pages (the local guide template) ─────────────────────────
TEMPLATE = {'us': 'public/how-to-send-mail-to-canada-from-us.html', 'es': 'public/como-enviar-una-carta-a-canada-desde-ee-uu-es.html'}
LANG = {'us': 'en-US', 'es': 'es-US'}
LOCALE = {'us': 'en_US', 'es': 'es_US'}
LABELS = {
    'us': dict(updated='Updated November 2026', sources='Sources', faq='Common questions', related='Related guides', cta_h='Got a letter to send?',
               cta_p='Type it online and we print and mail it for you.', cta='Send a letter →', home='Letterhome', url=lambda s: f'{BASE}/us/{s}', home_url=f'{BASE}/us'),
    'es': dict(updated='Actualizado en noviembre de 2026', sources='Fuentes', faq='Preguntas frecuentes', related='Guías relacionadas', cta_h='¿Tiene una carta que enviar?',
               cta_p='Escríbala en línea y nosotros la imprimimos y la enviamos.', cta='Enviar una carta →', home='Letterhome', url=lambda s: f'{BASE}/us/es/{s}', home_url=f'{BASE}/us/es'),
}
SEND = {'us': '/send?to=US', 'es': '/send'}

def build_local(p):
    c = p['c']; L = LABELS[c]
    tpl = open(TEMPLATE[c], encoding='utf-8').read()
    url = L['url'](p['slug'])
    styles = tpl[tpl.index('<link rel="stylesheet" href="/fonts.css'):tpl.index('</head>')]
    styles = re.sub(r'<link rel="alternate"[^>]*>', '', styles)
    body_open = tpl[tpl.index('<body'):tpl.index('<div class="hero" id="main-content">')]
    hero_tpl = tpl[tpl.index('<div class="hero" id="main-content">'):]
    stamp = re.search(r'<div class="stamp".*?</div>', hero_tpl, re.S)
    stamp = stamp.group(0) if stamp else ''
    tail = tpl[tpl.index('<footer id="site-footer">'):]
    h1t = strip(p['h1'].replace('<br>', ' '))
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Article', 'headline': h1t, 'description': p['desc'], 'datePublished': TODAY, 'dateModified': TODAY, 'inLanguage': LANG[c], 'mainEntityOfPage': url,
         'author': {'@type': 'Person', 'name': 'Jeffrey George', 'url': f'{BASE}/about'},
         'publisher': {'@type': 'Organization', 'name': 'Letterhome', 'url': BASE, 'logo': {'@type': 'ImageObject', 'url': f'{BASE}/apple-touch-icon.png'}}},
        {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': strip(a)}} for q, a in p['faq']]},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': L['home'], 'item': L['home_url']},
            {'@type': 'ListItem', 'position': 2, 'name': h1t, 'item': url}]}]}
    faq = ''.join(f'<div class="faq-item"><p class="faq-q">{esc(q)}</p><p class="faq-a">{a}</p></div>' for q, a in p['faq'])
    src = ''.join(f'<li><a href="{esc(u)}" target="_blank" rel="noopener">{esc(t)}</a></li>' for t, u in p['sources'])
    rel = ''.join(f'<a class="related-card" href="{h}"><strong>{esc(t)}</strong><span>{esc(d)}</span></a>' for h, t, d in p['related'])
    title = p['title'] + ' | Letterhome'
    htmltag = f'<html data-en-only lang="{LANG[c]}" data-country="us">'
    page = f'''<!DOCTYPE html>
{htmltag}
<head>
<meta charset="UTF-8">
<link rel="preload" as="font" type="font/woff2" href="/fonts/vEFI2_tTDB4M7-auWDN0ahZJW1gb8tc.woff2" crossorigin>
<link rel="dns-prefetch" href="https://www.googletagmanager.com">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="/ga.js?v=2" defer></script>
<script src="/cookie-consent.js?v=12" defer></script>
<title>{esc(title)}</title>
<meta name="description" content="{esc(p['desc'])}">
<link rel="canonical" href="{url}">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#faf8f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="{esc(p['title'])}">
<meta property="og:description" content="{esc(p['desc'])}">
<meta property="og:type" content="article">
<meta property="og:url" content="{url}">
<meta property="og:image" content="https://letterhome.ca/og-image.jpg?v=4">
<meta property="og:site_name" content="Letterhome">
<meta property="og:locale" content="{LOCALE[c]}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(p['title'])}">
<meta name="twitter:description" content="{esc(p['desc'])}">
<meta name="twitter:image" content="https://letterhome.ca/og-image.jpg?v=4">
<script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=1)}
</script>
{styles}</head>
{body_open}<div class="hero" id="main-content">
{stamp}<div class="letter">
  <p class="hero-eyebrow">{esc(p['eyebrow'])}</p>
  <h1>{p['h1']}</h1>
  <p class="hero-sub">{esc(p['sub'])}</p>
  <a href="{SEND[c]}" class="hero-cta">{L['cta']}</a>
  <div class="answer-box"><p>{esc(p['answer'])}</p></div>
</div></div>

<div class="main">
<p style="font-size:13px;color:var(--ink-muted)">{L['updated']}</p>
{p['body'].strip()}

<h2>{L['sources']}</h2>
<ul class="sources">{src}</ul>

<div class="faq"><h2>{L['faq']}</h2>{faq}</div>
<div class="related"><h2>{L['related']}</h2><div class="related-grid">{rel}</div></div>
<div class="cta-block"><h2>{L['cta_h']}</h2><p>{L['cta_p']}</p><a href="{SEND[c]}">{L['cta']}</a></div>
</div>

{tail}'''
    return page

sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from importlib import import_module
data = import_module('guides_2026_11_data')

if __name__ == '__main__':
    for g in data.CA:
        out = f"public/{g['slug']}.html"; open(out, 'w', encoding='utf-8').write(build_ca(g)); print('wrote', out)
    for p in data.LOCAL:
        out = f"public/us-{p['slug']}.html" if p['c'] == 'us' else f"public/{p['slug']}-es.html"
        open(out, 'w', encoding='utf-8').write(build_local(p)); print('wrote', out)
