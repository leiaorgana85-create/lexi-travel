(() => {
  const notesTab = document.querySelector('.tab[data-view="notesView"]');
  const notesList = document.getElementById('notesList');
  const noteEditBtn = document.getElementById('noteEditBtn');
  const noteDeleteBtn = document.getElementById('noteDeleteBtn');
  const noteSaveBtn = document.getElementById('noteSaveBtn');
  const noteCancelBtn = document.getElementById('noteCancelBtn');
  const noteTitleInput = document.getElementById('noteTitleInput');
  const noteSaveStatus = document.getElementById('noteSaveStatus');

  if (!notesList) return;

  function noteById(id) {
    try {
      return (appData.notes || []).find(note => String(note.ID || '') === String(id)) || null;
    } catch (_) {
      return null;
    }
  }

  function isReadOnlyNote(id) {
    const note = noteById(id);
    const marker = `${note?.Title || ''} ${note?.Category || ''}`;
    return /\blabs?\b|\bread[- ]?only\b/i.test(marker);
  }

  function selectedNoteId() {
    return notesList.querySelector('.note-list-item.active')?.dataset.noteId || '';
  }

  function isReadOnlySelected() {
    return isReadOnlyNote(selectedNoteId());
  }

  function decorateReadOnlyList() {
    notesList.querySelectorAll('.note-list-item[data-note-id]').forEach(button => {
      const readOnly = isReadOnlyNote(String(button.dataset.noteId || ''));
      if (button.classList.contains('read-only-note') !== readOnly) {
        button.classList.toggle('read-only-note', readOnly);
      }
      if (readOnly) button.setAttribute('data-read-only', 'true');
      else button.removeAttribute('data-read-only');
    });
  }

  function applyReadOnlyState() {
    decorateReadOnlyList();
    if (!isReadOnlySelected()) return;
    if (noteEditBtn) noteEditBtn.hidden = true;
    if (noteDeleteBtn) noteDeleteBtn.hidden = true;
    if (noteSaveBtn) noteSaveBtn.hidden = true;
    if (noteCancelBtn) noteCancelBtn.hidden = true;
    if (noteTitleInput) noteTitleInput.hidden = true;
    if (noteSaveStatus) noteSaveStatus.textContent = 'Read-only';
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !isReadOnlySelected()) return;
    if (!target.closest('#noteEditBtn, #noteDeleteBtn')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    applyReadOnlyState();
  }, true);

  notesList.addEventListener('click', () => setTimeout(applyReadOnlyState, 0));
  notesTab?.addEventListener('click', () => setTimeout(applyReadOnlyState, 0));

  const observer = new MutationObserver(() => queueMicrotask(applyReadOnlyState));
  observer.observe(notesList, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-note-id']
  });

  queueMicrotask(applyReadOnlyState);
})();
