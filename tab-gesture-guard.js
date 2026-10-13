(() => {
  const notesView = document.getElementById('notesView');

  if (!notesView) return;

  document.addEventListener('click', event => {
    const tab = event.target instanceof Element ? event.target.closest('.tab') : null;
    if (!tab || tab.dataset.view !== 'notesView') return;

    // Real user taps are allowed. This blocks only programmatic Notes clicks
    // (for example notes-ui.js background refreshes) while another tab is active.
    if (event.isTrusted || notesView.classList.contains('active')) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
