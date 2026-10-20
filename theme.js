(() => {
  const STORAGE_KEY = 'lexiTravelTheme';
  const DARK_THEME_COLOR = '#12151b';
  const LIGHT_THEME_COLOR = '#ffffff';

  function readTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch (error) {
      return 'light';
    }
  }

  function writeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      // Theme still applies for this page even if storage is unavailable.
    }
  }

  function updateControls(theme) {
    document.querySelectorAll('[data-theme-option]').forEach(button => {
      const selected = button.dataset.themeOption === theme;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function applyTheme(theme, persist = false) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', nextTheme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
    }

    updateControls(nextTheme);
    if (persist) writeTheme(nextTheme);
  }

  applyTheme(readTheme());

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(readTheme());

    document.querySelectorAll('[data-theme-option]').forEach(button => {
      button.addEventListener('click', () => {
        applyTheme(button.dataset.themeOption, true);
      });
    });
  });
})();
