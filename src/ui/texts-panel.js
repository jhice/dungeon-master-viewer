// Texts panel: inscriptions, messages, scrolls and champion sheets, with full
// text, filters, search; clicking an entry locates it on the map.

import { TEXT_KIND_LABELS, championSummary } from '../core/texts.js';
import { FACE_LABELS, SUBCELL_LABELS } from '../core/contents.js';
import { TEXT_COLORS } from '../render/palette.js';

const KINDS = Object.keys(TEXT_KIND_LABELS);

/**
 * @param {HTMLElement} container
 * @param {Array<object>} texts from buildTexts()
 * @param {object} options
 * @param {(text: object) => void} options.onLocate
 * @param {boolean} [options.open=false]
 * @param {(open: boolean) => void} [options.onToggle]
 */
export function createTextsPanel(container, texts, { onLocate, open = false, onToggle }) {
  const filters = { kind: null, text: '' };

  const panel = document.createElement('details');
  panel.className = 'inventory-panel texts-panel';
  panel.open = open;
  panel.addEventListener('toggle', () => onToggle?.(panel.open));
  const summary = document.createElement('summary');
  summary.textContent = `Textes · ${texts.length}`;

  const chips = document.createElement('div');
  chips.className = 'inv-chips';
  const chipButtons = KINDS.map((kind) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'inv-chip';
    chip.style.setProperty('--c', TEXT_COLORS[kind]);
    chip.textContent = `${TEXT_KIND_LABELS[kind]} ${texts.filter((t) => t.kind === kind).length}`;
    chip.addEventListener('click', () => {
      filters.kind = filters.kind === kind ? null : kind;
      render();
    });
    chips.append(chip);
    return [kind, chip];
  });

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Rechercher dans les textes…';
  search.className = 'texts-search';
  search.addEventListener('input', () => {
    filters.text = search.value.trim().toUpperCase();
    render();
  });

  const list = document.createElement('div');
  list.className = 'inv-list texts-list';
  panel.append(summary, chips, search, list);
  // Typing in the search field must not drive the viewer.
  panel.addEventListener('keydown', (event) => {
    if (event.target.matches('input')) event.stopPropagation();
  });
  container.append(panel);

  function render() {
    for (const [kind, chip] of chipButtons) chip.classList.toggle('is-active', filters.kind === kind);
    const matching = texts.filter(
      (t) =>
        (filters.kind === null || t.kind === filters.kind) &&
        (!filters.text || t.text.replace(/\n/g, ' ').includes(filters.text)),
    );
    // Reading order: by level, then position.
    matching.sort((a, b) => a.level - b.level || a.y - b.y || a.x - b.x);
    list.replaceChildren(...(matching.length ? matching.map(card) : [empty()]));
  }

  function card(t) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `text-card is-${t.kind}`;
    item.style.setProperty('--c', TEXT_COLORS[t.kind]);
    item.title = 'Localiser sur la carte';
    const where = document.createElement('span');
    where.className = 'text-where';
    const side = t.position === undefined ? '' : ` · ${(t.onWall ? FACE_LABELS : SUBCELL_LABELS)[t.position]}`;
    where.textContent = `${TEXT_KIND_LABELS[t.kind].replace(/s$/, '')} · niveau ${t.level} (${t.x}, ${t.y})${side}${t.inside ? ` · dans ${t.inside}` : ''}`;
    const body = document.createElement('span');
    body.className = 'text-body';
    if (t.champion) {
      const c = t.champion;
      body.textContent = [`${c.name}, ${c.title}`, ...championSummary(c), ...c.classes.map((k) => `${k.name} : ${k.skills.filter((s) => s.level).map((s) => `${s.skill} ${s.level}`).join(' · ')}`)].join('\n');
    } else {
      body.textContent = t.text;
    }
    item.append(where, body);
    item.addEventListener('click', () => onLocate(t));
    return item;
  }

  function empty() {
    const p = document.createElement('p');
    p.className = 'inv-empty';
    p.textContent = 'Aucun texte.';
    return p;
  }

  render();
  return {
    element: panel,
    toggle() {
      panel.open = !panel.open;
    },
    dispose: () => panel.remove(),
  };
}
