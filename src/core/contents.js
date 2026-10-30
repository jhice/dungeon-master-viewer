// What a tile contains: items (weapons, clothes, scrolls, potions, chests,
// miscellaneous) and creature groups, with their sub-tile positions and
// nested contents (chest contents, creature possessions). Renderer-agnostic.

// Item kinds as they appear in tile `items` references, with their pool in dungeon.json.
export const ITEM_POOLS = {
  weapon: 'weapons',
  cloth: 'clothes',
  scroll: 'scrolls',
  potion: 'potions',
  container: 'containers',
  miscellaneous: 'miscellaneous',
};
export const ITEM_KINDS = Object.keys(ITEM_POOLS);

export const CATEGORY_LABELS = {
  creature: 'Créatures',
  weapon: 'Armes',
  cloth: 'Vêtements',
  scroll: 'Parchemins',
  potion: 'Potions',
  container: 'Coffres',
  miscellaneous: 'Divers',
};

// Sub-tile positions 0..3, in DM engine order: clockwise from north-west.
// Checked against the original game (docs/008). The dump's comments
// ("South/BottomLeft", "West/BottomRight") are misleading for 2 and 3.
const SUBCELLS = [
  [0.25, 0.25], // 0 north-west
  [0.75, 0.25], // 1 north-east
  [0.75, 0.75], // 2 south-east
  [0.25, 0.75], // 3 south-west
];
/** Fractional (u, v) inside the tile, u east, v south. */
export const subcellOffset = (position) => SUBCELLS[position];
export const SUBCELL_LABELS = ['NO', 'NE', 'SE', 'SO'];
// On a wall tile, the position is the face the item lies against.
export const FACES = ['N', 'E', 'S', 'W'];
export const FACE_LABELS = ['face N', 'face E', 'face S', 'face O'];

/** States of a waterskin (miscellaneous type 1) by charge count, as DM describes it (ReDMCSB F342, docs/050). */
export const WATERSKIN_STATES = ['vide', 'presque vide', 'presque pleine', 'pleine'];

/** Name and extra info of an item reference ({ kind, index }). */
export function describeItem(dungeon, { kind, index, position }) {
  const entry = dungeon.data[ITEM_POOLS[kind]][index];
  const item = { kind, index, position, category: kind, name: entry.name ?? kind };
  if (kind === 'scroll') {
    item.name = 'Scroll';
    const text = dungeon.data.texts[entry.text]?.text;
    if (text) item.note = text.split('\n')[0];
  }
  if (kind === 'potion' && entry.power) item.note = `puissance ${Math.ceil(entry.power / 40)}`;
  if (kind === 'weapon' && entry.charges) item.note = `${entry.charges} charge${entry.charges > 1 ? 's' : ''}`;
  // A torch (type 2): lit in a hand, burnt out at 0 charges (docs/032).
  if (kind === 'weapon' && entry.type === 2) {
    if (!entry.charges) item.note = 'consumée';
    else if (entry.lit) item.note += ', allumée';
  }
  if (kind === 'miscellaneous' && entry.type === 1) item.note = WATERSKIN_STATES[entry.subtype ?? 0];
  if (entry.items?.length) item.contents = entry.items.map((ref) => describeItem(dungeon, ref));
  return item;
}

export function describeCreature(dungeon, index) {
  return describeGroup(dungeon, { ...dungeon.data.creatures[index], id: index });
}

/** A creature group of dungeon.json or of the simulation ({ id, type, members, facing, items }). */
export function describeGroup(dungeon, group) {
  return {
    index: group.id,
    category: 'creature',
    type: group.type,
    name: dungeon.data.catalog.creature[group.type] ?? `Creature ${group.type}`,
    count: group.members.length,
    members: group.members, // [{ hp, position }], position null = alone in the centre
    facing: group.facing,
    possessions: (group.items ?? []).map((ref) => describeItem(dungeon, ref)),
  };
}

/**
 * Contents of a tile: { items: [...describeItem], creature: describeCreature | null }.
 * Items keep the original stacking order. Returns null for an empty tile.
 * `itemRefs` replaces the items of dungeon.json (the simulation passes the items lying there now),
 * and `group` its creature group (the simulation passes the group standing there now, or null).
 */
export function tileContents(dungeon, level, x, y, itemRefs, group) {
  const refs = dungeon.tileAt(level, x, y)?.detail?.items ?? [];
  const items = (itemRefs ?? refs.filter((r) => ITEM_POOLS[r.kind])).map((r) => describeItem(dungeon, r));
  let creature;
  if (group !== undefined) creature = group && describeGroup(dungeon, group);
  else {
    const creatureRef = refs.find((r) => r.kind === 'creature');
    creature = creatureRef ? describeCreature(dungeon, creatureRef.index) : null;
  }
  return items.length || creature ? { items, creature } : null;
}

/**
 * Flat inventory of the whole dungeon, one entry per item or creature group:
 * { category, name, level, x, y, position, onWall, inside?, count?, note? }.
 * Nested items get the location of their owner and `inside` = owner name.
 */
export function buildInventory(dungeon) {
  const entries = [];
  const pushItem = (item, place, inside) => {
    entries.push({ category: item.category, name: item.name, note: item.note, ...place, position: inside ? null : item.position, inside });
    for (const child of item.contents ?? []) pushItem(child, place, item.name);
  };
  for (let level = 0; level < dungeon.levelCount; level++) {
    for (const { x, y } of dungeon.detailedTiles(level)) {
      const contents = tileContents(dungeon, level, x, y);
      if (!contents) continue;
      const place = { level, x, y, onWall: dungeon.tileAt(level, x, y).type === 'wall' };
      for (const item of contents.items) pushItem(item, place, null);
      if (contents.creature) {
        const c = contents.creature;
        entries.push({ category: 'creature', name: c.name, count: c.count, ...place, position: null });
        for (const item of c.possessions) pushItem(item, place, c.name);
      }
    }
  }
  return entries;
}
