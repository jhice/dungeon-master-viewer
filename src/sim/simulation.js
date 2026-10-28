// The simulation: mutable state + party + clock + action engine + event bus.
// No DOM, no Three.js, so it runs in Node too. Every view (first person, 2D,
// 3D) subscribes to its events; controls send it commands; the caller drives
// the clock with tick().

import { createEmitter } from './events.js';
import { createState } from './state.js';
import { createClock } from './clock.js';
import { createLogic } from './logic.js';
import { createCreatures } from './creatures.js';
import { createParty, step, turn } from './party.js';
import { blockReason, resolveArrival } from './rules.js';
import { createChampion, championMirror, regenerate } from './champion.js';
import { ACTIONS, championStrikes, creatureStrikes, creatureReaches, projectileStrikes } from './combat.js';
import { createProjectiles } from './projectiles.js';
import { addSymbol, deleteSymbol, castSpell } from './spells.js';
import { emptyFlaskHand, fillFlask, drinkable, drinkPotion } from './potions.js';
import { createLight } from './light.js';
import { createMagic } from './magic.js';
import { createGrimoire } from './grimoire.js';
import { creatureInfo } from '../core/creature-info.js';
import { itemInfo } from '../core/item-info.js';
import { mulberry32 } from './random.js';
import { SIDE_DELTAS, FACINGS } from '../core/dungeon.js';

// Seed of the combat random draws (a game replays the same way).
const COMBAT_SEED = 0xc3a;
const LORD_CHAOS = 23; // cannot be damaged ("archenemy", ReDMCSB F190)

export const COMMANDS = ['forward', 'back', 'left', 'right', 'turnLeft', 'turnRight'];

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 */
export function createSimulation(dungeon) {
  const events = createEmitter();
  const state = createState(dungeon);
  const clock = createClock();
  let party = createParty(dungeon.start);
  let champion;
  let random;
  const logic = createLogic(dungeon, state, clock, {
    emit: events.emit,
    party: () => party,
    onOpenedUnderParty: applyTileUnderParty,
    onOpenedUnderGroup: (level, x, y) => creatures.settle(level, x, y),
    generate: (index) => creatures.generate(index),
    crush: doorCrushes,
  });
  const creatures = createCreatures(dungeon, state, clock, logic, {
    emit: events.emit,
    party: () => party,
    partyAlive: () => !champion.dead,
    attack: creatureAttacks,
    steal: creatureSteals,
  });

  const projectiles = createProjectiles(state, {
    emit: events.emit,
    hitGroup: (p, group) => (p.spell ? magic.hitGroup(p, group) : projectileHits(p, group)),
    drop: (level, x, y, items) => logic.itemsDropped(level, x, y, items),
    impact: (p, target) => magic.impact(p, target),
  });

  // Light around the party (docs/032): torches in hand, magical light; Hall always lit.
  const light = createLight(dungeon, state, clock, { emit: events.emit, party: () => party });
  events.on('inventoryChanged', light.update); // a torch put in or taken from a hand
  events.on('partyMoved', light.update); // another level

  // The grimoire (docs/034): scrolls held by the party, and the spells they name.
  const grimoire = createGrimoire(dungeon, state, events.emit);
  events.on('inventoryChanged', grimoire.update);

  // Spells acting in the dungeon (docs/033): Open Door, Fireball, Torch.
  const magic = createMagic(dungeon, state, clock, {
    emit: events.emit,
    party: () => party,
    champion: () => champion,
    random: () => random,
    logic,
    projectiles,
    light,
    hurtChampion: (damage) => woundChampion(damage, { spell: 'fireball' }),
    hurtCreature: (group, member, damage) => {
      member.hp = Math.max(0, member.hp - damage);
      const killed = member.hp === 0;
      const destroyed = killed && creatures.kill(group, member);
      events.emit('creatureHit', { result: 'hit', damage, group, killed, destroyed, spell: 'fireball' });
      return destroyed;
    },
    provoke: (group) => creatures.provoke(group),
  });
  const spellEffects = { potion: fillHandFlask, openDoor: magic.launch, fireball: magic.launch, torch: (spell, power) => magic.torch(power) };

  // The champion, Zed (docs/023), with the items of his mirror in the inventory.
  function startChampion() {
    champion = createChampion(dungeon);
    random = mulberry32(COMBAT_SEED);
    const mirror = championMirror(dungeon);
    if (!mirror) return;
    const lying = state.itemsAt(mirror.level, mirror.x, mirror.y);
    state.inventory.push(...lying.splice(0).map(({ kind, index }) => ({ kind, index })));
  }
  startChampion();
  const championChanged = () => events.emit('championChanged', { champion });

  // A creature group next to the party, facing it, attacks the champion.
  function creatureAttacks(group, info) {
    if (champion.dead) return;
    const outcome = creatureStrikes(champion, info, random);
    if (outcome.result === 'hit') champion.health = Math.max(0, champion.health - outcome.damage);
    champion.dead = champion.health === 0;
    events.emit('championHit', { group, ...outcome });
    championChanged();
    if (champion.dead) events.emit('championDied', { champion, group });
  }

  /**
   * A closing door hits the party or a group (docs/028, ReDMCSB F241, F324, F191): an
   * attack of 5, that is 4 or 5. A champion takes it as a "self" attack, against half
   * his armour (none yet): × 130 / 64. Each material creature of the group takes it
   * whole (Lord Chaos none); the survivors want to leave the tile.
   */
  function doorCrushes({ level, x, y, group }) {
    const attack = () => 4 + Math.floor(random() * 2);
    if (!group) return woundChampion(Math.floor((attack() * 130) / 64), { door: { level, x, y } });
    let killed = 0;
    let destroyed = false;
    if (group.type !== LORD_CHAOS) {
      for (const member of [...group.members]) {
        member.hp = Math.max(0, member.hp - attack());
        if (member.hp > 0) continue;
        killed++;
        destroyed = creatures.kill(group, member);
      }
    }
    if (!destroyed) creatures.alarm(group);
    events.emit('doorCrushed', { level, x, y, group, killed, destroyed });
  }

  // The champion loses health from a door or a spell (`cause`: { door } or { spell }); he dies at 0.
  function woundChampion(damage, cause) {
    if (champion.dead) return;
    champion.health = Math.max(0, champion.health - damage);
    champion.dead = champion.health === 0;
    events.emit('championHit', { group: null, ...cause, result: 'hit', damage });
    championChanged();
    if (champion.dead) events.emit('championDied', { champion, group: null, ...cause });
  }

  // The outcome of a strike or of a thrown item on a group: a member chosen at random
  // loses health, dies at 0 (the last one: the group is gone); a survivor fights back.
  function damageGroup(group, outcome, thrown = false) {
    const member = group.members[Math.floor(random() * group.members.length)];
    let killed = false;
    let destroyed = false;
    if (outcome.result === 'hit') {
      member.hp = Math.max(0, member.hp - outcome.damage);
      killed = member.hp === 0;
      if (killed) destroyed = creatures.kill(group, member);
    }
    if (!destroyed) creatures.provoke(group);
    const result = { ...outcome, group, killed, destroyed, thrown };
    events.emit('creatureHit', result);
    return result;
  }

  // A potion spell fills the empty flask of the action hand, or else of the ready hand (G2).
  function fillHandFlask(spell, power) {
    const hand = emptyFlaskHand(dungeon, state.hands);
    if (hand < 0) return null;
    fillFlask(dungeon.data.potions[state.hands[hand].index], spell, power, random);
    return state.hands[hand];
  }

  // An action costs stamina and makes the champion tired for a while; null if he can act.
  function spend(action) {
    if (champion.dead) return 'dead';
    if (clock.now < champion.readyAt) return 'busy';
    if (champion.stamina < action.stamina) return 'exhausted';
    champion.stamina -= action.stamina;
    champion.readyAt = clock.now + action.fatigue;
    championChanged();
    return null;
  }

  // Actions of an item in the action hand (docs/024): a melee weapon or the empty hand
  // strike ("Frapper"), a throwable weapon is thrown ("Lancer"); other items have none.
  function actionsOf(item) {
    if (!item) return ['hit'];
    const info = itemInfo(dungeon, item);
    return [...(info.throwable ? ['throw'] : []), ...(info.melee ? ['hit'] : [])];
  }

  /**
   * A Giggler next to the champion tries to steal the item of a hand: the action hand
   * 7 times out of 8, the ready hand otherwise (DM for PC and Amiga 3.6, "Dungeon Master
   * Creatures"). It needs to reach him (same test as an attack, provisional) and the
   * hand must hold something. Returns the item stolen, or null.
   */
  function creatureSteals(group, info) {
    if (champion.dead) return null;
    const hand = random() < 7 / 8 ? 1 : 0;
    const item = state.hands[hand];
    if (!item || !creatureReaches(champion, info, random)) return null;
    state.hands[hand] = null;
    events.emit('inventoryChanged', { inventory: state.inventory, hand: state.hand });
    events.emit('itemStolen', { group, item, hand });
    return item;
  }

  /**
   * The champion strikes in front of him ("Frapper"), with the weapon of his action hand.
   * The strike always costs its stamina and fatigue, whatever it meets: the group in front
   * (wounded or missed), a wall ('wall', a closed fake wall too), a closed door ('door':
   * "Hit" is not one of the actions that break doors, "Actions and Combos" note e), or
   * nothing ('air': an open door, an imaginary wall, an empty tile).
   * @returns {{ result: 'dead'|'busy'|'exhausted'|'air'|'wall'|'door'|'immaterial'|'miss'|'hit', damage?, group?, killed?, destroyed? }}
   */
  function attack() {
    const action = ACTIONS.hit;
    const refused = spend(action);
    if (refused) return { result: refused };
    const [dx, dy] = SIDE_DELTAS[party.facing];
    const [x, y] = [party.x + dx, party.y + dy];
    const group = state.groupAt(party.level, x, y);
    if (!group) return { result: blockReason(state, party.level, x, y) === 'door' ? 'door' : blockReason(state, party.level, x, y) ? 'wall' : 'air' };
    const weapon = state.hands[1];
    const bonus = weapon ? itemInfo(dungeon, weapon).strength : 0;
    return damageGroup(group, championStrikes(champion, creatureInfo(group.type), action, random, bonus));
  }

  /**
   * The champion throws an item in front of him ("Lancer"), from the left or right side:
   * the item of a hand (`from` 0 or 1), or the item held by the cursor (`from` = 'cursor').
   * Energy: strength + kinetic energy of a weapon; each step costs 4 + half the weight in
   * 100 g (provisional, docs/024). The projectile also carries what its damage needs.
   * @returns {{ result: 'dead'|'nothing'|'busy'|'exhausted'|'thrown', item? }}
   */
  function throwItem(from, side = from === 0 ? 'left' : 'right') {
    const item = from === 'cursor' ? state.hand : state.hands[from];
    if (!item) return { result: 'nothing' };
    const refused = spend(ACTIONS.throw);
    if (refused) return { result: refused };
    if (from === 'cursor') state.hand = null;
    else state.hands[from] = null;
    events.emit('inventoryChanged', { inventory: state.inventory, hand: state.hand });
    const info = itemInfo(dungeon, item);
    const weight = Math.round(info.weight * 10); // in 100 g
    projectiles.launch({
      item,
      level: party.level,
      x: party.x,
      y: party.y,
      direction: party.facing,
      side,
      energy: champion.strength + info.kinetic + Math.floor(random() * 16),
      stepLoss: 4 + (weight >> 1),
      kinetic: info.weapon ? info.kinetic : weight >> 1,
      // Share of the energy left that counts in the damage: whole for weapons, else by weight (2 kg and more: whole).
      mass: info.weapon ? 1 : Math.min(weight, 20) / 20,
    });
    return { result: 'thrown', item };
  }

  // A thrown item reaches a group: it always stops there (provisional), and may wound it.
  function projectileHits(projectile, group) {
    damageGroup(group, projectileStrikes(projectile, creatureInfo(group.type), random), true);
    return true;
  }

  function command(name) {
    if (champion.dead) return;
    const from = party;
    if (name === 'turnLeft' || name === 'turnRight') {
      party = turn(party, name === 'turnLeft' ? -1 : 1);
      events.emit('partyMoved', { party, from, kind: 'turn' });
      logic.partyTurned(from, party);
      return;
    }
    const result = step(state, party, name);
    if (result.blocked) {
      events.emit('blocked', { party, reason: result.blocked });
      return;
    }
    // Stairs, pits, teleporters: applied in chain until the party stays somewhere.
    arrive(from, resolveArrival(dungeon, state, result.party), 'step');
  }

  // Moves the party, then the floor actuators of the tile left and of the tile reached act.
  function arrive(from, arrival, kind) {
    party = arrival.party;
    events.emit('partyMoved', { party, from, kind, effects: arrival.effects, loop: arrival.loop });
    logic.partyLeft(from);
    logic.partyEntered(party);
  }

  // A pit opened or a teleporter was activated under the party (actuator): its effect applies now.
  function applyTileUnderParty() {
    arrive(party, resolveArrival(dungeon, state, party), 'mechanism');
  }

  /**
   * Places the party on a tile (test tool, key F), without the effects of the tile
   * nor its floor actuators (so that a pit or a teleporter can be inspected);
   * returns the block reason if it cannot stand there.
   */
  function teleport(level, x, y) {
    const blocked = blockReason(state, level, x, y);
    if (blocked) return blocked;
    const from = party;
    party = { ...party, level, x, y };
    events.emit('partyMoved', { party, from, kind: 'teleport' });
    return null;
  }

  return {
    state,
    on: events.on,
    get party() {
      return party;
    },
    get time() {
      return clock.now;
    },
    command,
    teleport,
    /** The champion (createChampion(), champion.js): read only for the views. */
    get champion() {
      return champion;
    },
    attack,
    /** Actions of the item in the action hand: ['hit' (Frapper)?, 'throw' (Lancer)?]. */
    get actions() {
      return actionsOf(state.hands[1]);
    },
    /** Does an action of the action hand: 'hit' or 'throw'. */
    act(id) {
      return id === 'throw' ? throwItem(1) : attack();
    },
    /** Throws the item held by the cursor, from the left or right side of the view. */
    throwHeld: (side) => throwItem('cursor', side),
    /** The champion's hands: [left (ready), right (action)]. */
    get hands() {
      return state.hands;
    },
    /** Click on a hand: the item held by the cursor and the item of the hand are swapped. */
    swapHand(i) {
      if (champion.dead) return;
      [state.hand, state.hands[i]] = [state.hands[i], state.hand];
      events.emit('inventoryChanged', { inventory: state.inventory, hand: state.hand });
    },
    /** Items in flight on a level (projectiles.js). */
    projectilesOn: (level) => projectiles.on(level),
    /** Ticks before the champion can act again (fatigue of his last action). */
    get fatigue() {
      return Math.max(0, champion.readyAt - clock.now);
    },
    /** Click on what is in front of the party (wall face, door, alcove), with the item in hand. */
    clickFront: () => (champion.dead ? { target: null, fired: 0 } : logic.clickFront(party)),
    /** Items carried: [{ kind, index }]. */
    get inventory() {
      return state.inventory;
    },
    /** Item held in hand ({ kind, index }), apart from the inventory, or null. */
    get hand() {
      return state.hand;
    },
    /** Takes the i-th item of the inventory in hand (the item held goes back into the inventory). */
    takeFromInventory: (i) => logic.takeFromInventory(party, i),
    /** Stows the item in hand into the inventory (a chest with its contents). */
    stow: () => logic.stow(party),
    /**
     * Sub-tiles within reach (DM): the two front ones of the party's tile, and the two
     * near ones of the tile in front, if it is not a wall: a doorway counts, even with
     * the door closed (ReDMCSB F373, F374: the items lie in front of the leaf).
     * Sub-tiles 0..3 = NW, NE, SE, SW; the front-left one of a tile has the index of the facing.
     */
    reachable(level, x, y, position) {
      if (level !== party.level) return false;
      const f = FACINGS.indexOf(party.facing);
      const [dx, dy] = SIDE_DELTAS[party.facing];
      if (x === party.x && y === party.y) return position === f || position === (f + 1) % 4;
      const blocked = blockReason(state, level, x, y);
      if (x !== party.x + dx || y !== party.y + dy || (blocked && blocked !== 'door')) return false;
      return position === (f + 2) % 4 || position === (f + 3) % 4;
    },
    /** Picks up an item lying within reach into the empty hand; false if impossible. */
    pickUp(level, x, y, ref) {
      if (!this.reachable(level, x, y, ref.position)) return false;
      return logic.pickUp(party, level, x, y, ref);
    },
    /** Puts the item in hand on a sub-tile within reach; false if impossible. */
    drop(level, x, y, position) {
      if (!state.hand || !this.reachable(level, x, y, position)) return false;
      return logic.drop(party, level, x, y, position);
    },
    /** The line of symbols being composed: indices per step, the power first (spells.js). */
    get symbols() {
      return champion.symbols;
    },
    /** Spell area: adds the symbol `index` (0..5) of the next step; false if refused. */
    addSymbol(index) {
      if (champion.dead || !addSymbol(champion, index)) return false;
      events.emit('symbolsChanged', { champion });
      return true;
    },
    /** Spell area: the arrow deletes the last symbol. */
    deleteSymbol() {
      if (champion.dead || !deleteSymbol(champion)) return false;
      events.emit('symbolsChanged', { champion });
      return true;
    },
    /** Casts the spell composed (G1: recognised, no effect but its fatigue); null if nothing to cast. */
    castSpell() {
      if (champion.dead) return null;
      const result = castSpell(champion, clock.now, spellEffects);
      if (!result) return null;
      events.emit('symbolsChanged', { champion });
      if (result.item) events.emit('inventoryChanged', { inventory: state.inventory, hand: state.hand });
      events.emit('spellCast', { champion, ...result });
      return result;
    },
    /**
     * The champion drinks the potion held by the cursor (click on his box, the mouth of DM);
     * the flask stays in hand, empty. Returns null if the cursor holds nothing drinkable.
     * @returns {{ item, name, effect: 'health'|'stamina'|'mana'|null, gained } | null}
     */
    drink() {
      const item = state.hand;
      if (champion.dead || item?.kind !== 'potion') return null;
      const entry = dungeon.data.potions[item.index];
      if (!drinkable(entry)) return null;
      const name = entry.name;
      const result = { item, name, ...drinkPotion(champion, entry) };
      events.emit('inventoryChanged', { inventory: state.inventory, hand: state.hand });
      championChanged();
      events.emit('potionDrunk', { champion, ...result });
      return result;
    },
    /** Scrolls read (grimoire.js): [{ index, text, spells }], in the order found. */
    get knownScrolls() {
      return grimoire.scrolls();
    },
    /** Spells known from the scrolls read, in the order of the spell table. */
    get knownSpells() {
      return grimoire.spells();
    },
    /** The light now (light.js): { amount, palette, permanent, torches, magical }. */
    get light() {
      return light.current();
    },
    /** Magical light of a spell, for `ticks` then fading (light.js); G3 casts Torch with it. */
    addMagicalLight: (power, ticks) => light.addMagical(power, ticks),
    /** Advances the clock: delayed effects due by then are applied, and the creatures of the party's level act. */
    tick(ticks = 1) {
      for (let i = 0; i < ticks; i++) {
        clock.advance(1);
        projectiles.update();
        creatures.update();
        if (regenerate(champion, clock.now)) championChanged();
        light.tick();
      }
    },
    reset() {
      clock.clear();
      state.reset();
      creatures.reset();
      projectiles.reset();
      light.reset();
      startChampion();
      party = createParty(dungeon.start);
      events.emit('reset', { party });
      light.update();
    },
    dispose: events.clear,
  };
}
