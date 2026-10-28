// Composing and casting spells (phase G1, docs/030): the champion's line of symbols, one per
// step (power, element, form, class), as the spell area of DM keeps it (ReDMCSB MENUS.C).
// The symbols are kept as indices 0..5 in their row (spell-info.js, SYMBOLS).
// A recognised spell always succeeds (no skill test, no experience, no mana, docs/029 Q2), and
// its fatigue applies. G2: potion spells fill an empty flask (potions.js); the others have no effect yet.

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
 * `effects.potion(spell, power)` fills an empty flask in hand; it returns the flask, or null if none.
 * @returns {{ spell: object|null, power: number, item?: object,
 *   reason: 'meaningless'|'needsFlask'|'potion'|'noEffect'|'unimplemented' } | null}
 *   null if the line is empty; 'noEffect': retained spell whose effect comes with G3.
 */
export function castSpell(champion, now, effects) {
  if (!champion.symbols.length) return null;
  const spell = findSpell(champion.symbols);
  const power = champion.symbols[0] + 1;
  if (!spell) {
    champion.symbols = [];
    return { spell: null, power, reason: 'meaningless' };
  }
  let result = { spell, power, reason: spell.retained ? 'noEffect' : 'unimplemented' };
  if (spell.kind === 'potion') {
    const item = effects.potion(spell, power);
    if (!item) return { spell, power, reason: 'needsFlask' };
    result = { spell, power, item, reason: 'potion' };
  }
  champion.symbols = [];
  disableAction(champion, now, spell.fatigue);
  return result;
}
