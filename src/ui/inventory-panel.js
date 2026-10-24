// Global inventory: every item and creature group of the dungeon, filterable
// by category, level and name; clicking an occurrence locates it on the map.

import { CATEGORY_LABELS, SUBCELL_LABELS, FACE_LABELS } from '../core/contents.js';
import { CATEGORY_COLORS, creatureColor } from '../render/palette.js';

const CATEGORIES = Object.keys(CATEGORY_LABELS);

/**
 * @param {HTMLElement} container
 * @param {Array<object>} entries from buildInventory()
 * @param {object} options
 * @param {number} options.levelCount
 * @param {(entry: object) => void} options.onLocate
 * @param {(type: string) => number|undefined} [options.creatureType] name -> type, for colours
 * @param {boolean} [options.open=false]
 * @param {(open: boolean) => void} [options.onToggle]
 */
export function createInventoryPanel(container, entries, { levelCount, onLocate, creatureType, open = false, onToggle }) {
  const filters = { category: null, level: null, text: '' };

  const panel = document.createElement('details');
  panel.className = 'inventory-panel';
  panel.open = open;
  panel.addEventListener('toggle', () => onToggle?.(panel.open));
  const summary = document.createElement('summary');
  panel.append(summary);

  // Category chips with totals (creatures count individuals).
  const chips = document.createElement('div');
  chips.className = 'inv-chips';
  const totals = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const e of entries) totals[e.category] += e.count ?? 1;
  // summary.textContent = `Inventaire · ${totals.creature} créatures · ${entries.length - entries.filter((e) => e.category === 'creature').length} objets`;
  summary.textContent = `Inventaire créatures et objets`;
  const chipButtons = CATEGORIES.map((category) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'inv-chip';
    chip.style.setProperty('--c', category === 'creature' ? '#e8e0c8' : CATEGORY_COLORS[category]);
    chip.textContent = `${CATEGORY_LABELS[category]} ${totals[category]}`;
    chip.addEventListener('click', () => {
      filters.category = filters.category === category ? null : category;
      render();
    });
    chips.append(chip);
    return [category, chip];
  });

  const controls = document.createElement('div');
  controls.className = 'inv-controls';
  const levelSelect = document.createElement('select');
  levelSelect.append(new Option('Tous les niveaux', ''));
  for (let i = 0; i < levelCount; i++) levelSelect.append(new Option(`Niveau ${i}`, String(i)));
  levelSelect.addEventListener('change', () => {
    filters.level = levelSelect.value === '' ? null : Number(levelSelect.value);
    render();
  });
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Rechercher…';
  search.addEventListener('input', () => {
    filters.text = search.value.trim().toLowerCase();
    render();
  });
  controls.append(levelSelect, search);

  const list = document.createElement('div');
  list.className = 'inv-list';
  panel.append(chips, controls, list);

  // Typing in the search field or the level list must not drive the viewer;
  // other keys (after clicking a button) still do.
  panel.addEventListener('keydown', (event) => {
    if (event.target.matches('input, select')) event.stopPropagation();
  });
  container.append(panel);

  function render() {
    for (const [category, chip] of chipButtons) chip.classList.toggle('is-active', filters.category === category);
    const matching = entries.filter(
      (e) =>
        (filters.category === null || e.category === filters.category) &&
        (filters.level === null || e.level === filters.level) &&
        (!filters.text || e.name.toLowerCase().includes(filters.text) || e.inside?.toLowerCase().includes(filters.text)),
    );
    // Group by category + name, largest groups first.
    const groups = new Map();
    for (const e of matching) {
      const key = `${e.category}|${e.name}`;
      if (!groups.has(key)) groups.set(key, { category: e.category, name: e.name, total: 0, entries: [] });
      const group = groups.get(key);
      group.total += e.count ?? 1;
      group.entries.push(e);
    }
    const sorted = [...groups.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    list.replaceChildren(...(sorted.length ? sorted.map(groupElement) : [emptyMessage()]));
  }

  function groupElement(group) {
    const details = document.createElement('details');
    details.className = 'inv-group';
    const head = document.createElement('summary');
    const dot = document.createElement('span');
    dot.className = 'inv-dot';
    dot.style.background = group.category === 'creature' ? creatureColor(creatureType?.(group.name)) : CATEGORY_COLORS[group.category];
    const count = document.createElement('span');
    count.className = 'inv-count';
    count.textContent = group.total;
    head.append(dot, group.name, count);
    details.append(head);
    // Occurrences are built on first opening only.
    details.addEventListener(
      'toggle',
      () => {
        const ul = document.createElement('ul');
        for (const e of group.entries) ul.append(occurrenceElement(e));
        details.append(ul);
      },
      { once: true },
    );
    return details;
  }

  function occurrenceElement(e) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const labels = e.onWall ? FACE_LABELS : SUBCELL_LABELS;
    const where = e.inside ? `dans ${e.inside}` : e.position === null || e.position === undefined ? '' : labels[e.position];
    const extra = [e.count > 1 ? `×${e.count}` : '', where, e.note].filter(Boolean).join(' · ');
    button.textContent = `Niveau ${e.level} (${e.x}, ${e.y})${extra ? ` — ${extra}` : ''}`;
    button.title = 'Localiser sur la carte';
    button.addEventListener('click', () => onLocate(e));
    li.append(button);
    return li;
  }

  function emptyMessage() {
    const p = document.createElement('p');
    p.className = 'inv-empty';
    p.textContent = 'Aucun résultat.';
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
