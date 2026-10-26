// Minimal event bus: the views subscribe to what the simulation emits.
// Events (phase A): 'partyMoved' { party, from, kind: 'step'|'turn'|'teleport' }, 'blocked' { party, reason }, 'reset' { party }.

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
