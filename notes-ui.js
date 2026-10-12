(() => {
  const DRAFT_STORAGE = 'lexiTravelNoteDraftsV1';
  const notesTab = document.querySelector('.tab[data-view="notesView"]');
  const notesLayout = document.getElementById('notesLayout');
  const notesList = document.getElementById('notesList');
  const notesSidebarHead = document.querySelector('.notes-sidebar-head');
  const notesCloseBtn = document.getElementById('notesCloseBtn');
  const noteActions = document.querySelector('.note-actions');
  const noteEditBtn = document.getElementById('noteEditBtn');
  const noteSaveBtn = document.getElementById('noteSaveBtn');
  const noteCancelBtn = document.getElementById('noteCancelBtn');

  if (!notesTab || !notesLayout || !notesList || !notesSidebarHead || !noteActions) return;

  let pendingSelectId = '';
  let createLocked = false;

  function readDrafts() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_STORAGE) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writeDrafts(drafts) {
    localStorage.setItem(DRAFT_STORAGE, JSON.stringify(drafts));
  }

  function isTrue(value) {
    return value === true || String(value || '').toUpperCase() === 'TRUE';
  }

  function mergeLocalState() {
    const drafts = readDrafts();
    const seen = new Set();

    appData.notes = (appData.notes || []).map(note => {
      const id = String(note.ID || '');
      seen.add(id);
      const draft = drafts[id];
      return draft ? { ...note, ...draft } : note;
    });

    for (const [id, draft] of Object.entries(drafts)) {
      if (!draft?._localNew || seen.has(String(id))) continue;
      appData.notes.push({
        ID: id,
        Title: 'New Note',
        Body: '- ',
        Pinned: false,
        'Sort Order': 9999,
        Archived: false,
        ...draft
      });
    }
  }

  const actualLoadAllData = loadAllData;
  const wrappedLoadAllData = async function (...args) {
    const result = await actualLoadAllData(...args);
    mergeLocalState();
    return result;
  };
  loadAllData = wrappedLoadAllData;

  function visibleNotes() {
    return (appData.notes || [])
      .filter(note => !isTrue(note.Archived))
      .slice()
      .sort((a, b) => {
        const pinned = Number(isTrue(b.Pinned)) - Number(isTrue(a.Pinned));
        if (pinned) return pinned;
        const order = Number(a['Sort Order'] || 9999) - Number(b['Sort Order'] || 9999);
        if (order) return order;
        return String(a.Title || '').localeCompare(String(b.Title || ''));
      });
  }

  function currentSelectedId() {
    return notesList.querySelector('.note-list-item.active')?.dataset.noteId || '';
  }

  function noteById(id) {
    return (appData.notes || []).find(note => String(note.ID || '') === String(id)) || null;
  }

  function localRefresh() {
    mergeLocalState();
    const currentLoader = loadAllData;
    loadAllData = async () => true;
    try {
      notesTab.click();
    } finally {
      loadAllData = currentLoader;
    }
  }

  const sidebarActions = document.createElement('div');
  sidebarActions.className = 'notes-sidebar-actions';

  const newBtn = document.createElement('button');
  newBtn.id = 'noteNewBtn';
  newBtn.className = 'notes-mini-btn';
  newBtn.type = 'button';
  newBtn.textContent = '+';
  newBtn.setAttribute('aria-label', 'Add new note');
  newBtn.title = 'New note';

  notesSidebarHead.insertBefore(sidebarActions, notesCloseBtn);
  sidebarActions.append(newBtn, notesCloseBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.id = 'noteDeleteBtn';
  deleteBtn.className = 'note-action-btn note-delete-btn';
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete';
  noteActions.insertBefore(deleteBtn, noteEditBtn?.nextSibling || null);

  function togglePin(id) {
    const note = noteById(id);
    if (!note) return;

    const nextPinned = !isTrue(note.Pinned);
    note.Pinned = nextPinned;

    const drafts = readDrafts();
    drafts[id] = {
      ...(drafts[id] || {}),
      Pinned: nextPinned,
      savedAt: Date.now()
    };
    writeDrafts(drafts);
    pendingSelectId = id;
    localRefresh();
  }

  function decorateList() {
    const notes = visibleNotes();
    const buttons = [...notesList.querySelectorAll('.note-list-item')];

    buttons.forEach((button, index) => {
      const note = notes[index];
      if (!note) return;

      const id = String(note.ID || '');
      button.dataset.noteId = id;
      button.classList.toggle('pinned-note', isTrue(note.Pinned));

      let pin = button.querySelector('.note-list-pin');
      if (!pin) {
        pin = document.createElement('span');
        pin.className = 'note-list-pin';
        pin.setAttribute('role', 'button');
        pin.setAttribute('aria-label', 'Pin note');
        pin.title = 'Pin note';
        pin.textContent = '📌';
        button.append(pin);
      }

      pin.classList.toggle('active', isTrue(note.Pinned));
      pin.setAttribute('aria-label', isTrue(note.Pinned) ? 'Unpin note' : 'Pin note');
      pin.title = isTrue(note.Pinned) ? 'Unpin note' : 'Pin note';
      pin.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        togglePin(id);
      };
    });

    const selected = noteById(currentSelectedId());
    deleteBtn.hidden = !selected || Boolean(noteEditBtn?.hidden);

    if (pendingSelectId) {
      const target = buttons.find(button => button.dataset.noteId === pendingSelectId);
      if (target) {
        const targetId = pendingSelectId;
        pendingSelectId = '';
        target.click();
        requestAnimationFrame(() => {
          if (currentSelectedId() === targetId && noteEditBtn && !noteEditBtn.hidden) {
            noteEditBtn.click();
          }
        });
      }
    }
  }

  const observer = new MutationObserver(decorateList);
  observer.observe(notesList, { childList: true, subtree: true });
  decorateList();

  newBtn.addEventListener('click', () => {
    if (createLocked) return;
    createLocked = true;
    newBtn.disabled = true;

    const id = `local-note-${Date.now()}`;
    const body = '- ';
    const note = {
      ID: id,
      Title: 'New Note',
      Body: body,
      Pinned: false,
      'Sort Order': 9999,
      Archived: false,
      _localNew: true
    };

    appData.notes.push(note);
    const drafts = readDrafts();
    drafts[id] = { ...note, savedAt: Date.now() };
    writeDrafts(drafts);

    pendingSelectId = id;
    localRefresh();

    setTimeout(() => {
      createLocked = false;
      newBtn.disabled = false;
    }, 250);
  });

  deleteBtn.addEventListener('click', () => {
    const id = currentSelectedId();
    const note = noteById(id);
    if (!id || !note) return;
    if (!window.confirm(`Delete “${note.Title || 'Untitled Note'}”?`)) return;

    const drafts = readDrafts();
    if (drafts[id]?._localNew || note._localNew) {
      delete drafts[id];
      appData.notes = (appData.notes || []).filter(item => String(item.ID || '') !== id);
    } else {
      note.Archived = true;
      drafts[id] = {
        ...(drafts[id] || {}),
        Archived: true,
        _localDeleted: true,
        savedAt: Date.now()
      };
    }
    writeDrafts(drafts);
    pendingSelectId = '';
    localRefresh();
  });

  noteEditBtn?.addEventListener('click', () => {
    setTimeout(() => { deleteBtn.hidden = true; }, 0);
  });

  noteSaveBtn?.addEventListener('click', () => {
    setTimeout(() => {
      mergeLocalState();
      decorateList();
    }, 0);
  });

  noteCancelBtn?.addEventListener('click', () => {
    setTimeout(decorateList, 0);
  });

  notesTab.addEventListener('click', () => {
    setTimeout(() => {
      mergeLocalState();
      decorateList();
    }, 0);
  });
})();