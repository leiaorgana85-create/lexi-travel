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

  if (!notesTab || !notesLayout || !notesList || !notesSidebarHead || !noteActions) return;

  let pendingSelectId = '';
  let savedDraftMeta = null;

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

  function mergeLocalNoteState() {
    const drafts = readDrafts();
    const remoteIds = new Set((appData.notes || []).map(note => String(note.ID || '')));

    appData.notes = (appData.notes || []).map(note => {
      const draft = drafts[note.ID];
      return draft ? { ...note, ...draft } : note;
    });

    for (const [id, draft] of Object.entries(drafts)) {
      if (!draft?._localNew || remoteIds.has(String(id))) continue;
      appData.notes.push({
        ID: id,
        Title: 'New Note',
        Category: 'General',
        Body: JSON.stringify({ version: 1, blocks: [{ type: 'paragraph', text: '' }] }),
        Pinned: false,
        'Sort Order': 9999,
        Archived: false,
        ...draft
      });
    }
  }

  const originalLoadAllData = loadAllData;
  loadAllData = async function wrappedLoadAllData(...args) {
    const result = await originalLoadAllData(...args);
    mergeLocalNoteState();
    return result;
  };

  function sortedVisibleNotes() {
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
    return sortedVisibleNotes().find(note => String(note.ID || '') === String(id)) || null;
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

  const pinBtn = document.createElement('button');
  pinBtn.id = 'notePinBtn';
  pinBtn.className = 'note-action-btn note-pin-btn';
  pinBtn.type = 'button';
  pinBtn.textContent = 'Pin';

  const deleteBtn = document.createElement('button');
  deleteBtn.id = 'noteDeleteBtn';
  deleteBtn.className = 'note-action-btn note-delete-btn';
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete';

  noteActions.insertBefore(pinBtn, noteEditBtn);
  noteActions.insertBefore(deleteBtn, noteEditBtn);

  function decorateList() {
    const notes = sortedVisibleNotes();
    const buttons = [...notesList.querySelectorAll('.note-list-item')];

    buttons.forEach((button, index) => {
      const note = notes[index];
      if (!note) return;
      button.dataset.noteId = String(note.ID || '');
      button.classList.toggle('pinned-note', isTrue(note.Pinned));

      let pinMark = button.querySelector('.note-pin-mark');
      if (isTrue(note.Pinned)) {
        if (!pinMark) {
          pinMark = document.createElement('span');
          pinMark.className = 'note-pin-mark';
          pinMark.textContent = '•';
          button.prepend(pinMark);
        }
      } else {
        pinMark?.remove();
      }
    });

    const selectedId = currentSelectedId();
    const selected = noteById(selectedId);
    pinBtn.hidden = !selected;
    deleteBtn.hidden = !selected;
    pinBtn.textContent = selected && isTrue(selected.Pinned) ? 'Unpin' : 'Pin';

    if (pendingSelectId) {
      const target = buttons.find(button => button.dataset.noteId === pendingSelectId);
      if (target) {
        const targetId = pendingSelectId;
        pendingSelectId = '';
        target.click();
        requestAnimationFrame(() => {
          if (currentSelectedId() === targetId) noteEditBtn?.click();
        });
      }
    }
  }

  const observer = new MutationObserver(decorateList);
  observer.observe(notesList, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  decorateList();

  function refreshNotes() {
    notesTab.click();
  }

  newBtn.addEventListener('click', () => {
    const id = `local-note-${Date.now()}`;
    const drafts = readDrafts();
    drafts[id] = {
      ID: id,
      Title: 'New Note',
      Category: 'General',
      Body: JSON.stringify({ version: 1, blocks: [{ type: 'paragraph', text: '' }] }),
      Pinned: false,
      'Sort Order': 9999,
      Archived: false,
      _localNew: true,
      savedAt: Date.now()
    };
    writeDrafts(drafts);
    pendingSelectId = id;
    refreshNotes();
  });

  pinBtn.addEventListener('click', () => {
    const id = currentSelectedId();
    const note = noteById(id);
    if (!id || !note) return;

    const drafts = readDrafts();
    drafts[id] = {
      ...(drafts[id] || {}),
      Pinned: !isTrue(note.Pinned),
      savedAt: Date.now()
    };
    writeDrafts(drafts);
    pendingSelectId = id;
    refreshNotes();
  });

  deleteBtn.addEventListener('click', () => {
    const id = currentSelectedId();
    const note = noteById(id);
    if (!id || !note) return;
    if (!window.confirm(`Delete “${note.Title || 'Untitled Note'}”?`)) return;

    const drafts = readDrafts();
    if (drafts[id]?._localNew) {
      delete drafts[id];
    } else {
      drafts[id] = {
        ...(drafts[id] || {}),
        Archived: true,
        _localDeleted: true,
        savedAt: Date.now()
      };
    }
    writeDrafts(drafts);
    pendingSelectId = '';
    refreshNotes();
  });

  noteSaveBtn?.addEventListener('click', () => {
    const id = currentSelectedId();
    if (!id) return;
    const draft = readDrafts()[id] || {};
    savedDraftMeta = {
      id,
      Pinned: draft.Pinned,
      Archived: draft.Archived,
      Category: draft.Category,
      _localNew: draft._localNew,
      'Sort Order': draft['Sort Order']
    };

    setTimeout(() => {
      if (!savedDraftMeta) return;
      const drafts = readDrafts();
      drafts[savedDraftMeta.id] = {
        ...(drafts[savedDraftMeta.id] || {}),
        ...(savedDraftMeta.Pinned !== undefined ? { Pinned: savedDraftMeta.Pinned } : {}),
        ...(savedDraftMeta.Archived !== undefined ? { Archived: savedDraftMeta.Archived } : {}),
        ...(savedDraftMeta.Category !== undefined ? { Category: savedDraftMeta.Category } : {}),
        ...(savedDraftMeta._localNew !== undefined ? { _localNew: savedDraftMeta._localNew } : {}),
        ...(savedDraftMeta['Sort Order'] !== undefined ? { 'Sort Order': savedDraftMeta['Sort Order'] } : {})
      };
      writeDrafts(drafts);
      savedDraftMeta = null;
      decorateList();
    }, 0);
  }, true);

  notesTab.addEventListener('click', () => {
    setTimeout(() => {
      mergeLocalNoteState();
      decorateList();
    }, 0);
  });
})();