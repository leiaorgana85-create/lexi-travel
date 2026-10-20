(() => {
  const MOVE_THRESHOLD = 10;
  const ARM_MS = 700;

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startTab = null;
  let moved = false;
  let armedTab = null;
  let armedUntil = 0;

  function tabFromTarget(target) {
    return target instanceof Element ? target.closest('.tab') : null;
  }

  document.addEventListener('pointerdown', event => {
    if (!event.isPrimary) return;

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startTab = tabFromTarget(event.target);
    moved = false;
    armedTab = null;
    armedUntil = 0;
  }, true);

  document.addEventListener('pointermove', event => {
    if (!event.isPrimary || event.pointerId !== pointerId || moved) return;

    const dx = Math.abs(event.clientX - startX);
    const dy = Math.abs(event.clientY - startY);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) moved = true;
  }, true);

  document.addEventListener('pointerup', event => {
    if (!event.isPrimary || event.pointerId !== pointerId) return;

    const endTarget = document.elementFromPoint(event.clientX, event.clientY);
    const endTab = tabFromTarget(endTarget);

    if (startTab && !moved && endTab === startTab) {
      armedTab = startTab;
      armedUntil = Date.now() + ARM_MS;
    } else {
      armedTab = null;
      armedUntil = 0;
    }

    pointerId = null;
    startTab = null;
    moved = false;
  }, true);

  document.addEventListener('pointercancel', () => {
    pointerId = null;
    startTab = null;
    moved = false;
    armedTab = null;
    armedUntil = 0;
  }, true);

  document.addEventListener('click', event => {
    const tab = tabFromTarget(event.target);
    if (!tab) return;

    // Clicking the already-active tab is harmless and is used by some views to refresh.
    if (tab.classList.contains('active')) return;

    // Keyboard activation remains available for accessibility.
    if (event.isTrusted && event.detail === 0 && document.activeElement === tab) return;

    // An inactive tab may open only after a real pointer gesture that began and ended
    // on that same tab without scrolling. This blocks both background .click() calls
    // and iOS ghost clicks produced while swiping content above the fixed tab bar.
    if (armedTab === tab && Date.now() <= armedUntil) {
      armedTab = null;
      armedUntil = 0;
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
