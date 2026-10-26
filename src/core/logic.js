// Dungeon logic as a graph: actuators (triggers, gates, generators…) and
// teleporters, with the links between tiles they create. Renderer-agnostic:
// renderers only receive the links to draw.

import { decodeItemId } from './item-ids.js';

// Families of actuators, for markers and colours.
export const FAMILY_LABELS = {
  floorTrigger: 'déclencheur au sol',
  wallTrigger: 'déclencheur mural',
  logic: 'logique (porte ET/OU, compteur)',
  shooter: 'lanceur de projectiles',
  generator: 'générateur de créatures',
  portrait: 'portrait de champion',
  inactive: 'inactif / décor',
};

export const ACTION_LABELS = {
  set: 'active / ouvre',
  clear: 'désactive / ferme',
  toggle: 'bascule',
  hold: 'maintient (tant que pressé)',
};

export function actuatorFamily(a) {
  if (a.generator) return 'generator';
  if (a.kind === 'floor') return 'floorTrigger';
  if (a.type === 5 || a.type === 6) return 'logic';
  if (a.missile || [8, 9, 10].includes(a.type)) return 'shooter';
  if (a.type === 127) return 'portrait';
  if (a.type === 0) return 'inactive';
  return 'wallTrigger';
}

const SCOPE_LABELS = { all: 'tout', creatures: 'créatures', items: 'objets', items_party: 'groupe et objets' };

/** Short description of an actuator: { title, details: string[] }. */
export function describeActuator(dungeon, a) {
  const details = [];
  if (a.dataNote === 'item identifier') {
    const item = decodeItemId(dungeon, a.data);
    details.push(`objet attendu : ${item.name}${item.certainty === 'confirmé' ? '' : ` (${item.certainty})`}`);
  } else if (a.generator) {
    const name = dungeon.data.catalog.creature[a.data] ?? `créature ${a.data}`;
    const count = a.generator.isMax ? `jusqu'à ${a.generator.count}` : `${a.generator.count}`;
    details.push(`génère ${count} × ${name}`);
  } else if (a.dataNote) {
    details.push(a.dataNote);
  }
  if (a.gate) {
    const bits = (b) => b.map((v) => (v ? 1 : 0)).join('');
    details.push(`état ${bits(a.gate.current)} / référence ${bits(a.gate.reference)}`);
  }
  if (a.type === 6) details.push(`compteur : ${a.data}`);
  if (a.missile) details.push(`puissance ${a.missile.power}`);
  if (a.remote) details.push(`→ ${ACTION_LABELS[a.action] ?? a.action} (${a.remote.x}, ${a.remote.y})`);
  if (a.local) details.push(`action locale : ${a.local.name ?? a.local.action}`);
  if (a.delay) details.push(`délai ${a.delay}`);
  if (a.onceOnly) details.push('une seule fois');
  if (a.revert) details.push('inversé');
  return { title: a.typeName ?? `actuator ${a.type}`, details };
}

export function describeTeleporter(dungeon, t) {
  const destMap = dungeon.level(t.dest.map);
  const details = [
    `→ niveau ${t.dest.map} (${t.dest.x}, ${t.dest.y})`,
    `transporte : ${SCOPE_LABELS[t.scope] ?? t.scope}`,
  ];
  if (t.rotation || t.rotationType === 'absolute') {
    details.push(t.rotationType === 'absolute' ? `orientation finale ${['N', 'E', 'S', 'O'][t.rotation / 90]}` : `rotation ${t.rotation}°`);
  }
  if (t.sound) details.push('son');
  if (!destMap) details.push('destination invalide');
  return { title: 'Téléporteur', details };
}

const keyOf = (level, x, y) => `${level}:${x},${y}`;

/**
 * Builds the logic graph once.
 * Link: { kind: 'actuator'|'teleporter', from: {level,x,y}, to: {level,x,y},
 *         action?, delay?, once?, family?, scope?, index }
 * @returns {{ links, outgoing(level,x,y), incoming(level,x,y), actuatorsAt(level,x,y), teleporterAt(level,x,y), linksOfLevel(level) }}
 */
export function buildLogic(dungeon) {
  const links = [];
  const out = new Map();
  const into = new Map();
  const actuatorsByTile = new Map();
  const teleporterByTile = new Map();
  const push = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  const addLink = (link) => {
    links.push(link);
    push(out, keyOf(link.from.level, link.from.x, link.from.y), link);
    push(into, keyOf(link.to.level, link.to.x, link.to.y), link);
  };

  dungeon.data.actuators.forEach((a, index) => {
    const from = { level: a.at.map, x: a.at.x, y: a.at.y };
    push(actuatorsByTile, keyOf(from.level, from.x, from.y), { ...a, index });
    if (!a.remote) return;
    addLink({
      kind: 'actuator',
      index,
      family: actuatorFamily(a),
      action: a.action,
      delay: a.delay,
      once: a.onceOnly,
      from,
      to: { level: a.at.map, x: a.remote.x, y: a.remote.y },
    });
  });

  dungeon.data.teleporters.forEach((t, index) => {
    const from = { level: t.at.map, x: t.at.x, y: t.at.y };
    teleporterByTile.set(keyOf(from.level, from.x, from.y), { ...t, index });
    addLink({ kind: 'teleporter', index, scope: t.scope, from, to: { level: t.dest.map, x: t.dest.x, y: t.dest.y } });
  });

  return {
    links,
    outgoing: (level, x, y) => out.get(keyOf(level, x, y)) ?? [],
    incoming: (level, x, y) => into.get(keyOf(level, x, y)) ?? [],
    actuatorsAt: (level, x, y) => actuatorsByTile.get(keyOf(level, x, y)) ?? [],
    teleporterAt: (level, x, y) => teleporterByTile.get(keyOf(level, x, y)) ?? null,
    linksOfLevel: (level) => links.filter((l) => l.from.level === level || l.to.level === level),
  };
}
