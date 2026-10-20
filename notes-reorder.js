(() => {
  const ORDER_STORAGE = 'lexiTravelNoteOrderV1';
  const notesList = document.getElementById('notesList');
  const sidebarActions = document.querySelector('.notes-sidebar-actions');
  const notesTab = document.querySelector('.tab[data-view="notesView"]');

  if (!notesList || !sidebarActions) return;

  let applyingOrder = false;
  let reorderMode = false;
  let orderCapability = null;
  let capabilityPromise = null;
  let persistPromise = null;

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

  function isPinnedButton(button) {
    return Boolean(button?.classList.contains('pinned-note'));
  }

  function saveCurrentOrder() {
    const ids = currentButtons()
      .map(button => String(button.dataset.noteId || ''))
      .filter(Boolean);
    localStorage.setItem(ORDER_STORAGE, JSON.stringify(ids));
    return ids;
  }

  async function postOrderAction(action, fields = {}) {
    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) throw new Error('Not connected');

    const body = new URLSearchParams({ key, action });
    for (const [name, value] of Object.entries(fields)) {
      body.set(name, value == null ? '' : String(value));
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      body,
      cache: 'no-store',
      redirect: 'follow'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Note order sync failed');
    return data;
  }

  async function supportsDurableOrder(force = false) {
    if (!localStorage.getItem(KEY_STORAGE)) return false;
    if (!force && orderCapability !== null) return orderCapability;
    if (capabilityPromise) return capabilityPromise;

    capabilityPromise = (async () => {
      try {
        const data = await postOrderAction('noteCapabilities');
        orderCapability = Boolean(data.noteOrder);
      } catch (error) {
        orderCapability = false;
      } finally {
        capabilityPromise = null;
      }
      return orderCapability;
    })();

    return capabilityPromise;
  }

  async function persistOrder(ids) {
    const orderedIds = (ids || []).map(String).filter(Boolean);
    if (orderedIds.length < 2 || persistPromise) return persistPromise;

    persistPromise = (async () => {
      try {
        if (!await supportsDurableOrder()) return false;
        await postOrderAction('noteOrder', { ids: JSON.stringify(orderedIds) });
        return true;
      } catch (error) {
        orderCapability = null;
        return false;
      } finally {
        persistPromise = null;
      }
    })();

    return persistPromise;
  }

  function applySavedOrder() {
    if (applyingOrder) return;
    const buttons = currentButtons();
    if (buttons.length < 2) return;

    const saved = readOrder();
    const rank = new Map(saved.map((id, index) => [id, index]));
    const originalIndex = new Map(buttons.map((button, index) => [button, index]));
    const sorted = buttons.slice().sort((a, b) => {
      /* Pin status always wins. Manual order is only applied within the
         pinned group and within the unpinned group. */
      const pinDiff = Number(isPinnedButton(b)) - Number(isPinnedButton(a));
      if (pinDiff) return pinDiff;

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

    /* Never let manual reordering move a pinned note into the unpinned
       section or an unpinned note above the pinned section. */
    if (isPinnedButton(buttons[index]) !== isPinnedButton(buttons[targetIndex])) return;

    applyingOrder = true;
    try {
      if (direction < 0) {
        notesList.insertBefore(buttons[index], buttons[targetIndex]);
      } else {
        notesList.insertBefore(buttons[targetIndex], buttons[index]);
      }
      const ids = saveCurrentOrder();
      persistOrder(ids);
    } finally {
      applyingOrder = false;
    }
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
      if (!id || button.querySelector('.note-reorder-controls')) return;

      const controls = document.createElement('span');
      controls.className = 'note-reorder-controls';
      controls.append(
        makeMoveControl('Move note up', '↑', -1, id),
        makeMoveControl('Move note down', '↓', 1, id)
      );
      button.append(controls);
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
  reorderBtn.setAttribute('aria-pressed', 'false');
  reorderBtn.title = 'Reorder notes';
  sidebarActions.prepend(reorderBtn);

  reorderBtn.addEventListener('click', () => {
    reorderMode = !reorderMode;
    reorderBtn.setAttribute('aria-pressed', String(reorderMode));
    notesList.classList.toggle('reorder-mode', reorderMode);
  });

  notesTab?.addEventListener('click', () => {
    const saved = readOrder();
    if (saved.length > 1) {
      supportsDurableOrder(true).then(supported => {
        if (supported) persistOrder(saved);
      });
    }
  });

  const observer = new MutationObserver(() => {
    if (!applyingOrder) queueMicrotask(decorate);
  });
  observer.observe(notesList, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  queueMicrotask(decorate);
})();
