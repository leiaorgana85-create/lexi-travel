// LEXI Travel consolidated write router.
// Use this as the complete NotesSync.gs file in the bound Apps Script project.
// It expects CalendarSync.gs (event helpers), PlanSync.gs (plan helpers),
// FlightLegs.gs (structured flight calculations), FlightHardening.gs
// (linked-trip validation / safe row clearing), and VisitList.gs (Visit helpers)
// to exist in the same project.

function doPost(e) {
  try {
    const savedKey = PropertiesService
      .getScriptProperties()
