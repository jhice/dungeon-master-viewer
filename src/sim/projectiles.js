// Projectiles (phase C3, docs/024): an item thrown flies from sub-tile to sub-tile, two
// steps per tile, one step a tick, losing energy at each step. It falls where its
// energy runs out, before a wall or a closed door it hits, or on the tile of the
// creature it hits (which loses health). Written to be reused by the wall shooters and
// the spells of C3b. The numbers of the energy are provisional (docs/024 § 3).
//
// A projectile: { id, item, level, x, y, direction, side: 'left'|'right', row: 'back'|'front',
// energy, stepLoss, kinetic, mass }. `row` is relative to the direction of flight.

import { SIDE_DELTAS, FACINGS } from '../core/dungeon.js';
import { creatureInfo } from '../core/creature-info.js';

/**
 * Absolute sub-tile (0..3 = NW, NE, SE, SW) of a side and a row, for a direction:
 * the front-left sub-tile of a tile has the index of the direction.
 */
export function subTile(direction, side, row) {
  const f = FACINGS.indexOf(direction);
  const offset = row === 'front' ? (side === 'left' ? 0 : 1) : side === 'left' ? 3 : 2;
  return (f + offset) % 4;
}

/**
 * @param {ReturnType<import('./state.js').createState>} state
 * @param {object} hooks
 * @param {(type: string, payload: object) => void} hooks.emit 'projectilesMoved'
 * @param {(projectile, group) => boolean} hooks.hitGroup the projectile reaches a group: true if it hits it
 * @param {(level, x, y, items) => void} hooks.drop the item falls on a tile (logic.itemsDropped)
 */
export function createProjectiles(state, { emit, hitGroup, drop }) {
  let flying; // id -> projectile
  let nextId;

  function reset() {
    flying = new Map();
    nextId = 0;
  }
  reset();

  // Whether a projectile may enter a tile: walls, closed doors, closed fake walls (an
  // imaginary one lets it through) and stairs stop it.
  function passes(level, x, y) {
    const tile = state.tileAt(level, x, y);
    if (!tile) return false;
    switch (tile.type) {
      case 'wall':
      case 'stairs':
        return false;
      case 'door':
        return tile.detail.open;
      case 'fakewall':
        return tile.detail.open || tile.detail.imaginary;
      default:
        return true;
    }
  }

  // The projectile falls where it is: its item lies on its sub-tile.
  function land(p) {
    flying.delete(p.id);
    const position = subTile(p.direction, p.side, p.row);
    drop(p.level, p.x, p.y, [{ kind: p.item.kind, index: p.item.index, position }]);
  }

  // One step: to the front row of its tile, or to the back row of the next tile.
  function advance(p) {
    p.energy -= p.stepLoss;
    if (p.row === 'back') {
      p.row = 'front';
    } else {
      const [dx, dy] = SIDE_DELTAS[p.direction];
      const [nx, ny] = [p.x + dx, p.y + dy];
      if (!passes(p.level, nx, ny)) return land(p); // against the wall: falls before it
      Object.assign(p, { x: nx, y: ny, row: 'back' });
      // A creature: hit (it falls on its tile), unless missed; non-material ones let it through.
      const group = state.groupAt(p.level, nx, ny);
      if (group && !creatureInfo(group.type).nonMaterial && hitGroup(p, group)) return land(p);
    }
    if (p.energy <= 0) land(p);
  }

  return {
    /**
     * Throws an item from a tile, in a direction, from the left or right side, with an
     * energy that decreases by `stepLoss` at each step. The item starts in the front row
     * of the tile. Returns the projectile.
     */
    launch({ item, level, x, y, direction, side, energy, stepLoss, kinetic, mass = 1 }) {
      const p = { id: nextId++, item, level, x, y, direction, side, row: 'front', energy, stepLoss, kinetic, mass };
      flying.set(p.id, p);
      emit('projectilesMoved', { level });
      return p;
    },
    /** One tick: every projectile makes one step. */
    update() {
      if (!flying.size) return;
      const levels = new Set();
      for (const p of [...flying.values()]) {
        advance(p);
        levels.add(p.level);
      }
      for (const level of levels) emit('projectilesMoved', { level });
    },
    /** Projectiles in flight on a level, with their sub-tile: [{ id, item, x, y, position, row }]. */
    on(level) {
      return [...flying.values()]
        .filter((p) => p.level === level)
        .map((p) => ({ id: p.id, item: p.item, x: p.x, y: p.y, position: subTile(p.direction, p.side, p.row), direction: p.direction }));
    },
    reset,
  };
}
