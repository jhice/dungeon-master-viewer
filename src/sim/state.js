// Mutable state of the dungeon during a game. dungeon.json is never modified:
// - the tiles that can change (doors, pits, fake walls, teleporters) get a copy
//   of their detail, which the simulation updates;
// - actuators get a runtime record (disabled after a once-only use, counter
//   value, gate bits) and each tile its own order of actuators (rotations);
// - texts get their current visibility (messages shown by a mechanism);
// - items lie on tiles (floor: sub-tile position, wall: face), in the party's
//   inventory, in its hand (the item held by the mouse cursor, apart from the inventory),
//   or in the champion's two hands (docs/024);
// - creature groups have a position, a facing and members (health), one group per tile;
// - items created during the game (what a dead creature leaves, docs/025) are appended
//   to the item pools of the loaded dungeon (in memory only), and removed on reset.

import { ITEM_POOLS } from '../core/contents.js';

const MUTABLE_TYPES = new Set(['door', 'pit', 'fakewall', 'teleporter']);

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 */
export function createState(dungeon) {
  let details; // "level:x,y" -> mutable copy of the tile detail
  let actuators; // index -> { disabled, data, gate }
  let orders; // "level:x,y" -> [{ index, position }] actuators of the tile, in their current order
  let textVisibility; // text index -> visible
  let items; // "level:x,y" -> [{ kind, index, position }] items lying on the tile, bottom first
  let inventory; // [{ kind, index }] items carried by the party
  let hand; // { kind, index } held in hand (mouse cursor), or null
  let hands; // the champion's hands: [left (ready), right (action)], each { kind, index } or null
  let emptiedChests; // container indexes whose contents went into the inventory
  let groups; // id -> { id, type, level, x, y, facing, members: [{ hp, position }], items, nextMove }
  let groupTiles; // "level:x,y" -> group
  let nextGroupId; // ids of generated groups follow those of dungeon.json
  // Sizes of the item pools of dungeon.json: entries past them were created during the game.
  const poolSizes = Object.fromEntries(Object.values(ITEM_POOLS).map((pool) => [pool, dungeon.data[pool].length]));

  function reset() {
    for (const [pool, size] of Object.entries(poolSizes)) dungeon.data[pool].length = size;
    details = new Map();
    actuators = new Map();
    orders = new Map();
    textVisibility = new Map();
    items = new Map();
    inventory = [];
    hand = null;
    hands = [null, null];
    emptiedChests = new Set();
    groups = new Map();
    groupTiles = new Map();
    dungeon.data.creatures.forEach((group, id) => {
      const { map: level, x, y } = group.at;
      addGroup({ id, type: group.type, level, x, y, facing: group.facing, members: structuredClone(group.members), items: [...(group.items ?? [])] });
    });
    nextGroupId = dungeon.data.creatures.length;
    for (let level = 0; level < dungeon.levelCount; level++) {
      for (const { x, y, detail } of dungeon.detailedTiles(level)) {
        if (MUTABLE_TYPES.has(detail.type)) details.set(`${level}:${x},${y}`, structuredClone(detail));
        const refs = (detail.items ?? []).filter((item) => item.kind === 'actuator');
        if (refs.length) orders.set(`${level}:${x},${y}`, refs.map(({ index, position }) => ({ index, position })));
        const lying = (detail.items ?? []).filter((item) => ITEM_POOLS[item.kind]);
        if (lying.length) items.set(`${level}:${x},${y}`, lying.map(({ kind, index, position }) => ({ kind, index, position })));
      }
    }
  }

  function addGroup(group) {
    group.nextMove ??= null; // tick of the next move (src/sim/creatures.js), null = not scheduled
    group.fleeUntil ??= 0; // tick until which it flees (src/sim/creatures.js)
    groups.set(group.id, group);
    groupTiles.set(`${group.level}:${group.x},${group.y}`, group);
    return group;
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
    /** Items lying on a tile: [{ kind, index, position }] (mutable). */
    itemsAt(level, x, y) {
      const key = `${level}:${x},${y}`;
      if (!items.has(key)) items.set(key, []);
      return items.get(key);
    },
    /** Items carried by the party: [{ kind, index }] (mutable). */
    get inventory() {
      return inventory;
    },
    /** Item held in hand ({ kind, index }) or null. */
    get hand() {
      return hand;
    },
    set hand(item) {
      hand = item;
    },
    /** The champion's hands: [left (ready), right (action)] (mutable). */
    get hands() {
      return hands;
    },
    /** Chests already stowed with their contents (Set of container indexes, mutable). */
    get emptiedChests() {
      return emptiedChests;
    },
    /** Creature group standing on a tile (mutable record), or null. */
    groupAt(level, x, y) {
      return groupTiles.get(`${level}:${x},${y}`) ?? null;
    },
    /** Every creature group, on every level. */
    get groups() {
      return groups.values();
    },
    /** Moves a group to a tile (which must be free of groups), with its new facing. */
    moveGroup(group, { level, x, y, facing = group.facing }) {
      groupTiles.delete(`${group.level}:${group.x},${group.y}`);
      Object.assign(group, { level, x, y, facing });
      groupTiles.set(`${level}:${x},${y}`, group);
    },
    /**
     * Creates an item of a category (`kind`) and type, with its name: a new entry of its
     * pool (no place: it is put somewhere by the caller). Returns its { kind, index }.
     */
    createItem(kind, type, name, { cursed = false } = {}) {
      const pool = dungeon.data[ITEM_POOLS[kind]];
      pool.push({ type, name, cursed, broken: false, important: false, created: true, at: null });
      return { kind, index: pool.length - 1 };
    },
    /** Removes a group (killed). */
    removeGroup(group) {
      groups.delete(group.id);
      if (groupTiles.get(`${group.level}:${group.x},${group.y}`) === group) groupTiles.delete(`${group.level}:${group.x},${group.y}`);
    },
    /** Adds a new group (generator): { type, level, x, y, facing, members }; returns it with its id. */
    createGroup(group) {
      return addGroup({ items: [], ...group, id: nextGroupId++ });
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
