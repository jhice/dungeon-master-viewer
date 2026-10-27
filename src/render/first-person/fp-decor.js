// What the party sees on the walls, the floors and the doors of a level, drawn
// for real in the first-person view (ornament-art.js gives the drawings):
// - wall ornaments: the one each face shows (ornaments.js), as a plane on the face;
// - alcoves: a dark niche with a sill;
// - inscriptions and messages shown: engraved letters;
// - floor ornaments: a decal on the floor (pressure pads, moss…);
// - doors: one leaf per door, with the texture of its type, its ornament and its button
//   (a broken door: the leaf with a jagged hole, in place).
// Units as in level-meshes.js, in the local coordinates of the level (tile (x, y)
// spans [x, x+1]). Textures are cached by name for the life of the view.

import * as THREE from 'three';
import { shownOrnament, shownFloorOrnament, isAlcove, doorLook } from '../../core/ornaments.js';
import { WALL_ART, FLOOR_ART, DOOR_TYPES, DOOR_ART, doorButton, brokenDoor } from './ornament-art.js';

// Plane position and rotation per face (N, E, S, W): offset from the tile centre, rotation around y.
const FACE_PLANES = [
  { dx: 0, dz: -0.5, rotation: Math.PI },
  { dx: 0.5, dz: 0, rotation: Math.PI / 2 },
  { dx: 0, dz: 0.5, rotation: 0 },
  { dx: -0.5, dz: 0, rotation: -Math.PI / 2 },
];
const ORNAMENT_GAP = 0.004; // in front of the face, against z-fighting
const INSCRIPTION_GAP = 0.006; // over an ornament of the same face
const FLOOR_GAP = 0.003;
// Alcove: niche bottom / top, as fractions of the wall height (items on a wall stand
// at 35 % of its height, see level-contents.js).
const NICHE = { width: 0.5, bottom: 0.33, top: 0.75 };
const DOOR_THICKNESS = 0.03;
const RAISED_DOOR_VISIBLE = 0.15; // part of an open door still in the doorway, as in level-meshes.js
const TEXTURE_SIZE = 256;

/**
 * @param {import('../../core/dungeon.js').Dungeon} dungeon
 * @param {object} state simulation state (tileAt, actuatorsAt, textVisible)
 * @param {number} wallHeight
 */
export function createDecor(dungeon, state, wallHeight) {
  const textures = new Map(); // key -> CanvasTexture

  function texture(key, width, height, draw) {
    if (!textures.has(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      draw(canvas.getContext('2d'), width, height);
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      textures.set(key, t);
    }
    return textures.get(key);
  }

  // A transparent plane on a wall face: width w, height h, bottom at y (tiles).
  function facePlane(x, y, face, map, w, h, bottom, gap) {
    const { dx, dz, rotation } = FACE_PLANES[face];
    const out = 1 + gap / 0.5;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false }));
    mesh.position.set(x + 0.5 + dx * out, bottom + h / 2, y + 0.5 + dz * out);
    mesh.rotation.y = rotation;
    return mesh;
  }

  function wallOrnaments(level, x, y) {
    const meshes = [];
    for (let face = 0; face < 4; face++) {
      if (isAlcove(dungeon, level, x, y, face, state.actuatorsAt)) meshes.push(...niche(x, y, face));
      const name = shownOrnament(dungeon, level, x, y, face, state.actuatorsAt);
      const art = name && WALL_ART[name];
      if (!art) continue; // nothing, an alcove (the niche), or an unknown name (none in DM)
      const height = art.h * wallHeight;
      const canvasHeight = Math.round((TEXTURE_SIZE * height) / art.w);
      const map = texture(`wall:${name}`, TEXTURE_SIZE, canvasHeight, art.draw);
      meshes.push(facePlane(x, y, face, map, art.w, height, art.y * wallHeight, ORNAMENT_GAP));
    }
    return meshes;
  }

  function niche(x, y, face) {
    const { dx, dz, rotation } = FACE_PLANES[face];
    const out = 1 + ORNAMENT_GAP / 0.5;
    const height = (NICHE.top - NICHE.bottom) * wallHeight;
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(NICHE.width, height), new THREE.MeshLambertMaterial({ color: 0x0c0a08 }));
    hole.position.set(x + 0.5 + dx * out, NICHE.bottom * wallHeight + height / 2, y + 0.5 + dz * out);
    hole.rotation.y = rotation;
    const sill = new THREE.Mesh(new THREE.BoxGeometry(NICHE.width + 0.06, 0.025, 0.05), new THREE.MeshLambertMaterial({ color: 0x8a8070 }));
    sill.position.set(x + 0.5 + dx * (1 + 0.05), NICHE.bottom * wallHeight, y + 0.5 + dz * (1 + 0.05));
    sill.rotation.y = rotation;
    return [hole, sill];
  }

  // Visible texts on a wall face, engraved in the stone. Messages hidden until a
  // mechanism shows them are drawn once visible (the level is rebuilt).
  function inscriptions(detail, x, y) {
    const meshes = [];
    for (const ref of detail.items ?? []) {
      if (ref.kind !== 'text' || !state.textVisible(ref.index)) continue;
      const lines = dungeon.data.texts[ref.index].text.split('\n');
      const map = texture(`text:${ref.index}`, 512, 256, (g, w, h) => engrave(g, w, h, lines));
      const height = 0.43;
      meshes.push(facePlane(x, y, ref.position, map, 0.86, height, wallHeight * 0.55 - height / 2, INSCRIPTION_GAP));
    }
    return meshes;
  }

  function floorOrnament(level, x, y) {
    const name = shownFloorOrnament(dungeon, level, x, y, state.actuatorsAt);
    const art = name && FLOOR_ART[name];
    if (!art) return [];
    const map = texture(`floor:${name}`, TEXTURE_SIZE, TEXTURE_SIZE, art.draw);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(art.size, art.size), new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; // facing up
    mesh.position.set(x + 0.5, FLOOR_GAP, y + 0.5);
    return [mesh];
  }

  // A door leaf: one InstancedMesh of 1 instance, so that the pointer can pick it
  // (fp-renderer.js only picks instanced meshes); userData as level-meshes.js.
  function door(level, x, y, tile, map) {
    const look = doorLook(dungeon, level, x, y);
    if (!look) return null;
    const broken = Boolean(tile.detail.broken);
    const key = `door:${look.type}|${look.ornament}|${look.button}|${broken}`;
    const leaf = texture(key, TEXTURE_SIZE, Math.round(TEXTURE_SIZE * wallHeight), (g, w, h) => {
      (DOOR_TYPES[look.type] ?? DOOR_TYPES.Wooden)(g, w, h);
      DOOR_ART[look.ornament]?.(g, w, h);
      if (look.button) doorButton(g, w, h);
      if (broken) brokenDoor(g, w, h);
    });
    const material = new THREE.MeshLambertMaterial({ map: leaf, alphaTest: 0.5, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, wallHeight, DOOR_THICKNESS), material, 1);
    // Raised like a portcullis when open: only its lower edge stays in the doorway.
    const bottom = tile.detail.open && !broken ? wallHeight * (1 - RAISED_DOOR_VISIBLE) : 0;
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tile.detail.orientation === 'NS' ? 0 : Math.PI / 2);
    mesh.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(x + 0.5, bottom + wallHeight / 2, y + 0.5), rotation, new THREE.Vector3(1, 1, 1)));
    mesh.computeBoundingSphere();
    const info = { level, x, y, gx: x + map.offset.x, gy: y + map.offset.y, type: 'door', detail: tile.detail };
    mesh.userData = { part: 'doorLeaf', variant: 'all', tiles: [info], baseOpacity: 1 };
    return mesh;
  }

  return {
    /**
     * Decor of a level: { meshes, doors }. `meshes` are plain meshes (ornaments, niches,
     * inscriptions, floor decals); `doors` are pickable instanced meshes. Their textures
     * stay in the cache: dispose geometries and materials only.
     */
    build(level) {
      const map = dungeon.level(level);
      const meshes = [];
      const doors = [];
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const tile = state.tileAt(level, x, y);
          if (tile.type === 'wall') {
            meshes.push(...wallOrnaments(level, x, y));
            if (tile.detail) meshes.push(...inscriptions(tile.detail, x, y));
          } else if (tile.type === 'door') {
            const leaf = door(level, x, y, tile, map);
            if (leaf) doors.push(leaf);
          } else if (tile.type !== 'pit' && tile.type !== 'stairs') {
            meshes.push(...floorOrnament(level, x, y));
          }
        }
      }
      return { meshes, doors };
    },
    dispose() {
      for (const t of textures.values()) t.dispose();
      textures.clear();
    },
  };
}

// Pale letters with a dark lower edge (engraved look), as large as the longest line allows.
function engrave(g, width, height, lines) {
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
}
