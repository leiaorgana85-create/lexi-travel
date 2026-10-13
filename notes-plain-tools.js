(() => {
  const DRAFT_STORAGE = 'lexiTravelNoteDraftsV1';
  const noteBody = document.getElementById('noteBody');
  const notesList = document.getElementById('notesList');
  const formatBar = document.getElementById('noteFormatBar');

  if (!noteBody || !notesList || !formatBar) return;

  let decoratingReadView = false;

  function currentEditor() {
    return noteBody.querySelector('.lexi-plain-editor');
  }

  function selectedNoteId() {
    return notesList.querySelector('.note-list-item.active')?.dataset.noteId || '';
  }

  function sourceFor(editor) {
    return editor?.parentElement?.querySelector('.lexi-plain-source') || noteBody.querySelector('.lexi-plain-source');
  }

  function updateSource(editor) {
    const source = sourceFor(editor);
    if (source) source.textContent = editor.value;
  }

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

  function scheduleSave() {
    const editor = currentEditor();
    const id = selectedNoteId();
    if (!editor || !id) return;

    updateSource(editor);

    const drafts = readDrafts();
    drafts[id] = {
      ...(drafts[id] || {}),
      Body: editor.value.replace(/\r/g, ''),
      savedAt: Date.now()
    };
    writeDrafts(drafts);

    document.dispatchEvent(new CustomEvent('lexi-note-autosave', {
      detail: { id }
    }));
  }

  function replaceSelectedLines(formatter) {
    const editor = currentEditor();
    if (!editor) return;

    const value = editor.value;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;

    const lineStart =
      value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;

    const nextNewline = value.indexOf('\n', end);
    const lineEnd =
      nextNewline === -1 ? value.length : nextNewline;

    const selectedBlock = value.slice(lineStart, lineEnd);

    const replacement = selectedBlock
      .split('\n')
      .map((line, index) => formatter(line, index))
      .join('\n');

    editor.setRangeText(
      replacement,
      lineStart,
      lineEnd,
      'select'
    );

    updateSource(editor);
    editor.focus();
    scheduleSave();
  }

  function historyCommand(command) {
    const editor = currentEditor();
    if (!editor) return;

    editor.focus();

    try {
      document.execCommand(command);
    } catch (_) {}

    updateSource(editor);
    scheduleSave();
  }

  function insertDate() {
    const editor = currentEditor();
    if (!editor) return;

    const d = new Date();

    const iso =
      `${d.getFullYear()}-` +
      `${String(d.getMonth() + 1).padStart(2, '0')}-` +
      `${String(d.getDate()).padStart(2, '0')}`;

    const start = editor.selectionStart;

    const insertion =
      `${start > 0 && editor.value[start - 1] !== '\n' ? '\n' : ''}` +
      `${iso} — `;

    editor.setRangeText(
      insertion,
      start,
      editor.selectionEnd,
      'end'
    );

    updateSource(editor);
    editor.focus();
    scheduleSave();
  }

  const icons = {
    bullet: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>
        <path d="M9 6h11M9 12h11M9 18h11"/>
      </svg>`,
    number: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4.5h1v5M3.5 9.5h2M3.5 14.5c.4-1.2 2.5-1.4 2.5.2 0 1.1-2.5 2-2.5 3.3H6"/>
        <path d="M10 6h10M10 12h10M10 18h10"/>
      </svg>`,
    check: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.5" y="4" width="5" height="5" rx="1"/><path d="m3.8 6.4 1.1 1.1 2-2.2M10 6.5h11"/>
        <rect x="2.5" y="15" width="5" height="5" rx="1"/><path d="M10 17.5h11"/>
      </svg>`,
    indent: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 6h10M10 12h10M10 18h10M3 9l3 3-3 3M6 12H2"/>
      </svg>`,
    outdent: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 6h10M10 12h10M10 18h10M6 9l-3 3 3 3M3 12h5"/>
      </svg>`,
    undo: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 8 4 12l5 4M5 12h7c4.4 0 7 2 7 6"/>
      </svg>`,
    redo: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m15 8 5 4-5 4M19 12h-7c-4.4 0-7 2-7 6"/>
      </svg>`,
    date: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M7 2.5v4M17 2.5v4M3 9h18M7.5 13h3M13.5 13h3M7.5 17h3"/>
      </svg>`
  };

  function makeTool(action, label, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-format-btn lexi-note-tool';
    button.dataset.noteTool = action;
    button.innerHTML = icons[action] || '';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
    });
    button.addEventListener('click', event => {
      event.preventDefault();
      handler();
    });
    return button;
  }

  formatBar.replaceChildren(
    makeTool('bullet', 'Bullet', () => {
      replaceSelectedLines(line => `• ${line}`);
    }),
    makeTool('number', 'Number', () => {
      replaceSelectedLines(
        (line, index) => `${index + 1}. ${line}`
      );
    }),
    makeTool('check', 'Check', () => {
      replaceSelectedLines(line => `☐ ${line}`);
    }),
    makeTool('indent', 'Indent', () => {
      replaceSelectedLines(line => `  ${line}`);
    }),
    makeTool('outdent', 'Outdent', () => {
      replaceSelectedLines(line => {
        if (line.startsWith('  ')) return line.slice(2);
        if (line.startsWith(' ')) return line.slice(1);
        return line;
      });
    }),
    makeTool('undo', 'Undo', () => {
      historyCommand('undo');
    }),
    makeTool('redo', 'Redo', () => {
      historyCommand('redo');
    }),
    makeTool('date', 'Date', insertDate)
  );

  function appendLinkifiedText(target, text) {
    const urlPattern = /https?:\/\/[^\s]+/g;
    let lastIndex = 0;
    let match;

    while ((match = urlPattern.exec(text)) !== null) {
      let url = match[0];
      let trailing = '';
      while (/[),.;!?]$/.test(url)) {
        trailing = url.slice(-1) + trailing;
        url = url.slice(0, -1);
      }

      if (match.index > lastIndex) {
        target.append(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const link = document.createElement('a');
      link.className = 'lexi-note-link';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = url;
      target.append(link);

      if (trailing) target.append(document.createTextNode(trailing));
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) target.append(document.createTextNode(text.slice(lastIndex)));
  }

  function decorateReadView() {
    if (decoratingReadView) return;
    const render = noteBody.querySelector('.lexi-plain-render');
    if (!render) return;

    decoratingReadView = true;
    try {
      render.querySelectorAll('.lexi-note-line').forEach(row => {
        if (row.dataset.plainDecorated === 'true') return;

        const text = row.textContent || '';
        if (row.classList.contains('lexi-note-text-line') && text.trim() === '---') {
          row.textContent = '';
          row.classList.add('lexi-note-divider-row');
          const divider = document.createElement('hr');
          divider.className = 'lexi-note-divider';
          row.append(divider);
          row.dataset.plainDecorated = 'true';
          return;
        }

        const textTarget = row.classList.contains('lexi-note-text-line')
          ? row
          : row.querySelector('.lexi-note-text');
        if (!textTarget) {
          row.dataset.plainDecorated = 'true';
          return;
        }

        const original = textTarget.textContent || '';
        if (/https?:\/\//.test(original)) {
          textTarget.textContent = '';
          appendLinkifiedText(textTarget, original);
        }
        row.dataset.plainDecorated = 'true';
      });
    } finally {
      decoratingReadView = false;
    }
  }

  const observer = new MutationObserver(() => {
    queueMicrotask(decorateReadView);
  });

  observer.observe(noteBody, { childList: true, subtree: true });
  observer.observe(formatBar, { attributes: true, attributeFilter: ['hidden'] });

  queueMicrotask(decorateReadView);
})();
