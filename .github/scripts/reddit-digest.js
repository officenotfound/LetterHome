// Weekly Reddit digest — finds posts in relevant subreddits matching your keywords.
// Creates a GitHub Issue with posts you could reply to with a guide link.
const https = require('https');

const SUBREDDITS = [
  'ImmigrationCanada', 'CanadaVisa', 'PersonalFinanceCanada',
  'Canadians', 'expats', 'HelpAReporter', 'canadients'
];

const KEYWORDS = [
  'mail to canada', 'send letter canada', 'mailing canada', 'ircc mail',
  'cra mail', 'canada post', 'send documents canada', 'lettermail',
  'postage canada', 'mail from abroad', 'send a letter', 'mailing address canada',
  'letter to canada', 'post to canada', 'canadian address', 'mail documents'
];

const GUIDE_LINKS = [
  '[How to send a letter to Canada from abroad](https://letterhome.ca/how-to-send-a-letter-to-canada-from-abroad)',
  '[How to mail IRCC documents from outside Canada](https://letterhome.ca/how-to-mail-ircc-documents-from-outside-canada)',
  '[How to mail CRA tax forms from outside Canada](https://letterhome.ca/how-to-mail-cra-tax-forms-from-outside-canada)',
  '[Send mail to Canada without a Canadian address](https://letterhome.ca/how-to-send-mail-to-canada-without-a-canadian-address)',
  '[Cheapest way to send a letter to Canada](https://letterhome.ca/cheapest-way-to-send-a-letter-to-canada)',
  '[All guides →](https://letterhome.ca/guides)'
];

function fetchSubreddit(sub) {
  return new Promise(resolve => {
    const req = https.get(
      `https://www.reddit.com/r/${sub}/new.json?limit=50`,
      { headers: { 'User-Agent': 'Letterhome-SEO-Monitor/1.0 (contact: admin@letterhome.ca)' } },
      res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve(JSON.parse(d).data?.children || []); }
          catch { resolve([]); }
        });
      }
    );
    req.on('error', () => resolve([]));
    req.setTimeout(10000, () => { req.destroy(); resolve([]); });
  });
}

function createIssue(token, repo, title, body) {
  return new Promise(resolve => {
    const payload = JSON.stringify({ title, body, labels: ['reddit', 'opportunity'] });
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

  for (const sub of SUBREDDITS) {
    const posts = await fetchSubreddit(sub);
    for (const { data: p } of posts) {
      if (p.created_utc < sevenDaysAgo) continue;
      const text = `${p.title} ${p.selftext || ''}`.toLowerCase();
      const kw = KEYWORDS.find(k => text.includes(k));
      if (!kw) continue;
      const age = Math.round((Date.now() / 1000 - p.created_utc) / 3600);
      matches.push({
        sub, title: p.title, url: `https://reddit.com${p.permalink}`,
        age: age < 24 ? `${age}h ago` : `${Math.floor(age / 24)}d ago`, kw
      });
    }
    await new Promise(r => setTimeout(r, 1200));
  }

  if (!matches.length) { console.log('No Reddit matches this week'); return; }

  const rows = matches.map(m =>
    `- **r/${m.sub}** (${m.age}) — [${m.title}](${m.url})\n  *matched: "${m.kw}"*`
  ).join('\n');

  const issueBody = `## Reddit posts to reply to this week\n\n` +
    `These posts match your keywords. Reply naturally with helpful info and link to a relevant guide.\n\n` +
    `${rows}\n\n---\n**Relevant guides to share:**\n${GUIDE_LINKS.map(l => `- ${l}`).join('\n')}\n\n` +
    `*Generated automatically every Monday by the weekly SEO job*`;

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.REPO;

  if (token && repo) {
    await createIssue(token, repo,
      `Reddit opportunities — ${new Date().toISOString().split('T')[0]} (${matches.length} posts)`,
      issueBody
    );
  } else {
    console.log(issueBody);
  }
})();
