(() => {
  const MOVE_THRESHOLD = 10;
  const SUPPRESS_MS = 350;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let moved = false;
  let suppressTabsUntil = 0;

  document.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) {
      tracking = false;
      moved = false;
      return;
    }

    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
    moved = false;
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', event => {
    if (!tracking || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);

    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) moved = true;
  }, { capture: true, passive: true });

  document.addEventListener('touchend', () => {
    if (tracking && moved) suppressTabsUntil = Date.now() + SUPPRESS_MS;
    tracking = false;
    moved = false;
  }, { capture: true, passive: true });

  document.addEventListener('touchcancel', () => {
    tracking = false;
    moved = false;
  }, { capture: true, passive: true });

  document.addEventListener('click', event => {
    if (Date.now() >= suppressTabsUntil) return;

    const tab = event.target instanceof Element ? event.target.closest('.tab') : null;
    if (!tab) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    suppressTabsUntil = 0;
  }, true);
})();
