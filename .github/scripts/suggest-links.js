// Weekly internal link suggester — finds pages that mention a keyword
// but don't link to the guide page that covers it.
// Creates a GitHub Issue with actionable suggestions.
const fs    = require('fs');
const path  = require('path');
const https = require('https');

const PUBLIC = path.join(__dirname, '../../public');

// Each entry: keyword to search for, the page that covers it, its display title
const LINK_OPPORTUNITIES = [
  { kw: 'lettermail',         url: '/what-is-lettermail',                                    title: 'What is lettermail?' },
  { kw: 'IRCC',               url: '/how-to-mail-ircc-documents-from-outside-canada',         title: 'How to mail IRCC documents from outside Canada' },
  { kw: 'CRA',                url: '/how-to-mail-cra-tax-forms-from-outside-canada',          title: 'How to mail CRA tax forms from outside Canada' },
  { kw: 'postal code',        url: '/how-to-address-a-letter-to-canada',                      title: 'How to address a letter to Canada' },
  { kw: 'return address',     url: '/send-a-letter-to-canada-without-a-return-address',       title: 'Send a letter without a return address' },
  { kw: 'cheapest',           url: '/cheapest-way-to-send-a-letter-to-canada',                title: 'Cheapest way to send a letter to Canada' },
  { kw: 'without a Canadian', url: '/how-to-send-mail-to-canada-without-a-canadian-address', title: 'Send mail without a Canadian address' },
  { kw: 'from home',          url: '/send-a-letter-from-home',                               title: 'Send a letter from home' },
  { kw: 'online',             url: '/mail-a-letter-online',                                  title: 'Mail a letter online' },
];

const files = fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'));
const suggestions = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(PUBLIC, file), 'utf8');

  for (const { kw, url, title } of LINK_OPPORTUNITIES) {
    // Skip if this is the target page itself
    if (file === url.replace('/', '') + '.html') continue;

    // Skip if already linked to this URL
    if (content.includes(`href="${url}"`) || content.includes(`href='${url}'`)) continue;

    // Check if keyword appears in the body text (rough check — outside href attrs)
    const regex = new RegExp(`(?<!href=['"]/[^'"]*?)\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(content)) {
      suggestions.push(
        `**\`${file}\`** mentions *"${kw}"* — consider linking to [${title}](https://letterhome.ca${url})`
      );
    }
  }
}

if (!suggestions.length) { console.log('No internal link suggestions this week'); process.exit(0); }

const token = process.env.GITHUB_TOKEN;
const repo  = process.env.REPO;

const issueBody = `## Internal link opportunities\n\n` +
  `These pages mention keywords that have dedicated guide pages but aren't linking to them.\n\n` +
  `${suggestions.map(s => `- ${s}`).join('\n')}\n\n` +
  `*Generated automatically every Monday — close this issue once links are added*`;

if (!token || !repo) { console.log(issueBody); process.exit(0); }

const payload = JSON.stringify({
  title: `Internal link suggestions — ${new Date().toISOString().split('T')[0]}`,
  body: issueBody,
  labels: ['seo', 'internal-links']
});
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
  res.on('end', () => console.log('Issue created:', JSON.parse(d).html_url));
});
req.on('error', e => console.error('GitHub error:', e.message));
req.write(payload);
req.end();
