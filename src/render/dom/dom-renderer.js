// 2D top-down renderer: one <div> per tile in a CSS grid, styled by styles/tiles-2d.css.
// Renders tile types (plus the stairs direction and the passage axis of
// doors/stairs, needed to draw them) and, optionally, the states of doors, pits
// and fake walls. Cells are created once per frame size and only their classes
// change between levels; states are toggled by one class on the grid.
// Items and creatures are small absolutely positioned markers inside the cells,
// rebuilt for the tiles that have contents; layers are toggled by grid classes.

import { assertRenderer } from '../renderer.js';
import { stateModifiers } from '../../core/tile-states.js';
import { tileContents, subcellOffset, FACES } from '../../core/contents.js';
import { CATEGORY_COLORS, creatureColor } from '../palette.js';

/**
 * @param {HTMLElement} container
 * @param {import('../../core/dungeon.js').Dungeon} dungeon
 * @param {object} [options]
 * @param {'global'|'local'} [options.frame='global']
 * @param {boolean} [options.showStates=true] draw door/pit/fake wall states
 * @param {{ items?: boolean, creatures?: boolean }} [options.layers] contents layers shown (default: both)
 * @param {(info: object|null) => void} [options.onHover] hovered tile, or null when leaving the grid
 */
export function createDomRenderer(container, dungeon, { frame = 'global', showStates = true, layers = {}, onHover } = {}) {
  const grid = document.createElement('div');
  grid.className = 'dom-view';
  grid.classList.toggle('show-states', showStates);
  container.append(grid);

  let cells = [];
  let area = null;
  let markedCells = []; // cells holding content markers, emptied on level change
  let highlighted = null;

  function setLayers({ items = true, creatures = true }) {
    grid.classList.toggle('hide-items', !items);
    grid.classList.toggle('hide-creatures', !creatures);
  }
  setLayers(layers);

  const cellIndexOf = (x, y) => {
    const col = x - area.x0;
    const row = y - area.y0;
    return col < 0 || row < 0 || col >= area.width || row >= area.height ? -1 : row * area.width + col;
  };

  function drawContents(level) {
    for (const cell of markedCells) cell.replaceChildren();
    markedCells = [];
    for (const { x, y } of dungeon.detailedTiles(level)) {
      const contents = tileContents(dungeon, level, x, y);
      const cell = contents && cells[cellIndexOf(x, y)];
      if (!cell) continue;
      cell.append(...contentMarkers(contents, dungeon.tileAt(level, x, y).type === 'wall'));
      markedCells.push(cell);
    }
  }

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
    // The target may be a content marker inside the cell.
    const i = event.target.closest?.('[data-i]')?.dataset.i;
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
      highlighted = null;
      drawContents(level);
    },
    setShowStates(enabled) {
      grid.classList.toggle('show-states', enabled);
    },
    setLayers,
    /** Outlines a tile of the shown level and scrolls it into view. */
    highlightTile(x, y) {
      highlighted?.classList.remove('is-highlighted');
      highlighted = cells[cellIndexOf(x, y)] ?? null;
      highlighted?.classList.add('is-highlighted');
      highlighted?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    },
    dispose() {
      grid.removeEventListener('pointerover', onPointer);
      grid.removeEventListener('pointerleave', onLeave);
      grid.remove();
    },
  });
}

/**
 * CSS classes of a tile: `tile t-<type>`, direction/axis modifiers, and state
 * modifiers (is-open, is-closed, is-invisible, is-imaginary), which only take
 * effect inside a `.show-states` container.
 */
export function tileClasses(tile) {
  if (!tile) return 'tile t-outside';
  let classes = `tile t-${tile.type}`;
  if (tile.type === 'stairs') classes += ` ${tile.detail.direction} axis-${tile.detail.orientation.toLowerCase()}`;
  if (tile.type === 'door') classes += ` axis-${tile.detail.orientation.toLowerCase()}`;
  const modifiers = tile.detail ? stateModifiers(tile.type, tile.detail) : [];
  return modifiers.length ? `${classes} ${modifiers.join(' ')}` : classes;
}

/**
 * Markers of a tile's contents:
 * - floor items: one marker per occupied sub-tile, coloured by the category of
 *   the first item, with a count badge when several items are stacked;
 * - wall items: a marker against the face they lie on;
 * - creatures: one disc per member, in its sub-tile (or centred if alone).
 * Chests with contents and creatures carrying items get a `has-contents` ring.
 */
function contentMarkers(contents, onWall) {
  const markers = [];
  const byPosition = new Map();
  for (const item of contents.items) {
    if (!byPosition.has(item.position)) byPosition.set(item.position, []);
    byPosition.get(item.position).push(item);
  }
  for (const [position, items] of byPosition) {
    const mark = document.createElement('span');
    mark.className = onWall ? `mark item-mark on-wall face-${FACES[position]}` : 'mark item-mark';
    if (!onWall) {
      const [u, v] = subcellOffset(position);
      mark.style.left = `${u * 100}%`;
      mark.style.top = `${v * 100}%`;
    }
    mark.style.setProperty('--c', CATEGORY_COLORS[items[0].category]);
    if (items.length > 1) mark.dataset.count = items.length;
    if (items.some((item) => item.contents?.length)) mark.classList.add('has-contents');
    markers.push(mark);
  }
  const creature = contents.creature;
  if (creature) {
    for (const member of creature.members) {
      const disc = document.createElement('span');
      disc.className = 'mark creature-mark';
      const [u, v] = member.position === null ? [0.5, 0.5] : subcellOffset(member.position);
      disc.style.left = `${u * 100}%`;
      disc.style.top = `${v * 100}%`;
      disc.style.setProperty('--c', creatureColor(creature.type));
      if (member.position === null) disc.classList.add('alone');
      if (creature.possessions.length) disc.classList.add('has-contents');
      markers.push(disc);
    }
  }
  return markers;
}
