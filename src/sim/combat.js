// Melee combat between the champion and the creatures (phase C3a, docs/023).
// Pure functions: the caller gives the random generator (random() in [0, 1)).
//
// From the Encyclopaedia ("Actions and Combos"): the action "Hit" (Frapper), its
// stamina, hit probability, damage factor (1/32) and fatigue; an attack hits if one of
// three tests succeeds (dexterity, a 1/4 chance, luck with the hit probability).
// Non-material creatures ignore normal attacks ("Creature Details").
// The exact formulas of the engine are not in the Encyclopaedia: the damage and the
// tests below are PROVISIONAL, to be checked against ReDMCSB (docs/023 § 3).

// Action 12 "Hit" / "Frapper" (Actions and Combos): skill Fight. Action 42 "Throw" /
// "Lancer": its fatigue and stamina are 0 in the table (the engine sets them elsewhere):
// provisional values here.
export const ACTIONS = {
  hit: { name: 'Frapper', stamina: 3, hitProbability: 20, damage: 20, fatigue: 4 },
  throw: { name: 'Lancer', stamina: 2, fatigue: 4 },
};

// Defence of the champion by attack type ("Attacks and Defenses"): the statistic that counts.
const DEFENCE_STAT = { blunt: 'vitality', sharp: 'vitality', fire: 'antiFire', magic: 'antiMagic', mental: 'wisdom' };
// Hit probability that means an automatic hit ("Actions and Combos").
const AUTO_HIT = 75;

const randomInt = (random, n) => Math.floor(random() * n); // 0..n-1

/**
 * The champion strikes a creature of species `info` with `action`, with the strength
 * bonus of the weapon in his action hand ("Dungeon Master Items": strength).
 * @returns {{ result: 'immaterial'|'miss'|'hit', damage: number }}
 */
export function championStrikes(champion, info, action, random, weaponStrength = 0) {
  if (info.nonMaterial) return { result: 'immaterial', damage: 0 };
  const hits =
    randomInt(random, champion.dexterity + info.dexterity + 1) >= info.dexterity || // dexterity test
    randomInt(random, 4) === 0 || // a quarter of the time
    randomInt(random, AUTO_HIT) < Math.min(action.hitProbability, AUTO_HIT) + (champion.luck >> 4); // luck
  if (!hits) return { result: 'miss', damage: 0 };
  // Strength with the weapon's bonus, plus a random half, scaled by the action, minus the defence.
  const base = champion.strength + weaponStrength;
  const raw = Math.floor(((base + randomInt(random, (base >> 1) + 1)) * action.damage) / 32);
  const damage = raw - randomInt(random, (info.defense >> 1) + 1);
  return damage > 0 ? { result: 'hit', damage } : { result: 'miss', damage: 0 };
}

/**
 * A creature of species `info` attacks the champion.
 * @returns {{ result: 'miss'|'hit', damage: number }}
 */
export function creatureStrikes(champion, info, random) {
  const hits = randomInt(random, info.dexterity + champion.dexterity + 1) >= champion.dexterity || randomInt(random, 4) === 0;
  if (!hits) return { result: 'miss', damage: 0 };
  // A quarter of the attack plus a random quarter, minus a part of the defending statistic.
  const quarter = info.attack >> 2;
  const defence = champion[DEFENCE_STAT[info.attackType]] ?? 0;
  const damage = Math.max(1, quarter + randomInt(random, quarter + 1) - randomInt(random, (defence >> 3) + 1));
  return { result: 'hit', damage };
}

/**
 * A thrown item reaches a creature of species `info`: its kinetic energy (weapons) or a
 * part of its weight, plus a part of the energy left (scaled by `mass`: 1 for weapons,
 * lighter items hit softer), minus the defence. Provisional.
 * @returns {{ result: 'miss'|'hit', damage: number }}
 */
export function projectileStrikes(projectile, info, random) {
  const base = projectile.kinetic + Math.floor((Math.max(0, projectile.energy) >> 2) * projectile.mass);
  const damage = base + randomInt(random, (base >> 1) + 1) - randomInt(random, (info.defense >> 1) + 1);
  return damage > 0 ? { result: 'hit', damage } : { result: 'miss', damage: 0 };
}
