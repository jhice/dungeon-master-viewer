import { loadDungeon } from './core/dungeon.js';
import { describeState } from './core/tile-states.js';
import { tileContents, buildInventory } from './core/contents.js';
import { buildLogic, describeActuator, describeTeleporter, actuatorFamily } from './core/logic.js';
import { buildTexts, textsAt, championSummary } from './core/texts.js';
import { FACE_LABELS } from './core/contents.js';
import { FAMILY_COLORS, TELEPORTER_COLORS, TEXT_COLORS } from './render/palette.js';
import { createAsciiRenderer } from './render/ascii/ascii-renderer.js';
import { createDomRenderer } from './render/dom/dom-renderer.js';
import { bindKeys } from './ui/keyboard.js';
import { renderLegend } from './ui/legend.js';
import { createControlPanel } from './ui/control-panel.js';
import { createInventoryPanel } from './ui/inventory-panel.js';
import { createTooltip } from './ui/tooltip.js';
import { createTextsPanel } from './ui/texts-panel.js';
import { loadPreferences, savePreferences } from './ui/preferences.js';
import { createGameWindow } from './ui/game-window.js';
import { createSimulation } from './sim/simulation.js';
import { createControls } from './sim/controls.js';
import { BLOCK_LABELS } from './sim/rules.js';

// `create` may be async: the 3D renderer is loaded on demand (Three.js comes from a CDN).
const RENDERERS = {
  dom: { label: '2D', create: (container, dungeon, opts) => createDomRenderer(container, dungeon, opts) },
  three: {
    label: '3D',
    frameless: true, // always shows every level in the global frame
    create: async (container, dungeon, opts) => (await import('./render/three/three-renderer.js')).createThreeRenderer(container, dungeon, opts),
  },
  // Out of the R rotation (docs/012-simulation.md): kept for the command-line tool.
  ascii: { label: 'ASCII', hidden: true, create: (container, dungeon, opts) => createAsciiRenderer(container, dungeon, { ...opts, wide: true }) },
};
const BASE_HINT = 'Début/Fin · R renderer · clic : sélection (Échap) · I inventaire · J textes · P jeu · F y aller · Espace / clic dans la vue : actionner';
// ↑/↓ change the level outside the game, and move the party in the game.
const LEVEL_HINT = { viewer: '↑/↓ ou Maj + molette : niveau', game: 'jeu : ZQSD + A/E (AZERTY), flèches, pavé num. · PgPréc/PgSuiv ou Maj + molette : niveau' };
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
  frame: 'local',
  autoFit: true, // 2D/ASCII: fit the zoom to the level after each level change (local frame)
  alwaysTooltip: true, // tooltip even on empty tiles (tile info of the status bar)
  cell: null,
  showStates: true,
  showItems: true,
  showCreatures: true,
  showMechanisms: true,
  showTexts: true,
  allLinks: false,
  textsOpen: false,
  panelOpen: true,
  inventoryOpen: false,
  playing: false, // the game window is open
  gameLayout: null, // its position and width
});
if (!RENDERERS[prefs.renderer]) prefs.renderer = 'dom';
prefs.level = Math.min(Math.max(0, prefs.level), dungeon.levelCount - 1);

let renderer = null;
let mounting = null; // pending async creation, to ignore keys meanwhile
let panel = null; // control panel, rebuilt for each renderer
let selection = null; // selected tile { level, x, y }: its logic links are drawn
const logic = buildLogic(dungeon);
const texts = buildTexts(dungeon);

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

const textsPanel = createTextsPanel(side, texts, {
  onLocate: (t) => locate({ name: t.champion?.name ?? t.text.split('\n')[0], level: t.level, x: t.x, y: t.y, inside: t.inside }),
  open: prefs.textsOpen,
  onToggle: (open) => {
    prefs.textsOpen = open;
    savePreferences(prefs);
  },
});

const layers = () => ({
  items: prefs.showItems,
  creatures: prefs.showCreatures,
  mechanisms: prefs.showMechanisms,
  texts: prefs.showTexts,
});

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
        onStepLevel: go,
        onSettingsChange: saveRendererSettings,
        onSelect: select,
        onFollow: follow,
        tileAt: sim.state.tileAt, // tiles in their current state (simulation)
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
  renderer.setParty?.(game ? sim.party : null);
  updateHint();
  showLevel(game ? sim.party.level : level);
  if (!renderer.zoom) setCell(prefs.cell);
}

function updateHint() {
  const own = renderer.keyHint ?? 'G repère · +/− zoom · 0 ajuster';
  hint.textContent = `${LEVEL_HINT[game ? 'game' : 'viewer']} · ${BASE_HINT} · ${own}`;
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
  // 2D/ASCII in the local frame: re-fit the zoom to the new level (the 3D renderer has its own setting).
  if (!renderer.zoom && prefs.frame === 'local' && prefs.autoFit) setCell(null);
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

function select(info, { navigate = true } = {}) {
  // Clicking stairs takes to the other end, as the labels of teleporters do.
  if (navigate && info.type === 'stairs') {
    const to = stairsTarget(info);
    if (to) return follow(to);
  }
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
  select({ ...to, type: dungeon.tileAt(to.level, to.x, to.y)?.type ?? '?' }, { navigate: false });
  renderer.highlightTile?.(to.x, to.y);
}

// Other end of a staircase: same global coordinates on the level above or below.
function stairsTarget(info) {
  const level = info.level + (info.detail.direction === 'up' ? -1 : 1);
  const map = dungeon.level(level);
  if (!map) return null;
  return { level, x: info.gx - map.offset.x, y: info.gy - map.offset.y };
}

// Tooltip lines for the texts of a tile: inscription / message in full, champion sheet decoded.
function textLines(info) {
  if (!prefs.showTexts) return [];
  return textsAt(texts, info.level, info.x, info.y).map((t) => {
    if (t.champion) {
      return { color: TEXT_COLORS.champion, title: `Champion : ${t.champion.name}, ${t.champion.title}`, details: championSummary(t.champion) };
    }
    const face = t.onWall ? ` (${FACE_LABELS[t.position]})` : '';
    const title = t.kind === 'message' ? `Message${face} — affiché par un mécanisme` : `Inscription${face}`;
    return { color: TEXT_COLORS[t.kind], title, details: t.text.split('\n') };
  });
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
  const text = tileSummary(info);
  status.textContent = text;
  if (renderer?.setLayers) {
    const contents = tileContents(dungeon, info.level, info.x, info.y);
    // The tooltip title repeats the status bar, so it is useful even on an empty tile.
    tooltip.show(text, contents, {
      ...layers(),
      onWall: info.type === 'wall',
      mechanisms: [...textLines(info), ...mechanismLines(info)],
      always: prefs.alwaysTooltip,
    });
  }
}

// One-line description of a tile (status bar, tooltip title).
function tileSummary(info) {
  let text = `niveau ${info.level} · (${info.x}, ${info.y}) local · [${info.gx}, ${info.gy}] global · ${info.type}`;
  if (info.type === 'stairs') text += ` ${info.detail.direction === 'up' ? '↑ vers' : '↓ vers'} niveau ${info.level + (info.detail.direction === 'up' ? -1 : 1)} (clic)`;
  if (info.type === 'door' || info.type === 'stairs') text += ` · axe ${info.detail.orientation}`;
  const state = prefs.showStates && info.detail ? describeState(info.type, info.detail) : null;
  if (state) text += ` · ${state}`;
  return text;
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
  // The right-hand panels overlay the view: keep the map beside them.
  const width = view.clientWidth - 32 - side.offsetWidth - 12;
  const size = Math.floor(Math.min(width / cols, (view.clientHeight - 32) / rows));
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
  const ids = Object.keys(RENDERERS).filter((id) => !RENDERERS[id].hidden);
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

// Settings changed by the renderer itself (e.g. the 3D display mode, key F).
function saveRendererSettings(settings) {
  prefs.settings = { ...prefs.settings, [prefs.renderer]: settings };
  savePreferences(prefs);
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
  const names = { showItems: 'Objets', showCreatures: 'Créatures', showMechanisms: 'Mécanismes', showTexts: 'Textes' };
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
        { label: '▶ Jeu', title: 'Ouvrir / fermer la simulation (P)', action: () => (game ? closeGame() : openGame()) },
      ],
    },
  ];
  if (renderer.setShowStates) schema.push({ type: 'checkbox', key: 'showStates', label: 'États des tuiles', shortcut: 'V' });
  if (renderer.setLayers) {
    schema.push({ type: 'checkbox', key: 'showItems', label: 'Objets', shortcut: 'O' });
    schema.push({ type: 'checkbox', key: 'showCreatures', label: 'Créatures', shortcut: 'C' });
    schema.push({ type: 'checkbox', key: 'showMechanisms', label: 'Mécanismes', shortcut: 'K' });
    schema.push({ type: 'checkbox', key: 'showTexts', label: 'Textes', shortcut: 'X' });
    schema.push({ type: 'checkbox', key: 'allLinks', label: 'Tous les liens (sinon sélection)', shortcut: 'T' });
  }
  if (renderer.setLayers) schema.push({ type: 'checkbox', key: 'alwaysTooltip', label: 'Toujours afficher l’infobulle' });
  if (!RENDERERS[prefs.renderer].frameless) {
    schema.push({ type: 'checkbox', key: 'frameGlobal', label: 'Repère global', shortcut: 'G' });
    schema.push({ type: 'checkbox', key: 'autoFit', label: 'Auto-ajustement (repère local)' });
  }
  return [...schema, ...(renderer.settingsSchema ?? [])];
}

const panelValues = () => ({
  showStates: prefs.showStates,
  showItems: prefs.showItems,
  showCreatures: prefs.showCreatures,
  showMechanisms: prefs.showMechanisms,
  showTexts: prefs.showTexts,
  allLinks: prefs.allLinks,
  frameGlobal: prefs.frame === 'global',
  alwaysTooltip: prefs.alwaysTooltip,
  autoFit: prefs.autoFit,
  ...renderer.settings,
});

function onPanelChange(changes) {
  const { showStates, showItems, showCreatures, showMechanisms, showTexts, allLinks, frameGlobal, alwaysTooltip, autoFit, ...settings } = changes;
  // Simple viewer preferences (no immediate effect beyond the next hover / level change).
  for (const [key, value] of Object.entries({ alwaysTooltip, autoFit })) {
    if (value === undefined) continue;
    prefs[key] = value;
    savePreferences(prefs);
    if (key === 'autoFit' && value && prefs.frame === 'local') setCell(null);
  }
  if (showStates !== undefined) setShowStates(showStates);
  if (showItems !== undefined) setLayer('showItems', showItems);
  if (showCreatures !== undefined) setLayer('showCreatures', showCreatures);
  if (showMechanisms !== undefined) setLayer('showMechanisms', showMechanisms);
  if (showTexts !== undefined) setLayer('showTexts', showTexts);
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
  v: () => setShowStates(!prefs.showStates), // S moves the party (simulation)
  o: () => setLayer('showItems', !prefs.showItems),
  c: () => setLayer('showCreatures', !prefs.showCreatures),
  k: () => setLayer('showMechanisms', !prefs.showMechanisms), // M: 3D display mode
  t: () => setAllLinks(!prefs.allLinks),
  Escape: () => selection && select(selection),
  i: () => inventory.toggle(),
  j: () => textsPanel.toggle(),
  x: () => setLayer('showTexts', !prefs.showTexts),
  '+': () => zoom(+1),
  '=': () => zoom(+1),
  '-': () => zoom(-1),
  0: resetZoom,
  p: () => (game ? closeGame() : openGame()),
  f: teleportToSelection,
};

bindKeys((key, event) => {
  if (mounting || !renderer) return undefined;
  // In the game, movement keys (by physical key) come first; Space clicks in front of the party.
  const move = game && moveKey(event);
  if (move) return move;
  if (game && event.code === 'Space') return clickFront;
  const k = key.length === 1 ? key.toLowerCase() : key;
  return renderer.keys?.[k] ?? settingShortcut(k) ?? GLOBAL_KEYS[k];
});
window.addEventListener('resize', () => renderer && !renderer.zoom && prefs.cell === null && setCell(null));

// --- Simulation (docs/012-simulation.md) -------------------------------------------
// One simulation shared by every view: the first-person window, and the party
// marker of the 2D/3D renderers, whose shown level follows the party.
const sim = createSimulation(dungeon);
// Duration of a game tick (actuator delays are in ticks). About 1/6 s in DM, to be checked.
const TICK_MS = 1000 / 6;
const moveKey = createControls((command) => sim.command(command));
let game = null; // { window, view } while the game window is open
let opening = false;

async function openGame() {
  if (game || opening) return;
  opening = true;
  const win = createGameWindow({
    layout: prefs.gameLayout ?? undefined,
    onLayoutChange: (layout) => {
      prefs.gameLayout = layout;
      savePreferences(prefs);
    },
    onClose: closeGame,
    onReset: () => sim.reset(),
  });
  try {
    const { createFirstPersonRenderer } = await import('./render/first-person/fp-renderer.js');
    game = { window: win, view: createFirstPersonRenderer(win.viewport, dungeon, sim.state, { onClickFront: clickFront }) };
    game.clock = setInterval(() => sim.tick(), TICK_MS);
  } catch (error) {
    console.error(error);
    win.dispose();
    showInfo(`Vue à la première personne indisponible : ${error.message}`);
    return;
  } finally {
    opening = false;
  }
  prefs.playing = true;
  savePreferences(prefs);
  updateHint();
  showParty(sim.party);
}

function closeGame() {
  if (!game) return;
  clearInterval(game.clock);
  game.view.dispose();
  game.window.dispose();
  game = null;
  prefs.playing = false;
  savePreferences(prefs);
  renderer?.setParty?.(null);
  if (renderer) updateHint();
}

// F: the party jumps to the selected tile (to test a place directly), facing unchanged.
async function teleportToSelection() {
  if (!selection) return showInfo('F : sélectionnez d’abord une case (clic)');
  const target = selection;
  if (!game) await openGame();
  const blocked = sim.teleport(target.level, target.x, target.y);
  if (blocked) showInfo(`F : case infranchissable (${BLOCK_LABELS[blocked]})`);
}

// Click on the wall or door in front of the party (mouse in the view, or Space).
function clickFront() {
  const { target, fired } = sim.clickFront();
  if (!fired) showInfo(target === 'wall' || target === 'door' ? 'Rien ne se passe' : 'Rien à actionner devant');
}

const FACING_LABELS = { N: 'nord', E: 'est', S: 'sud', W: 'ouest' };

function showParty(party) {
  if (!game) return;
  game.view.setParty(party);
  game.window.setStatus(`niveau ${party.level} · (${party.x}, ${party.y}) · face ${FACING_LABELS[party.facing]}`);
  game.window.setReading(sim.facedTexts().join('\n\n') || null);
  if (!renderer) return; // being mounted: mountRenderer() places the party
  if (renderer.currentLevel !== party.level) showLevel(party.level);
  renderer.setParty?.(party);
}

sim.on('partyMoved', ({ party, effects, loop }) => {
  showParty(party);
  if (effects?.length) showInfo(effects.map(describeEffect).join(' · ') + (loop ? ' · boucle interrompue' : ''));
});

// Status bar text of an arrival effect (stairs, pit, teleporter), see src/sim/rules.js.
function describeEffect({ type, direction, party, detail }) {
  const where = `niveau ${party.level} (${party.x}, ${party.y})`;
  if (type === 'stairs') return `Escalier ${direction === 'down' ? '↓' : '↑'} → ${where}`;
  if (type === 'fall') return `Chute → ${where}`;
  const same = detail.at.map === party.level && detail.at.x === party.x && detail.at.y === party.y;
  return same ? `Téléporteur : rotation, face ${FACING_LABELS[party.facing]}` : `Téléporteur → ${where}, face ${FACING_LABELS[party.facing]}`;
}
sim.on('reset', ({ party }) => {
  showParty(party);
  // Every tile may have changed: redraw the views.
  if (renderer) mountRenderer();
  for (let level = 0; level < dungeon.levelCount; level++) game?.view.updateTile(level);
});

// A mechanism changed a tile: redraw it everywhere and say so.
const STATE_WORDS = {
  door: ['Porte', 'ouverte', 'fermée'],
  pit: ['Trappe', 'ouverte', 'fermée'],
  teleporter: ['Téléporteur', 'activé', 'désactivé'],
  fakewall: ['Faux mur', 'disparu', 'revenu'],
};
sim.on('tileChanged', ({ level, x, y, type, detail }) => {
  game?.view.updateTile(level);
  renderer?.updateTile?.(level, x, y);
  const [name, open, closed] = STATE_WORDS[type];
  showInfo(`${name} (${x}, ${y}) niveau ${level} : ${detail.open ? open : closed}`);
});
// Messages: a text on a wall appears (or vanishes) on its face; a text on the floor is printed.
sim.on('textChanged', ({ level, onWall }) => {
  if (!onWall || !game) return;
  game.view.updateTile(level);
  game.window.setReading(sim.facedTexts().join('\n\n') || null);
});
sim.on('textShown', ({ index }) => game?.window.message(dungeon.data.texts[index].text.replaceAll('\n', ' ')));
sim.on('blocked', ({ reason }) => {
  game?.window.flash();
  showInfo(`Bloqué : ${BLOCK_LABELS[reason]}`);
});

mountRenderer();
if (prefs.playing) openGame();
