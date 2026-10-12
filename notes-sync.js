(() => {
  const DRAFT_STORAGE = 'lexiTravelNoteDraftsV1';
  const notesTab = document.querySelector('.tab[data-view="notesView"]');
  const notesList = document.getElementById('notesList');
  const noteSaveStatus = document.getElementById('noteSaveStatus');

  if (!notesTab || !notesList) return;

  let writeCapability = null;
  let capabilityPromise = null;

  function readDrafts() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_STORAGE) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function selectedNoteId() {
    return notesList.querySelector('.note-list-item.active')?.dataset.noteId || '';
  }

  function effectiveNote(id) {
    const base = (appData.notes || []).find(note => String(note.ID || '') === String(id)) || {};
    const draft = readDrafts()[id] || {};
    return { ...base, ...draft };
  }

  async function postWrite(action, fields = {}) {
    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) throw new Error('Not connected');

    const body = new URLSearchParams({
      key,
      action,
      ...Object.fromEntries(
        Object.entries(fields).map(([name, value]) => [name, value == null ? '' : String(value)])
      )
    });

    const response = await fetch(API_URL, {
      method: 'POST',
      body,
      cache: 'no-store',
      redirect: 'follow'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Write failed');
    return data;
  }

  async function ensureWriteCapability(force = false) {
    if (!force && writeCapability !== null) return writeCapability;
    if (!force && capabilityPromise) return capabilityPromise;

    capabilityPromise = (async () => {
      try {
        const data = await postWrite('noteCapabilities');
        writeCapability = Boolean(data.noteWrite);
      } catch (error) {
        writeCapability = false;
      } finally {
        capabilityPromise = null;
      }
      return writeCapability;
    })();

    return capabilityPromise;
  }

  async function syncUpsert(id) {
    if (!id) return;
    if (!await ensureWriteCapability()) {
      if (noteSaveStatus) noteSaveStatus.textContent = 'Saved on this device · Sheets sync not enabled yet';
      return;
    }

    const note = effectiveNote(id);
    if (!note.ID && !id) return;

    if (noteSaveStatus) noteSaveStatus.textContent = 'Saving to Google Sheets…';

    try {
      await postWrite('noteUpsert', {
        id,
        title: note.Title || 'Untitled Note',
        body: note.Body || JSON.stringify({ version: 1, blocks: [] }),
        pinned: String(note.Pinned === true || String(note.Pinned).toUpperCase() === 'TRUE').toLowerCase()
      });
      if (noteSaveStatus) noteSaveStatus.textContent = 'Synced to Google Sheets';
    } catch (error) {
      if (noteSaveStatus) noteSaveStatus.textContent = `Saved locally · sync failed: ${error.message}`;
    }
  }

  async function syncPin(id) {
    if (!id || !await ensureWriteCapability()) return;
    const note = effectiveNote(id);

    try {
      await postWrite('notePin', {
        id,
        pinned: String(note.Pinned === true || String(note.Pinned).toUpperCase() === 'TRUE').toLowerCase()
      });
    } catch (error) {
      if (noteSaveStatus) noteSaveStatus.textContent = `Pin saved locally · sync failed: ${error.message}`;
    }
  }

  async function syncDelete(id) {
    if (!id || !await ensureWriteCapability()) return;

    try {
      await postWrite('noteDelete', { id });
      if (noteSaveStatus) noteSaveStatus.textContent = 'Deleted from Google Sheets';
    } catch (error) {
      if (noteSaveStatus) noteSaveStatus.textContent = `Deleted locally · sync failed: ${error.message}`;
    }
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const pin = target.closest('.note-list-pin');
    if (pin) {
      const id = pin.closest('.note-list-item')?.dataset.noteId || '';
      setTimeout(() => syncPin(id), 0);
      return;
    }

    if (target.closest('#noteDeleteBtn')) {
      const id = selectedNoteId();
      setTimeout(() => syncDelete(id), 0);
      return;
    }

    if (target.closest('#noteSaveBtn')) {
      const id = selectedNoteId();
      setTimeout(() => syncUpsert(id), 0);
    }
  }, true);

  notesTab.addEventListener('click', () => {
    ensureWriteCapability(true);
  });

  if (localStorage.getItem(KEY_STORAGE)) {
    ensureWriteCapability(true);
  }
})();
