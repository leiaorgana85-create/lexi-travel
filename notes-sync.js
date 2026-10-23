(() => {
  const DRAFT_STORAGE = 'lexiTravelNoteDraftsV1';
  const notesTab = document.querySelector('.tab[data-view="notesView"]');
  const notesList = document.getElementById('notesList');
  const noteSaveStatus = document.getElementById('noteSaveStatus');

  if (!notesTab || !notesList) return;

  let writeCapability = null;
  let capabilityPromise = null;
  let retryPromise = null;
  const writeChains = new Map();
  const deletedIds = new Set();

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

  function selectedNoteId() {
    return notesList.querySelector('.note-list-item.active')?.dataset.noteId || '';
  }

  function baseNote(id) {
    return (appData.notes || []).find(note => String(note.ID || '') === String(id)) || null;
  }

  function effectiveNote(id) {
    const base = baseNote(id) || {};
    const draft = readDrafts()[id] || {};
    return { ...base, ...draft };
  }

  function isReadOnlyId(id) {
    const note = baseNote(id);
    return /\bread[- ]?only\b/i.test(String(note?.Category || ''));
  }

  function discardReadOnlyDraft(id) {
    if (!isReadOnlyId(id)) return false;
    const drafts = readDrafts();
    if (Object.prototype.hasOwnProperty.call(drafts, id)) {
      delete drafts[id];
      writeDrafts(drafts);
    }
    return true;
  }

  function scrubReadOnlyDrafts() {
    const drafts = readDrafts();
    let changed = false;
    for (const note of appData.notes || []) {
      const id = String(note?.ID || '');
      if (!id || !isReadOnlyId(id) || !Object.prototype.hasOwnProperty.call(drafts, id)) continue;
      delete drafts[id];
      changed = true;
    }
    if (changed) writeDrafts(drafts);
    return changed;
  }

  function enqueueWrite(id, task) {
    const cleanId = String(id || '');
    if (!cleanId) return Promise.resolve();
    const previous = writeChains.get(cleanId) || Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    writeChains.set(cleanId, next);
    next.finally(() => {
      if (writeChains.get(cleanId) === next) writeChains.delete(cleanId);
    });
    return next;
  }

  function syncedVersion(note) {
    return Math.max(1, Number(note?.savedAt || 0));
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

  function syncUpsert(id) {
    if (!id || discardReadOnlyDraft(id)) return Promise.resolve();
    const snapshot = effectiveNote(id);
    if (!baseNote(id) && !snapshot._localNew) return Promise.resolve();
    const version = syncedVersion(snapshot);

    if (snapshot._localDeleted || deletedIds.has(id)) return Promise.resolve();
    if (noteSaveStatus) noteSaveStatus.textContent = 'Saving to Google Sheets…';

    return enqueueWrite(id, async () => {
      const latestDraft = readDrafts()[id];
      if (deletedIds.has(id) || latestDraft?._localDeleted) return;

      if (!await ensureWriteCapability()) {
        if (noteSaveStatus) noteSaveStatus.textContent = 'Saved on this device · Sheets sync unavailable';
        return;
      }

      try {
        await postWrite('noteUpsert', {
          id,
          title: snapshot.Title || 'Untitled Note',
          body: snapshot.Body || '',
          pinned: String(snapshot.Pinned === true || String(snapshot.Pinned).toUpperCase() === 'TRUE').toLowerCase()
        });

        const drafts = readDrafts();
        if (drafts[id] && !drafts[id]._localDeleted) {
          drafts[id] = {
            ...drafts[id],
            _localNew: false,
            _syncedAt: Math.max(Number(drafts[id]._syncedAt || 0), version),
            _confirmedAt: Date.now()
          };
          writeDrafts(drafts);
        }

        const appNote = (appData.notes || []).find(item => String(item.ID || '') === String(id));
        if (appNote && !isLocallyDeleted(id)) {
          appNote._localNew = false;
        }

        if (noteSaveStatus) noteSaveStatus.textContent = 'Synced to Google Sheets';
      } catch (error) {
        writeCapability = null;
        if (noteSaveStatus) noteSaveStatus.textContent = `Saved locally · sync failed: ${error.message}`;
      }
    });
  }

  function isLocallyDeleted(id) {
    return deletedIds.has(id) || Boolean(readDrafts()[id]?._localDeleted);
  }

  function syncPin(id) {
    if (!id || discardReadOnlyDraft(id)) return Promise.resolve();
    const snapshot = effectiveNote(id);
    if (!baseNote(id) && !snapshot._localNew) return Promise.resolve();
    const version = syncedVersion(snapshot);

    if (snapshot._localDeleted || deletedIds.has(id)) return Promise.resolve();
    const pendingDraft = readDrafts()[id];
    if (snapshot._localNew || (pendingDraft && draftNeedsRetry(pendingDraft) &&
        (Object.prototype.hasOwnProperty.call(pendingDraft, 'Title') ||
         Object.prototype.hasOwnProperty.call(pendingDraft, 'Body')))) return syncUpsert(id);

    return enqueueWrite(id, async () => {
      if (isLocallyDeleted(id) || !await ensureWriteCapability()) return;
      try {
        await postWrite('notePin', {
          id,
          pinned: String(snapshot.Pinned === true || String(snapshot.Pinned).toUpperCase() === 'TRUE').toLowerCase()
        });

        const drafts = readDrafts();
        if (drafts[id] && !drafts[id]._localDeleted) {
          drafts[id] = {
            ...drafts[id],
            _syncedAt: Math.max(Number(drafts[id]._syncedAt || 0), version),
            _confirmedAt: Date.now()
          };
          writeDrafts(drafts);
        }
      } catch (error) {
        writeCapability = null;
        if (noteSaveStatus) noteSaveStatus.textContent = `Pin saved locally · sync failed: ${error.message}`;
      }
    });
  }

  function syncDelete(id) {
    if (!id || discardReadOnlyDraft(id)) return Promise.resolve();
    const draft = readDrafts()[id] || {};
    if (!baseNote(id) && !draft._localNew) return Promise.resolve();
    deletedIds.add(id);

    return enqueueWrite(id, async () => {
      if (!await ensureWriteCapability()) {
        if (noteSaveStatus) noteSaveStatus.textContent = 'Deleted on this device · Sheets sync unavailable';
        return;
      }

      try {
        await postWrite('noteDelete', { id });
        const drafts = readDrafts();
        if (drafts[id]) {
          delete drafts[id];
          writeDrafts(drafts);
        }
        if (noteSaveStatus) noteSaveStatus.textContent = 'Deleted from Google Sheets';
      } catch (error) {
        writeCapability = null;
        if (noteSaveStatus) noteSaveStatus.textContent = `Deleted locally · sync failed: ${error.message}`;
      }
    });
  }

  function draftNeedsRetry(draft) {
    if (!draft || typeof draft !== 'object') return false;
    if (draft._localDeleted) return true;
    return !draft._syncedAt || Number(draft.savedAt || 0) > Number(draft._syncedAt || 0);
  }

  async function retryPendingWrites(forceCapability = false) {
    if (retryPromise) return retryPromise;
    if (!localStorage.getItem(KEY_STORAGE)) return false;

    retryPromise = (async () => {
      try {
        scrubReadOnlyDrafts();
        if (!await ensureWriteCapability(forceCapability)) return false;
        const drafts = readDrafts();
        const pending = Object.entries(drafts).filter(([, draft]) => draftNeedsRetry(draft));

        for (const [id, draft] of pending) {
          if (draft._localDeleted) {
            await syncDelete(id);
          } else {
            await syncUpsert(id);
          }
        }
        return pending.length > 0;
      } finally {
        retryPromise = null;
      }
    })();

    return retryPromise;
  }

  window.lexiNotesRetryPendingWrites = retryPendingWrites;

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const pin = target.closest('.note-list-pin');
    if (pin) {
      const id = pin.closest('.note-list-item')?.dataset.noteId || '';
      if (!isReadOnlyId(id)) setTimeout(() => syncPin(id), 0);
    }
  }, true);

  document.addEventListener('lexi-note-delete-ready', event => {
    const id = String(event.detail?.id || '');
    if (id) syncDelete(id);
  });

  document.addEventListener('lexi-note-save-ready', event => {
    const id = String(event.detail?.id || '');
    if (id) syncUpsert(id);
  });

  document.addEventListener('lexi-note-autosave', event => {
    const id = String(event.detail?.id || '');
    if (id) syncUpsert(id);
  });

  notesTab.addEventListener('click', () => {
    ensureWriteCapability(true);
    retryPendingWrites(true);

    setTimeout(() => {
      if (!noteSaveStatus) return;
      if (!noteSaveStatus.textContent.includes('Google Sheets sync not enabled yet')) return;

      const id = selectedNoteId();
      const draft = readDrafts()[id];
      noteSaveStatus.textContent = draft?._syncedAt && Number(draft._syncedAt) >= Number(draft.savedAt || 0)
        ? 'Synced to Google Sheets'
        : 'Saved on this device';
    }, 0);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && localStorage.getItem(KEY_STORAGE)) retryPendingWrites(true);
  });
  window.addEventListener('pageshow', () => {
    if (localStorage.getItem(KEY_STORAGE)) retryPendingWrites(true);
  });

  if (localStorage.getItem(KEY_STORAGE)) {
    ensureWriteCapability(true);
    retryPendingWrites(false);
  }
})();
