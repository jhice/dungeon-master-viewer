// First-person view of the simulation (Three.js): the party's level only, with
// full-height walls, a ceiling and a uniform light (answer Q7: permanent light).
// Reuses level-meshes.js in its `game` look, fed by the simulation state.
// Units as in level-meshes.js: 1 tile = 1 unit, x = east, z = south, y = up;
// here the level is built in local coordinates (tile (x, y) spans [x, x+1]).
//
// Rendering is on demand (party moved, state changed, resize): no loop yet.
// Mouse: a click on the wall or door just in front of the party is reported
// (wall buttons, levers, locks, alcoves, door buttons), and so is a click on an
// item within reach; the cursor shows when it is clickable.

import * as THREE from 'three';
import { buildLevelMeshes, disposeLevelMeshes } from '../three/level-meshes.js';
import { buildLevelContents } from '../three/level-contents.js';
import { readTheme } from '../three/theme.js';
import { FACINGS, SIDE_DELTAS } from '../../core/dungeon.js';

// Field of view (docs/012-simulation.md § 4): the eye is pulled back from the
// tile centre, so the floor of the current tile and the side openings show.
export const VIEW = {
  fov: 62, // vertical, degrees (4/3 viewport)
  eyeHeight: 0.42,
  pullBack: 0.35, // towards the back of the tile, in tiles (0.5 = back edge)
  fogNear: 2.5,
  fogFar: 4,
};
const ASPECT = 4 / 3;
const WALL_HEIGHT = 0.7;
const CEILING_COLOR = '#1d1b18';

/**
 * @param {HTMLElement} container element sized by the caller (4/3), the canvas fills it
 * @param {import('../../core/dungeon.js').Dungeon} dungeon
 * @param {{ tileAt(level, x, y): object, textVisible(index): boolean }} state simulation state (src/sim/state.js)
 * @param {object} [options]
 * @param {() => void} [options.onClickFront] the wall or door in front of the party was clicked
 * @param {(info: object) => void} [options.onClickItem] an item was clicked: { level, x, y, item }
 * @param {(level, x, y) => object|null} [options.contentsAt] contents of a tile (items lying there now)
 */
export function createFirstPersonRenderer(container, dungeon, state, { onClickFront, onClickItem, contentsAt } = {}) {
  const theme = readTheme();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.className = 'fp-canvas';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, VIEW.fogNear, VIEW.fogFar);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x403a30, 1.6));
  // A light carried by the party: faces close to the eye are brighter, which separates the walls.
  const torch = new THREE.PointLight(0xffe2b0, 2.2, 0, 1);
  scene.add(torch);

  const camera = new THREE.PerspectiveCamera(VIEW.fov, ASPECT, 0.02, 60);
  camera.add(torch);
  scene.add(camera);

  const textures = { wall: stoneTexture(), floor: flagstoneTexture() };

  let level = null; // level index currently built
  let built = null; // { group, meshes, ceiling }

  function build(levelIndex) {
    clear();
    level = levelIndex;
    const map = dungeon.level(levelIndex);
    const center = { x: map.offset.x, z: map.offset.y };
    const { group, meshes } = buildLevelMeshes(dungeon, levelIndex, theme, center, {
      wallHeight: WALL_HEIGHT,
      tileAt: state.tileAt,
      game: true,
    });
    // Items, creatures (still) and mechanisms, as markers of the 3D renderer.
    // Texts are drawn for real (inscriptions below), not as markers.
    for (const mesh of buildLevelContents(dungeon, levelIndex, center, { wallHeight: WALL_HEIGHT, contentsAt })) {
      if (mesh.userData.layer === 'texts') {
        mesh.geometry.dispose();
        mesh.material.dispose();
        continue;
      }
      group.add(mesh);
      meshes.push(mesh);
    }
    const inscriptions = buildInscriptions(dungeon, state, levelIndex);
    for (const mesh of inscriptions) group.add(mesh);
    for (const mesh of meshes) {
      // `game` builds no types-only look, but stairs/doors share variants: hide what is not 'states'.
      mesh.visible = mesh.userData.variant !== 'types';
      const texture = textures[mesh.userData.part];
      if (texture) {
        mesh.material.map = texture;
        mesh.material.needsUpdate = true;
      }
    }
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(map.width, map.height),
      new THREE.MeshLambertMaterial({ color: CEILING_COLOR }),
    );
    ceiling.rotation.x = Math.PI / 2; // facing down
    ceiling.position.set(map.width / 2, WALL_HEIGHT, map.height / 2);
    group.add(ceiling);
    scene.add(group);
    built = { group, meshes, ceiling, inscriptions };
  }

  function clear() {
    if (!built) return;
    scene.remove(built.group);
    disposeLevelMeshes(built.meshes);
    built.ceiling.geometry.dispose();
    built.ceiling.material.dispose();
    for (const mesh of built.inscriptions) {
      mesh.geometry.dispose();
      mesh.material.map.dispose();
      mesh.material.dispose();
    }
    built = null;
  }

  function placeCamera(party) {
    const yaw = -FACINGS.indexOf(party.facing) * (Math.PI / 2); // N looks towards -z
    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(VIEW.pullBack);
    camera.position.set(party.x + 0.5, VIEW.eyeHeight, party.y + 0.5).add(back);
    camera.rotation.set(0, yaw, 0);
  }

  const render = () => renderer.render(scene, camera);

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  // --- Mouse: picking the tile in front of the party ------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  // What the pointer designates: an item of the party's tile, the wall or door in
  // front (an item in the front alcove counts as the wall: its actuators must act too), or null.
  function target(event) {
    if (!built || !party) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const pickable = built.meshes.filter((m) => m.isInstancedMesh && m.visible);
    const hit = raycaster.intersectObjects(pickable, false)[0];
    const info = hit?.object.userData.tiles?.[hit.instanceId];
    if (!info) return null;
    const [dx, dy] = SIDE_DELTAS[party.facing];
    const own = info.x === party.x && info.y === party.y;
    const front = info.x === party.x + dx && info.y === party.y + dy;
    if (info.item && own) return { kind: 'item', info };
    if (front && (info.type === 'wall' || info.type === 'door')) return { kind: 'front' };
    return null;
  }
  const onClick = (event) => {
    const t = target(event);
    if (t?.kind === 'item') onClickItem?.(t.info);
    else if (t?.kind === 'front') onClickFront?.();
  };
  let hoverPending = false;
  const onMove = (event) => {
    if (hoverPending) return;
    hoverPending = true;
    requestAnimationFrame(() => {
      hoverPending = false;
      renderer.domElement.style.cursor = target(event) ? 'pointer' : '';
    });
  };
  renderer.domElement.addEventListener('click', onClick);
  renderer.domElement.addEventListener('pointermove', onMove);

  let party = null;
  return {
    /** Shows the view of the party ({ level, x, y, facing }), rebuilding the level if it changed. */
    setParty(next) {
      party = next;
      if (party.level !== level) build(party.level);
      placeCamera(party);
      render();
    },
    /** The state of a tile of the shown level changed: rebuild it (about 2 ms, see 007). */
    updateTile(levelIndex) {
      if (levelIndex !== level) return;
      build(level);
      render();
    },
    dispose() {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('pointermove', onMove);
      clear();
      for (const texture of Object.values(textures)) texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// --- Inscriptions -------------------------------------------------------------------
// Visible texts on a wall face, engraved in the stone: a transparent plane just in
// front of the face, with the lines of the text centred. Messages hidden until a
// mechanism shows them are drawn once visible (the level is rebuilt).

// Plane position and rotation per face (N, E, S, W): offset from the tile centre, rotation around y.
const FACE_PLANES = [
  { dx: 0, dz: -0.5, rotation: Math.PI },
  { dx: 0.5, dz: 0, rotation: Math.PI / 2 },
  { dx: 0, dz: 0.5, rotation: 0 },
  { dx: -0.5, dz: 0, rotation: -Math.PI / 2 },
];
const INSCRIPTION_GAP = 0.004; // in front of the face, against z-fighting

function buildInscriptions(dungeon, state, levelIndex) {
  const meshes = [];
  for (const { x, y, detail } of dungeon.detailedTiles(levelIndex)) {
    if (detail.type !== 'wall') continue;
    for (const ref of detail.items ?? []) {
      if (ref.kind !== 'text' || !state.textVisible(ref.index)) continue;
      const lines = dungeon.data.texts[ref.index].text.split('\n');
      const { dx, dz, rotation } = FACE_PLANES[ref.position];
      const material = new THREE.MeshLambertMaterial({ map: inscriptionTexture(lines), transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.43), material);
      const out = 1 + INSCRIPTION_GAP / 0.5;
      mesh.position.set(x + 0.5 + dx * out, WALL_HEIGHT * 0.55, y + 0.5 + dz * out);
      mesh.rotation.y = rotation;
      meshes.push(mesh);
    }
  }
  return meshes;
}

// Pale letters with a dark lower edge (engraved look), as large as the longest line allows.
function inscriptionTexture(lines) {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const size = Math.min(56, Math.floor((width * 0.92) / (longest * 0.62)), Math.floor((height * 0.9) / (lines.length * 1.15)));
  g.font = `bold ${size}px ui-monospace, "DejaVu Sans Mono", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const top = height / 2 - ((lines.length - 1) * size * 1.15) / 2;
  lines.forEach((line, i) => {
    const y = top + i * size * 1.15;
    g.fillStyle = 'rgb(20 16 10 / 0.75)';
    g.fillText(line, width / 2 + 2, y + 3);
    g.fillStyle = '#e8e0c8';
    g.fillText(line, width / 2, y);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// --- Procedural textures (light patterns, tinted by the theme colour of each part) ---

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Deterministic noise, so the textures are the same at every load.
function random(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// Stone blocks in staggered rows, 4 rows per wall face.
function stoneTexture() {
  return canvasTexture(256, (g, size) => {
    const rand = random(7);
    const rows = 4;
    const cols = 3;
    const rh = size / rows;
    const cw = size / cols;
    g.fillStyle = '#6a6660';
    g.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      const shift = r % 2 ? cw / 2 : 0;
      for (let c = -1; c < cols; c++) {
        const shade = 200 + Math.floor(rand() * 45);
        g.fillStyle = `rgb(${shade} ${shade - 4} ${shade - 12})`;
        g.fillRect(c * cw + shift + 3, r * rh + 3, cw - 6, rh - 6);
      }
    }
    speckle(g, size, rand, 1400);
  });
}

// Floor: four flagstones per tile.
function flagstoneTexture() {
  return canvasTexture(128, (g, size) => {
    const rand = random(11);
    g.fillStyle = '#707070';
    g.fillRect(0, 0, size, size);
    const half = size / 2;
    for (const [x, y] of [[0, 0], [half, 0], [0, half], [half, half]]) {
      const shade = 205 + Math.floor(rand() * 40);
      g.fillStyle = `rgb(${shade} ${shade} ${shade})`;
      g.fillRect(x + 2, y + 2, half - 4, half - 4);
    }
    speckle(g, size, rand, 500);
  });
}

function speckle(g, size, rand, count) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = `rgb(0 0 0 / ${0.05 + rand() * 0.12})`;
    g.fillRect(rand() * size, rand() * size, 2, 2);
  }
}
