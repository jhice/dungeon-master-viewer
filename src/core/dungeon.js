// Read-only access to dungeon.json, shared by every renderer (ASCII, 2D, 3D).
// Two coordinate systems:
//   local  (x, y)   : inside one map, 0 <= x < width
//   global (gx, gy) : common to all levels, gx = x + map.offset.x
// Stairs and pits connect levels at identical global coordinates.

import { tileTypeOfChar } from './tile-types.js';

// North is towards y - 1 (rows grow southwards).
export const SIDE_DELTAS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
// Facings in clockwise order (index = DM direction code, quarter turns from north).
export const FACINGS = ['N', 'E', 'S', 'W'];

export class Dungeon {
  constructor(data) {
    this.data = data;
    this.levels = [...data.maps].sort((a, b) => a.level - b.level);
    this.bounds = computeBounds(this.levels);
  }

  get levelCount() {
    return this.levels.length;
  }

  get start() {
    return this.data.start;
  }

  level(index) {
    return this.levels[index];
  }

  /** Tile at local coordinates: { type, char, detail } or null outside the map. */
  tileAt(levelIndex, x, y) {
    const map = this.levels[levelIndex];
    if (!map || x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
    const char = map.grid[y][x];
    return { type: tileTypeOfChar(char).id, char, detail: map.tiles[`${x},${y}`] };
  }

  globalTileAt(levelIndex, gx, gy) {
    const map = this.levels[levelIndex];
    return map ? this.tileAt(levelIndex, gx - map.offset.x, gy - map.offset.y) : null;
  }

  /**
   * Side ('N'|'E'|'S'|'W') from which a stairs tile is entered: the walkable
   * neighbour on its passage axis. Null if none (2 stairs in DM).
   */
  accessSide(levelIndex, x, y) {
    const tile = this.tileAt(levelIndex, x, y);
    const sides = tile?.detail?.orientation === 'WE' ? ['W', 'E'] : ['N', 'S'];
    return sides.find((side) => {
      const [dx, dy] = SIDE_DELTAS[side];
      const neighbour = this.tileAt(levelIndex, x + dx, y + dy);
      return neighbour && !tileTypeOfChar(neighbour.char).solid;
    }) ?? null;
  }

  /** Iterates the non-trivial tiles of a level (anything listed in `tiles`), with global coordinates. */
  *detailedTiles(levelIndex) {
    const map = this.levels[levelIndex];
    for (const [xy, detail] of Object.entries(map.tiles)) {
      const [x, y] = xy.split(',').map(Number);
      yield { x, y, gx: x + map.offset.x, gy: y + map.offset.y, detail };
    }
  }
}

/** Global rectangle covering every level: { minX, minY, maxX, maxY } (max exclusive). */
function computeBounds(levels) {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const m of levels) {
    b.minX = Math.min(b.minX, m.offset.x);
    b.minY = Math.min(b.minY, m.offset.y);
    b.maxX = Math.max(b.maxX, m.offset.x + m.width);
    b.maxY = Math.max(b.maxY, m.offset.y + m.height);
  }
  return b;
}

/** Loads dungeon.json in the browser (fetch) and wraps it. */
export async function loadDungeon(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Dungeon(await response.json());
}
