// Minimal event bus: the views subscribe to what the simulation emits.
// Events (see also logic.js: tileChanged, textChanged, actuatorFired, ornamentChanged):
//   'partyMoved' { party, from, kind: 'step'|'turn'|'teleport', effects?, loop? }
//                effects: [{ type: 'stairs'|'fall'|'teleport', party }…] applied after a step (rules.js)
//   'blocked'    { party, reason }
//   'itemsMoved' { from, to, items } items fell through a pit or were carried by a teleporter
//   'creaturesMoved' { group, from, to, carried?, generated?, turned? } a group stepped, fell, was carried,
//                appeared (from = null) or turned on the spot; from / to = { level, x, y, facing } (creatures.js)
//   'groupAlerted' { group, seen } a group noticed the party (seen, or met next to it) and goes after it
//   'reset'      { party }

export function createEmitter() {
  const listeners = new Map(); // type -> Set<fn>
  return {
    /** Subscribes to an event type; returns the unsubscribe function. */
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    emit(type, payload) {
      for (const fn of listeners.get(type) ?? []) fn(payload);
    },
    clear() {
      listeners.clear();
    },
  };
}
