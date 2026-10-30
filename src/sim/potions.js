// Potions (phase G2, docs/031): a potion spell fills an empty flask held in a hand, and the
// champion drinks the potion held by the cursor; the flask becomes empty again.
// ReDMCSB: F411_MENUS_GetEmptyFlaskInHand and F412 (MENUS.C), F349_INVENTORY_ProcessCommand70_ClickOnMouth (INVNTORY.C).
// Potion entries of dungeon.json are changed in place; createState() restores them on reset.

export const EMPTY_FLASK = 20;
const FUL_BOMB = 19; // thrown, not drunk
const VI = 14;
const MON = 11; // "Ma Potion"
const EE = 13;
const WATER = 15; // Water Flask (water.js)
const WATER_FLASK_DRINK = 1600;
const WATER_MAX = 2048;

/** The hand (1 action, then 0 ready, F411) holding an empty flask, or -1. */
export function emptyFlaskHand(dungeon, hands) {
  return [1, 0].find((i) => hands[i]?.kind === 'potion' && dungeon.data.potions[hands[i].index].type === EMPTY_FLASK) ?? -1;
}

/** Fills the flask entry with the potion of `spell` at power 1..6: power random(16) + 40 × power (F412). */
export function fillFlask(entry, spell, power, random) {
  entry.type = spell.type;
  entry.name = spell.potion;
  entry.power = Math.floor(random() * 16) + 40 * power;
}

/** Can the potion entry be drunk? (not an empty flask, not a Ful Bomb) */
export const drinkable = (entry) => entry.type !== EMPTY_FLASK && entry.type !== FUL_BOMB;

/**
 * The champion drinks the potion entry (F349): health (Vi), stamina (Ma) and mana (Ee) are coded,
 * the water of a Water Flask too (docs/050); the other potions are drunk without effect for now.
 * The entry becomes an empty flask.
 * @returns {{ effect: 'health'|'stamina'|'mana'|'water'|null, gained: number }} gained: shown value
 */
export function drinkPotion(champion, entry) {
  const power = entry.power;
  const counter = Math.floor(Math.floor((511 - power) / (32 + Math.floor((power + 1) / 8))) / 2);
  const adjusted = Math.floor(power / 25) + 8; // 8..18
  let effect = null;
  let gained = 0;
  if (entry.type === VI) {
    const before = champion.health;
    champion.health = Math.min(champion.maxHealth, champion.health + Math.floor(champion.maxHealth / counter));
    [effect, gained] = ['health', champion.health - before];
  } else if (entry.type === MON) {
    const before = champion.stamina;
    champion.stamina += Math.min(champion.maxStamina - champion.stamina, Math.floor(champion.maxStamina / counter));
    [effect, gained] = ['stamina', Math.floor(champion.stamina / 10) - Math.floor(before / 10)];
  } else if (entry.type === EE) {
    const before = champion.mana;
    let mana = Math.min(900, champion.mana + adjusted + (adjusted - 8));
    if (mana > champion.maxMana) mana -= (mana - Math.max(champion.mana, champion.maxMana)) >> 1;
    champion.mana = mana;
    [effect, gained] = ['mana', mana - before];
  } else if (entry.type === WATER) {
    const before = champion.water;
    champion.water = Math.min(WATER_MAX, champion.water + WATER_FLASK_DRINK);
    [effect, gained] = ['water', champion.water - before];
  }
  entry.type = EMPTY_FLASK;
  entry.name = 'Empty Flask';
  entry.power = 0; // DM keeps the old power (BUG0_49); reset here so the flask shows none
  return { effect, gained };
}
