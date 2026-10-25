(() => {
  const DRAFT_STORAGE = 'lexiTravelNoteDraftsV1';
  const NOTES_CACHE_STORAGE = 'lexiTravelNotesCacheV1';
  const PROJECTED_CACHE_STORAGE = 'lexiTravelProjectedNotesCacheV1';
  const PROJECTED_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const notesTab = document.querySelector('.tab[data-view="notesView"]');
  const notesView = document.getElementById('notesView');
  const notesLayout = document.getElementById('notesLayout');
  const notesList = document.getElementById('notesList');
  const notesSidebarHead = document.querySelector('.notes-sidebar-head');
  const notesCloseBtn = document.getElementById('notesCloseBtn');
  const noteActions = document.querySelector('.note-actions');
  const noteEditBtn = document.getElementById('noteEditBtn');
  const noteSaveBtn = document.getElementById('noteSaveBtn');
  const noteCancelBtn = document.getElementById('noteCancelBtn');

  if (!notesTab || !notesView || !notesLayout || !notesList || !notesSidebarHead || !noteActions) return;

  let pendingSelectId = '';
  let createLocked = false;
  let backgroundRefreshPromise = null;
  let lastBackgroundRefreshAt = 0;
  let suppressFastClick = false;

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

  function isReadOnlyNote(note) {
    return /\bread[- ]?only\b/i.test(String(note?.Category || ''));
  }

  function readNotesCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(NOTES_CACHE_STORAGE) || '[]');
      const safe = Array.isArray(cached) ? cached.filter(note => !isReadOnlyNote(note)) : [];
      if (Array.isArray(cached) && safe.length !== cached.length) {
        localStorage.setItem(NOTES_CACHE_STORAGE, JSON.stringify(safe));
      }
      return safe;
    } catch (error) {
      return [];
    }
  }

  function readProjectedCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(PROJECTED_CACHE_STORAGE) || 'null');
      if (!cached || !Array.isArray(cached.notes)) return [];
      const savedAt = Number(cached.savedAt || 0);
      if (!savedAt || Date.now() - savedAt > PROJECTED_CACHE_MAX_AGE_MS) {
        localStorage.removeItem(PROJECTED_CACHE_STORAGE);
        return [];
      }
      return cached.notes.filter(isReadOnlyNote);
    } catch (error) {
      return [];
    }
  }

  function writeNotesCache(notes) {
    try {
      const all = Array.isArray(notes) ? notes : [];
      const writable = all.filter(note => !isReadOnlyNote(note));
      const projected = all.filter(isReadOnlyNote);
      localStorage.setItem(NOTES_CACHE_STORAGE, JSON.stringify(writable));
      if (projected.length) {
        localStorage.setItem(PROJECTED_CACHE_STORAGE, JSON.stringify({
          savedAt: Date.now(),
          notes: projected
        }));
      } else {
        localStorage.removeItem(PROJECTED_CACHE_STORAGE);
      }
    } catch (error) {
      // Cache failure should never block Notes.
    }
  }

  function mergeCachedNotesIntoAppData() {
    const merged = new Map();
    (appData.notes || []).forEach(note => {
      const id = String(note?.ID || '');
      if (id) merged.set(id, note);
    });
    [...readNotesCache(), ...readProjectedCache()].forEach(note => {
      const id = String(note?.ID || '');
      if (id && !merged.has(id)) merged.set(id, note);
    });
    appData.notes = [...merged.values()];
  }

  function mergeLocalState(readStartedAt = 0) {
    const drafts = readDrafts();
    for (const [id, draft] of Object.entries(drafts)) {
      if (readStartedAt && !draft?._localNew && !draft?._localDeleted && draft?._syncedAt &&
          Number(draft._syncedAt) >= Number(draft.savedAt || 0) &&
          readStartedAt > Number(draft._confirmedAt || 0)) {
        delete drafts[id];
      }
    }
    const seen = new Set();
    let draftsChanged = JSON.stringify(drafts) !== JSON.stringify(readDrafts());

    appData.notes = (appData.notes || []).map(note => {
      const id = String(note.ID || '');
      seen.add(id);
      if (isReadOnlyNote(note)) {
        if (Object.prototype.hasOwnProperty.call(drafts, id)) {
          delete drafts[id];
          draftsChanged = true;
        }
        return note;
      }
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

    if (draftsChanged) writeDrafts(drafts);
  }

  mergeCachedNotesIntoAppData();
  mergeLocalState();

  const actualLoadAllData = loadAllData;
  const wrappedLoadAllData = async function (...args) {
    const result = await actualLoadAllData(...args);
    if (result?.__lexiNotesIncluded === true) writeNotesCache(appData.notes || []);
    mergeCachedNotesIntoAppData();
    mergeLocalState(result?.__lexiNotesIncluded === true ? result.__lexiReadStartedAt : 0);
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
    if (!notesView.classList.contains('active')) return;
    // A background read may finish while the user types. Keep that editor's
    // DOM, selection and text; the next normal selection renders fresh data.
    if (notesView.querySelector('.lexi-plain-editor') || (noteSaveBtn && !noteSaveBtn.hidden)) return;

    mergeCachedNotesIntoAppData();
    mergeLocalState();
    const currentLoader = loadAllData;
    const previousSuppressFastClick = suppressFastClick;
    suppressFastClick = true;
    loadAllData = async () => true;
    try {
      notesTab.click();
    } finally {
      loadAllData = currentLoader;
      suppressFastClick = previousSuppressFastClick;
    }
  }

  function refreshInBackground(loader, force = false) {
    if (backgroundRefreshPromise) return backgroundRefreshPromise;
    if (!force && Date.now() - lastBackgroundRefreshAt < 10000) return null;

    lastBackgroundRefreshAt = Date.now();
    backgroundRefreshPromise = (async () => {
      try {
        const result = await loader();
        if (result?.__lexiNotesIncluded === true) writeNotesCache(appData.notes || []);
        mergeCachedNotesIntoAppData();
        mergeLocalState(result?.__lexiNotesIncluded === true ? result.__lexiReadStartedAt : 0);
        suppressFastClick = true;
        localRefresh();
      } catch (error) {
      } finally {
        suppressFastClick = false;
        backgroundRefreshPromise = null;
      }
    })();
    return backgroundRefreshPromise;
  }

  function requestFreshProjectedNotes(loader, force = false) {
    if (!localStorage.getItem(KEY_STORAGE)) return null;
    if (typeof window.lexiTravelRequestNotesNextLoad === 'function') {
      window.lexiTravelRequestNotesNextLoad();
    }
    return refreshInBackground(loader, force);
  }

  notesTab.addEventListener('click', () => {
    if (suppressFastClick) return;

    mergeCachedNotesIntoAppData();
    mergeLocalState();

    const loader = loadAllData;
    loadAllData = async () => true;

    setTimeout(() => {
      loadAllData = loader;
      requestFreshProjectedNotes(loader, false);
    }, 0);
  }, true);

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
    if (!note || isReadOnlyNote(note)) return;

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
      let id = String(button.dataset.noteId || '');
      let note = id ? noteById(id) : null;

      if (!note) {
        note = notes[index];
        if (!note) return;
        id = String(note.ID || '');
        button.dataset.noteId = id;
      }

      button.classList.toggle('pinned-note', isTrue(note.Pinned));

      let pin = button.querySelector('.note-list-pin');
      if (isReadOnlyNote(note)) {
        if (pin) pin.remove();
        return;
      }

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
    if (!id || !note || isReadOnlyNote(note)) return;
    if (!window.confirm(`Delete “${note.Title || 'Untitled Note'}”?`)) return;

    const drafts = readDrafts();
    const needsRemoteDelete = true;
    note.Archived = true;
    drafts[id] = {
      ...(drafts[id] || {}),
      Archived: true,
      _localDeleted: true,
      savedAt: Date.now()
    };
    writeDrafts(drafts);
    pendingSelectId = '';
    localRefresh();

    if (needsRemoteDelete) {
      document.dispatchEvent(new CustomEvent('lexi-note-delete-ready', { detail: { id } }));
    }
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
      mergeCachedNotesIntoAppData();
      mergeLocalState();
      decorateList();
    }, 0);
  });

  if (localStorage.getItem(KEY_STORAGE)) {
    setTimeout(() => requestFreshProjectedNotes(actualLoadAllData, true), 250);
  }
})();
