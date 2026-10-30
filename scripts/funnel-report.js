// Prints how far visitors get through checkout, by day, plus unpaid-order recovery stats.
// Usage: node scripts/funnel-report.js [days=30]
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.DB_PATH || require('path').join(__dirname, '..', 'orders.db'), { readOnly: true });
const days = parseInt(process.argv[2], 10) || 30;
const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const steps = ['send_view', 'step2', 'step3', 'pay_click', 'resume_click'];
const rows = db.prepare('SELECT step, COUNT(*) n FROM funnel_events WHERE day >= ? GROUP BY step').all(since);
const n = Object.fromEntries(rows.map(r => [r.step, r.n]));
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(0) + '%' : '-');
console.log(`Checkout funnel, last ${days} days`);
console.log(`  opened /send         ${n.send_view || 0}`);
console.log(`  reached letter step  ${n.step2 || 0}   (${pct(n.step2 || 0, n.send_view || 0)} of opens)`);
console.log(`  reached review step  ${n.step3 || 0}   (${pct(n.step3 || 0, n.step2 || 0)} of letter step)`);
console.log(`  clicked Pay          ${n.pay_click || 0}   (${pct(n.pay_click || 0, n.step3 || 0)} of review step)`);
console.log(`  used resume email    ${n.resume_click || 0}`);
const o = db.prepare(`SELECT SUM(status != 'awaiting_payment') paid, SUM(status = 'awaiting_payment') unpaid, SUM(recovery_sent_at IS NOT NULL) recovery_sent FROM orders WHERE deleted_at IS NULL AND created_at >= ?`).get(since);
console.log(`Orders: ${o.paid || 0} paid, ${o.unpaid || 0} left unpaid, ${o.recovery_sent || 0} recovery emails sent`);
console.log(`Pay click -> paid: ${pct(o.paid || 0, n.pay_click || 0)}  (low = card/Stripe problem)`);
