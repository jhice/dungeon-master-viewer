// Composing and casting spells (phase G1, docs/030): the champion's line of symbols, one per
// step (power, element, form, class), as the spell area of DM keeps it (ReDMCSB MENUS.C).
// The symbols are kept as indices 0..5 in their row (spell-info.js, SYMBOLS).
// A recognised spell always succeeds (no skill test, no experience, no mana, docs/029 Q2), and
// its fatigue applies. G2: potion spells fill an empty flask (potions.js). G3: Open Door, Fireball
// (magic.js, projectiles.js) and Torch (light.js). The other spells have no effect yet.

import { findSpell } from '../core/spell-info.js';
import { disableAction } from './champion.js';

export const MAX_SYMBOLS = 4;

/** Adds the symbol `index` (0..5) of the next step; false if the line is full. */
export function addSymbol(champion, index) {
  if (champion.symbols.length >= MAX_SYMBOLS || !(index >= 0 && index < 6)) return false;
  champion.symbols.push(index);
  return true;
}

/** Deletes the last symbol (the arrow, F400); false if the line is empty. */
export function deleteSymbol(champion) {
  return champion.symbols.pop() !== undefined;
}

/**
 * Casts the line of symbols (F412): the spell, or null if meaningless. The line is emptied,
 * except when a potion spell finds no empty flask: one can be taken and the spell cast again
 * (F408). `power` is 1..6 (Lo..Mon).
 * `effects` holds a function per spell effect (spell-info.js): `potion(spell, power)` fills an empty
 * flask in hand and returns it, or null if none; the others (openDoor, fireball, torch) act.
 * @returns {{ spell: object|null, power: number, item?: object,
 *   reason: 'meaningless'|'needsFlask'|'potion'|'cast'|'unimplemented' } | null}
 *   null if the line is empty; 'unimplemented': a spell without effect yet.
 */
export function castSpell(champion, now, effects) {
  if (!champion.symbols.length) return null;
  const spell = findSpell(champion.symbols);
  const power = champion.symbols[0] + 1;
  if (!spell) {
    champion.symbols = [];
    return { spell: null, power, reason: 'meaningless' };
  }
  const effect = effects[spell.effect];
  let result = { spell, power, reason: effect ? 'cast' : 'unimplemented' };
  if (spell.kind === 'potion') {
    const item = effects.potion(spell, power);
    if (!item) return { spell, power, reason: 'needsFlask' };
    result = { spell, power, item, reason: 'potion' };
  } else effect?.(spell, power);
  champion.symbols = [];
  disableAction(champion, now, spell.fatigue);
  return result;
}
