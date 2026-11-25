'use strict';
// Why a page is not in Google, and what can be done about it from the admin. Google has no way to ask for a page to be
// indexed, so this explains its answer, checks the live page, looks at which of our pages link to it, and offers the
// few things that can be sent: a fresh check, the sitemap again, and the page to Bing. Only addresses already in
// index_status (our own sitemap pages) are ever fetched.
const fs = require('node:fs');
const path = require('node:path');
const { parseServiceKey, googleToken, call, pickProperties } = require('./searchApis');
const { SITES, PRIMARY } = require('./sites');
const googleExtras = require('./googleExtras');

const FEW_LINKS = 3;
const SHORT_PAGE = 300;

// Google's wording, in plain words.
const REASONS = [
  [/^discovered/i, 'Google knows this address but has not visited it yet.', 'Link to it from busier pages, then ask for indexing in Search Console. It often just takes a few weeks.'],
  [/^crawled/i, 'Google visited the page and has not added it so far.', 'This usually means it looks thin or too much like another page. Add something only this page has, and link to it from related pages.'],
  [/unknown to google/i, 'Google has not found this address yet.', 'Send the sitemap again and link to the page from other pages.'],
  [/redirect/i, 'This address forwards to another one, so Google lists the other one.', 'If that is intended, nothing is wrong. If not, the redirect needs removing.'],
  [/alternate page/i, 'Google treats this as a copy of another page that you pointed it to.', 'If that is intended, nothing is wrong.'],
  [/duplicate/i, 'Google thinks this page repeats another one and picked the other.', 'Make the two clearly different, or point both at the one you want listed.'],
  [/noindex/i, 'The page tells Google not to list it.', 'Remove the noindex tag if you want it listed.'],
  [/robots/i, 'robots.txt stops Google from reading this page.', 'Allow it in robots.txt if you want it listed.'],
  [/404/, 'Google got "page not found".', 'Bring the page back, forward it, or take it out of the sitemap.'],
  [/5xx|server error/i, 'The server gave an error when Google visited.', 'If the page loads now, check it again in a few days.'],
  [/403|401|forbidden|unauthorized/i, 'Google was not allowed to open the page.', 'Something is blocking the visit, often a firewall rule.'],
];
function explain(coverage) {
  const hit = REASONS.find(([re]) => re.test(coverage || ''));
  return hit ? { reason: hit[1], todo: hit[2] } : { reason: coverage ? `Google says: ${coverage}.` : 'Google gave no detail.', todo: 'Check it again, or open it in Search Console.' };
}

const bare = u => String(u || '').replace(/\/+$/, '').toLowerCase();

async function readPage(url, fetchImpl) {
  let r;
  try { r = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'LetterhomeIndexCheck' } }); }
  catch { return { status: 0 }; }
  const out = { status: r.status, location: r.headers.get('location') || '' };
  if (r.status !== 200) return out;
  const html = String(await r.text()).slice(0, 2000000);
  out.noindex = /noindex/i.test(r.headers.get('x-robots-tag') || '') || /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html);
  out.canonical = (html.match(/<link rel=["']canonical["'] href=["']([^"']*)["']/i) || [])[1] || '';
  const body = html.replace(/<(script|style|nav|header|footer|svg|noscript)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  out.words = (body.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  return out;
}

// Which of our page files link where.
function linkGraph(publicDir) {
  const pages = [];
  for (const f of fs.readdirSync(publicDir).filter(n => n.endsWith('.html') && !['404.html', '500.html', 'account.html', 'order-success.html'].includes(n))) {
    const html = fs.readFileSync(path.join(publicDir, f), 'utf8');
    // Menu and footer links appear everywhere, so only links inside the page's own text are counted.
    const body = html.replace(/<(script|style|nav|header|footer)\b[\s\S]*?<\/\1>/gi, ' ');
    const links = new Set([...body.matchAll(/<a\s[^>]*href=["']([^"'#?]+)/gi)].map(m => bare(m[1]) || '/'));
    // us-return-address.html is served at /us/return-address.
    pages.push({ name: f === 'index.html' ? '/' : '/' + f.replace(/\.html$/, '').replace(/^(us|uk|au)-/, '$1/'), links });
  }
  return pages;
}

// The ways our pages might write a link to this address.
function linkForms(url) {
  const u = new URL(url);
  const site = SITES.find(s => s.host === u.host);
  const paths = [u.pathname, ...(site ? [site.prefix + (u.pathname === '/' ? '' : u.pathname)] : [])];
  return new Set(paths.flatMap(p => [bare(p) || '/', bare(`https://${u.host}${p}`), bare(`https://${PRIMARY}${p}`)]));
}

const words = s => new Set(String(s).toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2 && !['the', 'and', 'for', 'from', 'how', 'with', 'your', 'letter', 'mail', 'send'].includes(w)));

function links(url, graph) {
  const forms = linkForms(url);
  const last = bare(new URL(url).pathname).split('/').pop() || '';
  const self = p => forms.has(bare(p.name)) || (last && p.name.split('/').pop() === last);
  const from = graph.filter(p => !self(p) && [...p.links].some(l => forms.has(l)));
  const topic = words(last);
  const suggest = graph.filter(p => !self(p) && !from.includes(p))
    .map(p => ({ name: p.name, score: [...words(p.name)].filter(w => topic.has(w)).length }))
    .filter(p => p.score > 0).sort((a, b) => b.score - a.score || a.name.length - b.name.length).slice(0, 3).map(p => p.name);
  return { count: from.length, from: from.slice(0, 5).map(p => p.name), suggest };
}

async function diagnose({ db, publicDir, pages, fetchImpl = fetch, graph }, url) {
  const row = db.prepare('SELECT url, site, verdict, coverage, last_crawl, checked_at, detail FROM index_status WHERE url = ?').get(url);
  if (!row) return null;
  let google = {};
  try { google = JSON.parse(row.detail || '{}') || {}; } catch {}
  const page = await readPage(row.url, fetchImpl);
  const found = links(row.url, graph || linkGraph(publicDir));
  const checks = [];
  const add = (ok, label, detail) => checks.push({ ok, label, detail });
  const loads = page.status === 200;
  add(loads, 'Page loads', loads ? '' : page.status ? `It answers ${page.status}${page.location ? `, forwarding to ${page.location}` : ''}` : 'No answer');
  if (loads) {
    add(!page.noindex, 'Open to search engines', page.noindex ? 'It carries a noindex instruction' : '');
    const same = !page.canonical || bare(page.canonical) === bare(row.url);
    add(!!page.canonical && same, 'Names itself as the main address', !page.canonical ? 'No canonical link' : same ? '' : `It points to ${page.canonical}`);
    add(page.words >= SHORT_PAGE, 'Enough text', `${page.words} words${page.words < SHORT_PAGE ? ', which is short' : ''}`);
  }
  const listed = [...pages().values()].flat().some(u => bare(u) === bare(row.url));
  add(listed, 'Listed in the sitemap', listed ? '' : 'Not in the sitemap');
  add(found.count >= FEW_LINKS, 'Linked from your other pages', `${found.count} page${found.count === 1 ? '' : 's'} link to it in their text${found.from.length ? `: ${found.from.join(', ')}` : ''}`);
  if (google.googleCanonical && bare(google.googleCanonical) !== bare(row.url)) add(false, 'Google agrees on the address', `Google lists ${google.googleCanonical} instead`);
  if (google.robots === 'DISALLOWED') add(false, 'Allowed by robots.txt', 'robots.txt blocks it');
  return {
    url: row.url, indexed: row.verdict === 'PASS', coverage: row.coverage, lastVisit: row.last_crawl, checkedAt: row.checked_at,
    ...(row.verdict === 'PASS' ? { reason: 'Google has this page.', todo: 'Nothing to do.' } : explain(row.coverage)),
    checks, suggest: found.count >= FEW_LINKS ? [] : found.suggest,
  };
}

// Sending the sitemap needs permission to write, which the daily checks never ask for.
async function resendSitemap({ getSetting, fetchImpl = fetch }, url) {
  const raw = getSetting('gsc_service_key', '');
  if (!raw) throw new Error('Add the Google key file on the Search screen first.');
  const token = await googleToken(fetchImpl, parseServiceKey(raw), 'webmasters');
  const list = await call(fetchImpl, 'Google', 'https://www.googleapis.com/webmasters/v3/sites', { headers: { Authorization: `Bearer ${token}` } });
  const props = pickProperties((list.siteEntry || []).map(s => s.siteUrl));
  const host = new URL(url).host;
  const site = host === PRIMARY ? 'ca' : (SITES.find(s => s.host === host) || {}).key;
  if (!site || !props[site]) throw new Error('This site is not in Search Console for this key.');
  const map = `https://${host}/sitemap.xml`;
  let r;
  try {
    r = await fetchImpl(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(props[site])}/sitemaps/${encodeURIComponent(map)}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  } catch { throw new Error('Could not reach Google.'); }
  if (r.status === 403) throw new Error('Google refused. In Search Console, give the service account Owner or Full permission, then try again.');
  if (!r.ok) throw new Error(`Google answered with error ${r.status}.`);
  return map;
}

function register(app, { db, requireAdmin, logAudit, getSetting, publicDir, pages, indexNow, fetchImpl = fetch }) {
  googleExtras.schema(db);
  let graph = null, graphAt = 0;
  const currentGraph = () => {
    if (!graph || Date.now() - graphAt > 600000) { graph = linkGraph(publicDir); graphAt = Date.now(); }
    return graph;
  };
  const known = url => db.prepare('SELECT url FROM index_status WHERE url = ?').get(String(url || ''))?.url;
  const help = url => diagnose({ db, publicDir, pages, fetchImpl, graph: currentGraph() }, url);
  const handle = fn => async (req, res) => {
    const url = known(req.method === 'GET' ? req.query.url : req.body?.url);
    if (!url) return res.status(404).json({ error: 'That page is not on the checked list.' });
    try { res.json(await fn(url, req)); }
    catch (e) { console.error('[index-help]', e.message); res.status(502).json({ error: e.message }); }
  };

  app.get('/api/admin/index-help', requireAdmin, handle(url => help(url)));
  app.post('/api/admin/index-help/recheck', requireAdmin, handle(async url => {
    await googleExtras.inspectPage({ db, getSetting, url, fetchImpl });
    return help(url);
  }));
  app.post('/api/admin/index-help/sitemap', requireAdmin, handle(async (url, req) => {
    const map = await resendSitemap({ getSetting, fetchImpl }, url);
    logAudit(req, 'index.sitemap', 'sitemap', map);
    return { ok: true, message: 'Sitemap sent to Google.' };
  }));
  app.post('/api/admin/index-help/bing', requireAdmin, handle(async (url, req) => {
    const r = await indexNow.send([url]);
    if (!r.ok) throw new Error(r.message || 'Bing did not accept it.');
    logAudit(req, 'index.bing', 'page', url);
    return { ok: true, message: 'Sent to Bing.' };
  }));
}

module.exports = { register, diagnose, explain, links, linkGraph, resendSitemap };
