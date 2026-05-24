const https = require('https');
const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(__dirname, '../public/fonts');
fs.mkdirSync(FONTS_DIR, { recursive: true });

const GF_URL = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&display=swap';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return get(res.headers.location, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  const css = (await get(GF_URL, { 'User-Agent': UA })).toString();

  const urlRe = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g;
  const urls = [...new Set([...css.matchAll(urlRe)].map(m => m[1]))];
  console.log(`Downloading ${urls.length} font files...`);

  let localCss = css;
  for (const url of urls) {
    const filename = path.basename(url);
    const dest = path.join(FONTS_DIR, filename);
    const data = await get(url);
    fs.writeFileSync(dest, data);
    localCss = localCss.split(url).join('/fonts/' + filename);
    process.stdout.write('.');
  }

  console.log('\nWriting public/fonts.css...');
  fs.writeFileSync(path.join(__dirname, '../public/fonts.css'), localCss);
  console.log('Done.');
})();
