(() => {
  const notesView = document.getElementById('notesView');
  const notesLayout = document.getElementById('notesLayout');
  const notesList = document.getElementById('notesList');
  const notesSidebar = document.querySelector('.notes-sidebar');
  const noteWorkspace = document.querySelector('.note-workspace');
  const noteBody = document.getElementById('noteBody');
  const noteTitle = document.getElementById('noteTitle');

  if (!notesView || !notesLayout || !notesList || !notesSidebar || !noteWorkspace || !noteBody || !noteTitle) return;

  /* Close the list only when the user taps the right-side note workspace.
     Never treat a tap inside the sidebar as a workspace tap. */
  notesLayout.addEventListener('click', event => {
    if (!notesLayout.classList.contains('list-open')) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('.notes-sidebar')) return;
    if (target.closest('.note-workspace')) {
      notesLayout.classList.remove('list-open');
    }
  });

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
