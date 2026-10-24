import { loadDungeon } from './core/dungeon.js';
import { describeState } from './core/tile-states.js';
import { createAsciiRenderer } from './render/ascii/ascii-renderer.js';
import { createDomRenderer } from './render/dom/dom-renderer.js';
import { bindKeys } from './ui/keyboard.js';
import { renderLegend } from './ui/legend.js';
import { loadPreferences, savePreferences } from './ui/preferences.js';

// `create` may be async: the 3D renderer is loaded on demand (Three.js comes from a CDN).
const RENDERERS = {
  dom: { label: '2D', create: (container, dungeon, opts) => createDomRenderer(container, dungeon, opts) },
  three: {
    label: '3D',
    frameless: true, // always shows every level in the global frame
    create: async (container, dungeon, opts) => (await import('./render/three/three-renderer.js')).createThreeRenderer(container, dungeon, opts),
  },
  ascii: { label: 'ASCII', create: (container, dungeon, opts) => createAsciiRenderer(container, dungeon, { ...opts, wide: true }) },
};
const BASE_HINT = '↑/↓ niveau · Début/Fin · R renderer · S états';
const MIN_CELL = 6;
const MAX_CELL = 48;

const view = document.getElementById('view');
const label = document.getElementById('level-label');
const hint = document.getElementById('hint');
const status = document.getElementById('status');
const legend = document.getElementById('legend');

const dungeon = await loadDungeon('./data/dungeon.json');
const prefs = loadPreferences({ renderer: 'dom', level: 0, frame: 'global', cell: null, showStates: true });
if (!RENDERERS[prefs.renderer]) prefs.renderer = 'dom';
prefs.level = Math.min(Math.max(0, prefs.level), dungeon.levelCount - 1);

let renderer = null;
let mounting = null; // pending async creation, to ignore keys meanwhile

async function mountRenderer() {
  const level = renderer?.currentLevel ?? prefs.level;
  renderer?.dispose();
  renderer = null;
  const id = prefs.renderer;
  view.dataset.renderer = id;
  status.textContent = `Chargement du renderer ${RENDERERS[id].label}…`;
  mounting = (async () => {
    try {
      return await RENDERERS[id].create(view, dungeon, {
        frame: prefs.frame,
        showStates: prefs.showStates,
        onHover: showHover,
        onInfo: showInfo,
      });
    } catch (error) {
      console.error(error);
      status.textContent = `Renderer ${RENDERERS[id].label} indisponible : ${error.message}`;
      return null;
    }
  })();
  const created = await mounting;
  mounting = null;
  if (!created) {
    if (id !== 'dom') {
      // e.g. CDN unreachable for Three.js: fall back to 2D.
      prefs.renderer = 'dom';
      return mountRenderer();
    }
    return;
  }
  renderer = created;
  renderLegend(legend, id === 'ascii' ? 'ascii' : 'dom', { showStates: prefs.showStates });
  hint.textContent = renderer.keyHint ? `${BASE_HINT} · ${renderer.keyHint}` : `${BASE_HINT} · G repère · +/− zoom · 0 ajuster`;
  showLevel(level);
  if (!renderer.zoom) setCell(prefs.cell);
}

function showLevel(level) {
  renderer.showLevel(level);
  prefs.level = level;
  savePreferences(prefs);
  const m = dungeon.level(level);
  const frameLabel = RENDERERS[prefs.renderer].frameless ? '' : `, repère ${prefs.frame}`;
  label.textContent =
    `Niveau ${level} / ${dungeon.levelCount - 1} — ${m.width}×${m.height}, offset (${m.offset.x}, ${m.offset.y})` +
    ` — ${RENDERERS[prefs.renderer].label}${frameLabel}`;
  showHover(null);
}

function showHover(info) {
  if (!info) {
    status.textContent = ' ';
    return;
  }
  let text = `niveau ${info.level} · (${info.x}, ${info.y}) local · [${info.gx}, ${info.gy}] global · ${info.type}`;
  if (info.type === 'stairs') text += ` ${info.detail.direction === 'up' ? '↑ vers' : '↓ vers'} niveau ${info.level + (info.detail.direction === 'up' ? -1 : 1)}`;
  if (info.type === 'door' || info.type === 'stairs') text += ` · axe ${info.detail.orientation}`;
  const state = prefs.showStates && info.detail ? describeState(info.type, info.detail) : null;
  if (state) text += ` · ${state}`;
  status.textContent = text;
}

function showInfo(text) {
  status.textContent = text;
}

// Zoom for the CSS renderers: --cell drives the tile size (2D) and the font size (ASCII).
function fitCell() {
  const b = dungeon.bounds;
  const map = dungeon.level(renderer?.currentLevel ?? prefs.level);
  const cols = prefs.frame === 'global' ? b.maxX - b.minX : map.width;
  const rows = prefs.frame === 'global' ? b.maxY - b.minY : map.height;
  const size = Math.floor(Math.min((view.clientWidth - 32) / cols, (view.clientHeight - 32) / rows));
  return Math.min(MAX_CELL, Math.max(MIN_CELL, size));
}

function setCell(size) {
  prefs.cell = size === null ? null : Math.min(MAX_CELL, Math.max(MIN_CELL, size));
  view.style.setProperty('--cell', `${prefs.cell ?? fitCell()}px`);
  savePreferences(prefs);
}

const currentCell = () => Number.parseFloat(view.style.getPropertyValue('--cell')) || fitCell();
const zoom = (step) => (renderer.zoom ? renderer.zoom(step) : setCell(currentCell() + 2 * step));
const resetZoom = () => (renderer.resetView ? renderer.resetView() : setCell(null));

const go = (delta) => {
  const next = Math.min(dungeon.levelCount - 1, Math.max(0, renderer.currentLevel + delta));
  if (next !== renderer.currentLevel) showLevel(next);
};

function nextRenderer() {
  const ids = Object.keys(RENDERERS);
  prefs.renderer = ids[(ids.indexOf(prefs.renderer) + 1) % ids.length];
  mountRenderer();
}

function toggleStates() {
  // ASCII renders types only: the key does nothing there.
  if (!renderer.setShowStates) return;
  prefs.showStates = !prefs.showStates;
  savePreferences(prefs);
  renderer.setShowStates(prefs.showStates);
  renderLegend(legend, prefs.renderer, { showStates: prefs.showStates });
  showInfo(`États des tuiles : ${prefs.showStates ? 'affichés' : 'masqués'}`);
}

function toggleFrame() {
  if (RENDERERS[prefs.renderer].frameless) return;
  prefs.frame = prefs.frame === 'global' ? 'local' : 'global';
  mountRenderer();
}

const GLOBAL_KEYS = {
  ArrowDown: () => go(+1),
  PageDown: () => go(+1),
  ArrowUp: () => go(-1),
  PageUp: () => go(-1),
  Home: () => showLevel(0),
  End: () => showLevel(dungeon.levelCount - 1),
  r: nextRenderer,
  g: toggleFrame,
  s: toggleStates,
  '+': () => zoom(+1),
  '=': () => zoom(+1),
  '-': () => zoom(-1),
  0: resetZoom,
};

bindKeys((key) => {
  if (mounting || !renderer) return undefined;
  const k = key.length === 1 ? key.toLowerCase() : key;
  return renderer.keys?.[k] ?? GLOBAL_KEYS[k];
});
window.addEventListener('resize', () => renderer && !renderer.zoom && prefs.cell === null && setCell(null));

mountRenderer();
