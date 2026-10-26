// The party: an abstract character (answer Q3) with a position and a facing.
// Party objects are immutable: every command returns a new one.

import { SIDE_DELTAS } from '../core/dungeon.js';
import { blockReason } from './rules.js';

export const FACINGS = ['N', 'E', 'S', 'W'];

// Steps relative to the facing, in quarter turns clockwise.
const STEP_TURNS = { forward: 0, right: 1, back: 2, left: 3 };

export const createParty = ({ map, x, y, facing }) => ({ level: map, x, y, facing });

/** Absolute side reached by turning `quarterTurns` clockwise from `facing`. */
export const rotate = (facing, quarterTurns) => FACINGS[(FACINGS.indexOf(facing) + quarterTurns + 4) % 4];

/** Turn by ±1 quarter (+1 = right, clockwise). */
export const turn = (party, quarterTurns) => ({ ...party, facing: rotate(party.facing, quarterTurns) });

/**
 * One step forward, back, left or right, without turning.
 * @returns {{ party: object, blocked: string|null }} the new party, or the old one and the reason it is blocked
 */
export function step(state, party, direction) {
  const [dx, dy] = SIDE_DELTAS[rotate(party.facing, STEP_TURNS[direction])];
  const x = party.x + dx;
  const y = party.y + dy;
  const blocked = blockReason(state, party.level, x, y);
  return blocked ? { party, blocked } : { party: { ...party, x, y }, blocked: null };
}
