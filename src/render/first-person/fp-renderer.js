// First-person view of the simulation (Three.js): the party's level only, with
// full-height walls, a ceiling, lit by the torches and spells of the party, the torch
// holders of the walls, or fully on a level of difficulty 0 (fp-lights.js, docs/037).
// Reuses level-meshes.js in its `game` look, fed by the simulation state.
// Units as in level-meshes.js: 1 tile = 1 unit, x = east, z = south, y = up;
// here the level is built in local coordinates (tile (x, y) spans [x, x+1]).
//
// Rendering is on demand (party moved, state changed, resize).
// Mouse: a click on the wall or door just in front of the party is reported
// (wall buttons, levers, locks, alcoves, door buttons), and so is a click on the
// floor (a sub-tile, maybe with an item): main.js picks up or drops there if it
// is within reach. The cursor shows what is clickable, and the item in hand.
// Teleporter fields do not stop the pointer. A click elsewhere (far floor, far walls)
// is reported too, with the side of the view (throwing, docs/024); so is a right click.
// Items in flight (projectiles) are small cubes, set by main.js.
//
// Walls, floor and ceiling textures are mirrored on every other tile ((x + y) odd):
// stepping along a straight corridor changes the picture, as in DM, which flips its
// floor, ceiling and walls when (x + y + direction) is odd (ReDMCSB, DUNVIEW.C). The
// ceiling shows a hole under each open pit of the level above (same global
// coordinates, invisible or not: DM draws its "ceiling pit" graphic the same way).

import * as THREE from 'three';
import { buildLevelMeshes, disposeLevelMeshes } from '../three/level-meshes.js';
import { buildLevelContents, buildLevelCreatures } from '../three/level-contents.js';
import { createDecor } from './fp-decor.js';
import { createLights } from './fp-lights.js';
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
};
const ASPECT = 4 / 3;
const WALL_HEIGHT = 0.7;
const CEILING_COLOR = '#696660';
const MIRRORED_PARTS = ['wall', 'floor'];

/**
 * @param {HTMLElement} container element sized by the caller (4/3), the canvas fills it
 * @param {import('../../core/dungeon.js').Dungeon} dungeon
 * @param {{ tileAt(level, x, y): object, textVisible(index): boolean, actuatorsAt(level, x, y): Array }} state simulation state (src/sim/state.js)
 * @param {object} [options]
 * @param {(side, kind: 'front'|'creature') => void} [options.onClickFront] the wall or door in front of
 *   the party was clicked ('front'), or the creature in front ('creature')
 * @param {(spot: object) => void} [options.onClickFloor] a floor sub-tile was clicked: { level, x, y, position, item? }
 * @param {(spot: object) => boolean} [options.canReach] is this floor spot within reach (pointer cursor)?
 * @param {(target: object|null) => string|null} [options.labelOf] text shown next to the pointer for what it
 *   designates ({ kind: 'front' } or { kind: 'floor', spot }, or null): the item in hand, the item pointed at…
 * @param {(level, x, y) => object|null} [options.contentsAt] contents of a tile (items lying there now)
 * @param {(side: 'left'|'right') => void} [options.onClickElsewhere] a click on nothing within reach
 * @param {() => void} [options.onContextMenu] a right click on the view
 * @param {(item: object) => string} [options.colorOf] colour of an item in flight
 * @param {object} [options.lighting] settings of the light (DEFAULT_LIGHTING, lighting-settings.js)
 * Every click handler also receives the side of the view clicked ('left' | 'right').
 */
export function createFirstPersonRenderer(
  container,
  dungeon,
  state,
  { onClickFront, onClickFloor, onClickElsewhere, onContextMenu, canReach, labelOf, contentsAt, colorOf, lighting = {} } = {},
) {
  const theme = readTheme();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.className = 'fp-canvas';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(VIEW.fov, ASPECT, 0.02, 60);
  scene.add(camera);
  const lights = createLights(scene, camera, WALL_HEIGHT, lighting);

  const textures = { wall: stoneTexture(), floor: flagstoneTexture() };
  const ceilingTextures = { ceiling: ceilingTexture(false), ceilingPit: ceilingTexture(true) };
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
    const { meshes: decorMeshes, doors, torchHolders } = decor.build(levelIndex);
    for (const mesh of [...decorMeshes, ...doors]) group.add(mesh);
    lights.setHolders(torchHolders);
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
      if (MIRRORED_PARTS.includes(mesh.userData.part)) mirrorOddTiles(mesh, mesh.userData.tiles);
    }
    const ceiling = buildCeiling(levelIndex);
    for (const mesh of ceiling) group.add(mesh);
    scene.add(group);
    built = { group, meshes, ceiling, decorMeshes };
    lights.setGlowing(meshes.filter((m) => m.userData.part === 'teleporterGame').map((m) => m.material));
  }

  // Ceiling: one tile-sized panel over every tile but walls, with a hole under the open
  // pits of the level above.
  function buildCeiling(levelIndex) {
    const map = dungeon.level(levelIndex);
    const above = levelIndex > 0 ? dungeon.level(levelIndex - 1) : null;
    const pitAbove = (x, y) => {
      if (!above) return false;
      const tile = state.tileAt(levelIndex - 1, x + map.offset.x - above.offset.x, y + map.offset.y - above.offset.y);
      return tile?.type === 'pit' && tile.detail.open;
    };
    const lists = { ceiling: [], ceilingPit: [] };
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (state.tileAt(levelIndex, x, y).type === 'wall') continue;
        lists[pitAbove(x, y) ? 'ceilingPit' : 'ceiling'].push({ x, y });
      }
    }
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2); // facing down
    const m4 = new THREE.Matrix4();
    const meshes = Object.entries(lists)
      .filter(([, tiles]) => tiles.length)
      .map(([part, tiles]) => {
        const material = new THREE.MeshLambertMaterial({ color: CEILING_COLOR, map: ceilingTextures[part] });
        const mesh = new THREE.InstancedMesh(geometry.clone(), material, tiles.length);
        tiles.forEach(({ x, y }, i) => mesh.setMatrixAt(i, m4.makeTranslation(x + 0.5, WALL_HEIGHT, y + 0.5)));
        mesh.computeBoundingSphere();
        mesh.userData = { part };
        mirrorOddTiles(mesh, tiles);
        return mesh;
      });
    geometry.dispose();
    return meshes;
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
    disposeLevelMeshes(built.ceiling);
    // Decor textures stay in the decor's cache.
    for (const mesh of built.decorMeshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    built = null;
  }

  // Items in flight: a small cube each, at the centre of its sub-tile, at hand height.
  const PROJECTILE_HEIGHT = 0.32;
  const SUB_TILE = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]]; // NW, NE, SE, SW
  const projectileGeometry = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  // A spell in flight (docs/033): a glowing sphere, higher than a thrown item (eye height). Its size
  // follows its energy as DM draws it (ReDMCSB DUNVIEW.C, F115): × max(96, energy + 1) / 256, so it
  // shrinks as it flies; SPELL_RADIUS at energy 255.
  const SPELL_RADIUS = 0.12;
  const spellGeometry = new THREE.SphereGeometry(1, 16, 12);
  const SPELL_COLORS = { fireball: '#ff7a1a', openDoor: '#4a8cff' };
  const SPELL_HEIGHT = 0.45;
  const projectileGroup = new THREE.Group();
  scene.add(projectileGroup);
  function setProjectiles(levelIndex, list) {
    for (const mesh of projectileGroup.children) mesh.material.dispose();
    projectileGroup.clear();
    if (levelIndex !== level) return render();
    for (const p of list) {
      const [u, v] = SUB_TILE[p.position];
      if (p.spell) {
        const mesh = new THREE.Mesh(spellGeometry, new THREE.MeshBasicMaterial({ color: SPELL_COLORS[p.spell] ?? '#ffffff' }));
        mesh.position.set(p.x + u, SPELL_HEIGHT, p.y + v);
        mesh.scale.setScalar((SPELL_RADIUS * Math.max(96, p.energy + 1)) / 256);
        projectileGroup.add(mesh);
        continue;
      }
      const material = new THREE.MeshLambertMaterial({ color: colorOf?.(p.item) ?? '#e0e0e0' });
      const mesh = new THREE.Mesh(projectileGeometry, material);
      mesh.position.set(p.x + u, PROJECTILE_HEIGHT, p.y + v);
      mesh.rotation.set(0.6, 0.8, 0);
      projectileGroup.add(mesh);
    }
    render();
  }

  function placeCamera(party) {
    const yaw = -FACINGS.indexOf(party.facing) * (Math.PI / 2); // N looks towards -z
    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(VIEW.pullBack);
    camera.position.set(party.x + 0.5, VIEW.eyeHeight, party.y + 0.5).add(back);
    camera.rotation.set(0, yaw, 0);
  }

  // On demand, at once (something changed).
  function render() {
    renderer.render(scene, camera);
  }

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
  // alcove counts as the wall: its actuators must act too), the creature in front, a
  // floor spot { level, x, y, position (sub-tile), item? }, or null. The floor of the
  // doorway in front is a floor spot where an item can be taken or put (docs/028), and
  // the door elsewhere; a creature under a door is the door where the leaf covers it.
  function target(event) {
    if (!built || !party) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const pickable = built.meshes.filter((m) => m.isInstancedMesh && m.visible && m.userData.part !== 'teleporterGame');
    const hits = raycaster.intersectObjects(pickable, false);
    const hit = hits[0];
    const info = hit?.object.userData.tiles?.[hit.instanceId];
    if (!info || info.outside) return null;
    const [dx, dy] = SIDE_DELTAS[party.facing];
    const front = info.x === party.x + dx && info.y === party.y + dy;
    const isLeaf = (h) => h.object.userData.part === 'doorLeaf';
    if (hit.object.userData.creatures) {
      // A creature in front: the champion strikes it (main.js), unless the pointer is on the door leaf too.
      if (!front) return null;
      return hits.some((h) => isLeaf(h) && h.object.userData.tiles[h.instanceId].x === info.x && h.object.userData.tiles[h.instanceId].y === info.y)
        ? { kind: 'front' }
        : { kind: 'creature' };
    }
    if (info.type === 'wall' || isLeaf(hit)) return front ? { kind: 'front' } : null;
    // Sub-tile under the pointer (items: their own), 0..3 = NW, NE, SE, SW.
    const u = hit.point.x - info.x;
    const v = hit.point.z - info.y;
    const position = info.item?.position ?? (v < 0.5 ? (u < 0.5 ? 0 : 1) : u < 0.5 ? 3 : 2);
    const spot = { level: info.level, x: info.x, y: info.y, position, item: info.item };
    // The doorway in front: a floor spot if there is something to do there, else the door.
    if (info.type === 'door' && front && !canReach?.(spot)) return { kind: 'front' };
    return { kind: 'floor', spot };
  }
  const onClick = (event) => {
    const t = target(event);
    const rect = renderer.domElement.getBoundingClientRect();
    const side = event.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
    if (t?.kind === 'floor') onClickFloor?.(t.spot, side);
    else if (t?.kind === 'front' || t?.kind === 'creature') onClickFront?.(side, t.kind);
    else onClickElsewhere?.(side);
  };
  const onRightClick = (event) => {
    event.preventDefault();
    onContextMenu?.();
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
      const active = t?.kind === 'front' || t?.kind === 'creature' || (t?.kind === 'floor' && canReach?.(t.spot));
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
  renderer.domElement.addEventListener('contextmenu', onRightClick);
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
    /** Settings of the light changed (control panel, docs/037): some of DEFAULT_LIGHTING (lighting-settings.js). */
    setLighting(changes) {
      lights.configure(changes);
      render();
    },
    /** The light of the simulation changed (sim.light, docs/032): torches, magical light. */
    setLight(light) {
      lights.setLight(light);
      render();
    },
    /** Colour of the item in hand (cursor), or null for an empty hand. */
    setHandCursor,
    /** What is under the pointer may have changed (item taken, put, hand changed): update cursor and tooltip. */
    refreshPointer() {
      if (lastPointer) onMove(lastPointer);
    },
    /**
     * The state of a tile of the shown level changed: rebuild it (about 2 ms, see 007).
     * So does a change on the level above (a pit opening shows in the ceiling).
     */
    updateTile(levelIndex) {
      if (levelIndex !== level && levelIndex !== level - 1) return;
      build(level);
      render();
    },
    updateCreatures(levelIndex) {
      if (levelIndex !== level || !built) return;
      rebuildCreatures();
      render();
    },
    /** Items in flight on a level: [{ item, x, y, position (sub-tile) }]. */
    setProjectiles,
    dispose() {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('contextmenu', onRightClick);
      setProjectiles(null, []);
      projectileGeometry.dispose();
      spellGeometry.dispose();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      tooltip.remove();
      clear();
      decor.dispose();
      for (const texture of [...Object.values(textures), ...Object.values(ceilingTextures)]) texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// Mirrors the texture (u → 1 - u) of the instances whose tile has x + y odd: a
// per-instance attribute read by the vertex shader. tiles[i] = { x, y } of instance i.
function mirrorOddTiles(mesh, tiles) {
  const mirror = new Float32Array(tiles.map((t) => (t && (t.x + t.y) & 1 ? 1 : 0)));
  mesh.geometry.setAttribute('mirror', new THREE.InstancedBufferAttribute(mirror, 1));
  mesh.material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float mirror;')
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n#ifdef USE_MAP\n  if (mirror > 0.5) vMapUv.x = 1.0 - vMapUv.x;\n#endif',
      );
  };
  mesh.material.customProgramCacheKey = () => 'mirror-odd-tiles';
  mesh.material.needsUpdate = true;
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

// Stone blocks in rows of uneven offsets, 4 rows per wall face. Asymmetric on
// purpose: mirrored on every other tile, it must look different.
function stoneTexture() {
  return canvasTexture(256, (g, size) => {
    const rand = random(7);
    const rows = 4;
    const cols = 3;
    const rh = size / rows;
    const cw = size / cols;
    const shifts = [0.15, 0.55, 0.3, 0.8]; // in block widths
    g.fillStyle = '#6a6660';
    g.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      const shift = shifts[r] * cw;
      for (let c = -1; c < cols; c++) {
        const shade = 195 + Math.floor(rand() * 55);
        g.fillStyle = `rgb(${shade} ${shade - 4} ${shade - 12})`;
        g.fillRect(c * cw + shift + 3, r * rh + 3, cw - 6, rh - 6);
      }
    }
    speckle(g, size, rand, 1400);
  });
}

// Floor: four flagstones of uneven sizes per tile (asymmetric, see stoneTexture).
function flagstoneTexture() {
  return canvasTexture(128, (g, size) => {
    const rand = random(11);
    g.fillStyle = '#686868';
    g.fillRect(0, 0, size, size);
    const split = size * 0.4; // west column | east column
    const left = size * 0.62; // row split of the west column
    const right = size * 0.3; // and of the east one
    const stones = [[0, 0, split, left], [0, left, split, size - left], [split, 0, size - split, right], [split, right, size - split, size - right]];
    for (const [x, y, w, h] of stones) {
      const shade = 195 + Math.floor(rand() * 50);
      g.fillStyle = `rgb(${shade} ${shade} ${shade})`;
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
    }
    speckle(g, size, rand, 500);
  });
}

// Ceiling: large irregular slabs, darker joints; with a pit of the level above, a dark
// square hole with a lit rim in the middle (the pit's size on the floor, 0.76 tile).
function ceilingTexture(withPit) {
  return canvasTexture(128, (g, size) => {
    const rand = random(23);
    g.fillStyle = '#5a5a5a';
    g.fillRect(0, 0, size, size);
    const slabs = [[0, 0, 70, 52], [70, 0, 58, 52], [0, 52, 44, 76], [44, 52, 84, 76]];
    for (const [x, y, w, h] of slabs) {
      const shade = 185 + Math.floor(rand() * 40);
      g.fillStyle = `rgb(${shade} ${shade} ${shade})`;
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
    }
    speckle(g, size, rand, 700);
    if (!withPit) return;
    const hole = size * 0.76;
    const at = (size - hole) / 2;
    g.fillStyle = '#c8c8c8';
    g.fillRect(at - 4, at - 4, hole + 8, hole + 8);
    const depth = g.createRadialGradient(size / 2, size / 2, hole * 0.1, size / 2, size / 2, hole * 0.7);
    depth.addColorStop(0, '#000');
    depth.addColorStop(1, '#1c1a18');
    g.fillStyle = depth;
    g.fillRect(at, at, hole, hole);
  });
}

function speckle(g, size, rand, count) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = `rgb(0 0 0 / ${0.05 + rand() * 0.12})`;
    g.fillRect(rand() * size, rand() * size, 2, 2);
  }
}
