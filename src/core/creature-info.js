// Characteristics of the creature species that the engine keeps out of Dungeon.xml
// (graphics.dat item 559, "creature descriptors"). Only what phase C1 needs (docs/021).
// Source: Dungeon Master Encyclopaedia, "Creature Details" table
// (http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/creature-details/),
// columns Movement Ticks, Levitation, Non Material, Size and Base Health.
//
// moveTicks   minimum ticks (1/6 s) between two moves; 255 = never moves
// levitation  passes over pits, does not press floor plates
// nonMaterial passes through doors of any type
// size        0 = 4 per tile, 1 = 2 per tile, 2 = 1 per tile (centre)
// baseHealth  health of generated creatures (docs/021 § 4)

const IMMOBILE = 255;

// prettier-ignore
const TABLE = [
  // type, name,             moveTicks, levitation, nonMaterial, size, baseHealth
  [0,  'Giant Scorpion',    8,   false, false, 2, 150],
  [1,  'Swamp Slime',       15,  false, false, 0, 110],
  [2,  'Giggler',           3,   false, false, 0, 10],
  [3,  'Wizard Eye',        10,  true,  false, 0, 40],
  [4,  'Pain Rat',          9,   false, false, 1, 101],
  [5,  'Ruster',            20,  false, false, 1, 60],
  [6,  'Screamer',          120, false, false, 0, 165],
  [7,  'Rockpile',          185, false, false, 0, 50],
  [8,  'Ghost',             11,  true,  true,  0, 30],
  [9,  'Stone Golem',       21,  false, false, 2, 120],
  [10, 'Mummy',             17,  false, false, 0, 33],
  [11, 'Black Flame',       255, false, true,  2, 80],
  [12, 'Skeleton',          7,   false, false, 0, 20],
  [13, 'Couatl',            5,   true,  false, 2, 39],
  [14, 'Vexirk',            10,  true,  false, 0, 44],
  [15, 'Magenta Worm',      18,  false, false, 1, 70],
  [16, 'Trolin',            13,  false, false, 0, 20],
  [17, 'Giant Wasp',        1,   true,  false, 0, 8],
  [18, 'Animated Armour',   14,  false, false, 0, 60],
  [19, 'Materializer',      5,   true,  true,  0, 33],
  [20, 'Water Elemental',   25,  false, true,  2, 144],
  [21, 'Oitu',              7,   false, false, 2, 77],
  [22, 'Demon',             10,  false, false, 0, 100],
  [23, 'Lord Chaos',        12,  true,  false, 2, 180],
  [24, 'Red Dragon',        13,  false, false, 2, 255],
];

export const CREATURE_INFO = Object.fromEntries(
  TABLE.map(([type, name, moveTicks, levitation, nonMaterial, size, baseHealth]) => [
    type,
    { type, name, moveTicks, levitation, nonMaterial, size, baseHealth, immobile: moveTicks === IMMOBILE },
  ]),
);

/** Characteristics of a species; unknown types do not move. */
export const creatureInfo = (type) =>
  CREATURE_INFO[type] ?? { type, name: `Creature ${type}`, moveTicks: IMMOBILE, levitation: false, nonMaterial: false, size: 2, baseHealth: 1, immobile: true };
