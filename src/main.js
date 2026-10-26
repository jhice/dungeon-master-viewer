import { loadDungeon } from './core/dungeon.js';
import { describeState } from './core/tile-states.js';
import { tileContents, buildInventory } from './core/contents.js';
import { buildLogic, describeActuator, describeTeleporter, actuatorFamily } from './core/logic.js';
import { FAMILY_COLORS, TELEPORTER_COLORS } from './render/palette.js';
import { createAsciiRenderer } from './render/ascii/ascii-renderer.js';
import { createDomRenderer } from './render/dom/dom-renderer.js';
import { bindKeys } from './ui/keyboard.js';
import { renderLegend } from './ui/legend.js';
import { createControlPanel } from './ui/control-panel.js';
import { createInventoryPanel } from './ui/inventory-panel.js';
import { createTooltip } from './ui/tooltip.js';
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
const BASE_HINT = '↑/↓ niveau · Début/Fin · R renderer · clic : sélection (Échap) · I inventaire';
const MIN_CELL = 6;
const MAX_CELL = 48;

const viewWrap = document.getElementById('view-wrap'); // holds the view and the control panel
const view = document.getElementById('view');
const label = document.getElementById('level-label');
const hint = document.getElementById('hint');
const status = document.getElementById('status');
const legend = document.getElementById('legend');

const dungeon = await loadDungeon('./data/dungeon.json');
const prefs = loadPreferences({
  renderer: 'dom',
  level: 0,
  frame: 'global',
  cell: null,
  showStates: true,
  showItems: true,
  showCreatures: true,
  showMechanisms: true,
  allLinks: false,
  panelOpen: true,
  inventoryOpen: false,
});
if (!RENDERERS[prefs.renderer]) prefs.renderer = 'dom';
prefs.level = Math.min(Math.max(0, prefs.level), dungeon.levelCount - 1);

let renderer = null;
let mounting = null; // pending async creation, to ignore keys meanwhile
let panel = null; // control panel, rebuilt for each renderer
let selection = null; // selected tile { level, x, y }: its logic links are drawn
const logic = buildLogic(dungeon);

// Right-hand column: control panel (per renderer) above the inventory (persistent).
const side = document.createElement('div');
side.className = 'side-panels';
const controlsSlot = document.createElement('div');
side.append(controlsSlot);
viewWrap.append(side);

const tooltip = createTooltip();
const creatureTypes = new Map(Object.entries(dungeon.data.catalog.creature).map(([type, name]) => [name, Number(type)]));
const inventory = createInventoryPanel(side, buildInventory(dungeon), {
  levelCount: dungeon.levelCount,
  creatureType: (name) => creatureTypes.get(name),
  onLocate: locate,
  open: prefs.inventoryOpen,
  onToggle: (open) => {
    prefs.inventoryOpen = open;
    savePreferences(prefs);
  },
});

const layers = () => ({ items: prefs.showItems, creatures: prefs.showCreatures, mechanisms: prefs.showMechanisms });

async function mountRenderer() {
  const level = renderer?.currentLevel ?? prefs.level;
  renderer?.dispose();
  renderer = null;
  panel?.dispose();
  panel = null;
  const id = prefs.renderer;
  view.dataset.renderer = id;
  status.textContent = `Chargement du renderer ${RENDERERS[id].label}…`;
  mounting = (async () => {
    try {
      return await RENDERERS[id].create(view, dungeon, {
        frame: prefs.frame,
        showStates: prefs.showStates,
        layers: layers(),
        settings: prefs.settings?.[id],
        onHover: showHover,
        onInfo: showInfo,
        onRequestLevel: showLevel,
        onSelect: select,
        onFollow: follow,
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
  panel = createControlPanel(controlsSlot, panelSchema(), panelValues(), onPanelChange, {
    open: prefs.panelOpen,
    onToggle: (open) => {
      prefs.panelOpen = open;
      savePreferences(prefs);
    },
  });
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
  if (selection && selection.level !== level) selection = null;
  refreshLinks();
  showHover(null);
  panel?.refresh();
}

// --- Logic: selection and links ---------------------------------------------------
// Drawn links: every link of the level ("Tous les liens"), or those of the selection.
function refreshLinks() {
  if (!renderer?.showLinks) return;
  let links = [];
  if (prefs.allLinks && prefs.showMechanisms) links = logic.linksOfLevel(renderer.currentLevel);
  else if (selection) links = [...logic.outgoing(selection.level, selection.x, selection.y), ...logic.incoming(selection.level, selection.x, selection.y)];
  renderer.showLinks(links, selection);
}

function select(info) {
  const same = selection && selection.level === info.level && selection.x === info.x && selection.y === info.y;
  selection = same ? null : { level: info.level, x: info.x, y: info.y };
  refreshLinks();
  if (!selection) return showInfo('Sélection annulée');
  const out = logic.outgoing(info.level, info.x, info.y).length;
  const into = logic.incoming(info.level, info.x, info.y).length;
  showInfo(`Sélection : niveau ${info.level} (${info.x}, ${info.y}) · ${info.type} — ${out} lien(s) sortant(s), ${into} entrant(s)`);
}

// Cross-level link label clicked: go to the other end and select it.
function follow(to) {
  showLevel(to.level);
  select({ ...to, type: dungeon.tileAt(to.level, to.x, to.y)?.type ?? '?' });
  renderer.highlightTile?.(to.x, to.y);
}

// Tooltip lines for the actuators and teleporter of a tile.
function mechanismLines(info) {
  if (!prefs.showMechanisms) return [];
  const lines = logic.actuatorsAt(info.level, info.x, info.y).map((a) => ({
    color: FAMILY_COLORS[actuatorFamily(a)],
    ...describeActuator(dungeon, a),
  }));
  const teleporter = logic.teleporterAt(info.level, info.x, info.y);
  if (teleporter) lines.push({ color: TELEPORTER_COLORS[teleporter.scope], ...describeTeleporter(dungeon, teleporter) });
  const into = logic.incoming(info.level, info.x, info.y);
  if (into.length) {
    const sources = into.map((l) => (l.from.level === info.level ? `(${l.from.x}, ${l.from.y})` : `N${l.from.level} (${l.from.x}, ${l.from.y})`));
    lines.push({ color: '#ffffff', title: `Déclenché par ${into.length} source(s)`, details: [sources.slice(0, 6).join(' · ') + (sources.length > 6 ? ' …' : '')] });
  }
  return lines;
}

function showHover(info) {
  if (!info) {
    status.textContent = ' ';
    tooltip.hide();
    return;
  }
  if (renderer?.setLayers) {
    const contents = tileContents(dungeon, info.level, info.x, info.y);
    tooltip.show(`Niveau ${info.level} (${info.x}, ${info.y}) · ${info.type}`, contents, {
      ...layers(),
      onWall: info.type === 'wall',
      mechanisms: mechanismLines(info),
    });
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

function setShowStates(enabled) {
  // ASCII renders types only: no states there.
  if (!renderer.setShowStates) return;
  prefs.showStates = enabled;
  savePreferences(prefs);
  renderer.setShowStates(enabled);
  renderLegend(legend, prefs.renderer, { showStates: enabled });
  panel?.setValues({ showStates: enabled });
  showInfo(`États des tuiles : ${enabled ? 'affichés' : 'masqués'}`);
}

// Settings of the active renderer, saved per renderer id (prefs.settings.three…).
function changeSettings(changes) {
  if (!renderer?.applySettings) return;
  renderer.applySettings(changes);
  prefs.settings = { ...prefs.settings, [prefs.renderer]: renderer.settings };
  savePreferences(prefs);
  panel?.setValues(changes);
}

function setLayer(key, enabled) {
  if (!renderer.setLayers) return;
  prefs[key] = enabled;
  savePreferences(prefs);
  renderer.setLayers(layers());
  panel?.setValues({ [key]: enabled });
  refreshLinks();
  const names = { showItems: 'Objets', showCreatures: 'Créatures', showMechanisms: 'Mécanismes' };
  showInfo(`${names[key]} : ${enabled ? 'affichés' : 'masqués'}`);
}

function setAllLinks(enabled) {
  prefs.allLinks = enabled;
  savePreferences(prefs);
  refreshLinks();
  panel?.setValues({ allLinks: enabled });
  showInfo(`Tous les liens du niveau : ${enabled ? 'affichés' : 'sélection seule'}`);
}

// Inventory click: go to the level and point at the tile.
function locate(entry) {
  if (!renderer) return;
  showLevel(entry.level);
  renderer.highlightTile?.(entry.x, entry.y);
  showInfo(`${entry.name} — niveau ${entry.level} (${entry.x}, ${entry.y})${entry.inside ? `, dans ${entry.inside}` : ''}`);
}

function setFrame(global) {
  if (RENDERERS[prefs.renderer].frameless) return;
  prefs.frame = global ? 'global' : 'local';
  mountRenderer(); // the panel is rebuilt with the new value
}

// --- Control panel -------------------------------------------------------------
// Common controls first, then the renderer's own settings.
function panelSchema() {
  const schema = [
    {
      type: 'buttons',
      items: [
        { label: '▲ Haut', title: 'Niveau précédent (↑)', action: () => go(-1), disabled: () => renderer.currentLevel === 0 },
        { label: '▼ Bas', title: 'Niveau suivant (↓)', action: () => go(+1), disabled: () => renderer.currentLevel === dungeon.levelCount - 1 },
      ],
    },
  ];
  if (renderer.setShowStates) schema.push({ type: 'checkbox', key: 'showStates', label: 'États des tuiles', shortcut: 'S' });
  if (renderer.setLayers) {
    schema.push({ type: 'checkbox', key: 'showItems', label: 'Objets', shortcut: 'O' });
    schema.push({ type: 'checkbox', key: 'showCreatures', label: 'Créatures', shortcut: 'C' });
    schema.push({ type: 'checkbox', key: 'showMechanisms', label: 'Mécanismes', shortcut: 'M' });
    schema.push({ type: 'checkbox', key: 'allLinks', label: 'Tous les liens (sinon sélection)', shortcut: 'T' });
  }
  if (!RENDERERS[prefs.renderer].frameless) schema.push({ type: 'checkbox', key: 'frameGlobal', label: 'Repère global', shortcut: 'G' });
  return [...schema, ...(renderer.settingsSchema ?? [])];
}

const panelValues = () => ({
  showStates: prefs.showStates,
  showItems: prefs.showItems,
  showCreatures: prefs.showCreatures,
  showMechanisms: prefs.showMechanisms,
  allLinks: prefs.allLinks,
  frameGlobal: prefs.frame === 'global',
  ...renderer.settings,
});

function onPanelChange(changes) {
  const { showStates, showItems, showCreatures, showMechanisms, allLinks, frameGlobal, ...settings } = changes;
  if (showStates !== undefined) setShowStates(showStates);
  if (showItems !== undefined) setLayer('showItems', showItems);
  if (showCreatures !== undefined) setLayer('showCreatures', showCreatures);
  if (showMechanisms !== undefined) setLayer('showMechanisms', showMechanisms);
  if (allLinks !== undefined) setAllLinks(allLinks);
  if (frameGlobal !== undefined) setFrame(frameGlobal);
  if (Object.keys(settings).length) changeSettings(settings);
}

// Key -> toggle of a renderer checkbox setting declaring that shortcut (L, E in 3D).
function settingShortcut(key) {
  const field = renderer.settingsSchema?.find((f) => f.type === 'checkbox' && f.shortcut?.toLowerCase() === key);
  if (!field) return undefined;
  return () => {
    const enabled = !renderer.settings[field.key];
    changeSettings({ [field.key]: enabled });
    showInfo(`${field.label} : ${enabled ? 'oui' : 'non'}`);
  };
}

const GLOBAL_KEYS = {
  ArrowDown: () => go(+1),
  PageDown: () => go(+1),
  ArrowUp: () => go(-1),
  PageUp: () => go(-1),
  Home: () => showLevel(0),
  End: () => showLevel(dungeon.levelCount - 1),
  r: nextRenderer,
  g: () => setFrame(prefs.frame !== 'global'),
  s: () => setShowStates(!prefs.showStates),
  o: () => setLayer('showItems', !prefs.showItems),
  c: () => setLayer('showCreatures', !prefs.showCreatures),
  m: () => setLayer('showMechanisms', !prefs.showMechanisms),
  t: () => setAllLinks(!prefs.allLinks),
  Escape: () => selection && select(selection),
  i: () => inventory.toggle(),
  '+': () => zoom(+1),
  '=': () => zoom(+1),
  '-': () => zoom(-1),
  0: resetZoom,
};

bindKeys((key) => {
  if (mounting || !renderer) return undefined;
  const k = key.length === 1 ? key.toLowerCase() : key;
  return renderer.keys?.[k] ?? settingShortcut(k) ?? GLOBAL_KEYS[k];
});
window.addEventListener('resize', () => renderer && !renderer.zoom && prefs.cell === null && setCell(null));

mountRenderer();
