// Water (docs/050): waterskins, fountains and the champion's water. Hunger and thirst are not
// played yet: the water of the champion is kept, without effect and without loss over time.
// ReDMCSB: F349_INVENTORY_ProcessCommand70_ClickOnMouth (INVNTORY.C), the fountain in
// F377 (COMMAND.C), the starting water in F280 (CHAMPION.C), the descriptions in F342 (INVNTORY.C).
// Waterskin entries of dungeon.json (their `subtype` is the charge count) are changed in place;
// createState() restores them on reset.

import { EMPTY_FLASK } from './potions.js';

export const WATERSKIN = 1; // miscellaneous type: "Water" (the waterskin)
export const WATER_FLASK = 15; // potion type
export const WATERSKIN_CHARGES = 3; // full
export const WATER_MAX = 2048;
export const WATERSKIN_SIP = 800; // water of a sip of waterskin
export const WATER_FLASK_DRINK = 1600; // water of a Water Flask

/** Is this item reference a waterskin? */
export const isWaterskin = (dungeon, ref) => ref?.kind === 'miscellaneous' && dungeon.data.miscellaneous[ref.index]?.type === WATERSKIN;

/** Water of a champion as he joins: 1500 + random(256) (F280). */
export const startingWater = (random) => 1500 + Math.floor(random() * 256);

/** Adds water to the champion, up to WATER_MAX; returns the water gained. */
export function addWater(champion, amount) {
  const before = champion.water;
  champion.water = Math.min(WATER_MAX, champion.water + amount);
  return champion.water - before;
}

/**
 * The champion drinks a sip of the waterskin `entry` (F349); null if it is empty.
 * @returns {{ effect: 'water', gained: number } | null}
 */
export function drinkWaterskin(champion, entry) {
  if (!entry.subtype) return null;
  entry.subtype--;
  return { effect: 'water', gained: addWater(champion, WATERSKIN_SIP) };
}

/**
 * Fills the item held at a fountain (F377): a waterskin becomes full, an empty flask
 * becomes a Water Flask. Returns 'waterskin', 'flask', or null if the item takes no water.
 */
export function fillAtFountain(dungeon, ref) {
  if (isWaterskin(dungeon, ref)) {
    dungeon.data.miscellaneous[ref.index].subtype = WATERSKIN_CHARGES;
    return 'waterskin';
  }
  const potion = ref?.kind === 'potion' ? dungeon.data.potions[ref.index] : null;
  if (potion?.type !== EMPTY_FLASK) return null;
  Object.assign(potion, { type: WATER_FLASK, name: 'Water Flask', power: 0 });
  return 'flask';
}
