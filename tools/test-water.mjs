// Checks of the water (docs/050): waterskin drunk at the mouth, fountain filling a waterskin
// and an empty flask, water of the champion, reset.
// Run: node tools/test-water.mjs

import { readFileSync } from 'node:fs';
import { Dungeon } from '../src/core/dungeon.js';
import { createSimulation } from '../src/sim/simulation.js';

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
const WATERSKIN = { kind: 'miscellaneous', index: 125 }; // level 1 (13, 29), full
const charges = () => dungeon.data.miscellaneous[WATERSKIN.index].subtype;
let swallows = 0;
sim.on('sound', ({ id }) => id === 'swallow' && swallows++);

sim.reset();
check(sim.champion.water >= 1500 && sim.champion.water < 1756, `starting water ${sim.champion.water} (1500 + random(256))`);

// 1. The waterskin of level 1 (13, 29): taken from the floor, drunk three times, then empty.
{
  sim.champion.water = 0;
  sim.teleport(1, 13, 29);
  const lying = sim.state.itemsAt(1, 13, 29).find((i) => i.kind === WATERSKIN.kind && i.index === WATERSKIN.index);
  face(['N', 'E', 'S', 'W'].find((f, i) => i === lying.position) ?? 'N');
  check(sim.pickUp(1, 13, 29, lying), 'waterskin picked up');
  check(charges() === 3, 'full waterskin (3 sips)');
  const sips = [1, 2, 3].map(() => sim.drink());
  check(sips.every((r) => r?.effect === 'water') && sips[0].gained === 800 && sips[1].gained === 800 && sips[2].gained === 448, 'sips of 800, the third capped (448)');
  check(sim.champion.water === 2048 && charges() === 0, `water capped at 2048 (${sim.champion.water}), waterskin empty`);
  check(sim.drink()?.empty === true, 'an empty waterskin is not drunk');
  check(swallows === 3, `swallow sound for each sip (${swallows})`);
}

// 2. The fountain of level 1 (18, 25), south face: from (18, 26) facing north, it fills the waterskin.
{
  sim.teleport(1, 18, 26);
  face('N');
  const result = sim.clickFront();
  check(result.filled === 'waterskin' && charges() === 3, `fountain fills the waterskin (${result.filled}, ${charges()} sips)`);
}

// 3. An empty flask at the fountain becomes a Water Flask, drunk for 1600 water.
{
  const flask = { kind: 'potion', index: 0 };
  sim.state.hand = flask;
  const result = sim.clickFront();
  const entry = dungeon.data.potions[0];
  check(result.filled === 'flask' && entry.name === 'Water Flask', `fountain fills the empty flask (${entry.name})`);
  sim.champion.water = 100;
  const drunk = sim.drink();
  check(drunk?.effect === 'water' && sim.champion.water === 1700 && entry.name === 'Empty Flask', `Water Flask: +1600 water (${sim.champion.water}), flask empty again`);
}

// 4. Empty hand at the fountain: nothing is filled (as in DM, one does not drink there).
{
  sim.state.hand = null;
  check(!sim.clickFront().filled, 'empty hand: nothing filled');
}

// 5. Reset: the waterskin is full again where it lay.
{
  sim.state.hand = WATERSKIN;
  sim.drink();
  sim.reset();
  check(charges() === 3, 'reset: waterskin full again');
}

console.log(failures ? `${failures} failure(s)` : 'all ok');
process.exit(failures ? 1 : 0);
