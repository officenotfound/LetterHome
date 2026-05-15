#!/usr/bin/env node
// Standalone Google Drive backup test.
// Usage: node scripts/test-gdrive.js
// Reads GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY, GDRIVE_BACKUP_FOLDER_ID from .env

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const folderId    = process.env.GDRIVE_BACKUP_FOLDER_ID;
const clientEmail = process.env.GA4_CLIENT_EMAIL;
const privateKey  = process.env.GA4_PRIVATE_KEY;

console.log('━━ Letterhome Drive backup test ━━');

if (!folderId)    { console.error('✗ GDRIVE_BACKUP_FOLDER_ID is missing from .env'); process.exit(1); }
if (!clientEmail) { console.error('✗ GA4_CLIENT_EMAIL is missing from .env');        process.exit(1); }
if (!privateKey)  { console.error('✗ GA4_PRIVATE_KEY is missing from .env');         process.exit(1); }

console.log('✓ Env vars present');
console.log('  Folder ID:    ', folderId);
console.log('  Service acct: ', clientEmail);

let google;
try { ({ google } = require('googleapis')); }
catch (e) { console.error('✗ googleapis package is not installed. Run: npm install'); process.exit(1); }
console.log('✓ googleapis package loaded');

const auth = new google.auth.JWT({
  email: clientEmail,
  key:   privateKey.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

(async () => {
  // 1. Token check
  try {
    await auth.authorize();
    console.log('✓ Authorized with Google');
  } catch (e) {
    console.error('✗ Authorization failed:', e.message);
    console.error('  → Most likely cause: GA4_PRIVATE_KEY is malformed or the service account was deleted.');
    process.exit(1);
  }

  // 2. Folder check
  try {
    const r = await drive.files.get({ fileId: folderId, fields: 'id, name, mimeType' });
    console.log(`✓ Folder accessible: "${r.data.name}" (${r.data.mimeType})`);
    if (r.data.mimeType !== 'application/vnd.google-apps.folder') {
      console.warn('  ⚠ That ID is not a folder!');
    }
  } catch (e) {
    console.error('✗ Folder lookup failed:', e.message);
    console.error('  → Most likely cause: the folder is not shared with the service account, or the ID is wrong.');
    console.error(`  → Double-check that ${clientEmail} has Editor access to this folder.`);
    process.exit(1);
  }

  // 3. Upload a tiny test file
  const testPath = path.join(__dirname, '..', '.gdrive-test.txt');
  fs.writeFileSync(testPath, `Drive backup test from Letterhome at ${new Date().toISOString()}\n`);
  try {
    const r = await drive.files.create({
      requestBody: { name: `letterhome-test-${Date.now()}.txt`, parents: [folderId] },
      media:       { mimeType: 'text/plain', body: fs.createReadStream(testPath) },
      fields:      'id, name, webViewLink',
    });
    console.log(`✓ Test file uploaded: "${r.data.name}" (id: ${r.data.id})`);
    if (r.data.webViewLink) console.log(`  View: ${r.data.webViewLink}`);

    // Clean up the test file we just uploaded
    try {
      await drive.files.delete({ fileId: r.data.id });
      console.log('✓ Test file deleted from Drive (cleanup)');
    } catch (e) {
      console.warn('  ⚠ Could not delete test file:', e.message);
    }
  } catch (e) {
    console.error('✗ Upload failed:', e.message);
    process.exit(1);
  } finally {
    try { fs.unlinkSync(testPath); } catch {}
  }

  console.log('\n✓ All checks passed. Backups should upload successfully.');
})();
