// Lights of the first-person view (phase H2, docs/035), from the light of the simulation
// (src/sim/light.js, docs/032):
// - global light: a HemisphereLight, full on a level of difficulty 0 (the Hall), else the
//   setting `globalLight` (0 = faithful to DM: no light but the torches and the spells);
//   the glow of the teleporter fields follows it (dark level: seen in the light of a torch only);
// - the party's torch: a PointLight carried at hand height, on the side of the hand of the
//   strongest torch, its intensity from the light amount of the torches in hand;
// - magical light (Torch, Light spells): a wider PointLight centred on the party, steady (doc 029, Q7);
// - torch holders: a PointLight in front of each "Full Torch Holder" of the level, the nearest
//   ones casting shadows (budget, doc 029 Q6);
// - flicker: a slow noise on the intensity of the flames (±10 %). The sources do not move, so
//   that the shadows stay valid: they are drawn again only when the view changes (fp-renderer.js).
// Light counts and shadow casters are fixed (a pool), so that changing the light never
// recompiles the shaders: an unused light has intensity 0 and does not update its shadow.
// The settings (control panel, phase H3, docs/036) change at once: `configure()`.

import * as THREE from 'three';
import { torchesLightAmount } from '../../sim/light.js';
import { DEFAULT_LIGHTING } from './lighting-settings.js';

const HOLDER_SHADOWS = 2; // torch holders casting shadows, the nearest ones (doc 029, Q6)
const FOG_DEPTH = 1; // tiles from the start of the fog to its end (torchRange)
const TELEPORTER_GLOW = 0.6; // emissive intensity of the teleporter fields in full light (level-meshes.js)
const HOLDER_LIGHTS = 4; // at most 4 full torch holders on a level of DM (level 1)
const HEMISPHERE = 1.6;
const FILL = 2.2; // light carried by the party on a lit level: faces close to the eye are brighter
const TORCH = { color: 0xffc27a, intensity: 2.6, decay: 1.2 };
const MAGIC = { color: 0xdfe8ff, intensity: 2.2, decay: 1, rangeFactor: 1.6 };
const HOLDER = { color: 0xffb060, intensity: 2.2, decay: 1.2, out: 0.14, height: 0.75 }; // height: share of the wall
// Party's torch, in camera space: at hand height, a bit forward; x by hand (0 ready = left, 1 action = right).
const HAND_OFFSETS = [-0.16, 0.16];
const TORCH_OFFSET = { y: -0.1, z: -0.12 };
const SHADOW = { mapSize: 512, bias: -0.004, normalBias: 0.02, near: 0.03 };
// Out of a wall face (N, E, S, W): direction from the wall tile's centre.
const FACE_OUT = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera the party's eye (the party's lights are its children)
 * @param {number} wallHeight
 * @param {object} [settings] DEFAULT_LIGHTING (lighting-settings.js), or some of it
 */
export function createLights(scene, camera, wallHeight, settings = {}) {
  const lighting = { ...DEFAULT_LIGHTING, ...settings };
  scene.fog = new THREE.Fog(0x000000);
  const hemisphere = new THREE.HemisphereLight(0xfff4e0, 0x403a30, HEMISPHERE);
  scene.add(hemisphere);
  const fill = new THREE.PointLight(0xffe2b0, FILL, 0, 1);
  camera.add(fill);

  const torch = pointLight(TORCH);
  camera.add(torch);
  const magic = pointLight(MAGIC);
  camera.add(magic);
  const holders = Array.from({ length: HOLDER_LIGHTS }, () => {
    const light = pointLight(HOLDER);
    scene.add(light);
    return light;
  });
  // Lights that may cast shadows (setting `shadows`): the party's torch and the nearest holders.
  const shadowCasters = [torch, ...holders.slice(0, HOLDER_SHADOWS)];
  let glowing = []; // materials of the teleporter fields of the level (emissive)

  let light = null; // last light of the simulation
  let permanent = true;
  let torchPower = 0; // 0..~2: intensity factor of the party's torch, before flicker
  let torchHand = 1;
  let spots = []; // full torch holders of the level: { x, z, y } (light positions)
  let shown = []; // spots lit now, by holder light: spot or null
  let party = null;

  function pointLight({ color, decay }) {
    const l = new THREE.PointLight(color, 0, lighting.torchRange, decay);
    l.shadow.mapSize.set(SHADOW.mapSize, SHADOW.mapSize);
    l.shadow.bias = SHADOW.bias;
    l.shadow.normalBias = SHADOW.normalBias;
    l.shadow.camera.near = SHADOW.near;
    return l;
  }

  // Perceived strength of a light amount (0..100+ of the model): a square root, so that a torch
  // nearly burnt out (amount 5) still shows a little, as the darkest palettes of DM do.
  const strength = (amount) => Math.sqrt(Math.max(0, amount) / 100);

  function apply() {
    const global = permanent ? 1 : lighting.globalLight / 100;
    hemisphere.intensity = HEMISPHERE * global;
    fill.intensity = FILL * global;
    for (const material of glowing) material.emissiveIntensity = TELEPORTER_GLOW * global;
    // Lit level: the far view fades into the fog; dark level: the dark beyond the lights replaces it.
    const fogged = lighting.fog && global > 0;
    scene.fog.near = fogged ? Math.max(0.5, lighting.torchRange - FOG_DEPTH) : 1e6;
    scene.fog.far = fogged ? lighting.torchRange : 1e6;
    // Changing a castShadow makes Three.js recompile the materials (lights state): only on a change of setting.
    for (const l of shadowCasters) l.castShadow = lighting.shadows;

    const torches = light?.torches.filter((t) => t.charges > 0) ?? [];
    const magical = light?.magical ?? 0;
    // A darkness spell (negative magical light) takes its light from the torches first.
    const torchAmount = Math.max(0, torchesLightAmount(torches.map((t) => t.charges)) + Math.min(0, magical));
    torchPower = strength(torchAmount);
    const strongest = torches.reduce((a, b) => (b.charges > a.charges ? b : a), torches[0]);
    torchHand = strongest?.hand ?? 1;
    // Two torches of the same power: the light is between the hands.
    const both = torches.length > 1 && torches.every((t) => t.charges === strongest.charges);
    torch.position.set(both ? 0 : HAND_OFFSETS[torchHand], TORCH_OFFSET.y, TORCH_OFFSET.z);
    torch.shadow.autoUpdate = torchPower > 0;
    torch.intensity = TORCH.intensity * torchPower;
    torch.distance = lighting.torchRange;

    magic.intensity = MAGIC.intensity * strength(magical);
    magic.distance = lighting.torchRange * MAGIC.rangeFactor;
    placeHolders();
  }

  // The nearest full torch holders within reach of their light get the holder lights.
  function placeHolders() {
    const reach = lighting.torchRange + 1;
    const near = party
      ? spots
          .map((spot) => ({ spot, d: Math.hypot(spot.x - (party.x + 0.5), spot.z - (party.y + 0.5)) }))
          .filter(({ d }) => d <= reach + lighting.torchRange)
          .sort((a, b) => a.d - b.d)
          .map(({ spot }) => spot)
      : [];
    shown = holders.map((l, i) => {
      const spot = near[i] ?? null;
      l.intensity = spot ? HOLDER.intensity : 0;
      l.distance = lighting.torchRange;
      l.shadow.autoUpdate = Boolean(spot);
      if (spot) l.position.set(spot.x, spot.y, spot.z);
      return spot;
    });
  }

  // Slow noise in [-1, 1]: a few sines of unrelated periods.
  const noise = (t, seed) => (Math.sin(t * 7.3 + seed) + Math.sin(t * 11.9 + seed * 2.1) * 0.6 + Math.sin(t * 3.1 + seed * 3.7) * 0.4) / 2;
  function flicker(seconds) {
    const flames = [[torch, TORCH.intensity * torchPower, 0], ...holders.map((l, i) => [l, shown[i] ? HOLDER.intensity : 0, i + 1])];
    for (const [l, base, seed] of flames) if (base) l.intensity = base * (1 + 0.1 * noise(seconds, seed * 10));
  }

  return {
    /** The light of the simulation (sim.light): { amount, permanent, torches, magical }. */
    setLight(next) {
      light = next;
      permanent = next.permanent;
      apply();
    },
    /** Settings changed (some of DEFAULT_LIGHTING): applied at once. */
    configure(changes) {
      Object.assign(lighting, changes);
      apply();
    },
    /** The level built: its teleporter fields' materials glow with the global light. */
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
    /** The party moved: the nearest holders take the lights. */
    setParty(next) {
      party = next;
      placeHolders();
    },
    /** Does the view need a frame every frame (a flame flickers)? */
    get animated() {
      return lighting.flicker && (torchPower > 0 || shown.some(Boolean));
    },
    /** One frame of the flames, at `seconds` (intensities only: the shadows stay valid). */
    flicker,
  };
}
