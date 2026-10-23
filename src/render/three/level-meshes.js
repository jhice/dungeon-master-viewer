// Builds the meshes of one level: one InstancedMesh per tile part (wall, floor,
// door leaf…), so the whole dungeon takes about a hundred draw calls.
// Units: 1 tile = 1 unit; x = east, z = south, y = up. Level floor at y = 0
// inside its group; groups are stacked by the renderer.

import * as THREE from 'three';

export const WALL_HEIGHT = 0.8;
const FLOOR_THICKNESS = 0.05;
const STEPS = 3;

// Rotation (around y) that turns the "+z" stairs model so it rises away from its access side.
const STAIRS_ROTATION = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };

/**
 * Part definitions: geometry, colour key in the theme, and a function that
 * pushes instance matrices for a tile.
 */
function partDefinitions(theme) {
  return {
    wall: { geometry: new THREE.BoxGeometry(1, WALL_HEIGHT, 1), color: theme.wall },
    fakewall: { geometry: new THREE.BoxGeometry(1, WALL_HEIGHT, 1), color: theme.fakewall },
    floor: { geometry: new THREE.BoxGeometry(1, FLOOR_THICKNESS, 1), color: theme.floor },
    pit: { geometry: new THREE.CylinderGeometry(0.38, 0.38, 0.02, 24), color: theme.pit },
    stepUp: { geometry: new THREE.BoxGeometry(1, 1, 1 / STEPS), color: theme.stairsUp },
    stepDown: { geometry: new THREE.BoxGeometry(1, 1, 1 / STEPS), color: theme.stairsDown },
    door: { geometry: new THREE.BoxGeometry(1, WALL_HEIGHT * 0.9, 0.12), color: theme.door },
    teleporter: {
      geometry: new THREE.BoxGeometry(0.7, WALL_HEIGHT * 0.9, 0.7),
      color: theme.teleporter,
      emissive: true,
      opacity: 0.45,
    },
  };
}

/**
 * @returns {{ group: THREE.Group, meshes: THREE.InstancedMesh[] }}
 * Each mesh has userData.tiles[instanceId] = tile info (for hovering) and
 * userData.baseOpacity.
 */
export function buildLevelMeshes(dungeon, levelIndex, theme, center) {
  const map = dungeon.level(levelIndex);
  const parts = partDefinitions(theme);
  const instances = Object.fromEntries(Object.keys(parts).map((k) => [k, []]));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  const add = (part, info, position, scale = [1, 1, 1], rotationY = 0) => {
    q.setFromAxisAngle(up, rotationY);
    instances[part].push({ matrix: m4.clone().compose(new THREE.Vector3(...position), q, new THREE.Vector3(...scale)), info });
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = dungeon.tileAt(levelIndex, x, y);
      const gx = x + map.offset.x;
      const gy = y + map.offset.y;
      const info = { level: levelIndex, x, y, gx, gy, type: tile.type, detail: tile.detail };
      const px = gx + 0.5 - center.x;
      const pz = gy + 0.5 - center.z;

      if (tile.type === 'wall' || tile.type === 'fakewall') {
        add(tile.type, info, [px, WALL_HEIGHT / 2, pz]);
        continue;
      }
      if (tile.type === 'stairs') {
        addStairs(add, info, px, pz, dungeon.accessSide(levelIndex, x, y));
        continue;
      }
      add('floor', info, [px, -FLOOR_THICKNESS / 2, pz]);
      if (tile.type === 'pit') add('pit', info, [px, 0.011, pz]);
      if (tile.type === 'teleporter') add('teleporter', info, [px, (WALL_HEIGHT * 0.9) / 2, pz]);
      if (tile.type === 'door') {
        // The leaf lies across the passage axis: an NS passage gets an east-west leaf.
        add('door', info, [px, (WALL_HEIGHT * 0.9) / 2, pz], [1, 1, 1], tile.detail.orientation === 'NS' ? 0 : Math.PI / 2);
      }
    }
  }

  const group = new THREE.Group();
  group.name = `level-${levelIndex}`;
  const meshes = [];
  for (const [part, list] of Object.entries(instances)) {
    if (!list.length) continue;
    const def = parts[part];
    const material = new THREE.MeshLambertMaterial({
      color: def.color,
      ...(def.emissive && { emissive: def.color, emissiveIntensity: 0.6 }),
    });
    const mesh = new THREE.InstancedMesh(def.geometry, material, list.length);
    list.forEach(({ matrix }, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = `${group.name}-${part}`;
    mesh.userData = { part, tiles: list.map((l) => l.info), baseOpacity: def.opacity ?? 1 };
    group.add(mesh);
    meshes.push(mesh);
  }
  return { group, meshes };
}

// Stairs model: STEPS boxes along +z. Up stairs rise from the floor; down stairs
// sink below it. Both start at the access side (z = -0.5 before rotation).
function addStairs(add, info, px, pz, accessSide) {
  const goingUp = info.detail.direction === 'up';
  const rotation = STAIRS_ROTATION[accessSide ?? (info.detail.orientation === 'WE' ? 'W' : 'N')];
  const sin = Math.sin(rotation);
  const cos = Math.cos(rotation);
  for (let i = 0; i < STEPS; i++) {
    const height = (WALL_HEIGHT * (i + 1)) / (STEPS + 1);
    const localZ = -0.5 + (i + 0.5) / STEPS;
    // Rotate the step offset (0, localZ) around y.
    const dx = localZ * sin;
    const dz = localZ * cos;
    const yCenter = goingUp ? height / 2 : -height / 2;
    add(goingUp ? 'stepUp' : 'stepDown', info, [px + dx, yCenter, pz + dz], [1, height, 1], rotation);
  }
}

export function disposeLevelMeshes(meshes) {
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh.dispose();
  }
}
