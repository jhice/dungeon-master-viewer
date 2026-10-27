// Characteristics of the creature species that the engine keeps out of Dungeon.xml
// (graphics.dat item 559, "creature descriptors"). Only what phases C1 and C2 need (docs/021, 022).
// Source: Dungeon Master Encyclopaedia, "Creature Details" table
// (http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/creature-details/),
// columns Movement Ticks, Levitation, Non Material, Size, Base Health, Sight, Hear and
// Smell range. Where versions differ, the values of DM Amiga 3.6 / PC 3.4 (column "d").
//
// moveTicks   minimum ticks (1/6 s) between two moves; 255 = never moves
// levitation  passes over pits, does not press floor plates
// nonMaterial passes through doors of any type
// size        0 = 4 per tile, 1 = 2 per tile, 2 = 1 per tile (centre)
// baseHealth  health of generated creatures (docs/021 § 4)
// sight       squares within which it sees the party, when facing it (docs/022)
// hear        used (3.6) when the party stands next to it unseen (docs/022)
// smell       squares within which it notices the party and turns to it, facing it or not

const IMMOBILE = 255;

// prettier-ignore
const TABLE = [
  // type, name,          moveTicks, levitation, nonMaterial, size, baseHealth, sight, hear, smell
  [0,  'Giant Scorpion',  8,   false, false, 2, 150, 3,  5,  1],
  [1,  'Swamp Slime',     15,  false, false, 0, 110, 2,  3,  1],
  [2,  'Giggler',         3,   false, false, 0, 10,  6,  7,  3],
  [3,  'Wizard Eye',      10,  true,  false, 0, 40,  10, 0,  2],
  [4,  'Pain Rat',        9,   false, false, 1, 101, 4,  5,  5],
  [5,  'Ruster',          20,  false, false, 1, 60,  2,  3,  2],
  [6,  'Screamer',        120, false, false, 0, 165, 1,  1,  1],
  [7,  'Rockpile',        185, false, false, 0, 50,  3,  6,  4],
  [8,  'Ghost',           11,  true,  true,  0, 30,  3,  2,  4],
  [9,  'Stone Golem',     21,  false, false, 2, 120, 3,  2,  0],
  [10, 'Mummy',           17,  false, false, 0, 33,  4,  2,  2],
  [11, 'Black Flame',     255, false, true,  2, 80,  2,  1,  3],
  [12, 'Skeleton',        7,   false, false, 0, 20,  3,  1,  0],
  [13, 'Couatl',          5,   true,  false, 2, 39,  3,  4,  3],
  [14, 'Vexirk',          10,  true,  false, 0, 44,  5,  3,  3],
  [15, 'Magenta Worm',    18,  false, false, 1, 70,  1,  10, 10],
  [16, 'Trolin',          13,  false, false, 0, 20,  3,  4,  3],
  [17, 'Giant Wasp',      1,   true,  false, 0, 8,   2,  3,  4],
  [18, 'Animated Armour', 14,  false, false, 0, 60,  5,  0,  0],
  [19, 'Materializer',    5,   true,  true,  0, 33,  8,  5,  2],
  [20, 'Water Elemental', 25,  false, true,  2, 144, 1,  8,  3],
  [21, 'Oitu',            7,   false, false, 2, 77,  2,  9,  5],
  [22, 'Demon',           10,  false, false, 0, 100, 4,  4,  3],
  [23, 'Lord Chaos',      12,  true,  false, 2, 180, 9,  6,  3],
  [24, 'Red Dragon',      13,  false, false, 2, 255, 5,  4,  6],
];

export const CREATURE_INFO = Object.fromEntries(
  TABLE.map(([type, name, moveTicks, levitation, nonMaterial, size, baseHealth, sight, hear, smell]) => [
    type,
    { type, name, moveTicks, levitation, nonMaterial, size, baseHealth, sight, hear, smell, immobile: moveTicks === IMMOBILE },
  ]),
);

/** Characteristics of a species; unknown types do not move. */
export const creatureInfo = (type) =>
  CREATURE_INFO[type] ?? { type, name: `Creature ${type}`, moveTicks: IMMOBILE, levitation: false, nonMaterial: false, size: 2, baseHealth: 1, sight: 0, hear: 0, smell: 0, immobile: true };
