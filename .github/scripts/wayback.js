// Submits new pages to the Internet Archive (Wayback Machine).
// URLs come from the NEW_URLS environment variable (set by the workflow).
const https = require('https');

const raw = (process.env.NEW_URLS || '').trim();
if (!raw) { console.log('No URLs to archive'); process.exit(0); }

const urls = raw.split(/\s+/).filter(u => /^https:\/\/letterhome\.ca\//.test(u));
if (!urls.length) { console.log('No valid URLs'); process.exit(0); }

function save(url) {
  return new Promise(resolve => {
    const req = https.get(
      `https://web.archive.org/save/${encodeURIComponent(url)}`,
      { headers: { 'User-Agent': 'Letterhome-Archiver/1.0 (SEO bot; admin@letterhome.ca)' } },
      res => {
        console.log(`Wayback ${url}: ${res.statusCode}`);
        res.resume();
        resolve();
      }
    );
    req.on('error', e => { console.error(`Wayback error (${url}):`, e.message); resolve(); });
    req.setTimeout(15000, () => { req.destroy(); resolve(); });
  });
}

(async () => {
  for (const url of urls) {
    await save(url);
    await new Promise(r => setTimeout(r, 3000)); // be polite to the Archive
  }
  console.log('Wayback submissions complete');
})();
