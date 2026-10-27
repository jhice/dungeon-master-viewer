// Checks of phases C1 and C2 (docs/021, 022): creatures move without entering walls, one
// group per tile, the plate N3 (7, 5), a generator, perception and pursuit.
// Run: node tools/test-creatures.mjs

import { readFileSync } from 'node:fs';
import { Dungeon, SIDE_DELTAS } from '../src/core/dungeon.js';
import { createSimulation } from '../src/sim/simulation.js';
import { creatureInfo } from '../src/core/creature-info.js';
import { creaturePassage, blockReason } from '../src/sim/rules.js';
import { lineOfSight, perceiveParty } from '../src/sim/perception.js';

const dungeon = new Dungeon(JSON.parse(readFileSync(new URL('../data/dungeon.json', import.meta.url))));
const sim = createSimulation(dungeon);
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};

// Invariants: each group on a tile it may stand on, the tile index matches, one group per tile.
function invariants() {
  const seen = new Set();
  for (const group of sim.state.groups) {
    const key = `${group.level}:${group.x},${group.y}`;
    if (seen.has(key)) return `two groups on ${key}`;
    seen.add(key);
    if (sim.state.groupAt(group.level, group.x, group.y) !== group) return `index out of date for group ${group.id}`;
    const tile = sim.state.tileAt(group.level, group.x, group.y);
    if (!tile || tile.type === 'wall') return `group ${group.id} in a wall at ${key}`;
  }
  return null;
}

// 1. Level 1: creatures wander.
check(sim.teleport(1, 1, 4) === null, 'niveau 1 : le groupe arrive en (1, 4)');
const before = new Map([...sim.state.groups].filter((g) => g.level === 1).map((g) => [g.id, `${g.x},${g.y}`]));
let moves = 0;
const off = sim.on('creaturesMoved', ({ group, from, turned }) => {
  if (from && !turned) moves++;
  const info = creatureInfo(group.type);
  // A voluntary step never enters a closed door (material creatures) nor a wall.
  if (from && !creaturePassage(sim.state, info, group.level, group.x, group.y) && sim.state.tileAt(group.level, group.x, group.y).type !== 'pit') {
    failures++;
    console.log('FAIL step into', group, sim.state.tileAt(group.level, group.x, group.y).type);
  }
});
sim.tick(6 * 60 * 5); // 5 minutes
off();
const moved = [...before].filter(([id, at]) => {
  const g = [...sim.state.groups].find((g) => g.id === id);
  return `${g.x},${g.y}` !== at;
}).length;
check(moves > 0 && moved > 0, `niveau 1 : ${moves} pas, ${moved} groupes sur ${before.size} ont bougé en 5 min`);
check(!invariants(), `niveau 1 : invariants (${invariants() ?? 'aucune erreur'})`);
check([...sim.state.groups].filter((g) => g.level === 2).every((g) => g.nextMove === null), 'niveau 2 : groupes figés (pas le niveau du groupe)');

// 2. The party is blocked by a creature in front of it.
{
  sim.reset();
  const group = [...sim.state.groups].find((g) => g.level === 1 && creatureInfo(g.type).immobile === false);
  // Find a free tile next to it, facing it.
  const side = Object.entries(SIDE_DELTAS).find(([, [dx, dy]]) => !blockReason(sim.state, 1, group.x - dx, group.y - dy));
  const [facing, [dx, dy]] = side;
  sim.teleport(1, group.x - dx, group.y - dy);
  while (sim.party.facing !== facing) sim.command('turnRight');
  let reason = null;
  const offBlocked = sim.on('blocked', (e) => (reason = e.reason));
  sim.command('forward');
  offBlocked();
  check(reason === 'creature', `groupe bloqué par ${group.type} (${creatureInfo(group.type).name}) : ${reason}`);
  // F (teleport) still goes onto its tile.
  check(sim.teleport(1, group.x, group.y) === null, 'F : la case de la créature reste accessible');
}

// 3. N3 (7, 5): the mummy leaves its plate -> "YOU WILL REGRET THAT".
{
  sim.reset();
  const texts = [];
  const offText = sim.on('textChanged', ({ index, visible }) => visible && texts.push(dungeon.data.texts[index].text.replaceAll('\n', ' ')));
  const mummy = sim.state.groupAt(3, 7, 5);
  check(sim.teleport(3, 0, 1) === null, 'N3 : le groupe arrive en (0, 1)');
  // Shut in by walls, a fake wall (opened by its own plate) and an open pit (7, 4), which a
  // creature does not enter by itself: in the game it leaves the plate by dying (phase C4).
  // Here the pit is closed so that it can walk away.
  const stuck = Array.from({ length: 600 }).every(() => (sim.tick(1), sim.state.groupAt(3, 7, 5) === mummy));
  check(stuck, 'N3 : la momie reste enfermée sur sa plaque (100 s)');
  sim.state.tileAt(3, 7, 4).detail.open = false;
  let t = 0;
  while (sim.state.groupAt(3, 7, 5) === mummy && t < 6 * 600) {
    sim.tick(1);
    t++;
  }
  sim.tick(3);
  offText();
  check(sim.state.groupAt(3, 7, 5) !== mummy, `N3 : la momie quitte (7, 5) après ${t} ticks, vers (${mummy.x}, ${mummy.y})`);
  check(texts.some((text) => text.includes('REGRET')), `N3 : textes affichés : ${JSON.stringify(texts)}`);
}

// 4. A generator: a party plate a few tiles away triggers it, its group appears at once
// on the generator tile; then it rests, and a second press does nothing.
{
  sim.reset();
  const index = dungeon.data.actuators.findIndex((a) => a.generator && a.at.map === 3 && a.at.x === 4 && a.at.y === 23);
  const a = dungeon.data.actuators[index];
  const { x, y } = a.at;
  const plate = dungeon.data.actuators.find((p) => p.target === 'remote' && p.at.map === 3 && p.remote.x === x && p.remote.y === y);
  const { x: px, y: py } = plate.at;
  const side = Object.entries(SIDE_DELTAS).find(([, [dx, dy]]) => !blockReason(sim.state, 3, px - dx, py - dy));
  const [facing, [dx, dy]] = side;
  sim.teleport(3, px - dx, py - dy);
  while (sim.party.facing !== facing) sim.command('turnRight');
  check(!sim.state.groupAt(3, x, y), `générateur (${x}, ${y}) niveau 3 : case libre`);
  let generated = null;
  const offGen = sim.on('creaturesMoved', (e) => e.generated && (generated = e.group));
  sim.command('forward');
  check(sim.party.x === px && sim.party.y === py, `le groupe est sur la plaque (${px}, ${py})`);
  sim.tick(plate.delay + 1);
  check(
    generated && generated.type === a.data && generated.x === x && generated.y === y,
    `apparu sans attendre : ${generated && `${generated.members.length} × ${creatureInfo(generated.type).name}, PV ${generated.members.map((m) => m.hp)}`}`,
  );
  check(sim.state.actuator(index).disabled, 'générateur au repos ensuite');
  generated = null;
  sim.command('back');
  sim.command('forward');
  sim.tick(plate.delay + 1);
  offGen();
  check(!generated, 'pendant le repos, la plaque ne produit rien');
}

// 5. Level 2: a group that sees the party comes into contact, then stays facing it.
{
  sim.reset();
  // A mobile group, and a free tile 3 squares in front of it, in sight.
  let found = null;
  for (const group of [...sim.state.groups].filter((g) => g.level === 2)) {
    const info = creatureInfo(group.type);
    if (info.immobile || info.moveTicks > 30) continue;
    const [dx, dy] = SIDE_DELTAS[group.facing];
    for (const d of [3, 2]) {
      const [x, y] = [group.x + d * dx, group.y + d * dy];
      if (blockReason(sim.state, 2, x, y) || sim.state.groupAt(2, x, y) || sim.state.tileAt(2, x, y).type !== 'floor') continue;
      if (!lineOfSight(dungeon, sim.state, 2, group.x, group.y, x, y)) continue;
      found = { group, x, y };
      break;
    }
    if (found) break;
  }
  check(found, `niveau 2 : ${found && `${creatureInfo(found.group.type).name} en (${found.group.x}, ${found.group.y}), groupe en (${found.x}, ${found.y})`}`);
  const { group, x, y } = found;
  const alerted = [];
  const offAlert = sim.on('groupAlerted', (e) => alerted.push(e.group.id));
  sim.teleport(2, x, y);
  check(perceiveParty(dungeon, sim.state, creatureInfo(group.type), group, sim.party)?.seen, 'la créature voit le groupe');
  const touching = () => Math.abs(group.x - x) + Math.abs(group.y - y) === 1;
  let t = 0;
  while (!touching() && t < 6 * 30) {
    sim.tick(1);
    t++;
  }
  offAlert();
  check(alerted.includes(group.id), 'événement groupAlerted');
  check(touching(), `au contact après ${t} ticks, en (${group.x}, ${group.y})`);
  sim.tick(6 * 20);
  const facesParty = SIDE_DELTAS[group.facing].every((d, i) => d === [x - group.x, y - group.y][i]);
  check(touching() && facesParty, `20 s plus tard, toujours au contact et face au groupe (${group.facing})`);
  // The party steps aside: the creature follows and faces it again.
  const side = Object.entries(SIDE_DELTAS).find(([, [dx, dy]]) => !blockReason(sim.state, 2, x + dx, y + dy) && !sim.state.groupAt(2, x + dx, y + dy) && sim.state.tileAt(2, x + dx, y + dy).type === 'floor');
  if (side) {
    const [nx, ny] = [x + side[1][0], y + side[1][1]];
    sim.teleport(2, nx, ny);
    sim.tick(6 * 20);
    const near = Math.abs(group.x - nx) + Math.abs(group.y - ny) === 1;
    const faces = SIDE_DELTAS[group.facing].every((d, i) => d === [nx - group.x, ny - group.y][i]);
    check(near && faces, `le groupe se décale en (${nx}, ${ny}) : la créature suit, en (${group.x}, ${group.y}) face ${group.facing}`);
  }
}

// 6. Sight through the first two closed doors met: a wooden or iron door hides the party, a grate or a Ra door does not.
{
  sim.reset();
  let checked = 0;
  for (let level = 0; level < dungeon.levelCount && checked < 2; level++) {
    const map = dungeon.level(level);
    for (let y = 0; y < map.height && checked < 2; y++)
      for (let x = 0; x < map.width && checked < 2; x++) {
        const tile = sim.state.tileAt(level, x, y);
        if (tile?.type !== 'door' || tile.detail.open) continue;
        const [dx, dy] = tile.detail.orientation === 'NS' ? [0, 1] : [1, 0];
        if (blockReason(sim.state, level, x - dx, y - dy) || blockReason(sim.state, level, x + dx, y + dy)) continue;
        const look = map.doorTypes[dungeon.data.doors[tile.detail.items.find((i) => i.kind === 'door').index].type];
        const clear = lineOfSight(dungeon, sim.state, level, x - dx, y - dy, x + dx, y + dy);
        const expected = look === 'Porticullis' || look === 'Ra';
        check(clear === expected, `porte fermée ${look} N${level} (${x}, ${y}) : ${clear ? 'on voit à travers' : 'elle cache le groupe'}`);
        checked++;
      }
  }
}

// 7. Random walk on every level: no exception, invariants kept.
{
  sim.reset();
  const commands = ['forward', 'back', 'left', 'right', 'turnLeft', 'turnRight'];
  let seed = 7;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };
  const start = performance.now();
  let error = null;
  for (let i = 0; i < 100000 && !error; i++) {
    const r = rnd(100);
    if (r < 2) {
      const level = rnd(dungeon.levelCount);
      const map = dungeon.level(level);
      sim.teleport(level, rnd(map.width), rnd(map.height));
    } else if (r < 5) sim.clickFront();
    else if (r < 60) sim.command(commands[rnd(commands.length)]);
    else sim.tick(1 + rnd(6));
    if (i % 1000 === 0) error = invariants();
  }
  error ??= invariants();
  check(!error, `marche aléatoire, 100 000 actions en ${Math.round(performance.now() - start)} ms, temps ${sim.time} ticks (${error ?? 'invariants tenus'})`);
}

console.log(failures ? `${failures} échec(s)` : 'tout est bon');
process.exit(failures ? 1 : 0);
