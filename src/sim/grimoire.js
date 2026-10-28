// The grimoire (phase G4, docs/034): every scroll the party has held (cursor, hands, inventory)
// is kept with its text, and the spells it names (spell-info.js, spellsInText) become known.

import { spellsInText, SPELLS } from '../core/spell-info.js';

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 * @param {ReturnType<import('./state.js').createState>} state
 * @param {(type: string, payload: object) => void} emit 'grimoireChanged'
 */
export function createGrimoire(dungeon, state, emit) {
  const textOf = (index) => dungeon.data.texts[dungeon.data.scrolls[index].text]?.text ?? '';

  /** Scrolls known, in the order they were found: [{ index, text, spells }]. */
  const scrolls = () => [...state.knownScrolls].map((index) => ({ index, text: textOf(index), spells: spellsInText(textOf(index)) }));

  /** Spells known, in the order of the spell table. */
  function spells() {
    const known = new Set(scrolls().flatMap((s) => s.spells));
    return SPELLS.filter((spell) => known.has(spell));
  }

  /** Reads the scrolls the party holds now; emits 'grimoireChanged' with the spells learnt. */
  function update() {
    const held = [state.hand, ...state.hands, ...state.inventory].filter((item) => item?.kind === 'scroll');
    const before = new Set(spells());
    const found = held.filter((item) => !state.knownScrolls.has(item.index));
    if (!found.length) return;
    for (const item of found) state.knownScrolls.add(item.index);
    emit('grimoireChanged', { scrolls: found.map((item) => item.index), learned: spells().filter((spell) => !before.has(spell)) });
  }

  return { scrolls, spells, update };
}
