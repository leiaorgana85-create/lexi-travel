(() => {
  const paneTitle = document.getElementById('paneDayTitle');
  const calendarGrid = document.getElementById('calendarGrid');

  function formatSelectedCalendarDate() {
    if (!paneTitle || !calendarGrid) return;
    const selected = calendarGrid.querySelector('.day-cell.selected-day');
    const dateKey = String(selected?.getAttribute('aria-label') || '');
    const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return;

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const monthDay = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric'
    }).format(date);
    const weekday = new Intl.DateTimeFormat('en-US', {
      weekday: 'short'
    }).format(date);
    const label = `${monthDay} (${weekday})`;

    if (paneTitle.textContent !== label) paneTitle.textContent = label;
  }

  if (paneTitle && calendarGrid) {
    const titleObserver = new MutationObserver(() => queueMicrotask(formatSelectedCalendarDate));
    titleObserver.observe(paneTitle, { childList: true, subtree: true, characterData: true });
    calendarGrid.addEventListener('click', () => requestAnimationFrame(formatSelectedCalendarDate));
    requestAnimationFrame(formatSelectedCalendarDate);
  }

  const shoppingStatus = document.getElementById('shoppingStatus');

  function cleanShoppingStatus() {
    if (!shoppingStatus) return;
    const text = String(shoppingStatus.textContent || '').trim();
    if (/^tap a box when purchased$/i.test(text)) shoppingStatus.textContent = '';
  }

  if (shoppingStatus) {
    const shoppingObserver = new MutationObserver(cleanShoppingStatus);
    shoppingObserver.observe(shoppingStatus, { childList: true, subtree: true, characterData: true });
    cleanShoppingStatus();
  }

  const notesView = document.getElementById('notesView');
  const notesLayout = document.getElementById('notesLayout');
  const notesList = document.getElementById('notesList');
  const notesHeading = document.querySelector('.notes-sidebar-head strong');
  const noteSaveStatus = document.getElementById('noteSaveStatus');
  const noteEditBtn = document.getElementById('noteEditBtn');

  if (notesHeading) notesHeading.textContent = 'Travel Notes';
  if (noteEditBtn) {
    noteEditBtn.setAttribute('aria-label', 'Edit note');
    noteEditBtn.title = 'Edit note';
  }

  function tidyNoteStatus() {
    if (!noteSaveStatus) return;
    const text = String(noteSaveStatus.textContent || '').trim();
    if (text === 'From Google Sheets') {
      noteSaveStatus.textContent = '';
      noteSaveStatus.hidden = true;
      return;
    }
    noteSaveStatus.hidden = !text;
  }

  if (noteSaveStatus) {
    const statusObserver = new MutationObserver(tidyNoteStatus);
    statusObserver.observe(noteSaveStatus, { childList: true, subtree: true, characterData: true });
    tidyNoteStatus();
  }

  if (notesList && notesLayout) {
    notesList.addEventListener('pointerup', event => {
      if (!event.isPrimary) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('.note-list-pin, .note-reorder-btn')) return;

      const button = target.closest('.note-list-item');
      if (!button) return;
      const id = String(button.dataset.noteId || '');
      if (!id) return;

      // Normal iOS click handling should close the reference drawer immediately.
      // If a background refresh replaced the tapped row between pointerdown and click,
      // retry once against the current row so the tap never feels dead.
      setTimeout(() => {
        if (!notesLayout.classList.contains('list-open')) return;
        if (document.querySelector('.notes-security-dialog[open]')) return;
        if (window.lexiNoteSecurity?.isLocked?.(id)) return;

        const current = notesList.querySelector(`.note-list-item[data-note-id="${CSS.escape(id)}"]`);
        if (current) current.click();
      }, 90);
    }, true);
  }

  if (notesView) {
    const actionObserver = new MutationObserver(() => {
      const protect = document.getElementById('noteProtectBtn');
      const remove = document.getElementById('noteDeleteBtn');
      if (protect) protect.title = protect.getAttribute('aria-label') || 'Protect note';
      if (remove) {
        remove.setAttribute('aria-label', 'Delete note');
        remove.title = 'Delete note';
      }
    });
    actionObserver.observe(notesView, { childList: true, subtree: true });
  }
})();
