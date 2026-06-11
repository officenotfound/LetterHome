// AI answer monitor — checks if letterhome.ca is cited in Perplexity AI answers
// for key queries. Uses Perplexity's public (unauthenticated) suggestion endpoint.
// Creates a GitHub Issue with results.
const https = require('https');

const QUERIES = [
  'how to send a letter to Canada from abroad',
  'how to mail IRCC documents from outside Canada',
  'cheapest way to send a letter to Canada',
  'how to mail CRA tax forms from outside Canada',
  'what is lettermail Canada',
  'mail a letter online Canada',
];

function checkPerplexity(query) {
  return new Promise(resolve => {
    // Use You.com snippet API (public, no auth)
    const url = `https://api.ydc-index.io/search?query=${encodeURIComponent(query)}&num_web_results=5`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Letterhome-AIMonitor/1.0',
        'Accept': 'application/json'
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          const hits = json.hits || [];
          const cited = hits.some(h =>
            (h.url || '').includes('letterhome.ca') ||
            (h.description || '').toLowerCase().includes('letterhome')
          );
          const top5 = hits.slice(0, 5).map(h => ({ url: h.url, title: h.title }));
          resolve({ query, cited, top5 });
        } catch { resolve({ query, cited: false, top5: [], error: true }); }
      });
    });
    req.on('error', () => resolve({ query, cited: false, top5: [], error: true }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ query, cited: false, top5: [], error: true }); });
  });
}

function createIssue(token, repo, title, body) {
  return new Promise(resolve => {
    const payload = JSON.stringify({ title, body, labels: ['geo', 'ai-visibility'] });
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
  const results = [];
  for (const query of QUERIES) {
    const r = await checkPerplexity(query);
    console.log(`${r.cited ? '✓ cited' : '✗ not cited'} — "${query}"`);
    if (!r.error) results.push(r);
    await new Promise(res => setTimeout(res, 1500));
  }

  const cited   = results.filter(r => r.cited);
  const missing = results.filter(r => !r.cited);

  const citedRows   = cited.map(r => `- ✅ "${r.query}"`).join('\n') || '*None yet*';
  const missingRows = missing.map(r => {
    const competitors = r.top5.map(h => `  - [${h.title || h.url}](${h.url})`).join('\n');
    return `- ❌ **"${r.query}"**\n  Top results instead:\n${competitors}`;
  }).join('\n');

  const issueBody = `## AI search visibility report — ${new Date().toISOString().split('T')[0]}\n\n` +
    `Checked You.com (AI-powered search) for letterhome.ca citations.\n\n` +
    `### Cited (${cited.length}/${results.length})\n${citedRows}\n\n` +
    `### Not cited — competitors ranking instead\n${missingRows}\n\n` +
    `**To improve AI visibility:**\n` +
    `- Ensure pages start with a direct 1-sentence answer to the query\n` +
    `- Add FAQPage schema to every guide page\n` +
    `- Use exact question phrases as H2 headings\n\n` +
    `*Generated monthly — check manually on Perplexity.ai and ChatGPT for deeper analysis*`;

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.REPO;
  if (token && repo) {
    await createIssue(token, repo,
      `AI visibility report — ${cited.length}/${results.length} queries cite letterhome.ca`,
      issueBody
    );
  } else {
    console.log(issueBody);
  }
})();
