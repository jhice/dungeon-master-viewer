// Action engine: actuators triggered by the party (floor plates, wall clicks),
// effects sent to their target after `delay` ticks, chains through logic gates
// and counters. Rules from docs/012-simulation.md § 3, to be checked against
// the original game (see docs/015).
//
// Effects: 'set' | 'clear' | 'toggle' ('hold' becomes set or clear when fired).
//   door        set = open, clear = close, step by step (one per tick, docs/028); toggle =
//               close if open, else open; an event turns round a door that is moving
//   pit         set = open (hole), clear = close; the party on it falls
//   teleporter  set = active, clear = inactive; the party on it is carried
//   fakewall    set = vanished (open), clear = back
//   wall        gates and counters of the wall; message (text) on the targeted face shown / hidden
//   floor       texts of the tile shown / hidden (a message shown is printed: 'textShown');
//               creature generators of the tile create their group, whatever the effect,
//               through the hook `generate` (src/sim/creatures.js)

import { FACINGS, SIDE_DELTAS } from '../core/dungeon.js';
import { itemIdOf } from '../core/item-ids.js';
import { isAlcove } from '../core/ornaments.js';
import { resolveItemArrival, creatureDoorHeight } from './rules.js';
import { decodeChampion } from '../core/texts.js';
import { creatureInfo } from '../core/creature-info.js';
import { DOOR_CLOSED } from '../core/tile-states.js';

const FLOOR_PARTY = 3; // P: party only, maybe on a condition of facing
const FLOOR_ANYTHING = 1; // TPCI: party, creatures, items
const FLOOR_NO_ITEMS = 2; // TPC: party, creatures
const FLOOR_ITEM = 4; // I: a given item lying on the tile
const FLOOR_GENERATOR = 6; // creature generator, triggered by another actuator (remote event)
const FLOOR_POSSESSION = 8; // party carrying a given item
const WALL_CLICK = 1; // any item / empty hand
const WALL_CLICK_HOLDING = 2; // any item / no empty hand
const WALL_SPECIFIC_ITEM = 3;
const WALL_LOCK = 4; // specific item / removed
const WALL_GATE = 5;
const WALL_COUNTER = 6;
const WALL_ITEM_HOLDER = 13; // "item storage": torch holder
const LOCAL_ROTATION = 1;
// Hits with a weapon in hand to break a breakable door ("force"), by door type. In DM,
// each hit compares the attack (champion, weapon, chance) to the defence of the door
// type, without adding up; the party being abstract, a fixed count stands for it.
const DOOR_HITS = { Wooden: 3, Porticullis: 6 };

// Rest of a creature generator, in ticks: values above 127 count by 64 ticks
// ((delay - 126) × 64), Encyclopaedia, "Dungeon Files" (docs/021).
const generatorDelay = (delay) => (delay > 127 ? (delay - 126) * 64 : delay);

// Retry delay (ticks) when a fake wall cannot come back on the party or a creature.
const RETRY = 1;
// Delay (ticks) before a door that closed on the party or a creature tries again (ReDMCSB F241).
const DOOR_RETRY = 2;

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 * @param {ReturnType<import('./state.js').createState>} state
 * @param {ReturnType<import('./clock.js').createClock>} clock
 * @param {object} hooks
 * @param {(type: string, payload: object) => void} hooks.emit 'tileChanged', 'textChanged', 'actuatorFired'
 * @param {() => object} hooks.party current party
 * @param {() => void} hooks.onOpenedUnderParty a pit opened or a teleporter was activated under the party
 * @param {(level, x, y) => void} hooks.onOpenedUnderGroup the same under a creature group
 * @param {(index: number) => void} hooks.generate a creature generator (actuator index) was triggered
 * @param {(hit: { level, x, y, vertical: boolean, group?: object }) => void} hooks.crush a closing door
 *   hits the party (no `group`) or a creature group
 */
export function createLogic(dungeon, state, clock, { emit, party, onOpenedUnderParty, onOpenedUnderGroup, generate, crush }) {
  const actuatorData = (index) => dungeon.data.actuators[index];
  const partyOn = (level, x, y) => {
    const p = party();
    return p.level === level && p.x === x && p.y === y;
  };

  // --- Firing an actuator ---------------------------------------------------------
  // `triggered`: the condition of the actuator is met (after `revert`). A hold
  // actuator sends set when triggered and clear otherwise; the others act only when triggered.
  let firedCount = 0; // actuators that acted, counted by clickFront()
  function fire(index, triggered) {
    const a = actuatorData(index);
    const runtime = state.actuator(index);
    if (runtime.disabled) return;
    let effect = a.action;
    if (effect === 'hold') effect = triggered ? 'set' : 'clear';
    else if (!triggered) return;
    if (a.onceOnly) runtime.disabled = true;
    firedCount++;
    emit('actuatorFired', { index, actuator: a, effect });
    if (a.kind === 'floor' && a.type === FLOOR_GENERATOR) {
      // The generator then rests for `delay` before it can act again.
      generate?.(index);
      if (!a.onceOnly && a.delay) {
        runtime.disabled = true;
        clock.schedule(generatorDelay(a.delay), () => (runtime.disabled = false));
      }
      return;
    }
    if (a.local) {
      if (a.local.action === LOCAL_ROTATION) rotate(a.at.map, a.at.x, a.at.y, index);
      return;
    }
    if (!a.remote) return;
    const { x, y, direction } = a.remote;
    const level = a.at.map;
    // One event per target square and tick (per face for a wall): see clock.schedule().
    const cell = FACINGS.indexOf(direction);
    const key = state.tileAt(level, x, y)?.type === 'wall' ? `${level}:${x},${y}:${cell}` : `${level}:${x},${y}`;
    clock.schedule(a.delay, () => applyEffect(level, x, y, cell, effect, index), key);
  }

  // Rotation: the first actuator of the face goes to the end of the list. The face
  // shows the ornament of its last actuator (ornaments.js): a lever alternates, a
  // button gives way to the alcove it reveals.
  function rotate(level, x, y, index) {
    const list = state.actuatorsAt(level, x, y);
    const face = list.find((ref) => ref.index === index)?.position;
    const i = list.findIndex((ref) => ref.position === face);
    if (i < 0) return;
    list.push(...list.splice(i, 1));
    emit('ornamentChanged', { level, x, y, face });
  }

  // --- Effects on the target tile ---------------------------------------------------
  function applyEffect(level, x, y, cell, effect, source) {
    const tile = state.tileAt(level, x, y);
    if (!tile) return;
    switch (tile.type) {
      case 'door':
      case 'pit':
      case 'teleporter':
      case 'fakewall':
        return setOpen(level, x, y, tile, effect, source);
      case 'wall':
        return wallEvent(level, x, y, cell, effect);
      default:
        // Floor: messages and creature generators.
        return floorEvent(level, x, y, effect);
    }
  }

  function setOpen(level, x, y, tile, effect, source) {
    if (tile.type === 'door') return doorEvent(level, x, y, tile.detail, effect, source);
    const detail = tile.detail;
    const open = effect === 'toggle' ? !detail.open : effect === 'set';
    if (open === detail.open) return;
    // A fake wall does not come back on the party or a creature: try again a bit later.
    if (!open && tile.type === 'fakewall' && (partyOn(level, x, y) || state.groupAt(level, x, y))) {
      clock.schedule(RETRY, () => setOpen(level, x, y, state.tileAt(level, x, y), open ? 'set' : 'clear', source));
      return;
    }
    detail.open = open;
    emit('tileChanged', { level, x, y, type: tile.type, detail, source });
    // The party falls through a pit opening under it, and is carried by a teleporter activated under it;
    // so are the items lying there, and the creatures.
    if ((tile.type === 'pit' || tile.type === 'teleporter') && open) {
      settleItems(level, x, y);
      if (state.groupAt(level, x, y)) onOpenedUnderGroup?.(level, x, y);
      if (partyOn(level, x, y)) onOpenedUnderParty();
    }
  }

  // --- Doors: one step per tick (ReDMCSB, TIMELINE.C, F244 and F241) ---------------
  // An event starts the animation of the door, or turns round the one running
  // (`detail.moving`, which also tells the views that the door is moving).
  function doorEvent(level, x, y, detail, effect, source) {
    if (detail.broken) return; // a broken door stays open
    if (effect === 'toggle') effect = detail.step === 0 ? 'clear' : 'set';
    if (detail.moving) {
      Object.assign(detail.moving, { effect, source });
      return;
    }
    if (detail.step === (effect === 'set' ? 0 : DOOR_CLOSED)) return;
    detail.moving = { effect, source };
    animateDoor(level, x, y, detail, detail.moving);
  }

  // One step of a moving door. Closing on the party, it goes back up at once and wounds
  // it; on a material creature that it reaches (its height, or 1/4 for a horizontal
  // door), it goes back up one step and wounds it. Then it tries again 2 ticks later:
  // it goes up and down as long as someone stands under it.
  function animateDoor(level, x, y, detail, moving) {
    if (detail.moving !== moving) return; // reset, or broken
    const again = (delay) => clock.schedule(delay, () => animateDoor(level, x, y, detail, moving));
    if (moving.effect === 'clear') {
      if (partyOn(level, x, y) && detail.step !== 0) {
        setDoorStep(level, x, y, detail, 0, moving.source);
        crush?.({ level, x, y, vertical: detail.vertical });
        return again(DOOR_RETRY);
      }
      const group = state.groupAt(level, x, y);
      const info = group && creatureInfo(group.type);
      if (info && !info.nonMaterial && detail.step >= creatureDoorHeight(detail, info)) {
        crush?.({ level, x, y, vertical: detail.vertical, group });
        setDoorStep(level, x, y, detail, Math.max(0, detail.step - 1), moving.source);
        return again(DOOR_RETRY);
      }
    }
    const end = moving.effect === 'set' ? 0 : DOOR_CLOSED;
    const step = detail.step === end ? end : detail.step + (end ? 1 : -1);
    if (step === end) detail.moving = null; // before the last tileChanged: the door has stopped
    setDoorStep(level, x, y, detail, step, moving.source);
    if (detail.moving) again(1);
  }

  function setDoorStep(level, x, y, detail, step, source) {
    if (step === detail.step) return;
    detail.step = step;
    detail.open = step === 0;
    emit('tileChanged', { level, x, y, type: 'door', detail, source });
  }

  // Event on a wall: gates and counters of the wall (whatever their face: the event's
  // cell is the gate input), and texts of the targeted face.
  function wallEvent(level, x, y, cell, effect) {
    for (const { index } of [...state.actuatorsAt(level, x, y)]) {
      const a = actuatorData(index);
      if (a.type === WALL_GATE) gate(index, cell, effect);
      else if (a.type === WALL_COUNTER) counter(index, effect);
    }
    const detail = dungeon.tileAt(level, x, y).detail;
    for (const ref of detail?.items ?? []) {
      if (ref.kind !== 'text' || ref.position !== cell) continue;
      const visible = effect === 'toggle' ? !state.textVisible(ref.index) : effect === 'set';
      if (visible === state.textVisible(ref.index)) continue;
      state.setTextVisible(ref.index, visible);
      emit('textChanged', { index: ref.index, visible, level, x, y, face: cell, onWall: true });
    }
  }

  // Texts lying on a floor tile (not the champion sheets of the Hall).
  const floorTexts = (level, x, y) =>
    (dungeon.tileAt(level, x, y).detail?.items ?? []).filter(
      (ref) => ref.kind === 'text' && !decodeChampion(dungeon.data.texts[ref.index].text),
    );

  // Event on a floor: its texts appear or disappear; a text that appears is printed.
  function floorEvent(level, x, y, effect) {
    for (const ref of floorTexts(level, x, y)) {
      const visible = effect === 'toggle' ? !state.textVisible(ref.index) : effect === 'set';
      if (visible === state.textVisible(ref.index)) continue;
      state.setTextVisible(ref.index, visible);
      emit('textChanged', { index: ref.index, visible, level, x, y, onWall: false });
      if (visible) emit('textShown', { index: ref.index, level, x, y });
    }
    // A generator resting (or used, once only) ignores the event: it is lost.
    for (const { index } of [...state.actuatorsAt(level, x, y)]) {
      const a = actuatorData(index);
      if (a.kind === 'floor' && a.type === FLOOR_GENERATOR) fire(index, true);
    }
  }

  // AND/OR gate: the event sets, clears or toggles the bit of its cell; the gate is
  // triggered when its 4 bits equal the reference.
  function gate(index, cell, effect) {
    const runtime = state.actuator(index);
    if (runtime.disabled) return;
    const bits = runtime.gate.current;
    bits[cell] = effect === 'toggle' ? !bits[cell] : effect === 'set';
    const equal = bits.every((bit, i) => bit === runtime.gate.reference[i]);
    fire(index, equal !== actuatorData(index).revert);
  }

  // Counter (ReDMCSB, TIMELINE.C, see docs/026): set increments (up to 511), clear and
  // toggle decrement; it fires when it reaches 0, and stays there. A hold counter sends
  // set while at 0 and clear otherwise, on every event.
  function counter(index, effect) {
    const runtime = state.actuator(index);
    if (runtime.disabled || runtime.data <= 0) return;
    if (effect === 'set') runtime.data = Math.min(511, runtime.data + 1);
    else runtime.data--;
    const a = actuatorData(index);
    if (a.action === 'hold') fire(index, (runtime.data === 0) !== a.revert);
    else if (runtime.data === 0) fire(index, true);
  }

  // --- Floor actuators: pressed or released ---------------------------------------------
  // A floor actuator is pressed by what stands on its tile (party, items, creature,
  // or an item carried by the party); it acts when that changes, not on every arrival.
  // Levitating creatures do not press plates (docs/021).
  function pressedOn(level, x, y, p) {
    const here = p && p.level === level && p.x === x && p.y === y ? p : null;
    const items = state.itemsAt(level, x, y);
    const group = state.groupAt(level, x, y);
    const creature = Boolean(group) && !creatureInfo(group.type).levitation;
    const pressed = new Map();
    for (const { index } of state.actuatorsAt(level, x, y)) {
      const a = actuatorData(index);
      if (a.kind !== 'floor') continue;
      let on;
      switch (a.type) {
        case FLOOR_PARTY:
          // data 1..4: only when the party faces N, E, S, W.
          on = Boolean(here) && (!a.data || here.facing === FACINGS[a.data - 1]);
          break;
        case FLOOR_ANYTHING:
          on = Boolean(here) || items.length > 0 || creature;
          break;
        case FLOOR_NO_ITEMS:
          on = Boolean(here) || creature;
          break;
        case FLOOR_ITEM:
          on = items.some((item) => itemIdOf(dungeon, item) === a.data);
          break;
        case FLOOR_POSSESSION:
          on = Boolean(here) && [...state.inventory, state.hand, ...state.hands].some((item) => item && itemIdOf(dungeon, item) === a.data);
          break;
        default:
          continue; // creatures only: none in this dungeon
      }
      pressed.set(index, on);
    }
    return pressed;
  }

  // Applies `change` (the party comes or goes, items move) and fires the floor
  // actuators of the tile whose state changed: pressed = triggered, released = not.
  function floorChange(level, x, y, partyBefore, partyAfter, change) {
    floorChanges([{ level, x, y }], partyBefore, partyAfter, change);
  }
  // The same for several tiles changed at once (a creature leaving one and reaching another).
  function floorChanges(tiles, partyBefore, partyAfter, change) {
    const before = tiles.map(({ level, x, y }) => pressedOn(level, x, y, partyBefore));
    change?.();
    tiles.forEach(({ level, x, y }, i) => {
      for (const [index, on] of pressedOn(level, x, y, partyAfter)) {
        if (on !== before[i].get(index)) fire(index, on !== actuatorData(index).revert);
      }
    });
    clock.flush();
  }

  // --- Items: hand, inventory, floor, alcoves ----------------------------------------------
  // The hand (state.hand) holds one item, apart from the inventory, as the mouse
  // pointer of DM: items are picked up into the hand, put down from it, and stowed
  // into the inventory with stow().
  const sameItem = (a, b) => a.kind === b.kind && a.index === b.index;
  const changedItems = (level, x, y) => emit('itemsChanged', { level, x, y });
  const changedInventory = () => emit('inventoryChanged', { inventory: state.inventory, hand: state.hand });

  /** Picks up an item lying on a floor tile into the empty hand (reach is checked by the simulation). */
  function pickUp(p, level, x, y, ref) {
    const lying = state.itemsAt(level, x, y);
    const i = lying.findIndex((item) => sameItem(item, ref));
    if (i < 0 || state.hand) return false;
    floorChange(level, x, y, p, p, () => {
      const [item] = lying.splice(i, 1);
      state.hand = { kind: item.kind, index: item.index };
    });
    changedItems(level, x, y);
    changedInventory();
    return true;
  }

  /** Puts the item in hand on a sub-tile (0..3 = NW, NE, SE, SW) of a floor tile; it may fall or be carried away. */
  function drop(p, level, x, y, position) {
    const item = state.hand;
    if (!item) return false;
    floorChange(level, x, y, p, p, () => {
      state.hand = null;
      state.itemsAt(level, x, y).push({ kind: item.kind, index: item.index, position });
    });
    changedItems(level, x, y);
    changedInventory();
    settleItems(level, x, y);
    return true;
  }

  /**
   * Stows the item in hand into the inventory. A chest is stowed with its contents,
   * which become items of the inventory (chests cannot be opened yet).
   */
  function stow(p) {
    const item = state.hand;
    if (!item) return false;
    floorChange(p.level, p.x, p.y, p, p, () => {
      state.hand = null;
      state.inventory.push(item);
      if (item.kind === 'container' && !state.emptiedChests.has(item.index)) {
        state.emptiedChests.add(item.index);
        for (const content of dungeon.data.containers[item.index].items ?? []) state.inventory.push({ kind: content.kind, index: content.index });
      }
    });
    changedInventory();
    return true;
  }

  /** Takes an item of the inventory in hand; the item held before goes back into the inventory. */
  function takeFromInventory(p, i) {
    const item = state.inventory[i];
    if (!item) return false;
    floorChange(p.level, p.x, p.y, p, p, () => {
      state.inventory.splice(i, 1);
      if (state.hand) state.inventory.push(state.hand);
      state.hand = item;
    });
    changedInventory();
    return true;
  }

  // Items of a floor tile on an open pit or an active teleporter (for items) go where
  // it leads, keeping their sub-tile; the floor actuators of both tiles notice it.
  function settleItems(level, x, y) {
    const lying = state.itemsAt(level, x, y);
    if (!lying.length) return;
    const to = resolveItemArrival(dungeon, state, { level, x, y });
    if (!to) return;
    const moving = [...lying];
    floorChange(level, x, y, party(), party(), () => lying.splice(0));
    floorChange(to.level, to.x, to.y, party(), party(), () => state.itemsAt(to.level, to.x, to.y).push(...moving));
    changedItems(level, x, y);
    changedItems(to.level, to.x, to.y);
    emit('itemsMoved', { from: { level, x, y }, to, items: moving });
  }

  // Moves the item in hand to a wall face (alcove, torch holder), or an item of a face into the hand.
  function intoWall(level, x, y, face) {
    state.itemsAt(level, x, y).push({ kind: state.hand.kind, index: state.hand.index, position: face });
    state.hand = null;
    changedItems(level, x, y);
    changedInventory();
  }
  function outOfWall(level, x, y, item) {
    const lying = state.itemsAt(level, x, y);
    lying.splice(lying.indexOf(item), 1);
    state.hand = { kind: item.kind, index: item.index };
    changedItems(level, x, y);
    changedInventory();
  }

  // --- Wall click: the face in front of the party ---------------------------------------
  /**
   * Actuators of the face first (buttons, levers, locks, item holders); then, if the
   * face shows an alcove, the item in hand goes into it, or else its top item comes
   * into the empty hand. Locks and "specific item" actuators need the item in hand;
   * a lock ("Specific item / Removed") keeps it. An item holder (type 13, torch holder)
   * takes the item it expects from the hand, or gives it back to an empty hand.
   * @param {object} p party
   * @returns {{ target: string, fired: number, took?: number, placed?: boolean, hits?: number, broken?: boolean }}
   */
  function clickFront(p) {
    const [dx, dy] = SIDE_DELTAS[p.facing];
    const x = p.x + dx;
    const y = p.y + dy;
    const tile = state.tileAt(p.level, x, y);
    if (!tile) return { target: 'nothing', fired: 0 };
    if (tile.type === 'door') return clickDoor(p.level, x, y, tile);
    if (tile.type !== 'wall') return { target: tile.type, fired: 0 };
    const face = (FACINGS.indexOf(p.facing) + 2) % 4; // the face looking at the party
    // As shown before this click: a button revealing an alcove does not hand over its items at once.
    const alcove = isAlcove(dungeon, p.level, x, y, face, state.actuatorsAt);
    const lying = state.itemsAt(p.level, x, y);
    const matches = (item, a) => Boolean(item) && itemIdOf(dungeon, item) === a.data;
    let placed = false;
    let took = 0;
    firedCount = 0;
    for (const { index, position } of [...state.actuatorsAt(p.level, x, y)]) {
      if (position !== face) continue;
      const a = actuatorData(index);
      let condition;
      if (a.type === WALL_CLICK) condition = true;
      else if (a.type === WALL_CLICK_HOLDING) condition = state.hand !== null;
      else if (a.type === WALL_SPECIFIC_ITEM || a.type === WALL_LOCK) condition = matches(state.hand, a);
      else if (a.type === WALL_ITEM_HOLDER) {
        const stored = lying.find((item) => item.position === face && matches(item, a));
        condition = stored ? state.hand === null : matches(state.hand, a);
        if (condition && !state.actuator(index).disabled) {
          if (stored) {
            outOfWall(p.level, x, y, stored);
            took++;
          } else {
            intoWall(p.level, x, y, face);
            placed = true;
          }
        }
      } else continue; // exchanger, portraits, shooters, gates: not clickable here
      const triggered = condition !== a.revert;
      if (a.type === WALL_LOCK && state.hand && triggered && !state.actuator(index).disabled) {
        state.hand = null; // the lock keeps the key
        changedInventory();
      }
      fire(index, triggered);
    }
    clock.flush();
    const fired = firedCount;
    if (placed || took) return { target: 'wall', fired, placed, took };

    if (!alcove) return { target: 'wall', fired, took: 0 }; // items behind a mirror, a button…: out of reach
    if (state.hand) {
      intoWall(p.level, x, y, face);
      return { target: 'wall', fired, placed: true };
    }
    const top = lying.filter((i) => i.position === face).at(-1);
    if (top) outOfWall(p.level, x, y, top);
    return { target: 'wall', fired, took: top ? 1 : 0 };
  }

  // Door: a click on its button toggles it; a closed breakable door ("force") is hit
  // with the weapon in hand, and breaks after DOOR_HITS hits (see the constant).
  function clickDoor(level, x, y, tile) {
    const ref = tile.detail.items?.find((item) => item.kind === 'door');
    const door = ref && dungeon.data.doors[ref.index];
    if (!door) return { target: 'door', fired: 0 };
    if (door.force && !tile.detail.open && state.hand?.kind === 'weapon') {
      const needed = DOOR_HITS[dungeon.level(level).doorTypes[door.type]] ?? Infinity;
      tile.detail.hits = (tile.detail.hits ?? 0) + 1;
      if (tile.detail.hits < needed) return { target: 'door', fired: 0, hits: tile.detail.hits, needed };
      breakDoor(level, x, y, tile);
      return { target: 'door', fired: 0, hits: tile.detail.hits, needed, broken: true };
    }
    if (!door.button) return { target: 'door', fired: 0 };
    setOpen(level, x, y, tile, 'toggle', null);
    return { target: 'door', fired: 1 };
  }

  // A broken door: open for good, mechanisms no longer close it.
  function breakDoor(level, x, y, tile) {
    Object.assign(tile.detail, { broken: true, open: true, step: 0, moving: null });
    emit('tileChanged', { level, x, y, type: 'door', detail: tile.detail, source: null });
  }

  return {
    /** The door of a tile ({ type, ornate, button, fireball, force… } of dungeon.json), or null. */
    doorAt(level, x, y) {
      const ref = state.tileAt(level, x, y)?.detail.items?.find((item) => item.kind === 'door');
      return ref ? dungeon.data.doors[ref.index] : null;
    },
    /** Toggles a door as its button does (spell Open Door, docs/033). */
    toggleDoor(level, x, y) {
      const tile = state.tileAt(level, x, y);
      if (tile?.type === 'door') setOpen(level, x, y, tile, 'toggle', null);
    },
    /** Breaks a door (fireball, docs/033). */
    breakDoor(level, x, y) {
      const tile = state.tileAt(level, x, y);
      if (tile?.type === 'door' && !tile.detail.broken) breakDoor(level, x, y, tile);
    },
    /** The party left a tile (after moving), entered one (after its arrival effects), or turned. */
    partyLeft(p) {
      floorChange(p.level, p.x, p.y, p, null);
    },
    partyEntered(p) {
      // A visible text on the floor is printed when the party walks on it.
      for (const ref of floorTexts(p.level, p.x, p.y)) {
        if (state.textVisible(ref.index)) emit('textShown', { index: ref.index, level: p.level, x: p.x, y: p.y });
      }
      floorChange(p.level, p.x, p.y, null, p);
    },
    /** Moves a creature group (state.moveGroup()); the plates of both tiles notice it. */
    moveGroup(group, to) {
      const p = party();
      floorChanges([{ level: group.level, x: group.x, y: group.y }, to], p, p, () => state.moveGroup(group, to));
    },
    /** A group vanishes from its tile (`remove` takes it out of the state): its plates are released. */
    groupVanished(group, remove) {
      const p = party();
      floorChange(group.level, group.x, group.y, p, p, remove);
    },
    /** Items fall on a floor tile (possessions of a dead creature): its plates notice them, then falls and teleporters. */
    itemsDropped(level, x, y, items) {
      const p = party();
      floorChange(level, x, y, p, p, () => state.itemsAt(level, x, y).push(...items));
      changedItems(level, x, y);
      settleItems(level, x, y);
    },
    /** A new group appears on a tile (`create` adds it to the state): the plates of the tile notice it. */
    groupAppeared(level, x, y, create) {
      const p = party();
      floorChange(level, x, y, p, p, create);
    },
    partyTurned(from, to) {
      // Only the plates with a facing condition notice it.
      floorChange(to.level, to.x, to.y, from, to);
    },
    clickFront,
    pickUp,
    drop,
    stow,
    takeFromInventory,
  };
}
