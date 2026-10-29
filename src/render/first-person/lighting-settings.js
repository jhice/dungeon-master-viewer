// Settings of the light of the first-person view (docs/037): control panel, saved in the
// preferences. Apart from fp-lights.js so that main.js reads them without loading Three.js.

export const DEFAULT_LIGHTING = {
  intensity: 5.0, // 0.1..10: intensity of a light at full power (the party's at palette 0, a torch holder)
  distance: 3.7, // 1..6 tiles: its reach at full power
  decay: 0.2, // 0..10: how fast it fades with the distance (0: even up to the end of its reach)
  permanentLight: false, // every level lit at 100 %, as the Hall (level 0)
  torchHolders: true, // the full torch holders give light (not in DM: decor only)
  occlusion: true, // walls stop the light, tile by tile (fp-occlusion.js, docs/038)
};
