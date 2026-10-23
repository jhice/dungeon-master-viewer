// Legend of tile types, drawn with the active renderer's own visuals.

import { ASCII_SYMBOLS } from '../render/ascii/ascii-renderer.js';
import { tileClasses } from '../render/dom/dom-renderer.js';

const ENTRIES = [
  { label: 'wall', tile: { type: 'wall' }, ascii: ASCII_SYMBOLS.wall },
  { label: 'floor', tile: { type: 'floor' }, ascii: ASCII_SYMBOLS.floor },
  { label: 'pit', tile: { type: 'pit' }, ascii: ASCII_SYMBOLS.pit },
  { label: 'stairs up', tile: { type: 'stairs', detail: { direction: 'up', orientation: 'NS' } }, ascii: ASCII_SYMBOLS.stairsUp },
  { label: 'stairs down', tile: { type: 'stairs', detail: { direction: 'down', orientation: 'NS' } }, ascii: ASCII_SYMBOLS.stairsDown },
  { label: 'door', tile: { type: 'door', detail: { orientation: 'NS' } }, ascii: ASCII_SYMBOLS.door },
  { label: 'teleporter', tile: { type: 'teleporter' }, ascii: ASCII_SYMBOLS.teleporter },
  { label: 'fake wall', tile: { type: 'fakewall' }, ascii: ASCII_SYMBOLS.fakewall },
];

export function renderLegend(container, rendererId) {
  container.replaceChildren(
    ...ENTRIES.map(({ label, tile, ascii }) => {
      const item = document.createElement('span');
      item.className = 'legend-item';
      const swatch = document.createElement('span');
      if (rendererId === 'dom') {
        swatch.className = `${tileClasses(tile)} legend-swatch`;
      } else {
        swatch.className = 'legend-ascii';
        swatch.textContent = ascii;
      }
      item.append(swatch, label);
      return item;
    }),
  );
}
