// Ornaments of the faces of a wall tile. They come from two places:
// - the tile decorations ({ graphic, side }), random ornaments of the level;
// - the graphic of the actuators of each face (buttons, locks, torch holders,
//   the Vi Altar…).
// Both graphics are 1-based indexes into map.wallDecorations (0 = none, doc 009).
//
// A face shows ONE ornament: the one of the LAST actuator of the face that has
// a graphic, else the tile decoration of that side. Rotations reorder the
// actuators, which changes the ornament shown (levers, torch holders, a button
// replaced by the alcove it reveals). The items lying against a face are only
// seen and reachable when the ornament shown is an alcove.

const ALCOVES = /Alcove|Vi Altar/; // alcoves hold items: Square / Arched Alcove, Vi Altar

/**
 * Name of the ornament shown on a face of a wall tile, or null.
 * @param {(level, x, y) => Array<{ index, position }>} [actuatorsAt] current order of the
 *   actuators (the simulation's state); default: the order of dungeon.json
 */
export function shownOrnament(dungeon, level, x, y, face, actuatorsAt) {
  const tile = dungeon.tileAt(level, x, y);
  if (tile?.type !== 'wall' || !tile.detail) return null;
  const names = dungeon.level(level).wallDecorations;
  const refs = actuatorsAt ? actuatorsAt(level, x, y) : (tile.detail.items ?? []).filter((ref) => ref.kind === 'actuator');
  const graphics = refs.filter((ref) => ref.position === face).map((ref) => dungeon.data.actuators[ref.index].graphic).filter((g) => g > 0);
  if (graphics.length) return names[graphics.at(-1) - 1]?.name ?? null;
  const decoration = (tile.detail.decorations ?? []).filter((d) => d.side === 'NESW'[face]).at(-1);
  return decoration ? (names[decoration.graphic - 1]?.name ?? null) : null;
}

/** Does this face show an alcove (its items can be seen, taken, and items put in it)? */
export function isAlcove(dungeon, level, x, y, face, actuatorsAt) {
  return ALCOVES.test(shownOrnament(dungeon, level, x, y, face, actuatorsAt) ?? '');
}

/**
 * Name of the ornament shown on a floor tile, or null: the graphic of its last floor
 * actuator that has one (pressure pads…), else the tile decoration (moss, puddle…).
 * A floor actuator without graphic stays invisible, as in DM. Index into map.floorDecorations.
 */
export function shownFloorOrnament(dungeon, level, x, y, actuatorsAt) {
  const tile = dungeon.tileAt(level, x, y);
  if (!tile?.detail || tile.type === 'wall') return null;
  const names = dungeon.level(level).floorDecorations;
  const refs = actuatorsAt ? actuatorsAt(level, x, y) : (tile.detail.items ?? []).filter((ref) => ref.kind === 'actuator');
  const graphics = refs
    .map((ref) => dungeon.data.actuators[ref.index])
    .filter((a) => a.kind === 'floor' && a.graphic > 0)
    .map((a) => a.graphic);
  const graphic = graphics.at(-1) ?? (tile.detail.decorations ?? []).at(-1)?.graphic;
  return graphic ? (names[graphic - 1]?.name ?? null) : null;
}

/** Look of a door tile: { type: 'Porticullis'|'Wooden'|'Ra'|'Iron', ornament: name|null, button }, or null. */
export function doorLook(dungeon, level, x, y) {
  const ref = dungeon.tileAt(level, x, y)?.detail?.items?.find((item) => item.kind === 'door');
  if (!ref) return null;
  const door = dungeon.data.doors[ref.index];
  const map = dungeon.level(level);
  return {
    type: map.doorTypes[door.type] ?? null,
    ornament: door.ornate ? (map.doorDecorations[door.ornate - 1]?.name ?? null) : null,
    button: door.button,
  };
}
