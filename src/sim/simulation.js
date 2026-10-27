// The simulation: mutable state + party + clock + action engine + event bus.
// No DOM, no Three.js, so it runs in Node too. Every view (first person, 2D,
// 3D) subscribes to its events; controls send it commands; the caller drives
// the clock with tick().

import { createEmitter } from './events.js';
import { createState } from './state.js';
import { createClock } from './clock.js';
import { createLogic } from './logic.js';
import { createParty, step, turn } from './party.js';
import { blockReason, resolveArrival } from './rules.js';
import { SIDE_DELTAS, FACINGS } from '../core/dungeon.js';

export const COMMANDS = ['forward', 'back', 'left', 'right', 'turnLeft', 'turnRight'];

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 */
export function createSimulation(dungeon) {
  const events = createEmitter();
  const state = createState(dungeon);
  const clock = createClock();
  let party = createParty(dungeon.start);
  const logic = createLogic(dungeon, state, clock, {
    emit: events.emit,
    party: () => party,
    onOpenedUnderParty: applyTileUnderParty,
  });

  function command(name) {
    const from = party;
    if (name === 'turnLeft' || name === 'turnRight') {
      party = turn(party, name === 'turnLeft' ? -1 : 1);
      events.emit('partyMoved', { party, from, kind: 'turn' });
      logic.partyTurned(from, party);
      return;
    }
    const result = step(state, party, name);
    if (result.blocked) {
      events.emit('blocked', { party, reason: result.blocked });
      return;
    }
    // Stairs, pits, teleporters: applied in chain until the party stays somewhere.
    arrive(from, resolveArrival(dungeon, state, result.party), 'step');
  }

  // Moves the party, then the floor actuators of the tile left and of the tile reached act.
  function arrive(from, arrival, kind) {
    party = arrival.party;
    events.emit('partyMoved', { party, from, kind, effects: arrival.effects, loop: arrival.loop });
    logic.partyLeft(from);
    logic.partyEntered(party);
  }

  // A pit opened or a teleporter was activated under the party (actuator): its effect applies now.
  function applyTileUnderParty() {
    arrive(party, resolveArrival(dungeon, state, party), 'mechanism');
  }

  /**
   * Places the party on a tile (test tool, key F), without the effects of the tile
   * nor its floor actuators (so that a pit or a teleporter can be inspected);
   * returns the block reason if it cannot stand there.
   */
  function teleport(level, x, y) {
    const blocked = blockReason(state, level, x, y);
    if (blocked) return blocked;
    const from = party;
    party = { ...party, level, x, y };
    events.emit('partyMoved', { party, from, kind: 'teleport' });
    return null;
  }

  return {
    state,
    on: events.on,
    get party() {
      return party;
    },
    get time() {
      return clock.now;
    },
    command,
    teleport,
    /** Click on what is in front of the party (wall face, door, alcove), with the item in hand. */
    clickFront: () => logic.clickFront(party),
    /** Items carried: [{ kind, index }]. */
    get inventory() {
      return state.inventory;
    },
    /** Item held in hand ({ kind, index }), apart from the inventory, or null. */
    get hand() {
      return state.hand;
    },
    /** Takes the i-th item of the inventory in hand (the item held goes back into the inventory). */
    takeFromInventory: (i) => logic.takeFromInventory(party, i),
    /** Stows the item in hand into the inventory (a chest with its contents). */
    stow: () => logic.stow(party),
    /**
     * Sub-tiles within reach (DM): the two front ones of the party's tile, and the two
     * near ones of the tile in front, if the party could step there.
     * Sub-tiles 0..3 = NW, NE, SE, SW; the front-left one of a tile has the index of the facing.
     */
    reachable(level, x, y, position) {
      if (level !== party.level) return false;
      const f = FACINGS.indexOf(party.facing);
      const [dx, dy] = SIDE_DELTAS[party.facing];
      if (x === party.x && y === party.y) return position === f || position === (f + 1) % 4;
      if (x !== party.x + dx || y !== party.y + dy || blockReason(state, level, x, y)) return false;
      return position === (f + 2) % 4 || position === (f + 3) % 4;
    },
    /** Picks up an item lying within reach into the empty hand; false if impossible. */
    pickUp(level, x, y, ref) {
      if (!this.reachable(level, x, y, ref.position)) return false;
      return logic.pickUp(party, level, x, y, ref);
    },
    /** Puts the item in hand on a sub-tile within reach; false if impossible. */
    drop(level, x, y, position) {
      if (!state.hand || !this.reachable(level, x, y, position)) return false;
      return logic.drop(party, level, x, y, position);
    },
    /** Advances the clock: delayed effects due by then are applied. */
    tick(ticks = 1) {
      clock.advance(ticks);
    },
    reset() {
      clock.clear();
      state.reset();
      party = createParty(dungeon.start);
      events.emit('reset', { party });
    },
    dispose: events.clear,
  };
}
