// Wikipedia citation gap finder — finds Wikipedia articles about Canada mail/immigration
// that have few or no external citations, where letterhome.ca guides could be added.
// Creates a GitHub Issue with opportunities.
const https = require('https');

const SEARCH_TERMS = [
  'Canada Post lettermail',
  'mail to Canada',
  'Immigration Refugees Citizenship Canada',
  'Canadian postal system',
  'international mail Canada',
  'letter mail postage Canada',
];

function wpSearch(query) {
  return new Promise(resolve => {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search` +
      `&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json`;
    const req = https.get(url, { headers: { 'User-Agent': 'Letterhome-WikiGap/1.0 (admin@letterhome.ca)' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).query?.search || []); } catch { resolve([]); } });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(10000, () => { req.destroy(); resolve([]); });
  });
}

function wpReferences(pageId) {
  return new Promise(resolve => {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extlinks` +
      `&pageids=${pageId}&ellimit=50&format=json`;
    const req = https.get(url, { headers: { 'User-Agent': 'Letterhome-WikiGap/1.0 (admin@letterhome.ca)' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const page = JSON.parse(d).query?.pages?.[pageId];
          const links = page?.extlinks?.map(l => l['*']) || [];
          resolve(links);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(10000, () => { req.destroy(); resolve([]); });
  });
}

function createIssue(token, repo, title, body) {
  return new Promise(resolve => {
    const payload = JSON.stringify({ title, body, labels: ['wikipedia', 'backlink-opportunity'] });
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
  const seen = new Set();
  const opportunities = [];

  for (const term of SEARCH_TERMS) {
    const results = await wpSearch(term);
    for (const r of results) {
      if (seen.has(r.pageid)) continue;
      seen.add(r.pageid);
      const extLinks = await wpReferences(String(r.pageid));
      const hasLH = extLinks.some(l => l.includes('letterhome.ca'));
      const wpUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`;
      console.log(`${hasLH ? '✓ already cited' : `${extLinks.length} ext links`} — ${r.title}`);
      if (!hasLH) {
        opportunities.push({ title: r.title, url: wpUrl, extLinks: extLinks.length, snippet: r.snippet.replace(/<[^>]+>/g, '') });
      }
    }
    await new Promise(res => setTimeout(res, 500));
  }

  if (!opportunities.length) { console.log('No Wikipedia gaps found (or already cited everywhere)'); return; }

  const rows = opportunities
    .sort((a, b) => a.extLinks - b.extLinks)
    .map(o => `- **[${o.title}](${o.url})** (${o.extLinks} external citations)\n  > ${o.snippet.slice(0, 120)}...`)
    .join('\n');

  const issueBody = `## Wikipedia citation opportunities\n\n` +
    `These Wikipedia articles are relevant to Letterhome but don't cite us yet.\n` +
    `Articles with fewer external citations are easier to add to.\n\n${rows}\n\n` +
    `**How to add a citation:**\n` +
    `1. Click the article → Edit → find the relevant sentence\n` +
    `2. Add \`<ref>{{cite web |url=https://letterhome.ca/... |title=... |website=Letterhome}}</ref>\`\n` +
    `3. Must be genuinely relevant — only add where it adds value for readers\n\n` +
    `*Generated monthly by Wikipedia gap finder*`;

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.REPO;
  if (token && repo) {
    await createIssue(token, repo,
      `Wikipedia citation gaps — ${new Date().toISOString().split('T')[0]}`,
      issueBody
    );
  } else {
    console.log(issueBody);
  }
})();
