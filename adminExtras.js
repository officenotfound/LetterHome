// Admin screens: Today (what needs the owner), Profit per order, global search, and editing an order's send date.
// Nothing here sends anything to PostGrid or to customers.

// Estimated cost per piece in USD, from PostGrid's published Starter rates (checked 2026-11-09). These are estimates,
// shown on the Profit screen. International is the Canada rate plus an assumed surcharge: PostGrid quoted $2 to $5.
const RATES = {
  CA: { bw: 2.12, colour: 2.22, extraBw: 0.20, extraColour: 0.30 },
  US: { bw: 1.059, colour: 1.219, extraBw: 0.10, extraColour: 0.20 },
  GB: { bw: 2.81, colour: 2.87, extraBw: 0.10, extraColour: 0.15 },
  AU: { bw: 2.56, colour: 2.56, extraBw: 0.10, extraColour: 0.15 },
};
const INTL_SURCHARGE_USD = 3.5;
const SERVICE_USD = { registered_CA: 25, express_CA: 35, certified_US: 6.94, express_US: 19, registered_other: 25 };
const STRIPE_PCT = 0.029, STRIPE_FIXED_CENTS = 30;

function estimateCost(o, fx) {
  const cc = String(o.destination_country || 'CA').toUpperCase();
  const r = RATES[cc] || { ...RATES.CA, bw: RATES.CA.bw + INTL_SURCHARGE_USD, colour: RATES.CA.colour + INTL_SURCHARGE_USD };
  const colour = !!o.colour_printing;
  const pages = Math.max(1, Number(o.page_count) || 1);
  let usd = (colour ? r.colour : r.bw) + (pages - 1) * (colour ? r.extraColour : r.extraBw);
  if (o.registered_mail) usd += cc === 'CA' ? SERVICE_USD.registered_CA : SERVICE_USD.registered_other;
  if (o.certified_mail && cc === 'US') usd += SERVICE_USD.certified_US;
  if (o.express_mail) usd += cc === 'US' ? SERVICE_USD.express_US : SERVICE_USD.express_CA;
  const print = Math.round(usd * fx * 100);
  const stripe = Math.round((o.price_cents || 0) * STRIPE_PCT) + STRIPE_FIXED_CENTS;
  return { print, stripe, total: print + stripe };
}

function register(app, { db, requireAdmin, logAudit, getSetting, contentHeld, today, ops }) {
  const todayStr = () => (today ? today() : new Date().toISOString().slice(0, 10));
  const nameOf = o => o.recipient_name || 'no name';

  // ── Today ──────────────────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/today', requireAdmin, (req, res) => {
    try {
      const t = todayStr();
      const tomorrow = new Date(Date.parse(t + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
      const week = new Date(Date.parse(t + 'T12:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
      const rows = db.prepare(`SELECT * FROM orders WHERE status = 'paid' AND deleted_at IS NULL AND (postgrid_letter_id IS NULL OR postgrid_status = 'cancelled')`).all();
      const out = { today: t, needs_attention: [], due_today: [], tomorrow: [], unapproved_soon: [], approvals_waiting: 0, held: 0 };
      for (const o of rows) {
        const future = o.scheduled_date && o.scheduled_date > t;
        const held = contentHeld ? !!contentHeld(o) : false;
        if (held) out.held++;
        const item = { id: o.id, name: nameOf(o), date: o.scheduled_date || null, approved: !!o.send_approved_at };
        if (o.scheduled_date && o.scheduled_date <= t) out.due_today.push(item);
        else if (o.scheduled_date === tomorrow) out.tomorrow.push(item);
        if (future && !o.send_approved_at && o.scheduled_date <= week && !held) out.unapproved_soon.push(item);
        if (!future && !held && !(o.postgrid_status === 'cancelled' && !o.scheduled_date)) out.approvals_waiting++;
        const why = ops && ops.reasonFor ? ops.reasonFor(o) : '';
        if (why) out.needs_attention.push({ ...item, why });
      }
      try { out.business_requests = db.prepare("SELECT COUNT(*) n FROM business_requests WHERE status = 'new'").get().n; } catch { out.business_requests = 0; }
      for (const k of ['due_today', 'tomorrow', 'unapproved_soon']) out[k].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      res.json(out);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Profit ─────────────────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/profit', requireAdmin, (req, res) => {
    try {
      const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 90));
      const fx = parseFloat(getSetting('fx_usd_cad', '1.40')) || 1.40;
      const floor = parseFloat(getSetting('profit_floor_pct', '38')) || 38;
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      const rows = db.prepare(`SELECT id, paid_at, destination_country, page_count, colour_printing, registered_mail, certified_mail, express_mail, letter_type, price_cents, recipient_name
        FROM orders WHERE paid_at >= ? AND deleted_at IS NULL AND status NOT IN ('awaiting_payment','refunded','cancelled') AND price_cents > 0`).all(since);
      const agg = () => ({ orders: 0, revenue: 0, cost: 0 });
      const add = (a, rev, cost) => { a.orders++; a.revenue += rev; a.cost += cost; };
      const total = agg(), byCountry = {}, byAddon = {}, scored = [];
      for (const o of rows) {
        const c = estimateCost(o, fx), rev = o.price_cents || 0;
        add(total, rev, c.total);
        add(byCountry[o.destination_country || 'CA'] = byCountry[o.destination_country || 'CA'] || agg(), rev, c.total);
        const tags = [];
        if (o.colour_printing) tags.push('Colour printing');
        if (o.registered_mail) tags.push('Registered mail');
        if (o.certified_mail) tags.push('Certified mail');
        if (o.express_mail) tags.push('Express');
        if ((Number(o.page_count) || 1) > 2) tags.push('3 or more pages');
        if (o.letter_type === 'santa') tags.push('Santa letter');
        if (!tags.length) tags.push('Plain letter');
        tags.forEach(tg => add(byAddon[tg] = byAddon[tg] || agg(), rev, c.total));
        scored.push({ id: o.id, name: nameOf(o), country: o.destination_country || 'CA', revenue: rev, cost: c.total, margin: rev ? Math.round((rev - c.total) / rev * 1000) / 10 : 0 });
      }
      const fin = a => ({ orders: a.orders, revenue_cents: a.revenue, cost_cents: a.cost, profit_cents: a.revenue - a.cost, margin: a.revenue ? Math.round((a.revenue - a.cost) / a.revenue * 1000) / 10 : 0 });
      const list = o => Object.entries(o).map(([k, v]) => ({ key: k, ...fin(v) })).sort((a, b) => b.orders - a.orders);
      res.json({
        days, floor, fx, total: fin(total), by_country: list(byCountry), by_addon: list(byAddon),
        below_floor: scored.filter(o => o.margin < floor).sort((a, b) => a.margin - b.margin).slice(0, 25),
        assumptions: {
          rates_usd: RATES, intl_surcharge_usd: INTL_SURCHARGE_USD, services_usd: SERVICE_USD,
          stripe: '2.9% + C$0.30 of the price', fx_note: `${fx} CAD per USD (setting fx_usd_cad)`,
          pages_note: 'The first page is in the base rate, each extra page is charged.',
        },
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Search ─────────────────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/search', requireAdmin, (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q.length < 2) return res.json({ orders: [] });
    const num = /^#?\d{1,9}$/.test(q) ? parseInt(q.replace('#', ''), 10) : null;
    const like = '%' + q.replace(/[\\%_]/g, m => '\\' + m) + '%';
    const orders = db.prepare(`SELECT id, created_at, status, customer_email, recipient_name, recipient_city, destination_country, scheduled_date, price_cents
      FROM orders WHERE deleted_at IS NULL AND status != 'awaiting_payment' AND (
        id = ? OR customer_email LIKE ? ESCAPE '\\' OR recipient_name LIKE ? ESCAPE '\\' OR recipient_street LIKE ? ESCAPE '\\'
        OR recipient_city LIKE ? ESCAPE '\\' OR recipient_postal LIKE ? ESCAPE '\\' OR sender_name LIKE ? ESCAPE '\\' OR postgrid_letter_id LIKE ? ESCAPE '\\')
      ORDER BY id DESC LIMIT 15`).all(num == null ? -1 : num, like, like, like, like, like, like, like);
    res.json({ orders });
  });

  // ── Change an order's send date ────────────────────────────────────────────────────────────────
  app.post('/api/admin/orders/:id/scheduled-date', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const o = db.prepare('SELECT id, status, deleted_at, postgrid_letter_id, postgrid_status, scheduled_date FROM orders WHERE id = ?').get(id);
    if (!o || o.deleted_at) return res.status(404).json({ error: 'Order not found.' });
    if (o.status !== 'paid' || (o.postgrid_letter_id && o.postgrid_status !== 'cancelled')) return res.status(400).json({ error: 'This order has already gone to print, so its send date cannot change.' });
    const d = typeof req.body.date === 'string' ? req.body.date.trim() : '';
    let note;
    if (!d) {
      db.prepare('UPDATE orders SET schedule_for_later = 0, scheduled_date = NULL, send_approved_at = NULL WHERE id = ?').run(id);
      note = `Send date removed by ${req.session.admin.username} (was ${o.scheduled_date || 'none'}). Any approval was withdrawn.`;
    } else {
      const t = Date.parse(d + 'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== d) return res.status(400).json({ error: 'Choose a valid date.' });
      if (d < todayStr()) return res.status(400).json({ error: 'That date is in the past.' });
      if (t > Date.now() + 366 * 86400 * 1000) return res.status(400).json({ error: 'Choose a date within the next year.' });
      db.prepare('UPDATE orders SET schedule_for_later = 1, scheduled_date = ?, send_approved_at = NULL, postgrid_error = NULL WHERE id = ?').run(d, id);
      note = `Send date changed by ${req.session.admin.username}: ${o.scheduled_date || 'none'} to ${d}. Any approval was withdrawn, so approve it again.`;
    }
    try { db.prepare('INSERT INTO order_notes (order_id, note) VALUES (?,?)').run(id, note); } catch {}
    logAudit(req, 'order.scheduled_date', 'order', id, { from: o.scheduled_date || null, to: d || null });
    res.json({ ok: true, date: d || null });
  });
}

module.exports = { register, estimateCost };
