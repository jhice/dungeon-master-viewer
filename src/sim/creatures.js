// Creature groups (phases C1 to C4, docs/021 to 025): presence, movement, perception,
// pursuit of the party, melee attacks, death, fear and theft.
// - Only the groups on the party's level are active, as in DM (the engine keeps
//   "extended" data for them only); the others wait, frozen, for the party.
// - An active group wanders: every `moveTicks` (species) and a random extra, one step
//   to a random neighbouring tile it may enter (rules.js), then falls and teleporters.
// - When it is due, it first looks for the party (perception.js): seen, it walks towards
//   it every `moveTicks` and stays next to it, facing it; smelled or heard, it turns to
//   it; with no way to it, or lost from sight once where it saw it last, it wanders.
// - Next to the party and facing it, it attacks every `attackTicks` (hook `attack`).
//   An immobile species (Black Flame) does not turn, and attacks whatever its facing.
// - A member killed (`kill()`) leaves the items of its species (creature-drops.js); the
//   survivors may flee, by their fear resistance. The last one killed: the group's
//   possessions fall on its tile too, its plate is released.
// - A Giggler next to the party steals the item of a hand (hook `steal`), then flees for
//   as long as it holds stolen items: blocked, it waits; it never comes back to the party.
// - A fleeing group steps away from the party for a while; cornered, it fights.
// - One group per tile; a group never enters the party's tile.
// - Generators, triggered by another actuator (a plate of the party, often a few tiles
//   away), create their group on their own tile; if it is taken, the group appears as
//   soon as it is free (as in DM: the event waits in the queue).
// Randomness is seeded: a game replays the same way.

import { SIDE_DELTAS, FACINGS } from '../core/dungeon.js';
import { creatureInfo } from '../core/creature-info.js';
import { creaturePassage, resolveCreatureArrival } from './rules.js';
import { perceiveParty, facingTowards, stepTowards } from './perception.js';
import { mulberry32 } from './random.js';
import { creatureDrops } from '../core/creature-drops.js';

const SEED = 0x0d4e0;
const THIEF = 2; // Giggler: steals instead of attacking (hard-coded in DM)
// Flight: at least this many ticks, plus as many at random (provisional, docs/025).
const FLEE_TICKS = 60;
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
 * @param {() => boolean} hooks.partyAlive false once the champion is dead: creatures ignore the party
 * @param {(group, info) => void} hooks.attack a group attacks the party (simulation.js)
 * @param {(group, info) => object|null} hooks.steal a Giggler tries to steal an item of the champion
 * Also emits 'groupFled' { group, reason: 'fear'|'theft' }.
 */
export function createCreatures(dungeon, state, clock, logic, { emit, party, partyAlive, attack, steal }) {
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
  // An immobile species only checks every so often whether the party is next to it.
  const IMMOBILE_CHECK = 6;

  // Groups of the party's level become active when the party arrives there.
  function activate(level) {
    activeLevel = level;
    for (const group of state.groups) {
      if (group.level !== level) continue;
      const info = creatureInfo(group.type);
      group.nextMove = clock.now + 1 + randomInt(info.immobile ? IMMOBILE_CHECK : info.moveTicks);
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
      const delay = behave(group, info);
      if (state.groupAt(group.level, group.x, group.y) !== group) continue; // killed meanwhile
      // Carried to another level: frozen there until the party comes. Busy with the party: no idle time.
      group.nextMove = group.level !== activeLevel ? null : delay !== null ? clock.now + delay : nextMove(info);
    }
  }

  // What a due group does: deal with the party if it notices it or remembers where it
  // saw it, else wander. Returns the delay before it acts again, or null when it wanders
  // (the delay of wandering applies).
  function behave(group, info) {
    const p = party();
    const sense = partyAlive() ? perceiveParty(dungeon, state, info, group, p) : null;
    if (info.immobile) {
      if (sense?.adjacent && info.attackType !== 'none') {
        attack(group, info);
        return info.attackTicks;
      }
      return IMMOBILE_CHECK;
    }
    if (group.fleeUntil > clock.now) {
      if (flee(group, info, p)) return info.moveTicks;
      // Cornered: it fights if the party is next to it, else it waits.
      if (!sense?.adjacent) return info.moveTicks;
    }
    if (sense) {
      // Seen, or met (next to it): it remembers where the party stands.
      if (sense.seen || sense.adjacent) {
        if (!group.target) emit('groupAlerted', { group, seen: sense.seen });
        group.target = { x: p.x, y: p.y };
      }
      if (sense.seen && !sense.adjacent) {
        if (approach(group, info, group.target, false)) return info.moveTicks;
        // No way to it (other groups in the way…): it wanders, and will look again.
        wander(group, info);
        return null;
      }
      // Next to it, smelled or heard: it turns to it; next to it and facing it, it attacks.
      const facing = facingTowards(group.x, group.y, p.x, p.y);
      if (sense.adjacent && group.facing === facing && group.type === THIEF) {
        const item = steal(group, info);
        if (item) {
          group.items.push(item);
          scare(group, 'theft');
        }
        return info.attackTicks;
      }
      if (sense.adjacent && group.facing === facing && info.attackType !== 'none') {
        attack(group, info);
        return info.attackTicks;
      }
      turn(group, facing);
      return sense.adjacent ? Math.min(info.moveTicks, info.attackTicks) : info.moveTicks;
    }
    if (group.target) {
      // Lost from sight: to the place where it saw the party last.
      if (approach(group, info, group.target, true)) return info.moveTicks;
      group.target = null;
    }
    wander(group, info);
    return null;
  }

  /** The party struck the group: it notices the party and acts at once (turns, attacks), unless it flees. */
  function provoke(group) {
    if (group.level !== activeLevel || group.fleeUntil > clock.now) return;
    const p = party();
    if (!group.target) emit('groupAlerted', { group, seen: true });
    group.target = { x: p.x, y: p.y };
    if (group.nextMove === null || group.nextMove > clock.now + 1) group.nextMove = clock.now + 1;
  }

  /** Danger on the tile of the group (a door closing on it): it acts at the next tick. */
  function alarm(group) {
    if (group.nextMove === null || group.nextMove > clock.now + 1) group.nextMove = clock.now + 1;
  }

  // The group flees for a while after a death (fear), for good after a theft (a Giggler
  // with its loot, until it is killed).
  function scare(group, reason) {
    group.fleeUntil = reason === 'theft' ? Infinity : clock.now + FLEE_TICKS + randomInt(FLEE_TICKS);
    group.target = null;
    emit('groupFled', { group, reason });
  }

  // One step that takes the group farther from the party; false if none does.
  function flee(group, info, p) {
    const distance = (x, y) => Math.abs(x - p.x) + Math.abs(y - p.y);
    const here = distance(group.x, group.y);
    const steps = FACINGS.map((facing) => {
      const [dx, dy] = SIDE_DELTAS[facing];
      return { level: group.level, x: group.x + dx, y: group.y + dy, facing };
    })
      .filter((s) => distance(s.x, s.y) > here && creaturePassage(state, info, s.level, s.x, s.y) && free(s.level, s.x, s.y))
      .sort(() => random() - 0.5);
    for (const step of steps) {
      const to = resolveCreatureArrival(dungeon, state, info, step) ?? step;
      if (to !== step && !free(to.level, to.x, to.y)) continue;
      move(group, to, step);
      return true;
    }
    return false;
  }

  /**
   * A member of the group dies (health at 0): the items of its species fall on its
   * sub-tile, and the survivors may flee (fear resistance, 0..15: they flee if a draw
   * from 0 to 14 reaches it; provisional). The last one: the group vanishes, its
   * possessions fall too and its plate is released. Returns true if the group is gone.
   */
  function kill(group, member) {
    group.members = group.members.filter((m) => m !== member);
    const at = { level: group.level, x: group.x, y: group.y, facing: group.facing };
    const position = () => member.position ?? randomInt(4);
    const items = creatureDrops(group.type, random).map(({ kind, type, name, cursed }) => ({
      ...state.createItem(kind, type, name, { cursed }),
      position: position(),
    }));
    if (group.members.length) {
      if (items.length) logic.itemsDropped(at.level, at.x, at.y, items);
      emit('creaturesMoved', { group, from: at, to: at, killed: true });
      if (group.fleeUntil <= clock.now && randomInt(15) >= creatureInfo(group.type).fear) scare(group, 'fear');
      return false;
    }
    logic.groupVanished(group, () => state.removeGroup(group));
    items.push(...group.items.map((ref) => ({ kind: ref.kind, index: ref.index, position: position() })));
    group.items = [];
    if (items.length) logic.itemsDropped(at.level, at.x, at.y, items);
    emit('creaturesMoved', { group, from: at, to: null, killed: true });
    return true;
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
    created.nextMove = level !== activeLevel ? null : info.immobile ? clock.now + IMMOBILE_CHECK : nextMove(info);
    emit('creaturesMoved', { group: created, from: null, to: { level, x, y, facing: created.facing }, generated: true });
    return true;
  }

  return { update, settle, generate, provoke, alarm, kill, reset };
}
