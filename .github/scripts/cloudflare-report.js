// Cloudflare Analytics weekly report — real visitor/request data.
// Uses Cloudflare GraphQL Analytics API.
// Creates a GitHub Issue with the week's traffic summary.
const https = require('https');

const ZONE_ID = process.env.CF_ZONE_ID;
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function cfGraphQL(query) {
  return new Promise(resolve => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path: '/client/v4/graphql',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Letterhome-CFMonitor/1.0',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(20000, () => { req.destroy(); resolve(null); });
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

(async () => {
  if (!ZONE_ID || !CF_TOKEN) { console.error('CF_ZONE_ID or CLOUDFLARE_API_TOKEN not set'); process.exit(1); }

  const startDate = daysAgo(8);
  const endDate   = daysAgo(1);

  // Daily totals for the past week
  const dailyQuery = `{
    viewer {
      zones(filter: { zoneTag: "${ZONE_ID}" }) {
        httpRequests1dGroups(
          limit: 8
          filter: { date_geq: "${startDate}", date_leq: "${endDate}" }
          orderBy: [date_ASC]
        ) {
          dimensions { date }
          sum { requests pageViews bytes cachedRequests }
          uniq { uniques }
        }
      }
    }
  }`;

  // Top pages for the past week
  const topPathsQuery = `{
    viewer {
      zones(filter: { zoneTag: "${ZONE_ID}" }) {
        httpRequests1dGroups(
          limit: 1
          filter: { date_geq: "${startDate}", date_leq: "${endDate}" }
        ) {
          sum {
            requests
            pageViews
            bytes
          }
          uniq { uniques }
        }
      }
    }
  }`;

  // Top countries
  const countryQuery = `{
    viewer {
      zones(filter: { zoneTag: "${ZONE_ID}" }) {
        httpRequests1dGroups(
          limit: 1
          filter: { date_geq: "${startDate}", date_leq: "${endDate}" }
        ) {
          sum {
            countryMap {
              clientCountryName
              requests
              threats
            }
          }
        }
      }
    }
  }`;

  const [dailyData, countryData] = await Promise.all([
    cfGraphQL(dailyQuery),
    cfGraphQL(countryQuery)
  ]);

  const dailyGroups = dailyData?.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
  const countryGroups = countryData?.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];

  // Aggregate totals
  let totalRequests = 0, totalPageViews = 0, totalUniques = 0, totalBytes = 0, totalCached = 0;
  for (const g of dailyGroups) {
    totalRequests  += g.sum?.requests || 0;
    totalPageViews += g.sum?.pageViews || 0;
    totalUniques   += g.uniq?.uniques || 0;
    totalBytes     += g.sum?.bytes || 0;
    totalCached    += g.sum?.cachedRequests || 0;
  }

  const cacheRate = totalRequests > 0 ? ((totalCached / totalRequests) * 100).toFixed(1) : '0';
  const mbServed  = (totalBytes / 1024 / 1024).toFixed(1);

  // Daily table
  const dailyRows = dailyGroups.map(g =>
    `| ${g.dimensions.date} | ${(g.uniq?.uniques || 0).toLocaleString()} | ${(g.sum?.pageViews || 0).toLocaleString()} | ${(g.sum?.requests || 0).toLocaleString()} |`
  ).join('\n') || '*No daily data*';

  // Top countries
  const countryMap = countryGroups[0]?.sum?.countryMap || [];
  const topCountries = [...countryMap]
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 10)
    .map(c => `| ${c.clientCountryName} | ${c.requests.toLocaleString()} |`)
    .join('\n') || '*No country data*';

  const issueBody = `## Cloudflare Analytics — week of ${startDate}\n\n` +
    `### Summary\n` +
    `| Metric | Value |\n|--------|-------|\n` +
    `| Unique visitors | ${totalUniques.toLocaleString()} |\n` +
    `| Page views | ${totalPageViews.toLocaleString()} |\n` +
    `| Total requests | ${totalRequests.toLocaleString()} |\n` +
    `| Cache rate | ${cacheRate}% |\n` +
    `| Bandwidth served | ${mbServed} MB |\n\n` +
    `### Daily breakdown\n` +
    `| Date | Uniques | Page Views | Requests |\n|------|---------|------------|----------|\n${dailyRows}\n\n` +
    `### Top countries\n` +
    `| Country | Requests |\n|---------|----------|\n${topCountries}\n\n` +
    `*Generated every Monday from Cloudflare Analytics*`;

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.REPO;
  if (token && repo) {
    await createIssue(token, repo,
      `Cloudflare analytics — week of ${startDate} (${totalUniques.toLocaleString()} uniques)`,
      issueBody
    );
  } else {
    console.log(issueBody);
  }
})();
