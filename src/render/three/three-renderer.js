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
import { buildLevelContents } from './level-contents.js';
import { readTheme } from './theme.js';
import { linkColor } from '../palette.js';

export const DEFAULT_SETTINGS = { levelGap: 5, wallHeight: DEFAULT_WALL_HEIGHT, links: true, labels: true };

// Shown in the control panel; checkboxes with a `shortcut` are toggled by that key (main.js).
const SETTINGS_SCHEMA = [
  { key: 'links', label: 'Liens escaliers / trappes', type: 'checkbox', shortcut: 'L' },
  { key: 'labels', label: 'Étiquettes de niveau', type: 'checkbox', shortcut: 'E' },
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
 * @param {(info: object|null) => void} [options.onHover]
 * @param {(text: string) => void} [options.onInfo] short status messages (display mode…)
 * @param {(level: number) => void} [options.onRequestLevel] a level label was clicked
 */
export function createThreeRenderer(
  container,
  dungeon,
  { showStates = true, settings: initial, layers: initialLayers, onHover, onInfo, onRequestLevel, onSelect } = {},
) {
  const settings = { ...DEFAULT_SETTINGS, ...initial };
  const layers = { items: true, creatures: true, mechanisms: true, ...initialLayers };
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
    levels = [];
    for (let i = 0; i < dungeon.levelCount; i++) {
      const { group, meshes } = buildLevelMeshes(dungeon, i, theme, center, { wallHeight: settings.wallHeight });
      for (const mesh of buildLevelContents(dungeon, i, center, { wallHeight: settings.wallHeight })) {
        group.add(mesh);
        meshes.push(mesh);
      }
      scene.add(group);
      levels.push({ group, meshes });
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

  // --- State ------------------------------------------------------------------
  let currentLevel = 0;
  let mode = 'focus';
  // Destination of the glide towards a newly focused level; null when no glide is running,
  // so the user's own pan (which moves controls.target) is never pulled back.
  let targetGoal = null;
  const stopGlide = () => {
    targetGoal = null;
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
      for (const mesh of meshes) {
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
    });
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

  function resetView() {
    const target = levelCenter(currentLevel);
    const m = dungeon.level(currentLevel);
    const span = Math.max(m.width, m.height);
    controls.target.copy(target);
    stopGlide();
    camera.position.set(target.x, target.y + span * 1.1, target.z + span * 1.0);
    controls.update();
  }

  /** Applies a partial settings change, rebuilding only what depends on it. */
  function applySettings(changes) {
    const previousY = levelY(currentLevel);
    Object.assign(settings, changes);
    if ('wallHeight' in changes) buildLevels();
    if ('wallHeight' in changes || 'levelGap' in changes) {
      layoutLevels();
      // Keep the camera on the current level: shift it with the level.
      const shift = new THREE.Vector3(0, levelY(currentLevel) - previousY, 0);
      controls.target.add(shift);
      camera.position.add(shift);
      if (targetGoal) targetGoal.add(shift);
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
    if (targetGoal) {
      const remaining = targetGoal.clone().sub(controls.target);
      // Snap and stop once close enough, otherwise move 15 % of the remaining distance.
      const delta = remaining.lengthSq() < 1e-4 ? remaining : remaining.multiplyScalar(0.15);
      controls.target.add(delta);
      camera.position.add(delta);
      if (delta === remaining) stopGlide();
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

  // Click = pointer released close to where it was pressed (otherwise it is an orbit drag).
  let downAt = null;
  const onPointerDown = (event) => {
    downAt = event.button === 0 ? [event.clientX, event.clientY] : null;
  };
  const onPointerUp = (event) => {
    if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 4) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const pickable = levels.flatMap(({ group, meshes }, i) =>
      group.visible && (mode === 'all' || i === currentLevel) ? meshes.filter((m) => m.isInstancedMesh && m.visible) : [],
    );
    const hit = raycaster.intersectObjects(pickable, false)[0];
    if (hit) onSelect?.(hit.object.userData.tiles[hit.instanceId]);
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

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
      highlight.visible = false;
      applyDisplayMode();
    },
    showLinks(links, selection = null) {
      logicLinks = links;
      drawLogicLinks();
      setSelection(selection);
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
    keyHint: 'souris : orbite / zoom / clic droit déplacer · F mode',
    keys: {
      f: () => {
        mode = DISPLAY_MODES[(DISPLAY_MODES.indexOf(mode) + 1) % DISPLAY_MODES.length];
        applyDisplayMode();
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
