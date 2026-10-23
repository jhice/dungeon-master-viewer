// Vertical connections between levels: stairs and pits.
// In DM, both lead to the same global coordinates on the adjacent level.

export function findConnections(dungeon) {
  const links = [];
  for (let level = 0; level < dungeon.levelCount; level++) {
    for (const { x, y, gx, gy, detail } of dungeon.detailedTiles(level)) {
      if (detail.type === 'stairs') {
        const toLevel = detail.direction === 'down' ? level + 1 : level - 1;
        const target = dungeon.globalTileAt(toLevel, gx, gy);
        // A staircase must land on the opposite staircase.
        const ok = target?.type === 'stairs' && target.detail.direction !== detail.direction;
        links.push({ kind: 'stairs', direction: detail.direction, level, x, y, gx, gy, toLevel, target: target?.type ?? null, ok });
      } else if (detail.type === 'pit') {
        const toLevel = level + 1;
        const target = dungeon.globalTileAt(toLevel, gx, gy);
        // A pit must land on something walkable (floor, another pit, a teleporter…).
        const ok = target !== null && target.type !== 'wall' && target.type !== 'fakewall';
        links.push({ kind: 'pit', level, x, y, gx, gy, toLevel, target: target?.type ?? null, ok, imaginary: detail.imaginary, invisible: detail.invisible });
      }
    }
  }
  return links;
}
