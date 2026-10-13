# Lexi Travel — Standing App Guide

Last updated: 2026-10-13

This README is the canonical standing guide for the Lexi Travel app. Future work should read this file before making changes. It records the app’s architecture, data rules, deployment rules, maintenance policy, and non-negotiable implementation constraints.

## 1. App identity and live resources

- Repository: `leiaorgana85-create/lexi-travel`
- Live app: `https://leiaorgana85-create.github.io/lexi-travel/`
- Backend data workbook: `LEXI Travel Data`
- Google Sheet ID: `1sFNdzuriv-fVnYOovSTsybdHaxNUvnBa5_7DclvnEuw`
- Apps Script web app endpoint: `https://script.google.com/macros/s/AKfycbxeJRgEegJlc7kmtstRJtF0X-b4-0QBk-9dqBpCooDOs4NfPomi4_Kptb0CDSIAqqDw/exec`
- The API key is stored only in the browser under localStorage key `lexiTravelApiKey`. Never commit or expose the key.

The physical iPhone 13 mini PWA is the authoritative UI test target. Desktop/browser previews are useful, but a layout issue is not considered resolved until it is physically confirmed on the iPhone.

## 2. Product model

Lexi Travel has three primary user-facing areas:

### Calendar
For things tied to an exact date/time or date-specific travel context.

Canonical Calendar categories:
- `Flight`
- `Appointment`
- `Event`
- `Holiday`
- `To Do`

Birthdays, anniversaries, reminders, and similar untimed occasions use `Event`; do not create separate category families unless there is a strong product reason.

### Notes
For reference material, itineraries, schedules, tables, reusable information, and longer-form content that is not fundamentally a calendar event or task.

### Plan
For monthly task management plus Country Days.

A Plan item may have an optional exact Due Date.
- No Due Date → Plan only.
- Due Date present → same task appears in Plan and Calendar.

The governing principle is: **one To Do, one underlying record, two views when dated.**

## 3. Source-of-truth rules

### Events
Normal Calendar events are stored in the `EVENTS` sheet.

Schema:
`ID | Date | Title | Time | Category | Details | Link | Status | Travel Time | Flight Plan`

For normal non-flight events, `Travel Time` and `Flight Plan` may be blank.

For Flight events:
- `Date` is the travel date.
- `Title` is the high-level route, e.g. `PUS→BKK`.
- `Time` is the overall departure → arrival clock-time range.
- `Travel Time` is the total elapsed journey duration, e.g. `9h 45m`. Store it explicitly because it cannot always be derived safely from local departure/arrival times across time zones.
- `Flight Plan` is display-ready operational itinerary text for Upcoming Moves. It may contain multiple lines. The app should display these lines directly rather than requiring a parser-specific punctuation format.
- `Details` is for secondary booking/reference information such as airline, fare, reservation code, baggage, terminal, aircraft, and similar information. Do not duplicate route/date/status/travel-time/segment information in Details when it already has a canonical field.
- `Status` may remain `Booked` or another useful backend value even when Plan intentionally does not display it.

Upcoming Moves flight hierarchy:
- Top row: `Date | Route | overall Time (Travel Time)`.
- Flight section: lines from `Flight Plan` only; for connections this is where segment numbers, connection airport, segment times, and layover duration belong.
- Stay section: destination accommodation/location summary.
- Do not display reservation code, baggage, terminal, aircraft, or `Booked` status in Upcoming Moves; those belong in Calendar Details.
- Legacy Details parsing may remain only as backward-compatible fallback for old rows. New/manual flight data should use `Travel Time` and `Flight Plan`.

### To Dos / Plan items
All To Dos are stored in `PLAN_ITEMS`, not duplicated into `EVENTS`.

Schema:
`ID | Month | Text | Due Date | Completed | Sort Order | Updated At | Archived`

Rules:
- If `Due Date` exists, `Month` is derived from `YYYY-MM` of the due date.
- If `Due Date` is blank, the selected Plan month is used.
- `Archived = TRUE` means the item is historical/deleted and is hidden from normal Plan and Calendar views.
- The `ID`, `Sort Order`, `Updated At`, and `Archived` fields are technical fields and may be hidden in the Google Sheet UI.
- Deleted Plan items are soft-deleted for history rather than immediately removing the row.

Calendar-to-Plan behavior:
- Creating a new Calendar item with category `To Do`, `Todo`, or `To-Do` routes the item into `PLAN_ITEMS`.
- It must not create a duplicate `EVENTS` row.
- A brand-new Calendar To Do receives a normal Plan ID.
- Converting an existing Calendar event to category `To Do` moves it to `PLAN_ITEMS`, preserves the original Event ID as the Plan item ID, and removes the old `EVENTS` row.
- Preserving the ID on conversion is the standing identity rule so the same logical record remains traceable across `EVENTS` → `PLAN_ITEMS`.

Plan-to-Appointment behavior:
- This is an explicit conversion, not ongoing two-way synchronization.
- From Plan Edit, `Convert to Appointment` requires a date and time.
- Conversion preserves the same record ID.
- The active record is created in `EVENTS` as category `Appointment` with status `Booked`.
- The corresponding `PLAN_ITEMS` record is archived so there is only one active record after conversion.
- If the To Do text begins with a recognizable time followed by `·`, the conversion can reuse that time and remove the time prefix from the Appointment title.
- The conversion attempts to roll back the new Event if archiving the Plan item fails, to avoid duplicate active records.

### Notes
Notes are stored in `NOTES`.

Schema:
`ID | Title | Category | Body | Pinned | Sort Order | Updated At | Archived`

Notes may contain either plain text or structured JSON used by the richer Notes renderer. Technical fields may remain hidden in the Sheet UI.

### Location / travel data
- `LOCATIONS`: date ranges, country, city, label, notes.
- `COUNTRIES`: country-day rules and limits.
- `DAY_OVERRIDES`: explicit day-count overrides when needed.

Country rule detail may remain in Google Sheets even when intentionally hidden from the Plan UI.

## 4. Annual archive policy

Lexi Travel keeps historical records, but the live workbook should remain operationally small.

### Annual archive cadence
Once per year, normally in January:

1. Make a frozen copy of the full live workbook.
2. Name it `LEXI Travel Archive YYYY`, where `YYYY` is the year being archived.
3. Verify the archive copy before deleting anything from the live workbook.
4. Prune eligible historical rows from the live workbook only after verification.

### What moves out of the live workbook
- `EVENTS`: prior-year event rows may be removed from live after the archive is verified.
- `PLAN_ITEMS`: prior-year Plan rows, including completed and archived/deleted rows, may be removed from live after verification.
- `LOCATIONS`: prior-year location history may be removed from live once safely archived, provided the current app no longer needs those rows for active calculations.
- `DAY_OVERRIDES`: prior-year overrides may be removed when they no longer affect active calculations.
- `NOTES`: do **not** blindly archive by age. Keep evergreen/reference notes live. Move only notes that are genuinely obsolete or intentionally archived.
- `COUNTRIES`: keep current rule rows live unless explicitly superseded.

### Archive design rule
Use separate yearly archive workbooks. Do **not** accumulate `EVENTS_2026`, `EVENTS_2027`, etc. tabs inside the live workbook.

The live workbook remains the only workbook the app reads/writes during normal use. Archive files are historical records, not live data sources.

Annual archiving is a standing maintenance rule. It should eventually be automated, but until that automation exists, archive operations must be deliberate and verified.

## 5. Performance and scalability rules

The Google Sheet is the durable ledger. The app should load only the data needed for the current view.

Target architecture:
- `PLAN_ITEMS`: fetch one month at a time; exclude archived rows from normal views.
- `EVENTS`: fetch only the visible calendar month, ideally with a small previous/current/next-month buffer.
- `NOTES`: load a lightweight note index first; fetch the full body only when a note is opened.
- Keep recently viewed data in local cache so the UI opens immediately while Google refreshes in the background.

Important current state:
- Plan already follows the month-specific loading pattern.
- Calendar and Notes still have areas where the main `data` endpoint can return whole tables. These should be converted to filtered/lazy loading before dataset size becomes large.

Annual archiving and filtered API loading are complementary. We use both.

## 6. Browser/local storage rules

Important localStorage keys include:
- `lexiTravelApiKey` — API key; device/browser-local only.
- `lexiTravelMonthlyPlanV1` — Plan cache.
- `lexiTravelMonthlyPlanDeletedV1` — pending Plan deletions/tombstones.
- `lexiTravelCalendarCacheV1` — Calendar cache.
- `lexiTravelEventDraftsV1` — unsynced/local Calendar drafts.
- `lexiTravelTheme` — Light/Dark theme preference.

Clearing browser/site data can remove these local values. The Google Sheet remains the durable backend for synced content.

Never treat localStorage as the only permanent source of user data.

## 7. Apps Script backend structure

The Apps Script project is bound to the Lexi Travel data workbook.

Current conceptual split:
- `Code.gs` — GET/data read handling and shared helpers.
- `NotesSync.gs` — consolidated POST router plus Notes write helpers.
- `CalendarSync.gs` — event write helpers.
- `PlanSync.gs` — Plan write/list/delete helpers.

POST routing supports Notes, Events, and Plan operations. The active deployment should be updated as a **new version of the existing Web App deployment**, preserving the existing URL.

Do not casually create a second deployment or change the production endpoint.

## 8. GitHub change discipline

Before **every** GitHub write:

1. Fetch the exact current target file from the default branch.
2. Use its current SHA for the update.
3. Make only the targeted change required.
4. Re-fetch the file after the write and verify the result.

For a new file:
1. Fetch the intended path first.
2. Confirm `404 / Not Found`.
3. Create the file.
4. Re-fetch and verify it.

Do not guess source code from memory. Do not broadly rewrite working files when a narrow patch will do.

If a GitHub Pages change is not visible immediately, consider Pages/cache propagation before modifying the code again.

## 9. Google Sheet change discipline

Before editing structured Sheet data:

1. Read the exact target row/range/cell first.
2. Make the smallest targeted write.
3. Re-read the same target after the write.
4. Verify the resulting values.

For creating a new tab, reading workbook metadata before creation and re-reading the new tab afterward is acceptable.

Never bulk-reorganize or delete historical data without first proving what each row is and whether it is preserved elsewhere.

## 10. UI and testing rules

- Physical iPhone 13 mini / PWA is authoritative.
- Do not claim a mobile layout bug is fixed until the user physically confirms it.
- Text inputs on iOS may need 16px effective font sizing to avoid Safari auto-zoom; use visual scaling/layout techniques rather than allowing fields to overflow.
- Do not squeeze or distort flight text to make it fit.
- Travel-day city movement must remain visible.
- Keep category colors visually distinct where the calendar relies on color to separate content.
- Calendar day cells should remain compact; detailed content belongs in the lower detail pane.
- Avoid broad visual rewrites of accepted Calendar/Notes layouts when only one component is being changed.

Whenever asking the user to test the live app, use exactly:
`https://leiaorgana85-create.github.io/lexi-travel/`

## 11. Theme rules

Settings supports:
- Light
- Dark

Theme is stored locally using `lexiTravelTheme`.

Dark mode should be implemented as shared theme overrides, not by duplicating the entire UI stylesheet.

## 12. Data retention principles

- Historical data is valuable and should be preserved.
- Deletion in the live app may use soft-archive fields when history matters.
- The annual archive workbook is the long-term historical record.
- The live workbook is an operational database, not a forever-growing archive.
- Never delete historical live rows until an archive copy has been created and verified.

## 13. Key design decisions that should not be reversed casually

- To Do is a Plan record, not an Event record.
- A dated To Do appears in both Plan and Calendar without duplication.
- Undated To Dos remain Plan-only.
- Event → To Do conversion preserves the original Event ID in `PLAN_ITEMS`.
- To Do → Appointment is an explicit type conversion, not continuous reverse sync.
- To Do → Appointment preserves the same ID, creates one active `EVENTS` record, and archives the Plan record.
- Holiday/Event are separate Calendar visual concepts; birthdays and similar untimed occasions use Event.
- Country Days lives under Plan.
- Notes are for reference material, not a substitute for Calendar or Plan.
- Flight operational data uses `Travel Time` + `Flight Plan`; do not push new flight segment parsing back into free-form Details.
- Technical columns may be hidden in Sheets to keep manual editing clean.
- Separate yearly archive workbooks are preferred over year-specific tabs in the live workbook.
- The app must preserve the existing production Web App URL when deploying backend updates.

## 14. Maintenance checklist for future work

Before making a substantial change, verify:
- Which Google Sheet tab is the source of truth?
- Is the data permanent in Google Sheets, or only cached locally?
- Will this create a duplicate record between `EVENTS` and `PLAN_ITEMS`?
- Does this change require an Apps Script deployment as well as a GitHub Pages change?
- Has the exact current source been fetched before writing?
- Has the exact Sheet target been read before writing?
- Does the change preserve existing synced Notes/Calendar/Plan behavior?
- Has cache propagation been considered before concluding a code change failed?
- Has the final behavior been tested on the physical iPhone when it affects mobile UI?

## 15. Current follow-up architecture work

These are recognized improvements, not permission to change unrelated behavior:

- Convert Calendar data loading from whole-table reads to month-filtered reads.
- Convert Notes loading to lightweight index + on-demand body fetch.
- Add a deliberate annual archive workflow, and eventually automate it.
- Continue validating Calendar ↔ Plan To Do routing so both views stay consistent.

When updating this guide, modify the existing README rather than creating multiple competing rule documents. This file is the single canonical standing document for Lexi Travel.

## 16. iPhone Home Screen deployment

Use the same installation method proven for Lexi Music. **Do not use an iOS Shortcut as the Lexi Travel launcher.** A Shortcut can hand the URL to the default browser (for example Brave), which is not the same standalone web-app context.

Install the real standalone web app from **Safari**:

1. In Safari, open `https://leiaorgana85-create.github.io/lexi-travel/`.
2. Tap **Share → Add to Home Screen**.
3. If iOS shows **Open as Web App**, leave it enabled.
4. Confirm the preview shows the Lexi Travel icon.
5. Tap **Add**.
6. Launch the new Home Screen icon and confirm it opens **standalone** with no Safari or Brave address bar.
7. If the standalone app is not already connected, open **⚙︎ Settings** and enter the Lexi Travel API key there. Do not paste or commit the key anywhere else.

Current Home Screen configuration:
- `manifest.json` name: `LEXI Travel`
- `display`: `standalone`
- `start_url`: `./`
- `scope`: `./`
- icon: `/lexi-assets/travel-logo.png`
- `index.html` includes the manifest plus iOS standalone web-app metadata.

The Home Screen icon asset lives in the shared `leiaorgana85-create/lexi-assets` repository as `travel-logo.png`.
