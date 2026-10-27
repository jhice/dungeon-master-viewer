// Rules of the dungeon, as pure functions of the state (docs/012-simulation.md § 3).
// Phase A: passage between tiles. Creature groups block the party (docs/021, Q4 revised):
// see step() in party.js; teleport() (key F) ignores them.
// Phase B: what happens on arrival on a tile (stairs, pits, teleporters), chained.
// Phase C1: the same for creatures (creaturePassage(), resolveCreatureArrival()).

import { SIDE_DELTAS, FACINGS } from '../core/dungeon.js';

/**
 * Why a tile cannot be entered, or null if it can.
 * @returns {null|'outside'|'wall'|'fakewall'|'door'}
 */
export function blockReason(state, level, x, y) {
  const tile = state.tileAt(level, x, y);
  if (!tile) return 'outside';
  switch (tile.type) {
    case 'wall':
      return 'wall';
    case 'fakewall':
      // Open (vanished) or imaginary (illusion): passable.
      return tile.detail.open || tile.detail.imaginary ? null : 'fakewall';
    case 'door':
      return tile.detail.open ? null : 'door';
    default:
      // floor, pit, stairs, teleporter: see arrivalEffect().
      return null;
  }
}

export const BLOCK_LABELS = { outside: 'bord de la carte', wall: 'mur', fakewall: 'mur', door: 'porte fermée', creature: 'créature' };

/**
 * Whether a creature of species `info` (src/core/creature-info.js) may step onto a tile
 * by itself: as the party, except that non-material creatures pass through doors, that
 * creatures never take stairs, and that only levitating ones go over an open pit
 * (the others fall only when a pit opens under them). Other groups and the party are
 * checked by the caller.
 */
export function creaturePassage(state, info, level, x, y) {
  const reason = blockReason(state, level, x, y);
  if (reason === 'door' && info.nonMaterial) return true;
  if (reason) return false;
  const tile = state.tileAt(level, x, y);
  if (tile.type === 'stairs') return false;
  if (tile.type === 'pit' && tile.detail.open && !tile.detail.imaginary && !info.levitation) return false;
  return true;
}

// Teleporter scopes that carry the party.
const PARTY_SCOPES = new Set(['all', 'items_party']);
// Teleporter scopes that carry items, creatures.
const ITEM_SCOPES = new Set(['all', 'items', 'items_party']);
const CREATURE_SCOPES = new Set(['all', 'creatures']);
// Longest chain of arrivals (pit -> teleporter -> …) before it is considered a loop.
const MAX_CHAIN = 32;

/**
 * The effect of standing on a tile, or null if the party stays there.
 * @returns {null|{ type: 'stairs'|'fall'|'teleport', party: object, detail?: object }}
 */
export function arrivalEffect(dungeon, state, party) {
  const tile = state.tileAt(party.level, party.x, party.y);
  if (!tile) return null;
  switch (tile.type) {
    case 'stairs':
      return takeStairs(dungeon, state, party, tile.detail);
    case 'pit':
      return fall(dungeon, party, tile.detail);
    case 'teleporter':
      return teleport(dungeon, party, tile.detail);
    default:
      return null;
  }
}

/**
 * Applies arrival effects until the party stays on a tile. A tile already
 * crossed in the chain is not processed again: a teleporter leading to itself
 * (a "spinner", 21 in DM) only turns the party once.
 * @returns {{ party: object, effects: Array<object>, loop: boolean }}
 *   effects in order; loop = the chain came back to an earlier tile (not counting spinners), or was too long
 */
export function resolveArrival(dungeon, state, party) {
  const effects = [];
  const seen = new Set();
  let current = party;
  let previous = null;
  for (let i = 0; i < MAX_CHAIN; i++) {
    const key = `${current.level}:${current.x},${current.y}`;
    if (seen.has(key)) return { party: current, effects, loop: key !== previous };
    seen.add(key);
    previous = key;
    const effect = arrivalEffect(dungeon, state, current);
    if (!effect) return { party: current, effects, loop: false };
    effects.push(effect);
    current = effect.party;
  }
  return { party: current, effects, loop: true };
}

/**
 * Where an item lying on a tile ends up: it falls through open pits and is
 * carried by open teleporters whose scope includes items, in chain (not by stairs).
 * @returns {{ level, x, y }|null} the final tile, or null if the item stays
 */
export function resolveItemArrival(dungeon, state, { level, x, y }) {
  const end = carry(dungeon, state, { level, x, y, facing: 'N' }, ITEM_SCOPES, true);
  const moved = end && (end.level !== level || end.x !== x || end.y !== y);
  return moved ? { level: end.level, x: end.x, y: end.y } : null;
}

/**
 * Where a creature group standing on a tile ends up: it falls through open pits
 * (unless it levitates) and is carried by open teleporters of scope `all` or
 * `creatures`, in chain, turning with them.
 * @returns {{ level, x, y, facing }|null} the final place, or null if the group stays
 */
export function resolveCreatureArrival(dungeon, state, info, place) {
  return carry(dungeon, state, place, CREATURE_SCOPES, !info.levitation);
}

// Chain of falls and teleporters for items and creatures (stairs are for the party only).
function carry(dungeon, state, place, scopes, falls) {
  const seen = new Set();
  let current = place;
  for (let i = 0; i < MAX_CHAIN; i++) {
    const key = `${current.level}:${current.x},${current.y}`;
    if (seen.has(key)) break;
    seen.add(key);
    const tile = state.tileAt(current.level, current.x, current.y);
    const effect =
      tile?.type === 'pit' && falls
        ? fall(dungeon, current, tile.detail)
        : tile?.type === 'teleporter'
          ? teleport(dungeon, current, tile.detail, scopes)
          : null;
    if (!effect) break;
    current = effect.party;
  }
  const moved = current.level !== place.level || current.x !== place.x || current.y !== place.y || current.facing !== place.facing;
  return moved ? current : null;
}

// Stairs: the matching stairs of the adjacent level are at the same global
// coordinates. The party lands beside them, on their access side, facing away.
function takeStairs(dungeon, state, party, detail) {
  const toLevel = party.level + (detail.direction === 'down' ? 1 : -1);
  const from = dungeon.level(party.level);
  const to = dungeon.level(toLevel);
  if (!to) return null;
  const x = party.x + from.offset.x - to.offset.x;
  const y = party.y + from.offset.y - to.offset.y;
  const side = accessSide(state, toLevel, x, y);
  if (!side) return { type: 'stairs', direction: detail.direction, party: { ...party, level: toLevel, x, y } };
  const [dx, dy] = SIDE_DELTAS[side];
  return { type: 'stairs', direction: detail.direction, party: { level: toLevel, x: x + dx, y: y + dy, facing: side } };
}

// Access side of a staircase in the current state: the passable neighbour on its
// axis (a fake wall counts when it is open or imaginary, unlike Dungeon.accessSide()).
function accessSide(state, level, x, y) {
  const tile = state.tileAt(level, x, y);
  if (tile?.type !== 'stairs') return null;
  const sides = tile.detail.orientation === 'WE' ? ['W', 'E'] : ['N', 'S'];
  return sides.find((side) => {
    const [dx, dy] = SIDE_DELTAS[side];
    const neighbour = state.tileAt(level, x + dx, y + dy);
    return neighbour?.type !== 'stairs' && !blockReason(state, level, x + dx, y + dy);
  }) ?? null;
}

// Open pit, even invisible (imaginary ones are harmless): fall to the level below,
// same global coordinates.
function fall(dungeon, party, detail) {
  if (!detail.open || detail.imaginary) return null;
  const from = dungeon.level(party.level);
  const to = dungeon.level(party.level + 1);
  if (!to) return null;
  const x = party.x + from.offset.x - to.offset.x;
  const y = party.y + from.offset.y - to.offset.y;
  if (!dungeon.tileAt(party.level + 1, x, y)) return null;
  return { type: 'fall', party: { ...party, level: party.level + 1, x, y } };
}

// Open teleporter whose scope includes the party (or the items): to its destination,
// with a relative rotation (quarter turns clockwise) or an absolute facing.
function teleport(dungeon, party, detail, scopes = PARTY_SCOPES) {
  if (!detail.open) return null;
  const ref = detail.items?.find((item) => item.kind === 'teleporter');
  const teleporter = ref && dungeon.data.teleporters[ref.index];
  if (!teleporter || !scopes.has(teleporter.scope)) return null;
  const { map, x, y } = teleporter.dest;
  if (!dungeon.tileAt(map, x, y)) return null;
  const quarters = teleporter.rotation / 90;
  const facing =
    teleporter.rotationType === 'absolute' ? FACINGS[quarters] : FACINGS[(FACINGS.indexOf(party.facing) + quarters) % 4];
  return { type: 'teleport', party: { level: map, x, y, facing }, detail: teleporter };
}
