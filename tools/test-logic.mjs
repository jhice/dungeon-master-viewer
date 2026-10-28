// Checks of the action engine against ReDMCSB (docs/026): events of a square merged in
// the timeline (the oscillator of the bad ending, level 0), counters.
// Run: node tools/test-logic.mjs

import { readFileSync } from 'node:fs';
import { Dungeon, SIDE_DELTAS, FACINGS } from '../src/core/dungeon.js';
import { createSimulation } from '../src/sim/simulation.js';

const dungeon = new Dungeon(JSON.parse(readFileSync(new URL('../data/dungeon.json', import.meta.url))));
const sim = createSimulation(dungeon);
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};
const immortal = () => Object.assign(sim.champion, { health: 1e9, maxHealth: 1e9 });
const fired = new Map();
sim.on('actuatorFired', ({ index }) => fired.set(index, (fired.get(index) ?? 0) + 1));
const face = (facing) => {
  while (sim.party.facing !== facing) sim.command('turnRight');
};

// 1. Level 0, cell (9, 1) of the bad ending: each turn away from the north brings the party
// back through the teleporter and presses the plate 650 again, which starts the 1-tick
// oscillator 651 of the wall (10, 1) once more. The merged events keep a single loop.
{
  sim.reset();
  immortal();
  sim.teleport(0, 9, 1);
  for (let i = 0; i < 10; i++) {
    sim.command('turnLeft');
    sim.tick(20);
  }
  fired.clear();
  sim.tick(100);
  check(fired.get(651) === 100, `N0 (10, 1) : l'oscillateur bat une fois par tick (${fired.get(651)} en 100 ticks) après 10 relances`);
}

// 2. Level 11, counter 421 (3): the plate (26, 7) sends clear, the fake wall (27, 6) vanishes at the 3rd step.
{
  sim.reset();
  immortal();
  sim.teleport(11, 26, 8);
  face('N');
  const open = [];
  for (let i = 0; i < 3; i++) {
    sim.command('forward');
    sim.tick(2);
    sim.command('back');
    sim.tick(2);
    open.push(sim.state.tileAt(11, 27, 6).detail.open);
  }
  check(open.join() === 'false,false,true', `N11 (27, 6) : le faux mur disparaît au 3e pas sur la plaque (${open.join(', ')})`);
}

// 3. Level 5, counters 135 (3) and 616 (4): an item in 3 of the 4 alcoves opens the door (13, 20).
{
  sim.reset();
  immortal();
  const open = [];
  for (const index of [136, 137, 138, 139]) {
    const { at } = dungeon.data.actuators[index];
    const ref = sim.state.actuatorsAt(5, at.x, at.y).find((r) => r.index === index);
    const facing = FACINGS[(ref.position + 2) % 4];
    const [dx, dy] = SIDE_DELTAS[facing];
    sim.teleport(5, at.x - dx, at.y - dy);
    face(facing);
    sim.state.hand = { kind: 'weapon', index };
    sim.clickFront();
    sim.tick(3);
    open.push(sim.state.tileAt(5, 13, 20).detail.open);
  }
  check(open.join() === 'false,false,true,true', `N5 (13, 20) : la porte s'ouvre au 3e objet posé (${open.join(', ')})`);
  check(sim.state.actuator(616).data === 0, 'N5 : le compteur 616 atteint 0 au 4e objet');
}

console.log(failures ? `${failures} échec(s)` : 'tout est bon');
process.exit(failures ? 1 : 0);
