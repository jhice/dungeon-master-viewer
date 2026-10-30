// Checks of docs/051: fall damage through pits (with and without the rope), items thrown at a
// closed door (they fall in front of the leaf, the door is attacked, no hit counter).
// Run: node tools/test-falls-doors.mjs

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
const face = (facing) => {
  while (sim.party.facing !== facing) sim.command('turnRight');
};
const heal = () => Object.assign(sim.champion, { health: sim.champion.maxHealth, stamina: sim.champion.maxStamina, readyAt: 0 });
const tiles = function* () {
  for (let level = 0; level < dungeon.levelCount; level++) {
    const { width, height } = dungeon.level(level);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) yield { level, x, y, tile: sim.state.tileAt(level, x, y) };
  }
};
// An open pit with a floor tile beside it: [pit, the tile beside, the facing towards the pit].
function pitApproach(filter = () => true) {
  for (const { level, x, y, tile } of tiles()) {
    if (tile?.type !== 'pit' || !tile.detail.open || tile.detail.imaginary || !filter(level, x, y)) continue;
    for (const facing of FACINGS) {
      const [dx, dy] = SIDE_DELTAS[facing];
      const from = { level, x: x - dx, y: y - dy };
      if (sim.state.tileAt(from.level, from.x, from.y)?.type === 'floor' && !sim.teleport(from.level, from.x, from.y)) return { pit: { level, x, y }, from, facing };
    }
  }
  return null;
}
let screams = 0;
sim.on('sound', ({ id }) => id === 'scream' && screams++);
const falls = [];
sim.on('championHit', (e) => e.fall && falls.push(e.damage));

// 1. A fall through a pit: 17..22 × (130 − defence) / 64, the champion screams.
{
  sim.reset();
  const { from, facing } = pitApproach();
  sim.teleport(from.level, from.x, from.y);
  face(facing);
  const damages = [];
  for (let i = 0; i < 20; i++) {
    heal();
    sim.teleport(from.level, from.x, from.y);
    falls.length = 0;
    screams = 0;
    const before = sim.champion.health;
    sim.command('forward');
    damages.push(before - sim.champion.health);
    if (falls.length !== 1 || screams !== 1) break;
  }
  const max = Math.floor((22 * 130) / 64);
  const min = Math.floor((17 * (130 - ((sim.champion.vitality >> 3) >> 1))) / 64);
  check(damages.length === 20 && damages.every((d) => d >= min && d <= max), `fall from level ${from.level}: damage ${Math.min(...damages)}..${Math.max(...damages)} (expected ${min}..${max}), one scream each`);
  check(sim.party.level === from.level + 1, `the party is on level ${sim.party.level}`);
}

// 2. Climbing down with the rope: no damage nor scream, a little stamina.
{
  sim.reset();
  const { from, facing } = pitApproach();
  sim.teleport(from.level, from.x, from.y);
  face(facing);
  heal();
  sim.state.hands[1] = { kind: 'miscellaneous', index: 1 }; // Rope
  const climb = sim.actions.find((a) => a.kind === 'climb');
  falls.length = 0;
  screams = 0;
  const { health, stamina } = sim.champion;
  const result = sim.act(climb.index).result;
  const climbCost = stamina - sim.champion.stamina - (climb.stamina ?? 0);
  check(result === 'climbed' && sim.party.level === from.level + 1, `rope: climbed down to level ${sim.party.level}`);
  check(sim.champion.health === health && !falls.length && !screams, 'rope: no damage, no scream');
  check(climbCost >= 1, `rope: stamina spent for the descent (${stamina} → ${sim.champion.stamina})`);
}

// 3. Invincible: the fall is told, without damage.
{
  sim.reset();
  sim.invincible = true;
  const { from, facing } = pitApproach();
  sim.teleport(from.level, from.x, from.y);
  face(facing);
  falls.length = 0;
  const before = sim.champion.health;
  sim.command('forward');
  check(falls.length === 1 && falls[0] === 0 && sim.champion.health === before, 'invincible: fall without damage');
  sim.invincible = false;
}

// 4. A closed breakable door: a click with an item no longer hits it; a thrown item falls in front of
// the leaf (the two near sub-tiles of the door's tile).
{
  sim.reset();
  const door = { level: 1, x: 11, y: 0 }; // Wooden, breakable, closed, passage west-east
  check(!sim.teleport(door.level, door.x - 1, door.y), 'party west of the door N1 (11, 0)');
  face('E');
  heal();
  const sword = { kind: 'weapon', index: [...dungeon.data.weapons.keys()].find((i) => dungeon.data.weapons[i].name === 'Sword') };
  sim.state.hand = sword;
  const click = sim.clickFront();
  check(!click.fired && sim.state.tileAt(door.level, door.x, door.y).detail.hits === undefined && sim.hand === sword, 'click on the door with a Sword: no hit counted, the Sword stays in hand');
  let broken = 0;
  const off = sim.on('doorBroken', () => broken++);
  sim.throwHeld('left');
  for (let i = 0; i < 8; i++) sim.tick();
  const lying = sim.state.itemsAt(door.level, door.x, door.y).find((i) => i.kind === 'weapon' && i.index === sword.index);
  // Facing east, the near sub-tiles of the tile in front are SW (3) and NW (0).
  check(lying && [3, 0].includes(lying.position), `the thrown Sword lies on the door's tile, sub-tile ${lying?.position} (near side)`);
  const detail = sim.state.tileAt(door.level, door.x, door.y).detail;
  check(broken ? detail.broken : !detail.open, `the door ${broken ? 'gave way' : 'held'} (defence compared, no counter)`);
  off?.();
}

console.log(failures ? `${failures} failure(s)` : 'all ok');
process.exit(failures ? 1 : 0);
