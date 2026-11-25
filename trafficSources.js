'use strict';

// Where visitors come from, worked out from our own page-view log (no cookies, no outside service).
//   classify()      turns a referrer host and a utm_source tag into one of a few plain source names
//   botName()       recognises crawlers from the user-agent so they are kept out of the visitor numbers
//   sourceForIp()   the source a visitor first arrived with, used to tag an order when it is placed
//   register()      the admin Traffic screen's data

const AI_HOSTS = /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|you\.com|phind\.com|poe\.com|meta\.ai|grok\.com|kagi\.com|duck\.ai)$/;
const AI_TAGS = /(chatgpt|openai|perplexity|claude|gemini|copilot|anthropic|grok|poe\.com)/;
const SEARCH_OTHER = /(^|\.)(duckduckgo\.com|ecosia\.org|yahoo\.com|yandex\.[a-z.]+|baidu\.com|brave\.com|startpage\.com|qwant\.com|naver\.com|seznam\.cz)$/;
const SOCIAL = /(^|\.)(facebook\.com|fb\.com|instagram\.com|t\.co|twitter\.com|x\.com|reddit\.com|linkedin\.com|lnkd\.in|pinterest\.[a-z.]+|tiktok\.com|youtube\.com|youtu\.be|whatsapp\.com|wa\.me|telegram\.org|t\.me|quora\.com|medium\.com)$/;

const SOURCE_LABELS = {
  ai: 'AI assistants',
  google: 'Google',
  bing: 'Bing',
  search: 'Other search',
  social: 'Social and forums',
  email: 'Email',
  site: 'Other websites',
  direct: 'Direct or unknown',
};

function classify(host, utm) {
  const tag = String(utm || '').toLowerCase();
  const h = String(host || '').toLowerCase();
  if (tag) {
    if (AI_TAGS.test(tag)) return 'ai';
    if (/(newsletter|email|mailchimp|resume)/.test(tag)) return 'email';
    if (/^google/.test(tag)) return 'google';
    if (/^bing/.test(tag)) return 'bing';
  }
  if (!h) return 'direct';
  if (AI_HOSTS.test(h)) return 'ai';
  if (/(^|\.)google\.[a-z.]+$/.test(h)) return 'google';
  if (/(^|\.)bing\.com$/.test(h)) return 'bing';
  if (SEARCH_OTHER.test(h)) return 'search';
  if (SOCIAL.test(h)) return 'social';
  if (/(^|\.)stripe\.com$/.test(h)) return 'direct';   // the customer coming back from checkout is not a new source
  return 'site';
}

// A crawler's name, or '' for a person. AI crawlers are named separately because their hits show which pages an
// assistant reads when it answers a question about us.
const BOTS = [
  [/ChatGPT-User/i, 'ChatGPT (reading a page for a user)'],
  [/OAI-SearchBot/i, 'OpenAI search'],
  [/GPTBot/i, 'OpenAI training'],
  [/PerplexityBot|Perplexity-User/i, 'Perplexity'],
  [/ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai/i, 'Claude'],
  [/Google-Extended|GoogleOther/i, 'Google AI'],
  [/Googlebot/i, 'Googlebot'],
  [/bingbot|BingPreview/i, 'Bingbot'],
  [/Applebot/i, 'Applebot'],
  [/DuckDuckBot/i, 'DuckDuckGo'],
  [/YandexBot|Baiduspider|Bytespider|PetalBot|SemrushBot|AhrefsBot|MJ12bot|DotBot|DataForSeoBot/i, 'SEO and other crawlers'],
  [/facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|Pinterestbot/i, 'Link previews'],
  [/HeadlessChrome|PhantomJS|Puppeteer|Playwright|Lighthouse/i, 'Headless browsers'],
  [/curl\/|wget\/|python-requests|python-urllib|aiohttp|Go-http-client|okhttp|libwww|node-fetch|axios\/|Java\/|Scrapy|httpx/i, 'Scripts'],
  [/bot\b|crawler|spider|slurp|monitor|uptime|pingdom|scanner/i, 'Other bots'],
];
const AI_BOT = /ChatGPT|OpenAI|Perplexity|Claude|Google AI/;

function botName(ua) {
  const s = String(ua || '');
  if (!s) return 'No user-agent';
  for (const [re, name] of BOTS) if (re.test(s)) return name;
  return '';
}
const isAiBot = name => AI_BOT.test(name || '');

function ensureSchema(db) {
  for (const sql of [
    'ALTER TABLE page_views ADD COLUMN source TEXT',
    'ALTER TABLE page_views ADD COLUMN bot_name TEXT',
    'ALTER TABLE orders ADD COLUMN traffic_source TEXT',
    'ALTER TABLE orders ADD COLUMN landing_path TEXT',
  ]) { try { db.exec(sql); } catch {} }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_page_views_source ON page_views(source)'); } catch {}
}

// Old rows only kept the referrer host, so they are sorted from that. Rows from before this feature have no
// user-agent, so they stay counted as people.
function backfill(db) {
  try {
    const hosts = db.prepare("SELECT DISTINCT COALESCE(referrer, '') AS r FROM page_views WHERE source IS NULL").all();
    const upd = db.prepare("UPDATE page_views SET source = ? WHERE source IS NULL AND COALESCE(referrer, '') = ?");
    for (const { r } of hosts) upd.run(classify(r, ''), r);
  } catch (e) { console.error('[traffic] backfill:', e.message); }
}

// The first page this visitor (by address) opened lately, used to tag an order with where it came from.
function sourceForIp(db, ip, days = 14) {
  if (!ip) return { source: 'direct', path: null };
  try {
    const r = db.prepare(
      `SELECT source, path FROM page_views WHERE ip = ? AND COALESCE(bot_name, '') = '' AND created_at >= datetime('now', ?)
       ORDER BY id LIMIT 1`).get(ip, `-${days} days`);
    return r ? { source: r.source || 'direct', path: r.path } : { source: 'direct', path: null };
  } catch { return { source: 'direct', path: null }; }
}

function register(app, { db, requireAdmin }) {
  ensureSchema(db);
  backfill(db);

  app.get('/api/admin/traffic', requireAdmin, (req, res) => {
    try {
      const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
      const site = ['ca', 'us', 'uk'].includes(req.query.site) ? req.query.site : 'all';
      const pv = site === 'all' ? '' : ` AND COALESCE(NULLIF(NULLIF(site, ''), 'au'), 'ca') = '${site}'`;
      const ord = site === 'all' ? '' : ` AND COALESCE(NULLIF(order_site, ''), 'ca') = '${site}'`;
      const win = `-${days} days`;

      // One row per visitor: the first page they opened in the period, and how they got there.
      const first = db.prepare(
        `SELECT source, path FROM (
           SELECT COALESCE(source, 'direct') AS source, path,
                  ROW_NUMBER() OVER (PARTITION BY ip ORDER BY id) AS n
           FROM page_views
           WHERE ip IS NOT NULL AND ip != '' AND COALESCE(bot_name, '') = '' AND created_at >= datetime('now', ?)${pv}
         ) WHERE n = 1`).all(win);

      const bySource = {};
      const landing = {};
      for (const r of first) {
        bySource[r.source] = bySource[r.source] || { source: r.source, visitors: 0, orders: 0, revenue_cents: 0 };
        bySource[r.source].visitors++;
        const l = landing[r.source] = landing[r.source] || {};
        l[r.path] = (l[r.path] || 0) + 1;
      }

      const orders = db.prepare(
        `SELECT COALESCE(NULLIF(traffic_source, ''), 'unknown') AS source, COUNT(*) AS n, COALESCE(SUM(price_cents), 0) AS cents
         FROM orders WHERE status != 'awaiting_payment' AND deleted_at IS NULL AND split_from IS NULL
           AND created_at >= datetime('now', ?)${ord} GROUP BY 1`).all(win);
      let untagged = 0;
      for (const o of orders) {
        if (o.source === 'unknown') { untagged += o.n; continue; }
        bySource[o.source] = bySource[o.source] || { source: o.source, visitors: 0, orders: 0, revenue_cents: 0 };
        bySource[o.source].orders += o.n;
        bySource[o.source].revenue_cents += o.cents;
      }

      const sources = Object.values(bySource).map(s => ({ ...s, label: SOURCE_LABELS[s.source] || s.source }))
        .sort((a, b) => b.visitors - a.visitors);
      const landingTop = {};
      for (const [s, m] of Object.entries(landing)) {
        landingTop[s] = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, visitors]) => ({ path, visitors }));
      }

      const totals = db.prepare(
        `SELECT SUM(CASE WHEN COALESCE(bot_name, '') = '' THEN 1 ELSE 0 END) AS people, SUM(CASE WHEN COALESCE(bot_name, '') != '' THEN 1 ELSE 0 END) AS bots
         FROM page_views WHERE created_at >= datetime('now', ?)${pv}`).get(win);

      // What the crawlers read. The AI ones show which pages an assistant pulls up when it answers about us.
      const crawlerRows = db.prepare(
        `SELECT bot_name AS bot, path, COUNT(*) AS hits FROM page_views
         WHERE COALESCE(bot_name, '') != '' AND created_at >= datetime('now', ?)${pv} GROUP BY bot_name, path`).all(win);
      const crawlers = {};
      for (const r of crawlerRows) {
        const c = crawlers[r.bot] = crawlers[r.bot] || { bot: r.bot, ai: isAiBot(r.bot), hits: 0, pages: [] };
        c.hits += r.hits; c.pages.push({ path: r.path, hits: r.hits });
      }
      const crawlerList = Object.values(crawlers).map(c => ({ ...c, pages: c.pages.sort((a, b) => b.hits - a.hits).slice(0, 6) }))
        .sort((a, b) => (b.ai - a.ai) || (b.hits - a.hits));

      const recentAi = db.prepare(
        `SELECT path, country_name, referrer, created_at FROM page_views
         WHERE COALESCE(bot_name, '') = '' AND source = 'ai' AND created_at >= datetime('now', ?)${pv} ORDER BY id DESC LIMIT 15`).all(win);

      // Which first page led to paid orders, and what customers say when asked after paying.
      const paid = `status != 'awaiting_payment' AND deleted_at IS NULL AND split_from IS NULL AND created_at >= datetime('now', ?)${ord}`;
      const byPath = {};
      const page = path => (byPath[path] = byPath[path] || { path, visitors: 0, orders: 0, revenue_cents: 0 });
      for (const r of first) page(r.path).visitors++;
      for (const o of db.prepare(`SELECT landing_path AS path, COUNT(*) AS n, COALESCE(SUM(price_cents), 0) AS cents
          FROM orders WHERE ${paid} AND COALESCE(landing_path, '') != '' GROUP BY landing_path`).all(win)) {
        Object.assign(page(o.path), { orders: o.n, revenue_cents: o.cents });
      }
      const pages = Object.values(byPath).sort((a, b) => b.orders - a.orders || b.revenue_cents - a.revenue_cents || b.visitors - a.visitors).slice(0, 25);
      let heard = [];
      try {
        heard = db.prepare(`SELECT heard_from AS source, COUNT(*) AS n FROM orders WHERE ${paid} AND heard_from IS NOT NULL GROUP BY heard_from ORDER BY n DESC`).all(win)
          .map(h => ({ ...h, label: require('./tracking').HEARD_FROM[h.source] || h.source }));
      } catch {}

      res.json({
        days, site, pages, heard, sources, landing: landingTop, untagged_orders: untagged,
        people_views: totals.people || 0, bot_views: totals.bots || 0,
        crawlers: crawlerList, recent_ai: recentAi,
        since: db.prepare("SELECT MIN(created_at) AS t FROM page_views WHERE source IS NOT NULL AND bot_name IS NOT NULL").get().t,
      });
    } catch (e) {
      console.error('[traffic]', e.message);
      res.status(500).json({ error: 'Could not load traffic.' });
    }
  });
}

module.exports = { classify, botName, isAiBot, sourceForIp, ensureSchema, register, SOURCE_LABELS };
