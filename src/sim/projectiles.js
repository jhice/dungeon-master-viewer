// Projectiles (phase C3, docs/024): an item thrown flies from sub-tile to sub-tile, two
// steps per tile, one step a tick, losing energy at each step. It falls where its
// energy runs out, before a wall or a closed door it hits, or on the tile of the
// creature it hits (which loses health). Written to be reused by the wall shooters and
// the spells of C3b. The numbers of the energy are provisional (docs/024 § 3).
//
// A projectile: { id, item, level, x, y, direction, side: 'left'|'right', row: 'back'|'front',
// energy, stepLoss, kinetic, mass }. `row` is relative to the direction of flight.
//
// A projectile may carry a spell instead of an item (phase G3, docs/033): { spell: 'fireball' |
// 'openDoor', attack }. It moves as the engine moves it (ReDMCSB F219): its first step is free,
// then before each step it vanishes if its energy is not above the step loss. It enters a
// closed door's tile and meets the door there; against a wall it meets the wall from its own
// tile. What happens then (explosion, door toggled) is up to the simulation (hooks.impact).
//
// A thrown item enters a door's tile too, and meets a closed door as it crosses the middle of the
// tile (ReDMCSB F217, docs/051): it may break it (hooks.impact), then falls in front of the leaf.

import { SIDE_DELTAS, FACINGS } from '../core/dungeon.js';
import { doorPassable } from '../core/tile-states.js';
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
 *   (a spell is also offered to non-material creatures)
 * @param {(level, x, y, items) => void} hooks.drop the item falls on a tile (logic.itemsDropped)
 * @param {(projectile, target: 'door'|'wall') => boolean} hooks.impact a spell or an item meets the door
 *   of its tile, or a spell the wall in front of its tile: true if it stops there
 */
export function createProjectiles(state, { emit, hitGroup, drop, impact }) {
  let flying; // id -> projectile
  let nextId;

  function reset() {
    flying = new Map();
    nextId = 0;
  }
  reset();

  // Whether a projectile may enter a tile: walls, doors closed by more than 1/4, closed fake walls (an
  // imaginary one lets it through) and stairs stop it.
  function passes(level, x, y) {
    const tile = state.tileAt(level, x, y);
    if (!tile) return false;
    switch (tile.type) {
      case 'wall':
      case 'stairs':
        return false;
      case 'door':
        return doorPassable(tile.detail);
      case 'fakewall':
        return tile.detail.open || tile.detail.imaginary;
      default:
        return true;
    }
  }

  // The projectile ends where it is: its item lies on its sub-tile; a spell vanishes.
  function land(p) {
    flying.delete(p.id);
    if (!p.item) return;
    const position = subTile(p.direction, p.side, p.row);
    drop(p.level, p.x, p.y, [{ kind: p.item.kind, index: p.item.index, position }]);
  }

  // A thrown item hits something: metallic for a weapon (ReDMCSB F217).
  function hitSound(p) {
    emit('sound', { id: p.item.kind === 'weapon' ? 'metal' : 'thud', level: p.level, x: p.x, y: p.y });
  }

  // One step: to the front row of its tile, or to the back row of the next tile.
  function advance(p) {
    if (p.spell) {
      if (p.free) p.free = false;
      else {
        if (p.energy <= p.stepLoss) return land(p);
        p.energy -= p.stepLoss;
        p.attack = Math.max(0, p.attack - p.stepLoss);
      }
    } else p.energy -= p.stepLoss;
    if (p.row === 'back') {
      // A projectile crossing a door's tile meets the door (F219 then F217); an item that does not
      // go through falls in front of the leaf, on the row it has reached.
      if (state.tileAt(p.level, p.x, p.y)?.type === 'door' && impact(p, 'door')) {
        if (!p.spell) hitSound(p);
        return land(p);
      }
      p.row = 'front';
    } else {
      const [dx, dy] = SIDE_DELTAS[p.direction];
      const [nx, ny] = [p.x + dx, p.y + dy];
      const door = state.tileAt(p.level, nx, ny)?.type === 'door';
      if (!door && !passes(p.level, nx, ny)) {
        if (p.spell) impact(p, 'wall'); // meets the wall from its tile
        else hitSound(p);
        return land(p); // against the wall: falls before it
      }
      Object.assign(p, { x: nx, y: ny, row: 'back' });
      // A creature: hit (it falls on its tile), unless missed; non-material ones let items through.
      const group = state.groupAt(p.level, nx, ny);
      if (group && (p.spell || !creatureInfo(group.type).nonMaterial) && hitGroup(p, group)) {
        if (!p.spell) hitSound(p);
        return land(p);
      }
    }
    if (!p.spell && p.energy <= 0) land(p);
  }

  return {
    /**
     * Throws an item from a tile, in a direction, from the left or right side, with an
     * energy that decreases by `stepLoss` at each step. The item starts in the front row
     * of the tile. Returns the projectile.
     */
    launch({ item = null, spell = null, attack = 0, level, x, y, direction, side, energy, stepLoss, kinetic = 0, mass = 1 }) {
      const p = { id: nextId++, item, spell, attack, free: Boolean(spell), level, x, y, direction, side, row: 'front', energy, stepLoss, kinetic, mass };
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
    /** Projectiles in flight on a level, with their sub-tile: [{ id, item, spell, energy, x, y, position, direction }]. */
    on(level) {
      return [...flying.values()]
        .filter((p) => p.level === level)
        .map((p) => ({ id: p.id, item: p.item, spell: p.spell, energy: p.energy, x: p.x, y: p.y, position: subTile(p.direction, p.side, p.row), direction: p.direction }));
    },
    reset,
  };
}
