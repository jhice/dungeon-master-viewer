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
// fatigue     ticks (220 ms, docs/047) during which the action hand is disabled after the cast
// skill       index of the skill trained and tested (0..3 classes, 4..19 hidden skills)
// potion      name and type (engine potion type, DEFS.H) of the potion a potion spell fills a flask with
// effect      what the spell does, for the phases that code it (G2 potions, G3 torch, openDoor, fireball)
// retained    part of what phases G2 and G3 implement (docs/029 § 1)

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
  { symbols: s('Vi'),          name: 'Health Potion',      potion: 'Vi Potion',   type: 14, school: PRIEST, kind: 'potion',     difficulty: 1, fatigue: 32, skill: 13, effect: 'potion',   retained: true },
  { symbols: s('Ya'),          name: 'Stamina Potion',     potion: 'Ma Potion',   type: 11, school: PRIEST, kind: 'potion',     difficulty: 2, fatigue: 15, skill: 13, effect: 'potion',   retained: true },
  { symbols: s('Zo Bro Ra'),   name: 'Mana Potion',        potion: 'Ee Potion',   type: 13, school: PRIEST, kind: 'potion',     difficulty: 3, fatigue: 63, skill: 2,  effect: 'potion',   retained: true },
  { symbols: s('Ful Bro Ku'),  name: 'Strength Potion',    potion: 'Ku Potion',   type:  7, school: PRIEST, kind: 'potion',     difficulty: 4, fatigue: 15, skill: 13, effect: 'potion',   retained: true },
  { symbols: s('Oh Bro Ros'),  name: 'Dexterity Potion',   potion: 'Ros Potion',  type:  6, school: PRIEST, kind: 'potion',     difficulty: 4, fatigue: 15, skill: 13, effect: 'potion',   retained: true },
  { symbols: s('Ya Bro Dain'), name: 'Wisdom Potion',      potion: 'Dane Potion', type:  8, school: PRIEST, kind: 'potion',     difficulty: 4, fatigue: 15, skill: 13, effect: 'potion',   retained: true },
  { symbols: s('Ya Bro Neta'), name: 'Vitality Potion',    potion: 'Neta Potion', type:  9, school: PRIEST, kind: 'potion',     difficulty: 4, fatigue: 15, skill: 13, effect: 'potion',   retained: true },
  { symbols: s('Vi Bro'),      name: 'Cure Poison Potion', potion: 'Bro Potion',  type: 10, school: PRIEST, kind: 'potion',     difficulty: 1, fatigue: 26, skill: 13, effect: 'potion',   retained: true },
  { symbols: s('Ya Bro'),      name: 'Shield Potion',      potion: 'Ya Potion',   type: 12, school: PRIEST, kind: 'potion',     difficulty: 2, fatigue: 25, skill: 15, effect: 'potion',   retained: true },
  { symbols: s('Ful Bro Neta'),name: 'Fire Shield',                                         school: PRIEST, kind: 'other',      difficulty: 4, fatigue: 28, skill: 15, effect: 'fireShield' },
  { symbols: s('Ya Ir'),       name: 'Party Shield',                                        school: PRIEST, kind: 'other',      difficulty: 2, fatigue: 30, skill: 15, effect: 'partyShield' },
  { symbols: s('Des Ir Sar'),  name: 'Darkness',                                            school: PRIEST, kind: 'other',      difficulty: 1, fatigue: 12, skill: 15, effect: 'darkness' },
  { symbols: s('Ful'),         name: 'Torch',                                               school: WIZARD, kind: 'other',      difficulty: 1, fatigue: 15, skill: 16, effect: 'torch',    retained: true },
  { symbols: s('Oh Ir Ra'),    name: 'Light',                                               school: WIZARD, kind: 'other',      difficulty: 4, fatigue: 22, skill: 17, effect: 'light' },
  { symbols: s('Zo'),          name: 'Open Door',                                           school: WIZARD, kind: 'projectile', difficulty: 1, fatigue: 15, skill: 17, effect: 'openDoor', retained: true },
  { symbols: s('Ya Bro Ros'),  name: 'Magic Footprints',                                    school: WIZARD, kind: 'other',      difficulty: 1, fatigue: 18, skill: 18, effect: 'footprints' },
  { symbols: s('Oh Ew Ra'),    name: 'See Through Walls',                                   school: WIZARD, kind: 'other',      difficulty: 3, fatigue: 33, skill: 15, effect: 'thievesEye' },
  { symbols: s('Oh Ew Sar'),   name: 'Invisibility',                                        school: WIZARD, kind: 'other',      difficulty: 3, fatigue: 45, skill: 17, effect: 'invisibility' },
  { symbols: s('Zo Ven'),      name: 'Poison Potion',      potion: 'Ven Potion',  type:  3, school: WIZARD, kind: 'potion',     difficulty: 2, fatigue: 30, skill: 19, effect: 'potion',   retained: true },
  { symbols: s('Des Ven'),     name: 'Poison Bolt',                                         school: WIZARD, kind: 'projectile', difficulty: 1, fatigue: 16, skill: 19, effect: 'poisonBolt' },
  { symbols: s('Oh Ven'),      name: 'Poison Cloud',                                        school: WIZARD, kind: 'projectile', difficulty: 3, fatigue: 27, skill: 19, effect: 'poisonCloud' },
  { symbols: s('Des Ew'),      name: 'Weaken Nonmaterial Beings',                           school: WIZARD, kind: 'projectile', difficulty: 1, fatigue: 20, skill: 18, effect: 'harmNonMaterial' },
  { symbols: s('Ful Ir'),      name: 'Fireball',                                            school: WIZARD, kind: 'projectile', difficulty: 3, fatigue: 42, skill: 16, effect: 'fireball', retained: true },
  { symbols: s('Oh Kath Ra'),  name: 'Lightning Bolt',                                      school: WIZARD, kind: 'projectile', difficulty: 4, fatigue: 30, skill: 17, effect: 'lightningBolt' },
  { symbols: s('Zo Kath Ra'),  name: 'Zokathra',                                            school: WIZARD, kind: 'other',      difficulty: 0, fatigue: 15, skill: 3,  effect: 'zokathra' },
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

// Symbol names of the steps after the power one, upper case, by step.
const SPELL_WORDS = SYMBOLS.slice(1).map((row) => row.map((name) => name.toUpperCase()));

/**
 * Spells a text names (a scroll, docs/034): each run of symbol words in step order (element,
 * form, class: "FUL IR", "YA BRO DAIN") that is a whole spell; a word of another kind or a
 * punctuation mark ends a run. "ZOKATHRA" names the spell Zo Kath Ra in one word.
 */
export function spellsInText(text) {
  const found = new Set();
  let run = [];
  const close = () => {
    const spell = run.length && SPELLS.find((s) => s.symbols.length === run.length && s.symbols.every((n, i) => n.toUpperCase() === run[i]));
    if (spell) found.add(spell);
    run = [];
  };
  for (const token of text.toUpperCase().match(/[A-Z]+|[^A-Z\s]+/g) ?? []) {
    if (token === 'ZOKATHRA') {
      close();
      found.add(SPELLS.find((s) => s.effect === 'zokathra'));
      continue;
    }
    const step = run.length;
    if (step < 3 && SPELL_WORDS[step].includes(token)) run.push(token);
    else {
      close();
      if (SPELL_WORDS[0].includes(token)) run.push(token); // a new run starts with an element
    }
  }
  close();
  return [...found];
}
