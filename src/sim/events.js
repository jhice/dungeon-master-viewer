// Minimal event bus: the views subscribe to what the simulation emits.
// Events (see also logic.js: tileChanged, textChanged, actuatorFired, ornamentChanged):
//   'partyMoved' { party, from, kind: 'step'|'turn'|'teleport', effects?, loop? }
//                effects: [{ type: 'stairs'|'fall'|'teleport', party }…] applied after a step (rules.js)
//   'blocked'    { party, reason }
//   'itemsMoved' { from, to, items } items fell through a pit or were carried by a teleporter
//   'creaturesMoved' { group, from, to, carried?, generated?, turned? } a group stepped, fell, was carried,
//                appeared (from = null) or turned on the spot; from / to = { level, x, y, facing } (creatures.js)
//   'groupAlerted' { group, seen } a group noticed the party (seen, or met next to it) and goes after it
//                (creaturesMoved also carries `killed: true` when a member dies; to = null: the group is gone)
//   'championChanged' { champion } health, stamina, mana or state of the champion changed (champion.js)
//   'creatureHit' { result, damage, group, killed, destroyed } the champion struck a group (combat.js)
//   'championHit' { group, result: 'hit'|'miss', damage } a group attacked the champion
//   'championDied' { champion, group }
//   'projectilesMoved' { level } items in flight moved on a level (projectiles.js)
//   'itemStolen' { group, item, hand } a Giggler took the item of a hand (0 ready, 1 action)
//   'groupFled' { group, reason: 'fear'|'theft' } a group runs away for a while (creatures.js)
//   'symbolsChanged' { champion } the line of spell symbols changed (champion.symbols, spells.js)
//   'spellCast'  { champion, spell, power, item?, reason: 'meaningless'|'needsFlask'|'potion'|'noEffect'|'unimplemented' }
//                a spell was cast; spell = null if meaningless, power 1..6, item = the flask filled (spells.js)
//   'potionDrunk' { champion, item, name, effect: 'health'|'stamina'|'mana'|null, gained } (potions.js)
//   'lightChanged' { amount, palette, permanent, torches: [{ hand, item, charges }], magical } (light.js)
//   'torchesWorn' { torches: [{ hand, item, charges }] } the torches in hand lost a charge (every 512 ticks)
//   'explosion'  { level, x, y, spell: 'fireball' } a fireball exploded on a tile (magic.js)
//   'doorBroken' { level, x, y, by: 'fireball' } a fireball broke a door (magic.js)
//                (creatureHit and championHit carry `spell: 'fireball'` when a fireball wounds)
//   'grimoireChanged' { scrolls: [index], learned: [spell] } the party held new scrolls (grimoire.js)
//   'sound'      { id, level, x, y, immediate? } a sound made on a tile (ids: core/sound-info.js, docs/041);
//                immediate: an action of the party, played at once even during a tick
//   'reset'      { party }

export function createEmitter() {
  const listeners = new Map(); // type -> Set<fn>
  return {
    /** Subscribes to an event type; returns the unsubscribe function. */
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    emit(type, payload) {
      for (const fn of listeners.get(type) ?? []) fn(payload);
    },
    clear() {
      listeners.clear();
    },
  };
}
