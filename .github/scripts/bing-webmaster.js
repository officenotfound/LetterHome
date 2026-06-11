// Bing Webmaster Tools — weekly keyword + crawl report.
// Pulls top queries, crawl errors, and keyword suggestions.
// Creates a GitHub Issue with the digest.
const https = require('https');

const SITE = 'https://letterhome.ca/';

function bingGet(path) {
  return new Promise(resolve => {
    const key = process.env.BING_API_KEY;
    const req = https.get({
      hostname: 'ssl.bing.com',
      path: `/webmaster/api.svc/json/${path}&apikey=${key}`,
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
  const siteEncoded = encodeURIComponent(SITE);

  // Pull top pages by clicks (last 7 days)
  const trafficData = await bingGet(`GetPageStats?siteUrl=${siteEncoded}&page=0&pageSize=10`);
  const pages = trafficData?.d?.Results || [];

  // Pull top queries
  const queryData = await bingGet(`GetKeywordStats?siteUrl=${siteEncoded}&page=0&pageSize=20`);
  const queries = queryData?.d?.Results || [];

  // Pull crawl errors
  const crawlData = await bingGet(`GetCrawlStats?siteUrl=${siteEncoded}`);
  const crawl = crawlData?.d || {};

  // Pull keyword suggestions for main topic
  const suggestData = await bingGet(`GetRelatedKeywords?q=${encodeURIComponent('send letter canada')}&language=en-CA&siteUrl=${siteEncoded}&page=0&pageSize=15`);
  const suggestions = suggestData?.d?.Results || [];

  console.log(`Pages: ${pages.length}, Queries: ${queries.length}, Crawl errors: ${crawl.CrawlErrorsCount || 0}`);

  // Build issue body
  const topPagesRows = pages.length
    ? pages.slice(0, 10).map(p =>
        `| ${p.Clicks || 0} | ${p.Impressions || 0} | ${(p.AvgClickPosition || 0).toFixed(1)} | ${p.Url} |`
      ).join('\n')
    : '*No page data yet*';

  const topQueryRows = queries.length
    ? queries.slice(0, 15).map(q =>
        `| ${q.Query} | ${q.Clicks || 0} | ${q.Impressions || 0} | ${(q.AvgClickPosition || 0).toFixed(1)} |`
      ).join('\n')
    : '*No query data yet*';

  const suggestionList = suggestions.length
    ? suggestions.slice(0, 10).map(s =>
        `- **${s.Query}** — ${s.Impressions || 0} impressions/mo`
      ).join('\n')
    : '*No suggestions*';

  const crawlSection = `- Pages crawled: ${crawl.CrawledPageCount || 'n/a'}\n` +
    `- Crawl errors: ${crawl.CrawlErrorsCount || 0}\n` +
    `- DNS errors: ${crawl.DnsFailureCount || 0}\n` +
    `- Connection timeouts: ${crawl.ConnectionTimeoutCount || 0}`;

  const issueBody = `## Bing Webmaster Weekly Report — ${new Date().toISOString().split('T')[0]}\n\n` +
    `### Top pages (last 7 days)\n` +
    `| Clicks | Impressions | Avg Position | URL |\n` +
    `|--------|-------------|--------------|-----|\n${topPagesRows}\n\n` +
    `### Top queries\n` +
    `| Query | Clicks | Impressions | Avg Position |\n` +
    `|-------|--------|-------------|---------------|\n${topQueryRows}\n\n` +
    `### Crawl health\n${crawlSection}\n\n` +
    `### Keyword opportunities (Bing suggestions)\n${suggestionList}\n\n` +
    `*Generated every Monday by Bing Webmaster monitor*`;

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.REPO;
  if (token && repo) {
    await createIssue(token, repo,
      `Bing weekly report — ${new Date().toISOString().split('T')[0]}`,
      issueBody
    );
  } else {
    console.log(issueBody);
  }
})();
