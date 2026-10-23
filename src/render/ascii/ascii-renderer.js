// ASCII rendering of tile types only (no items, creatures or actuators).
// `renderLevelAscii` is a pure function usable from Node (tools/render-ascii.mjs)
// and from the browser; `createAsciiRenderer` wraps it into the renderer contract.

import { assertRenderer } from '../renderer.js';

export const ASCII_SYMBOLS = {
  outside: ' ',
  wall: '#',
  floor: '.',
  pit: 'O',
  stairsUp: '<',
  stairsDown: '>',
  door: '+',
  teleporter: '*',
  fakewall: '%',
};

function symbolOf(tile) {
  if (!tile) return ASCII_SYMBOLS.outside;
  if (tile.type === 'stairs') return tile.detail.direction === 'up' ? ASCII_SYMBOLS.stairsUp : ASCII_SYMBOLS.stairsDown;
  return ASCII_SYMBOLS[tile.type];
}

/**
 * @param {import('../../core/dungeon.js').Dungeon} dungeon
 * @param {number} levelIndex
 * @param {object} [options]
 * @param {'global'|'local'} [options.frame='global'] global: common frame of all levels, so levels line up
 * @param {boolean} [options.wide=false] two characters per tile, for roughly square cells
 * @param {boolean} [options.rulers=false] column/row numbers (global or local coordinates)
 * @returns {string}
 */
export function renderLevelAscii(dungeon, levelIndex, { frame = 'global', wide = false, rulers = false } = {}) {
  const map = dungeon.level(levelIndex);
  const area =
    frame === 'global'
      ? dungeon.bounds
      : { minX: 0, minY: 0, maxX: map.width, maxY: map.height };
  const toLocal = frame === 'global' ? (gx, gy) => [gx - map.offset.x, gy - map.offset.y] : (x, y) => [x, y];

  const cell = (s) => (wide ? (s === ASCII_SYMBOLS.wall || s === ASCII_SYMBOLS.fakewall ? s + s : s + ' ') : s);
  const lines = [];
  for (let gy = area.minY; gy < area.maxY; gy++) {
    let line = '';
    for (let gx = area.minX; gx < area.maxX; gx++) {
      const [x, y] = toLocal(gx, gy);
      line += cell(symbolOf(dungeon.tileAt(levelIndex, x, y)));
    }
    lines.push(rulers ? `${String(gy).padStart(2)} ${line}` : line);
  }
  if (rulers) lines.unshift(...columnRulers(area.minX, area.maxX, wide));
  return lines.map((l) => l.trimEnd()).join('\n');
}

function columnRulers(minX, maxX, wide) {
  let tens = '   ';
  let units = '   ';
  for (let x = minX; x < maxX; x++) {
    const pad = wide ? ' ' : '';
    tens += (x % 10 === 0 ? String(Math.floor(x / 10)) : ' ') + pad;
    units += String(x % 10) + pad;
  }
  return [tens, units];
}

export function legendAscii() {
  return [
    `${ASCII_SYMBOLS.wall} wall`,
    `${ASCII_SYMBOLS.floor} floor`,
    `${ASCII_SYMBOLS.pit} pit`,
    `${ASCII_SYMBOLS.stairsUp} stairs up`,
    `${ASCII_SYMBOLS.stairsDown} stairs down`,
    `${ASCII_SYMBOLS.door} door`,
    `${ASCII_SYMBOLS.teleporter} teleporter`,
    `${ASCII_SYMBOLS.fakewall} fake wall`,
  ].join('   ');
}

/** Browser renderer: a <pre> inside `container`. */
export function createAsciiRenderer(container, dungeon, options = {}) {
  const pre = document.createElement('pre');
  pre.className = 'ascii-view';
  container.append(pre);

  return assertRenderer({
    currentLevel: 0,
    showLevel(index) {
      this.currentLevel = index;
      pre.textContent = renderLevelAscii(dungeon, index, options);
    },
    dispose() {
      pre.remove();
    },
  });
}
