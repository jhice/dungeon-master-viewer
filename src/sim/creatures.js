// Creature groups (phases C1 and C2, docs/021 and 022): presence, movement, perception
// and pursuit of the party, no combat yet.
// - Only the groups on the party's level are active, as in DM (the engine keeps
//   "extended" data for them only); the others wait, frozen, for the party.
// - An active group wanders: every `moveTicks` (species) and a random extra, one step
//   to a random neighbouring tile it may enter (rules.js), then falls and teleporters.
// - When it is due, it first looks for the party (perception.js): seen, it walks towards
//   it every `moveTicks` and stays next to it, facing it; smelled or heard, it turns to
//   it; with no way to it, or lost from sight once where it saw it last, it wanders.
// - One group per tile; a group never enters the party's tile.
// - Generators, triggered by another actuator (a plate of the party, often a few tiles
//   away), create their group on their own tile; if it is taken, the group appears as
//   soon as it is free (as in DM: the event waits in the queue).
// Randomness is seeded: a game replays the same way.

import { SIDE_DELTAS, FACINGS } from '../core/dungeon.js';
import { creatureInfo } from '../core/creature-info.js';
import { creaturePassage, resolveCreatureArrival } from './rules.js';
import { perceiveParty, facingTowards, stepTowards } from './perception.js';

const SEED = 0x0d4e0;
// Members per tile by size (creature-info.js), and their sub-tiles (0..3 = NW, NE, SE, SW).
const MAX_MEMBERS = [4, 2, 1];
const POSITIONS = [[0, 1, 2, 3], [0, 2], [null]];

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 * @param {ReturnType<import('./state.js').createState>} state
 * @param {ReturnType<import('./clock.js').createClock>} clock
 * @param {ReturnType<import('./logic.js').createLogic>} logic
 * @param {object} hooks
 * @param {(type: string, payload: object) => void} hooks.emit 'creaturesMoved', 'groupAlerted'
 * @param {() => object} hooks.party current party
 */
export function createCreatures(dungeon, state, clock, logic, { emit, party }) {
  let random;
  let activeLevel; // level whose groups are active (the party's), null before the first update
  let pending; // generated groups waiting for their tile to be free: [{ group, level, x, y }]

  function reset() {
    random = mulberry32(SEED);
    activeLevel = null;
    pending = [];
  }
  reset();

  const randomInt = (n) => Math.floor(random() * n); // 0..n-1
  const partyOn = (level, x, y) => {
    const p = party();
    return p.level === level && p.x === x && p.y === y;
  };
  const free = (level, x, y) => !state.groupAt(level, x, y) && !partyOn(level, x, y);

  // Next move: the minimum of the species plus a random extra (wandering), see docs/021.
  const nextMove = (info) => clock.now + info.moveTicks + randomInt(info.moveTicks + 1);

  // Groups of the party's level become active when the party arrives there.
  function activate(level) {
    activeLevel = level;
    for (const group of state.groups) {
      if (group.level !== level) continue;
      const info = creatureInfo(group.type);
      group.nextMove = info.immobile ? null : clock.now + 1 + randomInt(info.moveTicks);
      group.target = null;
    }
  }

  /** One tick: generated groups appear if they can, then the active groups that are due move. */
  function update() {
    const level = party().level;
    if (level !== activeLevel) activate(level);
    pending = pending.filter((waiting) => !place(waiting));
    for (const group of [...state.groups]) {
      if (group.level !== activeLevel || group.nextMove === null || group.nextMove > clock.now) continue;
      const info = creatureInfo(group.type);
      const busy = behave(group, info);
      // Carried to another level: frozen there until the party comes. Busy with the party: no idle time.
      group.nextMove = group.level !== activeLevel ? null : busy ? clock.now + info.moveTicks : nextMove(info);
    }
  }

  // What a due group does: deal with the party if it notices it or remembers where it
  // saw it, else wander. Returns true when busy with the party.
  function behave(group, info) {
    const p = party();
    const sense = perceiveParty(dungeon, state, info, group, p);
    if (sense) {
      // Seen, or met (next to it): it remembers where the party stands.
      if (sense.seen || sense.adjacent) {
        if (!group.target) emit('groupAlerted', { group, seen: sense.seen });
        group.target = { x: p.x, y: p.y };
      }
      if (sense.seen && !sense.adjacent) {
        if (approach(group, info, group.target, false)) return true;
        // No way to it (other groups in the way…): it wanders, and will look again.
        wander(group, info);
        return false;
      }
      // Next to it, smelled or heard: it turns to it.
      turn(group, facingTowards(group.x, group.y, p.x, p.y));
      return true;
    }
    if (group.target) {
      // Lost from sight: to the place where it saw the party last.
      if (approach(group, info, group.target, true)) return true;
      group.target = null;
    }
    wander(group, info);
    return false;
  }

  // One step on a shortest way towards `goal` (next to it, or onto it); false if none.
  function approach(group, info, goal, onto) {
    const side = stepTowards(dungeon, state, info, group, goal, { onto, blocked: (x, y) => !free(group.level, x, y) });
    if (!side) return false;
    const [dx, dy] = SIDE_DELTAS[side];
    const step = { level: group.level, x: group.x + dx, y: group.y + dy, facing: side };
    move(group, resolveCreatureArrival(dungeon, state, info, step) ?? step, step);
    return true;
  }

  // Turns on the spot (no plate notices it).
  function turn(group, facing) {
    if (!facing || facing === group.facing) return;
    const from = { level: group.level, x: group.x, y: group.y, facing: group.facing };
    state.moveGroup(group, { ...from, facing });
    emit('creaturesMoved', { group, from, to: { ...from, facing }, turned: true });
  }

  // One step to a random side it may take, facing it; falls and teleporters apply.
  function wander(group, info) {
    const sides = [...FACINGS];
    for (let i = sides.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [sides[i], sides[j]] = [sides[j], sides[i]];
    }
    for (const facing of sides) {
      const [dx, dy] = SIDE_DELTAS[facing];
      const step = { level: group.level, x: group.x + dx, y: group.y + dy, facing };
      if (!creaturePassage(state, info, step.level, step.x, step.y) || !free(step.level, step.x, step.y)) continue;
      const to = resolveCreatureArrival(dungeon, state, info, step) ?? step;
      if (to !== step && !free(to.level, to.x, to.y)) continue; // landing place taken
      move(group, to, step);
      return true;
    }
    return false;
  }

  function move(group, to, step = to) {
    const from = { level: group.level, x: group.x, y: group.y, facing: group.facing };
    logic.moveGroup(group, to);
    emit('creaturesMoved', { group, from, to, carried: to !== step });
  }

  /** A pit opened or a teleporter was activated under a group: it falls or is carried, if it lands on a free tile. */
  function settle(level, x, y) {
    const group = state.groupAt(level, x, y);
    if (!group) return;
    const info = creatureInfo(group.type);
    const to = resolveCreatureArrival(dungeon, state, info, { level, x, y, facing: group.facing });
    if (!to || !free(to.level, to.x, to.y)) return;
    move(group, to, null);
    if (group.level !== activeLevel) group.nextMove = null;
  }

  /**
   * A generator (floor actuator) was pressed: its group of species `data` is created
   * on its tile. Count: `count`, or 1 to `count` if `isMax` (bounded by the size of the
   * species). Health of each member: multiplier (`hpMultiplier`, or else the level's
   * `difficulty`) × base health + random(base health / 4 + 1) (Encyclopaedia, docs/021).
   */
  function generate(index) {
    const a = dungeon.data.actuators[index];
    const { map: level, x, y } = a.at;
    const info = creatureInfo(a.data);
    const max = MAX_MEMBERS[info.size] ?? 1;
    const count = Math.min(max, a.generator.isMax ? 1 + randomInt(a.generator.count) : a.generator.count);
    const multiplier = a.generator.hpMultiplier || dungeon.level(level).difficulty || 1;
    const positions = count === 1 ? [null] : POSITIONS[info.size];
    const members = Array.from({ length: count }, (_, i) => ({
      hp: multiplier * info.baseHealth + randomInt(Math.floor(info.baseHealth / 4) + 2),
      position: positions[i] ?? null,
    }));
    const group = { type: a.data, level, x, y, facing: FACINGS[randomInt(4)], members };
    if (!place({ group, level, x, y })) pending.push({ group, level, x, y });
  }

  // Puts a generated group on its tile if it is free; returns true when done.
  function place({ group, level, x, y }) {
    if (!free(level, x, y)) return false;
    let created;
    logic.groupAppeared(level, x, y, () => (created = state.createGroup(group)));
    const info = creatureInfo(created.type);
    created.nextMove = info.immobile || level !== activeLevel ? null : nextMove(info);
    emit('creaturesMoved', { group: created, from: null, to: { level, x, y, facing: created.facing }, generated: true });
    return true;
  }

  return { update, settle, generate, reset };
}

// Small seeded generator (mulberry32): uniform in [0, 1).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
