// Perception of the party by a creature group, and the way to reach it (phase C2, docs/022).
// Pure functions on (dungeon, state): no DOM, no clock.
// - Sight: within `sight` squares, only if the group faces the party, line of sight clear.
// - Smell: within `smell` squares, facing it or not: the group turns to the party.
// - Hearing (DM 3.6): the party stands next to the group, unseen.
// The light is permanent for now (doc 012, Q7): sight ranges are not halved by darkness.

import { SIDE_DELTAS, FACINGS } from '../core/dungeon.js';
import { doorLook } from '../core/ornaments.js';
import { creaturePassage, resolveCreatureArrival } from './rules.js';

// Door types that creatures see through (Encyclopaedia, "Graphics.dat Item 559", door characteristics).
const SEE_THROUGH_DOORS = new Set(['Porticullis', 'Ra']);
// Pursuit: largest number of tiles explored by the path search.
const MAX_SEARCH = 400;

/**
 * Distance between two squares as the engine counts it: the larger offset plus half
 * the smaller one (ReDMCSB as remembered, to be checked, docs/022).
 */
export const squareDistance = (dx, dy) => {
  const [a, b] = [Math.abs(dx), Math.abs(dy)];
  return a > b ? a + (b >> 1) : b + (a >> 1);
};

/** The one or two sides that lead from (x, y) towards (tx, ty): the main axis first. */
export function sidesTowards(x, y, tx, ty) {
  const dx = tx - x;
  const dy = ty - y;
  const horizontal = dx > 0 ? 'E' : dx < 0 ? 'W' : null;
  const vertical = dy > 0 ? 'S' : dy < 0 ? 'N' : null;
  const sides = Math.abs(dx) >= Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal];
  return sides.filter(Boolean);
}

// Whether a tile stops the sight: wall, closed fake wall (an imaginary one looks like a
// wall too), closed door that is not a grate or a Ra door.
function opaque(dungeon, state, level, x, y) {
  const tile = state.tileAt(level, x, y);
  if (!tile) return true;
  switch (tile.type) {
    case 'wall':
      return true;
    case 'fakewall':
      return !tile.detail.open;
    case 'door':
      return !tile.detail.open && !SEE_THROUGH_DOORS.has(doorLook(dungeon, level, x, y)?.type);
    default:
      return false;
  }
}

/** Whether the line between the centres of two squares crosses no opaque tile (ends excluded). */
export function lineOfSight(dungeon, state, level, x0, y0, x1, y1) {
  const steps = 4 * Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  let last = `${x0},${y0}`;
  for (let i = 1; i < steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    const key = `${x},${y}`;
    if (key === last || (x === x1 && y === y1)) continue;
    last = key;
    if (opaque(dungeon, state, level, x, y)) return false;
  }
  return true;
}

/**
 * What a group perceives of the party.
 * @returns {null|{ seen: boolean, distance: number, adjacent: boolean }} null: unnoticed
 */
export function perceiveParty(dungeon, state, info, group, party) {
  if (party.level !== group.level) return null;
  const dx = party.x - group.x;
  const dy = party.y - group.y;
  const distance = squareDistance(dx, dy);
  const adjacent = Math.abs(dx) + Math.abs(dy) === 1;
  if (distance === 0) return null;
  const clear = () => lineOfSight(dungeon, state, group.level, group.x, group.y, party.x, party.y);
  const facing = sidesTowards(group.x, group.y, party.x, party.y).includes(group.facing);
  if (facing && distance <= info.sight && clear()) return { seen: true, distance, adjacent };
  if ((distance <= info.smell || (adjacent && info.hear > 0)) && clear()) return { seen: false, distance, adjacent };
  return null;
}

/** Facing that turns a group towards (tx, ty): its main axis. */
export const facingTowards = (x, y, tx, ty) => sidesTowards(x, y, tx, ty)[0] ?? null;

/**
 * First step of a shortest way from the group to a tile next to `goal` (or onto it,
 * `onto`), through tiles the species may enter (rules.js), avoiding the teleporters
 * that would carry it, and the tiles where `blocked()` is true (other groups, the party).
 * @returns {null|string} the side to step to ('N'…), or null (no way, or already there)
 */
export function stepTowards(dungeon, state, info, group, goal, { onto = false, blocked = () => false } = {}) {
  const level = group.level;
  const reached = (x, y) =>
    onto ? x === goal.x && y === goal.y : Math.abs(x - goal.x) + Math.abs(y - goal.y) === 1;
  if (reached(group.x, group.y)) return null;
  const start = `${group.x},${group.y}`;
  const firstSide = new Map([[start, null]]);
  const queue = [[group.x, group.y]];
  for (let head = 0; head < queue.length && head < MAX_SEARCH; head++) {
    const [x, y] = queue[head];
    for (const side of FACINGS) {
      const [dx, dy] = SIDE_DELTAS[side];
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (firstSide.has(key)) continue;
      if (!creaturePassage(state, info, level, nx, ny) || carries(dungeon, state, info, level, nx, ny) || blocked(nx, ny)) continue;
      const first = firstSide.get(`${x},${y}`) ?? side;
      if (reached(nx, ny)) return first;
      firstSide.set(key, first);
      queue.push([nx, ny]);
    }
  }
  return null;
}

// A tile that would carry the creature away (active teleporter): pursuit goes around it.
function carries(dungeon, state, info, level, x, y) {
  if (state.tileAt(level, x, y)?.type !== 'teleporter') return false;
  const to = resolveCreatureArrival(dungeon, state, info, { level, x, y, facing: 'N' });
  return Boolean(to) && (to.level !== level || to.x !== x || to.y !== y);
}
