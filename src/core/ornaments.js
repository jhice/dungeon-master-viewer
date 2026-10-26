// Ornaments of the faces of a wall tile. They come from two places:
// - the tile decorations ({ graphic, side }), random ornaments of the level;
// - the graphic of the actuators of each face (buttons, locks, torch holders,
//   the Vi Altar…).
// Both graphics are 1-based indexes into map.wallDecorations (0 = none, doc 009).

const ALCOVES = /Alcove|Vi Altar/; // alcoves hold items: Square / Arched Alcove, Vi Altar

/** Ornaments of a wall tile: [{ face: 0..3 (N, E, S, W), name }]. */
export function wallOrnaments(dungeon, level, x, y) {
  const tile = dungeon.tileAt(level, x, y);
  if (tile?.type !== 'wall' || !tile.detail) return [];
  const names = dungeon.level(level).wallDecorations;
  const ornaments = [];
  for (const d of tile.detail.decorations ?? []) {
    const name = names[d.graphic - 1]?.name;
    if (name) ornaments.push({ face: 'NESW'.indexOf(d.side), name });
  }
  for (const ref of tile.detail.items ?? []) {
    if (ref.kind !== 'actuator') continue;
    const name = names[dungeon.data.actuators[ref.index].graphic - 1]?.name;
    if (name) ornaments.push({ face: ref.position, name });
  }
  return ornaments;
}

/** Is there an alcove on this face (items can be put in it)? */
export function isAlcove(dungeon, level, x, y, face) {
  return wallOrnaments(dungeon, level, x, y).some((o) => o.face === face && ALCOVES.test(o.name));
}
