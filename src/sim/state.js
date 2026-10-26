// Mutable state of the dungeon during a game. dungeon.json is never modified:
// - the tiles that can change (doors, pits, fake walls, teleporters) get a copy
//   of their detail, which the simulation updates;
// - actuators get a runtime record (disabled after a once-only use, counter
//   value, gate bits) and each tile its own order of actuators (rotations);
// - texts get their current visibility (messages shown by a mechanism).

const MUTABLE_TYPES = new Set(['door', 'pit', 'fakewall', 'teleporter']);

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 */
export function createState(dungeon) {
  let details; // "level:x,y" -> mutable copy of the tile detail
  let actuators; // index -> { disabled, data, gate }
  let orders; // "level:x,y" -> [{ index, position }] actuators of the tile, in their current order
  let textVisibility; // text index -> visible

  function reset() {
    details = new Map();
    actuators = new Map();
    orders = new Map();
    textVisibility = new Map();
    for (let level = 0; level < dungeon.levelCount; level++) {
      for (const { x, y, detail } of dungeon.detailedTiles(level)) {
        if (MUTABLE_TYPES.has(detail.type)) details.set(`${level}:${x},${y}`, structuredClone(detail));
        const refs = (detail.items ?? []).filter((item) => item.kind === 'actuator');
        if (refs.length) orders.set(`${level}:${x},${y}`, refs.map(({ index, position }) => ({ index, position })));
      }
    }
  }
  reset();

  return {
    /** Same shape as Dungeon.tileAt(): { type, char, detail }, with the current state in `detail` (mutable). */
    tileAt(level, x, y) {
      const tile = dungeon.tileAt(level, x, y);
      if (!tile) return null;
      const detail = details.get(`${level}:${x},${y}`);
      return detail ? { ...tile, detail } : tile;
    },
    /** Actuators of a tile in their current order: [{ index, position }] (mutable, see rotations). */
    actuatorsAt(level, x, y) {
      return orders.get(`${level}:${x},${y}`) ?? [];
    },
    /** Runtime record of an actuator: { disabled, data, gate: { current, reference } } (mutable). */
    actuator(index) {
      if (!actuators.has(index)) {
        const a = dungeon.data.actuators[index];
        actuators.set(index, {
          disabled: a.type === 0,
          data: a.data,
          gate: a.gate && { current: [...a.gate.current], reference: a.gate.reference },
        });
      }
      return actuators.get(index);
    },
    textVisible(index) {
      return textVisibility.get(index) ?? dungeon.data.texts[index].visible;
    },
    setTextVisible(index, visible) {
      textVisibility.set(index, visible);
    },
    reset,
  };
}
