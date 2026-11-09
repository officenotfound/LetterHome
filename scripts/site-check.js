#!/usr/bin/env node
// Crawls the whole site on every host (letterhome.ca, .us, .co.uk) against a running server and reports problems:
// bad status codes, broken internal links/assets, wrong canonicals, bad hreflang, inline-script syntax errors, leftovers.
//   PORT=3911 node scripts/site-check.js      (start the server first with both country switches on)
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const PORT = process.env.PORT || 3911;
const HOSTS = ['letterhome.ca', 'letterhome.us', 'letterhome.co.uk'];
const root = path.join(__dirname, '..');
const cache = new Map();
function get(host, p) {
  const key = host + ' ' + p;
  if (cache.has(key)) return cache.get(key);
  const pr = new Promise(resolve => {
    const r = http.get({ host: '127.0.0.1', port: PORT, path: p, headers: { Host: host, 'User-Agent': 'site-check' } }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', d => { if (body.length < 3e6) body += d; });
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, type: res.headers['content-type'] || '', body }));
    });
    r.on('error', e => resolve({ status: 0, error: e.message, body: '' }));
    r.setTimeout(15000, () => { r.destroy(); resolve({ status: 0, error: 'timeout', body: '' }); });
  });
  cache.set(key, pr); return pr;
}
// Follow redirects (max 5), returning the final response and the chain.
async function fetchFinal(host, p) {
  let cur = { host, p }, chain = [];
  for (let i = 0; i < 6; i++) {
    const r = await get(cur.host, cur.p);
    if (r.status >= 300 && r.status < 400 && r.location) {
      chain.push(`${r.status} ${cur.host}${cur.p}`);
      const u = new URL(r.location, `https://${cur.host}${cur.p}`);
      if (!HOSTS.includes(u.hostname)) return { ...r, chain, external: u.href, final: true };   // leaves the site
      cur = { host: u.hostname, p: u.pathname + u.search };
      continue;
    }
    return { ...r, chain, host: cur.host, p: cur.p };
  }
  return { status: 0, error: 'redirect loop', chain, body: '' };
}
const problems = [];
const bad = (host, page, msg) => problems.push(`${host}${page}  ${msg}`);

(async () => {
  const sm = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
  const smPaths = [...sm.matchAll(/<loc>https:\/\/letterhome\.ca([^<]*)<\/loc>/g)].map(m => m[1] || '/');
  const extra = ['/send', '/track', '/account', '/account/login', '/order-success', '/contact', '/terms', '/privacy', '/refunds', '/accessibility', '/guides', '/about', '/404-check-missing-page', '/us/es', '/business', '/us/business', '/uk/business', '/au/business', '/au'];
  const paths = [...new Set([...smPaths, ...extra])];
  const seenAsset = new Set();
  let pages = 0, links = 0;
  for (const host of HOSTS) {
    for (const p of paths) {
      const expectMissing = p.includes('missing-page');
      const r = await fetchFinal(host, p);
      pages++;
      if (expectMissing) { if (r.status !== 404) bad(host, p, `unknown page should be 404, got ${r.status}`); continue; }
      if (r.external) continue;                                   // moved to another site on purpose (e.g. /au stays on .ca)
      if (r.status !== 200) { bad(host, p, `status ${r.status} ${r.error || ''} via ${r.chain.join(' > ')}`); continue; }
      if (r.chain.length > 1) bad(host, p, `redirect chain of ${r.chain.length}: ${r.chain.join(' > ')}`);
      if (!/html/.test(r.type)) continue;
      const html = r.body, here = `${r.host}${r.p}`;
      // inline scripts must parse
      for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)) {
        if (m[1].trim().length < 20) continue;
        try { new Function(m[1]); } catch (e) { if (!/await|import|export/.test(e.message)) bad(host, p, `inline script syntax error: ${e.message}`); }
      }
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch { bad(host, p, 'invalid JSON-LD'); } }
      // canonical
      const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
      if (!canon && !/noindex/.test(html) && !/order-success|\/account|status\//.test(p)) bad(host, p, 'no canonical');
      if (canon) {
        const cu = new URL(canon);
        if (!HOSTS.includes(cu.hostname)) bad(host, p, `canonical off-site: ${canon}`);
        if (cu.pathname.replace(/\/$/, '') !== r.p.split('?')[0].replace(/\/$/, '') && r.host === cu.hostname) bad(host, p, `canonical path ${cu.pathname} differs from page path ${r.p}`);
      }
      // leftovers
      if (/Popular guides/.test(html)) bad(host, p, 'still has the Popular guides row');
      if (/postgrid/i.test(html)) bad(host, p, 'names the print partner');
      if (/lorem ipsum|\bTODO\b|undefined</.test(html)) bad(host, p, 'placeholder text (lorem/TODO/undefined)');
      // internal links and assets
      const refs = new Set();
      for (const m of html.matchAll(/(?:href|src|action)="([^"#]+)"/g)) refs.add(m[1]);
      for (const ref of refs) {
        if (/^(mailto:|tel:|javascript:|data:|https?:\/\/(?!letterhome\.(ca|us|co\.uk))|\/\/)/.test(ref)) continue;
        let u; try { u = new URL(ref, `https://${r.host}${r.p}`); } catch { bad(host, p, `bad URL ${ref}`); continue; }
        if (!HOSTS.includes(u.hostname)) continue;
        links++;
        const target = u.pathname + u.search;
        const k = u.hostname + target;
        if (seenAsset.has(k)) continue; seenAsset.add(k);
        const t = await fetchFinal(u.hostname, target);
        if (t.external) continue;
        if (t.status !== 200 && !(t.status === 404 && /^\/(api|webhook)\//.test(target))) bad(host, p, `broken link/asset ${ref} -> ${t.status} ${t.chain && t.chain.join(' > ')}`);
      }
    }
  }
  // hreflang targets on the five landing pages and the business pages, per host
  for (const host of HOSTS) for (const p of ['/', '/business', '/us/business', '/uk/business', '/au/business', '/send-a-letter-online-in-the-usa', '/address-a-letter-to-canada-from-the-uk']) {
    const r = await fetchFinal(host, p); if (r.status !== 200) continue;
    for (const m of r.body.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)) {
      const u = new URL(m[2]); const t = await fetchFinal(u.hostname, u.pathname);
      if (t.external) continue;
      if (t.status !== 200 || t.chain.length) bad(host, p, `hreflang ${m[1]} -> ${m[2]} is ${t.status}${t.chain.length ? ' via redirect ' + t.chain.join(' > ') : ''} (should be a direct 200)`);
    }
  }
  console.log(`checked ${pages} page loads and ${links} link/asset references`);
  const uniq = [...new Set(problems)];
  console.log(uniq.length ? `${uniq.length} problem(s):\n` + uniq.join('\n') : 'no problems found');
  process.exit(uniq.length ? 1 : 0);
})();
