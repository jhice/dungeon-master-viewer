// Converts the parsed Dungeon.xml tree into the compact JSON model
// described in docs/001-structure-format.md (§ 8) and docs/002-conversion-json.md.

import { elements, child, childText, trailingComment } from './xml-parser.mjs';

export const TILE_TYPES = ['wall', 'floor', 'pit', 'stairs', 'door', 'teleporter', 'fakewall'];
// Same characters as <overview>, so the grid can be checked against it.
export const TILE_CHARS = ['W', '.', 'p', 's', 'd', 't', 'w'];
const DOOR_GRAPHICS = ['Porticullis', 'Wooden', 'Iron', 'Ra'];
const SIDES = ['N', 'E', 'S', 'W'];
const DIRECTION = { North: 'N', East: 'E', South: 'S', West: 'W' };

// XML pool element name -> JSON pool name / tile item kind.
export const POOLS = {
  doors: 'door',
  teleporters: 'teleporter',
  texts: 'text',
  actuators: 'actuator',
  creatures: 'creature',
  weapons: 'weapon',
  clothes: 'cloth',
  scrolls: 'scroll',
  potions: 'potion',
  containers: 'container',
  miscellaneouses: 'miscellaneous',
};
const POOL_OF_KIND = Object.fromEntries(Object.entries(POOLS).map(([pool, kind]) => [kind, pool]));
// JSON key of each pool (XML 'miscellaneouses' becomes 'miscellaneous').
export const JSON_POOL = { ...Object.fromEntries(Object.keys(POOLS).map((p) => [p, p])), miscellaneouses: 'miscellaneous' };

const int = (v) => (v === undefined ? undefined : Number.parseInt(v, 10));
const bool = (v) => v === '1';

/** Fields the dump exposes but that are unused, padding or runtime-only in DM. They must be 0 to be dropped silently. */
const DROPPED_ZERO = {
  dungeon: ['unused1', 'start_unused', 'number_of_unused1', 'number_of_unused2', 'number_of_unused3', 'number_of_missiles', 'number_of_clouds'],
  door: ['bits_9_15'],
  teleporter: ['word_2_bits_0_7'],
  text: ['actuator', 'complex'],
  creature: ['byte_3_bits_3_7'],
  weapon: ['runtime'],
  cloth: ['bits_9_12', 'bits_14_15'],
  scroll: ['bits_11_15'],
  container: ['word2', 'type'],
  miscellaneous: ['bits_8_13'],
  map: ['unused1', 'unused2', 'graphics_floor_style', 'graphics_map_style'],
};

export function convertDungeon(root) {
  const warnings = [];
  const warn = (msg) => warnings.push(msg);
  const checkZero = (kind, node, where) => {
    for (const k of DROPPED_ZERO[kind] ?? []) {
      if (node.attrs[k] !== undefined && node.attrs[k] !== '0') warn(`${where}: dropped field ${k}=${node.attrs[k]} is not 0`);
    }
  };

  checkZero('dungeon', root, 'dungeon');
  const a = root.attrs;
  const objects = child(root, 'objects');

  // --- Pools --------------------------------------------------------------
  const pools = {};
  const catalog = {}; // kind -> { type: name }, gathered from comments
  for (const [poolTag, kind] of Object.entries(POOLS)) {
    const poolNode = child(objects, poolTag);
    pools[JSON_POOL[poolTag]] = elements(poolNode, kind).map((node, i) => {
      if (int(node.attrs.index) !== i) warn(`${poolTag}[${i}]: XML index is ${node.attrs.index}`);
      checkZero(kind, node, `${kind}[${i}]`);
      const entry = convertPoolEntry(kind, node);
      const name = trailingComment(poolNode, node);
      if (name !== undefined && entry.type !== undefined) {
        entry.name = name;
        const names = (catalog[kind] ??= {});
        if (names[entry.type] !== undefined && names[entry.type] !== name) {
          warn(`${kind} type ${entry.type} named both "${names[entry.type]}" and "${name}"`);
        }
        names[entry.type] = name;
      }
      return entry;
    });
  }

  // Raw pool actuators are kept aside to be cross-checked with the decoded tile form.
  const rawActuators = pools.actuators;
  pools.actuators = new Array(rawActuators.length);

  // --- Maps ---------------------------------------------------------------
  const placed = {}; // kind -> Set of indexes already placed, to detect duplicates
  const place = (kind, index, at, where) => {
    const pool = pools[JSON_POOL[POOL_OF_KIND[kind]]];
    if (!pool || index >= pool.length) return warn(`${where}: ${kind}[${index}] does not exist`);
    const set = (placed[kind] ??= new Set());
    if (set.has(index)) warn(`${where}: ${kind}[${index}] placed twice`);
    set.add(index);
    if (kind !== 'actuator') pool[index].at = at;
  };

  // Item references inside <items>, recursively for creature possessions and chest contents.
  const convertItems = (itemsNode, at, where) => {
    const refs = [];
    for (const node of elements(itemsNode)) {
      if (node.tag === 'random_wall_decoration' || node.tag === 'random_floor_decoration') continue;
      const kind = node.tag;
      const index = int(node.attrs.index);
      if (!POOL_OF_KIND[kind]) {
        warn(`${where}: unknown item <${kind}>`);
        continue;
      }
      place(kind, index, at, where);
      if (kind === 'actuator') {
        const decoded = convertActuator(node, warn, `${where} actuator[${index}]`);
        decoded.at = at;
        const raw = rawActuators[index];
        if (raw && raw.type !== decoded.type) warn(`actuator[${index}]: pool type ${raw.type} != tile type ${decoded.type}`);
        pools.actuators[index] = decoded;
      }
      const nested = child(node, 'items');
      if (nested) {
        const owner = pools[JSON_POOL[POOL_OF_KIND[kind]]][index];
        owner.items = convertItems(nested, { in: kind, index }, `${where} ${kind}[${index}]`);
      }
      refs.push({ kind, index, ...(at.in ? {} : { position: int(node.attrs.position) }) });
    }
    return refs;
  };

  const maps = elements(child(root, 'maps'), 'map').map((mapNode, mapIndex) => {
    checkZero('map', mapNode, `map[${mapIndex}]`);
    const m = mapNode.attrs;
    const width = int(m.width);
    const height = int(m.height);
    const tileNodes = elements(child(mapNode, 'tiles'), 'tile');
    if (tileNodes.length !== width * height) warn(`map[${mapIndex}]: ${tileNodes.length} tiles, expected ${width * height}`);

    const rows = Array.from({ length: height }, () => new Array(width).fill('?'));
    const decoRows = Array.from({ length: height }, () => new Array(width).fill('0'));
    const tiles = {};
    tileNodes.forEach((tileNode, i) => {
      if (int(tileNode.attrs.index) !== i) warn(`map[${mapIndex}] tile ${i}: XML index is ${tileNode.attrs.index}`);
      const x = i % width;
      const y = Math.floor(i / width);
      const where = `map[${mapIndex}] (${x},${y})`;
      const typeCode = int(tileNode.attrs.type);
      rows[y][x] = TILE_CHARS[typeCode] ?? '?';
      decoRows[y][x] = decorationFlags(tileNode.attrs).toString(16);
      const tile = convertTileAttributes(typeCode, tileNode.attrs, warn, where);

      const itemsNode = child(tileNode, 'items');
      if (itemsNode) {
        const decorations = convertDecorations(itemsNode);
        if (decorations.length) tile.decorations = decorations;
        const items = convertItems(itemsNode, { map: mapIndex, x, y }, where);
        if (items.length) tile.items = items;
      }
      if (bool(tileNode.attrs.has_objects) !== Boolean(tile.items)) warn(`${where}: has_objects=${tileNode.attrs.has_objects} but ${tile.items?.length ?? 0} items`);

      // Plain walls and floors are fully described by the grid.
      if (Object.keys(tile).length > 1) tiles[`${x},${y}`] = tile;
    });

    const overview = child(mapNode, 'overview').text.split('\n').map((l) => l.trim()).filter(Boolean);

    return {
      index: int(m.index),
      level: int(m.level),
      offset: { x: int(m.offsetx), y: int(m.offsety) },
      width,
      height,
      difficulty: int(m.difficulty),
      creatureTypeCount: int(m.creature_types),
      unused3: int(m.unused3), // non-zero on some maps, meaning unknown: kept for fidelity
      doorTypes: [DOOR_GRAPHICS[int(m.graphics_door0)], DOOR_GRAPHICS[int(m.graphics_door1)]],
      graphicsCounts: {
        wall: int(m.graphics_wall),
        wallRandom: int(m.graphics_wall_random),
        floor: int(m.graphics_floor),
        floorRandom: int(m.graphics_floor_random),
        door: int(m.graphics_door),
      },
      creatureGraphics: convertGraphicsList(mapNode, 'creature_graphics', 'creature_graphic'),
      wallDecorations: convertGraphicsList(mapNode, 'wall_decoration_graphics', 'wall_decoration_graphic'),
      floorDecorations: convertGraphicsList(mapNode, 'floor_decoration_graphics', 'floor_decoration_graphic'),
      doorDecorations: convertGraphicsList(mapNode, 'door_decoration_graphics', 'door_decoration_graphic'),
      borderDecorations: elements(child(mapNode, 'border_random_decorations')).map((d) => ({
        x: int(d.attrs.x),
        y: int(d.attrs.y),
        graphic: int(d.attrs.graphic),
        side: SIDES[int(d.attrs.position)],
      })),
      grid: rows.map((r) => r.join('')),
      // Hex digit per tile: walls N=1 E=2 S=4 W=8, floors and fake walls 1 = decoration allowed.
      allowDecoration: decoRows.map((r) => r.join('')),
      tiles,
      _overview: overview, // removed after validation
    };
  });

  pools.actuators.forEach((act, i) => {
    if (!act) warn(`actuator[${i}] is not placed on any tile: decoded form unavailable`);
  });

  return {
    dungeon: {
      format: 'dm-dungeon',
      version: 1,
      seed: int(a.seed),
      start: { map: 0, x: int(a.start_x), y: int(a.start_y), facing: DIRECTION[a.start_facing] },
      counts: Object.fromEntries(
        Object.entries(a)
          .filter(([k]) => k.startsWith('number_of_') && !DROPPED_ZERO.dungeon.includes(k))
          .map(([k, v]) => [k.slice('number_of_'.length), int(v)]),
      ),
      catalog,
      maps,
      ...pools,
    },
    rawActuators,
    warnings,
  };
}

// --- Pool entries -----------------------------------------------------------

function cleanText(raw) {
  // '_THE', '_AND', '_YOU' mark single 5-bit special characters in the original encoding.
  return raw.replace(/_(THE|AND|YOU)/g, '$1');
}

function convertPoolEntry(kind, node) {
  const t = node.attrs;
  switch (kind) {
    case 'door':
      return {
        type: int(t.type),
        ornate: int(t.ornate),
        opening: t.opening.toLowerCase(),
        button: bool(t.button),
        fireball: bool(t.fireball),
        force: bool(t.force),
      };
    case 'teleporter':
      return {
        dest: { map: int(t.dest_map), x: int(t.dest_map_x), y: int(t.dest_map_y) },
        rotation: int(t.rotation),
        rotationType: t.rotation_type.toLowerCase(),
        scope: t.scope.toLowerCase(),
        sound: bool(t.sound),
      };
    case 'text':
      // `raw` keeps the '_' markers of special characters, only when there are some.
      return {
        visible: bool(t.visible),
        offset: int(t.text_data),
        text: cleanText(node.text),
        ...(node.text.includes('_') && { raw: node.text }),
      };
    case 'actuator':
      return {
        type: int(t.type),
        data: int(t.data),
        graphic: int(t.graphic_number),
        word2: int(t.word2_bits012),
        word3: int(t.word3),
      };
    case 'creature': {
      const count = int(t.number_of_creatures);
      const members = [];
      for (let k = 1; k <= count; k++) {
        members.push({ hp: int(t[`hit_point_${k}`]), position: count === 1 ? null : int(t[`position_${k}`]) });
      }
      return {
        type: int(t.type),
        count,
        members,
        facing: DIRECTION[t.facing],
        important: bool(t.is_important),
        ...(t.in_game !== '0' && { inGame: int(t.in_game) }),
        ...(t.byte_4_bit_7 !== '0' && { byte4bit7: int(t.byte_4_bit_7) }),
      };
    }
    case 'weapon':
      return {
        type: int(t.type),
        charges: int(t.number_of_charges),
        broken: bool(t.is_broken),
        poisoned: bool(t.is_poisoned),
        cursed: bool(t.is_cursed),
        important: bool(t.is_important),
      };
    case 'cloth':
      return { type: int(t.type), broken: bool(t.is_broken), cursed: bool(t.is_cursed), important: bool(t.is_important) };
    case 'scroll':
      return { text: int(t.referred_text) };
    case 'potion':
      return { type: int(t.type), power: int(t.power) };
    case 'container':
      // Only chests exist in DM; bit_0 / bit_3_15 hold random content according to the dump notes.
      return { type: 0 };
    case 'miscellaneous':
      return { type: int(t.type), subtype: int(t.subtype), important: bool(t.is_important) };
    default:
      throw new Error(`Unknown pool kind ${kind}`);
  }
}

// --- Tiles ------------------------------------------------------------------

function convertTileAttributes(typeCode, t, warn, where) {
  const type = TILE_TYPES[typeCode];
  if (!type) warn(`${where}: unknown tile type ${typeCode}`);
  if (t.unused !== undefined && t.unused !== '0') warn(`${where}: unused=${t.unused}`);
  const tile = { type };
  switch (type) {
    case 'pit':
      Object.assign(tile, { open: bool(t.is_open), imaginary: bool(t.is_imaginary), invisible: bool(t.is_invisible) });
      break;
    case 'stairs':
      Object.assign(tile, {
        direction: t.direction_str.toLowerCase(),
        orientation: t.orientation_str === 'North-South' ? 'NS' : 'WE',
      });
      break;
    case 'door':
      Object.assign(tile, {
        open: t.state_str === 'Open',
        orientation: t.orientation_str === 'North-South' ? 'NS' : 'WE',
      });
      break;
    case 'teleporter':
      Object.assign(tile, { open: bool(t.is_open), visible: bool(t.is_visible) });
      break;
    case 'fakewall':
      Object.assign(tile, { open: bool(t.is_open), imaginary: bool(t.is_imaginary) });
      break;
  }
  return tile;
}

// Random decorations are already resolved in <items>; these flags only say where the game may place them.
function decorationFlags(t) {
  if (t.allow_decoration !== undefined) return bool(t.allow_decoration) ? 1 : 0;
  return ['north', 'east', 'south', 'west'].reduce((f, side, bit) => f | (bool(t[`allow_decoration_${side}`]) << bit), 0);
}

function convertDecorations(itemsNode) {
  return elements(itemsNode)
    .filter((n) => n.tag === 'random_wall_decoration' || n.tag === 'random_floor_decoration')
    .map((n) =>
      n.tag === 'random_wall_decoration'
        ? { graphic: int(n.attrs.graphic), side: SIDES[int(n.attrs.position)] }
        : { graphic: int(n.attrs.graphic) },
    );
}

function convertGraphicsList(mapNode, listTag, itemTag) {
  const listNode = child(mapNode, listTag);
  return elements(listNode, itemTag).map((n) => {
    const name = trailingComment(listNode, n);
    return { type: int(n.attrs.type), ...(name !== undefined && { name }) };
  });
}

// --- Actuators (decoded form found in tiles) ---------------------------------

const ACTUATOR_LABEL = /^(Wall|Floor) actuator: (\d+) - (.*)$/;

function convertActuator(node, warn, where) {
  const label = node.children.map((c) => c.comment?.match(ACTUATOR_LABEL)).find(Boolean);
  if (!label) warn(`${where}: missing actuator label comment`);
  const fields = Object.fromEntries(elements(node).map((c) => [c.tag, c]));
  const take = (tag) => {
    const n = fields[tag];
    delete fields[tag];
    return n?.text.trim();
  };
  const note = (tag) => {
    const n = fields[tag];
    const c = n && trailingComment(node, n);
    return c && !/^0 = invisible$|specific$/.test(c) ? c.replace(/^(local specific|type 3 specific): /, '') : undefined;
  };

  const act = {
    kind: label?.[1].toLowerCase(),
    type: undefined,
    typeName: label?.[3],
  };
  const dataNote = note('data');
  const actionNote = note('action');

  act.type = int(take('type'));
  const dataNode = fields.data;
  if (dataNode && elements(dataNode).length) {
    // And/Or gate (wall type 5): 4 current bits + 4 reference bits.
    const bit = (name) => bool(childText(dataNode, name));
    act.gate = {
      current: SIDES.map((s, i) => bit(`current_state_${['north', 'east', 'south', 'west'][i]}`)),
      reference: SIDES.map((s, i) => bit(`reference_state_${['north', 'east', 'south', 'west'][i]}`)),
    };
    if (childText(dataNode, 'unused') !== '0') warn(`${where}: gate unused bits set`);
    delete fields.data;
  } else {
    act.data = int(take('data'));
    if (dataNote) act.dataNote = dataNote;
  }
  act.graphic = int(take('graphic'));
  act.delay = int(take('delay'));
  act.sound = bool(take('has_sound'));
  act.onceOnly = bool(take('once_only'));

  const target = take('action_target');
  if (target !== undefined) {
    act.target = target;
    act.action = take('action_type').toLowerCase();
    act.revert = bool(take('has_revert'));
  }
  if (fields.target_x) {
    act.remote = { x: int(take('target_x')), y: int(take('target_y')), direction: DIRECTION[take('direction')] };
  }
  if (fields.action) {
    act.local = { action: int(take('action')), ...(actionNote && { name: actionNote }) };
  }
  if (fields.power) {
    act.missile = { power: int(take('power')), powerDecrease: int(take('power_decrease')) };
  }
  if (fields.number_of_creatures) {
    act.generator = {
      count: int(take('number_of_creatures')),
      isMax: bool(take('is_max_number')),
      hpMultiplier: int(take('hit_point_multiplier')),
      word2bit11: int(take('word2_bits11')),
    };
  }

  for (const zero of ['unused_word2', 'unused_word3', 'word2_bits01', 'word2_bits35']) {
    const v = take(zero);
    if (v !== undefined && v !== '0') warn(`${where}: ${zero}=${v}`);
  }
  const leftovers = Object.keys(fields);
  if (leftovers.length) {
    warn(`${where}: unhandled fields ${leftovers.join(', ')}`);
    act.extra = Object.fromEntries(leftovers.map((k) => [k, fields[k].text.trim()]));
  }
  return act;
}
