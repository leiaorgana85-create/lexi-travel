(() => {
  const DRAFT_STORAGE = 'lexiTravelNoteDraftsV1';
  const notesList = document.getElementById('notesList');
  if (!notesList) return;

  function noteById(id) {
    try {
      return (appData.notes || []).find(note => String(note.ID || '') === String(id)) || null;
    } catch (error) {
      return null;
    }
  }

  function effectiveTitle(note) {
    let title = String(note?.Title || '');
    try {
      const drafts = JSON.parse(localStorage.getItem(DRAFT_STORAGE) || '{}') || {};
      const draft = drafts[String(note?.ID || '')];
      if (draft && Object.prototype.hasOwnProperty.call(draft, 'Title')) {
        title = String(draft.Title || '');
      }
    } catch (error) {
      // Fall back to the loaded note title.
    }
    return title.trim() || 'Untitled Note';
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

  function makeCustomIcon(button) {
    const icon = document.createElement('span');
    icon.className = 'note-list-custom-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.style.display = 'inline-block';
    icon.style.width = '17px';
    icon.style.marginRight = '3px';
    icon.style.fontSize = '12px';
    icon.style.lineHeight = '1';
    icon.style.verticalAlign = '-1px';
    icon.style.textAlign = 'center';
    button.prepend(icon);
    return icon;
  }

  function decorate() {
    notesList.querySelectorAll('.note-list-item[data-note-id]').forEach(button => {
      const note = noteById(button.dataset.noteId);
      if (!note) return;

      // Automatic icons from the older enhancement layer are intentionally hidden.
      // Do not remove them: removing them would make that layer recreate them and
      // could restart the MutationObserver loop that froze Notes.
      button.querySelectorAll('.note-list-icon').forEach(icon => {
        if (icon.style.display !== 'none') icon.style.display = 'none';
      });

      const rawTitle = effectiveTitle(note);
      const custom = splitLeadingEmoji(rawTitle);
      let customIcon = button.querySelector('.note-list-custom-icon');

      if (custom) {
        if (!customIcon) customIcon = makeCustomIcon(button);
        if (customIcon.textContent !== custom.icon) customIcon.textContent = custom.icon;
      } else if (customIcon) {
        customIcon.remove();
        customIcon = null;
      }

      const textNode = titleTextNode(button);
      const displayTitle = custom ? custom.displayTitle : rawTitle;
      if (textNode && textNode.nodeValue !== displayTitle) {
        textNode.nodeValue = displayTitle;
      }
    });
  }

  const observer = new MutationObserver(() => queueMicrotask(decorate));
  observer.observe(notesList, { childList: true, subtree: true });

  queueMicrotask(decorate);
})();