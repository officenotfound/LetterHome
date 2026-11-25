'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID, generateKeyPairSync } = require('node:crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `lh-searchapis-${randomUUID()}.db`);
const express = require('express');
const db = require('../db');
require('../adminTools').register(express(), { db, requireAdmin: (q, r, n) => n(), logAudit: () => {}, getSetting: () => null, appRoot: path.join(__dirname, '..'), backupDir: os.tmpdir(), baseUrl: 'http://localhost' });
const api = require('../searchApis');
after(() => { for (const f of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + f); } catch {} } });

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const keyFile = JSON.stringify({ type: 'service_account', client_email: 'search-reader@lh.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'http://evil.example/token' });

test('property addresses map to the right site, and other domains are ignored', () => {
  assert.deepEqual(api.pickProperties(['https://letterhome.ca/', 'sc-domain:letterhome.ca', 'https://www.letterhome.co.uk/', 'sc-domain:example.com', 'https://letterhome.ca/au/']),
    { ca: 'sc-domain:letterhome.ca', uk: 'https://www.letterhome.co.uk/', au: 'https://letterhome.ca/au/' });
  assert.equal(api.siteOfProperty('https://letterhome.ca.evil.com/'), null);
  assert.throws(() => api.parseServiceKey('{"type":"x"}'), /not a service account/);
});

test('Google and Bing results are stored apart, one copy a week, and a failure is explained without the key', async () => {
  const store = { gsc_service_key: keyFile, bing_api_key: 'a'.repeat(32) };
  const getSetting = (k, d = '') => store[k] ?? d;
  const setSetting = (k, v) => { store[k] = v; };
  const now = Date.parse('2026-11-26T12:00:00Z');
  const asked = [];
  const fetchImpl = async (url, opts) => {
    asked.push(url);
    const json = body => ({ ok: true, json: async () => body });
    if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 't' });
    if (url.endsWith('/v3/sites')) return json({ siteEntry: [{ siteUrl: 'sc-domain:letterhome.ca', permissionLevel: 'siteRestrictedUser' }] });
    if (url.includes('searchAnalytics')) {
      const dim = JSON.parse(opts.body).dimensions[0];
      return json({ rows: [{ keys: [{ date: '2026-11-24', country: 'can', device: 'MOBILE', query: 'mail a letter', page: 'https://letterhome.ca/' }[dim]], clicks: 2, impressions: 50, ctr: 0.04, position: 8 }] });
    }
    if (url.includes('GetUserSites')) return json({ d: [{ Url: 'https://letterhome.ca/', IsVerified: true }] });
    const d = `/Date(${Date.parse('2026-11-20T08:00:00Z')}-0800)/`, old = `/Date(${Date.parse('2026-05-01T08:00:00Z')}-0700)/`;
    return json({ d: [{ Query: 'post a letter', Date: d, Clicks: 1, Impressions: 10, AvgImpressionPosition: 4 }, { Query: 'old', Date: old, Clicks: 9, Impressions: 9 }] });
  };
  const run = at => api.fetchAll({ db, getSetting, setSetting, fetchImpl, now: at });
  assert.deepEqual((await run(now)).map(r => [r.engine, r.site, r.ok]), [['google', 'ca', true], ['bing', 'ca', true]]);
  await run(now + 86400000);
  const snaps = db.prepare('SELECT engine, clicks, impressions FROM gsc_snapshots ORDER BY engine').all().map(r => ({ ...r }));
  assert.deepEqual(snaps, [{ engine: 'bing', clicks: 1, impressions: 10 }, { engine: 'google', clicks: 2, impressions: 50 }]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM gsc_rows WHERE kind = 'country' AND key = 'Canada'").get().n, 1);
  assert.ok(!asked.some(u => u.includes('evil.example')), 'the address in the key file is never used');
  await run(now + 8 * 86400000);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM gsc_snapshots WHERE engine = 'google'").get().n, 2);

  const failed = await api.fetchAll({ db, getSetting, setSetting, now, fetchImpl: async url => { throw new Error('connect failed ' + url); } });
  assert.ok(failed.every(r => !r.ok));
  assert.ok(!JSON.stringify(failed).includes('a'.repeat(32)));
  assert.equal(api.status(getSetting).google_email, 'search-reader@lh.iam.gserviceaccount.com');
  assert.ok(!JSON.stringify(api.status(getSetting)).includes('PRIVATE KEY'));
});
