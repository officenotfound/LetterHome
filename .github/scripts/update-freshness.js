// Monthly freshness updater — updates "Updated Month YYYY" dates on all guide pages.
// The workflow handles the git commit and push.
const fs   = require('fs');
const path = require('path');

const PUBLIC  = path.join(__dirname, '../../public');
const MONTHS  = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
const now     = new Date();
const current = `Updated ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

const files = fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'));
let updated = 0;

for (const file of files) {
  const fp      = path.join(PUBLIC, file);
  const content = fs.readFileSync(fp, 'utf8');
  // Match "Updated <Month> <4-digit year>"
  const next = content.replace(/Updated \w+ 20\d{2}/g, current);
  if (next !== content) {
    fs.writeFileSync(fp, next);
    updated++;
    console.log(`  Updated: ${file}`);
  }
}

console.log(`\nFreshness update complete — ${updated} page(s) updated to "${current}"`);
process.exit(0);
