'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `lh-content-${randomUUID()}.db`);

const express = require('express');
const db = require('../db');
const planner = require('../contentPlanner');

let server, base, api;
before(async () => {
  const app = express();
  app.use(express.json());
  api = planner.register(app, { db, requireAdmin: (q, r, n) => n(), logAudit: () => {}, getSetting: (k, d) => d, today: () => '2026-11-25' });   // a Wednesday
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); for (const f of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + f); } catch {} } });

const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const get = async p => (await fetch(base + p)).json();

test('weeks run Monday to Sunday', () => {
  assert.equal(planner.weekStart('2026-11-25'), '2026-11-23');
  assert.equal(planner.weekStart('2026-11-29'), '2026-11-23');
  assert.equal(planner.weekStart('2026-11-23'), '2026-11-23');
});

test('adds items, validates them, and shows them in their month', async () => {
  assert.equal((await post('/api/admin/content', { kind: 'nope', title: 'x' })).status, 400);
  assert.equal((await post('/api/admin/content', { kind: 'article', title: '' })).status, 400);
  assert.equal((await post('/api/admin/content', { kind: 'article', title: 'x', planned_date: '2026-13-45' })).status, 400);
  assert.equal((await post('/api/admin/content', { kind: 'article', title: 'Dining guide: Granada', planned_date: '2026-11-24', url: 'javascript:alert(1)' })).status, 200);
  const m = await get('/api/admin/content?month=2026-11');
  const it = m.items.find(i => i.title === 'Dining guide: Granada');
  assert.ok(it);
  assert.equal(it.url, '', 'only http and https links are kept');
  assert.ok(!(await get('/api/admin/content?month=2026-12')).items.some(i => i.title === 'Dining guide: Granada'));
});

test('repeat weekly creates one item per week, and a dateless item is an idea', async () => {
  const r = await (await post('/api/admin/content', { kind: 'outreach', title: 'Send 5 outreach emails', planned_date: '2026-11-26', repeat_weeks: 3 })).json();
  assert.equal(r.created, 4);
  const rows = db.prepare("SELECT planned_date FROM content_items WHERE title = 'Send 5 outreach emails' ORDER BY planned_date").all().map(x => x.planned_date);
  assert.deepEqual(rows, ['2026-11-26', '2026-12-03', '2026-12-10', '2026-12-17']);
  await post('/api/admin/content', { kind: 'social', title: 'Idea with no day' });
  assert.ok((await get('/api/admin/content?month=2026-11')).ideas.some(i => i.title === 'Idea with no day'));
});

test('weekly outreach count, overdue list, and marking done', async () => {
  const mk = async (title, date, status) => (await (await post('/api/admin/content', { kind: 'outreach', title, planned_date: date, status })).json()).id;
  const a = await mk('o1', '2026-11-24', 'drafted');
  await mk('o2', '2026-11-25', 'done');
  let s = (await get('/api/admin/content?month=2026-11')).summary;
  assert.equal(s.week_start, '2026-11-23');
  assert.equal(s.outreach_target, 5);
  assert.equal(s.outreach_done, 1);
  assert.ok(s.overdue.some(o => o.id === a), 'a past item that is not done is overdue');
  await post(`/api/admin/content/${a}`, { status: 'done' });
  s = (await get('/api/admin/content?month=2026-11')).summary;
  assert.equal(s.outreach_done, 2);
  assert.ok(!s.overdue.some(o => o.id === a));
  assert.ok((await get(`/api/admin/content/${a}`)).done_at, 'done time is recorded');
  assert.equal((await post(`/api/admin/content/${a}/delete`, {})).status, 200);
  assert.equal((await fetch(`${base}/api/admin/content/${a}`)).status, 404);
});

test('backlink log: validates, counts, keeps lost links out of the totals', async () => {
  assert.equal((await post('/api/admin/backlinks', { source_name: '' })).status, 400);
  const ok = await (await post('/api/admin/backlinks', { source_name: 'Newcomer Hub', source_url: 'https://hub.example/resources', target_page: '/tools/canadian-address-formatter', found_date: '2026-11-20', from_outreach: true })).json();
  assert.ok(ok.ok);
  const lost = await (await post('/api/admin/backlinks', { source_name: 'Old Blog', found_date: '2026-11-01', status: 'lost' })).json();
  const l = await get('/api/admin/backlinks');
  assert.equal(l.summary.links_total, 1);
  assert.equal(l.summary.links_from_outreach, 1);
  assert.equal(l.summary.links_30d, 1);
  assert.ok(l.links.some(x => x.id === lost.id), 'a lost link is still listed');
});

test('the Monday email lists overdue and upcoming work and new links', async () => {
  await post('/api/admin/content', { kind: 'article', title: 'Late article', planned_date: '2026-11-10', status: 'drafted' });
  const text = api.weeklyDigest();
  assert.match(text, /Outreach: \d+ of 5/);
  assert.match(text, /Overdue/);
  assert.match(text, /Newcomer Hub/);
  assert.match(text, /Admin: \/admin\/content/);
});
