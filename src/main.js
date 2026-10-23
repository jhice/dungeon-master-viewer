import { loadDungeon } from './core/dungeon.js';
import { createAsciiRenderer } from './render/ascii/ascii-renderer.js';
import { createDomRenderer } from './render/dom/dom-renderer.js';
import { bindKeys } from './ui/keyboard.js';
import { renderLegend } from './ui/legend.js';
import { loadPreferences, savePreferences } from './ui/preferences.js';

const RENDERERS = {
  dom: { label: '2D', create: (container, dungeon, opts) => createDomRenderer(container, dungeon, opts) },
  ascii: { label: 'ASCII', create: (container, dungeon, opts) => createAsciiRenderer(container, dungeon, { ...opts, wide: true }) },
};
const MIN_CELL = 6;
const MAX_CELL = 48;

const view = document.getElementById('view');
const label = document.getElementById('level-label');
const status = document.getElementById('status');
const legend = document.getElementById('legend');

const dungeon = await loadDungeon('./data/dungeon.json');
const prefs = loadPreferences({ renderer: 'dom', level: 0, frame: 'global', cell: null });
if (!RENDERERS[prefs.renderer]) prefs.renderer = 'dom';
prefs.level = Math.min(Math.max(0, prefs.level), dungeon.levelCount - 1);

let renderer = null;

function mountRenderer() {
  const level = renderer?.currentLevel ?? prefs.level;
  renderer?.dispose();
  renderer = RENDERERS[prefs.renderer].create(view, dungeon, { frame: prefs.frame, onHover: showHover });
  renderLegend(legend, prefs.renderer);
  showLevel(level);
}

function showLevel(level) {
  renderer.showLevel(level);
  prefs.level = level;
  savePreferences(prefs);
  const m = dungeon.level(level);
  label.textContent =
    `Niveau ${level} / ${dungeon.levelCount - 1} — ${m.width}×${m.height}, offset (${m.offset.x}, ${m.offset.y})` +
    ` — ${RENDERERS[prefs.renderer].label}, repère ${prefs.frame}`;
  showHover(null);
}

function showHover(info) {
  if (!info) {
    status.textContent = ' ';
    return;
  }
  let text = `(${info.x}, ${info.y}) local · [${info.gx}, ${info.gy}] global · ${info.type}`;
  if (info.type === 'stairs') text += ` ${info.detail.direction === 'up' ? '↑ vers' : '↓ vers'} niveau ${info.level + (info.detail.direction === 'up' ? -1 : 1)}`;
  if (info.type === 'door' || info.type === 'stairs') text += ` · axe ${info.detail.orientation}`;
  status.textContent = text;
}

// Zoom: --cell drives both renderers (tile size in 2D, font size in ASCII).
function fitCell() {
  const b = dungeon.bounds;
  const cols = prefs.frame === 'global' ? b.maxX - b.minX : dungeon.level(renderer?.currentLevel ?? prefs.level).width;
  const rows = prefs.frame === 'global' ? b.maxY - b.minY : dungeon.level(renderer?.currentLevel ?? prefs.level).height;
  const available = view.getBoundingClientRect();
  const size = Math.floor(Math.min((available.width - 32) / cols, (window.innerHeight - available.top - 48) / rows));
  return Math.min(MAX_CELL, Math.max(MIN_CELL, size));
}

function setCell(size) {
  prefs.cell = size === null ? null : Math.min(MAX_CELL, Math.max(MIN_CELL, size));
  view.style.setProperty('--cell', `${prefs.cell ?? fitCell()}px`);
  savePreferences(prefs);
}

const currentCell = () => Number.parseFloat(view.style.getPropertyValue('--cell')) || fitCell();
const go = (delta) => {
  const next = Math.min(dungeon.levelCount - 1, Math.max(0, renderer.currentLevel + delta));
  if (next !== renderer.currentLevel) showLevel(next);
};

function nextRenderer() {
  const ids = Object.keys(RENDERERS);
  prefs.renderer = ids[(ids.indexOf(prefs.renderer) + 1) % ids.length];
  mountRenderer();
}

function toggleFrame() {
  prefs.frame = prefs.frame === 'global' ? 'local' : 'global';
  mountRenderer();
  if (prefs.cell === null) setCell(null);
}

bindKeys({
  ArrowDown: () => go(+1),
  PageDown: () => go(+1),
  ArrowUp: () => go(-1),
  PageUp: () => go(-1),
  Home: () => showLevel(0),
  End: () => showLevel(dungeon.levelCount - 1),
  r: nextRenderer,
  R: nextRenderer,
  g: toggleFrame,
  G: toggleFrame,
  '+': () => setCell(currentCell() + 2),
  '=': () => setCell(currentCell() + 2),
  '-': () => setCell(currentCell() - 2),
  0: () => setCell(null),
});
window.addEventListener('resize', () => prefs.cell === null && setCell(null));

mountRenderer();
setCell(prefs.cell);
