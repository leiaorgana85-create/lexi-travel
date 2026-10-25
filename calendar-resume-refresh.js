(() => {
  const calendarView = document.getElementById('calendarView');
  const paneDetails = document.getElementById('paneDayDetails');
  const tabs = [...document.querySelectorAll('.tab')];

  if (!calendarView || !paneDetails) return;

  let refreshPromise = null;
  let lastRefreshAt = 0;
  let buildCheckPromise = null;
  let lastBuildCheckAt = 0;

  function editorOpen() {
    return Boolean(paneDetails.querySelector('.calendar-event-editor'));
  }

  function unsavedEditorOpen() {
    return Boolean(
      document.querySelector('.calendar-event-editor, .lexi-plain-editor, #planAddRow:not([hidden])')
    );
  }

  function calendarVisible() {
    return calendarView.classList.contains('active');
  }

  async function refreshFromGoogle(force = false) {
    if (!localStorage.getItem(KEY_STORAGE)) return;
    if (!calendarVisible() || editorOpen()) return;
    if (refreshPromise) return;
    if (!force && Date.now() - lastRefreshAt < 2000) return;

    lastRefreshAt = Date.now();
    refreshPromise = (async () => {
      try {
        await loadAllData();
      } catch (error) {
        // Keep the cached/local calendar usable if Google is temporarily unavailable.
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  function buildFromHtml(html) {
    const match = String(html || '').match(/<html[^>]*\sdata-build=["']([^"']+)["']/i);
    return match ? match[1] : '';
  }

  async function checkForNewShell(force = false) {
    if (buildCheckPromise) return buildCheckPromise;
    if (!force && Date.now() - lastBuildCheckAt < 15000) return;

    lastBuildCheckAt = Date.now();
    buildCheckPromise = (async () => {
      try {
        const probeUrl = new URL('index.html', window.location.href);
        probeUrl.searchParams.set('lexi_build_probe', String(Date.now()));

        const response = await fetch(probeUrl.toString(), {
          cache: 'no-store',
          credentials: 'same-origin'
        });
        if (!response.ok) return;

        const latestBuild = buildFromHtml(await response.text());
        const runningBuild = document.documentElement.dataset.build || 'legacy';
        if (!latestBuild || latestBuild === runningBuild || unsavedEditorOpen()) return;

        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete('lexi_build_probe');
        nextUrl.searchParams.set('build', latestBuild);
        window.location.replace(nextUrl.toString());
      } catch (error) {
        // A failed version probe should never block the app.
      } finally {
        buildCheckPromise = null;
      }
    })();

    return buildCheckPromise;
  }

  // Returning from Google Sheets (or another app/tab) should pull fresh calendar rows
  // and also reconcile the Home Screen shell with the latest deployed build.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkForNewShell(true);
      refreshFromGoogle(true);
    }
  });

  window.addEventListener('focus', () => {
    checkForNewShell(false);
    refreshFromGoogle(false);
  });

  // A normal launch/reload should check the shell before reconciling Google data.
  window.addEventListener('pageshow', () => {
    setTimeout(() => {
      checkForNewShell(true);
      refreshFromGoogle(true);
    }, 150);
  });

  // If Lexi Travel stays open, continue checking the tiny HTML shell marker.
  // This does not reload Google data and is skipped while the page is hidden.
  window.setInterval(() => {
    if (!document.hidden) checkForNewShell(false);
  }, 15000);

  // Bottom-tab use is another natural opportunity to detect a freshly deployed shell.
  tabs.forEach(tab => {
    tab.addEventListener('click', () => checkForNewShell(false));
  });
})();
