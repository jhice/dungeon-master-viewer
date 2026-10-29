// Checks of the door animation against ReDMCSB (docs/028): one step per tick, the party
// passes up to 1/4 closed, a door closing on the party or a creature goes back up and wounds.
// Run: node tools/test-doors.mjs

import { readFileSync } from 'node:fs';
import { Dungeon, SIDE_DELTAS, FACINGS } from '../src/core/dungeon.js';
import { createSimulation } from '../src/sim/simulation.js';
import { blockReason } from '../src/sim/rules.js';

const dungeon = new Dungeon(JSON.parse(readFileSync(new URL('../data/dungeon.json', import.meta.url))));
const sim = createSimulation(dungeon);
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};
const face = (facing) => {
  while (sim.party.facing !== facing) sim.command('turnRight');
};

// A closed door with a button, opening upwards or sideways, and the floor tile in front of it
// on its passage axis, from which the party clicks it.
function buttonDoor(opening) {
  for (const door of dungeon.data.doors) {
    const { map: level, x, y } = door.at;
    if (!door.button || door.opening !== opening || dungeon.tileAt(level, x, y).detail.open) continue;
    for (const facing of dungeon.tileAt(level, x, y).detail.orientation === 'NS' ? ['S', 'N'] : ['E', 'W']) {
      const [dx, dy] = SIDE_DELTAS[facing];
      const from = [x - dx, y - dy];
      if (dungeon.tileAt(level, ...from)?.type === 'floor' && !sim.state.groupAt(level, ...from)) return { level, x, y, from, facing };
    }
  }
  return null;
}
// A click on the button, then the tick on which the door takes its first step (docs/043).
const press = () => {
  sim.clickFront();
  sim.tick(1);
};
const stepOf = (door) => sim.state.tileAt(door.level, door.x, door.y).detail.step;
// Steps of the door at once, then after each of `ticks` ticks.
function steps(door, ticks, each = () => {}) {
  const list = [stepOf(door)];
  for (let i = 0; i < ticks; i++) {
    sim.tick(1);
    each();
    list.push(stepOf(door));
  }
  return list;
}

const door = buttonDoor('vertical');
const where = `N${door.level} (${door.x}, ${door.y})`;

// 1. A door opens and closes by steps, one per tick; the party passes up to 1/4 closed.
{
  sim.reset();
  sim.teleport(door.level, ...door.from);
  face(door.facing);
  press();
  const opening = steps(door, 4);
  check(opening.join() === '3,2,1,0,0', `${where} : s'ouvre en 4 ticks (${opening.join(', ')})`);
  press();
  const passable = [];
  const closing = steps(door, 4, () => passable.push(blockReason(sim.state, door.level, door.x, door.y) === null));
  check(closing.join() === '1,2,3,4,4', `${where} : se ferme en 4 ticks (${closing.join(', ')})`);
  check(passable.join() === 'false,false,false,false', `${where} : infranchissable au-delà de 1/4 (${passable.join(', ')})`);
  // The button toggles: it closes only a door fully open (ReDMCSB F244), so a click while
  // the door opens does not turn it round.
  press();
  sim.tick(1);
  sim.clickFront();
  const on = steps(door, 3);
  check(on.join() === '2,1,0,0', `${where} : un clic pendant l'ouverture ne la renverse pas (${on.join(', ')})`);
  press();
  sim.tick(1);
  sim.clickFront(); // closing, not fully open: the toggle opens it again
  const back = steps(door, 3);
  check(back.join() === '2,1,0,0', `${where} : un clic pendant la fermeture la fait remonter (${back.join(', ')})`);
}

// 2. The party under a closing door: the door goes back up at once and wounds the champion,
// every 3 ticks, as long as it stays there; once it leaves, the door closes.
{
  sim.reset();
  const champion = sim.champion;
  sim.teleport(door.level, ...door.from);
  face(door.facing);
  sim.clickFront();
  sim.tick(4);
  press(); // closing: 1/4 closed, still passable
  sim.command('forward');
  check(sim.party.x === door.x && sim.party.y === door.y, `${where} : le groupe passe sous la porte fermée à 1/4`);
  const hits = [];
  const off = sim.on('championHit', ({ door: hit, damage }) => hit && hits.push(damage));
  const health = champion.health;
  const under = steps(door, 9);
  off();
  check(under.every((s) => s <= 1), `${where} : la porte ne descend pas plus bas que 1/4 sur le groupe (${under.join(', ')})`);
  check(hits.length === 3 && hits.every((d) => d >= 8 && d <= 10), `${where} : 3 coups de 8 à 10 PV en 9 ticks (${hits.join(', ')})`);
  check(champion.health === health - hits.reduce((a, b) => a + b, 0), `${where} : le champion perd ces PV`);
  sim.command('back');
  sim.tick(6);
  check(stepOf(door) === 4, `${where} : le groupe parti, la porte se ferme`);
}

// 3. A creature under a closing door: the door stops at its height (vertical door) or at 1/4
// (horizontal door), goes back up one step and wounds every member (4 or 5); a small
// creature walks under a door closed up to its height. The group is kept under the door.
function underDoor(d, type, ticks) {
  sim.reset();
  sim.teleport(d.level, ...d.from);
  face(d.facing);
  sim.clickFront();
  sim.tick(4);
  const group = sim.state.createGroup({ type, level: d.level, x: d.x, y: d.y, facing: 'N', members: [{ hp: 500, position: null }] });
  press();
  const list = steps(d, ticks, () => (group.nextMove = Infinity));
  return { list, hp: group.members[0].hp };
}
const WORM = 15; // height 3
const MUMMY = 10; // height 1
{
  const worm = underDoor(door, WORM, 9);
  check(worm.list.slice(3).every((s) => s === 2 || s === 3), `${where} : sur un ver, la porte va et vient entre 2/4 et 3/4 (${worm.list.join(', ')})`);
  check(worm.hp < 500 && (500 - worm.hp) % 1 === 0, `${where} : le ver perd des PV (${500 - worm.hp})`);
  const mummy = underDoor(door, MUMMY, 9);
  check(mummy.list.every((s) => s <= 1), `${where} : sur une momie, la porte reste entre 0 et 1/4 (${mummy.list.join(', ')})`);
  const side = buttonDoor('horizontal');
  if (side) {
    const wormSide = underDoor(side, WORM, 9);
    check(wormSide.list.every((s) => s <= 1), `N${side.level} (${side.x}, ${side.y}), porte horizontale : sur un ver, entre 0 et 1/4 (${wormSide.list.join(', ')})`);
  } else check(false, 'aucune porte horizontale à bouton');
}

// 4. Creature passage: a worm walks under a door 3/4 closed, a mummy does not.
{
  const { creaturePassage } = await import('../src/sim/rules.js');
  const { creatureInfo } = await import('../src/core/creature-info.js');
  sim.reset();
  const detail = sim.state.tileAt(door.level, door.x, door.y).detail;
  detail.step = 3;
  check(creaturePassage(sim.state, creatureInfo(WORM), door.level, door.x, door.y), 'un ver passe sous une porte fermée aux 3/4');
  check(!creaturePassage(sim.state, creatureInfo(MUMMY), door.level, door.x, door.y), 'une momie ne passe pas sous une porte fermée aux 3/4');
}

// 5. The two near sub-tiles of a doorway are within reach, the door closed or not: an item
// put there lies in front of the leaf (ReDMCSB F373, F374).
{
  sim.reset();
  sim.teleport(door.level, ...door.from);
  face(door.facing);
  const f = FACINGS.indexOf(door.facing);
  const near = [(f + 2) % 4, (f + 3) % 4];
  const far = [f, (f + 1) % 4];
  check(near.every((p) => sim.reachable(door.level, door.x, door.y, p)), `${where} : porte fermée, les sous-cases proches de l'embrasure sont à portée`);
  check(!far.some((p) => sim.reachable(door.level, door.x, door.y, p)), `${where} : les sous-cases de l'autre côté du vantail ne le sont pas`);
  sim.state.hand = { kind: 'weapon', index: 0 };
  check(sim.drop(door.level, door.x, door.y, near[0]) && sim.state.itemsAt(door.level, door.x, door.y).length === 1, `${where} : un objet se pose devant la porte fermée`);
  check(sim.pickUp(door.level, door.x, door.y, sim.state.itemsAt(door.level, door.x, door.y)[0]) && sim.state.hand?.index === 0, `${where} : et se reprend`);
}

console.log(failures ? `${failures} échec(s)` : 'tout est bon');
process.exit(failures ? 1 : 0);
