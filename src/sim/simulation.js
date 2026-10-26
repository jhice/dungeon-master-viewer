// The simulation: mutable state + party + event bus. No DOM, no Three.js, so
// it runs in Node too. Every view (first person, 2D, 3D) subscribes to its
// events; controls send it commands.

import { createEmitter } from './events.js';
import { createState } from './state.js';
import { createParty, step, turn } from './party.js';
import { blockReason } from './rules.js';

export const COMMANDS = ['forward', 'back', 'left', 'right', 'turnLeft', 'turnRight'];

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 */
export function createSimulation(dungeon) {
  const events = createEmitter();
  const state = createState(dungeon);
  let party = createParty(dungeon.start);

  function command(name) {
    const from = party;
    if (name === 'turnLeft' || name === 'turnRight') {
      party = turn(party, name === 'turnLeft' ? -1 : 1);
      events.emit('partyMoved', { party, from, kind: 'turn' });
      return;
    }
    const result = step(state, party, name);
    if (result.blocked) {
      events.emit('blocked', { party, reason: result.blocked });
      return;
    }
    party = result.party;
    events.emit('partyMoved', { party, from, kind: 'step' });
  }

  /** Places the party on a tile (test tool, key F); returns the block reason if it cannot stand there. */
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
    command,
    teleport,
    reset() {
      state.reset();
      party = createParty(dungeon.start);
      events.emit('reset', { party });
    },
    dispose: events.clear,
  };
}
