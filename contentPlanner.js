// Content & Links: a calendar of planned articles, social posts and outreach, a weekly outreach target, and a log of
// backlinks earned. Nothing here posts or sends to anyone outside: social posts are copied and posted by the owner,
// and the only email is the Monday summary to the owner.

const KINDS = ['article', 'social', 'outreach', 'other'];
const STATUSES = ['idea', 'drafted', 'scheduled', 'done'];
const LINK_STATUSES = ['live', 'pending', 'lost'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanText = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max).trim();
const validDate = d => { if (!DATE.test(d)) return false; const t = Date.parse(d + 'T00:00:00Z'); return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d; };
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
// Monday of the week containing d (weeks run Monday to Sunday).
const weekStart = d => { const dow = new Date(d + 'T12:00:00Z').getUTCDay(); return addDays(d, -((dow + 6) % 7)); };
const safeUrl = u => { const t = String(u || '').trim().slice(0, 500); return /^https?:\/\//i.test(t) ? t : ''; };

function register(app, { db, requireAdmin, logAudit, getSetting, today }) {
  const todayStr = () => (today ? today() : new Date().toISOString().slice(0, 10));
  const target = () => Math.min(50, Math.max(1, parseInt(getSetting('weekly_outreach_target', '5'), 10) || 5));

  function summary() {
    const t = todayStr(), ws = weekStart(t), we = addDays(ws, 6);
    const week = db.prepare(`SELECT kind, status, COUNT(*) n FROM content_items WHERE planned_date BETWEEN ? AND ? GROUP BY kind, status`).all(ws, we);
    const n = (kind, st) => week.filter(r => r.kind === kind && (!st || r.status === st)).reduce((a, r) => a + r.n, 0);
    const since = addDays(t, -30);
    const links = db.prepare(`SELECT COUNT(*) total,
      COALESCE(SUM(CASE WHEN found_date >= ? THEN 1 ELSE 0 END),0) recent,
      COALESCE(SUM(CASE WHEN from_outreach = 1 THEN 1 ELSE 0 END),0) from_outreach
      FROM backlinks WHERE status != 'lost'`).get(since);
    const overdue = db.prepare(`SELECT id, kind, title, planned_date FROM content_items WHERE status != 'done' AND planned_date != '' AND planned_date < ? ORDER BY planned_date`).all(t);
    return {
      today: t, week_start: ws, week_end: we, outreach_target: target(),
      outreach_done: n('outreach', 'done'), outreach_planned: n('outreach'),
      articles_done: n('article', 'done'), articles_planned: n('article'),
      social_done: n('social', 'done'), social_planned: n('social'),
      links_total: links.total, links_30d: links.recent, links_from_outreach: links.from_outreach,
      overdue,
    };
  }

  app.get('/api/admin/content', requireAdmin, (req, res) => {
    const m = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : todayStr().slice(0, 7);
    const from = m + '-01', to = addDays(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 1)).toISOString().slice(0, 10), -1);
    const items = db.prepare(`SELECT * FROM content_items WHERE planned_date BETWEEN ? AND ? ORDER BY planned_date, id`).all(from, to);
    const ideas = db.prepare(`SELECT * FROM content_items WHERE (planned_date IS NULL OR planned_date = '') AND status != 'done' ORDER BY id DESC LIMIT 50`).all();
    res.json({ month: m, items, ideas, summary: summary() });
  });

  app.get('/api/admin/content/:id', requireAdmin, (req, res) => {
    const i = db.prepare('SELECT * FROM content_items WHERE id = ?').get(Number(req.params.id));
    if (!i) return res.status(404).json({ error: 'Not found.' });
    res.json(i);
  });

  function itemFields(b, existing) {
    const kind = KINDS.includes(b.kind ?? existing?.kind) ? (b.kind ?? existing?.kind) : null;
    const status = STATUSES.includes(b.status ?? existing?.status) ? (b.status ?? existing?.status) : 'idea';
    const title = clean(b.title ?? existing?.title, 200);
    const date = b.planned_date !== undefined ? clean(b.planned_date, 10) : (existing?.planned_date || '');
    if (!kind) return { error: 'Choose what kind of item this is.' };
    if (!title) return { error: 'Give it a title.' };
    if (date && !validDate(date)) return { error: 'That date does not look right.' };
    return { f: { kind, status, title, planned_date: date, platform: clean(b.platform ?? existing?.platform, 40),
      url: b.url !== undefined ? safeUrl(b.url) : (existing?.url || ''), notes: cleanText(b.notes ?? existing?.notes, 2000) } };
  }

  app.post('/api/admin/content', requireAdmin, (req, res) => {
    const v = itemFields(req.body || {}); if (v.error) return res.status(400).json({ error: v.error });
    const repeat = Math.min(12, Math.max(0, parseInt(req.body.repeat_weeks, 10) || 0));
    if (repeat && !v.f.planned_date) return res.status(400).json({ error: 'Pick a date to repeat weekly.' });
    const ins = db.prepare('INSERT INTO content_items (kind, title, planned_date, status, platform, url, notes, done_at) VALUES (?,?,?,?,?,?,?,?)');
    let first = null;
    for (let i = 0; i <= repeat; i++) {
      const date = v.f.planned_date ? addDays(v.f.planned_date, 7 * i) : '';
      const status = i === 0 ? v.f.status : (v.f.status === 'done' ? 'idea' : v.f.status);
      const id = Number(ins.run(v.f.kind, v.f.title, date, status, v.f.platform, i === 0 ? v.f.url : '', v.f.notes, status === 'done' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null).lastInsertRowid);
      if (first == null) first = id;
    }
    logAudit(req, 'content.add', 'content_item', first, { kind: v.f.kind, repeat });
    res.json({ ok: true, id: first, created: repeat + 1 });
  });

  app.post('/api/admin/content/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const cur = db.prepare('SELECT * FROM content_items WHERE id = ?').get(id);
    if (!cur) return res.status(404).json({ error: 'Not found.' });
    const v = itemFields(req.body || {}, cur); if (v.error) return res.status(400).json({ error: v.error });
    const doneAt = v.f.status === 'done' ? (cur.done_at || new Date().toISOString().slice(0, 19).replace('T', ' ')) : null;
    db.prepare('UPDATE content_items SET kind=?, title=?, planned_date=?, status=?, platform=?, url=?, notes=?, done_at=? WHERE id=?')
      .run(v.f.kind, v.f.title, v.f.planned_date, v.f.status, v.f.platform, v.f.url, v.f.notes, doneAt, id);
    res.json({ ok: true });
  });
  app.post('/api/admin/content/:id/delete', requireAdmin, (req, res) => {
    const r = db.prepare('DELETE FROM content_items WHERE id = ?').run(Number(req.params.id));
    if (!r.changes) return res.status(404).json({ error: 'Not found.' });
    logAudit(req, 'content.delete', 'content_item', req.params.id, {});
    res.json({ ok: true });
  });

  // ── Backlinks ───────────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/backlinks', requireAdmin, (_req, res) => {
    res.json({ links: db.prepare('SELECT * FROM backlinks ORDER BY COALESCE(found_date, created_at) DESC, id DESC LIMIT 300').all(), summary: summary() });
  });
  function linkFields(b, existing) {
    const source_name = clean(b.source_name ?? existing?.source_name, 160);
    const found = b.found_date !== undefined ? clean(b.found_date, 10) : (existing?.found_date || todayStr());
    const status = LINK_STATUSES.includes(b.status ?? existing?.status) ? (b.status ?? existing?.status) : 'live';
    if (!source_name) return { error: 'Who linked to you? Enter the site or person.' };
    if (found && !validDate(found)) return { error: 'That date does not look right.' };
    return { f: { source_name, source_url: b.source_url !== undefined ? safeUrl(b.source_url) : (existing?.source_url || ''),
      target_page: clean(b.target_page ?? existing?.target_page, 200), found_date: found,
      from_outreach: (b.from_outreach ?? existing?.from_outreach) ? 1 : 0, status, notes: cleanText(b.notes ?? existing?.notes, 1000) } };
  }
  app.post('/api/admin/backlinks', requireAdmin, (req, res) => {
    const v = linkFields(req.body || {}); if (v.error) return res.status(400).json({ error: v.error });
    const id = Number(db.prepare('INSERT INTO backlinks (source_name, source_url, target_page, found_date, from_outreach, status, notes) VALUES (?,?,?,?,?,?,?)')
      .run(v.f.source_name, v.f.source_url, v.f.target_page, v.f.found_date, v.f.from_outreach, v.f.status, v.f.notes).lastInsertRowid);
    logAudit(req, 'backlink.add', 'backlink', id, { source: v.f.source_name });
    res.json({ ok: true, id });
  });
  app.post('/api/admin/backlinks/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const cur = db.prepare('SELECT * FROM backlinks WHERE id = ?').get(id);
    if (!cur) return res.status(404).json({ error: 'Not found.' });
    const v = linkFields(req.body || {}, cur); if (v.error) return res.status(400).json({ error: v.error });
    db.prepare('UPDATE backlinks SET source_name=?, source_url=?, target_page=?, found_date=?, from_outreach=?, status=?, notes=? WHERE id=?')
      .run(v.f.source_name, v.f.source_url, v.f.target_page, v.f.found_date, v.f.from_outreach, v.f.status, v.f.notes, id);
    res.json({ ok: true });
  });
  app.post('/api/admin/backlinks/:id/delete', requireAdmin, (req, res) => {
    const r = db.prepare('DELETE FROM backlinks WHERE id = ?').run(Number(req.params.id));
    if (!r.changes) return res.status(404).json({ error: 'Not found.' });
    res.json({ ok: true });
  });

  // Text for the Monday email to the owner.
  function weeklyDigest() {
    const s = summary(), t = s.today;
    const due = db.prepare(`SELECT kind, title, planned_date, status FROM content_items WHERE status != 'done' AND planned_date BETWEEN ? AND ? ORDER BY planned_date, id`).all(t, s.week_end > t ? s.week_end : addDays(t, 6));
    const newLinks = db.prepare(`SELECT source_name, target_page FROM backlinks WHERE found_date >= ? AND status != 'lost' ORDER BY found_date DESC`).all(addDays(t, -7));
    const out = [];
    out.push('Content and links, this week');
    out.push(`  Outreach: ${s.outreach_done} of ${s.outreach_target} sent (target)`);
    out.push(`  Articles: ${s.articles_done} done, ${s.articles_planned} planned`);
    out.push(`  Backlinks: ${s.links_30d} found in the last 30 days, ${s.links_total} in total`);
    if (s.overdue.length) { out.push(''); out.push('Overdue'); s.overdue.slice(0, 15).forEach(o => out.push(`  ${o.planned_date}  ${o.kind}: ${o.title}`)); }
    if (due.length) { out.push(''); out.push('Planned for the next days'); due.slice(0, 20).forEach(o => out.push(`  ${o.planned_date}  ${o.kind}: ${o.title} (${o.status})`)); }
    if (newLinks.length) { out.push(''); out.push('New links this past week'); newLinks.slice(0, 10).forEach(l => out.push(`  ${l.source_name}${l.target_page ? ' to ' + l.target_page : ''}`)); }
    if (!due.length && !s.overdue.length) { out.push(''); out.push('Nothing is planned yet. Add this week\'s article and outreach in Admin, Messages, Content and links.'); }
    out.push(''); out.push('Admin: /admin/content');
    return out.join('\n');
  }

  return { weeklyDigest, summary };
}

module.exports = { register, weekStart, addDays };
