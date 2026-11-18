// Santa letter text. One template, used by the /santa-letter preview in the browser
// and by the server when the order is created, so what the parent previews is what gets printed.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SantaLetter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MAX = { child: 40, nice: 120, interest: 120, pet: 40, goal: 120 };

  function clean(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max)
      .replace(/[\s.!?,;:]+$/, '');
  }

  function fields(input) {
    input = input || {};
    return {
      child:    clean(input.child, MAX.child),
      nice:     clean(input.nice, MAX.nice),
      interest: clean(input.interest, MAX.interest),
      pet:      clean(input.pet, MAX.pet),
      goal:     clean(input.goal, MAX.goal),
    };
  }

  // Returns the plain-text letter, or '' when there is no child's name yet.
  function build(input) {
    var f = fields(input);
    if (!f.child) return '';
    var lines = [];
    lines.push('Dear ' + f.child + ',');
    lines.push('');
    lines.push('Ho, ho, ho! The snow is deep here at the North Pole, the cocoa is hot, and I have been reading through my Nice List. When I got to your name, ' + f.child + ', I stopped, smiled, and decided to write to you myself.');
    var mid = [];
    if (f.nice)     mid.push('I heard that ' + f.nice + '. That is exactly the kind of thing that makes my whole list glow, and I am very proud of you.');
    if (f.interest) mid.push('Word around the workshop is that you love ' + f.interest + '. The elves love it too, and they have talked about nothing else all week.');
    if (f.pet)      mid.push('Please give ' + f.pet + ' a gentle pat from me. Animals always know who has a kind heart.');
    if (f.goal)     mid.push('This year I have one small thing to ask of you: ' + f.goal + '. It will not always be easy, but I know you can do it, and the elves will be cheering for you.');
    if (mid.length) { lines.push(''); lines.push(mid.join('\n\n')); }
    lines.push('');
    lines.push('Christmas is getting close, and the reindeer are rested and ready. Remember to go to bed on time on Christmas Eve, because I do my best work when everyone is fast asleep. Rudolph and I will be very grateful for a few cookies and carrots.');
    lines.push('');
    lines.push('Thank you for being you, ' + f.child + '. Keep being kind, keep being curious, and most of all, keep believing.');
    lines.push('');
    lines.push('With love, jingle bells, and a big Merry Christmas,');
    lines.push('');
    lines.push('Santa Claus');
    lines.push('');
    lines.push('P.S. Look up on a clear night. Rudolph\'s nose is easiest to spot when the sky is dark.');
    return lines.join('\n');
  }

  // Everything the order prints, as ordered pages: each child's letter, then a Nice List certificate per child if chosen.
  // children is a list of field sets (the first is required, a second is optional). Returns [{ kind: 'letter'|'certificate', child, text }].
  function pages(input) {
    input = input || {};
    var kids = (input.children || []).map(fields).filter(function (f) { return f.child; });
    var out = kids.map(function (f) { return { kind: 'letter', child: f.child, text: build(f) }; });
    if (input.certificate) kids.forEach(function (f) { out.push({ kind: 'certificate', child: f.child, text: '#CERT#' + f.child }); });
    return out;
  }
  // The text stored on the order: pages separated by a form feed.
  function buildAll(input) { return pages(input).map(function (p) { return p.text; }).join('\n\f\n'); }
  // Rewrites a stored body with the current wording (letters are rebuilt from their own details, certificates are kept).
  function rebuild(body) {
    return String(body || '').split('\f').map(function (seg) {
      seg = seg.trim();
      return seg.indexOf('#CERT#') === 0 ? seg : build(parse(seg));
    }).filter(Boolean).join('\n\f\n');
  }

  // Recovers the fields from a letter written by any earlier version of this template (for rebuilding an order's letter).
  function parse(text) {
    text = String(text || '');
    var m = function (re) { var r = re.exec(text); return r ? r[1] : ''; };
    return fields({
      child: m(/^(?:[\s\S]*?\n)?Dear ([^,\n]+),/),
      nice: m(/I heard that ([\s\S]+?)\. That is exactly/),
      interest: m(/you love ([\s\S]+?)\. The elves love it too/),
      pet: m(/(?:Please|And please) give ([\s\S]+?) a (?:gentle )?pat from me/),
      goal: m(/small thing to ask of you: ([\s\S]+?)\. (?:I know you can do it|It will not always)/),
    });
  }

  // The address on the envelope of every Letter from Santa: the one Canada Post publishes for Santa's mail.
  var RETURN = { name: 'Santa Claus', street: 'North Pole', city: 'North Pole', province: '', postal: 'H0H 0H0', country: 'CA' };

  return { build: build, pages: pages, buildAll: buildAll, rebuild: rebuild, parse: parse, clean: clean, fields: fields, MAX: MAX, RETURN: RETURN };
});
