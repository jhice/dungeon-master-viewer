// Consistency checks on the converted dungeon model.
// Returns a list of errors (empty = valid). Conversion warnings are reported separately.

import { TILE_TYPES } from './dungeon-converter.mjs';

const POOL_COUNT_KEYS = {
  doors: 'doors',
  teleporters: 'teleporters',
  texts: 'texts',
  actuators: 'actuators',
  creatures: 'creatures',
  weapons: 'weapons',
  clothes: 'clothes',
  scrolls: 'scrolls',
  potions: 'potions',
  containers: 'containers',
  miscellaneous: 'miscellaneous',
};

export function validateDungeon(d) {
  const errors = [];
  const err = (msg) => errors.push(msg);
  const inBounds = (mapIndex, x, y) => {
    const m = d.maps[mapIndex];
    return m && x >= 0 && y >= 0 && x < m.width && y < m.height;
  };

  // 1. Header counts match pool sizes.
  if (d.maps.length !== d.counts.maps) err(`maps: ${d.maps.length} != header ${d.counts.maps}`);
  for (const [pool, key] of Object.entries(POOL_COUNT_KEYS)) {
    if (d[pool].length !== d.counts[key]) err(`${pool}: ${d[pool].length} != header ${d.counts[key]}`);
  }

  // 2. Maps: grid matches the dump's own ASCII overview, start position is walkable.
  for (const m of d.maps) {
    for (const key of ['grid', 'allowDecoration']) {
      if (m[key].length !== m.height || m[key].some((r) => r.length !== m.width)) err(`map[${m.index}]: ${key} size mismatch`);
    }
    m._overview.forEach((row, y) => {
      if (row !== m.grid[y]) err(`map[${m.index}] row ${y}: grid "${m.grid[y]}" != overview "${row}"`);
    });
    if (m._overview.length !== m.height) err(`map[${m.index}]: overview has ${m._overview.length} rows`);
  }
  const startChar = d.maps[0].grid[d.start.y]?.[d.start.x];
  // The party starts on the (closed, invisible) entrance teleporter, so only walls are rejected.
  if (startChar === undefined || startChar === 'W') err(`start (${d.start.x},${d.start.y}) is on '${startChar}'`);

  // 3. Tiles: every reference exists, type-specific objects are on the right tiles.
  const seen = new Map(); // "kind:index" -> location, for uniqueness
  const visit = (refs, where) => {
    for (const r of refs ?? []) {
      const key = `${r.kind}:${r.index}`;
      if (seen.has(key)) err(`${where}: ${key} already at ${seen.get(key)}`);
      seen.set(key, where);
      const pool = Object.keys(POOL_COUNT_KEYS).find((p) => kindOf(p) === r.kind);
      const obj = d[pool]?.[r.index];
      if (!obj) {
        err(`${where}: ${key} does not exist`);
        continue;
      }
      if (obj.items) visit(obj.items, `${where} > ${key}`);
    }
  };
  for (const m of d.maps) {
    for (const [xy, tile] of Object.entries(m.tiles)) {
      const where = `map[${m.index}] (${xy})`;
      const [x, y] = xy.split(',').map(Number);
      if (TILE_TYPES[['W', '.', 'p', 's', 'd', 't', 'w'].indexOf(m.grid[y][x])] !== tile.type) err(`${where}: tile type ${tile.type} != grid`);
      visit(tile.items, where);
      const count = (kind) => (tile.items ?? []).filter((r) => r.kind === kind).length;
      if (tile.type === 'door' && count('door') !== 1) err(`${where}: door tile with ${count('door')} door objects`);
      if (tile.type !== 'door' && count('door')) err(`${where}: door object on ${tile.type} tile`);
      if (tile.type === 'teleporter' && count('teleporter') !== 1) err(`${where}: teleporter tile with ${count('teleporter')} teleporter objects`);
      if (tile.type !== 'teleporter' && count('teleporter')) err(`${where}: teleporter object on ${tile.type} tile`);
    }
  }

  // 4. Cross references: teleporter destinations, remote actuator targets, scroll texts.
  d.teleporters.forEach((t, i) => {
    if (!inBounds(t.dest.map, t.dest.x, t.dest.y)) err(`teleporter[${i}]: destination out of bounds ${JSON.stringify(t.dest)}`);
  });
  d.actuators.forEach((a, i) => {
    if (!a) return err(`actuator[${i}]: not decoded`);
    if (a.remote && !inBounds(a.at.map, a.remote.x, a.remote.y)) err(`actuator[${i}]: remote target out of bounds`);
    if (a.extra) err(`actuator[${i}]: unhandled fields ${Object.keys(a.extra)}`);
  });
  d.scrolls.forEach((s, i) => {
    if (!d.texts[s.text]) err(`scroll[${i}]: text ${s.text} does not exist`);
  });

  // 5. Unplaced objects (not an error: the original data contains a few).
  const unplaced = {};
  for (const pool of Object.keys(POOL_COUNT_KEYS)) {
    if (pool === 'texts') continue; // texts are also referenced by scrolls and champion portraits
    const missing = d[pool].map((o, i) => (seen.has(`${kindOf(pool)}:${i}`) ? -1 : i)).filter((i) => i >= 0);
    if (missing.length) unplaced[pool] = missing;
  }

  return { errors, unplaced };
}

function kindOf(pool) {
  return { clothes: 'cloth', miscellaneous: 'miscellaneous' }[pool] ?? pool.slice(0, -1);
}
