// 3D renderer: the 14 levels stacked at their global offsets, orbit camera.
// Same contract as the other renderers (src/render/renderer.js), plus optional
// zoom(step), resetView() and per-renderer key actions (`keys`, `keyHint`).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { assertRenderer } from '../renderer.js';
import { findConnections } from '../../core/connections.js';
import { buildLevelMeshes, disposeLevelMeshes, WALL_HEIGHT } from './level-meshes.js';
import { readTheme } from './theme.js';

const LEVEL_GAP = 3; // vertical distance between two level floors
const FADED_OPACITY = 0.12;
// How non-focused levels are shown.
const DISPLAY_MODES = ['focus', 'all', 'solo'];
const DISPLAY_MODE_LABELS = { focus: 'niveau courant mis en avant', all: 'tous les niveaux', solo: 'niveau courant seul' };

/**
 * @param {HTMLElement} container
 * @param {import('../../core/dungeon.js').Dungeon} dungeon
 * @param {object} [options]
 * @param {boolean} [options.showStates=true] draw door/pit/fake wall states
 * @param {(info: object|null) => void} [options.onHover]
 * @param {(text: string) => void} [options.onInfo] short status messages (display mode…)
 */
export function createThreeRenderer(container, dungeon, { showStates = true, onHover, onInfo } = {}) {
  const theme = readTheme();
  const b = dungeon.bounds;
  const center = { x: (b.minX + b.maxX) / 2, z: (b.minY + b.maxY) / 2 };
  const levelY = (level) => -level * LEVEL_GAP;
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

  // --- Levels -----------------------------------------------------------------
  const levels = [];
  for (let i = 0; i < dungeon.levelCount; i++) {
    const { group, meshes } = buildLevelMeshes(dungeon, i, theme, center);
    group.position.y = levelY(i);
    scene.add(group);
    levels.push({ group, meshes });
  }

  // One LineSegments per departure level, so solo mode can keep only the links of the shown level.
  const links = new THREE.Group();
  links.name = 'connections';
  const linesByLevel = buildConnectionLines(dungeon, center, levelY);
  for (const lines of linesByLevel.values()) links.add(lines);
  scene.add(links);

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
    levels.forEach(({ group, meshes }, i) => {
      const focused = i === currentLevel;
      group.visible = mode !== 'solo' || focused;
      // In solo mode, keep the links leaving this level and those arriving on it.
      const lines = linesByLevel.get(i);
      if (lines) lines.visible = mode !== 'solo' || i === currentLevel || i === currentLevel - 1;
      for (const mesh of meshes) {
        // Meshes specific to the types-only or the with-states rendering (see level-meshes.js).
        const { variant } = mesh.userData;
        mesh.visible = variant === 'all' || (variant === 'states') === showStates;
        const opacity = mode === 'focus' && !focused ? FADED_OPACITY * mesh.userData.baseOpacity : mesh.userData.baseOpacity;
        mesh.material.opacity = opacity;
        mesh.material.transparent = opacity < 1;
        // Faded levels must not hide what is behind them.
        mesh.material.depthWrite = opacity === 1;
        mesh.material.needsUpdate = true;
      }
    });
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

  // --- Resize & render loop -----------------------------------------------------
  function resize() {
    const { clientWidth: w, clientHeight: h } = canvasHost;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
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
      applyDisplayMode();
    },
    setShowStates(enabled) {
      showStates = enabled;
      applyDisplayMode();
    },
    zoom(step) {
      // step > 0: closer. Dolly along the view direction.
      const offset = camera.position.clone().sub(controls.target);
      const length = THREE.MathUtils.clamp(offset.length() * (step > 0 ? 0.85 : 1 / 0.85), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(length));
    },
    resetView,
    keyHint: 'souris : orbite / zoom / clic droit déplacer · F mode · L liens',
    keys: {
      f: () => {
        mode = DISPLAY_MODES[(DISPLAY_MODES.indexOf(mode) + 1) % DISPLAY_MODES.length];
        applyDisplayMode();
        onInfo?.(`Mode : ${DISPLAY_MODE_LABELS[mode]}`);
      },
      l: () => {
        links.visible = !links.visible;
        onInfo?.(`Liens escaliers / trappes : ${links.visible ? 'affichés' : 'masqués'}`);
      },
    },
    dispose() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      controls.removeEventListener('start', stopGlide);
      controls.dispose();
      for (const { meshes } of levels) disposeLevelMeshes(meshes);
      for (const lines of linesByLevel.values()) {
        lines.geometry.dispose();
        lines.material.dispose();
      }
      renderer.dispose();
      canvasHost.remove();
    },
  });
}

// Vertical segments between connected tiles (stairs in gold, pits in red),
// grouped by departure level: Map<level, LineSegments>.
function buildConnectionLines(dungeon, center, levelY) {
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
    entry.positions.push(x, levelY(link.level) + WALL_HEIGHT * 0.5, z, x, levelY(link.toLevel) + 0.05, z);
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
