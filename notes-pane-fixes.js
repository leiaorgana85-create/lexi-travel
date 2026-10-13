(() => {
  const notesView = document.getElementById('notesView');
  const notesLayout = document.getElementById('notesLayout');
  const notesList = document.getElementById('notesList');
  const noteBody = document.getElementById('noteBody');
  const noteTitle = document.getElementById('noteTitle');

  if (!notesView || !notesLayout || !notesList || !noteBody || !noteTitle) return;

  /* iPhone PWA: use the real pointer gesture rather than relying on click.
     A short tap on the exposed note body closes the list; a scroll does not.
     Consume that first tap so it cannot also activate a checkbox/link underneath. */
  const TAP_MOVE_THRESHOLD = 10;
  let bodyPointerId = null;
  let bodyStartX = 0;
  let bodyStartY = 0;
  let bodyMoved = false;

  noteBody.addEventListener('pointerdown', event => {
    if (!event.isPrimary || !notesLayout.classList.contains('list-open')) return;
    bodyPointerId = event.pointerId;
    bodyStartX = event.clientX;
    bodyStartY = event.clientY;
    bodyMoved = false;
  }, true);

  noteBody.addEventListener('pointermove', event => {
    if (!event.isPrimary || event.pointerId !== bodyPointerId || bodyMoved) return;
    if (
      Math.abs(event.clientX - bodyStartX) > TAP_MOVE_THRESHOLD ||
      Math.abs(event.clientY - bodyStartY) > TAP_MOVE_THRESHOLD
    ) {
      bodyMoved = true;
    }
  }, true);

  noteBody.addEventListener('pointerup', event => {
    if (!event.isPrimary || event.pointerId !== bodyPointerId) return;
    const shouldClose = notesLayout.classList.contains('list-open') && !bodyMoved;
    bodyPointerId = null;
    bodyMoved = false;

    if (!shouldClose) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    notesLayout.classList.remove('list-open');
  }, true);

  noteBody.addEventListener('pointercancel', () => {
    bodyPointerId = null;
    bodyMoved = false;
  }, true);

  function isBangkokScheduleSelected() {
    const active = notesList.querySelector('.note-list-item.active');
    const id = String(active?.dataset.noteId || '');
    const title = String(noteTitle.textContent || '');
    const listText = String(active?.textContent || '');
    return id === 'bangkok-work-schedule' || /bangkok.*schedule/i.test(title) || /bangkok.*schedule/i.test(listText);
  }

  function equalizeBangkokScheduleColumns() {
    if (!isBangkokScheduleSelected()) return;

    noteBody.querySelectorAll('.note-table').forEach(table => {
      const rows = [...table.rows];
      const columnCount = Math.max(0, ...rows.map(row => row.cells.length));
      if (!columnCount) return;

      const width = `${100 / columnCount}%`;
      table.style.setProperty('width', '100%', 'important');
      table.style.setProperty('table-layout', 'fixed', 'important');

      rows.forEach(row => {
        [...row.cells].forEach(cell => {
          cell.style.setProperty('width', width, 'important');
          cell.style.setProperty('max-width', width, 'important');
          cell.style.setProperty('box-sizing', 'border-box', 'important');
        });
      });
    });
  }

  const bodyObserver = new MutationObserver(() => queueMicrotask(equalizeBangkokScheduleColumns));
  bodyObserver.observe(noteBody, { childList: true, subtree: true });

  const listObserver = new MutationObserver(() => queueMicrotask(equalizeBangkokScheduleColumns));
  listObserver.observe(notesList, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-note-id']
  });

  const titleObserver = new MutationObserver(() => queueMicrotask(equalizeBangkokScheduleColumns));
  titleObserver.observe(noteTitle, { childList: true, subtree: true, characterData: true });

  notesList.addEventListener('click', () => setTimeout(equalizeBangkokScheduleColumns, 0));
  queueMicrotask(equalizeBangkokScheduleColumns);
})();
