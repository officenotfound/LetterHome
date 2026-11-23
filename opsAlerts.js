// Owner alerts and the daily summary. Nothing here sends anything to PostGrid or to customers.
const WAIT_HOURS = 24;        // a paid order not sent to print after this long
const SANTA_WAIT_HOURS = 12;  // Santa orders run on a tighter clock
const ERROR_HOURS = 2;        // an order PostGrid refused or could not take, still unsent after this long
const SANTA_DEADLINE = process.env.SANTA_DEADLINE || '12-05';

const money = c => '$' + ((c || 0) / 100).toFixed(2);

function createOps({ db, sendOwnerMail, contentHeld, now = () => new Date() }) {
  const waiting = () => db.prepare(`SELECT id, recipient_name, letter_type, paid_at, created_at, postgrid_error, scheduled_date, content_flags, content_cleared_at,
      addr_check_status, addr_check_note, stuck_alert_sent_at, price_cents, send_approved_at
    FROM orders WHERE status = 'paid' AND (postgrid_letter_id IS NULL OR (postgrid_status = 'cancelled' AND paid_at > datetime('now','-30 days'))) AND deleted_at IS NULL ORDER BY COALESCE(paid_at, created_at) ASC`).all();

  const hoursSince = (ts, at) => {
    const t = Date.parse(String(ts || '').replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(String(ts || '')) ? '' : 'Z'));
    return Number.isFinite(t) ? (at.getTime() - t) / 3600000 : 0;
  };

  // Why an unsent order needs the owner, or '' when it is just waiting its turn.
  function reasonFor(o, at = now()) {
    const today = at.toISOString().slice(0, 10);
    if (o.scheduled_date && o.scheduled_date > today) return '';
    const age = hoursSince(o.paid_at || o.created_at, at);
    const limit = o.letter_type === 'santa' ? SANTA_WAIT_HOURS : WAIT_HOURS;
    const held = contentHeld ? !!contentHeld(o) : false;
    if (held) return age >= limit ? 'held for content review' : '';
    if (o.postgrid_error && /^MANUAL/.test(o.postgrid_error) && !/Scheduled for/.test(o.postgrid_error) && age >= ERROR_HOURS) return 'PostGrid problem: ' + o.postgrid_error.replace(/^MANUAL: /, '').slice(0, 140);
    if (o.postgrid_error && /^RETRY/.test(o.postgrid_error) && age >= ERROR_HOURS) return 'PostGrid retrying: ' + o.postgrid_error.replace(/^RETRY: /, '').slice(0, 140);
    if (age >= limit) return `waiting ${Math.floor(age)} hours for your approval`;
    return '';
  }

  // Emails the owner once about each order that has been waiting too long or hit an error.
  async function stuckJob() {
    const fresh = [];
    for (const o of waiting()) {
      if (o.stuck_alert_sent_at) continue;
      const why = reasonFor(o);
      if (why) fresh.push({ o, why });
    }
    if (!fresh.length) return { sent: 0 };
    const lines = fresh.map(({ o, why }) => `  Order #${o.id}${o.letter_type === 'santa' ? ' (Santa)' : ''}: ${o.recipient_name || 'no name'}, ${why}`).join('\n');
    await sendOwnerMail(`${fresh.length} order${fresh.length > 1 ? 's need' : ' needs'} you`,
      `These paid orders have not gone to print:\n\n${lines}\n\nOpen Admin, Orders, Approvals to look at them and send them. Each order is only mentioned once here.`);
    const mark = db.prepare('UPDATE orders SET stuck_alert_sent_at = CURRENT_TIMESTAMP WHERE id = ?');
    for (const { o } of fresh) mark.run(o.id);
    return { sent: fresh.length };
  }

  function summaryText(at = now()) {
    const since = new Date(at.getTime() - 24 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    const paidRows = db.prepare(`SELECT price_cents, letter_type FROM orders WHERE paid_at >= ? AND deleted_at IS NULL AND status != 'refunded'`).all(since);
    const revenue = paidRows.reduce((n, r) => n + (r.price_cents || 0), 0);
    const santaNew = paidRows.filter(r => r.letter_type === 'santa').length;
    const mailed = db.prepare(`SELECT COUNT(*) n FROM orders WHERE status IN ('mailed','delivered') AND mailed_at >= ? AND deleted_at IS NULL`).get(since).n;
    const wait = waiting();
    const needs = wait.map(o => ({ o, why: reasonFor(o) })).filter(x => x.why);
    const unverified = wait.filter(o => o.addr_check_status === 'unverified');
    const santaWait = wait.filter(o => o.letter_type === 'santa').length;
    const y = at.getFullYear();
    const cutoff = new Date(`${y}-${SANTA_DEADLINE}T23:59:59`);
    const daysLeft = Math.ceil((cutoff - at) / 86400000);
    const out = [];
    out.push('Last 24 hours');
    out.push(`  Paid orders: ${paidRows.length} (${money(revenue)})${santaNew ? `, ${santaNew} Santa` : ''}`);
    out.push(`  Letters mailed: ${mailed}`);
    out.push('');
    out.push('Waiting for you');
    out.push(`  ${wait.length} paid order${wait.length === 1 ? '' : 's'} not yet sent to print${santaWait ? `, ${santaWait} of them Santa` : ''}`);
    if (needs.length) { out.push(`  ${needs.length} need${needs.length === 1 ? 's' : ''} attention:`); needs.slice(0, 15).forEach(({ o, why }) => out.push(`    #${o.id} ${o.recipient_name || ''}: ${why}`)); }
    const approved = wait.filter(o => o.send_approved_at && o.scheduled_date && o.scheduled_date >= at.toISOString().slice(0, 10)).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
    if (approved.length) { out.push(''); out.push('Approved and scheduled (go to print on their own)'); approved.slice(0, 15).forEach(o => out.push(`  #${o.id} ${o.recipient_name || ''}: ${o.scheduled_date}`)); }
    if (unverified.length) out.push(`  ${unverified.length} with an address PostGrid could not verify (#${unverified.map(o => o.id).join(', #')}); they will print as entered.`);
    if (daysLeft > 0 && daysLeft <= 30) { out.push(''); out.push(`Santa cut-off (December 5): ${daysLeft} day${daysLeft === 1 ? '' : 's'} left.`); }
    out.push('');
    out.push('Admin: /admin/approvals');
    return out.join('\n');
  }

  async function sendSummary() {
    const text = summaryText();
    const day = now().toISOString().slice(0, 10);
    await sendOwnerMail(`Daily summary ${day}`, text);
    return text;
  }

  return { stuckJob, summaryText, sendSummary, reasonFor };
}

// Tags for orders that usually need a human look, with the reason shown in Approvals.
function mailTags(o) {
  const text = [o.recipient_name, o.recipient_street].join('\n');
  const tags = [];
  if (/\b(correctional|corrections|penitentiary|prison|jail|detention|inmate|institution|remand|youth centre|youth center|gaol)\b/i.test(text) || /\b(min|inmate|id|offender)\s*(no\.?|number|#)?\s*:?\s*\d{4,}\b/i.test(text))
    tags.push({ key: 'facility', label: 'Prison or institution', hint: 'Facilities often limit pages, colour and what can be enclosed. Check their mail rules.' });
  if (/\b(p\.?\s?o\.?|post\s+office|g\.?p\.?o\.?)\s+box\b|\bpob\b/i.test(text)) tags.push({ key: 'pobox', label: 'PO Box', hint: 'PostGrid often cannot verify PO Box addresses; they print as entered.' });
  if (/\b(rr|r\.r\.)\s*#?\s*\d+\b|\brural route\b|\bsite\s+\d+\b.*\bcomp\b|\bgeneral delivery\b|\bmsc\b|\bposte restante\b/i.test(text)) tags.push({ key: 'rural', label: 'Rural or general delivery', hint: 'Rural routes and general delivery are often not verified; check the postal code.' });
  if (/(^|\n)\s*(c\/o|care of|attn|attention)\b/i.test(text) || /\b(nursing home|care home|retirement|long.term care|hospital)\b/i.test(text)) tags.push({ key: 'careof', label: 'Care of or care home', hint: 'Make sure the recipient name is on the envelope and the unit or room is included.' });
  return tags;
}

module.exports = { createOps, mailTags };
