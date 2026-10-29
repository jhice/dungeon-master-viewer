// Settings of the sounds (docs/041): control panel, saved in the preferences.
// Apart from audio.js so that main.js reads them without creating an AudioContext.

export const DEFAULT_AUDIO = {
  soundEnabled: true,
  soundVolume: 0.8, // 0..1: volume of a sound made on the party's tile
  soundRange: 8, // 2..16 tiles (|dx| + |dy|): silent from there on; provisional, to adjust after tests
};
