// Shift + mouse wheel = change level, shared by the 2D and 3D renderers.
// Listens in the capture phase so it runs before other wheel handlers on the
// element (OrbitControls zoom, horizontal scrolling) and stops them. One level
// at most every 200 ms, so that a wheel "flick" does not skip levels.
// With Shift, some systems report the wheel as horizontal: deltaX is used too.

const LOCK_MS = 200;

/**
 * @param {HTMLElement} element
 * @param {(delta: number) => void} onStep +1 = level below (wheel towards you), -1 = level above
 * @returns {() => void} unbind
 */
export function bindShiftWheel(element, onStep) {
  let lockedUntil = 0;
  const onWheel = (event) => {
    if (!event.shiftKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const now = performance.now();
    const delta = event.deltaY || event.deltaX;
    if (now < lockedUntil || !delta) return;
    lockedUntil = now + LOCK_MS;
    onStep?.(delta > 0 ? 1 : -1);
  };
  element.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return () => element.removeEventListener('wheel', onWheel, { capture: true });
}
