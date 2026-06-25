#!/usr/bin/env python3
"""
Add data-i18n attributes to from-country blog pages and extract EN text.
Outputs a JSON file with all extracted EN keys for translation.
"""

import os
import re
import json
from pathlib import Path

PUBLIC = Path('/Users/user/Documents/projects/letterhome/public')
OUTPUT = Path('/tmp/letterhome-en-keys.json')

FRENCH_PAGES = {
    'combien-coute-envoyer-une-lettre-au-canada',
    'comment-envoyer-une-lettre-au-canada',
    'envoyer-documents-ircc-depuis-etranger',
    'format-adresse-canadienne',
}

def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s).strip()

def add_attr(tag_html, attr_name, attr_value):
    """Insert data-i18n attribute into an opening tag."""
    # Find the closing > of the tag
    m = re.match(r'(<\w[^>]*?)(\s*/?>)', tag_html, re.DOTALL)
    if m:
        return m.group(1) + f' {attr_name}="{attr_value}"' + m.group(2)
    return tag_html

def process_from_page(slug, content):
    """Process a from-country page, returning (modified_content, keys_dict)."""
    keys = {}
    modified = content

    # ── eyebrow ──────────────────────────────────────────────────────────────
    def replace_eyebrow(m):
        text = m.group(1).strip()
        key = f'from.{slug}.eyebrow'
        keys[key] = text
        return f'<div class="eyebrow" data-i18n="{key}">{text}</div>'
    modified = re.sub(r'<div class="eyebrow">(.*?)</div>', replace_eyebrow, modified, count=1, flags=re.DOTALL)

    # ── h1 ───────────────────────────────────────────────────────────────────
    def replace_h1(m):
        text = m.group(1).strip()
        key = f'from.{slug}.h1'
        keys[key] = text
        return f'<h1 data-i18n="{key}">{text}</h1>'
    modified = re.sub(r'<h1>(.*?)</h1>', replace_h1, modified, count=1, flags=re.DOTALL)

    # ── lede ─────────────────────────────────────────────────────────────────
    def replace_lede(m):
        text = m.group(1).strip()
        key = f'from.{slug}.lede'
        keys[key] = text
        return f'<p class="lede" data-i18n="{key}">{text}</p>'
    modified = re.sub(r'<p class="lede">(.*?)</p>', replace_lede, modified, count=1, flags=re.DOTALL)

    # ── price-note ───────────────────────────────────────────────────────────
    modified = re.sub(
        r'<span class="price-note">(.*?)</span>',
        '<span class="price-note" data-i18n="from.shared.price.note">\\1</span>',
        modified, count=1, flags=re.DOTALL
    )

    # ── who h2 (first h2 in the page) ────────────────────────────────────────
    h2_count = [0]
    faq_count = [0]

    def replace_h2(m):
        text = m.group(1).strip()
        h2_count[0] += 1
        # Identify by content
        if re.search(r'who uses letterhome', text, re.IGNORECASE):
            key = f'from.{slug}.who.h2'
            keys[key] = text
        elif re.search(r'^pricing$', text, re.IGNORECASE):
            key = 'from.shared.pricing.h2'
        elif re.search(r'frequently asked', text, re.IGNORECASE):
            key = 'from.shared.faq.h2'
        elif re.search(r'related guides', text, re.IGNORECASE):
            key = 'from.shared.guides.h2'
        elif re.search(r'ready to send', text, re.IGNORECASE):
            key = 'from.shared.cta.heading'
        elif re.search(r'postage|mail.*\d{4}|send.*\d{4}|\d{4}.*mail', text, re.IGNORECASE):
            key = f'from.{slug}.postage.h2'
            keys[key] = text
        else:
            # Generic fallback
            key = f'from.{slug}.h2.{h2_count[0]}'
            keys[key] = text
        return f'<h2 data-i18n="{key}">{text}</h2>'

    modified = re.sub(r'<h2>(.*?)</h2>', replace_h2, modified, flags=re.DOTALL)

    # ── who-list li ──────────────────────────────────────────────────────────
    who_li_count = [0]
    in_who_list = [False]

    def replace_who_li(m):
        text = m.group(1).strip()
        who_li_count[0] += 1
        key = f'from.{slug}.who.li{who_li_count[0]}'
        keys[key] = text
        return f'<li data-i18n="{key}">{text}</li>'

    # Find the who-list and replace its li elements
    def replace_who_list(m):
        inner = m.group(1)
        new_inner = re.sub(r'<li>(.*?)</li>', replace_who_li, inner, flags=re.DOTALL)
        return f'<ul class="who-list">{new_inner}</ul>'

    modified = re.sub(r'<ul class="who-list">(.*?)</ul>', replace_who_list, modified, count=1, flags=re.DOTALL)

    # ── pricing cards (shared keys) ───────────────────────────────────────────
    modified = re.sub(
        r'<div class="price-label">(Domestic)</div>',
        '<div class="price-label" data-i18n="from.shared.pricing.domestic.label">\\1</div>',
        modified
    )
    modified = re.sub(
        r'<div class="price-label">(International)</div>',
        '<div class="price-label" data-i18n="from.shared.pricing.intl.label">\\1</div>',
        modified
    )
    # price-desc (two cards)
    price_desc_count = [0]
    def replace_price_desc(m):
        price_desc_count[0] += 1
        text = m.group(1).strip()
        if price_desc_count[0] == 1:
            key = 'from.shared.pricing.domestic.desc'
        else:
            key = 'from.shared.pricing.intl.desc'
        return f'<div class="price-desc" data-i18n="{key}">{text}</div>'
    modified = re.sub(r'<div class="price-desc">(.*?)</div>', replace_price_desc, modified, count=2, flags=re.DOTALL)

    # ── FAQ questions: wrap text in <span data-i18n="..."> before SVG ─────────
    faq_q_idx = [0]
    def replace_faq_q(m):
        button_open = m.group(1)
        inner = m.group(2)
        button_close = m.group(3)
        # Split at the SVG
        svg_match = re.search(r'<svg', inner)
        if svg_match:
            question_text = inner[:svg_match.start()].strip()
            svg_part = inner[svg_match.start():]
        else:
            question_text = inner.strip()
            svg_part = ''
        key = f'from.{slug}.faq.q{faq_q_idx[0]}'
        keys[key] = strip_tags(question_text)
        faq_q_idx[0] += 1
        new_inner = f'\n            <span data-i18n="{key}">{strip_tags(question_text)}</span>\n            {svg_part}\n          '
        return button_open + new_inner + button_close

    modified = re.sub(
        r'(<button class="faq-q"[^>]*>)(.*?)(<\/button>)',
        replace_faq_q,
        modified,
        flags=re.DOTALL
    )

    # ── FAQ answers ───────────────────────────────────────────────────────────
    faq_a_idx = [0]
    def replace_faq_a(m):
        attrs = m.group(1)
        text = m.group(2).strip()
        key = f'from.{slug}.faq.a{faq_a_idx[0]}'
        faq_a_idx[0] += 1
        keys[key] = text
        return f'<div class="faq-a"{attrs} data-i18n="{key}">{text}</div>'

    modified = re.sub(
        r'<div class="faq-a"([^>]*)>(.*?)</div>',
        replace_faq_a,
        modified,
        flags=re.DOTALL
    )

    # ── postage paragraphs (font-size:16px paragraphs after postage h2) ───────
    postage_p_count = [0]
    def replace_postage_p(m):
        style = m.group(1)
        text = m.group(2).strip()
        postage_p_count[0] += 1
        key = f'from.{slug}.postage.p{postage_p_count[0]}'
        keys[key] = text
        return f'<p style="{style}" data-i18n-html="{key}">{text}</p>'

    modified = re.sub(
        r'<p style="(font-size:16px[^"]*)">(.*?)</p>',
        replace_postage_p,
        modified,
        flags=re.DOTALL
    )

    # ── CTA band ──────────────────────────────────────────────────────────────
    def replace_cta_band(m):
        band = m.group(0)
        # CTA heading already handled by h2 replacer above
        # CTA body p
        band = re.sub(
            r'(<p>)(.*?)(</p>)',
            lambda mm: f'<p data-i18n="from.shared.cta.body">{mm.group(2)}</p>',
            band, count=1, flags=re.DOTALL
        )
        # CTA button
        def replace_cta_btn(bm):
            text = bm.group(2).strip()
            key = f'from.{slug}.cta.btn'
            keys[key] = text
            return f'{bm.group(1)} data-i18n="{key}">{text}</a>'
        band = re.sub(
            r'(<a href="/send"[^>]*>)(.*?)(</a>)',
            replace_cta_btn,
            band, count=1, flags=re.DOTALL
        )
        return band

    modified = re.sub(r'<div class="cta-band">.*?</div>\s*\n\s*</div>', replace_cta_band, modified, flags=re.DOTALL)

    return modified, keys


def main():
    all_en_keys = {
        # Shared keys with hardcoded values
        'from.shared.pricing.h2': 'Pricing',
        'from.shared.pricing.domestic.amount': '$10 CAD',
        'from.shared.pricing.domestic.label': 'Domestic',
        'from.shared.pricing.domestic.desc': 'Letters to any Canadian address. Includes up to 5 documents, full-colour printing, envelope, and Canadian postage.',
        'from.shared.pricing.intl.amount': '$20 CAD',
        'from.shared.pricing.intl.label': 'International',
        'from.shared.pricing.intl.desc': 'Letters to any of 160+ countries. Same inclusions — full-colour printing, envelope, Canadian postage via Canada Post.',
        'from.shared.faq.h2': 'Frequently asked questions',
        'from.shared.guides.h2': 'Related guides',
        'from.shared.cta.heading': 'Ready to send?',
        'from.shared.cta.body': 'Fill out the form, attach your documents, and we handle everything else.',
        'from.shared.price.note': 'From $10 CAD ·  No account required',
    }

    processed = []

    for html_file in sorted(PUBLIC.glob('from-*.html')):
        slug_full = html_file.stem  # e.g. from-usa
        if slug_full in FRENCH_PAGES:
            print(f'  SKIP (French page): {html_file.name}')
            continue

        slug = slug_full[len('from-'):]  # e.g. usa

        content = html_file.read_text(encoding='utf-8')

        # Skip if already has data-i18n from our system
        if f'data-i18n="from.{slug}.h1"' in content:
            print(f'  SKIP (already done): {html_file.name}')
            continue

        modified, keys = process_from_page(slug, content)

        html_file.write_text(modified, encoding='utf-8')
        all_en_keys.update(keys)
        processed.append(slug)
        print(f'  OK: {html_file.name} ({len(keys)} keys)')

    OUTPUT.write_text(json.dumps(all_en_keys, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\nWrote {len(all_en_keys)} EN keys to {OUTPUT}')
    print(f'Processed {len(processed)} pages: {", ".join(processed)}')


if __name__ == '__main__':
    main()
