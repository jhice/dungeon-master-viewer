// Contents of one level in 3D: items and creatures, as three InstancedMeshes
// with per-instance colours (items, creatures, "has contents" markers), so the
// contents cost 3 draw calls per level whatever the number of objects.
// Creatures have their own meshes (buildLevelCreatures()), rebuilt alone when they move.
// Same frame as level-meshes.js: x = east, z = south, y = up, floor at y = 0.

import * as THREE from 'three';
import { tileContents, subcellOffset, FACES } from '../../core/contents.js';
import { actuatorFamily } from '../../core/logic.js';
import { CATEGORY_COLORS, FAMILY_COLORS, HAS_CONTENTS_COLOR, TEXT_COLORS, creatureColor } from '../palette.js';

const CHAMPION_SHEET = /\n[MF]\n[A-P]{12}\n/;

const ITEM_SIZE = 0.16;
const ITEM_HEIGHT = 0.1;
const CREATURE_RADIUS = 0.13;
const CREATURE_HEIGHT = 0.7;
const NOSE_SIZE = [0.07, 0.07, 0.1]; // facing marker, in front of the cylinder
const NOSE_COLOR = '#1a1a1a';
// Offset of a wall item from the wall centre, towards the face it lies on.
const FACE_DIRECTION = [
  [0, -1], // N
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
];

/**
 * @param {object} options
 * @param {number} options.wallHeight
 * @param {(level, x, y) => object|null} [options.contentsAt] contents of a tile (default: dungeon.json;
 *   the simulation passes the items lying there now)
 * @returns {Array<THREE.InstancedMesh>} meshes with userData { part, layer, variant: 'all', tiles, baseOpacity };
 *   for items, tiles[i].item is the item ({ kind, index, position }); creatures: see buildLevelCreatures()
 */
export function buildLevelContents(dungeon, levelIndex, center, { wallHeight, contentsAt = (l, x, y) => tileContents(dungeon, l, x, y) }) {
  const map = dungeon.level(levelIndex);
  const items = []; // { position: [x, y, z], color, info }
  const rings = []; // { position, info }
  const plates = []; // floor triggers: thin plate under the tile contents
  const gizmos = []; // other mechanisms: small octahedrons (on the wall face, or centred)
  const writings = []; // texts: thin plates on the wall face (or flat on the floor)

  // Every tile, not only those of dungeon.json: items may have been dropped anywhere.
  for (const { x, y, gx, gy, detail } of allTiles(dungeon, levelIndex)) {
    const info = { level: levelIndex, x, y, gx, gy, type: detail.type, detail };
    const ox = gx - center.x; // west edge of the tile
    const oz = gy - center.z; // north edge of the tile
    const onWall = detail.type === 'wall';

    const seen = new Set();
    for (const ref of detail.items ?? []) {
      if (ref.kind !== 'actuator') continue;
      const family = actuatorFamily(dungeon.data.actuators[ref.index]);
      if (family === 'inactive' || family === 'portrait') continue;
      const onFace = onWall && (family === 'wallTrigger' || family === 'shooter');
      const key = onFace ? `${family}:${ref.position}` : family;
      if (seen.has(key)) continue;
      seen.add(key);
      const color = FAMILY_COLORS[family];
      if (family === 'floorTrigger') {
        plates.push({ position: [ox + 0.5, 0.012, oz + 0.5], color, info });
      } else if (onFace) {
        const [dx, dz] = FACE_DIRECTION[ref.position];
        gizmos.push({ position: [ox + 0.5 + dx * 0.56, wallHeight * 0.6, oz + 0.5 + dz * 0.56], color, info });
      } else {
        // Logic gates on walls, generators on floors: above the tile.
        gizmos.push({ position: [ox + 0.5, (onWall ? wallHeight : 0) + 0.25, oz + 0.5], scale: 1.6, color, info });
      }
    }

    for (const ref of detail.items ?? []) {
      if (ref.kind !== 'text') continue;
      const text = dungeon.data.texts[ref.index];
      if (CHAMPION_SHEET.test(text.text)) continue; // champion sheets: their mirror is marked already
      const color = TEXT_COLORS[text.visible ? 'inscription' : 'message'];
      if (onWall) {
        const [dx, dz] = FACE_DIRECTION[ref.position];
        const scale = dx ? [0.02, 0.22, 0.5] : [0.5, 0.22, 0.02];
        writings.push({ position: [ox + 0.5 + dx * 0.51, wallHeight * 0.75, oz + 0.5 + dz * 0.51], scale, color, info });
      } else {
        writings.push({ position: [ox + 0.5, 0.03, oz + 0.5], scale: [0.35, 0.02, 0.35], color, info });
      }
    }

    const contents = contentsAt(levelIndex, x, y);
    if (!contents) continue;

    // Items stacked per position: on the floor in their sub-tile, on a wall against their face.
    const stacks = new Map();
    for (const item of contents.items) {
      const stack = stacks.get(item.position) ?? [];
      stacks.set(item.position, stack);
      let base;
      if (onWall) {
        const [dx, dz] = FACE_DIRECTION[item.position];
        base = [ox + 0.5 + dx * (0.5 + ITEM_SIZE / 2), wallHeight * 0.35, oz + 0.5 + dz * (0.5 + ITEM_SIZE / 2)];
      } else {
        const [u, v] = subcellOffset(item.position);
        base = [ox + u, 0, oz + v];
      }
      const position = [base[0], base[1] + ITEM_HEIGHT / 2 + stack.length * ITEM_HEIGHT * 1.05, base[2]];
      items.push({ position, color: CATEGORY_COLORS[item.category], info: { ...info, item } });
      if (item.contents?.length) rings.push({ position: [position[0], position[1] + ITEM_HEIGHT, position[2]], info });
      stack.push(item);
    }

  }

  const meshes = [];
  if (items.length) {
    meshes.push(instanced('items', 'items', new THREE.BoxGeometry(ITEM_SIZE, ITEM_HEIGHT, ITEM_SIZE), items, levelIndex));
  }
  if (rings.length) {
    // Rings follow the items layer (chests) or the creatures layer (possessions): keep them in their own
    // layer 'contents', visible when either layer is on.
    const withColor = rings.map((r) => ({ ...r, color: HAS_CONTENTS_COLOR }));
    meshes.push(instanced('hasContents', 'contents', new THREE.SphereGeometry(0.1, 10, 8), withColor, levelIndex));
  }
  if (plates.length) {
    meshes.push(instanced('floorTriggers', 'mechanisms', new THREE.BoxGeometry(0.8, 0.02, 0.8), plates, levelIndex));
  }
  if (gizmos.length) {
    meshes.push(instanced('mechanisms', 'mechanisms', new THREE.OctahedronGeometry(0.07), gizmos, levelIndex));
  }
  if (writings.length) {
    meshes.push(instanced('texts', 'texts', new THREE.BoxGeometry(1, 1, 1), writings, levelIndex));
  }
  meshes.push(...buildLevelCreatures(dungeon, levelIndex, center, { wallHeight, contentsAt }));
  return meshes;
}

/**
 * Creatures of one level: a cylinder per member (in its sub-tile, or centred if alone),
 * a dark "nose" towards the facing of its group, and a ring above the members of a group
 * carrying items. Same options as buildLevelContents().
 * @returns {Array<THREE.InstancedMesh>} meshes with userData.creatures = true (and the userData above)
 */
export function buildLevelCreatures(dungeon, levelIndex, center, { wallHeight, contentsAt = (l, x, y) => tileContents(dungeon, l, x, y) }) {
  const creatures = []; // { position, color, info }
  const noses = []; // { position, rotation, color, info }
  const rings = []; // { position, info }
  const height = CREATURE_HEIGHT * wallHeight; // standing on the floor
  for (const { x, y, gx, gy, detail } of allTiles(dungeon, levelIndex)) {
    const creature = contentsAt(levelIndex, x, y)?.creature;
    if (!creature) continue;
    const info = { level: levelIndex, x, y, gx, gy, type: detail.type, detail };
    const [fx, fz] = FACE_DIRECTION[FACES.indexOf(creature.facing)];
    for (const member of creature.members) {
      // A lone creature stands in the centre, with the same size as a group member.
      const [u, v] = member.position === null ? [0.5, 0.5] : subcellOffset(member.position);
      const position = [gx - center.x + u, height / 2, gy - center.z + v];
      creatures.push({ position, color: creatureColor(creature.type), info });
      noses.push({
        position: [position[0] + fx * CREATURE_RADIUS, height * 0.8, position[2] + fz * CREATURE_RADIUS],
        scale: fx ? [NOSE_SIZE[2], NOSE_SIZE[1], NOSE_SIZE[0]] : NOSE_SIZE,
        color: NOSE_COLOR,
        info,
      });
      if (creature.possessions.length) rings.push({ position: [position[0], height + 0.06, position[2]], color: HAS_CONTENTS_COLOR, info });
    }
  }
  const meshes = [];
  if (creatures.length) {
    meshes.push(instanced('creatures', 'creatures', new THREE.CylinderGeometry(CREATURE_RADIUS, CREATURE_RADIUS, height, 12), creatures, levelIndex));
    meshes.push(instanced('creatureFacing', 'creatures', new THREE.BoxGeometry(1, 1, 1), noses, levelIndex));
  }
  // Rings follow the items layer (chests) or the creatures layer (possessions): layer 'contents'.
  if (rings.length) meshes.push(instanced('creatureContents', 'contents', new THREE.SphereGeometry(0.1, 10, 8), rings, levelIndex));
  for (const mesh of meshes) mesh.userData.creatures = true;
  return meshes;
}

function* allTiles(dungeon, levelIndex) {
  const map = dungeon.level(levelIndex);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = dungeon.tileAt(levelIndex, x, y);
      yield { x, y, gx: x + map.offset.x, gy: y + map.offset.y, detail: tile.detail ?? { type: tile.type } };
    }
  }
}

function instanced(part, layer, geometry, list, levelIndex) {
  // White base colour: the per-instance colour is multiplied by it.
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
  const m4 = new THREE.Matrix4();
  const color = new THREE.Color();
  list.forEach(({ position, scale = 1, color: hex }, i) => {
    // `scale` is a number (uniform) or [sx, sy, sz] (text plates).
    m4.makeScale(...(Array.isArray(scale) ? scale : [scale, scale, scale])).setPosition(...position);
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, color.set(hex));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = `level-${levelIndex}-${part}`;
  mesh.userData = { part, layer, variant: 'all', tiles: list.map((l) => l.info), baseOpacity: 1 };
  return mesh;
}
