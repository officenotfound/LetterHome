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
    lines.push('From Santa\'s Workshop');
    lines.push('The North Pole');
    lines.push('');
    lines.push('Dear ' + f.child + ',');
    lines.push('');
    lines.push('Ho, ho, ho! I hope this letter finds you well. The elves and I have been busy in the workshop, and your name keeps coming up.');
    var middle = [];
    if (f.nice)     middle.push('I heard that ' + f.nice + '. That is exactly the kind of thing that makes my whole list glow, and I wanted to tell you myself how proud I am of you.');
    if (f.interest) middle.push('Word around the North Pole is that you love ' + f.interest + '. The elves love it too, and they have been talking about it all week.');
    if (f.pet)      middle.push('Please give ' + f.pet + ' a pat from me.');
    if (f.goal)     middle.push('This year I have one small thing to ask of you: ' + f.goal + '. I know you can do it.');
    if (middle.length) { lines.push(''); lines.push(middle.join(' ')); }
    lines.push('');
    lines.push('Christmas is getting close, and the reindeer are rested and ready. Remember to go to bed on time on Christmas Eve, because I do my best work when everyone is asleep.');
    lines.push('');
    lines.push('Thank you for being you, ' + f.child + '. Keep being kind, keep being curious, and keep believing.');
    lines.push('');
    lines.push('Merry Christmas,');
    lines.push('');
    lines.push('Santa Claus');
    lines.push('North Pole');
    return lines.join('\n');
  }

  return { build: build, clean: clean, fields: fields, MAX: MAX };
});
