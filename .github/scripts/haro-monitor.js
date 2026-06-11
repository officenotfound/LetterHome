// Monitors journalist query sources for Canada/immigration/postal topics.
// Sources: Reddit r/HelpAReporter + Google News RSS.
// Creates a GitHub Issue when matches are found.
const https = require('https');

const KEYWORDS = [
  'canada', 'canadian', 'immigration', 'mail', 'letter', 'postal',
  'expat', 'overseas', 'abroad', 'ircc', 'visa', 'international'
];

// Must match at least one of these to be considered journalist-relevant
const JOURNALIST_SIGNALS = [
  'journalist', 'writer', 'reporter', 'article', 'story', 'source',
  'expert', 'interview', 'publication', 'magazine', 'editor', 'haro',
  'seeking', 'looking for', 'deadline', 'pitch'
];

function fetchJSON(url) {
  return new Promise(resolve => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Letterhome-PRMonitor/1.0 (admin@letterhome.ca)' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

function fetchText(url) {
  return new Promise(resolve => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Letterhome-PRMonitor/1.0 (admin@letterhome.ca)' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', () => resolve(''));
    req.setTimeout(10000, () => { req.destroy(); resolve(''); });
  });
}

function createIssue(token, repo, title, body) {
  return new Promise(resolve => {
    const payload = JSON.stringify({ title, body, labels: ['haro', 'pr-opportunity'] });
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
    req.on('error', e => { console.error('GitHub error:', e.message); resolve(); });
    req.write(payload);
    req.end();
  });
}

(async () => {
  const matches = [];
  const sevenDaysAgo = Date.now() / 1000 - 7 * 86400;

  // Source 1: Reddit r/HelpAReporter
  const redditData = await fetchJSON(
    'https://www.reddit.com/r/HelpAReporter/new.json?limit=50'
  );
  if (redditData?.data?.children) {
    for (const { data: p } of redditData.data.children) {
      if (p.created_utc < sevenDaysAgo) continue;
      const text = `${p.title} ${p.selftext || ''}`.toLowerCase();
      const hasKw = KEYWORDS.some(k => text.includes(k));
      if (!hasKw) continue;
      const age = Math.round((Date.now() / 1000 - p.created_utc) / 3600);
      matches.push({
        source: 'r/HelpAReporter',
        title: p.title,
        url: `https://reddit.com${p.permalink}`,
        age: age < 24 ? `${age}h ago` : `${Math.floor(age / 24)}d ago`
      });
    }
  }
  await new Promise(r => setTimeout(r, 1200));

  // Source 2: Google News RSS for Canada postal/immigration topics
  const newsRss = await fetchText(
    'https://news.google.com/rss/search?q=canada+immigration+mail+letter+expert&hl=en-CA&gl=CA&ceid=CA:en'
  );
  const newsItems = [...newsRss.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  for (const [, item] of newsItems) {
    const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
    const linkMatch  = item.match(/<link>(.*?)<\/link>/);
    const pubMatch   = item.match(/<pubDate>(.*?)<\/pubDate>/);
    if (!titleMatch || !linkMatch) continue;
    const title = titleMatch[1];
    const pub   = pubMatch ? new Date(pubMatch[1]) : new Date();
    if (Date.now() - pub.getTime() > 7 * 86400 * 1000) continue;
    const text = title.toLowerCase();
    const hasKw = KEYWORDS.some(k => text.includes(k));
    const hasSignal = JOURNALIST_SIGNALS.some(s => text.includes(s));
    if (hasKw && hasSignal) {
      matches.push({
        source: 'Google News',
        title,
        url: linkMatch[1],
        age: `${Math.round((Date.now() - pub.getTime()) / 3600000)}h ago`
      });
    }
  }

  if (!matches.length) { console.log('No journalist/PR opportunities this week'); return; }

  const rows = matches.map(m =>
    `- **${m.source}** (${m.age}) — [${m.title}](${m.url})`
  ).join('\n');

  const issueBody = `## Journalist & PR opportunities this week\n\n` +
    `These may be opportunities to pitch Letterhome as a source or get a backlink.\n\n` +
    `${rows}\n\n---\n` +
    `**How to respond:**\n` +
    `1. Read the post/article carefully\n` +
    `2. Reply as a genuine expert source on Canadian mail and immigration paperwork\n` +
    `3. Link to a relevant guide if helpful: [letterhome.ca/guides](https://letterhome.ca/guides)\n\n` +
    `*Also consider signing up at [Connectively.us](https://www.connectively.us) (free tier) for direct journalist query emails.*\n\n` +
    `*Generated automatically every Monday*`;

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.REPO;

  if (token && repo) {
    await createIssue(token, repo,
      `PR/journalist opportunities — ${new Date().toISOString().split('T')[0]} (${matches.length} found)`,
      issueBody
    );
  } else {
    console.log(issueBody);
  }
})();
