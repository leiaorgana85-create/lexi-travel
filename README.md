# Lexi Travel — Standing App Guide

Last updated: 2026-10-14

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

Lexi Travel has four primary user-facing areas:

### Calendar
For things tied to an exact date/time or date-specific travel context.

Canonical Calendar concepts include:
- `Flight`
- `Appointment`
- `Event`
- `Holiday`
- `To Do`
- `Time Off` for special date marking where already present in the data.

`Flight` is a system-backed Calendar category: create and edit flight schedules in `FLIGHT_LEGS`, not in the normal Calendar event editor. The app's New/Edit Event category dropdown intentionally offers only `Appointment`, `Event`, `Holiday`, and `To Do` so a standalone Flight event cannot be created accidentally. `Time Off` is supported by the calendar rendering layer but is not currently exposed as a normal editor choice.

Birthdays, anniversaries, reminders, and similar untimed occasions use `Event`; do not create separate category families unless there is a strong product reason.

### Plan
For monthly task management, Upcoming Moves, and Country Days.

A Plan item may have an optional exact Due Date.
- No Due Date → Plan only.
- Due Date present → same task appears in Plan and Calendar.

The governing principle is: **one To Do, one underlying record, two views when dated.**

### Notes
For reference material, itineraries, schedules, tables, reusable information, and longer-form content that is not fundamentally a calendar event or task.

### Shopping
For the Bangkok shopping list. `SHOPPING_LIST` is the durable source of truth. The app is the normal surface for viewing the list and toggling `Bought`; structured item creation/editing remains Sheet/admin-driven until a dedicated app editor exists.

## 3. Source-of-truth rules

### Events
Normal Calendar events are stored in the `EVENTS` sheet.

Schema:
`ID | Date | Title | Time | Category | Details | Link | Status | Travel Time | Flight Plan`

For normal non-flight events, `Travel Time` and `Flight Plan` remain blank.

For Flight events, `EVENTS` is entirely an app-facing projection of the structured flight record. In the current one-tab flight architecture, **do not manually edit Flight rows in `EVENTS`**. Their displayed fields are rebuilt from `FLIGHT_LEGS`:
- `Date` and `Time` come from the first departure and final arrival.
- `Title` comes from Leg 1 `Display Route`, falling back to the first origin → final destination airport route.
- `Category` is `Flight`.
- `Details` is built from Leg 1 `Trip Details` plus any per-leg `Leg Details`.
- `Link` and `Status` come from Leg 1.
- `Travel Time` is total elapsed journey duration.
- `Flight Plan` is the generated multi-line itinerary consumed by Upcoming Moves.

Normal non-flight Calendar events continue to use `EVENTS` as their editable source record. Existing Flight rows remain visible in Calendar but are intentionally read-only in the normal app event editor.

Upcoming Moves flight hierarchy:
- Top row: `Date | Route | overall Time (Travel Time)`.
- Flight section: generated segment rows including flight number, airports, local times and each segment duration; connection rows show layover airport and layover duration.
- Stay section: destination accommodation/location summary.
- Do not display reservation code, baggage, terminal, aircraft, or `Booked` status in Upcoming Moves; those belong in Calendar Details.
- Legacy Details parsing may remain only as backward-compatible fallback for old rows. New flight segment data belongs in `FLIGHT_LEGS`, not free-form `EVENTS.Details`.

### Structured flight legs
`FLIGHT_LEGS` is the canonical operational schedule and metadata source for flights.

Current schema:
`Event ID | Leg # | Flight # | From | Depart Date | Depart Time | To | Arrive Date | Arrive Time | Display Route | Leg Details | Trip Details | Link | Status | From TZ | To TZ | Segment Time | Layover After`

Color convention across the workbook uses exactly two colors:
- **Light green** = user-editable/manual input.
- **Light grey** = system-generated, derived, or technical; do not edit manually.

For `FLIGHT_LEGS`:
- Manual/editable: columns `B:N` — `Leg #`, `Flight #`, `From`, `Depart Date`, `Depart Time`, `To`, `Arrive Date`, `Arrive Time`, `Display Route`, `Leg Details`, `Trip Details`, `Link`, `Status`.
- System/derived: `Event ID` plus `From TZ`, `To TZ`, `Segment Time`, `Layover After`.
- `Display Route`, `Trip Details`, `Link`, and `Status` are trip-level metadata and belong on Leg 1.
- `Leg Details` may differ by leg.

Rules:
- `Depart Date/Time` and `Arrive Date/Time` are the scheduled **local airport times**.
- Arrive Date must reflect the actual local arrival date, including overnight/date-line changes.
- `From` and `To` use IATA airport codes such as `PUS`, `HKG`, `BKK`, `DAD`.
- `AIRPORT_TZ` is a hidden system table mapping IATA codes to IANA zones such as `Asia/Seoul` and `Asia/Bangkok`.
- Never calculate flight duration by directly subtracting displayed local clock times or by storing fixed UTC offsets.
- The calculation layer converts local scheduled timestamps through date-specific IANA timezone rules, so timezone differences and DST are handled correctly.
- Each segment duration is arrival instant − departure instant.
- Each layover is next segment departure instant − prior segment arrival instant.
- Total journey time is final segment arrival instant − first segment departure instant.
- If an airport has no timezone mapping, fail visibly rather than guess.
- If a local time falls in a nonexistent or ambiguous DST transition hour, fail visibly for manual review rather than silently choose an offset.
- Every linked trip must have consecutive Leg numbers `1, 2, 3...` and each leg's `From` airport must equal the previous leg's `To` airport.

Supported removal workflow with the installed flight-hardening backend: **clear the editable B:N cells for the leg rather than structurally deleting the Sheet row.** The system cells are then cleared automatically; a surviving itinerary is revalidated/rebuilt, and clearing the final leg removes the generated `EVENTS` Flight projection. Do not use row deletion as the normal flight-removal workflow.

`AIRPORT_TZ` is hidden because it is system metadata, not normal trip-entry data. Add an airport mapping only when a new IATA code is needed.

Repo modules:
- `apps-script-flight-legs.gs` — timezone resolution, segment/layover/total duration and projection rebuilds.
- `apps-script-flight-hardening.gs` — linked-trip sequence/connection validation and safe clear/removal lifecycle.

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
- Converting an existing Calendar event to category `To Do` preserves the original Event ID as the Plan item ID.
- The conversion is sequenced: create the durable Plan record first, then remove the Event. If Event deletion fails, the app attempts to archive/roll back the newly created Plan record so the original Event remains the sole active record.
- Preserving the ID on conversion is the standing identity rule so the same logical record remains traceable across `EVENTS` → `PLAN_ITEMS`.

Plan-to-Appointment behavior:
- This is an explicit conversion, not ongoing two-way synchronization.
- From Plan Edit, `Convert to Appointment` requires a date and time.
- Conversion preserves the same record ID.
- The active record is created in `EVENTS` as category `Appointment` with status `Booked`.
- The corresponding `PLAN_ITEMS` record is archived so there is only one active record after conversion.
- If the To Do text begins with a recognizable time followed by `·`, the conversion can reuse that time and remove the time prefix from the Appointment title.
- The conversion attempts to roll back the new Event if archiving the Plan item fails, to avoid duplicate active records.

Plan maintains local dirty/tombstone state and retries pending writes during later Sheet reconciliation.

### Notes
Notes are stored in `NOTES`.

Schema:
`ID | Title | Category | Body | Pinned | Sort Order | Updated At | Archived`

Notes may contain either plain text or structured JSON used by the richer Notes renderer. Technical fields may remain hidden in the Sheet UI.

Notes keep local drafts so editing remains usable during a temporary backend/network failure. Unsynced note creates/edits/deletes are retried on later app/tab resumes. The installed backend supports durable manual note ordering through `NOTES.Sort Order`; local order remains a temporary fallback/cache rather than the source of truth.

### Shopping
`SHOPPING_LIST` is the durable shopping source.

Schema:
`Store | Category | Product | Thai product name | Purpose / note | Approx. price (THB; USD) | Source | Bought`

Rules:
- The app reads the structured list and groups items for display.
- `Bought` is the normal app-editable field today.
- Item detail creation/editing remains Sheet/admin-driven until a dedicated app editor exists.
- Product name is the current stable lookup key; duplicate Product values are rejected by the backend write helpers.
- Backend create logic reuses the first blank Product row and does not assume `getLastRow()+1` is writable, because checkbox/default cells can make the Sheet's apparent last row equal its grid limit.

### Location / country-day data
- `LOCATIONS`: date ranges, country, city, label, notes.
- `COUNTRIES`: country-day rules and limits.
- `DAY_OVERRIDES`: explicit day-count overrides when needed.

Country Days calculates the configured `Calendar Year Limit`. When `Rolling 12 Limit` is numeric, the app also calculates the maximum count in any inclusive 365-day window from the live `LOCATIONS` + `DAY_OVERRIDES` data and displays it as the rolling-12-month peak. Free-form `Rule Notes` are displayed as constraints but are **not automatically machine-enforced unless separately implemented**.

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
- `FLIGHT_LEGS`: prior-year flight-leg rows may be removed after the corresponding `EVENTS` history is safely archived.
- `PLAN_ITEMS`: prior-year Plan rows, including completed and archived/deleted rows, may be removed from live after verification.
- `LOCATIONS`: prior-year location history may be removed only when it no longer affects active calculations. **If any enabled country uses a rolling-12 rule, retain all location history needed for the current rolling window.**
- `DAY_OVERRIDES`: prior-year overrides may be removed only when they no longer affect active calculations; retain overrides needed for any current rolling-12 window.
- `NOTES`: do **not** blindly archive by age. Keep evergreen/reference notes live. Move only notes that are genuinely obsolete or intentionally archived.
- `SHOPPING_LIST`: keep current operational shopping items live; archive/remove obsolete lists deliberately rather than by calendar year alone.
- `COUNTRIES`: keep current rule rows live unless explicitly superseded.
- `AIRPORT_TZ`: keep current airport timezone mappings live; it is reference metadata rather than trip history.

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
- `SHOPPING_LIST`: load the current operational list; cache it locally for fast reopen.
- Country-day loading must retain enough location/override history to calculate any configured rolling-12 rule correctly.
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
- `lexiTravelNoteDraftsV1` — unsynced/local Note drafts/tombstones.
- `lexiTravelNoteOrderV1` — local Notes ordering fallback/migration source.
- `lexiTravelShoppingCacheV1` — Shopping cache.
- `lexiTravelCountryRulesCacheV1` — Country-rules cache.
- `lexiTravelTheme` — Light/Dark theme preference.

Clearing browser/site data can remove these local values. The Google Sheet remains the durable backend for synced content.

Never treat localStorage as the only permanent source of user data. Calendar and Notes retain pending local changes and retry them when the app resumes; successful synchronization must converge back to the Sheet source of truth.

## 7. Apps Script backend structure

The Apps Script project is bound to the Lexi Travel data workbook.

Canonical repo-side split:
- `Code.gs` — GET/data read handling and shared helpers. The installed source was captured/reviewed on 2026-10-14 and is tracked as `apps-script-code.gs`; no functional change to `Code.gs` was required for this hardening release.
- `NotesSync.gs` — **one consolidated POST router** plus Notes and Shopping write helpers. Repo source: `apps-script-write-router-v2.gs`.
- `CalendarSync.gs` — event write helpers. Repo source: `apps-script-calendar-sync.gs`.
- `PlanSync.gs` — Plan write/list/delete helpers. Repo source: `apps-script-plan-sync.gs`.
- `FlightLegs.gs` — structured flight timezone, segment, layover, total-duration and projection calculations. Repo source: `apps-script-flight-legs.gs`.
- `FlightHardening.gs` — linked-trip validation and safe clear/removal lifecycle. Repo source: `apps-script-flight-hardening.gs`.

There must be only one installed `doPost(e)` implementation. The obsolete standalone Notes-only router was removed from the repository on 2026-10-14; do not reinstall it.

The installed consolidated `onEdit(e)` calls `flightHardeningOnEdit_(e)` immediately before `flightLegsOnEdit_(e)`, then routes normal `EVENTS`, `PLAN_ITEMS`, and `NOTES` edit handling.

After installing or materially changing the flight modules, `rebuildAllFlightCalculations()` may be run manually to validate/rebuild all current outputs. The trailing-underscore implementation helper remains private to Apps Script.

**Installed production state (2026-10-14):** backend hardening is live on a new version of the existing Web App deployment, preserving the production URL. The bound project contains the consolidated router, FlightHardening, the existing flight calculation module, CalendarSync, PlanSync, and unchanged reviewed Code.gs. A full `rebuildAllFlightCalculations()` completed successfully; FLIGHT_LEGS and generated EVENTS flight outputs were re-read afterward and remained consistent. The owner then confirmed Calendar, Plan/Country Days, Notes and Shopping load in the live app.

The installed POST router supports Notes, Events, Plan, Shopping, durable Notes ordering, and the existing capability checks. Future backend updates must continue to use a **new version of the existing Web App deployment**, preserving the existing URL.

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
- Do not archive data still required by rolling-12 or other active calculations.

## 13. Key design decisions that should not be reversed casually

- To Do is a Plan record, not an Event record.
- A dated To Do appears in both Plan and Calendar without duplication.
- Undated To Dos remain Plan-only.
- Event → To Do conversion preserves the original Event ID in `PLAN_ITEMS` and uses sequenced writes with rollback protection.
- To Do → Appointment is an explicit type conversion, not continuous reverse sync.
- To Do → Appointment preserves the same ID, creates one active `EVENTS` record, and archives the Plan record.
- Holiday/Event are separate Calendar visual concepts; birthdays and similar untimed occasions use Event.
- Country Days lives under Plan; numeric rolling-12 limits are calculated, while free-form rule notes remain informational unless explicitly implemented.
- Notes are for reference material, not a substitute for Calendar or Plan.
- Shopping uses `SHOPPING_LIST` as the durable source; do not create a second independently editable shopping database.
- Flight operational schedule and metadata are stored structurally in `FLIGHT_LEGS`; do not move new flight data back into free-form `EVENTS.Details`.
- Flight durations must use date-specific IANA airport timezones; do not calculate them from displayed clock times alone or fixed UTC offsets.
- Flight `EVENTS` rows are generated projections, not manual flight-entry rows.
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
- Does this change preserve existing synced Notes/Calendar/Plan/Shopping behavior?
- If country-day rules changed, is enough history retained for rolling calculations?
- Has cache propagation been considered before concluding a code change failed?
- Has the final behavior been tested on the physical iPhone when it affects mobile UI?

## 15. Current follow-up architecture work

These are recognized improvements, not permission to change unrelated behavior:

- Convert Calendar data loading from whole-table reads to month-filtered reads.
- Convert Notes loading to lightweight index + on-demand body fetch.
- Add a deliberate annual archive workflow, and eventually automate it.
- Continue validating Calendar ↔ Plan To Do routing so both views stay consistent.
- If flight entry is later moved into the app, build a dedicated structured Flight editor that writes `FLIGHT_LEGS`; do not re-enable Flight in the generic Calendar event editor.

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