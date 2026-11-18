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
    lines.push('* * * * * * * * * * * * * * *');
    lines.push('OFFICE OF SANTA CLAUS');
    lines.push('Workshop Lane, The North Pole');
    lines.push('Official Nice List Correspondence');
    lines.push('* * * * * * * * * * * * * * *');
    lines.push('');
    lines.push('Dear ' + f.child + ',');
    lines.push('');
    lines.push('Ho, ho, ho! The snow is deep here at the North Pole, the cocoa is hot, and I have been reading through my Nice List this week. When I got to your name, ' + f.child + ', I stopped, smiled, and decided to write to you myself.');
    var mid = [];
    if (f.nice)     mid.push('I heard that ' + f.nice + '. That is exactly the kind of thing that makes my whole list glow, and I wanted you to know how proud I am of you.');
    if (f.interest) mid.push('Word around the workshop is that you love ' + f.interest + '. The elves love it too, and they have been talking about it all week. One of them even asked if there might be a little something about it in my sleigh, but I never give away my secrets.');
    if (mid.length || f.pet || f.goal) { lines.push(''); lines.push('Mrs. Claus says I may not tell you everything the elves report about you, but I can share some of it.'); }
    if (mid.length) { lines.push(''); lines.push(mid.join('\n\n')); }
    if (f.pet) {
      lines.push('');
      lines.push('And please give ' + f.pet + ' a gentle pat from me. The reindeer say that animals always know who has a kind heart, and I think ' + f.pet + ' knows it about you.');
    }
    if (f.goal) {
      lines.push('');
      lines.push('This year I have one small thing to ask of you: ' + f.goal + '. It will not always be easy, but I have watched many children try hard things, and I know you can do it. Every little try counts, and the elves will be cheering for you.');
    }
    lines.push('');
    lines.push('Christmas is getting close. The reindeer are rested, the sleigh is polished, and the elves are wrapping at top speed. Remember to go to bed on time on Christmas Eve, because I do my best work when everyone is fast asleep. If you leave out a few cookies and some carrots, Rudolph and I will be very grateful.');
    lines.push('');
    lines.push('Thank you for being you, ' + f.child + '. Keep being kind, keep being curious, and most of all, keep believing. The magic of Christmas is strongest in the people who do.');
    lines.push('');
    lines.push('With love, jingle bells, and a big Merry Christmas,');
    lines.push('');
    lines.push('Santa Claus');
    lines.push('North Pole');
    lines.push('');
    lines.push('P.S. Look up on a clear night. Rudolph\'s nose is easiest to spot when the sky is dark, and I may be flying by sooner than you think.');
    return lines.join('\n');
  }

  // The address on the envelope of every Letter from Santa: the one Canada Post publishes for Santa's mail.
  var RETURN = { name: 'Santa Claus', street: 'North Pole', city: 'North Pole', province: '', postal: 'H0H 0H0', country: 'CA' };

  return { build: build, clean: clean, fields: fields, MAX: MAX, RETURN: RETURN };
});
