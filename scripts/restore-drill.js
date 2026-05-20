#!/usr/bin/env node
// Restore drill — proves your backups can actually be restored.
//
// 1. Authorizes with Backblaze B2
// 2. Finds the most recent .db.enc file in the bucket
// 3. Downloads it to /tmp/letterhome-restore-test/
// 4. Decrypts it using BACKUP_PASSPHRASE
// 5. Opens the resulting SQLite file and verifies expected tables exist
// 6. Counts rows in orders, customers, and email_log
//
// Reads from B2 + .env. Does NOT touch your live orders.db.
//
// Usage: node scripts/restore-drill.js
// Cleanup: rm -rf /tmp/letterhome-restore-test
//
// Requires: B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_ID, BACKUP_PASSPHRASE

require('dotenv').config();
const fs   = require('node:fs');
const path = require('node:path');
const { createDecipheriv, scryptSync } = require('node:crypto');
const { execSync } = require('node:child_process');
const B2   = require('backblaze-b2');

const TEST_DIR = '/tmp/letterhome-restore-test';

async function main() {
  for (const v of ['B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_ID', 'BACKUP_PASSPHRASE']) {
    if (!process.env[v]) { console.error(`Missing env var: ${v}`); process.exit(1); }
  }

  fs.mkdirSync(TEST_DIR, { recursive: true });

  const b2 = new B2({
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey:   process.env.B2_APPLICATION_KEY,
  });

  console.log('1. Authorizing with Backblaze B2...');
  await b2.authorize();

  console.log('2. Listing backup files in bucket...');
  const { data: list } = await b2.listFileNames({
    bucketId:     process.env.B2_BUCKET_ID,
    maxFileCount: 100,
    prefix:       'orders-',
  });
  const encFiles = list.files
    .filter(f => f.fileName.endsWith('.db.enc'))
    .sort((a, b) => b.fileName.localeCompare(a.fileName));

  if (!encFiles.length) {
    console.error('   No .db.enc files found in B2 bucket — nothing to restore.');
    console.error('   (If you only see .db files, your backups are uploading unencrypted —');
    console.error('    set BACKUP_PASSPHRASE in .env and run a new backup first.)');
    process.exit(1);
  }

  const latest = encFiles[0];
  console.log(`   Latest: ${latest.fileName} (${(latest.contentLength / 1024).toFixed(1)} KB)`);

  console.log('3. Downloading from B2...');
  const { data: encData } = await b2.downloadFileById({
    fileId:       latest.fileId,
    responseType: 'arraybuffer',
  });
  const encBuf  = Buffer.from(encData);
  const encPath = path.join(TEST_DIR, latest.fileName);
  fs.writeFileSync(encPath, encBuf);
  console.log(`   Saved to: ${encPath}`);

  console.log('4. Decrypting...');
  if (encBuf.length < 16 + 12 + 16) {
    console.error('   File too small to be a valid encrypted backup');
    process.exit(1);
  }
  const salt   = encBuf.subarray(0, 16);
  const iv     = encBuf.subarray(16, 28);
  const tag    = encBuf.subarray(28, 44);
  const cipher = encBuf.subarray(44);
  const key    = scryptSync(process.env.BACKUP_PASSPHRASE, salt, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let plain;
  try {
    plain = Buffer.concat([decipher.update(cipher), decipher.final()]);
  } catch (e) {
    console.error('   Decryption failed:', e.message);
    console.error('   (Wrong passphrase, or the file is corrupted.)');
    process.exit(1);
  }
  const restoredPath = path.join(TEST_DIR, 'orders-restored.db');
  fs.writeFileSync(restoredPath, plain);
  console.log(`   Decrypted to: ${restoredPath} (${(plain.length / 1024).toFixed(1)} KB)`);

  console.log('5. Verifying SQLite structure...');
  const tables = execSync(`sqlite3 "${restoredPath}" ".tables"`).toString().trim().split(/\s+/);
  console.log(`   Found ${tables.length} tables: ${tables.join(', ')}`);
  const required = ['orders', 'customers', 'email_log', 'audit_log'];
  const missing  = required.filter(t => !tables.includes(t));
  if (missing.length) {
    console.error(`   Missing expected tables: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('6. Counting rows in critical tables...');
  for (const t of ['orders', 'customers', 'email_log', 'audit_log']) {
    try {
      const n = execSync(`sqlite3 "${restoredPath}" "SELECT COUNT(*) FROM ${t};"`).toString().trim();
      console.log(`   ${t.padEnd(12)} ${n} rows`);
    } catch (e) {
      console.log(`   ${t.padEnd(12)} (query failed: ${e.message})`);
    }
  }

  console.log('\n✅ RESTORE DRILL PASSED');
  console.log(`   Restored DB:   ${restoredPath}`);
  console.log(`   To inspect:    sqlite3 ${restoredPath}`);
  console.log(`   To clean up:   rm -rf ${TEST_DIR}`);
}

main().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
