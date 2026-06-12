// Pings IndexNow API to notify Bing, Yandex, and DuckDuckGo of new pages.
// URLs come from the NEW_URLS environment variable (set by the workflow).
const https = require('https');

const KEY = 'b4e8a2f1d9c5b7e3a6f0d8c2b5e9a1f4';
const HOST = 'letterhome.ca';

const raw = (process.env.NEW_URLS || '').trim();
if (!raw) { console.log('No new URLs to submit'); process.exit(0); }

const urls = raw.split(/\s+/).filter(u => /^https:\/\/letterhome\.ca\//.test(u));
if (!urls.length) { console.log('No valid letterhome.ca URLs found'); process.exit(0); }

console.log('Submitting to IndexNow:', urls);

const body = JSON.stringify({
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList: urls
});

const req = https.request({
  hostname: 'api.indexnow.org',
  path: '/indexnow',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  }
}, res => {
  console.log(`IndexNow response: ${res.statusCode}`);
  let body = '';
  res.on('data', d => { body += d; });
  res.on('end', () => {
    if (body) console.log(`IndexNow response body: ${body}`);
    // 200 = OK, 202 = accepted, both are success
    if (res.statusCode !== 200 && res.statusCode !== 202) {
      console.error(`IndexNow failed with status ${res.statusCode}`);
      process.exit(1);
    }
    console.log('IndexNow ping successful');
  });
});

req.on('error', e => { console.error('IndexNow error:', e.message); process.exit(1); });
req.write(body);
req.end();
