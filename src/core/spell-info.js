// The spells of DM, which the engine keeps out of Dungeon.xml (graphics.dat item 560), and
// their symbols (docs/029, 030). Phase G1 only recognises them; difficulty, skill and mana
// are stored for later (C3c), fatigue is applied.
// Source: Dungeon Master Encyclopaedia, "Dungeon Master and Chaos Strikes Back Spells"
// (http://dmweb.free.fr/games/dungeon-master/solutions/spells/), values extracted from the
// Atari ST version; ReDMCSB MENUS.C for the way they are matched (F409) and cast (F412).
//
// symbols     the symbols after the power one (1 to 3 names)
// kind        'potion' | 'projectile' | 'other' (M67_SPELL_KIND)
// difficulty  base required skill level; required level = difficulty + power (1..6), F412
// fatigue     ticks (1/6 s) during which the action hand is disabled after the cast
// skill       index of the skill trained and tested (0..3 classes, 4..19 hidden skills)
// effect      what the spell does, for the phases that code it (G2 potions, G3 torch, openDoor, fireball)
// retained    part of what phases G2 and G3 implement (docs/029 § 1)
// scroll      [level, x, y] of a scroll revealing it in DM (Poison Potion: none)

/** The 4 rows of 6 symbols, chosen in this order: power, element, form, class / alignment. */
export const SYMBOLS = [
  ['Lo', 'Um', 'On', 'Ee', 'Pal', 'Mon'],
  ['Ya', 'Vi', 'Oh', 'Ful', 'Des', 'Zo'],
  ['Ven', 'Ew', 'Kath', 'Ir', 'Bro', 'Gor'],
  ['Ku', 'Ros', 'Dain', 'Neta', 'Ra', 'Sar'],
];

// Mana cost of each symbol at power Lo (G485). A power symbol costs its level (1..6); the others
// are multiplied by the power's multiplier / 8 (G486: 8, 12… 28 = (power + 1) / 2), rounded down.
// prettier-ignore
const SYMBOL_MANA = [
  [1, 2, 3, 4, 5, 6],
  [2, 3, 4, 5, 6, 7],
  [4, 5, 6, 7, 7, 9],
  [2, 2, 3, 4, 6, 7],
];
const POWER_MULTIPLIER = [8, 12, 16, 20, 24, 28];

export const SKILLS = [
  'Fighter', 'Ninja', 'Priest', 'Wizard',
  'Swing', 'Thrust', 'Club', 'Parry', 'Steal', 'Fight', 'Throw', 'Shoot',
  'Identify', 'Heal', 'Influence', 'Defend', 'Fire', 'Air', 'Earth', 'Water',
];

const PRIEST = 'priest';
const WIZARD = 'wizard';
const s = (symbols) => symbols.split(' ');

// prettier-ignore
export const SPELLS = [
  { symbols: s('Vi'),          name: 'Health Potion',      potion: 'Vi Potion',   school: PRIEST, kind: 'potion',     difficulty: 1, fatigue: 32, skill: 13, effect: 'potion',   retained: true,  scroll: [1, 19, 25] },
  { symbols: s('Ya'),          name: 'Stamina Potion',     potion: 'Ma Potion',   school: PRIEST, kind: 'potion',     difficulty: 2, fatigue: 15, skill: 13, effect: 'potion',   retained: true,  scroll: [2, 21, 23] },
  { symbols: s('Zo Bro Ra'),   name: 'Mana Potion',        potion: 'Ee Potion',   school: PRIEST, kind: 'potion',     difficulty: 3, fatigue: 63, skill: 2,  effect: 'potion',   retained: true,  scroll: [9, 33, 16] },
  { symbols: s('Ful Bro Ku'),  name: 'Strength Potion',    potion: 'Ku Potion',   school: PRIEST, kind: 'potion',     difficulty: 4, fatigue: 15, skill: 13, effect: 'potion',   retained: true,  scroll: [7, 35, 39] },
  { symbols: s('Oh Bro Ros'),  name: 'Dexterity Potion',   potion: 'Ros Potion',  school: PRIEST, kind: 'potion',     difficulty: 4, fatigue: 15, skill: 13, effect: 'potion',   retained: true,  scroll: [7, 35, 39] },
  { symbols: s('Ya Bro Dain'), name: 'Wisdom Potion',      potion: 'Dane Potion', school: PRIEST, kind: 'potion',     difficulty: 4, fatigue: 15, skill: 13, effect: 'potion',   retained: true,  scroll: [7, 35, 39] },
  { symbols: s('Ya Bro Neta'), name: 'Vitality Potion',    potion: 'Neta Potion', school: PRIEST, kind: 'potion',     difficulty: 4, fatigue: 15, skill: 13, effect: 'potion',   retained: true,  scroll: [7, 35, 39] },
  { symbols: s('Vi Bro'),      name: 'Cure Poison Potion', potion: 'Bro Potion',  school: PRIEST, kind: 'potion',     difficulty: 1, fatigue: 26, skill: 13, effect: 'potion',   retained: true,  scroll: [1, 19, 25] },
  { symbols: s('Ya Bro'),      name: 'Shield Potion',      potion: 'Ya Potion',   school: PRIEST, kind: 'potion',     difficulty: 2, fatigue: 25, skill: 15, effect: 'potion',   retained: true,  scroll: [3, 26, 20] },
  { symbols: s('Ful Bro Neta'),name: 'Fire Shield',                               school: PRIEST, kind: 'other',      difficulty: 4, fatigue: 28, skill: 15, effect: 'fireShield',               scroll: [6, 33, 28] },
  { symbols: s('Ya Ir'),       name: 'Party Shield',                              school: PRIEST, kind: 'other',      difficulty: 2, fatigue: 30, skill: 15, effect: 'partyShield',              scroll: [9, 32, 40] },
  { symbols: s('Des Ir Sar'),  name: 'Darkness',                                  school: PRIEST, kind: 'other',      difficulty: 1, fatigue: 12, skill: 15, effect: 'darkness',                 scroll: [6, 33, 29] },
  { symbols: s('Ful'),         name: 'Torch',                                     school: WIZARD, kind: 'other',      difficulty: 1, fatigue: 15, skill: 16, effect: 'torch',    retained: true,  scroll: [0, 4, 15] },
  { symbols: s('Oh Ir Ra'),    name: 'Light',                                     school: WIZARD, kind: 'other',      difficulty: 4, fatigue: 22, skill: 17, effect: 'light',                    scroll: [6, 33, 29] },
  { symbols: s('Zo'),          name: 'Open Door',                                 school: WIZARD, kind: 'projectile', difficulty: 1, fatigue: 15, skill: 17, effect: 'openDoor', retained: true,  scroll: [2, 21, 23] },
  { symbols: s('Ya Bro Ros'),  name: 'Magic Footprints',                          school: WIZARD, kind: 'other',      difficulty: 1, fatigue: 18, skill: 18, effect: 'footprints',               scroll: [7, 25, 32] },
  { symbols: s('Oh Ew Ra'),    name: 'See Through Walls',                         school: WIZARD, kind: 'other',      difficulty: 3, fatigue: 33, skill: 15, effect: 'thievesEye',               scroll: [8, 30, 19] },
  { symbols: s('Oh Ew Sar'),   name: 'Invisibility',                              school: WIZARD, kind: 'other',      difficulty: 3, fatigue: 45, skill: 17, effect: 'invisibility',             scroll: [11, 48, 27] },
  { symbols: s('Zo Ven'),      name: 'Poison Potion',      potion: 'Ven Potion',  school: WIZARD, kind: 'potion',     difficulty: 2, fatigue: 30, skill: 19, effect: 'potion',   retained: true,  scroll: null },
  { symbols: s('Des Ven'),     name: 'Poison Bolt',                               school: WIZARD, kind: 'projectile', difficulty: 1, fatigue: 16, skill: 19, effect: 'poisonBolt',               scroll: [1, 2, 45] },
  { symbols: s('Oh Ven'),      name: 'Poison Cloud',                              school: WIZARD, kind: 'projectile', difficulty: 3, fatigue: 27, skill: 19, effect: 'poisonCloud',              scroll: [3, 26, 20] },
  { symbols: s('Des Ew'),      name: 'Weaken Nonmaterial Beings',                 school: WIZARD, kind: 'projectile', difficulty: 1, fatigue: 20, skill: 18, effect: 'harmNonMaterial',          scroll: [2, 32, 38] },
  { symbols: s('Ful Ir'),      name: 'Fireball',                                  school: WIZARD, kind: 'projectile', difficulty: 3, fatigue: 42, skill: 16, effect: 'fireball', retained: true,  scroll: [6, 33, 28] },
  { symbols: s('Oh Kath Ra'),  name: 'Lightning Bolt',                            school: WIZARD, kind: 'projectile', difficulty: 4, fatigue: 30, skill: 17, effect: 'lightningBolt',            scroll: [8, 22, 28] },
  { symbols: s('Zo Kath Ra'),  name: 'Zokathra',                                  school: WIZARD, kind: 'other',      difficulty: 0, fatigue: 15, skill: 3,  effect: 'zokathra',                 scroll: [6, 33, 12] },
];

/** Name of the symbol `index` (0..5) of the step `step` (0..3). */
export const symbolName = (step, index) => SYMBOLS[step][index];

/**
 * Mana cost of choosing the symbol `index` at step `step`, the power symbol being `power`
 * (0..5, ignored at step 0), as F399_MENUS_AddChampionSymbol computes it.
 */
export function symbolManaCost(step, index, power = 0) {
  const base = SYMBOL_MANA[step][index];
  return step ? (base * POWER_MULTIPLIER[power]) >> 3 : base;
}

/** Mana cost of a whole line of symbols (indices per step, the power first). */
export const spellManaCost = (symbols) => symbols.reduce((sum, index, step) => sum + symbolManaCost(step, index, symbols[0]), 0);

/**
 * The spell of a line of symbols (indices per step, the power first), or null: the power
 * is ignored, and a power symbol alone is no spell (F409_MENUS_GetSpellFromSymbols).
 */
export function findSpell(symbols) {
  if (symbols.length < 2) return null;
  const names = symbols.slice(1).map((index, i) => symbolName(i + 1, index));
  return SPELLS.find((spell) => spell.symbols.length === names.length && spell.symbols.every((n, i) => n === names[i])) ?? null;
}
