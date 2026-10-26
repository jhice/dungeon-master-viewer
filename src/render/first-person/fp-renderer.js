// First-person view of the simulation (Three.js): the party's level only, with
// full-height walls, a ceiling and a uniform light (answer Q7: permanent light).
// Reuses level-meshes.js in its `game` look, fed by the simulation state.
// Units as in level-meshes.js: 1 tile = 1 unit, x = east, z = south, y = up;
// here the level is built in local coordinates (tile (x, y) spans [x, x+1]).
//
// Rendering is on demand (party moved, state changed, resize): no loop yet.

import * as THREE from 'three';
import { buildLevelMeshes, disposeLevelMeshes } from '../three/level-meshes.js';
import { readTheme } from '../three/theme.js';
import { FACINGS } from '../../sim/party.js';

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
 * @param {{ tileAt(level, x, y): object }} state simulation state (src/sim/state.js)
 */
export function createFirstPersonRenderer(container, dungeon, state) {
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
    const { group, meshes } = buildLevelMeshes(dungeon, levelIndex, theme, { x: map.offset.x, z: map.offset.y }, {
      wallHeight: WALL_HEIGHT,
      tileAt: state.tileAt,
      game: true,
    });
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
    built = { group, meshes, ceiling };
  }

  function clear() {
    if (!built) return;
    scene.remove(built.group);
    disposeLevelMeshes(built.meshes);
    built.ceiling.geometry.dispose();
    built.ceiling.material.dispose();
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
      clear();
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
