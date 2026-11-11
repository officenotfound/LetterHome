'use strict';
// Tells Bing (and through it Copilot, ChatGPT search and DuckDuckGo) and Yandex when a page is new or changed, using the
// IndexNow protocol. It runs on the server after a deploy, so the pages are already live when the search engines fetch them,
// and it sends each page under the domain it is served from (letterhome.us pages as letterhome.us, not letterhome.ca/us).
//
// It reads public/sitemap.xml, remembers each page's <lastmod> from the last successful run, and sends only the pages that are
// new or whose date changed. Only the production site does this: a server whose BASE_URL is not https://letterhome.ca never
// contacts anyone.
const fs = require('node:fs');
const path = require('node:path');
const { SITES, PRIMARY, rewriteFor } = require('./sites');

const KEY = 'b4e8a2f1d9c5b7e3a6f0d8c2b5e9a1f4';   // public on purpose: the same text is served at /<key>.txt on every domain
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const CHUNK = 1000;

function readSitemap(publicDir) {
  const xml = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');
  const seen = new Map();
  for (const b of xml.match(/<url>[\s\S]*?<\/url>/g) || []) {
    const loc = (b.match(/<loc>([^<]+)<\/loc>/) || [])[1];
    if (!loc) continue;
    seen.set(loc.trim(), ((b.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || '').trim());
  }
  return [...seen].map(([loc, lastmod]) => ({ loc, lastmod }));
}

function create({ getSetting, setSetting, publicDir, baseUrl, fetchImpl = fetch, now = () => new Date(), log = () => {} }) {
  const enabled = () => /^https:\/\/letterhome\.ca\/?$/.test(String(baseUrl || ''));
  const live = site => getSetting(site.setting, 'false') === 'true';

  function plan(all) {
    const pages = readSitemap(publicDir);
    const raw = getSetting('indexnow_state', '');
    let state = {};
    try { state = raw ? JSON.parse(raw) : {}; } catch { state = {}; }
    // First run on a fresh database: only pages dated in the last week, not the whole site
    const cutoff = new Date(now().getTime() - 7 * 864e5).toISOString().slice(0, 10);
    const due = pages.filter(p => all || (raw ? state[p.loc] !== p.lastmod : p.lastmod >= cutoff));
    const maps = SITES.filter(live).map(s => rewriteFor(s));
    const byHost = new Map();
    for (const p of due) {
      let u = p.loc;
      for (const m of maps) { const n = m(u); if (n !== u) { u = n; break; } }
      let host;
      try { host = new URL(u).host; } catch { continue; }
      if (host !== PRIMARY && !SITES.some(s => s.host === host)) continue;
      if (!byHost.has(host)) byHost.set(host, []);
      byHost.get(host).push(u);
    }
    return { pages, byHost, next: Object.fromEntries(pages.map(p => [p.loc, p.lastmod])) };
  }

  async function run({ all = false } = {}) {
    if (!enabled()) return { skipped: 'not the production site', submitted: 0 };
    const { byHost, next } = plan(all);
    const total = [...byHost.values()].reduce((n, l) => n + l.length, 0);
    if (!total) { setSetting('indexnow_state', JSON.stringify(next)); return { submitted: 0, ok: true }; }
    const hosts = {};
    let ok = true;
    for (const [host, urls] of byHost) {
      for (let i = 0; i < urls.length; i += CHUNK) {
        try {
          const r = await fetchImpl(ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ host, key: KEY, keyLocation: `https://${host}/${KEY}.txt`, urlList: urls.slice(i, i + CHUNK) }),
          });
          hosts[host] = r.status;
          if (r.status !== 200 && r.status !== 202) ok = false;
        } catch (e) { hosts[host] = 'error: ' + e.message; ok = false; }
      }
    }
    if (ok) setSetting('indexnow_state', JSON.stringify(next));   // a failed run is retried next time
    const result = { at: now().toISOString(), submitted: total, ok, hosts, urls: [...byHost.values()].flat().slice(0, 20) };
    setSetting('indexnow_last', JSON.stringify(result));
    log(result);
    return result;
  }

  function status() {
    let last = null;
    try { last = JSON.parse(getSetting('indexnow_last', '') || 'null'); } catch {}
    return { enabled: enabled(), last };
  }

  return { run, status, plan, enabled };
}

module.exports = { create, readSitemap, KEY };
