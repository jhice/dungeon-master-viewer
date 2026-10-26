// Floating, draggable window holding the first-person view (answer Q1): it
// stays above the 2D/3D views, which remain visible. Width is resizable
// (the viewport keeps its 4/3 ratio); position and width are reported to the
// caller, which remembers them.
// Below the viewport, a message area (as in DM) prints the messages of the dungeon.

const MIN_WIDTH = 240;
const MESSAGE_LINES = 3; // latest messages kept
const MESSAGE_MS = 12000; // before a message fades out

/**
 * @param {object} options
 * @param {{ left: number, top: number, width: number }} [options.layout] initial position and width, in px
 * @param {(layout: object) => void} [options.onLayoutChange] after a drag or a resize
 * @param {() => void} [options.onClose]
 * @param {() => void} [options.onReset] back to the start position
 * @param {(index: number) => void} [options.onSelectItem] an item of the inventory was clicked (take in hand / release)
 * @returns {{ viewport: HTMLElement, setStatus(text), message(text), setInventory(items), flash(), dispose() }}
 */
export function createGameWindow({ layout, onLayoutChange, onClose, onReset, onSelectItem } = {}) {
  const win = document.createElement('section');
  win.className = 'game-window';
  win.setAttribute('aria-label', 'Simulation');

  const bar = document.createElement('header');
  bar.className = 'game-bar';
  const title = document.createElement('span');
  title.className = 'game-title';
  title.textContent = 'Simulation';
  const status = document.createElement('span');
  status.className = 'game-status';
  bar.append(title, status, button('⟲', 'Revenir au départ', onReset), button('×', 'Fermer (P)', onClose));

  const viewport = document.createElement('div');
  viewport.className = 'game-viewport';
  const messages = document.createElement('div');
  messages.className = 'game-messages';
  messages.setAttribute('aria-live', 'polite');
  // Inventory of the party: one chip per item (click = take in hand; then a click in the view drops it).
  const inventory = document.createElement('div');
  inventory.className = 'game-inventory';
  const chips = document.createElement('div');
  chips.className = 'game-items';
  inventory.append(chips);
  win.append(bar, viewport, messages, inventory);
  document.body.append(win);

  const place = ({ left, top, width }) => {
    win.style.width = `${Math.max(MIN_WIDTH, Math.min(width, window.innerWidth - 16))}px`;
    win.style.left = `${clamp(left, 0, window.innerWidth - win.offsetWidth)}px`;
    win.style.top = `${clamp(top, 0, window.innerHeight - bar.offsetHeight)}px`;
  };
  const current = () => ({ left: win.offsetLeft, top: win.offsetTop, width: win.offsetWidth });
  // Default: top right, left of the side panels (17rem), so the map stays visible.
  const width = 480;
  place({ left: window.innerWidth - width - 300, top: 96, width, ...layout });

  // Drag by the title bar (not by its buttons).
  let drag = null;
  bar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    drag = { dx: event.clientX - win.offsetLeft, dy: event.clientY - win.offsetTop };
    bar.setPointerCapture(event.pointerId);
  });
  bar.addEventListener('pointermove', (event) => {
    if (drag) place({ ...current(), left: event.clientX - drag.dx, top: event.clientY - drag.dy });
  });
  bar.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    onLayoutChange?.(current());
  });

  // CSS `resize: horizontal` on the window: report the new width once it settles.
  let lastWidth = win.offsetWidth;
  let resizeTimer = 0;
  const resizeObserver = new ResizeObserver(() => {
    if (win.offsetWidth === lastWidth) return;
    lastWidth = win.offsetWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => onLayoutChange?.(current()), 300);
  });
  resizeObserver.observe(win);
  const onWindowResize = () => place(current());
  window.addEventListener('resize', onWindowResize);

  return {
    viewport,
    setStatus(text) {
      status.textContent = text;
    },
    /** Prints a message of the dungeon in the message area (it fades out after a while). */
    message(text) {
      const line = document.createElement('p');
      line.textContent = text;
      messages.append(line);
      while (messages.children.length > MESSAGE_LINES) messages.firstChild.remove();
      setTimeout(() => line.classList.add('is-old'), MESSAGE_MS);
    },
    /** Items carried: [{ name, color, inHand }]. */
    setInventory(items) {
      chips.replaceChildren(
        ...items.map((item, i) => {
          const chip = button(item.name, item.inHand ? 'En main : clic dans la vue pour le poser, ici pour le reprendre' : 'Prendre en main', () => onSelectItem?.(i));
          chip.className = `game-item${item.inHand ? ' is-in-hand' : ''}`;
          chip.style.setProperty('--c', item.color);
          return chip;
        }),
      );
      if (!items.length) chips.textContent = 'Inventaire vide — clic sur un objet à portée pour le ramasser';
    },
    /** Short visual feedback (blocked move). */
    flash() {
      win.classList.remove('is-bumped');
      void win.offsetWidth; // restart the animation
      win.classList.add('is-bumped');
    },
    dispose() {
      resizeObserver.disconnect();
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onWindowResize);
      win.remove();
    },
  };
}

function button(text, label, action) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  element.title = label;
  element.addEventListener('click', () => {
    action?.();
    element.blur(); // keep the keyboard for the game
  });
  return element;
}

const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
