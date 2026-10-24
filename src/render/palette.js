// Colours of items (by category) and creatures (by type), shared by the 2D
// and 3D renderers, the legend and the inventory.
// Creature colours: close to the original sprites where their raw palette is
// reliable (graphics.dat, see docs/008), otherwise from the in-game look (the
// game recolours several creatures at display time).

export const CATEGORY_COLORS = {
  weapon: '#dfe6ee',
  cloth: '#5cc26b',
  scroll: '#f3e6b8',
  potion: '#ff4f7b',
  container: '#c8873a',
  miscellaneous: '#ffb347',
};

// Marker for chests with contents and creatures carrying items.
export const HAS_CONTENTS_COLOR = '#ffd84a';

const CREATURE_COLORS = [
  '#c38c06', // 0 Giant Scorpion
  '#3e9239', // 1 Swamp Slime
  '#2f8f8c', // 2 Giggler
  '#d4a243', // 3 Wizard Eye
  '#b07a45', // 4 Pain Rat
  '#aa8a29', // 5 Ruster
  '#7aa83a', // 6 Screamer
  '#8a7f75', // 7 Rockpile
  '#b8d4ff', // 8 Ghost
  '#7d7d7d', // 9 Stone Golem
  '#e4e0d0', // 10 Mummy
  '#5a2a6e', // 11 Black Flame
  '#f2efe4', // 12 Skeleton
  '#448a56', // 13 Couatl
  '#a8401a', // 14 Vexirk
  '#e040a0', // 15 Magenta Worm
  '#2652e4', // 16 Trolin
  '#e0cc40', // 17 Giant Wasp
  '#a7a9ad', // 18 Animated Armour
  '#8aa8ff', // 19 Materializer
  '#3878e0', // 20 Water Elemental
  '#c18226', // 21 Oitu
  '#d04020', // 22 Demon
  '#9b4dff', // 23 Lord Chaos
  '#ff3020', // 24 Red Dragon
];

export const creatureColor = (type) => CREATURE_COLORS[type] ?? '#ffffff';
