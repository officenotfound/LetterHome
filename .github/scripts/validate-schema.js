// Validates all JSON-LD structured data blocks across every HTML page.
// Fails the build if any block contains invalid JSON or is missing @context.
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '../../public');
const files  = fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'));

const errors = [];
let total = 0;

for (const file of files) {
  const content = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  const blocks  = [...content.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];

  for (const [, json] of blocks) {
    total++;
    try {
      const parsed = JSON.parse(json.trim());
      const graphs = parsed['@graph'] ? parsed['@graph'] : [parsed];
      if (!parsed['@context'])
        errors.push(`${file}: JSON-LD block missing @context`);
      for (const node of graphs) {
        if (!node['@type'])
          errors.push(`${file}: JSON-LD node missing @type`);
      }
    } catch (e) {
      errors.push(`${file}: invalid JSON in JSON-LD — ${e.message}`);
    }
  }
}

if (errors.length) {
  console.error(`Schema validation FAILED (${errors.length} error(s)):`);
  errors.forEach(e => console.error('  ✗', e));
  process.exit(1);
} else {
  console.log(`Schema OK — ${total} JSON-LD block(s) across ${files.length} pages`);
}
