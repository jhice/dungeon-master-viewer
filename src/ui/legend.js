// Legend of tile types, drawn with the active renderer's own visuals.

import { ASCII_SYMBOLS } from '../render/ascii/ascii-renderer.js';
import { tileClasses } from '../render/dom/dom-renderer.js';

const ENTRIES = [
  { label: 'wall', tile: { type: 'wall' }, ascii: ASCII_SYMBOLS.wall },
  { label: 'floor', tile: { type: 'floor' }, ascii: ASCII_SYMBOLS.floor },
  { label: 'pit', tile: { type: 'pit', detail: { open: true } }, ascii: ASCII_SYMBOLS.pit },
  { label: 'stairs up', tile: { type: 'stairs', detail: { direction: 'up', orientation: 'NS' } }, ascii: ASCII_SYMBOLS.stairsUp },
  { label: 'stairs down', tile: { type: 'stairs', detail: { direction: 'down', orientation: 'NS' } }, ascii: ASCII_SYMBOLS.stairsDown },
  { label: 'door', tile: { type: 'door', detail: { orientation: 'NS', open: false } }, ascii: ASCII_SYMBOLS.door },
  { label: 'teleporter', tile: { type: 'teleporter' }, ascii: ASCII_SYMBOLS.teleporter },
  { label: 'fake wall', tile: { type: 'fakewall', detail: { open: false } }, ascii: ASCII_SYMBOLS.fakewall },
];

// Extra entries shown when states are displayed (2D/3D only: ASCII ignores states).
const STATE_ENTRIES = [
  { label: 'door open', tile: { type: 'door', detail: { orientation: 'NS', open: true } } },
  { label: 'pit closed', tile: { type: 'pit', detail: { open: false } } },
  { label: 'pit invisible', tile: { type: 'pit', detail: { open: false, invisible: true } } },
  { label: 'fake wall imaginary', tile: { type: 'fakewall', detail: { open: false, imaginary: true } } },
  { label: 'fake wall open', tile: { type: 'fakewall', detail: { open: true } } },
];

export function renderLegend(container, rendererId, { showStates = false } = {}) {
  const graphic = rendererId !== 'ascii';
  container.classList.toggle('show-states', graphic && showStates);
  const entries = graphic && showStates ? [...ENTRIES, ...STATE_ENTRIES] : ENTRIES;
  container.replaceChildren(
    ...entries.map(({ label, tile, ascii }) => {
      const item = document.createElement('span');
      item.className = 'legend-item';
      const swatch = document.createElement('span');
      if (graphic) {
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
