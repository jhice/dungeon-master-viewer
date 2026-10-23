// Tile types, in the order of the original type codes (0..6).
// `gridChar` is the character used in dungeon.json `grid` rows.

export const TILE_TYPES = [
  { id: 'wall', code: 0, gridChar: 'W', solid: true },
  { id: 'floor', code: 1, gridChar: '.', solid: false },
  { id: 'pit', code: 2, gridChar: 'p', solid: false },
  { id: 'stairs', code: 3, gridChar: 's', solid: false },
  { id: 'door', code: 4, gridChar: 'd', solid: false },
  { id: 'teleporter', code: 5, gridChar: 't', solid: false },
  { id: 'fakewall', code: 6, gridChar: 'w', solid: true },
];

const BY_GRID_CHAR = new Map(TILE_TYPES.map((t) => [t.gridChar, t]));

export const tileTypeOfChar = (c) => BY_GRID_CHAR.get(c);
