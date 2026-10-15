(() => {
  const CACHE_STORAGE = 'lexiTravelCalendarCacheV1';
  const DRAFT_STORAGE = 'lexiTravelEventDraftsV1';

  const calendarTab = document.querySelector('.tab[data-view="calendarView"]');
  const calendarGrid = document.getElementById('calendarGrid');
  const calendarStatus = document.getElementById('calendarStatus');
  const dayPane = document.getElementById('dayPane');
  const