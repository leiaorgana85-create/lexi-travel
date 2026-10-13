(() => {
  const PROTECTED_STORAGE = 'lexiTravelProtectedNotesV1';
  const CREDENTIAL_STORAGE = 'lexiTravelNotesCredentialV1';

  const notesView = document.getElementById('notesView');
  const notesList = document.getElementById('notesList');
  const noteBody = document.getElementById('noteBody');
  const noteActions = document.querySelector('.note-actions');
  const noteWorkspace = document.querySelector('.note-workspace');
  const noteEditBtn = document.getElementById('noteEditBtn');
  const noteSaveBtn = document.getElementById('noteSaveBtn');
  const noteCancelBtn = document.getElementById('noteCancelBtn');
  const notesTab = document.querySelector('.tab[data-view="notesView"]');

  if (!notesView || !notesList || !noteBody || !noteActions || !noteWorkspace) return;

  const unlockedThisSession = new Set();
  let allowLockedClickOnce = '';
  let dialogMode = '';
  let dialogNoteId = '';
  let dialogTargetButton = null;
  let applyingState = false;

  function readProtected() {
    try {
      const value = JSON.parse(localStorage.getItem(PROTECTED_STORAGE) || '[]');
      return new Set(Array.isArray(value) ? value.map(String) : []);
    } catch (error) {
      return new Set();
    }
  }

  function writeProtected(set) {
    localStorage.setItem(PROTECTED_STORAGE, JSON.stringify([...set]));
  }

  function isProtected(id) {
    return Boolean(id) && readProtected().has(String(id));
  }

  function isLocked(id) {
    const key = String(id || '');
    return Boolean(key) && isProtected(key) && !unlockedThisSession.has(key);
  }

  function currentSelectedId() {
    return String(notesList.querySelector('.note-list-item.active')?.dataset.noteId || '');
  }

  function noteById(id) {
    try {
      return (appData.notes || []).find(note => String(note.ID || '') === String(id)) || null;
    } catch (error) {
      return null;
    }
  }

  function iconForNote(note) {
    const text = `${note?.Title || ''} ${note?.Category || ''}`.toLowerCase();
    if (/thyroid|health|medical|doctor|clinic|lab/.test(text)) return '🩺';
    if (/bangkok.*schedule|schedule|itinerary|calendar/.test(text)) return '🗓️';
    if (/packing|luggage|bag/.test(text)) return '🧳';
    if (/visa|immigration|passport/.test(text)) return '🛂';
    if (/shopping|buy|store/.test(text)) return '🛍️';
    if (/flight|travel|trip/.test(text)) return '✈️';
    if (/work|job|office/.test(text)) return '💼';
    if (/money|finance|budget|bank/.test(text)) return '💰';
    if (/hotel|airbnb|accommodation|stay/.test(text)) return '🏠';
    return '📝';
  }

  function decorateList() {
    const protectedIds = readProtected();

    notesList.querySelectorAll('.note-list-item').forEach(button => {
      const id = String(button.dataset.noteId || '');
      const note = noteById(id);
      if (!id || !note) return;

      let icon = button.querySelector('.note-list-icon');
      if (!icon) {
        icon = document.createElement('span');
        icon.className = 'note-list-icon';
        icon.setAttribute('aria-hidden', 'true');
        button.prepend(icon);
      }
      const nextIcon = iconForNote(note);
      if (icon.textContent !== nextIcon) icon.textContent = nextIcon;

      const protectedNote = protectedIds.has(id);
      button.classList.toggle('protected-note', protectedNote);

      let lock = button.querySelector('.note-list-protected');
      if (!lock) {
        lock = document.createElement('span');
        lock.className = 'note-list-protected';
        lock.setAttribute('aria-label', 'Password protected');
        lock.title = 'Password protected';
        lock.textContent = '🔒';
        button.append(lock);
      }
      lock.hidden = !protectedNote;
    });

    const selected = noteById(currentSelectedId());
    const title = String(selected?.Title || '');
    notesView.classList.toggle('bangkok-schedule-note', /bangkok.*schedule/i.test(title));
  }

  const protectBtn = document.createElement('button');
  protectBtn.id = 'noteProtectBtn';
  protectBtn.className = 'note-action-btn note-protect-btn';
  protectBtn.type = 'button';
  protectBtn.textContent = 'Protect';
  protectBtn.hidden = true;
  noteActions.insertBefore(protectBtn, noteActions.firstChild);

  const lockedPanel = document.createElement('div');
  lockedPanel.className = 'note-locked-panel';
  lockedPanel.hidden = true;
  lockedPanel.innerHTML = '<div class="note-locked-icon" aria-hidden="true">🔒</div><div><strong>Protected note</strong><div>Tap this note in the list and enter your PIN/password to open it.</div></div>';
  noteBody.insertAdjacentElement('afterend', lockedPanel);

  const dialog = document.createElement('dialog');
  dialog.className = 'notes-security-dialog';
  dialog.innerHTML = `
    <form class="notes-security-card">
      <div class="notes-security-head">
        <h2 id="notesSecurityTitle">Unlock note</h2>
        <button type="button" class="notes-security-close" aria-label="Close">×</button>
      </div>
      <p id="notesSecurityMessage" class="notes-security-message"></p>
      <input id="notesSecurityPassword" class="notes-security-input" type="password" autocomplete="off" placeholder="PIN or password" aria-label="PIN or password">
      <input id="notesSecurityConfirm" class="notes-security-input" type="password" autocomplete="off" placeholder="Confirm PIN or password" aria-label="Confirm PIN or password" hidden>
      <div id="notesSecurityError" class="notes-security-error" aria-live="polite"></div>
      <div class="notes-security-actions">
        <button type="button" class="notes-security-cancel">Cancel</button>
        <button type="submit" class="notes-security-submit">Unlock</button>
      </div>
    </form>`;
  document.body.append(dialog);

  const dialogTitle = dialog.querySelector('#notesSecurityTitle');
  const dialogMessage = dialog.querySelector('#notesSecurityMessage');
  const passwordInput = dialog.querySelector('#notesSecurityPassword');
  const confirmInput = dialog.querySelector('#notesSecurityConfirm');
  const errorEl = dialog.querySelector('#notesSecurityError');
  const submitBtn = dialog.querySelector('.notes-security-submit');
  const cancelBtn = dialog.querySelector('.notes-security-cancel');
  const closeBtn = dialog.querySelector('.notes-security-close');
  const form = dialog.querySelector('form');

  function readCredential() {
    try {
      const value = JSON.parse(localStorage.getItem(CREDENTIAL_STORAGE) || 'null');
      return value && value.salt && value.hash ? value : null;
    } catch (error) {
      return null;
    }
  }

  function randomSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  async function digestSecret(secret, salt) {
    const input = new TextEncoder().encode(`${salt}:${secret}`);
    const result = await crypto.subtle.digest('SHA-256', input);
    return [...new Uint8Array(result)].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  async function setCredential(secret) {
    const salt = randomSalt();
    const hash = await digestSecret(secret, salt);
    localStorage.setItem(CREDENTIAL_STORAGE, JSON.stringify({ salt, hash }));
  }

  async function verifyCredential(secret) {
    const credential = readCredential();
    if (!credential) return false;
    const hash = await digestSecret(secret, credential.salt);
    return hash === credential.hash;
  }

  function showDialog(mode, noteId, targetButton = null) {
    dialogMode = mode;
    dialogNoteId = String(noteId || '');
    dialogTargetButton = targetButton;
    passwordInput.value = '';
    confirmInput.value = '';
    errorEl.textContent = '';

    const note = noteById(dialogNoteId);
    const name = note?.Title || 'this note';

    if (mode === 'setup') {
      dialogTitle.textContent = 'Set Notes PIN';
      dialogMessage.textContent = `Create one PIN/password for protected notes on this device. “${name}” will be protected.`;
      confirmInput.hidden = false;
      submitBtn.textContent = 'Save';
    } else if (mode === 'unprotect') {
      dialogTitle.textContent = 'Remove protection';
      dialogMessage.textContent = `Enter your Notes PIN/password to remove protection from “${name}”.`;
      confirmInput.hidden = true;
      submitBtn.textContent = 'Remove';
    } else {
      dialogTitle.textContent = 'Protected note';
      dialogMessage.textContent = `Enter your Notes PIN/password to open “${name}”.`;
      confirmInput.hidden = true;
      submitBtn.textContent = 'Unlock';
    }

    dialog.showModal();
    requestAnimationFrame(() => passwordInput.focus());
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
    dialogMode = '';
    dialogNoteId = '';
    dialogTargetButton = null;
    errorEl.textContent = '';
  }

  function protectNote(id) {
    const protectedIds = readProtected();
    protectedIds.add(String(id));
    writeProtected(protectedIds);
    unlockedThisSession.delete(String(id));
    decorateList();

    const button = notesList.querySelector(`.note-list-item[data-note-id="${CSS.escape(String(id))}"]`);
    if (button) {
      allowLockedClickOnce = String(id);
      button.click();
    }
    applyProtectionState();
  }

  function unprotectNote(id) {
    const protectedIds = readProtected();
    protectedIds.delete(String(id));
    writeProtected(protectedIds);
    unlockedThisSession.delete(String(id));
    decorateList();

    const button = notesList.querySelector(`.note-list-item[data-note-id="${CSS.escape(String(id))}"]`);
    if (button) button.click();
    applyProtectionState();
  }

  function applyProtectionState() {
    if (applyingState) return;
    applyingState = true;
    try {
      decorateList();
      const id = currentSelectedId();
      const protectedNote = isProtected(id);
      const locked = isLocked(id);

      protectBtn.hidden = !id;
      protectBtn.textContent = protectedNote ? 'Unprotect' : 'Protect';
      protectBtn.setAttribute('aria-label', protectedNote ? 'Remove note protection' : 'Protect note');

      noteBody.hidden = locked;
      lockedPanel.hidden = !locked;
      notesView.classList.toggle('note-protected-locked', locked);

      if (locked) {
        if (noteEditBtn) noteEditBtn.hidden = true;
        const deleteBtn = document.getElementById('noteDeleteBtn');
        if (deleteBtn) deleteBtn.hidden = true;
        if (noteSaveBtn) noteSaveBtn.hidden = true;
        if (noteCancelBtn) noteCancelBtn.hidden = true;
      }
    } finally {
      applyingState = false;
    }
  }

  notesList.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('.note-list-item');
    if (!button) return;

    const id = String(button.dataset.noteId || '');
    if (!id || !isLocked(id)) return;

    if (allowLockedClickOnce === id) {
      allowLockedClickOnce = '';
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (!readCredential()) showDialog('setup', id, button);
    else showDialog('unlock', id, button);
  }, true);

  protectBtn.addEventListener('click', () => {
    const id = currentSelectedId();
    if (!id) return;

    if (isProtected(id)) {
      if (!readCredential()) {
        showDialog('setup', id);
      } else {
        showDialog('unprotect', id);
      }
      return;
    }

    if (!readCredential()) showDialog('setup', id);
    else protectNote(id);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const secret = String(passwordInput.value || '');

    if (dialogMode === 'setup') {
      if (secret.length < 4) {
        errorEl.textContent = 'Use at least 4 characters.';
        return;
      }
      if (secret !== String(confirmInput.value || '')) {
        errorEl.textContent = 'The two entries do not match.';
        return;
      }

      try {
        await setCredential(secret);
        const id = dialogNoteId;
        const target = dialogTargetButton;
        closeDialog();
        protectNote(id);
        if (target && isProtected(id)) applyProtectionState();
      } catch (error) {
        errorEl.textContent = 'Could not save the PIN/password on this device.';
      }
      return;
    }

    try {
      const valid = await verifyCredential(secret);
      if (!valid) {
        errorEl.textContent = 'Incorrect PIN/password.';
        return;
      }

      const id = dialogNoteId;
      const target = dialogTargetButton;
      const mode = dialogMode;
      closeDialog();

      if (mode === 'unprotect') {
        unprotectNote(id);
        return;
      }

      unlockedThisSession.add(String(id));
      if (target) target.click();
      applyProtectionState();
    } catch (error) {
      errorEl.textContent = 'Could not verify the PIN/password.';
    }
  });

  cancelBtn.addEventListener('click', closeDialog);
  closeBtn.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  });

  const listObserver = new MutationObserver(() => queueMicrotask(applyProtectionState));
  listObserver.observe(notesList, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-note-id']
  });

  const bodyObserver = new MutationObserver(() => queueMicrotask(applyProtectionState));
  bodyObserver.observe(noteBody, { childList: true, subtree: true });

  notesTab?.addEventListener('click', () => setTimeout(applyProtectionState, 0));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) applyProtectionState();
  });

  window.lexiNoteSecurity = {
    isProtected,
    isLocked
  };

  queueMicrotask(applyProtectionState);
})();
