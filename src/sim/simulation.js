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
    /** Visible texts on the wall face in front of the party (inscriptions, messages shown). */
    facedTexts() {
      const [dx, dy] = SIDE_DELTAS[party.facing];
      const tile = dungeon.tileAt(party.level, party.x + dx, party.y + dy);
      if (tile?.type !== 'wall') return [];
      const face = (FACINGS.indexOf(party.facing) + 2) % 4;
      return (tile.detail?.items ?? [])
        .filter((ref) => ref.kind === 'text' && ref.position === face && state.textVisible(ref.index))
        .map((ref) => dungeon.data.texts[ref.index].text);
    },
    /** Click on what is in front of the party (wall face, door button). Phase E: item in hand. */
    clickFront: () => logic.clickFront(party, null),
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
