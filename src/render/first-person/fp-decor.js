// What the party sees on the walls, the floors and the doors of a level, drawn
// for real in the first-person view (ornament-art.js gives the drawings):
// - wall ornaments: the one each face shows (ornaments.js), as a plane on the face;
// - alcoves: a dark niche with a sill;
// - inscriptions and messages shown: engraved letters;
// - floor ornaments: a decal on the floor (pressure pads, moss…);
// - doors: one leaf per door, with the texture of its type and its ornament (a broken
//   door: the leaf with a jagged hole, in place), at its step (docs/028): a vertical door
//   rises, a horizontal one parts in two halves that slide into the walls; the button of
//   a door, on a post on the right of the doorway (seen from either side), does not move.
// Units as in level-meshes.js, in the local coordinates of the level (tile (x, y)
// spans [x, x+1]). Textures are cached by name for the life of the view.

import * as THREE from 'three';
import { shownOrnament, shownFloorOrnament, isAlcove, doorLook } from '../../core/ornaments.js';
import { WALL_ART, FLOOR_ART, DOOR_TYPES, DOOR_ART, doorButton, brokenDoor } from './ornament-art.js';
import { doorStep, DOOR_CLOSED } from '../../core/tile-states.js';

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
const PARTED_DOOR_VISIBLE = 0.1; // part of each half of an open horizontal door still in the doorway (tiles; the button posts cover 0.1)
// Door button: on a post at each side of the doorway (tiles from its middle, width), half-way
// up, on the face that is on the right as seen from that side: in DM the button is on the
// right of the door, from either side.
const BUTTON_POST = { x: 0.45, width: 0.1 };
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

  function wallOrnaments(level, x, y, holders) {
    const meshes = [];
    for (let face = 0; face < 4; face++) {
      if (isAlcove(dungeon, level, x, y, face, state.actuatorsAt)) meshes.push(...niche(x, y, face));
      const name = shownOrnament(dungeon, level, x, y, face, state.actuatorsAt, state.textVisible);
      const art = name && WALL_ART[name];
      if (!art) continue; // nothing, an alcove (the niche), or an unknown name (none in DM)
      if (name === 'Full Torch Holder') holders.push({ x, y, face });
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

  // Half of a texture (left or right), for the halves of a horizontal door.
  function halfTexture(key, full, side) {
    const halfKey = `${key}|${side}`;
    if (!textures.has(halfKey)) {
      const t = full.clone();
      t.repeat.set(0.5, 1);
      t.offset.set(side === 'left' ? 0 : 0.5, 0);
      t.needsUpdate = true;
      textures.set(halfKey, t);
    }
    return textures.get(halfKey);
  }

  // A door: its leaf (or its two halves) and its button. Each part is an InstancedMesh of
  // 1 instance, so that the pointer can pick it (fp-renderer.js only picks instanced
  // meshes); userData as level-meshes.js.
  function door(level, x, y, tile, map) {
    const look = doorLook(dungeon, level, x, y);
    if (!look) return [];
    const broken = Boolean(tile.detail.broken);
    const key = `door:${look.type}|${look.ornament}|${broken}`;
    const leaf = texture(key, TEXTURE_SIZE, Math.round(TEXTURE_SIZE * wallHeight), (g, w, h) => {
      (DOOR_TYPES[look.type] ?? DOOR_TYPES.Wooden)(g, w, h);
      DOOR_ART[look.ornament]?.(g, w, h);
      if (broken) brokenDoor(g, w, h);
    });
    // Share of the way still to go before the door is closed: 0 closed (or broken, in place), 1 open.
    const open = broken ? 0 : (DOOR_CLOSED - doorStep(tile.detail)) / DOOR_CLOSED;
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tile.detail.orientation === 'NS' ? 0 : Math.PI / 2);
    const info = { level, x, y, gx: x + map.offset.x, gy: y + map.offset.y, type: 'door', detail: tile.detail };
    // A part of the door: a box of `width` × `height`, centred at `along` (tiles, across the
    // passage) and `up` (from the floor), in the plane of the leaf.
    // `map` is a texture, or an array of 6 (one per face: +x, -x, +y, -y, +z, -z).
    const part = (map, width, height, depth, along, up, alphaTest = 0.5) => {
      const material = Array.isArray(map)
        ? map.map((m) => new THREE.MeshLambertMaterial({ map: m }))
        : new THREE.MeshLambertMaterial({ map, alphaTest, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(width, height, depth), material, 1);
      const offset = new THREE.Vector3(along, 0, 0).applyQuaternion(rotation);
      mesh.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(x + 0.5 + offset.x, up, y + 0.5 + offset.z), rotation, new THREE.Vector3(1, 1, 1)));
      mesh.computeBoundingSphere();
      mesh.userData = { part: 'doorLeaf', variant: 'all', tiles: [info], baseOpacity: 1 };
      return mesh;
    };
    const parts = [];
    if (tile.detail.vertical === false && !broken) {
      // Two halves sliding sideways into the walls; open, their edges stay in the doorway.
      for (const [side, sign] of [['left', -1], ['right', 1]]) {
        const slide = open * (0.5 - PARTED_DOOR_VISIBLE);
        parts.push(part(halfTexture(key, leaf, side), 0.5, wallHeight, DOOR_THICKNESS, sign * (0.25 + slide), wallHeight / 2));
      }
    } else {
      // Raised like a portcullis: open, only its lower edge stays in the doorway.
      parts.push(part(leaf, 1, wallHeight, DOOR_THICKNESS, 0, open * wallHeight * (1 - RAISED_DOOR_VISIBLE) + wallHeight / 2));
    }
    if (look.button) {
      const { x: along, width } = BUTTON_POST;
      const post = (withButton) =>
        texture(`door:post|${withButton}`, 32, Math.round((32 * wallHeight) / width), (g, w, h) => {
          g.fillStyle = '#5e5a54';
          g.fillRect(0, 0, w, h);
          if (!withButton) return;
          g.translate(0, (h - w) / 2);
          doorButton(g, w, w);
        });
      const [plain, button] = [post(false), post(true)];
      // Seen from +z (local), the right is +x; from -z, it is -x.
      parts.push(part([plain, plain, plain, plain, button, plain], width, wallHeight, DOOR_THICKNESS + 0.04, along, wallHeight / 2));
      parts.push(part([plain, plain, plain, plain, plain, button], width, wallHeight, DOOR_THICKNESS + 0.04, -along, wallHeight / 2));
    }
    return parts;
  }

  return {
    /**
     * Decor of a level: { meshes, doors, torchHolders }. `meshes` are plain meshes (ornaments,
     * niches, inscriptions, floor decals); `doors` are pickable instanced meshes. Their textures
     * stay in the cache: dispose geometries and materials only. `torchHolders`: the wall faces
     * showing a full torch holder, [{ x, y, face }] (lights of the view, docs/035).
     */
    build(level) {
      const map = dungeon.level(level);
      const meshes = [];
      const doors = [];
      const torchHolders = [];
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const tile = state.tileAt(level, x, y);
          if (tile.type === 'wall') {
            meshes.push(...wallOrnaments(level, x, y, torchHolders));
            if (tile.detail) meshes.push(...inscriptions(tile.detail, x, y));
          } else if (tile.type === 'door') {
            doors.push(...door(level, x, y, tile, map));
          } else if (tile.type !== 'pit' && tile.type !== 'stairs') {
            meshes.push(...floorOrnament(level, x, y));
          }
        }
      }
      return { meshes, doors, torchHolders };
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
