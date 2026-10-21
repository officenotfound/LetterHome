// Notifies IndexNow (Bing, and through it ChatGPT Search / Copilot, plus Yandex) of every URL in sitemap.xml.
// Run AFTER deploying:  node scripts/indexnow-ping.js
const fs = require('fs');
const path = require('path');

const HOST = 'letterhome.ca';
const KEY = 'b4e8a2f1d9c5b7e3a6f0d8c2b5e9a1f4';

const xml = fs.readFileSync(path.join(__dirname, '..', 'public', 'sitemap.xml'), 'utf8');
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

(async () => {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
  });
  console.log(`IndexNow: submitted ${urlList.length} URLs, HTTP ${res.status}`);
})();
