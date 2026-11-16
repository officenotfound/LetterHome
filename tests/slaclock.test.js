'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { clock } = require('../public/sla-clock.js');
// November 2026 is Eastern Standard Time (UTC-5). 2026-11-13 is a Friday.
const at = (iso) => Date.parse(iso);
const fmt = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

test('an order placed in business hours has a 24 hour clock from that moment', () => {
  const c = clock(at('2026-11-12T15:00:00Z'), at('2026-11-12T15:30:00Z')); // Thu 10:00 Eastern
  assert.strictEqual(c.start, at('2026-11-12T15:00:00Z'));
  assert.strictEqual(c.deadline, at('2026-11-13T15:00:00Z'));
  assert.strictEqual(c.waiting, false);
});
test('an order placed on a weekday evening starts at the next morning opening', () => {
  const c = clock(at('2026-11-12T23:00:00Z'), at('2026-11-12T23:30:00Z')); // Thu 18:00 Eastern
  assert.match(fmt(c.start), /Fri.*09:00/);
  assert.strictEqual(c.waiting, true);
  assert.match(fmt(c.deadline), /Sat|Mon/); // never lands on Sat or Sun, see next test
  assert.doesNotMatch(fmt(c.deadline), /Sat|Sun/);
});
test('a Friday evening order starts Monday at opening and is not overdue on Saturday', () => {
  const placed = at('2026-11-14T01:00:00Z'); // Fri 20:00 Eastern
  const c = clock(placed, at('2026-11-14T20:00:00Z'));
  assert.match(fmt(c.start), /Mon.*09:00/);
  assert.match(fmt(c.deadline), /Tue.*09:00/);
  assert.strictEqual(c.waiting, true);
  assert.ok(at('2026-11-15T15:00:00Z') < c.deadline - 4 * 3600000, 'not within the alert window on Sunday');
});
test('a Friday morning order has a deadline pushed past the weekend to Monday', () => {
  const c = clock(at('2026-11-13T15:00:00Z'), at('2026-11-13T15:05:00Z')); // Fri 10:00 Eastern
  assert.match(fmt(c.deadline), /Mon.*10:00/);
});
