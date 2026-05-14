const bcrypt = require('bcryptjs');
const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
rl.question('Choose admin password: ', async pwd => {
  if (!pwd || pwd.length < 8) { console.error('Password must be at least 8 characters.'); process.exit(1); }
  const hash = await bcrypt.hash(pwd, 12);
  console.log('\nAdd these to your .env file:\n');
  console.log(`ADMIN_USERNAME=admin`);
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log(`SESSION_SECRET=${require('crypto').randomBytes(32).toString('hex')}`);
  rl.close();
});
