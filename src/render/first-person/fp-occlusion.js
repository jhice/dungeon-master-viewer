// Walls stop the light (setting `occlusion`, docs/038): without shadows, a PointLight lights every
// face turned to it within its reach, through walls. Here each light only lights the tiles it sees
// on the grid of the level:
// - lightMasks() casts rays on the grid from each light to the tiles within its reach: a tile is
//   seen if one ray (to its centre or near a corner) crosses no wall, closed fake wall or closed
//   door; the tile at the end of the ray may be one (its faces are lit). One bit per light;
// - the bits go to a texture of the level (one texel per tile), read by the lit materials of the
//   view: patchMaterial() multiplies the contribution of point light i by its bit at the tile of
//   the fragment. A fragment on a wall face is pushed a little along its normal, into the tile the
//   face looks at.
// Bit i is the i-th point light of the scene in the order of Three.js (scene order, sorted by
// shadow and map: none have one here, so it stays the order of fp-lights.js).

import * as THREE from 'three';
import { doorStep, DOOR_CLOSED } from '../../core/tile-states.js';

const RAY_STEP = 0.05; // tiles between two samples of a ray
const TARGETS = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]; // in a tile
const NUDGE = 0.05; // along the normal, out of a wall face

/** Does this tile stop the light? */
export function opaqueTile(tile) {
  if (!tile) return true;
  if (tile.type === 'wall') return true;
  if (tile.type === 'fakewall') return !tile.detail.open;
  if (tile.type === 'door') return !tile.detail.broken && doorStep(tile.detail) === DOOR_CLOSED;
  return false;
}

/**
 * Bits of the lights seeing each tile: Uint8Array(width × height), bit i for sources[i].
 * @param {number} width
 * @param {number} height
 * @param {(x, y) => boolean} opaque
 * @param {Array<{ x: number, z: number, reach: number }|null>} sources light positions (in tiles) and reach
 */
export function lightMasks(width, height, opaque, sources) {
  const masks = new Uint8Array(width * height);
  sources.forEach((source, bit) => {
    if (!source) return;
    const [sx, sy] = [Math.floor(source.x), Math.floor(source.z)];
    const r = Math.ceil(source.reach);
    for (let y = Math.max(0, sy - r); y <= Math.min(height - 1, sy + r); y++) {
      for (let x = Math.max(0, sx - r); x <= Math.min(width - 1, sx + r); x++) {
        if (TARGETS.some(([u, v]) => clear(source.x, source.z, x + u, y + v, x, y, opaque))) masks[y * width + x] |= 1 << bit;
      }
    }
  });
  return masks;
}

// Does the ray from (ax, az) to (bx, bz) reach the tile (tx, ty) without crossing an opaque tile?
function clear(ax, az, bx, bz, tx, ty, opaque) {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / RAY_STEP);
  for (let i = 1; i < steps; i++) {
    const x = Math.floor(ax + ((bx - ax) * i) / steps);
    const y = Math.floor(az + ((bz - az) * i) / steps);
    if ((x !== tx || y !== ty) && opaque(x, y)) return false;
  }
  return true;
}

/** The masks of the shown level, and the patch of the materials reading them. */
export function createOcclusion() {
  const uniforms = { occMask: { value: null }, occSize: { value: new THREE.Vector2() } };
  let enabled = false;

  function patch(shader) {
    // Always: a material keeps its programs by cache key, and switching back to one already
    // compiled reuses the uniforms of its last compile, without calling onBeforeCompile again.
    Object.assign(shader.uniforms, uniforms);
    if (!enabled) return;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vOccTile;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 occWorld = vec4( transformed, 1.0 );
      vec3 occNormal = objectNormal;
      #ifdef USE_INSTANCING
        occWorld = instanceMatrix * occWorld;
        occNormal = mat3( instanceMatrix ) * occNormal;
      #endif
      occWorld = modelMatrix * occWorld;
      occNormal = normalize( mat3( modelMatrix ) * occNormal );
      vOccTile = occWorld.xz + occNormal.xz * ${NUDGE.toFixed(2)};`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vOccTile;
        uniform sampler2D occMask;
        uniform vec2 occSize;
        float occLight( int index ) {
          vec2 tile = floor( vOccTile );
          if ( any( lessThan( tile, vec2( 0.0 ) ) ) || any( greaterThanEqual( tile, occSize ) ) ) return 0.0;
          int bits = int( texelFetch( occMask, ivec2( tile ), 0 ).r * 255.0 + 0.5 );
          return float( ( bits >> index ) & 1 );
        }`,
      )
      .replace(
        '#include <lights_fragment_begin>',
        THREE.ShaderChunk.lights_fragment_begin.replace(
          'getPointLightInfo( pointLight, geometryPosition, directLight );',
          '$&\n\t\tdirectLight.color *= occLight( UNROLLED_LOOP_INDEX );',
        ),
      );
  }

  return {
    get enabled() {
      return enabled;
    },
    /** Turns the occlusion on or off: the patched materials must be compiled again (needsUpdate). */
    set enabled(value) {
      enabled = value;
    },
    /** Lets a lit material read the masks (keeps its own onBeforeCompile, e.g. the mirror of fp-renderer.js). */
    patchMaterial(material) {
      if (!material.isMeshLambertMaterial || material.userData.occlusion) return;
      material.userData.occlusion = true;
      const before = material.onBeforeCompile;
      const key = material.customProgramCacheKey;
      material.onBeforeCompile = (shader, renderer) => {
        before.call(material, shader, renderer);
        patch(shader);
      };
      material.customProgramCacheKey = () => `${key.call(material)}|occlusion:${enabled}`;
    },
    /** New masks of the level (lightMasks). */
    setMasks(masks, width, height) {
      uniforms.occMask.value?.dispose();
      const texture = new THREE.DataTexture(masks, width, height, THREE.RedFormat, THREE.UnsignedByteType);
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;
      uniforms.occMask.value = texture;
      uniforms.occSize.value.set(width, height);
    },
    dispose() {
      uniforms.occMask.value?.dispose();
    },
  };
}
