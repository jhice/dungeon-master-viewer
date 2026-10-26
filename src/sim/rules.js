// Rules of the dungeon, as pure functions of the state (docs/012-simulation.md § 3).
// Phase A: passage between tiles only. Creatures are not obstacles (answer Q4).

/**
 * Why a tile cannot be entered, or null if it can.
 * @returns {null|'outside'|'wall'|'fakewall'|'door'}
 */
export function blockReason(state, level, x, y) {
  const tile = state.tileAt(level, x, y);
  if (!tile) return 'outside';
  switch (tile.type) {
    case 'wall':
      return 'wall';
    case 'fakewall':
      // Open (vanished) or imaginary (illusion): passable.
      return tile.detail.open || tile.detail.imaginary ? null : 'fakewall';
    case 'door':
      return tile.detail.open ? null : 'door';
    default:
      // floor, closed or open pit, stairs, teleporter: effects come in phase B.
      return null;
  }
}

export const BLOCK_LABELS = { outside: 'bord de la carte', wall: 'mur', fakewall: 'mur', door: 'porte fermée' };
