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
import { createChampion, championMirror, regenerate, skillLevel } from './champion.js';
import { THROW_COST, championStrikes, creatureStrikes, creatureReaches, projectileStrikes } from './combat.js';
import { createProjectiles } from './projectiles.js';
import { addSymbol, deleteSymbol, castSpell } from './spells.js';
import { emptyFlaskHand, fillFlask, drinkable, drinkPotion } from './potions.js';
import { createLight } from './light.js';
import { createMagic } from './magic.js';
import { createGrimoire } from './grimoire.js';
import { creatureInfo } from '../core/creature-info.js';
import { itemInfo } from '../core/item-info.js';
import { EMPTY_HAND } from '../core/action-info.js';
import { ITEM_POOLS } from '../core/contents.js';
import { DOOR_CLOSED, doorStep } from '../core/tile-states.js';
import { mulberry32 } from './random.js';
import { attackSound } from '../core/sound-info.js';
import { SIDE_DELTAS, FACINGS } from '../core/dungeon.js';

// Seed of the combat random draws (a game replays the same way).
const COMBAT_SEED = 0xc3a;
const LORD_CHAOS = 23; // cannot be damaged ("archenemy", ReDMCSB F190)
const VORPAL_BLADE = 16; // weapon type: its strikes reach non-material creatures (F402)
const DOOR_FATIGUE = 6; // F407: fatigue of a strike on a closed door
const WALL_ATTACK = 1; // F366: attack on the front row when the party runs into a wall
const LIGHT_POWER = 2; // F407, Light: magical light of power 2…
const LIGHT_TICKS = 2500; // …for 2500 ticks (F404)

export const COMMANDS = ['forward', 'back', 'left', 'right', 'turnLeft', 'turnRight'];

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 */
export function createSimulation(dungeon) {
  const events = createEmitter();
  // A sound made on a tile (docs/041); the audio module decides whether it is heard.
  const sound = (id, { level, x, y }, immediate = false) => events.emit('sound', { id, level, x, y, immediate });
  // A sound one tick later (ReDMCSB C02_MODE_PLAY_ONE_TICK_LATER): after the attack sound played now.
  const soundLater = (id, at) => clock.schedule(1, () => sound(id, at));
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
    const attackId = attackSound(group.type);
    if (attackId) sound(attackId, group);
    if (outcome.result === 'hit') soundLater('wounded', party); // F230: a tick after the attack
    if (outcome.result === 'hit') champion.health = Math.max(0, champion.health - outcome.damage);
    champion.dead = champion.health === 0;
    events.emit('championHit', { group, ...outcome });
    championChanged();
    if (champion.dead) died(group);
  }

  /**
   * A closing door hits the party or a group (docs/028, ReDMCSB F241, F324, F191): an
   * attack of 5, that is 4 or 5. A champion takes it as a "self" attack, against half
   * his armour (none yet): × 130 / 64. Each material creature of the group takes it
   * whole (Lord Chaos none); the survivors want to leave the tile.
   */
  function doorCrushes({ level, x, y, group }) {
    const attack = () => 4 + Math.floor(random() * 2);
    sound(group ? 'thud' : 'wall', { level, x, y });
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

  // The champion loses health from a door, a spell or a wall (`cause`: { door }, { spell } or { wall });
  // he dies at 0. DM plays the wounded sound only for the attacks of creatures (creatureAttacks).
  function woundChampion(damage, cause) {
    if (champion.dead) return;
    champion.health = Math.max(0, champion.health - damage);
    champion.dead = champion.health === 0;
    events.emit('championHit', { group: null, ...cause, result: 'hit', damage });
    championChanged();
    if (champion.dead) died(null, cause);
  }

  function died(group, cause = {}) {
    sound('scream', party, true);
    events.emit('championDied', { champion, group, ...cause });
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

  // Whether the champion can act now with `stamina` to spend: null if so, else why not.
  function refusal(stamina) {
    if (champion.dead) return 'dead';
    if (clock.now < champion.readyAt) return 'busy';
    if (champion.stamina < stamina) return 'exhausted';
    return null;
  }

  // What an action costs once done (F407): its stamina (plus 0 or 1, ×10 as stored) and its fatigue.
  function pay(stamina, fatigue) {
    champion.stamina = Math.max(0, champion.stamina - stamina);
    champion.readyAt = clock.now + fatigue;
    championChanged();
  }
  const payAction = (action, fatigue = action.fatigue) => pay(action.stamina + Math.floor(random() * 2), fatigue);

  // An action with a fixed cost (Throw, see THROW_COST): null if paid, else why not.
  function spend(cost) {
    const refused = refusal(cost.stamina);
    if (refused) return refused;
    pay(cost.stamina, cost.fatigue);
    return null;
  }

  const entryOf = (item) => dungeon.data[ITEM_POOLS[item.kind]][item.index];
  const front = () => {
    const [dx, dy] = SIDE_DELTAS[party.facing];
    return [party.x + dx, party.y + dy];
  };

  /**
   * Actions of the action hand (docs/044, ReDMCSB F383): the combo of its item, or Punch, Kick and
   * War Cry with an empty hand. The first one is always there; the others need the champion's level
   * in their skill, and a charge of the item when the combo says so.
   */
  function actionsOf(item) {
    const combo = item ? itemInfo(dungeon, item).combo : EMPTY_HAND;
    const charges = item ? (entryOf(item)?.charges ?? 0) : 0;
    return combo
      .filter((c, i) => i === 0 || ((!c.needsCharge || charges > 0) && skillLevel(champion, c.action.skill) >= c.minLevel))
      .map((c) => c.action);
  }

  // F405: the item of the action hand loses a charge.
  function useCharge() {
    const entry = state.hands[1] && entryOf(state.hands[1]);
    if (!entry?.charges) return;
    entry.charges--;
    events.emit('inventoryChanged', { inventory: state.inventory, hand: state.hand });
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
   * A melee action (F402): the champion strikes the group in front, with the weapon of his action hand.
   * On a closed door, an action that breaks doors attacks it instead (F232, `doorHit`, fatigue 6);
   * against a wall, a door or nothing ('wall', 'door', 'air'), it costs half its fatigue (F407).
   * @returns {{ result: 'air'|'wall'|'door'|'doorHit'|'immaterial'|'miss'|'hit', broken?, damage?, group?, killed?, destroyed? }}
   */
  function strike(action) {
    sound('combat', party, true);
    const [x, y] = front();
    const weapon = state.hands[1];
    const bonus = weapon?.kind === 'weapon' ? itemInfo(dungeon, weapon).strength : 0;
    const group = state.groupAt(party.level, x, y);
    if (!group) {
      const blocked = blockReason(state, party.level, x, y);
      const tile = state.tileAt(party.level, x, y);
      if (blocked === 'door' && action.breaksDoors && !tile.detail.broken && doorStep(tile.detail) === DOOR_CLOSED) {
        payAction(action, DOOR_FATIGUE);
        soundLater('thud', party); // after the combat sound (F407)
        // F312, simplified: (strength + 0..15 + the weapon's bonus) / 2, at most 100 (provisional).
        const attack = Math.min(100, (champion.strength + Math.floor(random() * 16) + bonus) >> 1);
        return { result: 'doorHit', broken: magic.attackDoor(party.level, x, y, attack, false, 'melee') };
      }
      payAction(action, action.fatigue >> 1);
      return { result: blocked === 'door' ? 'door' : blocked ? 'wall' : 'air' };
    }
    payAction(action);
    const nonMaterial = action.name === 'Disrupt' || (weapon?.kind === 'weapon' && entryOf(weapon).type === VORPAL_BLADE);
    return damageGroup(group, championStrikes(champion, creatureInfo(group.type), action, random, bonus, nonMaterial));
  }

  /**
   * The champion strikes in front of him with a melee action of his action hand: `index`, or else
   * its first one (a click on a creature in the view, the tests).
   */
  function attack(index) {
    const melee = actionsOf(state.hands[1]).filter((a) => a.kind === 'melee');
    const action = melee.find((a) => a.index === index) ?? melee[0];
    if (!action) return { result: 'unavailable' };
    return act(action.index);
  }

  /**
   * Shoots with the bow or sling of the action hand the ammunition of the ready hand (F407, F326):
   * energy = kinetic energy of both, step loss of the launcher; the shoot damage and the Shoot skill
   * add to the damage (provisional, docs/044). Paid even without ammunition, as in DM.
   */
  function shoot(action) {
    payAction(action);
    const launcherInfo = itemInfo(dungeon, state.hands[1]);
    const ammo = state.hands[0];
    const ammoInfo = ammo && itemInfo(dungeon, ammo);
    if (!launcherInfo.launcher || ammoInfo?.ammunition !== launcherInfo.launcher.ammunition) return { result: 'noAmmo' };
    state.hands[0] = null;
    events.emit('inventoryChanged', { inventory: state.inventory, hand: state.hand });
    sound('combat', party, true);
    const attack = (launcherInfo.launcher.shootDamage + skillLevel(champion, 'Shoot')) << 1;
    projectiles.launch({
      item: ammo,
      level: party.level,
      x: party.x,
      y: party.y,
      direction: party.facing,
      side: 'right',
      energy: launcherInfo.kinetic + ammoInfo.kinetic,
      stepLoss: launcherInfo.launcher.stepLoss,
      kinetic: ammoInfo.kinetic + (attack >> 2),
      mass: 1,
      attack,
    });
    return { result: 'shot', item: ammo };
  }

  /**
   * A spell projectile of an item (F407, F327): Fireball, Spit, Invoke (a fireball 3 times out of 6;
   * its poison bolts and clouds and its spell against non-material beings are not done yet). It costs
   * 7 − min(6, skill level) mana; with less mana, its energy shrinks in proportion (at least 2).
   */
  function castAction(action) {
    let { spell, energy } = action;
    if (spell === 'invoke') {
      energy = Math.floor(random() * 128) + 100;
      spell = Math.floor(random() * 6) >= 3 ? 'fireball' : null;
    }
    let mana = 7 - Math.min(6, skillLevel(champion, action.skill));
    if (champion.mana < mana) {
      energy = Math.max(2, Math.floor((champion.mana * energy) / mana));
      mana = champion.mana;
    }
    champion.mana -= mana;
    payAction(action);
    useCharge();
    if (!spell) return { result: 'pending' };
    magic.launchAction(spell, energy);
    return { result: 'cast', spell };
  }

  /**
   * War Cry, Calm, Brandish, Blow Horn, Confuse (F401): the group in front flees unless its fear
   * resistance beats a draw below the action's fright plus the Influence skill level (15: immune).
   */
  function frighten(action) {
    payAction(action);
    if (action.usesCharge) useCharge();
    const group = state.groupAt(party.level, ...front());
    if (!group) return { result: 'nobody' };
    const fear = creatureInfo(group.type).fear;
    if (fear === 15 || fear > Math.floor(random() * (action.fright + skillLevel(champion, 'Influence')))) return { result: 'resisted', group };
    creatures.frighten(group);
    return { result: 'frightened', group };
  }

  /**
   * Heal (F407, DM 1.1 and later): as long as health is missing and mana is left, the champion gains
   * min(missing, min(10, Heal level)) health for 2 mana.
   */
  function heal(action) {
    payAction(action);
    let missing = champion.maxHealth - champion.health;
    if (missing <= 0 || !champion.mana) return { result: 'nothing' };
    const step = Math.min(10, skillLevel(champion, 'Heal'));
    let healed = 0;
    do {
      const amount = Math.min(missing, step);
      champion.health += amount;
      healed += amount;
      missing -= amount;
      champion.mana -= 2;
    } while (champion.mana > 0 && missing > 0);
    champion.mana = Math.max(0, champion.mana);
    championChanged();
    return { result: 'healed', healed };
  }

  // Climb Down (F407): with the rope, the party goes down the open pit in front (if no group is
  // over it); else nothing happens, without fatigue.
  function climb(action) {
    const [x, y] = front();
    const tile = state.tileAt(party.level, x, y);
    if (tile?.type !== 'pit' || !tile.detail.open || state.groupAt(party.level, x, y)) {
      payAction(action, 0);
      return { result: 'nothing' };
    }
    payAction(action);
    command('forward');
    return { result: 'climbed' };
  }

  const ACTS = {
    melee: strike,
    shoot,
    spell: castAction,
    fright: frighten,
    heal,
    climb,
    light(action) {
      payAction(action);
      useCharge();
      light.addMagical(LIGHT_POWER, LIGHT_TICKS);
      return { result: 'light' };
    },
    flip(action) {
      payAction(action);
      return { result: random() < 0.5 ? 'heads' : 'tails' };
    },
    defend(action) {
      payAction(action);
      return { result: 'done' };
    },
  };

  /**
   * An action of the action hand (docs/044, F407), by its index in action-info.js. Throw throws the
   * item of the hand; the actions not done yet ('pending') cost nothing.
   * @returns {{ result: string, action?, ... }} 'unavailable', 'pending', 'dead', 'busy', 'exhausted',
   *   or the result of the action
   */
  function act(index) {
    const action = actionsOf(state.hands[1]).find((a) => a.index === index);
    if (!action) return { result: 'unavailable' };
    if (action.kind === 'pending') return { result: 'pending', action };
    if (action.kind === 'throw') return { ...throwItem(1), action };
    const refused = refusal(action.stamina);
    if (refused) return { result: refused, action };
    return { ...ACTS[action.kind](action), action };
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
    const refused = spend(THROW_COST);
    if (refused) return { result: refused };
    sound('combat', party, true);
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
      // Running into a wall, a closed door or fake wall (ReDMCSB F366): the champions of the front
      // row take an attack of 1 "self" ((1 × 130) / 64 = 2 without armour), and the party cries out.
      if (result.blocked !== 'creature') {
        sound('wall', party, true);
        woundChampion(Math.floor((WALL_ATTACK * 130) / 64), { wall: true });
      }
      return;
    }
    // Stairs, pits, teleporters: applied in chain until the party stays somewhere.
    arrive(from, resolveArrival(dungeon, state, result.party), 'step');
  }

  // Moves the party, then the floor actuators of the tile left and of the tile reached act.
  function arrive(from, arrival, kind) {
    party = arrival.party;
    for (const effect of arrival.effects) {
      if (effect.type === 'fall') sound('scream', effect.party, true);
      if (effect.type === 'teleport' && effect.detail.sound) sound('teleport', effect.party, true);
    }
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
    /** Actions of the action hand, as the panel shows them: [action of action-info.js]. */
    get actions() {
      return actionsOf(state.hands[1]);
    },
    /** Does an action of the action hand, by its index (action-info.js). */
    act,
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
    clickFront() {
      if (champion.dead) return { target: null, fired: 0 };
      const result = logic.clickFront(party);
      // Nothing happens on a wall, a door or a closed fake wall: the hand knocks on it (thud). An
      // imaginary or vanished fake wall lets the hand through: no sound.
      const { target, fired, took, placed, hits, broken } = result;
      const solid = target === 'wall' || target === 'door' || (target === 'fakewall' && blockReason(state, party.level, ...front()) === 'fakewall');
      if (solid && !fired && !took && !placed && !hits && !broken) sound('thud', party, true);
      return result;
    },
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
      sound('swallow', party, true);
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
