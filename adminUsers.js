// Admin accounts added from the admin screen. The owner's own accounts still come from the server settings (.env)
// and cannot be changed here. Every change needs the current admin's password again, and new accounts get a
// two-factor key at once.
const bcrypt = require('bcryptjs');
const { Secret, TOTP } = require('otpauth');

const NAME = /^[a-z0-9][a-z0-9._-]{2,31}$/i;

function register(app, { db, requireAdmin, logAudit, envAccounts, endSessions = () => 0 }) {
  const envNames = () => envAccounts().map(a => a.user.toLowerCase());
  const dbUser = name => db.prepare('SELECT username, password_hash, totp_secret, created_at, created_by FROM admin_users WHERE username = ?').get(String(name || ''));

  // Used by login and by every admin request: is this account still allowed in?
  function accountsForLogin() {
    const rows = db.prepare('SELECT username, password_hash, totp_secret FROM admin_users').all();
    return rows.map(r => ({ user: r.username, hash: r.password_hash, totpSecret: r.totp_secret || null }));
  }
  function stillValid(username) {
    const u = String(username || '').toLowerCase();
    return envNames().includes(u) || !!dbUser(username);
  }

  async function confirm(req, res) {
    const me = req.session.admin.username;
    const pw = typeof req.body.current_password === 'string' ? req.body.current_password : '';
    const acct = envAccounts().find(a => a.user === me) || (() => { const r = dbUser(me); return r ? { hash: r.password_hash } : null; })();
    if (!acct || !pw || !(await bcrypt.compare(pw, acct.hash))) { res.status(403).json({ error: 'Your current password is not right.' }); return false; }
    return true;
  }
  const newSecret = () => new Secret({ size: 20 });
  const uriFor = (username, secret) => new TOTP({ issuer: 'Letterhome Admin', label: username, secret }).toString();

  app.get('/api/admin/admin-users', requireAdmin, (req, res) => {
    const env = envAccounts().map(a => ({ username: a.user, source: 'server settings', has2FA: !!a.totpSecret, removable: false }));
    const extra = db.prepare('SELECT username, totp_secret, created_at, created_by FROM admin_users ORDER BY created_at').all()
      .map(r => ({ username: r.username, source: 'added here', has2FA: !!r.totp_secret, removable: true, created_at: r.created_at, created_by: r.created_by }));
    res.json({ me: req.session.admin.username, users: [...env, ...extra] });
  });

  app.post('/api/admin/admin-users', requireAdmin, async (req, res) => {
    try {
      if (!(await confirm(req, res))) return;
      const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      if (!NAME.test(username)) return res.status(400).json({ error: 'Username: 3 to 32 letters, numbers, dots, dashes or underscores.' });
      if (envNames().includes(username.toLowerCase()) || dbUser(username)) return res.status(409).json({ error: 'That username is already taken.' });
      if (password.length < 12) return res.status(400).json({ error: 'Use a password of at least 12 characters.' });
      const secret = newSecret();
      db.prepare('INSERT INTO admin_users (username, password_hash, totp_secret, created_by) VALUES (?,?,?,?)')
        .run(username, await bcrypt.hash(password, 12), secret.base32, req.session.admin.username);
      logAudit(req, 'admin_user.add', 'admin_user', username, {});
      res.json({ ok: true, username, secret: secret.base32, uri: uriFor(username, secret) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/admin-users/password', requireAdmin, async (req, res) => {
    try {
      if (!(await confirm(req, res))) return;
      const username = typeof req.body.username === 'string' ? req.body.username : '';
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      if (!dbUser(username)) return res.status(404).json({ error: 'That account was not added here, so its password is set in the server settings.' });
      if (password.length < 12) return res.status(400).json({ error: 'Use a password of at least 12 characters.' });
      db.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').run(await bcrypt.hash(password, 12), username);
      endSessions(s => s.admin?.username === username, req.sessionID);
      logAudit(req, 'admin_user.password', 'admin_user', username, {});
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/admin-users/reset-2fa', requireAdmin, async (req, res) => {
    try {
      if (!(await confirm(req, res))) return;
      const username = typeof req.body.username === 'string' ? req.body.username : '';
      if (!dbUser(username)) return res.status(404).json({ error: 'That account was not added here.' });
      const secret = newSecret();
      db.prepare('UPDATE admin_users SET totp_secret = ? WHERE username = ?').run(secret.base32, username);
      endSessions(s => s.admin?.username === username, req.sessionID);
      logAudit(req, 'admin_user.reset_2fa', 'admin_user', username, {});
      res.json({ ok: true, secret: secret.base32, uri: uriFor(username, secret) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/admin-users/remove', requireAdmin, async (req, res) => {
    try {
      if (!(await confirm(req, res))) return;
      const username = typeof req.body.username === 'string' ? req.body.username : '';
      if (!dbUser(username)) return res.status(404).json({ error: 'That account was not added here.' });
      if (username.toLowerCase() === req.session.admin.username.toLowerCase()) return res.status(400).json({ error: 'You cannot remove the account you are signed in with.' });
      db.prepare('DELETE FROM admin_users WHERE username = ?').run(username);
      logAudit(req, 'admin_user.remove', 'admin_user', username, {});
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return { accountsForLogin, stillValid };
}

module.exports = { register };
