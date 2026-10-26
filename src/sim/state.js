// Mutable state of the dungeon during a game. dungeon.json is never modified:
// the tiles that can change (doors, pits, fake walls, teleporters) get a copy
// of their detail, which the simulation updates.

const MUTABLE_TYPES = new Set(['door', 'pit', 'fakewall', 'teleporter']);

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 * @returns {{ tileAt(level, x, y): object|null, reset(): void }}
 */
export function createState(dungeon) {
  let details = new Map(); // "level:x,y" -> mutable copy of the tile detail

  function reset() {
    details = new Map();
    for (let level = 0; level < dungeon.levelCount; level++) {
      for (const { x, y, detail } of dungeon.detailedTiles(level)) {
        if (MUTABLE_TYPES.has(detail.type)) details.set(`${level}:${x},${y}`, structuredClone(detail));
      }
    }
  }
  reset();

  return {
    /** Same shape as Dungeon.tileAt(): { type, char, detail }, with the current state in `detail`. */
    tileAt(level, x, y) {
      const tile = dungeon.tileAt(level, x, y);
      if (!tile) return null;
      const detail = details.get(`${level}:${x},${y}`);
      return detail ? { ...tile, detail } : tile;
    },
    reset,
  };
}
