// Action engine: actuators triggered by the party (floor plates, wall clicks),
// effects sent to their target after `delay` ticks, chains through logic gates
// and counters. Rules from docs/012-simulation.md § 3, to be checked against
// the original game (see docs/015).
//
// Effects: 'set' | 'clear' | 'toggle' ('hold' becomes set or clear when fired).
//   door        set = open, clear = close
//   pit         set = open (hole), clear = close; the party on it falls
//   teleporter  set = active, clear = inactive; the party on it is carried
//   fakewall    set = vanished (open), clear = back
//   wall        gates and counters of the wall; message (text) on the targeted face shown / hidden
//   floor       texts of the tile shown / hidden (a message shown is printed: 'textShown');
//               creature generators: not simulated yet (no creatures)

import { FACINGS, SIDE_DELTAS } from '../core/dungeon.js';
import { itemIdOf } from '../core/item-ids.js';
import { isAlcove } from '../core/ornaments.js';
import { decodeChampion } from '../core/texts.js';

const FLOOR_PARTY = 3; // P: party only, maybe on a condition of facing
const FLOOR_ANYTHING = 1; // TPCI: party, creatures, items
const FLOOR_NO_ITEMS = 2; // TPC: party, creatures
const FLOOR_ITEM = 4; // I: a given item lying on the tile
const FLOOR_POSSESSION = 8; // party carrying a given item
const WALL_CLICK = 1; // any item / empty hand
const WALL_CLICK_HOLDING = 2; // any item / no empty hand
const WALL_SPECIFIC_ITEM = 3;
const WALL_LOCK = 4; // specific item / removed
const WALL_GATE = 5;
const WALL_COUNTER = 6;
const WALL_ITEM_HOLDER = 13; // "item storage": torch holder
const LOCAL_ROTATION = 1;

// Retry delay (ticks) when a door or a fake wall cannot close on the party.
const RETRY = 1;

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 * @param {ReturnType<import('./state.js').createState>} state
 * @param {ReturnType<import('./clock.js').createClock>} clock
 * @param {object} hooks
 * @param {(type: string, payload: object) => void} hooks.emit 'tileChanged', 'textChanged', 'actuatorFired'
 * @param {() => object} hooks.party current party
 * @param {() => void} hooks.onOpenedUnderParty a pit opened or a teleporter was activated under the party
 */
export function createLogic(dungeon, state, clock, { emit, party, onOpenedUnderParty }) {
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
    if (a.local) {
      if (a.local.action === LOCAL_ROTATION) rotate(a.at.map, a.at.x, a.at.y, index);
      return;
    }
    if (!a.remote) return;
    const { x, y, direction } = a.remote;
    const level = a.at.map;
    clock.schedule(a.delay, () => applyEffect(level, x, y, FACINGS.indexOf(direction), effect, index));
  }

  // Rotation: the first actuator of the face goes to the end of the list, so a
  // lever alternates its two actuators (and the graphic shown, phase F).
  function rotate(level, x, y, index) {
    const list = state.actuatorsAt(level, x, y);
    const face = list.find((ref) => ref.index === index)?.position;
    const i = list.findIndex((ref) => ref.position === face);
    if (i >= 0) list.push(...list.splice(i, 1));
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
        // Floor: messages. Creature generators are not simulated yet.
        return floorEvent(level, x, y, effect);
    }
  }

  function setOpen(level, x, y, tile, effect, source) {
    const detail = tile.detail;
    const open = effect === 'toggle' ? !detail.open : effect === 'set';
    if (open === detail.open) return;
    // A door or a wall does not close on the party: try again a bit later.
    if (!open && (tile.type === 'door' || tile.type === 'fakewall') && partyOn(level, x, y)) {
      clock.schedule(RETRY, () => setOpen(level, x, y, state.tileAt(level, x, y), open ? 'set' : 'clear', source));
      return;
    }
    detail.open = open;
    emit('tileChanged', { level, x, y, type: tile.type, detail, source });
    // The party falls through a pit opening under it, and is carried by a teleporter activated under it.
    if ((tile.type === 'pit' || tile.type === 'teleporter') && open && partyOn(level, x, y)) onOpenedUnderParty();
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

  // Counter: set decrements, clear increments; it fires when it reaches 0.
  function counter(index, effect) {
    const runtime = state.actuator(index);
    if (runtime.disabled) return;
    if (effect === 'clear') {
      runtime.data++;
      return;
    }
    if (runtime.data <= 0) return;
    runtime.data--;
    if (runtime.data === 0) fire(index, !actuatorData(index).revert);
  }

  // --- Floor actuators: pressed or released ---------------------------------------------
  // A floor actuator is pressed by what stands on its tile (party, items, creature,
  // or an item carried by the party); it acts when that changes, not on every arrival.
  function pressedOn(level, x, y, p) {
    const here = p && p.level === level && p.x === x && p.y === y ? p : null;
    const items = state.itemsAt(level, x, y);
    const creature = (dungeon.tileAt(level, x, y)?.detail?.items ?? []).some((ref) => ref.kind === 'creature');
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
          on = Boolean(here) && state.inventory.some((item) => itemIdOf(dungeon, item) === a.data);
          break;
        default:
          continue; // creatures only, generators: no creatures yet
      }
      pressed.set(index, on);
    }
    return pressed;
  }

  // Applies `change` (the party comes or goes, items move) and fires the floor
  // actuators of the tile whose state changed: pressed = triggered, released = not.
  function floorChange(level, x, y, partyBefore, partyAfter, change) {
    const before = pressedOn(level, x, y, partyBefore);
    change?.();
    const after = pressedOn(level, x, y, partyAfter);
    for (const [index, on] of after) {
      if (on !== before.get(index)) fire(index, on !== actuatorData(index).revert);
    }
    clock.flush();
  }

  // --- Items: inventory, floor, alcoves ---------------------------------------------------
  const sameItem = (a, b) => a.kind === b.kind && a.index === b.index;
  const changedItems = (level, x, y) => emit('itemsChanged', { level, x, y });
  const changedInventory = () => emit('inventoryChanged', { inventory: state.inventory });

  /** Picks up an item lying on a floor tile (reach is checked by the simulation). */
  function pickUp(p, level, x, y, ref) {
    const lying = state.itemsAt(level, x, y);
    const i = lying.findIndex((item) => sameItem(item, ref));
    if (i < 0) return false;
    floorChange(level, x, y, p, p, () => {
      const [item] = lying.splice(i, 1);
      state.inventory.push({ kind: item.kind, index: item.index });
    });
    changedItems(level, x, y);
    changedInventory();
    return true;
  }

  /** Drops a carried item on a sub-tile (0..3 = NW, NE, SE, SW) of a floor tile. */
  function drop(p, item, level, x, y, position) {
    const i = state.inventory.findIndex((carried) => sameItem(carried, item));
    if (i < 0) return false;
    floorChange(level, x, y, p, p, () => {
      state.inventory.splice(i, 1);
      state.itemsAt(level, x, y).push({ kind: item.kind, index: item.index, position });
    });
    changedItems(level, x, y);
    changedInventory();
    return true;
  }

  // Moves an item between the inventory and a wall face (alcove, torch holder).
  function intoWall(level, x, y, face, item) {
    state.inventory.splice(state.inventory.indexOf(item), 1);
    state.itemsAt(level, x, y).push({ kind: item.kind, index: item.index, position: face });
    changedItems(level, x, y);
    changedInventory();
  }
  function outOfWall(level, x, y, item) {
    const lying = state.itemsAt(level, x, y);
    lying.splice(lying.indexOf(item), 1);
    state.inventory.push({ kind: item.kind, index: item.index });
    changedItems(level, x, y);
    changedInventory();
  }

  // --- Wall click: the face in front of the party ---------------------------------------
  /**
   * Actuators of the face first (buttons, levers, locks, item holders); then an item
   * still in hand goes into an alcove, or else the items of the face are taken.
   * Locks and "specific item" actuators need the item **in hand**; a lock
   * ("Specific item / Removed") keeps it. An item holder (type 13, torch holder)
   * takes the item it expects from the hand, or gives it back to an empty hand.
   * @param {object} p party
   * @param {object|null} hand item in hand ({ kind, index }), null = empty hand
   * @returns {{ target: string, fired: number, took?: number, placed?: boolean }}
   */
  function clickFront(p, hand = null) {
    const [dx, dy] = SIDE_DELTAS[p.facing];
    const x = p.x + dx;
    const y = p.y + dy;
    const tile = state.tileAt(p.level, x, y);
    if (!tile) return { target: 'nothing', fired: 0 };
    if (tile.type === 'door') return clickDoor(p.level, x, y, tile);
    if (tile.type !== 'wall') return { target: tile.type, fired: 0 };
    const face = (FACINGS.indexOf(p.facing) + 2) % 4; // the face looking at the party
    const lying = state.itemsAt(p.level, x, y);
    const matches = (item, a) => item !== null && itemIdOf(dungeon, item) === a.data;
    let held = hand && state.inventory.includes(hand) ? hand : null;
    let placed = false;
    let took = 0;
    firedCount = 0;
    for (const { index, position } of [...state.actuatorsAt(p.level, x, y)]) {
      if (position !== face) continue;
      const a = actuatorData(index);
      let condition;
      if (a.type === WALL_CLICK) condition = true;
      else if (a.type === WALL_CLICK_HOLDING) condition = held !== null;
      else if (a.type === WALL_SPECIFIC_ITEM || a.type === WALL_LOCK) condition = matches(held, a);
      else if (a.type === WALL_ITEM_HOLDER) {
        const stored = lying.find((item) => item.position === face && matches(item, a));
        condition = stored ? held === null : matches(held, a);
        if (condition && !state.actuator(index).disabled) {
          if (stored) {
            outOfWall(p.level, x, y, stored);
            took++;
          } else {
            intoWall(p.level, x, y, face, held);
            held = null;
            placed = true;
          }
        }
      } else continue; // exchanger, portraits, shooters, gates: not clickable here
      const triggered = condition !== a.revert;
      if (a.type === WALL_LOCK && held && triggered && !state.actuator(index).disabled) {
        state.inventory.splice(state.inventory.indexOf(held), 1); // the lock keeps the key
        held = null;
        changedInventory();
      }
      fire(index, triggered);
    }
    clock.flush();
    const fired = firedCount;
    if (placed || took) return { target: 'wall', fired, placed, took };

    if (held && isAlcove(dungeon, p.level, x, y, face)) {
      intoWall(p.level, x, y, face, held);
      return { target: 'wall', fired, placed: true };
    }
    for (const item of lying.filter((i) => i.position === face)) {
      outOfWall(p.level, x, y, item);
      took++;
    }
    return { target: 'wall', fired, took };
  }

  // Door with a button: a click toggles it.
  function clickDoor(level, x, y, tile) {
    const ref = tile.detail.items?.find((item) => item.kind === 'door');
    if (!ref || !dungeon.data.doors[ref.index].button) return { target: 'door', fired: 0 };
    setOpen(level, x, y, tile, 'toggle', null);
    return { target: 'door', fired: 1 };
  }

  return {
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
    partyTurned(from, to) {
      // Only the plates with a facing condition notice it.
      floorChange(to.level, to.x, to.y, from, to);
    },
    clickFront,
    pickUp,
    drop,
  };
}
