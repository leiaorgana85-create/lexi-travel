(() => {
  const DRAFT_STORAGE = 'lexiTravelNoteDraftsV1';
  const notesList = document.getElementById('notesList');
  const noteBody = document.getElementById('noteBody');
  const noteSaveStatus = document.getElementById('noteSaveStatus');
  const noteSaveBtn = document.getElementById('noteSaveBtn');

  if (!notesList || !noteBody || !noteSaveStatus || !noteSaveBtn) return;

  let decorating = false;
  let saveContext = null;

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

  function effectiveNote(id) {
    const base = (appData.notes || []).find(note => String(note.ID || '') === String(id)) || {};
    const draft = readDrafts()[id] || {};
    return { ...base, ...draft };
  }

  function plainTextFromBody(body) {
    const raw = String(body ?? '');
    const trimmed = raw.trim();
    if (!trimmed) return raw;

    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || !Array.isArray(parsed.blocks)) return raw;
      if (parsed.blocks.some(block => block?.type !== 'paragraph')) return null;
      return parsed.blocks.map(block => String(block?.text || '')).join('\n\n');
    } catch (error) {
      return raw;
    }
  }

  const formatBar = document.createElement('div');
  formatBar.id = 'noteFormatBar';
  formatBar.className = 'note-format-bar';
  formatBar.hidden = true;
  formatBar.setAttribute('aria-label', 'Note formatting');

  const formatButtons = [
    ['bullet', '•', 'Bulleted list'],
    ['number', '1.', 'Numbered list'],
    ['check', '☐', 'Checklist']
  ].map(([mode, text, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-format-btn';
    button.dataset.format = mode;
    button.textContent = text;
    button.setAttribute('aria-label', label);
    button.title = label;
    formatBar.append(button);
    return button;
  });

  noteSaveStatus.insertAdjacentElement('afterend', formatBar);

  function isEditing() {
    return !noteSaveBtn.hidden;
  }

  function stripListPrefix(line) {
    return line.replace(/^(\s*)(?:[-*]\s+|\[(?: |x|X)\]\s+|\d+\.\s+)/, '$1');
  }

  function lineMatchesMode(line, mode) {
    if (mode === 'bullet') return /^\s*[-*]\s+/.test(line);
    if (mode === 'number') return /^\s*\d+\.\s+/.test(line);
    if (mode === 'check') return /^\s*\[(?: |x|X)\]\s+/.test(line);
    return false;
  }

  function lineBounds(text, start, end) {
    const first = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    let lastBreak = text.indexOf('\n', end);
    if (lastBreak === -1) lastBreak = text.length;
    return [first, lastBreak];
  }

  function applyFormat(mode) {
    const editor = noteBody.querySelector('.lexi-plain-editor');
    if (!editor) return;

    const text = editor.value;
    const selectionStart = editor.selectionStart ?? 0;
    const selectionEnd = editor.selectionEnd ?? selectionStart;
    const [blockStart, blockEnd] = lineBounds(text, selectionStart, selectionEnd);
    const original = text.slice(blockStart, blockEnd);
    const lines = original.split('\n');
    const removeOnly = lines.every(line => !line.trim() || lineMatchesMode(line, mode));

    let counter = 1;
    const changed = lines.map(line => {
      if (!line.trim() && removeOnly) return '';
      const clean = stripListPrefix(line);
      if (removeOnly) return clean;
      if (mode === 'bullet') return clean.replace(/^(\s*)/, '$1- ');
      if (mode === 'check') return clean.replace(/^(\s*)/, '$1[ ] ');
      const numbered = clean.replace(/^(\s*)/, `$1${counter}. `);
      counter += 1;
      return numbered;
    }).join('\n');

    editor.value = text.slice(0, blockStart) + changed + text.slice(blockEnd);
    const hiddenParagraph = noteBody.querySelector('.lexi-plain-source');
    if (hiddenParagraph) hiddenParagraph.textContent = editor.value;

    if (selectionStart === selectionEnd && lines.length === 1) {
      const caret = blockStart + changed.length;
      editor.setSelectionRange(caret, caret);
    } else {
      editor.setSelectionRange(blockStart, blockStart + changed.length);
    }
    editor.focus();
  }

  formatButtons.forEach(button => {
    button.addEventListener('click', () => applyFormat(button.dataset.format || ''));
  });

  function handleEditorEnter(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    const editor = event.currentTarget;
    if (!(editor instanceof HTMLTextAreaElement)) return;
    if (editor.selectionStart !== editor.selectionEnd) return;

    const text = editor.value;
    const caret = editor.selectionStart;
    const lineStart = text.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
    let lineEnd = text.indexOf('\n', caret);
    if (lineEnd === -1) lineEnd = text.length;
    const line = text.slice(lineStart, lineEnd);
    const match = line.match(/^(\s*)(-\s+|\[(?: |x|X)\]\s+|(\d+)\.\s+)(.*)$/);
    if (!match) return;

    const indent = match[1] || '';
    const prefix = match[2] || '';
    const number = match[3] ? Number(match[3]) : null;
    const content = match[4] || '';

    event.preventDefault();

    if (!content.trim() && caret >= lineStart + indent.length + prefix.length) {
      const replacement = indent;
      editor.value = text.slice(0, lineStart) + replacement + text.slice(lineEnd);
      const nextCaret = lineStart + replacement.length;
      editor.setSelectionRange(nextCaret, nextCaret);
    } else {
      let nextPrefix = prefix;
      if (/^\[(?: |x|X)\]\s+/.test(prefix)) nextPrefix = '[ ] ';
      if (number !== null) nextPrefix = `${number + 1}. `;
      const insertion = `\n${indent}${nextPrefix}`;
      editor.value = text.slice(0, caret) + insertion + text.slice(caret);
      const nextCaret = caret + insertion.length;
      editor.setSelectionRange(nextCaret, nextCaret);
    }

    const hiddenParagraph = noteBody.querySelector('.lexi-plain-source');
    if (hiddenParagraph) hiddenParagraph.textContent = editor.value;
  }

  function buildPlainRead(text) {
    decorating = true;
    try {
      formatBar.hidden = true;
      noteBody.innerHTML = '';

      if (!text) {
        const empty = document.createElement('div');
        empty.className = 'note-empty';
        empty.textContent = 'This note is empty.';
        noteBody.append(empty);
        return;
      }

      const wrap = document.createElement('div');
      wrap.className = 'lexi-plain-render';

      text.split('\n').forEach((line, index) => {
        const row = document.createElement('div');
        row.className = 'lexi-note-line';

        const check = line.match(/^(\s*)\[( |x|X)\]\s*(.*)$/);
        const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
        const numbered = line.match(/^(\s*)(\d+)\.\s+(.*)$/);

        if (check) {
          row.classList.add('lexi-check-line');
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.className = 'lexi-check-input';
          input.checked = String(check[2]).toLowerCase() === 'x';
          input.dataset.lineIndex = String(index);

          const label = document.createElement('span');
          label.className = 'lexi-note-text';
          label.textContent = check[3] || '';
          row.append(input, label);
        } else if (bullet) {
          const marker = document.createElement('span');
          marker.className = 'lexi-note-marker';
          marker.textContent = '•';
          const content = document.createElement('span');
          content.className = 'lexi-note-text';
          content.textContent = bullet[2] || '';
          row.append(marker, content);
        } else if (numbered) {
          const marker = document.createElement('span');
          marker.className = 'lexi-note-marker lexi-number-marker';
          marker.textContent = `${numbered[2]}.`;
          const content = document.createElement('span');
          content.className = 'lexi-note-text';
          content.textContent = numbered[3] || '';
          row.append(marker, content);
        } else if (!line) {
          row.classList.add('lexi-note-blank');
          row.innerHTML = '&nbsp;';
        } else {
          row.classList.add('lexi-note-text-line');
          row.textContent = line;
        }

        wrap.append(row);
      });

      noteBody.append(wrap);
    } finally {
      decorating = false;
    }
  }

  function buildPlainEditor(text) {
    const existing = noteBody.querySelector('.lexi-plain-editor');
    if (existing) {
      formatBar.hidden = false;
      return;
    }

    const paragraphs = [...noteBody.querySelectorAll('.note-paragraph.note-editable')];
    if (paragraphs.length !== 1) {
      formatBar.hidden = true;
      return;
    }

    decorating = true;
    try {
      const source = paragraphs[0];
      source.classList.add('lexi-plain-source');
      source.hidden = true;

      const editor = document.createElement('textarea');
      editor.className = 'lexi-plain-editor';
      editor.value = text;
      editor.setAttribute('aria-label', 'Note body');
      editor.spellcheck = true;
      editor.addEventListener('input', () => {
        source.textContent = editor.value;
      });
      editor.addEventListener('keydown', handleEditorEnter);

      source.insertAdjacentElement('afterend', editor);
      formatBar.hidden = false;
    } finally {
      decorating = false;
    }
  }

  function decorateCurrentNote() {
    if (decorating) return;
    const id = selectedNoteId();
    if (!id) {
      formatBar.hidden = true;
      return;
    }

    const note = effectiveNote(id);
    const plain = plainTextFromBody(note.Body);
    if (plain === null) {
      formatBar.hidden = true;
      return;
    }

    if (isEditing()) buildPlainEditor(plain);
    else if (!noteBody.querySelector('.lexi-plain-render')) buildPlainRead(plain);
  }

  noteBody.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains('lexi-check-input')) return;

    const id = selectedNoteId();
    if (!id) return;
    const note = effectiveNote(id);
    const plain = plainTextFromBody(note.Body);
    if (plain === null) return;

    const lines = plain.split('\n');
    const index = Number(target.dataset.lineIndex);
    if (!Number.isInteger(index) || index < 0 || index >= lines.length) return;

    lines[index] = lines[index].replace(
      /^(\s*)\[(?: |x|X)\]/,
      `$1[${target.checked ? 'x' : ' '}]`
    );

    const drafts = readDrafts();
    drafts[id] = {
      ...(drafts[id] || {}),
      Body: lines.join('\n'),
      savedAt: Date.now()
    };
    writeDrafts(drafts);

    document.dispatchEvent(new CustomEvent('lexi-note-autosave', {
      detail: { id }
    }));
  });

  noteSaveBtn.addEventListener('click', () => {
    const id = selectedNoteId();
    const editor = noteBody.querySelector('.lexi-plain-editor');
    if (!id || !editor) {
      saveContext = null;
      return;
    }

    saveContext = {
      id,
      body: editor.value.replace(/\r/g, '').replace(/\n+$/, ''),
      previousDraft: readDrafts()[id] || null
    };
  }, true);

  noteSaveBtn.addEventListener('click', () => {
    if (!saveContext) return;

    const drafts = readDrafts();
    const saved = drafts[saveContext.id] || {};
    drafts[saveContext.id] = {
      ...(saveContext.previousDraft || {}),
      ...saved,
      Body: saveContext.body,
      savedAt: saved.savedAt || Date.now()
    };
    writeDrafts(drafts);
    saveContext = null;
  });

  const observer = new MutationObserver(() => {
    queueMicrotask(decorateCurrentNote);
  });
  observer.observe(noteBody, { childList: true, subtree: true });
  observer.observe(noteSaveBtn, { attributes: true, attributeFilter: ['hidden'] });
  observer.observe(notesList, { attributes: true, subtree: true, attributeFilter: ['class'] });

  queueMicrotask(decorateCurrentNote);
})();
