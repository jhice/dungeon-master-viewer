// Settings of the light of the first-person view (phase H3, docs/036): control panel, saved in
// the preferences. Apart from fp-lights.js so that main.js reads them without loading Three.js.

export const DEFAULT_LIGHTING = {
  globalLight: 0, // 0..100 %, added to the model; a permanent level is always full
  torchRange: 3.5, // tiles: the reach of every flame, and the end of the fog (the fogFar of the view, doc 029)
  fog: true, // on a lit level (permanent, or global light > 0): the far view fades to black
  flicker: true,
  shadows: true,
};
