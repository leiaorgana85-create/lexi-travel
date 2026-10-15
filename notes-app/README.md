# Lexi Notes

Standalone fast-access notes PWA for the Lexi Apps Ecosystem.

## Product boundary
- Lexi Notes owns quick/personal working notes.
- LEXI Notes Data Google Sheet is the source of truth.
- Lexi Travel Notes remains for static travel-reference material and does not share records with Lexi Notes.
- No note is duplicated between the two apps automatically.

## UI
- Dark theme only.
- Home screen opens directly to a global search + notes list.
- Pinned notes sort first.
- New note opens directly in edit mode.
- Existing note opens in read mode so URLs are clickable automatically.
- Formatting toolbar: bullets, numbered list, checklist, indent/outdent, undo/redo, date insert.
- Email uses `mailto:`; Share uses the native Web Share sheet when available.

## Backend / Sheet
Spreadsheet: `LEXI Notes Data`

NOTES schema:
`ID | Created At | Updated At | Title | Category | Body | Pinned | Locked | Archived | Sort Order`

The Apps Script in `backend.gs` must be bound to that spreadsheet. Script Property `LEXI_NOTES_API_KEY` is required. The app stores that API key only in browser localStorage under `lexiNotesApiKey`.

## Lock model
- Locking is per-note.
- First lock prompts the owner to establish a PIN (minimum 4 characters).
- The backend stores only a SHA-256 hash in Script Property `LEXI_NOTES_PIN_HASH`.
- Normal list/search responses redact locked note bodies.
- A locked body is returned only after the backend validates the PIN.
- The PWA keeps the PIN only in `sessionStorage` for the current session and never puts locked note bodies in its normal local cache.
- This is an **app-access lock, not encryption of the Google Sheet**. Anyone with direct edit/read access to the Sheet can see the underlying Body cells.

## Deployment
This standalone PWA is hosted from the `notes-app/` folder of the `lexi-travel` repository. It is logically and data-wise separate from Lexi Travel even though the static files share the same GitHub Pages repository.
