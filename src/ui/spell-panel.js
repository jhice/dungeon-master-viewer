// The spell area of DM (docs/030), right of the champion's box: a tab with the caster's
// name, the row of the 6 symbols of the current step (power, element, form, class), and the
// line of the symbols chosen, which casts the spell when clicked; the arrow deletes the last
// symbol. Symbols are drawn from the Atari ST glyphs (7 × 7 pixels, spell-glyphs.js).

import { SYMBOLS, spellManaCost } from '../core/spell-info.js';
import { GLYPHS } from '../core/spell-glyphs.js';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * @param {HTMLElement} container the game viewport
 * @param {object} options
 * @param {(index: number) => void} options.onSymbol a symbol of the row was chosen (0..5)
 * @param {() => void} options.onDelete the arrow
 * @param {() => void} options.onCast the line of symbols chosen
 */
export function createSpellPanel(container, { onSymbol, onDelete, onCast }) {
  const panel = element('div', 'spell-panel');
  const tab = element('div', 'spell-tab');
  const row = element('div', 'spell-row');
  const choices = Array.from({ length: 6 }, (_, i) => {
    const button = element('button', 'spell-symbol');
    button.type = 'button';
    button.addEventListener('click', () => {
      onSymbol(i);
      button.blur(); // keep the keyboard for the game
    });
    row.append(button);
    return button;
  });
  const line = element('div', 'spell-line');
  const cast = element('button', 'spell-cast');
  cast.type = 'button';
  cast.title = 'Lancer le sort';
  cast.addEventListener('click', () => {
    onCast();
    cast.blur();
  });
  const del = element('button', 'spell-delete');
  del.type = 'button';
  del.title = 'Effacer le dernier symbole';
  del.append(arrowIcon());
  del.addEventListener('click', () => {
    onDelete();
    del.blur();
  });
  line.append(cast, del);
  panel.append(tab, row, line);
  container.append(panel);

  return {
    /** Shows the caster ({ name, symbols: indices per step, dead }). */
    update(champion) {
      const step = champion.symbols.length;
      tab.textContent = champion.name;
      choices.forEach((button, i) => {
        const name = SYMBOLS[step]?.[i];
        button.replaceChildren(...(name ? [glyph(name)] : []));
        button.disabled = !name || champion.dead;
        button.title = name ?? '';
      });
      const names = champion.symbols.map((index, s) => SYMBOLS[s][index]);
      cast.replaceChildren(...names.map(glyph));
      cast.disabled = !names.length || champion.dead;
      // The mana cost is shown, not spent yet (docs/029 Q2).
      cast.title = names.length ? `Lancer le sort : ${names.join(' ')} (${spellManaCost(champion.symbols)} mana, non décompté)` : 'Choisissez des symboles';
      del.disabled = !names.length || champion.dead;
    },
    dispose() {
      panel.remove();
    },
  };
}

// A glyph as an SVG of 7 × 7 squares, in the current colour.
const glyphPaths = new Map();
function glyph(name) {
  if (!glyphPaths.has(name)) {
    let d = '';
    GLYPHS[name].forEach((row, y) => [...row].forEach((c, x) => c === '#' && (d += `M${x} ${y}h1v1h-1z`)));
    glyphPaths.set(name, d);
  }
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 7 7');
  svg.setAttribute('class', 'spell-glyph');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', glyphPaths.get(name));
  svg.append(path);
  return svg;
}

// The arrow of the delete button, pixel style as in DM.
function arrowIcon() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 9 7');
  svg.setAttribute('class', 'spell-glyph');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M0 3h1v1h-1zM1 2h1v3h-1zM2 1h1v5h-1zM3 0h1v7h-1zM4 2h5v3h-5z');
  svg.append(path);
  return svg;
}

function element(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
