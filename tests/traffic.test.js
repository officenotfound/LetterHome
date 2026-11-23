'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `lh-traffic-${randomUUID()}.db`);

const express = require('express');
const db = require('../db');
const traffic = require('../trafficSources');

test('classify: AI assistants, search engines, social and direct are told apart', () => {
  assert.equal(traffic.classify('chatgpt.com', ''), 'ai');
  assert.equal(traffic.classify('', 'chatgpt.com'), 'ai', 'the utm_source tag ChatGPT adds counts even with no referrer');
  assert.equal(traffic.classify('', 'perplexity'), 'ai');
  assert.equal(traffic.classify('www.perplexity.ai', ''), 'ai');
  assert.equal(traffic.classify('claude.ai', ''), 'ai');
  assert.equal(traffic.classify('gemini.google.com', ''), 'ai', 'Gemini is an assistant, not Google search');
  assert.equal(traffic.classify('www.google.com', ''), 'google');
  assert.equal(traffic.classify('www.google.co.uk', ''), 'google');
  assert.equal(traffic.classify('www.bing.com', ''), 'bing');
  assert.equal(traffic.classify('ecosia.org', ''), 'search');
  assert.equal(traffic.classify('duckduckgo.com', ''), 'search');
  assert.equal(traffic.classify('l.facebook.com', ''), 'social');
  assert.equal(traffic.classify('www.reddit.com', ''), 'social');
  assert.equal(traffic.classify('someblog.example', ''), 'site');
  assert.equal(traffic.classify('checkout.stripe.com', ''), 'direct', 'returning from checkout is not a source');
  assert.equal(traffic.classify('', ''), 'direct');
  assert.equal(traffic.classify('notchatgpt.com.evil.example', ''), 'site', 'a lookalike host is not an AI assistant');
});

test('botName: crawlers are named, people are not, AI crawlers are flagged', () => {
  const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  assert.equal(traffic.botName(chrome), '');
  assert.equal(traffic.botName(iphone), '');
  assert.match(traffic.botName('Mozilla/5.0 AppleWebKit/537.36 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)'), /ChatGPT/);
  assert.equal(traffic.botName('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), 'Googlebot');
  assert.equal(traffic.botName('curl/8.4.0'), 'Scripts');
  assert.equal(traffic.botName(''), 'No user-agent');
  assert.ok(traffic.isAiBot(traffic.botName('Mozilla/5.0 (compatible; PerplexityBot/1.0)')));
  assert.ok(!traffic.isAiBot(traffic.botName('Mozilla/5.0 (compatible; Googlebot/2.1)')));
});

let server, base;
before(async () => {
  traffic.ensureSchema(db);
  const app = express();
  traffic.register(app, { db, requireAdmin: (req, res, next) => next() });
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server && server.close(); });

const view = (ip, p, source, bot = '', site = 'ca') =>
  db.prepare('INSERT INTO page_views (path, ip, referrer, site, source, bot_name, country_name) VALUES (?,?,?,?,?,?,?)').run(p, ip, '', site, source, bot, 'Canada');

test('traffic screen: visitors counted once by first page, crawlers left out, orders joined by source', async () => {
  // Visitor A arrives from ChatGPT, then clicks around inside the site (those later views read as direct).
  view('1.1.1.1', '/how-to-mail-a-letter', 'ai'); view('1.1.1.1', '/send', 'direct'); view('1.1.1.1', '/send', 'direct');
  view('2.2.2.2', '/', 'google');
  view('3.3.3.3', '/', 'direct');
  view('4.4.4.4', '/guide', 'ai');
  view('9.9.9.9', '/how-to-mail-a-letter', 'ai', 'ChatGPT (reading a page for a user)');
  view('9.9.9.9', '/how-to-mail-a-letter', 'ai', 'ChatGPT (reading a page for a user)');
  view('8.8.8.8', '/', 'direct', 'Googlebot');

  const mk = (email, src, price, status = 'paid', extra = '') => db.prepare(
    `INSERT INTO orders (customer_email, recipient_name, recipient_street, recipient_city, recipient_postal, destination_country, price_cents, status, traffic_source, status_token${extra ? ', split_from' : ''}) VALUES (?,?,?,?,?,?,?,?,?,?${extra ? ',?' : ''})`
  ).run(...[email, 'R', '1 St', 'Halifax', 'B3H 2L6', 'CA', price, status, src, randomUUID()].concat(extra ? [extra] : []));
  mk('a@x.test', 'ai', 600);
  mk('b@x.test', 'google', 600);
  mk('c@x.test', null, 900);                       // placed before tagging started
  mk('d@x.test', 'ai', 600, 'awaiting_payment');   // never paid
  const parent = mk('e@x.test', 'direct', 1200).lastInsertRowid;
  mk('e@x.test', 'direct', 0, 'paid', parent);     // a split order is not counted again

  const t = await (await fetch(`${base}/api/admin/traffic?days=30`)).json();
  const by = Object.fromEntries(t.sources.map(s => [s.source, s]));
  assert.equal(by.ai.visitors, 2, 'two people arrived from an AI assistant');
  assert.equal(by.google.visitors, 1);
  assert.equal(by.direct.visitors, 1, 'later clicks inside the site do not make a visitor direct');
  assert.equal(by.ai.orders, 1, 'unpaid order not counted');
  assert.equal(by.ai.revenue_cents, 600);
  assert.equal(by.direct.orders, 1, 'split order not counted');
  assert.equal(t.untagged_orders, 1);
  assert.equal(t.bot_views, 3);
  const chat = t.crawlers.find(c => /ChatGPT/.test(c.bot));
  assert.ok(chat && chat.ai && chat.hits === 2);
  assert.equal(chat.pages[0].path, '/how-to-mail-a-letter');
  assert.deepEqual(t.landing.ai.map(l => l.path).sort(), ['/guide', '/how-to-mail-a-letter']);
  assert.equal(t.recent_ai.length, 2, 'two arrivals from an AI assistant, none from crawlers');
});

test('sourceForIp: an order is tagged with the visitor\'s first source, crawlers ignored, unknown is direct', () => {
  view('5.5.5.5', '/x', 'direct', 'Scripts');
  view('5.5.5.5', '/landing', 'ai'); view('5.5.5.5', '/send', 'direct');
  const s = traffic.sourceForIp(db, '5.5.5.5');
  assert.equal(s.source, 'ai'); assert.equal(s.path, '/landing');
  assert.deepEqual(traffic.sourceForIp(db, '6.6.6.6'), { source: 'direct', path: null });
  assert.deepEqual(traffic.sourceForIp(db, ''), { source: 'direct', path: null });
});

test('backfill: old page views get a source from their referrer', () => {
  db.prepare("INSERT INTO page_views (path, ip, referrer, site) VALUES ('/old', '7.7.7.7', 'www.bing.com', 'ca')").run();
  db.prepare("INSERT INTO page_views (path, ip, referrer, site) VALUES ('/old2', '7.7.7.8', '', 'ca')").run();
  db.prepare("INSERT INTO page_views (path, ip, referrer, site) VALUES ('/old3', '7.7.7.9', 'chatgpt.com', 'ca')").run();
  // register() backfills on start; a second app start must fill the rows added since
  const app = express(); traffic.register(app, { db, requireAdmin: (q, r, n) => n() });
  const src = ip => db.prepare('SELECT source FROM page_views WHERE ip = ?').get(ip).source;
  assert.equal(src('7.7.7.7'), 'bing'); assert.equal(src('7.7.7.8'), 'direct'); assert.equal(src('7.7.7.9'), 'ai');
});
