// Action engine: actuators triggered by the party (floor plates, wall clicks),
// effects sent to their target after `delay` ticks, chains through logic gates
// and counters. Rules from docs/012-simulation.md § 3, to be checked against
// the original game (see docs/015).
//
// Effects: 'set' | 'clear' | 'toggle' ('hold' becomes set or clear when fired).
//   door        set = open, clear = close
//   pit         set = open (hole), clear = close
//   teleporter  set = active, clear = inactive
//   fakewall    set = vanished (open), clear = back
//   wall        gates and counters of the wall; message (text) on the targeted face shown / hidden
//   floor       creature generators: not simulated yet (no creatures)

import { FACINGS, SIDE_DELTAS } from '../core/dungeon.js';
import { tileContents } from '../core/contents.js';

const FLOOR_PARTY = 3; // P: party only, maybe on a condition of facing
const FLOOR_ANYTHING = 1; // TPCI: party, creatures, items
const FLOOR_NO_ITEMS = 2; // TPC: party, creatures
const WALL_CLICK = 1; // any item / empty hand
const WALL_CLICK_HOLDING = 2; // any item / no empty hand
const WALL_SPECIFIC_ITEM = 3;
const WALL_LOCK = 4; // specific item / removed
const WALL_GATE = 5;
const WALL_COUNTER = 6;
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
 * @param {(level, x, y) => void} hooks.onPitOpened a pit opened: the party may fall
 */
export function createLogic(dungeon, state, clock, { emit, party, onPitOpened }) {
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
        // Floor targets drive creature generators: not simulated yet.
        return undefined;
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
    if (tile.type === 'pit' && open && partyOn(level, x, y)) onPitOpened(level, x, y);
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
      emit('textChanged', { index: ref.index, visible, level, x, y, face: cell });
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

  // --- Floor actuators: the party enters or leaves a tile -----------------------------------
  function floorActuators(p, added, onlyFacing = false) {
    const contents = tileContents(dungeon, p.level, p.x, p.y);
    const hasItems = Boolean(contents?.items.length);
    const hasCreature = Boolean(contents?.creature);
    for (const { index } of [...state.actuatorsAt(p.level, p.x, p.y)]) {
      const a = actuatorData(index);
      if (a.kind !== 'floor') continue;
      if (a.type === FLOOR_PARTY) {
        if (onlyFacing && !a.data) continue;
        // data 1..4: only when the party faces N, E, S, W.
        if (a.data && p.facing !== FACINGS[a.data - 1]) continue;
      } else if (onlyFacing) {
        continue;
      } else if (a.type === FLOOR_ANYTHING) {
        // Already pressed by an item or a creature: the party changes nothing.
        if (hasItems || hasCreature) continue;
      } else if (a.type === FLOOR_NO_ITEMS) {
        if (hasCreature) continue;
      } else {
        continue; // items only, creatures only, party possessions (phase E), generators
      }
      fire(index, added !== a.revert);
    }
  }

  // --- Wall click: the face in front of the party ---------------------------------------
  /**
   * @param {object} p party
   * @param {object|null} hand item held (phase E), null = empty hand
   * @returns {{ target: string, fired: number }} what was clicked, and how many actuators acted
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
    firedCount = 0;
    for (const { index, position } of [...state.actuatorsAt(p.level, x, y)]) {
      if (position !== face) continue;
      const a = actuatorData(index);
      let condition;
      if (a.type === WALL_CLICK) condition = true;
      else if (a.type === WALL_CLICK_HOLDING) condition = hand !== null;
      else if (a.type === WALL_SPECIFIC_ITEM || a.type === WALL_LOCK) condition = hand?.id === a.data;
      else continue; // storage, exchanger, portraits, shooters, gates: not clickable here
      fire(index, condition !== a.revert);
    }
    clock.flush();
    return { target: 'wall', fired: firedCount };
  }

  // Door with a button: a click toggles it.
  function clickDoor(level, x, y, tile) {
    const ref = tile.detail.items?.find((item) => item.kind === 'door');
    if (!ref || !dungeon.data.doors[ref.index].button) return { target: 'door', fired: 0 };
    setOpen(level, x, y, tile, 'toggle', null);
    return { target: 'door', fired: 1 };
  }

  return {
    /** The party left a tile (before moving), entered one (after its arrival effects), or turned. */
    partyLeft(p) {
      floorActuators(p, false);
      clock.flush();
    },
    partyEntered(p) {
      floorActuators(p, true);
      clock.flush();
    },
    partyTurned(from, to) {
      // Only the plates with a facing condition notice a turn: off with the old facing, on with the new.
      floorActuators(from, false, true);
      floorActuators(to, true, true);
      clock.flush();
    },
    clickFront,
  };
}
