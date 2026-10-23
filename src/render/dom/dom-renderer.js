// 2D top-down renderer: one <div> per tile in a CSS grid, styled by styles/tiles-2d.css.
// Renders tile types only (plus the stairs direction and the passage axis of
// doors/stairs, needed to draw them). Cells are created once per frame size and
// only their classes change between levels.

import { assertRenderer } from '../renderer.js';

/**
 * @param {HTMLElement} container
 * @param {import('../../core/dungeon.js').Dungeon} dungeon
 * @param {object} [options]
 * @param {'global'|'local'} [options.frame='global']
 * @param {(info: object|null) => void} [options.onHover] hovered tile, or null when leaving the grid
 */
export function createDomRenderer(container, dungeon, { frame = 'global', onHover } = {}) {
  const grid = document.createElement('div');
  grid.className = 'dom-view';
  container.append(grid);

  let cells = [];
  let area = null;

  function ensureCells(width, height) {
    if (cells.length === width * height && grid.style.getPropertyValue('--cols') === String(width)) return;
    grid.style.setProperty('--cols', width);
    grid.style.setProperty('--rows', height);
    cells = Array.from({ length: width * height }, (_, i) => {
      const cell = document.createElement('div');
      cell.dataset.i = i;
      return cell;
    });
    grid.replaceChildren(...cells);
  }

  function areaOf(level) {
    const map = dungeon.level(level);
    if (frame === 'global') {
      const b = dungeon.bounds;
      return { level, x0: b.minX - map.offset.x, y0: b.minY - map.offset.y, width: b.maxX - b.minX, height: b.maxY - b.minY, map };
    }
    return { level, x0: 0, y0: 0, width: map.width, height: map.height, map };
  }

  // Cell index -> local coordinates of the level shown.
  const localOf = (i) => ({ x: area.x0 + (i % area.width), y: area.y0 + Math.floor(i / area.width) });

  function onPointer(event) {
    const i = event.target.dataset?.i;
    if (i === undefined) return;
    const { x, y } = localOf(Number(i));
    const tile = dungeon.tileAt(area.level, x, y);
    onHover?.(
      tile && {
        level: area.level,
        x,
        y,
        gx: x + area.map.offset.x,
        gy: y + area.map.offset.y,
        type: tile.type,
        detail: tile.detail,
      },
    );
  }
  const onLeave = () => onHover?.(null);
  grid.addEventListener('pointerover', onPointer);
  grid.addEventListener('pointerleave', onLeave);

  return assertRenderer({
    currentLevel: 0,
    showLevel(level) {
      this.currentLevel = level;
      area = areaOf(level);
      ensureCells(area.width, area.height);
      grid.dataset.level = level;
      cells.forEach((cell, i) => {
        const { x, y } = localOf(i);
        cell.className = tileClasses(dungeon.tileAt(level, x, y));
      });
    },
    dispose() {
      grid.removeEventListener('pointerover', onPointer);
      grid.removeEventListener('pointerleave', onLeave);
      grid.remove();
    },
  });
}

/** CSS classes of a tile: `tile t-<type>` plus direction/axis modifiers. */
export function tileClasses(tile) {
  if (!tile) return 'tile t-outside';
  let classes = `tile t-${tile.type}`;
  if (tile.type === 'stairs') classes += ` ${tile.detail.direction} axis-${tile.detail.orientation.toLowerCase()}`;
  if (tile.type === 'door') classes += ` axis-${tile.detail.orientation.toLowerCase()}`;
  return classes;
}
