// Renderer contract shared by every rendering engine (ASCII, 2D DOM, 3D Three.js).
//
//   const renderer = createXxxRenderer(container, dungeon, options);
//   renderer.showLevel(index);   // display one level (2D/ASCII) or focus it (3D)
//   renderer.currentLevel;       // index of the level shown
//   renderer.dispose();          // remove DOM nodes, listeners, GPU resources
//
// Optional, for the simulation (src/sim/):
//   renderer.setParty(party);    // marker of the party { level, x, y, facing }, null to hide it
//   renderer.updateTile(level, x, y);  // a tile changed (state, items, creatures)
//   renderer.updateCreatures(level);   // creatures moved on a level: redraw them only
//
// Renderers only read the Dungeon model (src/core/dungeon.js); they never
// mutate it, so they can be swapped at runtime.

export function assertRenderer(renderer) {
  for (const method of ['showLevel', 'dispose']) {
    if (typeof renderer[method] !== 'function') throw new TypeError(`Renderer is missing ${method}()`);
  }
  return renderer;
}
