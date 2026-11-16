// Fulfilment clock for the admin. A letter cannot be mailed outside business hours, so the 24 hours only start
// when the print and mail facility is next open: Monday to Friday, 9:00 to 17:00 Eastern. An order placed on a
// Friday evening or at the weekend starts its clock on Monday at 9:00, and a deadline never lands on a weekend.
// Used by the admin screens (browser) and the overdue email (server).
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.LHSla = factory(); })(this, function () {
  var TZ = 'America/Toronto', OPEN = 9, CLOSE = 17, HOURS = 24;
  var fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false });
  function local(ms) {
    var p = {}; fmt.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return { day: p.weekday, hour: +p.hour % 24 };
  }
  function weekend(ms) { var d = local(ms).day; return d === 'Sat' || d === 'Sun'; }
  function isOpen(ms) { var l = local(ms); return !weekend(ms) && l.hour >= OPEN && l.hour < CLOSE; }
  // First moment (to the quarter hour) the facility is open, at or after ms
  function nextOpen(ms) {
    if (isOpen(ms)) return ms;
    var t = Math.ceil(ms / 900000) * 900000;
    for (var i = 0; i < 700 && !isOpen(t); i++) t += 900000;
    return t;
  }
  // { start, deadline, waiting } for an order paid at createdMs. waiting = clock has not started yet.
  function clock(createdMs, nowMs) {
    var start = nextOpen(createdMs);
    var deadline = start + HOURS * 3600000;
    for (var i = 0; i < 3 && weekend(deadline); i++) deadline += 86400000;
    return { start: start, deadline: deadline, waiting: nowMs < start };
  }
  return { clock: clock, isOpen: isOpen, nextOpen: nextOpen, TZ: TZ };
});
