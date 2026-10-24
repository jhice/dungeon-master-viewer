// Builds the meshes of one level: one InstancedMesh per tile part (wall, floor,
// door leaf…), so the whole dungeon takes about a hundred draw calls.
// Units: 1 tile = 1 unit; x = east, z = south, y = up. Level floor at y = 0
// inside its group; groups are stacked by the renderer.
//
// Tiles with a state (doors, pits, fake walls) can look different with states
// shown or hidden. Each mesh therefore has a `variant`:
//   'all'    always visible
//   'types'  only when states are hidden (types-only rendering, as in 005)
//   'states' only when states are shown
// The renderer toggles mesh visibility; nothing is rebuilt.

import * as THREE from 'three';
import { tileState } from '../../core/tile-states.js';

// Wall height is a setting (fraction of a tile, 1 = cube); doors and
// teleporters are 90 % of it, stairs span it.
export const DEFAULT_WALL_HEIGHT = 0.7;
const FLOOR_THICKNESS = 0.05;
const STEPS = 3;
const dimensions = (wallHeight) => ({ wall: wallHeight, door: wallHeight * 0.9 });
// Part of the leaf still visible when an open door is raised into the lintel.
const RAISED_DOOR_VISIBLE = 0.25;
const HIDDEN_OPACITY = 0.4; // invisible pits, imaginary walls: faded but visible

// Rotation (around y) that turns the "+z" stairs model so it rises away from its access side.
const STAIRS_ROTATION = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };

/**
 * Part definitions: geometry, colour key in the theme, and a function that
 * pushes instance matrices for a tile.
 */
function partDefinitions(theme, h) {
  return {
    wall: { geometry: new THREE.BoxGeometry(1, h.wall, 1), color: theme.wall },
    fakewall: { geometry: new THREE.BoxGeometry(1, h.wall, 1), color: theme.fakewall },
    floor: { geometry: new THREE.BoxGeometry(1, FLOOR_THICKNESS, 1), color: theme.floor },
    fakewallImaginary: { geometry: new THREE.BoxGeometry(1, h.wall, 1), color: theme.fakewall, opacity: HIDDEN_OPACITY },
    pit: { geometry: new THREE.CylinderGeometry(0.38, 0.38, 0.02, 24), color: theme.pit },
    pitHidden: { geometry: new THREE.CylinderGeometry(0.38, 0.38, 0.02, 24), color: theme.pit, opacity: HIDDEN_OPACITY },
    pitLid: { geometry: new THREE.CylinderGeometry(0.38, 0.38, 0.02, 24), color: theme.pitLid },
    pitLidHidden: { geometry: new THREE.CylinderGeometry(0.38, 0.38, 0.02, 24), color: theme.pitLid, opacity: HIDDEN_OPACITY },
    stepUp: { geometry: new THREE.BoxGeometry(1, 1, 1 / STEPS), color: theme.stairsUp },
    stepDown: { geometry: new THREE.BoxGeometry(1, 1, 1 / STEPS), color: theme.stairsDown },
    door: { geometry: new THREE.BoxGeometry(1, h.door, 0.12), color: theme.door },
    teleporter: {
      geometry: new THREE.BoxGeometry(0.7, h.door, 0.7),
      color: theme.teleporter,
      emissive: true,
      opacity: 0.45,
    },
  };
}

/**
 * @returns {{ group: THREE.Group, meshes: Array<THREE.InstancedMesh|THREE.LineSegments> }}
 * Each mesh has userData.part, userData.variant, userData.baseOpacity and, for
 * instanced meshes, userData.tiles[instanceId] = tile info (for hovering).
 */
export function buildLevelMeshes(dungeon, levelIndex, theme, center, { wallHeight = DEFAULT_WALL_HEIGHT } = {}) {
  const map = dungeon.level(levelIndex);
  const h = dimensions(wallHeight);
  const parts = partDefinitions(theme, h);
  const instances = new Map(); // "part:variant" -> [{ matrix, info }]
  const openWallCenters = []; // vanished fake walls, drawn as wireframe outlines
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  const add = (part, info, position, scale = [1, 1, 1], rotationY = 0, variant = 'all') => {
    q.setFromAxisAngle(up, rotationY);
    const key = `${part}:${variant}`;
    if (!instances.has(key)) instances.set(key, []);
    instances.get(key).push({ matrix: m4.clone().compose(new THREE.Vector3(...position), q, new THREE.Vector3(...scale)), info });
  };
  // Same instance with a types-only look and a with-states look.
  const addVariants = (typesPart, statesPart, info, position, scale, rotationY) => {
    if (typesPart === statesPart) return add(typesPart, info, position, scale, rotationY, 'all');
    add(typesPart, info, position, scale, rotationY, 'types');
    if (statesPart) add(statesPart, info, position, scale, rotationY, 'states');
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = dungeon.tileAt(levelIndex, x, y);
      const gx = x + map.offset.x;
      const gy = y + map.offset.y;
      const info = { level: levelIndex, x, y, gx, gy, type: tile.type, detail: tile.detail };
      const px = gx + 0.5 - center.x;
      const pz = gy + 0.5 - center.z;

      if (tile.type === 'wall') {
        add('wall', info, [px, h.wall / 2, pz]);
        continue;
      }
      if (tile.type === 'fakewall') {
        addFakewall(add, openWallCenters, info, px, pz, h);
        continue;
      }
      if (tile.type === 'stairs') {
        addStairs(add, info, px, pz, dungeon.accessSide(levelIndex, x, y), h);
        continue;
      }
      add('floor', info, [px, -FLOOR_THICKNESS / 2, pz]);
      if (tile.type === 'pit') addVariants('pit', pitPart(tile.detail), info, [px, 0.011, pz]);
      if (tile.type === 'teleporter') add('teleporter', info, [px, h.door / 2, pz]);
      if (tile.type === 'door') addDoor(add, info, px, pz, h);
    }
  }

  const group = new THREE.Group();
  group.name = `level-${levelIndex}`;
  const meshes = [];
  for (const [key, list] of instances) {
    const [part, variant] = key.split(':');
    const def = parts[part];
    const material = new THREE.MeshLambertMaterial({
      color: def.color,
      ...(def.emissive && { emissive: def.color, emissiveIntensity: 0.6 }),
    });
    // Each part may appear in several variants: they need their own geometry to be disposed independently.
    const mesh = new THREE.InstancedMesh(def.geometry.clone(), material, list.length);
    list.forEach(({ matrix }, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = `${group.name}-${part}-${variant}`;
    mesh.userData = { part, variant, tiles: list.map((l) => l.info), baseOpacity: def.opacity ?? 1 };
    group.add(mesh);
    meshes.push(mesh);
  }
  if (openWallCenters.length) {
    const outlines = buildOutlines(openWallCenters, theme.fakewall, h);
    outlines.name = `${group.name}-fakewallOpen-states`;
    group.add(outlines);
    meshes.push(outlines);
  }
  for (const def of Object.values(parts)) def.geometry.dispose();
  return { group, meshes };
}

// Pit look with states: open hole or closed lid, faded when invisible.
function pitPart(detail) {
  const { open, invisible } = tileState('pit', detail);
  if (open) return invisible ? 'pitHidden' : 'pit';
  return invisible ? 'pitLidHidden' : 'pitLid';
}

// Door: the leaf lies across the passage axis (an NS passage gets an east-west leaf).
// With states, an open door is raised like a portcullis: only its lower edge stays
// in the doorway, the rest sticks out above the walls (there is no ceiling), so it
// can be told apart from a closed door at any camera angle but straight down.
function addDoor(add, info, px, pz, h) {
  const rotation = info.detail.orientation === 'NS' ? 0 : Math.PI / 2;
  const closed = [px, h.door / 2, pz];
  if (!info.detail.open) return add('door', info, closed, [1, 1, 1], rotation, 'all');
  add('door', info, closed, [1, 1, 1], rotation, 'types');
  const bottom = h.wall - h.door * RAISED_DOOR_VISIBLE;
  add('door', info, [px, bottom + h.door / 2, pz], [1, 1, 1], rotation, 'states');
}

// Fake wall: a block (types only). With states: block if closed, faded block if
// imaginary (passable illusion), wireframe outline if open (vanished). The last
// two stand on a floor slab.
function addFakewall(add, openWallCenters, info, px, pz, h) {
  const { open, imaginary } = tileState('fakewall', info.detail);
  const block = [px, h.wall / 2, pz];
  if (!open && !imaginary) return add('fakewall', info, block, [1, 1, 1], 0, 'all');
  add('fakewall', info, block, [1, 1, 1], 0, 'types');
  add('floor', info, [px, -FLOOR_THICKNESS / 2, pz], [1, 1, 1], 0, 'states');
  if (open) openWallCenters.push([px, h.wall / 2, pz]);
  else add('fakewallImaginary', info, block, [1, 1, 1], 0, 'states');
}

// Edges of unit wall boxes centred on `centers`, merged into one LineSegments.
function buildOutlines(centers, color, h) {
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, h.wall, 1));
  const src = edges.attributes.position.array;
  const positions = new Float32Array(src.length * centers.length);
  centers.forEach(([cx, cy, cz], k) => {
    for (let i = 0; i < src.length; i += 3) {
      positions[k * src.length + i] = src[i] + cx;
      positions[k * src.length + i + 1] = src[i + 1] + cy;
      positions[k * src.length + i + 2] = src[i + 2] + cz;
    }
  });
  edges.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
  lines.userData = { part: 'fakewallOpen', variant: 'states', baseOpacity: 1 };
  return lines;
}

// Stairs model: STEPS boxes along +z, starting at the access side (z = -0.5 before rotation).
// Up stairs: step tops rise from the floor, boxes stand on the floor (y = 0).
// Down stairs: step tops sink below the floor, boxes share a base at y = -wall height,
// so the walking surface (seen from above) goes down.
function addStairs(add, info, px, pz, accessSide, h) {
  const goingUp = info.detail.direction === 'up';
  const rotation = STAIRS_ROTATION[accessSide ?? (info.detail.orientation === 'WE' ? 'W' : 'N')];
  const sin = Math.sin(rotation);
  const cos = Math.cos(rotation);
  const stepHeight = h.wall / (STEPS + 1);
  for (let i = 0; i < STEPS; i++) {
    const top = goingUp ? (i + 1) * stepHeight : -(i + 1) * stepHeight;
    const bottom = goingUp ? 0 : -h.wall;
    const localZ = -0.5 + (i + 0.5) / STEPS;
    // Rotate the step offset (0, localZ) around y.
    const dx = localZ * sin;
    const dz = localZ * cos;
    add(goingUp ? 'stepUp' : 'stepDown', info, [px + dx, (top + bottom) / 2, pz + dz], [1, top - bottom, 1], rotation);
  }
}

export function disposeLevelMeshes(meshes) {
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh.dispose?.(); // InstancedMesh only
  }
}
