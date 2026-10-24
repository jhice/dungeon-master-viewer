// Contents of one level in 3D: items and creatures, as three InstancedMeshes
// with per-instance colours (items, creatures, "has contents" markers), so the
// contents cost 3 draw calls per level whatever the number of objects.
// Same frame as level-meshes.js: x = east, z = south, y = up, floor at y = 0.

import * as THREE from 'three';
import { tileContents, subcellOffset } from '../../core/contents.js';
import { CATEGORY_COLORS, HAS_CONTENTS_COLOR, creatureColor } from '../palette.js';

const ITEM_SIZE = 0.16;
const ITEM_HEIGHT = 0.1;
const CREATURE_RADIUS = 0.13;
const CREATURE_HEIGHT = 0.36;
// Offset of a wall item from the wall centre, towards the face it lies on.
const FACE_DIRECTION = [
  [0, -1], // N
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
];

/**
 * @returns {Array<THREE.InstancedMesh>} meshes with userData { part, layer, variant: 'all', tiles, baseOpacity }
 */
export function buildLevelContents(dungeon, levelIndex, center, { wallHeight }) {
  const map = dungeon.level(levelIndex);
  const items = []; // { position: [x, y, z], color, info }
  const creatures = []; // { position, scale, color, info }
  const rings = []; // { position, info }

  for (const { x, y, gx, gy, detail } of dungeon.detailedTiles(levelIndex)) {
    const contents = tileContents(dungeon, levelIndex, x, y);
    if (!contents) continue;
    const info = { level: levelIndex, x, y, gx, gy, type: detail.type, detail };
    const ox = gx - center.x; // west edge of the tile
    const oz = gy - center.z; // north edge of the tile
    const onWall = detail.type === 'wall';

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
      items.push({ position, color: CATEGORY_COLORS[item.category], info });
      if (item.contents?.length) rings.push({ position: [position[0], position[1] + ITEM_HEIGHT, position[2]], info });
      stack.push(item);
    }

    const creature = contents.creature;
    if (creature) {
      for (const member of creature.members) {
        const alone = member.position === null;
        const [u, v] = alone ? [0.5, 0.5] : subcellOffset(member.position);
        const scale = alone ? 1.5 : 1;
        const position = [ox + u, (CREATURE_HEIGHT * scale) / 2, oz + v];
        creatures.push({ position, scale, color: creatureColor(creature.type), info });
        if (creature.possessions.length) rings.push({ position: [position[0], CREATURE_HEIGHT * scale + 0.06, position[2]], info });
      }
    }
  }

  const meshes = [];
  if (items.length) {
    meshes.push(instanced('items', 'items', new THREE.BoxGeometry(ITEM_SIZE, ITEM_HEIGHT, ITEM_SIZE), items, levelIndex));
  }
  if (creatures.length) {
    meshes.push(instanced('creatures', 'creatures', new THREE.ConeGeometry(CREATURE_RADIUS, CREATURE_HEIGHT, 12), creatures, levelIndex));
  }
  if (rings.length) {
    // Rings follow the items layer (chests) or the creatures layer (possessions): keep them in their own
    // layer 'contents', visible when either layer is on.
    const withColor = rings.map((r) => ({ ...r, color: HAS_CONTENTS_COLOR }));
    meshes.push(instanced('hasContents', 'contents', new THREE.SphereGeometry(0.045, 10, 8), withColor, levelIndex));
  }
  return meshes;
}

function instanced(part, layer, geometry, list, levelIndex) {
  // White base colour: the per-instance colour is multiplied by it.
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
  const m4 = new THREE.Matrix4();
  const color = new THREE.Color();
  list.forEach(({ position, scale = 1, color: hex }, i) => {
    m4.makeScale(scale, scale, scale).setPosition(...position);
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
