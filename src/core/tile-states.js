// States of the tiles that have one: doors, pits and fake walls.
// Meaning of the flags (from the DM engine, consistent with the data):
//   door     open        the door is raised/open
//   pit      open        the pit is a hole (closed = covered, behaves as floor)
//            invisible   the game does not draw it (looks like floor)
//            imaginary   drawn but harmless (none in DM)
//   fakewall open        the wall has vanished (passable, not drawn)
//            imaginary   illusory wall: drawn but passable

/** State flags of a tile, or null for tiles without state. */
export function tileState(type, detail) {
  switch (type) {
    case 'door':
      return { open: detail.open };
    case 'pit':
      return { open: detail.open, invisible: detail.invisible, imaginary: detail.imaginary };
    case 'fakewall':
      return { open: detail.open, imaginary: detail.imaginary };
    default:
      return null;
  }
}

/** CSS-friendly modifiers: ['is-open'|'is-closed', 'is-invisible', 'is-imaginary']. */
export function stateModifiers(type, detail) {
  const state = tileState(type, detail);
  if (!state) return [];
  const modifiers = [state.open ? 'is-open' : 'is-closed'];
  if (state.invisible) modifiers.push('is-invisible');
  if (state.imaginary) modifiers.push('is-imaginary');
  return modifiers;
}

/** Human-readable state, for the status bar: e.g. "fermée, invisible". */
export function describeState(type, detail) {
  const state = tileState(type, detail);
  if (!state) return null;
  if (type === 'fakewall') {
    if (state.open) return 'ouvert (disparu, franchissable)';
    return state.imaginary ? 'imaginaire (franchissable)' : 'fermé (bloquant)';
  }
  if (type === 'door' && detail.broken) return 'cassée (franchissable)';
  const words = [state.open ? 'ouverte' : 'fermée'];
  if (state.invisible) words.push('invisible');
  if (state.imaginary) words.push('imaginaire');
  return words.join(', ');
}
