// Checks of the test tools of the maps (docs/049): invincibility, picking up every item of a
// tile, firing every actuator of a tile.
// Run: node tools/test-map-tools.mjs

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
const tiles = function* () {
  for (let level = 0; level < dungeon.levelCount; level++) {
    const { width, height } = dungeon.level(level);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) yield { level, x, y };
  }
};

// 1. Invincibility: a wall bumped costs no health, and the hit is still told.
{
  sim.reset();
  sim.invincible = true;
  const before = sim.champion.health;
  let hits = 0;
  const off = sim.on('championHit', ({ wall, damage }) => wall && damage === 0 && hits++);
  for (let i = 0; i < 4 && !hits; i++) {
    sim.command('forward');
    sim.command('turnRight');
  }
  check(hits > 0 && sim.champion.health === before, `invincible: wall bumped without losing health (${hits} hit(s))`);
  sim.invincible = false;
  off?.();
}

// 2. Picking up: every item of the first tile holding several goes into the inventory.
{
  sim.reset();
  const tile = [...tiles()].find(({ level, x, y }) => sim.state.itemsAt(level, x, y).length >= 2);
  const count = sim.state.itemsAt(tile.level, tile.x, tile.y).length;
  const before = sim.inventory.length;
  const taken = sim.collectAll(tile.level, tile.x, tile.y);
  check(taken === count && sim.state.itemsAt(tile.level, tile.x, tile.y).length === 0, `collectAll: ${taken} item(s) taken from level ${tile.level} (${tile.x}, ${tile.y})`);
  check(sim.inventory.length >= before + count, `collectAll: inventory ${before} → ${sim.inventory.length}`);
  check(sim.collectAll(tile.level, tile.x, tile.y) === 0, 'collectAll: nothing left the second time');
}

// 3. Actuators: a tile whose actuators open or toggle a door soon; firing them changes a tile.
{
  sim.reset();
  let changed = 0;
  const off = sim.on('tileChanged', () => changed++);
  const tile = [...tiles()].find(({ level, x, y }) => {
    const refs = sim.state.actuatorsAt(level, x, y);
    return refs.length && refs.every(({ index }) => {
      const a = dungeon.data.actuators[index];
      return a.remote && (a.action === 'set' || a.action === 'toggle') && a.delay < 4 && dungeon.tileAt(level, a.remote.x, a.remote.y)?.type === 'door';
    });
  });
  const fired = sim.fireAll(tile.level, tile.x, tile.y);
  for (let i = 0; i < 8; i++) sim.tick(); // the door goes up, one step per tick
  check(fired > 0 && changed > 0, `fireAll: ${fired} actuator(s) of level ${tile.level} (${tile.x}, ${tile.y}), ${changed} tile change(s)`);
  off?.();
}

console.log(failures ? `${failures} failure(s)` : 'all ok');
process.exit(failures ? 1 : 0);
