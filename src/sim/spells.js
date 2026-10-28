// Composing and casting spells (phase G1, docs/030): the champion's line of symbols, one per
// step (power, element, form, class), as the spell area of DM keeps it (ReDMCSB MENUS.C).
// The symbols are kept as indices 0..5 in their row (spell-info.js, SYMBOLS).
// G1: a recognised spell always succeeds (no skill test, no experience, no mana, docs/029 Q2)
// and has no effect yet; only its fatigue applies.

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
 * Casts the line of symbols (F412): the spell, or null if meaningless. Either way the line
 * is emptied (G2 will keep it when a potion lacks a flask). `power` is 1..6 (Lo..Mon).
 * @returns {{ spell: object|null, power: number, reason: 'meaningless'|'noEffect'|'unimplemented' } | null}
 *   null if the line is empty; 'noEffect': retained spell whose effect comes with G2 / G3.
 */
export function castSpell(champion, now) {
  if (!champion.symbols.length) return null;
  const spell = findSpell(champion.symbols);
  const power = champion.symbols[0] + 1;
  champion.symbols = [];
  if (!spell) return { spell: null, power, reason: 'meaningless' };
  disableAction(champion, now, spell.fatigue);
  return { spell, power, reason: spell.retained ? 'noEffect' : 'unimplemented' };
}
