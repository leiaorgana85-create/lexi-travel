(() => {
  const noteBody = document.getElementById('noteBody');
  const formatBar = document.getElementById('noteFormatBar');

  if (!noteBody || !formatBar) return;

  const HISTORY_LIMIT = 100;
  const INDENT = '  ';
  const history = new WeakMap();
  let decoratingReadView = false;

  function editor() {
    return noteBody.querySelector('.lexi-plain-editor');
  }

  function sourceFor(currentEditor) {
    return currentEditor?.parentElement?.querySelector('.lexi-plain-source') || noteBody.querySelector('.lexi-plain-source');
  }

  function snapshot(currentEditor) {
    return {
      value: currentEditor.value,
      start: currentEditor.selectionStart ?? 0,
      end: currentEditor.selectionEnd ?? currentEditor.selectionStart ?? 0
    };
  }

  function ensureHistory(currentEditor) {
    if (!currentEditor) return null;
    if (!history.has(currentEditor)) {
      history.set(currentEditor, {
        undo: [],
        redo: [],
        pending: null,
        last: snapshot(currentEditor),
        applying: false
      });
    }
    return history.get(currentEditor);
  }

  function updateSource(currentEditor) {
    const source = sourceFor(currentEditor);
    if (source) source.textContent = currentEditor.value;
  }

  function sameSnapshot(a, b) {
    return Boolean(a && b && a.value === b.value && a.start === b.start && a.end === b.end);
  }

  function pushUndo(currentEditor, before) {
    const state = ensureHistory(currentEditor);
    if (!state || !before) return;
    const previous = state.undo[state.undo.length - 1];
    if (!sameSnapshot(previous, before)) {
      state.undo.push(before);
      if (state.undo.length > HISTORY_LIMIT) state.undo.shift();
    }
    state.redo = [];
    state.last = snapshot(currentEditor);
    refreshHistoryButtons(currentEditor);
  }

  function applySnapshot(currentEditor, snap) {
    const state = ensureHistory(currentEditor);
    if (!state || !snap) return;
    state.applying = true;
    currentEditor.value = snap.value;
    updateSource(currentEditor);
    currentEditor.focus();
    const max = currentEditor.value.length;
    currentEditor.setSelectionRange(Math.min(snap.start, max), Math.min(snap.end, max));
    state.last = snapshot(currentEditor);
    state.applying = false;
  }

  function undo() {
    const currentEditor = editor();
    const state = ensureHistory(currentEditor);
    if (!currentEditor || !state || !state.undo.length) return;
    state.redo.push(snapshot(currentEditor));
    const previous = state.undo.pop();
    applySnapshot(currentEditor, previous);
    refreshHistoryButtons(currentEditor);
  }

  function redo() {
    const currentEditor = editor();
    const state = ensureHistory(currentEditor);
    if (!currentEditor || !state || !state.redo.length) return;
    state.undo.push(snapshot(currentEditor));
    const next = state.redo.pop();
    applySnapshot(currentEditor, next);
    refreshHistoryButtons(currentEditor);
  }

  function lineBounds(text, start, end) {
    const first = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    let last = text.indexOf('\n', end);
    if (last === -1) last = text.length;
    return [first, last];
  }

  function replaceSelectedLines(transform) {
    const currentEditor = editor();
    if (!currentEditor) return;

    const before = snapshot(currentEditor);
    const text = currentEditor.value;
    const start = currentEditor.selectionStart ?? 0;
    const end = currentEditor.selectionEnd ?? start;
    const [blockStart, blockEnd] = lineBounds(text, start, end);
    const original = text.slice(blockStart, blockEnd);
    const changed = transform(original.split('\n')).join('\n');

    if (changed === original) return;

    currentEditor.value = text.slice(0, blockStart) + changed + text.slice(blockEnd);
    updateSource(currentEditor);
    currentEditor.focus();
    currentEditor.setSelectionRange(blockStart, blockStart + changed.length);
    pushUndo(currentEditor, before);
  }

  function indent() {
    replaceSelectedLines(lines => lines.map(line => line ? `${INDENT}${line}` : line));
  }

  function outdent() {
    replaceSelectedLines(lines => lines.map(line => {
      if (line.startsWith('\t')) return line.slice(1);
      if (line.startsWith(INDENT)) return line.slice(INDENT.length);
      if (line.startsWith(' ')) return line.slice(1);
      return line;
    }));
  }

  function quote() {
    replaceSelectedLines(lines => {
      const nonBlank = lines.filter(line => line.trim());
      const remove = nonBlank.length > 0 && nonBlank.every(line => /^\s*>\s?/.test(line));
      return lines.map(line => {
        if (!line.trim()) return line;
        if (remove) return line.replace(/^(\s*)>\s?/, '$1');
        return line.replace(/^(\s*)/, '$1> ');
      });
    });
  }

  function divider() {
    const currentEditor = editor();
    if (!currentEditor) return;

    const before = snapshot(currentEditor);
    const text = currentEditor.value;
    const start = currentEditor.selectionStart ?? 0;
    const end = currentEditor.selectionEnd ?? start;
    const prefix = start > 0 && text[start - 1] !== '\n' ? '\n' : '';
    const suffix = end < text.length && text[end] !== '\n' ? '\n' : '';
    const insertion = `${prefix}---${suffix}`;

    currentEditor.value = text.slice(0, start) + insertion + text.slice(end);
    const caret = start + insertion.length;
    updateSource(currentEditor);
    currentEditor.focus();
    currentEditor.setSelectionRange(caret, caret);
    pushUndo(currentEditor, before);
  }

  function makeButton(action, label, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-format-btn note-plain-tool-btn';
    button.dataset.plainTool = action;
    button.textContent = label;
    button.setAttribute('aria-label', title);
    button.title = title;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      runTool(action);
    });
    button.addEventListener('click', event => {
      event.preventDefault();
      if (event.detail === 0) runTool(action);
    });
    return button;
  }

  function runTool(action) {
    if (action === 'undo') undo();
    else if (action === 'redo') redo();
    else if (action === 'indent') indent();
    else if (action === 'outdent') outdent();
    else if (action === 'divider') divider();
    else if (action === 'quote') quote();
  }

  const controls = [
    makeButton('undo', '↶', 'Undo'),
    makeButton('redo', '↷', 'Redo'),
    makeButton('indent', '⇥', 'Indent'),
    makeButton('outdent', '⇤', 'Outdent'),
    makeButton('divider', '—', 'Insert divider'),
    makeButton('quote', '>', 'Quote')
  ];

  controls.reverse().forEach(button => formatBar.prepend(button));

  const undoButton = formatBar.querySelector('[data-plain-tool="undo"]');
  const redoButton = formatBar.querySelector('[data-plain-tool="redo"]');

  function refreshHistoryButtons(currentEditor = editor()) {
    const state = currentEditor ? ensureHistory(currentEditor) : null;
    if (undoButton) undoButton.disabled = !state?.undo.length;
    if (redoButton) redoButton.disabled = !state?.redo.length;
  }

  noteBody.addEventListener('beforeinput', event => {
    const currentEditor = event.target;
    if (!(currentEditor instanceof HTMLTextAreaElement) || !currentEditor.classList.contains('lexi-plain-editor')) return;
    const state = ensureHistory(currentEditor);
    if (!state || state.applying) return;
    state.pending = snapshot(currentEditor);
  });

  noteBody.addEventListener('input', event => {
    const currentEditor = event.target;
    if (!(currentEditor instanceof HTMLTextAreaElement) || !currentEditor.classList.contains('lexi-plain-editor')) return;
    const state = ensureHistory(currentEditor);
    if (!state || state.applying) return;
    const before = state.pending || state.last;
    state.pending = null;
    pushUndo(currentEditor, before);
  });

  formatBar.addEventListener('pointerdown', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-format]') : null;
    if (!button) return;
    const currentEditor = editor();
    if (!currentEditor) return;
    const before = snapshot(currentEditor);
    setTimeout(() => {
      if (currentEditor.value !== before.value) pushUndo(currentEditor, before);
    }, 0);
  }, true);

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
    queueMicrotask(() => {
      const currentEditor = editor();
      if (currentEditor) ensureHistory(currentEditor);
      refreshHistoryButtons(currentEditor);
      decorateReadView();
    });
  });

  observer.observe(noteBody, { childList: true, subtree: true });
  observer.observe(formatBar, { attributes: true, attributeFilter: ['hidden'] });

  queueMicrotask(() => {
    refreshHistoryButtons();
    decorateReadView();
  });
})();
