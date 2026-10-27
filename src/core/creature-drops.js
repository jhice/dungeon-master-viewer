// Items a creature leaves when it dies, apart from its possessions (docs/025): the
// "creature droppings" of the engine (graphics.dat item 559). Each entry is always
// dropped, or with a 50 % chance (`half`); the items of an Animated Armour are cursed
// (set by the code, as in DM).
// Sources: Dungeon Master Encyclopaedia, "Graphics.dat Item 559" (format, 50 % bit, the
// species that drop items) and "Dungeon Master Creatures" (the items and their counts,
// e.g. "Screamer Slice (1-2)" = one always, one at 50 %).

// [kind, type, name, half]
const W = (type, name, half = false) => ['weapon', type, name, half];
const C = (type, name, half = false) => ['cloth', type, name, half];
const M = (type, name, half = false) => ['miscellaneous', type, name, half];

const DROPS = {
  4: [M(35, 'Drumstick'), M(35, 'Drumstick', true)], // Pain Rat: Drumstick (1-2)
  6: [M(33, 'Screamer Slice'), M(33, 'Screamer Slice', true)], // Screamer: Screamer Slice (1-2)
  7: [W(30, 'Rock', true), W(30, 'Rock', true), M(25, 'Boulder'), M(25, 'Boulder', true)], // Rockpile: Rock (0-2), Boulder (1-2)
  9: [W(24, 'Stone Club')], // Stone Golem
  12: [C(30, 'Wooden Shield'), W(9, 'Falchion')], // Skeleton
  15: [M(34, 'Worm Round'), M(34, 'Worm Round', true), M(34, 'Worm Round', true)], // Magenta Worm: Worm Round (1-3)
  16: [W(23, 'Club')], // Trolin
  18: [C(38, 'Armet'), C(39, 'Torso Plate'), C(40, 'Leg Plate'), C(41, 'Foot Plate'), W(10, 'Sword'), W(10, 'Sword')], // Animated Armour
  24: [...Array(8).fill(M(36, 'Dragon Steak')), M(36, 'Dragon Steak', true), M(36, 'Dragon Steak', true)], // Red Dragon: Dragon Steak (8-10)
};
const CURSED = new Set([18]);

/**
 * Items left by a dead creature of type `type`: [{ kind, type, name, cursed }], with the
 * 50 % entries drawn by `random()`.
 */
export function creatureDrops(type, random) {
  return (DROPS[type] ?? [])
    .filter(([, , , half]) => !half || random() < 0.5)
    .map(([kind, itemType, name]) => ({ kind, type: itemType, name, cursed: CURSED.has(type) }));
}
