// Google Search Console weekly report — pulls top queries, pages, and content gaps.
// Creates a GitHub Issue with actionable content briefs.
const https = require('https');

const SITE = 'sc-domain:letterhome.ca';

function getAccessToken() {
  return new Promise(resolve => {
    const body = new URLSearchParams({
      client_id:     process.env.GSC_CLIENT_ID,
      client_secret: process.env.GSC_CLIENT_SECRET,
      refresh_token: process.env.GSC_REFRESH_TOKEN,
      grant_type:    'refresh_token'
    }).toString();

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const json = JSON.parse(d);
        if (json.error) { console.error('Token error:', json.error_description); resolve(null); return; }
        resolve(json.access_token);
      });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

function gscQuery(token, payload) {
  return new Promise(resolve => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'searchconsole.googleapis.com',
      path: `/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
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
    const payload = JSON.stringify({ title, body, labels: ['gsc', 'content-brief'] });
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

// Date helpers
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

(async () => {
  const accessToken = await getAccessToken();
  if (!accessToken) { console.error('Could not get access token'); process.exit(1); }

  const startDate = daysAgo(28);
  const endDate   = daysAgo(3); // GSC has ~3 day lag

  // 1. Top queries by clicks
  const topQueries = await gscQuery(accessToken, {
    startDate, endDate,
    dimensions: ['query'],
    rowLimit: 25,
    orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }]
  });

  // 2. Top pages by clicks
  const topPages = await gscQuery(accessToken, {
    startDate, endDate,
    dimensions: ['page'],
    rowLimit: 15,
    orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }]
  });

  // 3. High-impression, low-click queries (position 4-20 = quick wins)
  const quickWins = await gscQuery(accessToken, {
    startDate, endDate,
    dimensions: ['query'],
    rowLimit: 50,
    dimensionFilterGroups: [{
      filters: [{
        dimension: 'query',
        operator: 'notContains',
        expression: 'letterhome'
      }]
    }]
  });

  const wins = (quickWins?.rows || [])
    .filter(r => r.position >= 4 && r.position <= 20 && r.impressions >= 5)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  // 4. New queries this week vs last week (compare periods)
  const thisWeek = await gscQuery(accessToken, {
    startDate: daysAgo(10),
    endDate:   daysAgo(3),
    dimensions: ['query'],
    rowLimit: 100
  });
  const lastWeek = await gscQuery(accessToken, {
    startDate: daysAgo(17),
    endDate:   daysAgo(10),
    dimensions: ['query'],
    rowLimit: 100
  });

  const lastWeekSet = new Set((lastWeek?.rows || []).map(r => r.keys[0]));
  const newQueries  = (thisWeek?.rows || [])
    .filter(r => !lastWeekSet.has(r.keys[0]) && r.impressions >= 3)
    .slice(0, 10);

  // Build report
  const queryRows = (topQueries?.rows || []).map(r =>
    `| ${r.keys[0]} | ${r.clicks} | ${r.impressions} | ${r.position.toFixed(1)} | ${(r.ctr * 100).toFixed(1)}% |`
  ).join('\n') || '*No data*';

  const pageRows = (topPages?.rows || []).map(r => {
    const slug = r.keys[0].replace('https://letterhome.ca', '') || '/';
    return `| ${slug} | ${r.clicks} | ${r.impressions} | ${r.position.toFixed(1)} |`;
  }).join('\n') || '*No data*';

  const winsRows = wins.map(r =>
    `| **${r.keys[0]}** | ${r.impressions} | ${r.position.toFixed(1)} | ${r.clicks} | Optimize for position ${Math.round(r.position)} → top 3 |`
  ).join('\n') || '*None this week*';

  const newQueryList = newQueries.map(r =>
    `- **"${r.keys[0]}"** — ${r.impressions} impressions (new this week)`
  ).join('\n') || '*No new queries*';

  const issueBody = `## GSC Weekly Report — ${endDate}\n*(${startDate} → ${endDate})*\n\n` +

    `### Top queries by clicks\n` +
    `| Query | Clicks | Impressions | Avg Position | CTR |\n` +
    `|-------|--------|-------------|--------------|-----|\n${queryRows}\n\n` +

    `### Top pages by clicks\n` +
    `| Page | Clicks | Impressions | Avg Position |\n` +
    `|------|--------|-------------|---------------|\n${pageRows}\n\n` +

    `### Quick wins — ranking 4–20 with impressions (easy to move up)\n` +
    `| Query | Impressions | Position | Clicks | Action |\n` +
    `|-------|-------------|----------|--------|--------|\n${winsRows}\n\n` +

    `### New queries appearing this week\n${newQueryList}\n\n` +

    `---\n*To action quick wins: open the page, add the exact query phrase as an H2, strengthen the intro, add it to the FAQPage schema.*\n\n` +
    `*Generated every Monday from Google Search Console*`;

  const ghToken = process.env.GITHUB_TOKEN;
  const repo    = process.env.REPO;
  if (ghToken && repo) {
    await createIssue(ghToken, repo,
      `GSC weekly report — ${endDate} (${(topQueries?.rows || []).reduce((s, r) => s + r.clicks, 0)} clicks)`,
      issueBody
    );
  } else {
    console.log(issueBody);
  }
})();
