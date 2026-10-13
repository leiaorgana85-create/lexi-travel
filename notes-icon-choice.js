(() => {
  const notesList = document.getElementById('notesList');
  if (!notesList) return;

  function noteById(id) {
    try {
      return (appData.notes || []).find(note => String(note.ID || '') === String(id)) || null;
    } catch (error) {
      return null;
    }
  }

  function splitLeadingEmoji(title) {
    const raw = String(title || '').trimStart();
    if (!raw) return null;

    let first = '';
    try {
      if (typeof Intl.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        first = segmenter.segment(raw)[Symbol.iterator]().next().value?.segment || '';
      }
    } catch (error) {
      first = '';
    }

    if (!first) first = Array.from(raw)[0] || '';
    if (!first) return null;

    let isEmoji = false;
    try {
      isEmoji = /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})/u.test(first);
    } catch (error) {
      isEmoji = /[^\u0000-\u007f]/.test(first);
    }
    if (!isEmoji) return null;

    return {
      icon: first,
      displayTitle: raw.slice(first.length).trimStart() || 'Untitled Note'
    };
  }

  function titleTextNode(button) {
    return [...button.childNodes].find(node =>
      node.nodeType === Node.TEXT_NODE && String(node.nodeValue || '').trim()
    ) || null;
  }

  function decorate() {
    notesList.querySelectorAll('.note-list-item[data-note-id]').forEach(button => {
      const note = noteById(button.dataset.noteId);
      if (!note) return;

      const custom = splitLeadingEmoji(note.Title);
      if (!custom) return;

      let icon = button.querySelector('.note-list-icon');
      if (!icon) {
        icon = document.createElement('span');
        icon.className = 'note-list-icon';
        icon.setAttribute('aria-hidden', 'true');
        button.prepend(icon);
      }
      if (icon.textContent !== custom.icon) icon.textContent = custom.icon;

      const textNode = titleTextNode(button);
      if (textNode && textNode.nodeValue !== custom.displayTitle) {
        textNode.nodeValue = custom.displayTitle;
      }
    });
  }

  const observer = new MutationObserver(() => queueMicrotask(decorate));
  observer.observe(notesList, { childList: true, subtree: true });

  queueMicrotask(decorate);
})();
