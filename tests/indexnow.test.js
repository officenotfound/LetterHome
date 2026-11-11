'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { create } = require('../indexnow');

function setup({ live = {}, baseUrl = 'https://letterhome.ca', status = 200, lastmods } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inx-'));
  const write = m => fs.writeFileSync(path.join(dir, 'sitemap.xml'), '<urlset>' + Object.entries(m).map(([u, d]) => `<url><loc>${u}</loc><lastmod>${d}</lastmod></url>`).join('') + '</urlset>');
  write(lastmods || {});
  const store = {}; const calls = [];
  const inx = create({
    getSetting: (k, f = '') => (k in store ? store[k] : (k in live ? live[k] : f)),
    setSetting: (k, v) => { store[k] = String(v); },
    publicDir: dir, baseUrl, now: () => new Date('2026-11-11T12:00:00Z'),
    fetchImpl: async (url, o) => { calls.push(JSON.parse(o.body)); return { status }; },
  });
  return { inx, write, store, calls };
}

test('indexnow: first run sends only pages from the last week; later runs send only new or changed pages', async () => {
  const t = setup({ lastmods: { 'https://letterhome.ca/old': '2026-01-01', 'https://letterhome.ca/new': '2026-11-10' } });
  let r = await t.inx.run();
  assert.equal(r.submitted, 1);
  assert.deepEqual(t.calls[0].urlList, ['https://letterhome.ca/new']);
  assert.equal(t.calls[0].host, 'letterhome.ca');
  assert.equal(t.calls[0].keyLocation, 'https://letterhome.ca/b4e8a2f1d9c5b7e3a6f0d8c2b5e9a1f4.txt');
  r = await t.inx.run();
  assert.equal(r.submitted, 0, 'nothing changed, nothing sent');
  assert.equal(t.calls.length, 1);
  t.write({ 'https://letterhome.ca/old': '2026-01-01', 'https://letterhome.ca/new': '2026-11-11', 'https://letterhome.ca/extra': '2026-11-11' });
  r = await t.inx.run();
  assert.deepEqual(t.calls[1].urlList.sort(), ['https://letterhome.ca/extra', 'https://letterhome.ca/new']);
});

test('indexnow: pages on a live country domain are sent under that domain with their own request', async () => {
  const t = setup({ live: { us_domain_live: 'true' }, lastmods: { 'https://letterhome.ca/us/what-is-certified-mail': '2026-11-11', 'https://letterhome.ca/about': '2026-11-11' } });
  await t.inx.run();
  const byHost = Object.fromEntries(t.calls.map(c => [c.host, c]));
  assert.deepEqual(byHost['letterhome.us'].urlList, ['https://letterhome.us/what-is-certified-mail']);
  assert.equal(byHost['letterhome.us'].keyLocation, 'https://letterhome.us/b4e8a2f1d9c5b7e3a6f0d8c2b5e9a1f4.txt');
  assert.deepEqual(byHost['letterhome.ca'].urlList, ['https://letterhome.ca/about']);
});

test('indexnow: a failed send is retried next time, and a non-production server never contacts anyone', async () => {
  const bad = setup({ status: 500, lastmods: { 'https://letterhome.ca/a': '2026-11-11' } });
  const r = await bad.inx.run();
  assert.equal(r.ok, false);
  assert.equal(bad.store.indexnow_state, undefined, 'state is not saved after a failure');
  const dev = setup({ baseUrl: 'http://localhost:3000', lastmods: { 'https://letterhome.ca/a': '2026-11-11' } });
  assert.equal((await dev.inx.run()).skipped, 'not the production site');
  assert.equal(dev.calls.length, 0);
  assert.equal(dev.inx.status().enabled, false);
});
