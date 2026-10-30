// 3D renderer: the 14 levels stacked at their global offsets, orbit camera.
// Same contract as the other renderers (src/render/renderer.js), plus optional
// zoom(step), resetView(), per-renderer key actions (`keys`, `keyHint`) and
// settings (`settingsSchema`, `settings`, `applySettings()`).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { assertRenderer } from '../renderer.js';
import { findConnections } from '../../core/connections.js';
import { buildLevelMeshes, disposeLevelMeshes, DEFAULT_WALL_HEIGHT } from './level-meshes.js';
import { buildLevelContents, buildLevelCreatures } from './level-contents.js';
import { readTheme } from './theme.js';
import { linkColor } from '../palette.js';
import { bindShiftWheel } from '../shift-wheel.js';

// `mode` (display mode, key F) is not in the panel but is kept with the other settings.
export const DEFAULT_SETTINGS = { levelGap: 5, wallHeight: DEFAULT_WALL_HEIGHT, links: true, labels: true, autoAdjust: true, mode: 'focus' };

// Shown in the control panel; checkboxes with a `shortcut` are toggled by that key (main.js).
const SETTINGS_SCHEMA = [
  // E, like W/A/S/D/Q, moves the party (simulation): labels moved to N.
  { key: 'links', label: 'Liens escaliers / trappes', type: 'checkbox', shortcut: 'L' },
  { key: 'labels', label: 'Étiquettes de niveau', type: 'checkbox', shortcut: 'N' },
  // Re-frame the camera on each level change, as the 0 key does.
  { key: 'autoAdjust', label: 'Auto-ajustement', type: 'checkbox' },
  { key: 'levelGap', label: 'Espacement des niveaux', type: 'range', min: 1.5, max: 10, step: 0.5, format: (v) => v.toFixed(1) },
  // 1 = a full cube; the original game is a corridor of tall walls.
  { key: 'wallHeight', label: 'Hauteur des murs', type: 'range', min: 0.1, max: 1, step: 0.05, format: (v) => `${Math.round(v * 100)} %` },
];

const FADED_OPACITY = 0.12;
// How non-focused levels are shown.
const DISPLAY_MODES = ['focus', 'all', 'solo'];
const DISPLAY_MODE_LABELS = { focus: 'niveau courant mis en avant', all: 'tous les niveaux', solo: 'niveau courant seul' };

/**
 * @param {HTMLElement} container
 * @param {import('../../core/dungeon.js').Dungeon} dungeon
 * @param {object} [options]
 * @param {boolean} [options.showStates=true] draw door/pit/fake wall states
 * @param {object} [options.settings] { levelGap, wallHeight, links, labels }, see DEFAULT_SETTINGS
 * @param {{ items?: boolean, creatures?: boolean, mechanisms?: boolean }} [options.layers] layers shown (default: all)
 * @param {(info: object) => void} [options.onSelect] a tile was clicked (without dragging)
 * @param {(info: object, event: PointerEvent) => void} [options.onContextMenu] a tile was right-clicked (without panning)
 * @param {(delta: number) => void} [options.onStepLevel] Shift + wheel: +1 = level below, -1 = level above
 * @param {(settings: object) => void} [options.onSettingsChange] settings changed by the renderer itself (key F)
 * @param {(info: object|null) => void} [options.onHover]
 * @param {(text: string) => void} [options.onInfo] short status messages (display mode…)
 * @param {(level: number) => void} [options.onRequestLevel] a level label was clicked
 * @param {(level, x, y) => object} [options.tileAt] tile source (default: the dungeon; main.js passes the simulation state)
 * @param {(level, x, y) => object|null} [options.contentsAt] contents of a tile (default: dungeon.json)
 */
export function createThreeRenderer(
  container,
  dungeon,
  { showStates = true, settings: initial, layers: initialLayers, onHover, onInfo, onRequestLevel, onSelect, onContextMenu, onStepLevel, onSettingsChange, tileAt, contentsAt } = {},
) {
  const settings = { ...DEFAULT_SETTINGS, ...initial };
  const layers = { items: true, creatures: true, mechanisms: true, texts: true, ...initialLayers };
  // Mesh layer -> visible. Markers of chests/possessions ('contents') follow either layer.
  const layerVisible = (layer) =>
    layer === undefined || (layer === 'contents' ? layers.items || layers.creatures : layers[layer]);
  const theme = readTheme();
  const b = dungeon.bounds;
  const center = { x: (b.minX + b.maxX) / 2, z: (b.minY + b.maxY) / 2 };
  const levelY = (level) => -level * settings.levelGap;
  // Scene-space centre of a level's own rectangle (where the camera aims).
  const levelCenter = (level) => {
    const m = dungeon.level(level);
    return new THREE.Vector3(m.offset.x + m.width / 2 - center.x, levelY(level), m.offset.y + m.height / 2 - center.z);
  };

  // --- Scene ------------------------------------------------------------------
  const canvasHost = document.createElement('div');
  canvasHost.className = 'three-view';
  container.append(canvasHost);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  canvasHost.append(renderer.domElement);

  // HTML overlay for the level labels (crisp text, CSS-styled, clickable).
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'three-labels';
  canvasHost.append(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.frame);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x202030, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 250;

  // --- Levels, links, labels ------------------------------------------------------
  // Levels are rebuilt when the wall height changes; only moved when the gap changes.
  let levels = [];
  function buildLevels() {
    for (const { group, meshes } of levels) {
      scene.remove(group);
      disposeLevelMeshes(meshes);
    }
    levels = Array.from({ length: dungeon.levelCount }, (_, i) => buildLevel(i));
  }

  function buildLevel(i) {
    const { group, meshes } = buildLevelMeshes(dungeon, i, theme, center, { wallHeight: settings.wallHeight, tileAt });
    for (const mesh of buildLevelContents(dungeon, i, center, { wallHeight: settings.wallHeight, contentsAt })) {
      group.add(mesh);
      meshes.push(mesh);
    }
    scene.add(group);
    return { group, meshes };
  }

  // A tile changed (simulation): rebuild its level only (about 2 ms, see 007).
  function rebuildLevel(i) {
    const old = levels[i];
    scene.remove(old.group);
    disposeLevelMeshes(old.meshes);
    levels[i] = buildLevel(i);
    levels[i].group.position.y = levelY(i);
    applyDisplayMode();
  }

  // Creatures moved (simulation): rebuild their meshes only, not the level.
  function rebuildCreatures(i) {
    const level = levels[i];
    const old = level.meshes.filter((mesh) => mesh.userData.creatures);
    for (const mesh of old) level.group.remove(mesh);
    disposeLevelMeshes(old);
    level.meshes = level.meshes.filter((mesh) => !mesh.userData.creatures);
    for (const mesh of buildLevelCreatures(dungeon, i, center, { wallHeight: settings.wallHeight, contentsAt })) {
      styleMesh(mesh, i === currentLevel);
      level.group.add(mesh);
      level.meshes.push(mesh);
    }
  }

  // One LineSegments per departure level, so solo mode can keep only the links of the shown level.
  const links = new THREE.Group();
  links.name = 'connections';
  scene.add(links);
  let linesByLevel = new Map();
  function buildLinks() {
    for (const lines of linesByLevel.values()) {
      links.remove(lines);
      lines.geometry.dispose();
      lines.material.dispose();
    }
    linesByLevel = buildConnectionLines(dungeon, center, levelY, settings.wallHeight);
    for (const lines of linesByLevel.values()) links.add(lines);
  }

  // One label per level, at the north-west corner of its rectangle, above the walls.
  const labels = Array.from({ length: dungeon.levelCount }, (_, i) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'level-tag';
    element.textContent = `Niveau ${i}`;
    element.title = `Aller au niveau ${i}`;
    element.addEventListener('pointerdown', (event) => event.stopPropagation());
    element.addEventListener('click', () => onRequestLevel?.(i));
    const object = new CSS2DObject(element);
    object.center.set(0, 1); // anchor: bottom-left of the label
    scene.add(object);
    return object;
  });

  function layoutLevels() {
    levels.forEach(({ group }, i) => {
      group.position.y = levelY(i);
      const m = dungeon.level(i);
      labels[i].position.set(m.offset.x - center.x, levelY(i) + settings.wallHeight + 0.2, m.offset.y - center.z);
    });
    buildLinks();
    drawLogicLinks();
    placeParty();
  }

  // --- Logic links (actuators, teleporters) and selection -------------------------
  // Lines from tile centre to tile centre, above the walls; links between levels
  // (teleporters) are arcs. Rebuilt by showLinks() and when the layout changes.
  let logicLinks = [];
  let logicLines = null;
  function tilePoint({ level, x, y }) {
    const m = dungeon.level(level);
    return new THREE.Vector3(m.offset.x + x + 0.5 - center.x, levelY(level) + settings.wallHeight + 0.15, m.offset.y + y + 0.5 - center.z);
  }
  function drawLogicLinks() {
    if (logicLines) {
      scene.remove(logicLines);
      logicLines.geometry.dispose();
      logicLines.material.dispose();
      logicLines = null;
    }
    if (!logicLinks.length) return;
    const positions = [];
    const colors = [];
    const color = new THREE.Color();
    const head = new THREE.Color();
    for (const link of logicLinks) {
      if (!dungeon.level(link.to.level)) continue;
      const a = tilePoint(link.from);
      const b = tilePoint(link.to);
      color.set(linkColor(link));
      // Brighter towards the destination, to read the direction.
      head.copy(color).lerp(new THREE.Color(0xffffff), 0.6);
      const sameLevel = link.from.level === link.to.level;
      const steps = sameLevel ? 1 : 16;
      const lift = sameLevel ? 0 : Math.max(2, a.distanceTo(b) * 0.25);
      let prev = a;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const p = a.clone().lerp(b, t);
        p.y += Math.sin(Math.PI * t) * lift; // arc for links between levels
        positions.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        const c0 = color.clone().lerp(head, (i - 1) / steps);
        const c1 = color.clone().lerp(head, t);
        colors.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
        prev = p;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    logicLines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
    logicLines.name = 'logic-links';
    scene.add(logicLines);
  }

  const selectionBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1, 1.02)),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  );
  selectionBox.visible = false;
  scene.add(selectionBox);
  function setSelection(tile) {
    selectionBox.visible = Boolean(tile);
    if (!tile) return;
    const p = tilePoint(tile);
    selectionBox.scale.set(1, settings.wallHeight + 0.1, 1);
    selectionBox.position.set(p.x, levelY(tile.level) + (settings.wallHeight + 0.1) / 2, p.z);
  }

  // --- Party of the simulation ---------------------------------------------------
  // A red cone pointing where the party faces, and a vertical beam to spot it from afar.
  const partyMarker = new THREE.Group();
  partyMarker.name = 'party';
  const partyMaterial = new THREE.MeshBasicMaterial({ color: 0xff4a3a });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 16), partyMaterial);
  cone.rotation.x = Math.PI / 2; // tip towards +z (south) before the facing rotation
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), partyMaterial);
  partyMarker.add(cone, beam);
  partyMarker.visible = false;
  scene.add(partyMarker);
  let party = null;
  const PARTY_YAW = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };
  function placeParty() {
    partyMarker.visible = Boolean(party) && levels[party.level]?.group.visible;
    if (!partyMarker.visible) return;
    const m = dungeon.level(party.level);
    const beamHeight = settings.wallHeight + 1.5;
    partyMarker.position.set(m.offset.x + party.x + 0.5 - center.x, levelY(party.level) + 0.3, m.offset.y + party.y + 0.5 - center.z);
    partyMarker.rotation.y = PARTY_YAW[party.facing];
    beam.scale.y = beamHeight;
    beam.position.y = beamHeight / 2;
  }

  // --- State ------------------------------------------------------------------
  let currentLevel = 0;
  if (!DISPLAY_MODES.includes(settings.mode)) settings.mode = DEFAULT_SETTINGS.mode;
  let mode = settings.mode;
  // Destination of the glide towards a newly focused level; null when no glide is running,
  // so the user's own pan (which moves controls.target) is never pulled back.
  let targetGoal = null;
  let cameraGoal = null; // with auto-adjust: the framed camera position of the new level
  const stopGlide = () => {
    targetGoal = null;
    cameraGoal = null;
  };
  controls.addEventListener('start', stopGlide);

  function applyDisplayMode() {
    links.visible = settings.links;
    levels.forEach(({ group, meshes }, i) => {
      const focused = i === currentLevel;
      group.visible = mode !== 'solo' || focused;
      // In solo mode, keep the links leaving this level and those arriving on it.
      const lines = linesByLevel.get(i);
      if (lines) lines.visible = mode !== 'solo' || i === currentLevel || i === currentLevel - 1;
      labels[i].visible = settings.labels && group.visible;
      labels[i].element.classList.toggle('is-current', focused);
      labels[i].element.classList.toggle('is-faded', mode === 'focus' && !focused);
      for (const mesh of meshes) styleMesh(mesh, focused);
    });
    placeParty();
  }

  function styleMesh(mesh, focused) {
    // Meshes specific to the types-only or the with-states rendering (see level-meshes.js).
    const { variant, layer } = mesh.userData;
    mesh.visible = (variant === 'all' || (variant === 'states') === showStates) && layerVisible(layer);
    const opacity = mode === 'focus' && !focused ? FADED_OPACITY * mesh.userData.baseOpacity : mesh.userData.baseOpacity;
    mesh.material.opacity = opacity;
    mesh.material.transparent = opacity < 1;
    // Faded levels must not hide what is behind them.
    mesh.material.depthWrite = opacity === 1;
    mesh.material.needsUpdate = true;
  }

  // Outline of the tile located from the inventory (one at a time).
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.1, 1, 1.1)),
    new THREE.LineBasicMaterial({ color: 0xe0b050 }),
  );
  highlight.visible = false;
  scene.add(highlight);

  function highlightTile(x, y) {
    const m = dungeon.level(currentLevel);
    const position = new THREE.Vector3(m.offset.x + x + 0.5 - center.x, levelY(currentLevel), m.offset.y + y + 0.5 - center.z);
    highlight.scale.set(1, settings.wallHeight + 0.2, 1);
    highlight.position.copy(position).setY(position.y + (settings.wallHeight + 0.2) / 2);
    highlight.visible = true;
    targetGoal = position; // glide to the tile
  }

  // Camera position framing a whole level, seen from the south, above.
  function framedCamera(level) {
    const target = levelCenter(level);
    const m = dungeon.level(level);
    const span = Math.max(m.width, m.height);
    return new THREE.Vector3(target.x, target.y + span * 1.1, target.z + span * 1.0);
  }

  function resetView() {
    controls.target.copy(levelCenter(currentLevel));
    stopGlide();
    camera.position.copy(framedCamera(currentLevel));
    controls.update();
  }

  /** Applies a partial settings change, rebuilding only what depends on it. */
  function applySettings(changes) {
    const previousY = levelY(currentLevel);
    Object.assign(settings, changes);
    if ('mode' in changes) mode = settings.mode;
    if ('wallHeight' in changes) buildLevels();
    if ('wallHeight' in changes || 'levelGap' in changes) {
      layoutLevels();
      // Keep the camera on the current level: shift it with the level.
      const shift = new THREE.Vector3(0, levelY(currentLevel) - previousY, 0);
      controls.target.add(shift);
      camera.position.add(shift);
      if (targetGoal) targetGoal.add(shift);
      if (cameraGoal) cameraGoal.add(shift);
    }
    applyDisplayMode();
  }

  // --- Resize & render loop -----------------------------------------------------
  function resize() {
    const { clientWidth: w, clientHeight: h } = canvasHost;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvasHost);

  let frame = 0;
  const loop = () => {
    frame = requestAnimationFrame(loop);
    // Glide towards the focused level: move target and camera by the same delta.
    // With auto-adjust, the camera also glides to the framed position of the level.
    if (targetGoal) {
      const remaining = targetGoal.clone().sub(controls.target);
      // Snap and stop once close enough, otherwise move 15 % of the remaining distance.
      const done = remaining.lengthSq() < 1e-4 && (!cameraGoal || cameraGoal.distanceToSquared(camera.position) < 1e-4);
      const delta = done ? remaining : remaining.multiplyScalar(0.15);
      controls.target.add(delta);
      if (cameraGoal) camera.position.lerp(cameraGoal, done ? 1 : 0.15);
      else camera.position.add(delta);
      if (done) stopGlide();
    }
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  };

  // --- Hover (raycasting on instanced meshes) ---------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoverPending = false;
  function onPointerMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    if (hoverPending) return;
    hoverPending = true;
    requestAnimationFrame(() => {
      hoverPending = false;
      raycaster.setFromCamera(pointer, camera);
      // Only the focused level can be picked, except in "all" mode.
      // Raycasting ignores `visible`: filter hidden variants, and outlines (no instances to identify).
      const pickable = levels.flatMap(({ group, meshes }, i) =>
        group.visible && (mode === 'all' || i === currentLevel) ? meshes.filter((m) => m.isInstancedMesh && m.visible) : [],
      );
      const hit = raycaster.intersectObjects(pickable, false)[0];
      onHover?.(hit ? hit.object.userData.tiles[hit.instanceId] : null);
    });
  }
  const onPointerLeave = () => onHover?.(null);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);

  // Click = pointer released close to where it was pressed (otherwise it is an orbit drag);
  // the right button, released without panning, opens the context menu.
  let downAt = null;
  const onPointerDown = (event) => {
    downAt = event.button === 0 || event.button === 2 ? { button: event.button, x: event.clientX, y: event.clientY } : null;
  };
  const onPointerUp = (event) => {
    if (!downAt || event.button !== downAt.button || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 4) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const pickable = levels.flatMap(({ group, meshes }, i) =>
      group.visible && (mode === 'all' || i === currentLevel) ? meshes.filter((m) => m.isInstancedMesh && m.visible) : [],
    );
    const hit = raycaster.intersectObjects(pickable, false)[0];
    if (!hit) return;
    const info = hit.object.userData.tiles[hit.instanceId];
    if (downAt.button === 0) onSelect?.(info);
    else onContextMenu?.(info, event);
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  const unbindShiftWheel = bindShiftWheel(renderer.domElement, onStepLevel);

  buildLevels();
  layoutLevels();
  resize();
  resetView();
  applyDisplayMode();
  loop();

  return assertRenderer({
    get currentLevel() {
      return currentLevel;
    },
    showLevel(level) {
      currentLevel = level;
      targetGoal = levelCenter(level);
      cameraGoal = settings.autoAdjust ? framedCamera(level) : null;
      highlight.visible = false;
      applyDisplayMode();
    },
    showLinks(links, selection = null) {
      logicLinks = links;
      drawLogicLinks();
      setSelection(selection);
    },
    updateTile(level) {
      rebuildLevel(level);
    },
    updateCreatures(level) {
      rebuildCreatures(level);
    },
    /** Party of the simulation ({ level, x, y, facing }), or null to hide it. */
    setParty(next) {
      party = next;
      placeParty();
    },
    setLayers(changes) {
      Object.assign(layers, changes);
      applyDisplayMode();
    },
    highlightTile,
    setShowStates(enabled) {
      showStates = enabled;
      applyDisplayMode();
    },
    settingsSchema: SETTINGS_SCHEMA,
    defaultSettings: { ...DEFAULT_SETTINGS },
    get settings() {
      return { ...settings };
    },
    applySettings,
    zoom(step) {
      // step > 0: closer. Dolly along the view direction.
      const offset = camera.position.clone().sub(controls.target);
      const length = THREE.MathUtils.clamp(offset.length() * (step > 0 ? 0.85 : 1 / 0.85), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(length));
    },
    resetView,
    keyHint: 'souris : orbite / zoom / clic droit glissé déplacer · M mode',
    keys: {
      // M (not F: F teleports the party to the selected tile, see main.js).
      m: () => {
        mode = DISPLAY_MODES[(DISPLAY_MODES.indexOf(mode) + 1) % DISPLAY_MODES.length];
        settings.mode = mode;
        applyDisplayMode();
        onSettingsChange?.({ ...settings }); // remembered by main.js, across renderers and visits
        onInfo?.(`Mode : ${DISPLAY_MODE_LABELS[mode]}`);
      },
    },
    dispose() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      unbindShiftWheel();
      logicLinks = [];
      drawLogicLinks();
      selectionBox.geometry.dispose();
      selectionBox.material.dispose();
      controls.removeEventListener('start', stopGlide);
      controls.dispose();
      for (const { meshes } of levels) disposeLevelMeshes(meshes);
      for (const lines of linesByLevel.values()) {
        lines.geometry.dispose();
        lines.material.dispose();
      }
      for (const label of labels) label.element.remove();
      highlight.geometry.dispose();
      highlight.material.dispose();
      cone.geometry.dispose();
      beam.geometry.dispose();
      partyMaterial.dispose();
      renderer.dispose();
      canvasHost.remove();
    },
  });
}

// Vertical segments between connected tiles (stairs in gold, pits in red),
// grouped by departure level: Map<level, LineSegments>.
function buildConnectionLines(dungeon, center, levelY, wallHeight) {
  const gold = new THREE.Color(0xffd060);
  const red = new THREE.Color(0xff4040);
  const byLevel = new Map();
  for (const link of findConnections(dungeon)) {
    // Stairs are listed twice (down and up): draw each pair once, from the upper level.
    if (link.kind === 'stairs' && link.direction === 'up') continue;
    const entry = byLevel.get(link.level) ?? { positions: [], colors: [] };
    byLevel.set(link.level, entry);
    const x = link.gx + 0.5 - center.x;
    const z = link.gy + 0.5 - center.z;
    entry.positions.push(x, levelY(link.level) + wallHeight * 0.5, z, x, levelY(link.toLevel) + 0.05, z);
    const color = link.kind === 'stairs' ? gold : red;
    entry.colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }
  return new Map(
    [...byLevel].map(([level, { positions, colors }]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
      lines.name = `connections-${level}`;
      return [level, lines];
    }),
  );
}
