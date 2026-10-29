// Plays the sounds announced by the simulation (event 'sound', docs/041) with the Web Audio API.
// Rules (docs/041 § 3), from DM (ReDMCSB F064) without the limits of the Atari ST sound chip:
// - only the party's level is heard;
// - gain = volume × (1 − d / range), d = |dx| + |dy| from the party, range = common reach × reach of the sound;
// - stereo: left / right of the party, as it faces;
// - during a tick, only the winner plays: the loudest, then the highest priority (sound-info.js);
//   outside a tick (actions of the party) and for immediate sounds, at once;
// - a sound with a `delay` (ticks) plays exactly that long after its request, apart from the
//   winners of the ticks, wherever the party then stands (docs/046);
// - at most MAX_VOICES at a time: the oldest stops.

import { SOUNDS, soundPriority } from '../core/sound-info.js';
import { SIDE_DELTAS, FACINGS } from '../core/dungeon.js';
import { DEFAULT_AUDIO } from './audio-settings.js';

const MAX_VOICES = 4;
const REPEAT_MS = 50; // the same sound asked again within this delay is not played twice

/**
 * @param {object} options
 * @param {string} options.base URL of the folder of the files (NN.mp3)
 * @param {() => { level, x, y, facing }} options.party where the party stands
 * @param {number} options.tickMs duration of a tick of the game clock
 * @param {object} [options.settings] over DEFAULT_AUDIO
 */
export function createAudio({ base, party, tickMs, settings = {} }) {
  let current = { ...DEFAULT_AUDIO, ...settings };
  let context = null;
  const buffers = new Map(); // file -> Promise<AudioBuffer|null>
  const voices = []; // { source, id, at }
  let pending = null; // winner of the tick being run, or null outside a tick
  let inTick = false;

  // Created at the first sound: by then the user has clicked or pressed a key (autoplay rule).
  function audioContext() {
    if (!context) context = new AudioContext();
    if (context.state === 'suspended') context.resume();
    return context;
  }

  function load(file) {
    if (!buffers.has(file)) {
      const ctx = audioContext();
      buffers.set(
        file,
        fetch(`${base}${file}.mp3`)
          .then((response) => (response.ok ? response.arrayBuffer() : null))
          .then((data) => data && ctx.decodeAudioData(data))
          .catch(() => null), // a missing file: silence
      );
    }
    return buffers.get(file);
  }

  // Gain and pan of a sound for the party, or null if it is not heard.
  function placement({ id, level, x, y }) {
    const info = SOUNDS[id];
    const p = party();
    if (!info || level !== p.level) return null;
    const dx = x - p.x;
    const dy = y - p.y;
    const distance = Math.abs(dx) + Math.abs(dy);
    const range = current.soundRange * info.range;
    if (distance >= range) return null;
    const [rx, ry] = SIDE_DELTAS[FACINGS[(FACINGS.indexOf(p.facing) + 1) % 4]]; // the party's right
    const right = dx * rx + dy * ry;
    return { gain: current.soundVolume * (1 - distance / range), pan: Math.max(-1, Math.min(1, right / Math.max(1, distance))) };
  }

  async function play(id, { gain, pan }) {
    const now = performance.now();
    if (voices.some((v) => v.id === id && now - v.at < REPEAT_MS)) return;
    const voice = { source: null, id, at: now };
    voices.push(voice);
    while (voices.length > MAX_VOICES) voices.shift().source?.stop();
    const buffer = await load(SOUNDS[id].file);
    if (!buffer || !voices.includes(voice)) return void remove(voice);
    const ctx = audioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const volume = ctx.createGain();
    volume.gain.value = gain;
    source.connect(panner).connect(volume).connect(ctx.destination);
    source.onended = () => remove(voice);
    voice.source = source;
    source.start();
  }

  function remove(voice) {
    const i = voices.indexOf(voice);
    if (i >= 0) voices.splice(i, 1);
  }

  // A sound announced by the simulation.
  function request(sound) {
    if (!current.soundEnabled) return;
    if (sound.delay) return void setTimeout(() => request({ ...sound, delay: 0, immediate: true }), sound.delay * tickMs);
    const heard = placement(sound);
    if (!heard) return;
    if (!inTick || sound.immediate) return void play(sound.id, heard);
    const better = !pending || heard.gain > pending.heard.gain || (heard.gain === pending.heard.gain && soundPriority(sound.id) < soundPriority(pending.id));
    if (better) pending = { id: sound.id, heard };
  }

  return {
    request,
    /** Runs a tick of the simulation: of the sounds it asks for, the winner plays at the end. */
    tick(run) {
      inTick = true;
      pending = null;
      try {
        run();
      } finally {
        inTick = false;
        if (pending) play(pending.id, pending.heard);
        pending = null;
      }
    },
    setSettings(changes) {
      current = { ...current, ...changes };
      if (!current.soundEnabled) for (const voice of voices.splice(0)) voice.source?.stop();
    },
  };
}
