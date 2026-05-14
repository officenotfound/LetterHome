const { Secret, TOTP } = require('otpauth');
const qr = require('qrcode-terminal');

const secret = new Secret({ size: 20 });
const totp = new TOTP({
  issuer: 'Letterhome Admin',
  label:  'admin',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
  secret,
});

const uri = totp.toString();

console.log('\n┌─────────────────────────────────────────────────────────────────┐');
console.log('│  Scan this QR code with your authenticator app:                 │');
console.log('└─────────────────────────────────────────────────────────────────┘\n');
qr.generate(uri, { small: true });
console.log('\nOr enter this code manually:');
console.log(`\n   ${secret.base32}\n`);
console.log('Recommended apps: Google Authenticator · Authy · 1Password · Bitwarden\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Add this line to your /var/letterhome/.env file:\n');
console.log(`TOTP_SECRET=${secret.base32}\n`);
console.log('Then restart: pm2 restart letterhome');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
