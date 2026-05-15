#!/usr/bin/env node
// Decrypt a Letterhome backup file.
// Usage: node scripts/decrypt-backup.js <input.db.enc> <output.db>
// Requires BACKUP_PASSPHRASE in env or .env.

require('dotenv').config();
const fs = require('node:fs');
const { createDecipheriv, scryptSync } = require('node:crypto');

const [inPath, outPath] = process.argv.slice(2);
const passphrase = process.env.BACKUP_PASSPHRASE;

if (!inPath || !outPath) {
  console.error('Usage: node scripts/decrypt-backup.js <input.db.enc> <output.db>');
  process.exit(1);
}
if (!passphrase) {
  console.error('BACKUP_PASSPHRASE is not set. Add it to your .env file or environment.');
  process.exit(1);
}

const buf = fs.readFileSync(inPath);
if (buf.length < 16 + 12 + 16) {
  console.error('File is too small to be a valid encrypted backup.');
  process.exit(1);
}
const salt   = buf.subarray(0, 16);
const iv     = buf.subarray(16, 28);
const tag    = buf.subarray(28, 44);
const cipher = buf.subarray(44);

const key = scryptSync(passphrase, salt, 32);
const decipher = createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);

try {
  const plain = Buffer.concat([decipher.update(cipher), decipher.final()]);
  fs.writeFileSync(outPath, plain);
  console.log(`Decrypted ${inPath} -> ${outPath} (${plain.length} bytes)`);
} catch (e) {
  console.error('Decryption failed:', e.message);
  console.error('Wrong passphrase, or the file is corrupted.');
  process.exit(1);
}
