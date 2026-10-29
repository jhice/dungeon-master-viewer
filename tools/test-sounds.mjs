// Checks of the sounds announced by the simulation (docs/041): who asks for which sound, where.
// Run: node tools/test-sounds.mjs

import { readFileSync } from 'node:fs';
import { Dungeon, SIDE_DELTAS, FACINGS } from '../src/core/dungeon.js';
import { createSimulation } from '../src/sim/simulation.js';
import { blockReason } from '../src/sim/rules.js';
import { SOUNDS, attackSound } from '../src/core/sound-info.js';

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
// The sounds asked while `fn` runs.
function heard(fn) {
  const sounds = [];
  const off = sim.on('sound', (s) => sounds.push(s));
  fn();
  off();
  return sounds;
}
const ids = (sounds) => sounds.map((s) => s.id);
// A floor tile next to (level, x, y), and the side to face from it; null if none.
function besides(level, x, y) {
  for (const [facing, [dx, dy]] of Object.entries(SIDE_DELTAS)) {
    const from = [x - dx, y - dy];
    if (dungeon.tileAt(level, ...from)?.type === 'floor' && !sim.state.groupAt(level, ...from)) return { from, facing };
  }
  return null;
}

// 0. Every sound has a file.
check(Object.values(SOUNDS).every((s) => /^\d\d$/.test(s.file)), `${Object.keys(SOUNDS).length} sons, chacun avec son fichier`);

// 1. Running into a wall: immediate, on the party's tile; into a creature: nothing.
{
  sim.reset();
  const { level, x, y } = sim.party;
  const wall = Object.keys(SIDE_DELTAS).find((f) => blockReason(sim.state, level, x + SIDE_DELTAS[f][0], y + SIDE_DELTAS[f][1]) === 'wall');
  face(wall);
  const sounds = heard(() => sim.command('forward'));
  check(ids(sounds).join() === 'wall' && sounds[0].immediate && sounds[0].x === x && sounds[0].y === y, `mur heurté : ${ids(sounds).join() || 'rien'}`);
}

// 2. A door: one sound per step, on its tile; its button clicks.
{
  sim.reset();
  const door = dungeon.data.doors.find((d) => d.button && !dungeon.tileAt(d.at.map, d.at.x, d.at.y).detail.open && besides(d.at.map, d.at.x, d.at.y));
  const { map: level, x, y } = door.at;
  const { from, facing } = besides(level, x, y);
  sim.teleport(level, ...from);
  face(facing);
  const sounds = heard(() => {
    sim.clickFront();
    sim.tick(6);
  });
  const doorSounds = sounds.filter((s) => s.id === 'door');
  check(sounds[0]?.id === 'switch', `bouton de porte : ${sounds[0]?.id}`);
  check(doorSounds.length === 4 && doorSounds.every((s) => s.x === x && s.y === y), `porte N${level} (${x}, ${y}) : ${doorSounds.length} sons de cran (4 attendus)`);
}

// 3. Teleporters: audible ones buzz where the party arrives, the others are silent.
for (const audible of [true, false]) {
  sim.reset();
  const index = dungeon.data.teleporters.findIndex((t, i) => {
    if (Boolean(t.sound) !== audible || !['all', 'items_party'].includes(t.scope)) return false;
    const tile = sim.state.tileAt(t.at?.map ?? -1, t.at?.x, t.at?.y);
    return tile?.detail.open && besides(t.at.map, t.at.x, t.at.y);
  });
  if (index < 0) {
    check(false, `téléporteur ${audible ? 'sonore' : 'muet'} introuvable`);
    continue;
  }
  const t = dungeon.data.teleporters[index];
  const { from, facing } = besides(t.at.map, t.at.x, t.at.y);
  sim.teleport(t.at.map, ...from);
  face(facing);
  const sounds = heard(() => sim.command('forward')).filter((s) => s.id === 'teleport');
  const ok = audible ? sounds.length >= 1 && sounds[0].level === t.dest.map && sounds[0].x === t.dest.x && sounds[0].y === t.dest.y : sounds.length === 0;
  check(ok, `téléporteur ${audible ? 'sonore' : 'muet'} N${t.at.map} (${t.at.x}, ${t.at.y}) : ${sounds.length} son(s)`);
}

// 4. An audible wall button clicks on its tile; a silent one does not.
for (const audible of [true, false]) {
  sim.reset();
  // Its face (position 0..3 = N, E, S, W): the party stands on the tile it looks at, facing it.
  let a, position;
  for (const [i, entry] of dungeon.data.actuators.entries()) {
    if (entry.kind !== 'wall' || entry.typeName !== 'Any item / Empty hand' || Boolean(entry.sound) !== audible || entry.onceOnly) continue;
    const refs = sim.state.actuatorsAt(entry.at.map, entry.at.x, entry.at.y);
    position = refs.find((r) => r.index === i)?.position;
    // Every actuator of that face must agree (a face may hold an audible one and a silent one).
    if (refs.some((r) => r.position === position && Boolean(dungeon.data.actuators[r.index].sound) !== audible)) continue;
    const [dx, dy] = SIDE_DELTAS[FACINGS[position]] ?? [];
    if (dx === undefined || dungeon.tileAt(entry.at.map, entry.at.x + dx, entry.at.y + dy)?.type !== 'floor') continue;
    a = entry;
    break;
  }
  const [dx, dy] = SIDE_DELTAS[FACINGS[position]];
  sim.teleport(a.at.map, a.at.x + dx, a.at.y + dy);
  face(FACINGS[(position + 2) % 4]);
  const sounds = heard(() => sim.clickFront()).filter((s) => s.id === 'switch');
  check(audible ? sounds.length >= 1 && sounds[0].x === a.at.x && sounds[0].y === a.at.y : sounds.length === 0, `bouton mural ${audible ? 'sonore' : 'muet'} N${a.at.map} (${a.at.x}, ${a.at.y}) : ${sounds.length} déclic(s)`);
}

// 5. A creature attacking: the sound of its species on its tile, then the champion's wound.
{
  sim.reset();
  const group = sim.state.groupAt(2, 10, 20);
  const { from, facing } = besides(group.level, group.x, group.y);
  sim.teleport(group.level, ...from);
  face(facing);
  const expected = attackSound(group.type);
  let sounds = [];
  for (let t = 0; t < 6 * 30 && !sounds.some((s) => s.id === expected); t++) sounds.push(...heard(() => sim.tick(1)));
  const attack = sounds.find((s) => s.id === expected);
  check(attack && attack.x === group.x && attack.y === group.y, `attaque du groupe N2 (10, 20) : ${expected}`);
  for (let t = 0; t < 6 * 60 && !sounds.some((s) => s.id === 'wounded'); t++) sounds.push(...heard(() => sim.tick(1)));
  const wound = sounds.find((s) => s.id === 'wounded');
  check(wound && wound.x === sim.party.x && wound.y === sim.party.y, 'Zed blessé : son sur la case du groupe');
}

// 6. Creatures stepping: the sound of their species.
{
  sim.reset();
  check(sim.teleport(2, 9, 30) === null, 'groupe posé au niveau 2 (9, 30)');
  const sounds = [];
  for (let t = 0; t < 6 * 60; t++) sounds.push(...heard(() => sim.tick(1)));
  const steps = sounds.filter((s) => s.id.startsWith('move:'));
  check(steps.length > 0, `pas des créatures du niveau 2 en 1 min : ${steps.length}`);
}

console.log(failures ? `\n${failures} échec(s)` : '\nTout est bon.');
process.exit(failures ? 1 : 0);
