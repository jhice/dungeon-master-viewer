// Context menu of the 2D/3D maps (right click on a tile): a short list of commands.
// One menu at a time; it closes on a choice, a click elsewhere, Escape or a scroll.

/**
 * @returns {{ show(x: number, y: number, title: string, items: Array<{ label: string, action(): void, disabled?: boolean }>): void, hide(): void, dispose(): void }}
 */
export function createContextMenu(container = document.body) {
  const element = document.createElement('div');
  element.className = 'context-menu';
  element.setAttribute('role', 'menu');
  element.hidden = true;
  container.append(element);

  const hide = () => {
    element.hidden = true;
  };
  const onDown = (event) => {
    if (!element.hidden && !element.contains(event.target)) hide();
  };
  // Capture: Escape closes the menu before the viewer sees it (it would cancel the selection).
  const onKey = (event) => {
    if (element.hidden || event.key !== 'Escape') return;
    event.stopPropagation();
    hide();
  };
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('wheel', hide, { passive: true });
  window.addEventListener('blur', hide);

  return {
    show(x, y, title, items) {
      const heading = document.createElement('div');
      heading.className = 'context-menu-title';
      heading.textContent = title;
      element.replaceChildren(
        heading,
        ...items.map(({ label, action, disabled }) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.setAttribute('role', 'menuitem');
          button.textContent = label;
          button.disabled = Boolean(disabled);
          button.addEventListener('click', () => {
            hide();
            action();
          });
          return button;
        }),
      );
      element.hidden = false;
      // Keep inside the window: open to the left / above the pointer near the edges.
      const { width, height } = element.getBoundingClientRect();
      const left = x + width > window.innerWidth ? x - width : x;
      const top = y + height > window.innerHeight ? y - height : y;
      element.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`;
    },
    hide,
    dispose() {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', hide);
      window.removeEventListener('blur', hide);
      element.remove();
    },
  };
}
