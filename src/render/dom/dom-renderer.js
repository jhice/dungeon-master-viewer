// 2D top-down renderer: one <div> per tile in a CSS grid, styled by styles/tiles-2d.css.
// Renders tile types (plus the stairs direction and the passage axis of
// doors/stairs, needed to draw them) and, optionally, the states of doors, pits
// and fake walls. Cells are created once per frame size and only their classes
// change between levels; states are toggled by one class on the grid.
// Items and creatures are small absolutely positioned markers inside the cells,
// rebuilt for the tiles that have contents; layers are toggled by grid classes.

import { assertRenderer } from '../renderer.js';
import { bindShiftWheel } from '../shift-wheel.js';
import { stateModifiers } from '../../core/tile-states.js';
import { tileContents, subcellOffset, FACES } from '../../core/contents.js';
import { actuatorFamily } from '../../core/logic.js';
import { CATEGORY_COLORS, FAMILY_COLORS, TEXT_COLORS, creatureColor, linkColor } from '../palette.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {HTMLElement} container
 * @param {import('../../core/dungeon.js').Dungeon} dungeon
 * @param {object} [options]
 * @param {'global'|'local'} [options.frame='global']
 * @param {boolean} [options.showStates=true] draw door/pit/fake wall states
 * @param {{ items?: boolean, creatures?: boolean, mechanisms?: boolean }} [options.layers] layers shown (default: all)
 * @param {(info: object|null) => void} [options.onHover] hovered tile, or null when leaving the grid
 * @param {(info: object) => void} [options.onSelect] a tile was clicked
 * @param {(to: {level,x,y}) => void} [options.onFollow] a cross-level link label was clicked
 * @param {(delta: number) => void} [options.onStepLevel] Shift + wheel: +1 = level below, -1 = level above
 * @param {(level, x, y) => object} [options.tileAt] tile source (default: the dungeon; main.js passes the simulation state)
 * @param {(level, x, y) => object|null} [options.contentsAt] contents of a tile (default: dungeon.json)
 */
export function createDomRenderer(
  container,
  dungeon,
  { frame = 'global', showStates = true, layers = {}, onHover, onSelect, onFollow, onStepLevel, tileAt = (l, x, y) => dungeon.tileAt(l, x, y), contentsAt = (l, x, y) => tileContents(dungeon, l, x, y) } = {},
) {
  const grid = document.createElement('div');
  grid.className = 'dom-view';
  grid.classList.toggle('show-states', showStates);
  container.append(grid);

  // Links overlay, in tile units (viewBox = frame size), so it scales with --cell.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('links-overlay');
  svg.setAttribute('preserveAspectRatio', 'none');
  let drawnLinks = [];
  let selected = null;

  let cells = [];
  let area = null;
  let markedCells = []; // cells holding content markers, emptied on level change
  let highlighted = null;

  // Party of the simulation: an arrow in its cell, when it is on the shown level.
  const partyMark = document.createElement('span');
  partyMark.className = 'party-mark';
  let party = null;
  function placeParty({ scroll = false } = {}) {
    const cell = party && party.level === area?.level ? cells[cellIndexOf(party.x, party.y)] : null;
    if (!cell) return partyMark.remove();
    partyMark.style.setProperty('--facing', `${'NESW'.indexOf(party.facing) * 90}deg`);
    if (partyMark.parentNode !== cell) cell.append(partyMark);
    if (scroll) cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function setLayers({ items = true, creatures = true, mechanisms = true, texts = true }) {
    grid.classList.toggle('hide-texts', !texts);
    grid.classList.toggle('hide-items', !items);
    grid.classList.toggle('hide-creatures', !creatures);
    grid.classList.toggle('hide-mechanisms', !mechanisms);
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
    // Every tile of the level: items may have been dropped anywhere (simulation).
    const map = dungeon.level(level);
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) drawCell(level, x, y);
  }

  // Markers of one tile (mechanisms, texts, items, creatures); the party marker is kept.
  function drawCell(level, x, y) {
    const cell = cells[cellIndexOf(x, y)];
    if (!cell) return;
    const tile = dungeon.tileAt(level, x, y);
    const detail = tile.detail ?? { type: tile.type };
    const onWall = detail.type === 'wall';
    const contents = contentsAt(level, x, y);
    const markers = [
      ...mechanismMarkers(dungeon, detail, onWall),
      ...textMarkers(dungeon, detail, onWall),
      ...(contents ? contentMarkers(contents, onWall) : []),
    ];
    const hadParty = partyMark.parentNode === cell;
    cell.replaceChildren(...markers);
    if (hadParty) cell.append(partyMark);
    if (markers.length && !markedCells.includes(cell)) markedCells.push(cell);
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
    grid.replaceChildren(...cells, svg);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  // Draws the given links that touch the shown level. Links to another level end
  // in a clickable label ("→ N5 (12, 3)"), links from another level start with one.
  function drawLinks() {
    svg.replaceChildren(arrowDefs());
    const center = ({ x, y }) => [x - area.x0 + 0.5, y - area.y0 + 0.5];
    for (const link of drawnLinks) {
      const color = linkColor(link);
      const fromHere = link.from.level === area.level;
      const toHere = link.to.level === area.level;
      if (!fromHere && !toHere) continue;
      if (fromHere && toHere) {
        const [x1, y1] = center(link.from);
        const [x2, y2] = center(link.to);
        if (x1 === x2 && y1 === y2) continue;
        svg.append(line(x1, y1, x2, y2, color, link));
        continue;
      }
      // Cross-level: a short arrow and a label at the tile of this level.
      const here = fromHere ? link.from : link.to;
      const other = fromHere ? link.to : link.from;
      const [x, y] = center(here);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', x + 0.55);
      label.setAttribute('y', y - 0.35);
      label.setAttribute('fill', color);
      label.classList.add('link-label');
      label.textContent = `${fromHere ? '→' : '←'} N${other.level} (${other.x}, ${other.y})`;
      label.addEventListener('click', (event) => {
        event.stopPropagation();
        onFollow?.(other);
      });
      svg.append(line(x, y, x + 0.5, y - 0.5, color, link), label);
    }
  }

  function line(x1, y1, x2, y2, color, link) {
    const el = document.createElementNS(SVG_NS, 'line');
    Object.entries({ x1, y1, x2, y2, stroke: color }).forEach(([k, v]) => el.setAttribute(k, v));
    el.setAttribute('marker-end', `url(#arrow-${color.slice(1)})`);
    el.classList.add('link-line', link.kind === 'teleporter' ? 'is-teleporter' : 'is-actuator');
    if (link.delay) el.classList.add('is-delayed');
    return el;
  }

  // One arrow marker per colour used.
  function arrowDefs() {
    const defs = document.createElementNS(SVG_NS, 'defs');
    for (const color of new Set(drawnLinks.map(linkColor))) {
      const marker = document.createElementNS(SVG_NS, 'marker');
      Object.entries({ id: `arrow-${color.slice(1)}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 4, markerHeight: 4, orient: 'auto' }).forEach(
        ([k, v]) => marker.setAttribute(k, v),
      );
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M0,0 L10,5 L0,10 z');
      path.setAttribute('fill', color);
      marker.append(path);
      defs.append(marker);
    }
    return defs;
  }

  function setSelection(tile) {
    selected?.classList.remove('is-selected');
    selected = tile && tile.level === area?.level ? (cells[cellIndexOf(tile.x, tile.y)] ?? null) : null;
    selected?.classList.add('is-selected');
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

  // Tile under an event target (which may be a marker inside the cell).
  function infoOf(target) {
    const i = target.closest?.('[data-i]')?.dataset.i;
    if (i === undefined) return undefined;
    const { x, y } = localOf(Number(i));
    const tile = tileAt(area.level, x, y);
    return tile && { level: area.level, x, y, gx: x + area.map.offset.x, gy: y + area.map.offset.y, type: tile.type, detail: tile.detail };
  }
  function onPointer(event) {
    const info = infoOf(event.target);
    if (info !== undefined) onHover?.(info);
  }
  function onClick(event) {
    const info = infoOf(event.target);
    if (info) onSelect?.(info);
  }
  const onLeave = () => onHover?.(null);
  grid.addEventListener('pointerover', onPointer);
  grid.addEventListener('pointerleave', onLeave);
  grid.addEventListener('click', onClick);
  // On the whole view (not only the grid), so it also works beside a small level.
  const unbindShiftWheel = bindShiftWheel(container, onStepLevel);

  return assertRenderer({
    currentLevel: 0,
    showLevel(level) {
      this.currentLevel = level;
      area = areaOf(level);
      ensureCells(area.width, area.height);
      grid.dataset.level = level;
      cells.forEach((cell, i) => {
        const { x, y } = localOf(i);
        cell.className = tileClasses(tileAt(level, x, y));
      });
      highlighted = null;
      selected = null;
      drawContents(level);
      drawLinks();
      placeParty();
    },
    /** The state or the items of a tile changed (simulation): redraw it if its level is shown. */
    updateTile(level, x, y) {
      const cell = level === area?.level ? cells[cellIndexOf(x, y)] : null;
      if (!cell) return;
      const kept = ['is-selected', 'is-highlighted'].filter((c) => cell.classList.contains(c));
      cell.className = tileClasses(tileAt(level, x, y));
      cell.classList.add(...kept);
      drawCell(level, x, y);
    },
    /** Party of the simulation ({ level, x, y, facing }), or null to hide it. */
    setParty(next) {
      party = next;
      placeParty({ scroll: true });
    },
    /** Links to draw (see src/core/logic.js), and the selected tile ({level,x,y} or null). */
    showLinks(links, selection = null) {
      drawnLinks = links;
      drawLinks();
      setSelection(selection);
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
      grid.removeEventListener('click', onClick);
      unbindShiftWheel();
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
 * - creatures: one disc per member, in its sub-tile (or centred if alone, same size),
 *   with a point towards the facing of the group.
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
      disc.style.setProperty('--facing', `${FACES.indexOf(creature.facing) * 90}deg`);
      if (creature.possessions.length) disc.classList.add('has-contents');
      markers.push(disc);
    }
  }
  return markers;
}

/**
 * Markers of a tile's mechanisms (actuators), by family:
 * floor triggers = coloured inner frame; wall triggers and shooters = dot on
 * their face; logic and generators = a centred glyph. Inactive ones are skipped.
 */
function mechanismMarkers(dungeon, detail, onWall) {
  const markers = [];
  const seen = new Set();
  for (const ref of detail.items ?? []) {
    if (ref.kind !== 'actuator') continue;
    const family = actuatorFamily(dungeon.data.actuators[ref.index]);
    if (family === 'inactive' || family === 'portrait') continue;
    const key = family === 'wallTrigger' || family === 'shooter' ? `${family}:${ref.position}` : family;
    if (seen.has(key)) continue;
    seen.add(key);
    const mark = document.createElement('span');
    mark.className = `mark mech-mark mech-${family}`;
    if ((family === 'wallTrigger' || family === 'shooter') && onWall) mark.classList.add(`face-${FACES[ref.position]}`);
    mark.style.setProperty('--c', FAMILY_COLORS[family]);
    markers.push(mark);
  }
  return markers;
}

/**
 * Markers of the texts placed on a tile: a "≡" against the wall face for
 * inscriptions (faded and dashed for invisible messages), centred on floors.
 * Champion sheets are not marked (their mirror already is, on the wall).
 */
function textMarkers(dungeon, detail, onWall) {
  const markers = [];
  for (const ref of detail.items ?? []) {
    if (ref.kind !== 'text') continue;
    const text = dungeon.data.texts[ref.index];
    if (/\n[MF]\n[A-P]{12}\n/.test(text.text)) continue; // champion sheet
    const kind = text.visible ? 'inscription' : 'message';
    const mark = document.createElement('span');
    mark.className = `mark text-mark is-${kind}${onWall ? ` face-${FACES[ref.position]}` : ''}`;
    mark.style.setProperty('--c', TEXT_COLORS[kind]);
    markers.push(mark);
  }
  return markers;
}
