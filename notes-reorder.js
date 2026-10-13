(() => {
  const ORDER_STORAGE = 'lexiTravelNoteOrderV1';
  const notesList = document.getElementById('notesList');
  const sidebarActions = document.querySelector('.notes-sidebar-actions');

  if (!notesList || !sidebarActions) return;

  let applyingOrder = false;
  let reorderMode = false;

  function readOrder() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ORDER_STORAGE) || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (error) {
      return [];
    }
  }

  function currentButtons() {
    return [...notesList.querySelectorAll('.note-list-item[data-note-id]')];
  }

  function saveCurrentOrder() {
    const ids = currentButtons()
      .map(button => String(button.dataset.noteId || ''))
      .filter(Boolean);
    localStorage.setItem(ORDER_STORAGE, JSON.stringify(ids));
  }

  function applySavedOrder() {
    if (applyingOrder) return;
    const buttons = currentButtons();
    if (buttons.length < 2) return;

    const saved = readOrder();
    if (!saved.length) return;

    const rank = new Map(saved.map((id, index) => [id, index]));
    const originalIndex = new Map(buttons.map((button, index) => [button, index]));
    const sorted = buttons.slice().sort((a, b) => {
      const aId = String(a.dataset.noteId || '');
      const bId = String(b.dataset.noteId || '');
      const aRank = rank.has(aId) ? rank.get(aId) : Number.MAX_SAFE_INTEGER;
      const bRank = rank.has(bId) ? rank.get(bId) : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return originalIndex.get(a) - originalIndex.get(b);
    });

    if (sorted.every((button, index) => button === buttons[index])) return;

    applyingOrder = true;
    try {
      sorted.forEach(button => notesList.append(button));
    } finally {
      applyingOrder = false;
    }
  }

  function moveNote(id, direction) {
    const buttons = currentButtons();
    const index = buttons.findIndex(button => String(button.dataset.noteId || '') === String(id));
    if (index < 0) return;

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= buttons.length) return;

    applyingOrder = true;
    try {
      if (direction < 0) {
        notesList.insertBefore(buttons[index], buttons[targetIndex]);
      } else {
        notesList.insertBefore(buttons[targetIndex], buttons[index]);
      }
      saveCurrentOrder();
    } finally {
      applyingOrder = false;
    }

    decorate();
  }

  function makeMoveControl(label, symbol, direction, id) {
    const control = document.createElement('span');
    control.className = 'note-reorder-btn';
    control.setAttribute('role', 'button');
    control.setAttribute('tabindex', '0');
    control.setAttribute('aria-label', label);
    control.textContent = symbol;

    const activate = event => {
      event.preventDefault();
      event.stopPropagation();
      moveNote(id, direction);
    };

    control.addEventListener('click', activate);
    control.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });
    return control;
  }

  function decorate() {
    if (applyingOrder) return;

    const buttons = currentButtons();
    buttons.forEach(button => {
      const id = String(button.dataset.noteId || '');
      if (!id) return;

      let controls = button.querySelector('.note-reorder-controls');
      if (!controls) {
        controls = document.createElement('span');
        controls.className = 'note-reorder-controls';
        button.append(controls);
      }

      controls.replaceChildren(
        makeMoveControl('Move note up', '↑', -1, id),
        makeMoveControl('Move note down', '↓', 1, id)
      );
    });

    notesList.classList.toggle('reorder-mode', reorderMode);
    applySavedOrder();
  }

  const reorderBtn = document.createElement('button');
  reorderBtn.id = 'noteReorderBtn';
  reorderBtn.className = 'notes-mini-btn';
  reorderBtn.type = 'button';
  reorderBtn.textContent = '↕';
  reorderBtn.setAttribute('aria-label', 'Reorder notes');
  reorderBtn.title = 'Reorder notes';
  sidebarActions.prepend(reorderBtn);

  reorderBtn.addEventListener('click', () => {
    reorderMode = !reorderMode;
    reorderBtn.classList.toggle('active', reorderMode);
    reorderBtn.setAttribute('aria-pressed', String(reorderMode));
    decorate();
  });

  const observer = new MutationObserver(() => {
    if (!applyingOrder) queueMicrotask(decorate);
  });
  observer.observe(notesList, { childList: true, subtree: true });

  queueMicrotask(decorate);
})();
