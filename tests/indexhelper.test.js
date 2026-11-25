'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID, generateKeyPairSync } = require('node:crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `lh-index-${randomUUID()}.db`);
const db = require('../db');
require('../googleExtras').schema(db);
const helper = require('../indexHelper');
const pub = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-pub-'));
fs.writeFileSync(path.join(pub, 'index.html'), '<nav><a href="/santa-letter-prices">menu</a></nav><main><a href="/santa-letter-prices">prices</a></main>');
fs.writeFileSync(path.join(pub, 'santa-letter-prices.html'), '<a href="/">home</a>');
fs.writeFileSync(path.join(pub, 'santa-letter.html'), '<p>no link</p>');
after(() => { for (const f of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + f); } catch {} } fs.rmSync(pub, { recursive: true, force: true }); });

const URL_ = 'https://letterhome.ca/santa-letter-prices';
db.prepare("INSERT INTO index_status (url, site, verdict, coverage, last_crawl, checked_at) VALUES (?, 'ca', 'NEUTRAL', 'Crawled - currently not indexed', '2026-11-20', '2026-11-25T00:00:00Z')").run(URL_);
const page = (status, html, headers = {}) => async () => ({ status, headers: { get: k => headers[k] || null }, text: async () => html });
const pages = () => new Map([['letterhome.ca', [URL_]]]);

test('a missing page gets a plain reason, checks on the live page and where to link it from', async () => {
  const d = await helper.diagnose({ db, publicDir: pub, pages, fetchImpl: page(200, `<link rel="canonical" href="${URL_}"><main>few words here</main>`) }, URL_);
  assert.match(d.reason, /visited the page/);
  const by = Object.fromEntries(d.checks.map(c => [c.label, c]));
  assert.equal(by['Page loads'].ok, true);
  assert.equal(by['Enough text'].ok, false);
  assert.equal(by['Listed in the sitemap'].ok, true);
  assert.match(by['Linked from your other pages'].detail, /^1 page link/);
  assert.deepEqual(d.suggest, ['/santa-letter']);
});

test('a blocked or forwarding page is reported, and unknown addresses are never fetched', async () => {
  const blocked = await helper.diagnose({ db, publicDir: pub, pages, fetchImpl: page(200, '<meta name="robots" content="noindex">') }, URL_);
  assert.equal(blocked.checks.find(c => c.label === 'Open to search engines').ok, false);
  const moved = await helper.diagnose({ db, publicDir: pub, pages, fetchImpl: page(301, '', { location: '/x' }) }, URL_);
  assert.match(moved.checks[0].detail, /301, forwarding to \/x/);
  assert.equal(await helper.diagnose({ db, publicDir: pub, pages, fetchImpl: () => { throw new Error('must not fetch'); } }, 'http://169.254.169.254/'), null);
});

test('resending the sitemap says what to change when Google refuses', async () => {
  const key = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
  const getSetting = () => JSON.stringify({ type: 'service_account', client_email: 'a@b.iam.gserviceaccount.com', private_key: key });
  const calls = [];
  const fetchImpl = status => async (url, opts = {}) => {
    calls.push([opts.method || 'GET', url]);
    return { ok: status === 200 || opts.method !== 'PUT', status: opts.method === 'PUT' ? status : 200, json: async () => (url.includes('oauth2') ? { access_token: 't' } : { siteEntry: [{ siteUrl: 'sc-domain:letterhome.ca' }] }) };
  };
  assert.equal(await helper.resendSitemap({ getSetting, fetchImpl: fetchImpl(200) }, URL_), 'https://letterhome.ca/sitemap.xml');
  assert.deepEqual(calls.at(-1), ['PUT', 'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aletterhome.ca/sitemaps/https%3A%2F%2Fletterhome.ca%2Fsitemap.xml']);
  await assert.rejects(helper.resendSitemap({ getSetting, fetchImpl: fetchImpl(403) }, URL_), /Owner or Full/);
});
