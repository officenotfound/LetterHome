// "Tell me when this opens" forms. Posts to the existing contact endpoint, so every
// sign-up lands in the admin Messages list and in the support inbox.
(function () {
  document.querySelectorAll('form[data-interest]').forEach(function (form) {
    var msg = form.querySelector('.form-msg');
    var btn = form.querySelector('button[type="submit"]');
    function show(text, cls) { msg.textContent = text; msg.className = 'form-msg ' + (cls || ''); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.elements.name.value.trim();
      var email = form.elements.email.value.trim();
      var note = form.elements.note ? form.elements.note.value.trim() : '';
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return show('Please enter your name and a valid email.', 'err');
      if (!form.elements.consent.checked) return show('Please tick the box so we know it is OK to email you once.', 'err');
      btn.disabled = true;
      show('Sending...', '');
      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          email: email,
          message: 'Waitlist: ' + form.getAttribute('data-interest') + '\n' + (note || '(no note)') + '\n\nAgreed to receive one email when this opens.',
        }),
      }).then(function (r) {
        if (!r.ok) throw new Error('bad');
        form.querySelectorAll('input,textarea').forEach(function (el) { el.disabled = true; });
        btn.style.display = 'none';
        show('Thanks. You are on the list, and we will email you once when it opens.', 'ok');
      }).catch(function () {
        btn.disabled = false;
        show('Something went wrong. Please email support@letterhome.ca and we will add you.', 'err');
      });
    });
  });
})();
