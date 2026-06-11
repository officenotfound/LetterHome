// Cloudflare Analytics weekly report — real visitor data, top pages, bandwidth.
// Creates a GitHub Issue with the digest.
const https = require('https');

const ZONE_ID = '92713c53e4f6d0c2a2bd32821d723556';

function cfQuery(query) {
  return new Promise(resolve => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path: '/client/v4/graphql',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

function createIssue(token, repo, title, body) {
  return new Promise(resolve => {
    const payload = JSON.stringify({ title, body, labels: ['analytics', 'cloudflare'] });
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

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

(async () => {
  const since = daysAgo(7);
  const until = daysAgo(0);

  // Overall traffic summary
  const summary = await cfQuery(`{
    viewer {
      zones(filter: { zoneTag: "${ZONE_ID}" }) {
        httpRequests1dGroups(
          limit: 7
          filter: { date_geq: "${since}", date_leq: "${until}" }
          orderBy: [date_ASC]
        ) {
          date: dimensions { date }
          sum { requests pageViews bytes cachedRequests threats }
          uniq { uniques }
        }
      }
    }
  }`);

  // Top pages by requests
  const topPages = await cfQuery(`{
    viewer {
      zones(filter: { zoneTag: "${ZONE_ID}" }) {
        httpRequestsAdaptiveGroups(
          limit: 15
          filter: {
            date_geq: "${since}"
            date_leq: "${until}"
            requestSource: "eyeball"
          }
          orderBy: [count_DESC]
        ) {
          count
          dimensions { clientRequestPath }
        }
      }
    }
  }`);

  // Top countries
  const topCountries = await cfQuery(`{
    viewer {
      zones(filter: { zoneTag: "${ZONE_ID}" }) {
        httpRequestsAdaptiveGroups(
          limit: 10
          filter: {
            date_geq: "${since}"
            date_leq: "${until}"
            requestSource: "eyeball"
          }
          orderBy: [count_DESC]
        ) {
          count
          dimensions { clientCountryName }
        }
      }
    }
  }`);

  const days   = summary?.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
  const pages  = topPages?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
  const countries = topCountries?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];

  // Aggregate totals
  const totals = days.reduce((acc, d) => ({
    requests:  acc.requests  + (d.sum?.requests || 0),
    pageViews: acc.pageViews + (d.sum?.pageViews || 0),
    uniques:   acc.uniques   + (d.uniq?.uniques || 0),
    threats:   acc.threats   + (d.sum?.threats || 0),
    bytes:     acc.bytes     + (d.sum?.bytes || 0),
    cached:    acc.cached    + (d.sum?.cachedRequests || 0),
  }), { requests: 0, pageViews: 0, uniques: 0, threats: 0, bytes: 0, cached: 0 });

  const mb          = (totals.bytes / 1024 / 1024).toFixed(1);
  const cacheRate   = totals.requests ? ((totals.cached / totals.requests) * 100).toFixed(1) : 0;

  const dayRows = days.map(d =>
    `| ${d.date?.date} | ${d.sum?.requests || 0} | ${d.uniq?.uniques || 0} | ${d.sum?.pageViews || 0} |`
  ).join('\n') || '*No data*';

  // Dedupe pages (group by path)
  const pageMap = {};
  for (const p of pages) {
    const path = p.dimensions?.clientRequestPath || '/';
    if (path.match(/\.(js|css|png|jpg|ico|woff|svg|txt|xml)$/i)) continue;
    pageMap[path] = (pageMap[path] || 0) + p.count;
  }
  const pageRows = Object.entries(pageMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => `| ${path} | ${count} |`)
    .join('\n') || '*No data*';

  // Dedupe countries
  const countryMap = {};
  for (const c of countries) {
    const name = c.dimensions?.clientCountryName || 'Unknown';
    countryMap[name] = (countryMap[name] || 0) + c.count;
  }
  const countryRows = Object.entries(countryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => `| ${name} | ${count} |`)
    .join('\n') || '*No data*';

  const issueBody = `## Cloudflare Analytics — ${since} → ${until}\n\n` +
    `### Weekly totals\n` +
    `| Metric | Value |\n|--------|-------|\n` +
    `| Total requests | ${totals.requests.toLocaleString()} |\n` +
    `| Unique visitors | ${totals.uniques.toLocaleString()} |\n` +
    `| Page views | ${totals.pageViews.toLocaleString()} |\n` +
    `| Bandwidth served | ${mb} MB |\n` +
    `| Cache hit rate | ${cacheRate}% |\n` +
    `| Threats blocked | ${totals.threats} |\n\n` +
    `### Daily breakdown\n` +
    `| Date | Requests | Uniques | Page Views |\n|------|----------|---------|------------|\n${dayRows}\n\n` +
    `### Top pages\n` +
    `| Page | Requests |\n|------|----------|\n${pageRows}\n\n` +
    `### Top countries\n` +
    `| Country | Requests |\n|---------|----------|\n${countryRows}\n\n` +
    `*Generated every Monday from Cloudflare Analytics*`;

  console.log(`Totals: ${totals.requests} requests, ${totals.uniques} uniques`);

  const ghToken = process.env.GITHUB_TOKEN;
  const repo    = process.env.REPO;
  if (ghToken && repo) {
    await createIssue(ghToken, repo,
      `Cloudflare analytics — w/e ${until} (${totals.uniques.toLocaleString()} unique visitors)`,
      issueBody
    );
  } else {
    console.log(issueBody);
  }
})();
