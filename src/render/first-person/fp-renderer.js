// First-person view of the simulation (Three.js): the party's level only, with
// full-height walls, a ceiling and a uniform light (answer Q7: permanent light).
// Reuses level-meshes.js in its `game` look, fed by the simulation state.
// Units as in level-meshes.js: 1 tile = 1 unit, x = east, z = south, y = up;
// here the level is built in local coordinates (tile (x, y) spans [x, x+1]).
//
// Rendering is on demand (party moved, state changed, resize): no loop yet.
// Mouse: a click on the wall or door just in front of the party is reported
// (wall buttons, levers, locks, alcoves, door buttons), and so is a click on the
// floor (a sub-tile, maybe with an item): main.js picks up or drops there if it
// is within reach. The cursor shows what is clickable, and the item in hand.
// Teleporter fields do not stop the pointer.

import * as THREE from 'three';
import { buildLevelMeshes, disposeLevelMeshes } from '../three/level-meshes.js';
import { buildLevelContents, buildLevelCreatures } from '../three/level-contents.js';
import { createDecor } from './fp-decor.js';
import { isAlcove } from '../../core/ornaments.js';
import { tileContents } from '../../core/contents.js';
import { readTheme } from '../three/theme.js';
import { FACINGS, SIDE_DELTAS } from '../../core/dungeon.js';

// Field of view (docs/012-simulation.md § 4): the eye is pulled back from the
// tile centre, so the floor of the current tile and the side openings show.
export const VIEW = {
  fov: 62, // vertical, degrees (4/3 viewport)
  eyeHeight: 0.42,
  pullBack: 0.35, // towards the back of the tile, in tiles (0.5 = back edge)
  fogNear: 2.5,
  fogFar: 3.5,
};
const ASPECT = 4 / 3;
const WALL_HEIGHT = 0.7;
const CEILING_COLOR = '#696660';

/**
 * @param {HTMLElement} container element sized by the caller (4/3), the canvas fills it
 * @param {import('../../core/dungeon.js').Dungeon} dungeon
 * @param {{ tileAt(level, x, y): object, textVisible(index): boolean, actuatorsAt(level, x, y): Array }} state simulation state (src/sim/state.js)
 * @param {object} [options]
 * @param {() => void} [options.onClickFront] the wall or door in front of the party was clicked
 * @param {(spot: object) => void} [options.onClickFloor] a floor sub-tile was clicked: { level, x, y, position, item? }
 * @param {(spot: object) => boolean} [options.canReach] is this floor spot within reach (pointer cursor)?
 * @param {(target: object|null) => string|null} [options.labelOf] text shown next to the pointer for what it
 *   designates ({ kind: 'front' } or { kind: 'floor', spot }, or null): the item in hand, the item pointed at…
 * @param {(level, x, y) => object|null} [options.contentsAt] contents of a tile (items lying there now)
 */
export function createFirstPersonRenderer(container, dungeon, state, { onClickFront, onClickFloor, canReach, labelOf, contentsAt } = {}) {
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
  const decor = createDecor(dungeon, state, WALL_HEIGHT);

  let level = null; // level index currently built
  let built = null; // { group, meshes, ceiling }

  // What the party sees of a tile's contents: the items against a wall face only if
  // that face shows an alcove (not behind a mirror, a button, in a torch holder…).
  function seenContents(level, x, y) {
    const contents = contentsAt ? contentsAt(level, x, y) : tileContents(dungeon, level, x, y);
    if (!contents || dungeon.tileAt(level, x, y).type !== 'wall') return contents;
    const items = contents.items.filter((item) => isAlcove(dungeon, level, x, y, item.position, state.actuatorsAt));
    return items.length || contents.creature ? { ...contents, items } : null;
  }

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
    // Items and creatures (still), as markers of the 3D renderer. Mechanisms and texts
    // are not markers here: the party sees the ornaments, inscriptions and doors drawn
    // by fp-decor.js (a plate or a button without graphic stays invisible, as in DM).
    for (const mesh of seenMeshes(buildLevelContents(dungeon, levelIndex, center, { wallHeight: WALL_HEIGHT, contentsAt: seenContents }))) {
      group.add(mesh);
      meshes.push(mesh);
    }
    const { meshes: decorMeshes, doors } = decor.build(levelIndex);
    for (const mesh of [...decorMeshes, ...doors]) group.add(mesh);
    meshes.push(...doors); // pickable, disposed with the level meshes
    for (const mesh of meshes) {
      // `game` builds no types-only look, but stairs share variants: hide what is not 'states'.
      // The generic door leaves are replaced by the textured ones of fp-decor.js.
      mesh.visible = mesh.userData.variant !== 'types' && mesh.userData.part !== 'door';
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
    built = { group, meshes, ceiling, decorMeshes };
  }

  // Not seen by the party either: the "has contents" rings of chests and creatures (disposed).
  function seenMeshes(meshes) {
    return meshes.filter((mesh) => {
      if (!['texts', 'mechanisms', 'contents'].includes(mesh.userData.layer)) return true;
      mesh.geometry.dispose();
      mesh.material.dispose();
      return false;
    });
  }

  // Creatures moved: rebuild their meshes only, not the level.
  function rebuildCreatures() {
    const old = built.meshes.filter((mesh) => mesh.userData.creatures);
    for (const mesh of old) built.group.remove(mesh);
    disposeLevelMeshes(old);
    built.meshes = built.meshes.filter((mesh) => !mesh.userData.creatures);
    const map = dungeon.level(level);
    const center = { x: map.offset.x, z: map.offset.y };
    for (const mesh of seenMeshes(buildLevelCreatures(dungeon, level, center, { wallHeight: WALL_HEIGHT, contentsAt: seenContents }))) {
      built.group.add(mesh);
      built.meshes.push(mesh);
    }
  }

  function clear() {
    if (!built) return;
    scene.remove(built.group);
    disposeLevelMeshes(built.meshes);
    built.ceiling.geometry.dispose();
    built.ceiling.material.dispose();
    // Decor textures stay in the decor's cache.
    for (const mesh of built.decorMeshes) {
      mesh.geometry.dispose();
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
  // What the pointer designates: the wall or door in front (an item in the front
  // alcove counts as the wall: its actuators must act too), a floor spot
  // { level, x, y, position (sub-tile), item? }, or null.
  function target(event) {
    if (!built || !party) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const pickable = built.meshes.filter((m) => m.isInstancedMesh && m.visible && m.userData.part !== 'teleporter');
    const hit = raycaster.intersectObjects(pickable, false)[0];
    const info = hit?.object.userData.tiles?.[hit.instanceId];
    if (!info) return null;
    const [dx, dy] = SIDE_DELTAS[party.facing];
    const front = info.x === party.x + dx && info.y === party.y + dy;
    // A creature in front: the champion strikes it (main.js).
    if (info.type === 'wall' || info.type === 'door' || hit.object.userData.creatures) return front ? { kind: 'front' } : null;
    // Sub-tile under the pointer (items: their own), 0..3 = NW, NE, SE, SW.
    const u = hit.point.x - info.x;
    const v = hit.point.z - info.y;
    const position = info.item?.position ?? (v < 0.5 ? (u < 0.5 ? 0 : 1) : u < 0.5 ? 3 : 2);
    return { kind: 'floor', spot: { level: info.level, x: info.x, y: info.y, position, item: info.item } };
  }
  const onClick = (event) => {
    const t = target(event);
    if (t?.kind === 'floor') onClickFloor?.(t.spot);
    else if (t?.kind === 'front') onClickFront?.();
  };
  const tooltip = document.createElement('div');
  tooltip.className = 'fp-tooltip';
  tooltip.hidden = true;
  container.append(tooltip);
  let hoverPending = false;
  let lastPointer = null; // { clientX, clientY } while the pointer is over the view
  const onMove = (event) => {
    lastPointer = { clientX: event.clientX, clientY: event.clientY };
    if (hoverPending) return;
    hoverPending = true;
    requestAnimationFrame(() => {
      hoverPending = false;
      if (!lastPointer) return;
      const t = target(lastPointer);
      const active = t?.kind === 'front' || (t?.kind === 'floor' && canReach?.(t.spot));
      renderer.domElement.style.cursor = handCursor ?? (active ? 'pointer' : '');
      const label = labelOf?.(t) ?? null;
      tooltip.hidden = !label;
      if (!label) return;
      const rect = container.getBoundingClientRect();
      tooltip.textContent = label;
      tooltip.style.left = `${lastPointer.clientX - rect.left + 16}px`;
      tooltip.style.top = `${lastPointer.clientY - rect.top + 14}px`;
    });
  };
  const onLeave = () => {
    lastPointer = null;
    tooltip.hidden = true;
  };
  // Item in hand: a square of its colour replaces the cursor.
  let handCursor = null;
  function setHandCursor(color) {
    if (!color) {
      handCursor = null;
    } else {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect x="5" y="5" width="14" height="14" rx="2" fill="${color}" stroke="black" stroke-width="2"/><path d="M1 1 L8 3 L3 8 Z" fill="white" stroke="black"/></svg>`;
      handCursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 1 1, auto`;
    }
    renderer.domElement.style.cursor = handCursor ?? '';
  }
  renderer.domElement.addEventListener('click', onClick);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerleave', onLeave);

  let party = null;
  return {
    /** Shows the view of the party ({ level, x, y, facing }), rebuilding the level if it changed. */
    setParty(next) {
      party = next;
      if (party.level !== level) build(party.level);
      placeCamera(party);
      render();
    },
    /** Colour of the item in hand (cursor), or null for an empty hand. */
    setHandCursor,
    /** What is under the pointer may have changed (item taken, put, hand changed): update cursor and tooltip. */
    refreshPointer() {
      if (lastPointer) onMove(lastPointer);
    },
    /** The state of a tile of the shown level changed: rebuild it (about 2 ms, see 007). */
    updateTile(levelIndex) {
      if (levelIndex !== level) return;
      build(level);
      render();
    },
    updateCreatures(levelIndex) {
      if (levelIndex !== level || !built) return;
      rebuildCreatures();
      render();
    },
    dispose() {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      tooltip.remove();
      clear();
      decor.dispose();
      for (const texture of Object.values(textures)) texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
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
