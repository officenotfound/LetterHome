'use strict';
// Country domains: letterhome.us serves the US pages and letterhome.co.uk serves the UK pages, the way larger
// multinational sites do. letterhome.ca stays the main site (checkout, guides, admin, everything shared).
//
// For each country domain there is one switch in the admin Settings page (us_domain_live, uk_domain_live):
//   OFF  the domain only redirects (301) to the matching page on letterhome.ca. Safe to leave DNS pointing here.
//   ON   the domain is the real site for that country:
//          letterhome.us/                  → the US landing page   (internally /us)
//          letterhome.us/es, /es/...        → the Spanish US pages (internally /us/es...)
//          letterhome.us/<us guide>         → a US guide           (internally /us/<guide>)
//          everything else (send, track, terms…) is shared and served as-is on the same domain
//        and on letterhome.ca the old /us and /uk paths 301 to the country domain, so each page has one address.
// Canonical, og:url, hreflang and JSON-LD URLs in the country pages are rewritten to the country domain when they
// are served there; shared pages keep their letterhome.ca canonical, so nothing is indexed twice.
// Each domain also gets its own robots.txt and sitemap.xml, and the main sitemap drops the moved URLs.

const fs = require('node:fs');
const path = require('node:path');

const PRIMARY = 'letterhome.ca';
const SITES = [
  { key: 'us', host: 'letterhome.us',    prefix: '/us', setting: 'us_domain_live', roots: ['/es'], pages: ['/send-a-letter-online-in-the-usa'] },
  { key: 'uk', host: 'letterhome.co.uk', prefix: '/uk', setting: 'uk_domain_live', roots: [], pages: ['/address-a-letter-to-canada-from-the-uk'] },
];

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `pages` are guides written for that country's readers that live at a plain address (no /us or /uk in it); they move to the
// country domain with it, so the domain owns its audience's guides and letterhome.ca does not index a second copy.
const hasPage = (p, site) => (site.pages || []).includes(p.replace(/\/$/, ''));
const hasPrefix = (p, site) => p === site.prefix || p.startsWith(site.prefix + '/');
const stripPrefix = (p, site) => p === site.prefix ? '/' : p.slice(site.prefix.length);
const qs = req => { const i = req.originalUrl.indexOf('?'); return i < 0 ? '' : req.originalUrl.slice(i); };

// The URL rewrites used for pages and sitemap entries: https://letterhome.ca/us/x → https://letterhome.us/x.
// `relative` decides what a root-relative link such as href="/us/es" becomes: on the country's own domain it loses the
// prefix (href="/es"); anywhere else it points at the country domain (href="https://letterhome.us/es").
function rewriteFor(site, { relative = false } = {}) {
  const pre = escRe(site.prefix);
  const abs = new RegExp(`https://${escRe(PRIMARY)}${pre}(/[^"'\\s<>)]*)?(?=["'\\s<>)]|$)`, 'g');
  const rel = new RegExp(`((?:href|action)=["'])${pre}(/[^"']*)?(?=["'])`, 'g');
  const pages = (site.pages || []).map(escRe).join('|');
  const absPage = pages && new RegExp(`https://${escRe(PRIMARY)}(${pages})(?![\\w/-])`, 'g');
  const relPage = pages && new RegExp(`((?:href|action)=["'])(${pages})(?=["'?#])`, 'g');
  return html => (absPage ? html.replace(absPage, (_m, pg) => `https://${site.host}${pg}`) : html)
    .replace(relPage || /$^/g, (_m, a, pg) => a + (relative ? pg : `https://${site.host}${pg}`))
    .replace(abs, (_m, rest) => `https://${site.host}${rest || '/'}`)
    .replace(rel, (_m, a, rest) => a + (relative ? (rest || '/') : `https://${site.host}${rest || '/'}`));
}

function createSites({ getSetting, localSlugs, publicDir }) {
  const isLive = site => getSetting(site.setting, 'false') === 'true';
  const hostOf = req => String(req.hostname || '').toLowerCase().replace(/\.$/, '');
  const siteOfHost = h => SITES.find(s => s.host === h);
  // For a page served on `onSite` (or the main domain when null): rewrite every live country domain's URLs.
  const own = new Map(SITES.map(s => [s.key, rewriteFor(s, { relative: true })]));
  const cross = new Map(SITES.map(s => [s.key, rewriteFor(s)]));
  const transformFor = onSite => html => SITES.filter(isLive).reduce((h, s) => (onSite && onSite.key === s.key ? own : cross).get(s.key)(h), html);

  const isLocal = (site, p) => p === '/'
    || site.roots.some(r => p === r || p.startsWith(r + '/'))
    || (localSlugs(site.key) || []).includes(p.slice(1).replace(/\/$/, ''));

  // Small cache so a page is not re-read from disk on every request (keyed by file and modified time).
  const fileCache = new Map();
  function readCached(file) {
    const m = fs.statSync(file).mtimeMs, c = fileCache.get(file);
    if (c && c.m === m) return c.text;
    const text = fs.readFileSync(file, 'utf8');
    fileCache.set(file, { m, text });
    return text;
  }

  function middleware(req, res, next) {
    const h = hostOf(req);

    // www.<country domain> → the bare country domain
    for (const site of SITES) if (h === 'www.' + site.host) return res.redirect(301, `https://${site.host}${req.originalUrl}`);

    const site = siteOfHost(h);
    if (site) {
      const p = req.path;
      if (!isLive(site)) {
        // Switch off: a plain 301 to the matching page on the main domain.
        const target = p === '/' ? site.prefix + qs(req) : (isLocal(site, p) ? site.prefix + p + qs(req) : req.originalUrl);
        return res.redirect(301, `https://${PRIMARY}${target}`);
      }
      // The admin panel, the business portal and Stripe live on the main domain only.
      if (/^\/(admin|portal|webhook)(\/|$)/.test(p) || p.startsWith('/api/admin') || p.startsWith('/api/portal'))
        return res.redirect(301, `https://${PRIMARY}${req.originalUrl}`);
      // Another country's pages belong on that country's own address (or on letterhome.ca when it has no domain).
      for (const o of SITES) {
        if (o.key !== site.key && hasPrefix(p, o)) return res.redirect(301, isLive(o) ? `https://${o.host}${stripPrefix(p, o)}${qs(req)}` : `https://${PRIMARY}${req.originalUrl}`);
      }
      // Another country's own guides likewise belong on that country's address.
      for (const o of SITES) {
        if (o.key !== site.key && hasPage(p, o)) return res.redirect(301, isLive(o) ? `https://${o.host}${p}${qs(req)}` : `https://${PRIMARY}${req.originalUrl}`);
      }
      if (hasPrefix(p, { prefix: '/au' })) return res.redirect(301, `https://${PRIMARY}${req.originalUrl}`);
      // The old /us and /uk addresses collapse into the clean ones.
      if (hasPrefix(p, site)) return res.redirect(301, `https://${site.host}${stripPrefix(p, site)}${qs(req)}`);
      if (isLocal(site, p)) req.url = site.prefix + p + qs(req);

      wrapSendFile(res, transformFor(site));
      return next();
    }

    // Main domain: country paths that have moved to a live country domain get a 301 to it.
    for (const s of SITES) {
      if (hasPage(req.path, s) && isLive(s)) return res.redirect(301, `https://${s.host}${req.path}${qs(req)}`);
      if (hasPrefix(req.path, s) && isLive(s)) return res.redirect(301, `https://${s.host}${stripPrefix(req.path, s)}${qs(req)}`);
    }
    if (SITES.some(isLive)) wrapSendFile(res, transformFor(null));
    next();
  }

  // HTML pages sent with res.sendFile pass through `transform` first (everything else is sent untouched).
  function wrapSendFile(res, transform) {
    const orig = res.sendFile.bind(res);
    res.sendFile = function (file, ...rest) {
      if (typeof file !== 'string' || !file.endsWith('.html')) return orig(file, ...rest);
      let html;
      try { html = readCached(file); } catch { return orig(file, ...rest); }
      res.type('html');
      return res.send(transform(html));
    };
  }

  // The base URL for links that leave the page (Stripe return links): stay on the country domain when it is live.
  function baseUrl(req) {
    const site = siteOfHost(hostOf(req));
    return site && isLive(site) ? `https://${site.host}` : (process.env.BASE_URL || '').replace(/\/$/, '');
  }

  // sitemap.xml and robots.txt per domain (only when a country domain is live; otherwise the static files serve as before).
  const sitemapCache = { m: 0, head: '', blocks: [] };
  function loadSitemap() {
    const file = path.join(publicDir, 'sitemap.xml');
    const m = fs.statSync(file).mtimeMs;
    if (m !== sitemapCache.m) {
      const text = fs.readFileSync(file, 'utf8');
      sitemapCache.head = text.slice(0, text.indexOf('<url>'));
      sitemapCache.blocks = (text.match(/<url>[\s\S]*?<\/url>/g) || []).map(b => ({ b, loc: (b.match(/<loc>([^<]*)<\/loc>/) || [])[1] || '' }));
      sitemapCache.m = m;
    }
    return sitemapCache;
  }
  const belongsTo = (loc, site) => (site.pages || []).some(pg => loc === `https://${PRIMARY}${pg}`) || loc === `https://${PRIMARY}${site.prefix}` || loc.startsWith(`https://${PRIMARY}${site.prefix}/`);

  function register(app) {
    app.get('/sitemap.xml', (req, res, next) => {
      let sm;
      try { sm = loadSitemap(); } catch { return next(); }
      const site = siteOfHost(hostOf(req));
      let body;
      if (site) {
        if (!isLive(site)) return next();
        const rewrite = transformFor(site);
        body = sm.blocks.filter(x => belongsTo(x.loc, site)).map(x => rewrite(x.b)).join('\n  ');
      } else {
        const moved = SITES.filter(isLive);
        if (!moved.length) return next();
        const rewrite = transformFor(null);
        body = sm.blocks.filter(x => !moved.some(s => belongsTo(x.loc, s))).map(x => rewrite(x.b)).join('\n  ');
      }
      res.type('application/xml').send(sm.head + body + '\n</urlset>\n');
    });
    // The home page is normally served by express.static, which would skip the rewrite; route it explicitly when needed.
    app.get('/', (req, res, next) => {
      if (siteOfHost(hostOf(req)) || !SITES.some(isLive)) return next();
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.sendFile(path.join(publicDir, 'index.html'));
    });
    app.get('/robots.txt', (req, res, next) => {
      const site = siteOfHost(hostOf(req));
      if (!site || !isLive(site)) return next();
      let txt;
      try { txt = fs.readFileSync(path.join(publicDir, 'robots.txt'), 'utf8'); } catch { return next(); }
      res.type('text/plain').send(txt.replace(new RegExp(`https://${escRe(PRIMARY)}/sitemap\\.xml`, 'g'), `https://${site.host}/sitemap.xml`));
    });
  }

  // 'us' / 'uk' when the request came in on a live country domain, otherwise 'ca'.
  function keyOf(req) { const s = siteOfHost(hostOf(req)); return s && isLive(s) ? s.key : 'ca'; }
  // The public address for a stored site key; null for ca/unknown or a domain that was switched off since.
  function baseForKey(key) { const s = SITES.find(x => x.key === key); return s && isLive(s) ? `https://${s.host}` : null; }

  return { middleware, register, baseUrl, keyOf, baseForKey, isLive, SITES };
}

module.exports = { createSites, rewriteFor, SITES, PRIMARY };
