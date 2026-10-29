// Lights of the first-person view (docs/037), from the light of the simulation (src/sim/light.js,
// docs/032), all white, without shadows:
// - the party's light: a PointLight carried by the eye. As in DM, the light amount of the
//   torches in hand and the spells picks one of 6 palettes (0 brightest .. 5 black); its ratio
//   (1, 0.8 … 0) scales both the intensity and the reach of the light: the darker, the shorter
//   the sight. A level of difficulty 0 (the Hall), or the setting `permanentLight`: palette 0;
// - torch holders (setting `torchHolders`, not in DM): a PointLight in front of each
//   "Full Torch Holder" of the level, at full power;
// - the glow of the teleporter fields follows the party's light (seen only in some light).
// Light counts are fixed (a pool), so that changing the light never recompiles the shaders:
// an unused light has intensity 0. The settings (control panel) change at once: `configure()`.

import * as THREE from 'three';
import { DEFAULT_LIGHTING } from './lighting-settings.js';

const PALETTES = 6;
const TELEPORTER_GLOW = 0.6; // emissive intensity of the teleporter fields in full light (level-meshes.js)
const HOLDER_LIGHTS = 4; // at most 4 full torch holders on a level of DM (level 1)
const HOLDER = { out: 0.14, height: 0.75 }; // out of the wall, in tiles; height: share of the wall
// Out of a wall face (N, E, S, W): direction from the wall tile's centre.
const FACE_OUT = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera the party's eye (the party's light is its child)
 * @param {number} wallHeight
 * @param {object} [settings] DEFAULT_LIGHTING (lighting-settings.js), or some of it
 */
export function createLights(scene, camera, wallHeight, settings = {}) {
  const lighting = { ...DEFAULT_LIGHTING, ...settings };
  const party = new THREE.PointLight(0xffffff, 0);
  camera.add(party);
  const holders = Array.from({ length: HOLDER_LIGHTS }, () => {
    const light = new THREE.PointLight(0xffffff, 0);
    scene.add(light);
    return light;
  });
  let glowing = []; // materials of the teleporter fields of the level (emissive)

  let palette = 0; // of the last light of the simulation
  let permanent = true;
  let spots = []; // full torch holders of the level: { x, z, y } (light positions)

  function apply() {
    const ratio = permanent || lighting.permanentLight ? 1 : (PALETTES - 1 - palette) / (PALETTES - 1);
    party.intensity = lighting.intensity * ratio;
    party.distance = Math.max(1, lighting.distance * ratio);
    party.decay = lighting.decay;
    for (const material of glowing) material.emissiveIntensity = TELEPORTER_GLOW * ratio;
    placeHolders();
  }

  // Every full torch holder of the level gets a holder light.
  function placeHolders() {
    holders.forEach((l, i) => {
      const spot = lighting.torchHolders ? spots[i] : null;
      l.intensity = spot ? lighting.intensity : 0;
      l.distance = lighting.distance;
      l.decay = lighting.decay;
      if (spot) l.position.set(spot.x, spot.y, spot.z);
    });
  }

  return {
    /** The light of the simulation (sim.light): { palette, permanent, … }. */
    setLight(next) {
      palette = next.palette;
      permanent = next.permanent;
      apply();
    },
    /** Settings changed (some of DEFAULT_LIGHTING): applied at once. */
    configure(changes) {
      Object.assign(lighting, changes);
      apply();
    },
    /** The level built: its teleporter fields' materials glow with the party's light. */
    setGlowing(materials) {
      glowing = materials;
      apply();
    },
    /** Full torch holders of the level built: [{ x, y, face }] (local coordinates of the wall tile). */
    setHolders(list) {
      spots = list.map(({ x, y, face }) => {
        const [dx, dz] = FACE_OUT[face];
        return { x: x + 0.5 + dx * (0.5 + HOLDER.out), y: wallHeight * HOLDER.height, z: y + 0.5 + dz * (0.5 + HOLDER.out) };
      });
      placeHolders();
    },
  };
}
