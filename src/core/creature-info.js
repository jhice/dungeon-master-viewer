// Characteristics of the creature species that the engine keeps out of Dungeon.xml
// (graphics.dat item 559, "creature descriptors"). Only what phases C1 to C4 need (docs/021 to 025).
// Source: Dungeon Master Encyclopaedia, "Creature Details" table
// (http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/creature-details/),
// columns Movement Ticks, Levitation, Non Material, Height, Size, Base Health, Sight, Hear and
// Smell range, Attack Ticks, Defense, Attack, Dexterity, Fear resistance; attack types
// from the page "Attacks and Defenses". Where versions differ, the values of DM Amiga 3.6 / PC 3.4 (column "d").
//
// moveTicks   minimum ticks (1/6 s) between two moves; 255 = never moves
// levitation  passes over pits, does not press floor plates
// nonMaterial passes through doors of any type
// size        0 = 4 per tile, 1 = 2 per tile, 2 = 1 per tile (centre)
// baseHealth  health of generated creatures (docs/021 § 4)
// sight       squares within which it sees the party, when facing it (docs/022)
// hear        used (3.6) when the party stands next to it unseen (docs/022)
// smell       squares within which it notices the party and turns to it, facing it or not
// attackTicks minimum ticks between two attacks (docs/023)
// defense     resistance to damage; attack: base of the damage it inflicts
// dexterity   how hard it is for champions to hit it
// attackType  'blunt' | 'sharp' | 'fire' | 'magic' | 'mental' (defence of the champion),
//             'none': the Giggler, which only steals (hard-coded in DM)
// fear        fear resistance, 0..15: a group may flee when one of its members dies
//             (docs/025); 15 = never afraid
// height      1 = tall … 3 = small: a vertical door closing on it stops at this step
//             (tile-states.js), 0 = not at all; it walks under a door closed that far (docs/028)

const IMMOBILE = 255;

// prettier-ignore
const TABLE = [
  // type, name,          moveTicks, levitation, nonMaterial, size, baseHealth, sight, hear, smell, attackTicks, defense, attack, dexterity, attackType, fear, height
  [0,  'Giant Scorpion',  8,   false, false, 2, 150, 3,  5,  1, 20, 55,  150, 55,  'sharp', 10, 1],
  [1,  'Swamp Slime',     15,  false, false, 0, 110, 2,  3,  1, 32, 20,  80,  20,  'blunt', 10, 1],
  [2,  'Giggler',         3,   false, false, 0, 10,  6,  7,  3, 5,  50,  10,  110, 'none', 0, 2],
  [3,  'Wizard Eye',      10,  true,  false, 0, 40,  10, 0,  2, 21, 30,  58,  80,  'magic', 10, 1],
  [4,  'Pain Rat',        9,   false, false, 1, 101, 4,  5,  5, 8,  45,  90,  65,  'sharp', 15, 2],
  [5,  'Ruster',          20,  false, false, 1, 60,  2,  3,  2, 18, 100, 30,  30,  'blunt', 3, 3],
  [6,  'Screamer',        120, false, false, 0, 165, 1,  1,  1, 10, 5,   5,   5,   'mental', 15, 2],
  [7,  'Rockpile',        185, false, false, 0, 50,  3,  6,  4, 15, 170, 40,  10,  'sharp', 12, 2],
  [8,  'Ghost',           11,  true,  true,  0, 30,  3,  2,  4, 16, 15,  55,  80,  'mental', 8, 0],
  [9,  'Stone Golem',     21,  false, false, 2, 120, 3,  2,  0, 14, 240, 219, 35,  'blunt', 15, 1],
  [10, 'Mummy',           17,  false, false, 0, 33,  4,  2,  2, 12, 25,  20,  40,  'blunt', 9, 1],
  [11, 'Black Flame',     255, false, true,  2, 80,  2,  1,  3, 8,  45,  105, 60,  'fire', 10, 1],
  [12, 'Skeleton',        7,   false, false, 0, 20,  3,  1,  0, 7,  22,  22,  80,  'sharp', 9, 1],
  [13, 'Couatl',          5,   true,  false, 2, 39,  3,  4,  3, 10, 42,  90,  88,  'sharp', 4, 1],
  [14, 'Vexirk',          10,  true,  false, 0, 44,  5,  3,  3, 20, 47,  75,  90,  'magic', 5, 3],
  [15, 'Magenta Worm',    18,  false, false, 1, 70,  1,  10, 10, 19, 72,  45,  35,  'sharp', 10, 3],
  [16, 'Trolin',          13,  false, false, 0, 20,  3,  4,  3, 8,  28,  25,  41,  'blunt', 4, 1],
  [17, 'Giant Wasp',      1,   true,  false, 0, 8,   2,  3,  4, 16, 180, 28,  150, 'sharp', 15, 1],
  [18, 'Animated Armour', 14,  false, false, 0, 60,  5,  0,  0, 6,  140, 105, 70,  'sharp', 15, 1],
  [19, 'Materializer',    5,   true,  true,  0, 33,  8,  5,  2, 18, 15,  61,  65,  'magic', 9, 0],
  [20, 'Water Elemental', 25,  false, true,  2, 144, 1,  8,  3, 25, 75,  66,  50,  'blunt', 9, 1],
  [21, 'Oitu',            7,   false, false, 2, 77,  2,  9,  5, 15, 33,  130, 60,  'sharp', 6, 1],
  [22, 'Demon',           10,  false, false, 0, 100, 4,  4,  3, 14, 68,  100, 75,  'blunt', 15, 1],
  [23, 'Lord Chaos',      12,  true,  false, 2, 180, 9,  6,  3, 22, 255, 210, 130, 'magic', 10, 1],
  [24, 'Red Dragon',      13,  false, false, 2, 255, 5,  4,  6, 28, 110, 255, 70,  'sharp', 11, 1],
];

export const CREATURE_INFO = Object.fromEntries(
  TABLE.map(([type, name, moveTicks, levitation, nonMaterial, size, baseHealth, sight, hear, smell, attackTicks, defense, attack, dexterity, attackType, fear, height]) => [
    type,
    {
      type, name, moveTicks, levitation, nonMaterial, size, baseHealth, sight, hear, smell,
      attackTicks, defense, attack, dexterity, attackType, fear, height, immobile: moveTicks === IMMOBILE,
    },
  ]),
);

/**
 * Height of a species as drawn, in fractions of the wall height: just under the step at
 * which a vertical door stops on it (docs/028), so the leaf meets its top: tall 0.7,
 * medium 0.45, small 0.2; non-material ones (height 0), 0.95.
 */
export const standingHeight = (type) => (4 - creatureInfo(type).height) / 4 - 0.05;

/** Characteristics of a species; unknown types do not move. */
export const creatureInfo = (type) =>
  CREATURE_INFO[type] ?? { type, name: `Creature ${type}`, moveTicks: IMMOBILE, levitation: false, nonMaterial: false, size: 2, baseHealth: 1, sight: 0, hear: 0, smell: 0, attackTicks: 255, defense: 0, attack: 0, dexterity: 0, attackType: 'none', fear: 15, height: 1, immobile: true };
