'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID, generateKeyPairSync } = require('node:crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `lh-gx-${randomUUID()}.db`);
const express = require('express');
const db = require('../db');
require('../trafficSources').ensureSchema(db);
require('../adminTools').register(express(), { db, requireAdmin: (q, r, n) => n(), logAudit: () => {}, getSetting: () => null, appRoot: path.join(__dirname, '..'), backupDir: os.tmpdir(), baseUrl: 'http://localhost' });
const g = require('../googleExtras');
g.schema(db);
after(() => { for (const f of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + f); } catch {} } });

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const store = { gsc_service_key: JSON.stringify({ type: 'service_account', client_email: 'a@b.iam.gserviceaccount.com', private_key: privateKey }), pagespeed_api_key: 'k'.repeat(39), ga4_property_ids: '123456789' };
const settings = { getSetting: (k, d = '') => store[k] ?? d, setSetting: (k, v) => { store[k] = v; } };
const json = body => ({ ok: true, json: async () => body });
const pages = () => new Map([['letterhome.ca', ['https://letterhome.ca/', 'https://letterhome.ca/guides']], ['letterhome.us', ['https://letterhome.us/']]]);

test('index check stores what Google says, and stops a site that refuses with advice', async () => {
  const fetchImpl = async (url, opts) => {
    if (url.includes('oauth2')) return json({ access_token: 't' });
    if (url.endsWith('/v3/sites')) return json({ siteEntry: [{ siteUrl: 'sc-domain:letterhome.ca' }, { siteUrl: 'sc-domain:letterhome.us' }] });
    const { inspectionUrl } = JSON.parse(opts.body);
    if (inspectionUrl.includes('.us')) return { ok: false, status: 403 };
    return json({ inspectionResult: { indexStatusResult: inspectionUrl.endsWith('guides') ? { verdict: 'NEUTRAL', coverageState: 'Discovered - currently not indexed' } : { verdict: 'PASS', lastCrawlTime: '2026-11-20T00:00:00Z' } } });
  };
  const messages = await g.checkIndex({ db, ...settings, pages, fetchImpl });
  assert.match(messages.join(' '), /Full instead of Restricted/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM index_status').get().n, 2);
  const p = g.pulse(db, settings.getSetting);
  assert.ok(p.todo.some(t => /not indexed 1 page\./.test(t.text)));
});

test('speed scores are saved, and a failure never carries the key', async () => {
  await g.checkSpeed({ db, ...settings, urls: ['https://letterhome.ca/'], fetchImpl: async () => json({ lighthouseResult: { categories: { performance: { score: 0.42 } }, audits: { 'largest-contentful-paint': { numericValue: 4100 } } } }) });
  assert.equal(db.prepare('SELECT score FROM speed_results').get().score, 42);
  assert.ok(g.pulse(db, settings.getSetting).todo.some(t => /slow on phones/.test(t.text)));
  await g.checkSpeed({ db, ...settings, urls: ['https://letterhome.ca/'], now: () => new Date(Date.now() + 1000), fetchImpl: async u => { throw new Error(u); } });
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM speed_results').all()).includes('kkkk'));
});

test('Analytics totals are read for this week and the week before', async () => {
  const fetchImpl = async (url, opts) => {
    if (url.includes('oauth2')) return json({ access_token: 't' });
    return JSON.parse(opts.body).dimensions
      ? json({ rows: [{ dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '9' }] }] })
      : json({ rows: [{ dimensionValues: [{ value: 'date_range_1' }], metricValues: [{ value: '3' }] }, { dimensionValues: [{ value: 'date_range_0' }], metricValues: [{ value: '5' }] }] });
  };
  const a = await g.analytics({ ...settings, fetchImpl });
  assert.deepEqual([a.properties[0].week, a.properties[0].before, a.properties[0].channels[0].sessions], [[5], [3], 9]);
});
