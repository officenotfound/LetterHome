// Bing Webmaster Tools weekly report — pulls top queries and pages from Bing.
// Creates a GitHub Issue with the data.
const https = require('https');

const SITE    = 'https://letterhome.ca/';
const API_KEY = process.env.BING_API_KEY;

function bingGet(endpoint, params = {}) {
  return new Promise(resolve => {
    const qs = new URLSearchParams({ apikey: API_KEY, siteUrl: SITE, ...params }).toString();
    const req = https.get({
      hostname: 'ssl.bing.com',
      path: `/webmaster/api.svc/json/${endpoint}?${qs}`,
      headers: { 'User-Agent': 'Letterhome-BingMonitor/1.0' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
  });
}

function dateStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function createIssue(token, repo, title, body) {
  return new Promise(resolve => {
    const payload = JSON.stringify({ title, body, labels: ['bing', 'seo-report'] });
    const [owner, name] = repo.split('/');
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${owner}/${name}/issues`,
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Letterhome-Bot',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { console.log('Issue:', JSON.parse(d).html_url); resolve(); });
    });
    req.on('error', e => { console.error(e.message); resolve(); });
    req.write(payload);
    req.end();
  });
}

(async () => {
  if (!API_KEY) { console.error('BING_API_KEY not set'); process.exit(1); }

  const startDate = dateStr(30);
  const endDate   = dateStr(2);

  // Top queries
  const queryData = await bingGet('GetKeywordStats', { startDate, endDate, language: 'en-US' });
  // Top pages
  const pageData  = await bingGet('GetPageStats', { startDate, endDate });
  // Crawl stats
  const crawlData = await bingGet('GetCrawlStats', { startDate, endDate });

  const queries = queryData?.d?.results || queryData?.d || [];
  const pages   = pageData?.d?.results  || pageData?.d  || [];
  const crawl   = crawlData?.d || {};

  console.log(`Queries: ${queries.length}, Pages: ${pages.length}`);

  const queryRows = queries.slice(0, 20).map(r =>
    `| ${r.Query || r.query || '-'} | ${r.Clicks || r.clicks || 0} | ${r.Impressions || r.impressions || 0} | ${(r.Position || r.position || 0).toFixed ? (r.Position || r.position || 0).toFixed(1) : '-'} |`
  ).join('\n') || '*No query data yet — Bing may need more crawl time*';

  const pageRows = pages.slice(0, 15).map(r => {
    const url = (r.Url || r.url || '').replace('https://letterhome.ca', '') || '/';
    return `| ${url} | ${r.Clicks || r.clicks || 0} | ${r.Impressions || r.impressions || 0} |`;
  }).join('\n') || '*No page data yet*';

  const crawlSummary = crawl.AllCrawledUrls
    ? `Crawled: ${crawl.AllCrawledUrls} URLs · Errors: ${crawl.CrawlErrors || 0} · Blocked: ${crawl.CrawlBlockedByRobotsTxt || 0}`
    : '*Crawl data unavailable*';

  const issueBody = `## Bing Webmaster Tools Report — ${endDate}\n*(${startDate} → ${endDate})*\n\n` +
    `### Crawl summary\n${crawlSummary}\n\n` +
    `### Top queries on Bing\n` +
    `| Query | Clicks | Impressions | Avg Position |\n` +
    `|-------|--------|-------------|---------------|\n${queryRows}\n\n` +
    `### Top pages on Bing\n` +
    `| Page | Clicks | Impressions |\n` +
    `|------|--------|-------------|\n${pageRows}\n\n` +
    `*Generated every Monday from Bing Webmaster Tools API*`;

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.REPO;
  if (token && repo) {
    await createIssue(token, repo,
      `Bing report — ${endDate} (${queries.reduce((s,r) => s+(r.Clicks||r.clicks||0), 0)} clicks)`,
      issueBody
    );
  } else {
    console.log(issueBody);
  }
})();
