// Checks of phase C3a (docs/023): the champion Zed, the action "Frapper", the attacks
// of the creatures, death of a creature (possessions, plate) and of the champion.
// Run: node tools/test-combat.mjs

import { readFileSync } from 'node:fs';
import { Dungeon, SIDE_DELTAS } from '../src/core/dungeon.js';
import { createSimulation } from '../src/sim/simulation.js';
import { creatureInfo } from '../src/core/creature-info.js';
import { describeItem } from '../src/core/contents.js';
import { blockReason } from '../src/sim/rules.js';

const dungeon = new Dungeon(JSON.parse(readFileSync(new URL('../data/dungeon.json', import.meta.url))));
const sim = createSimulation(dungeon);
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};
const names = (refs) => refs.map((ref) => describeItem(dungeon, ref).name);

// Places the party next to a group, on a free side, facing it.
function faceGroup(group) {
  const side = Object.entries(SIDE_DELTAS).find(
    ([, [dx, dy]]) => !blockReason(sim.state, group.level, group.x - dx, group.y - dy) && !sim.state.groupAt(group.level, group.x - dx, group.y - dy),
  );
  if (!side) return false;
  const [facing, [dx, dy]] = side;
  sim.teleport(group.level, group.x - dx, group.y - dy);
  while (sim.party.facing !== facing) sim.command('turnRight');
  return true;
}
// Strikes until the group is gone (or `max` strikes), waiting for the fatigue.
function strikeUntilGone(group, max = 200) {
  const outcomes = [];
  for (let i = 0; i < max && sim.state.groupAt(group.level, group.x, group.y) === group; i++) {
    sim.tick(sim.fatigue);
    outcomes.push(sim.attack());
  }
  return outcomes;
}

// 1. Zed, with the items of his mirror.
{
  const c = sim.champion;
  check(c.name === 'ZED' && c.title === 'DUKE OF BANVILLE', `champion : ${c.name}, ${c.title}`);
  check(c.health === 60 && c.stamina === 600 && c.mana === 10, `PV ${c.health}, endurance ${c.stamina / 10}, mana ${c.mana}`);
  check(c.strength === 40 && c.dexterity === 40 && c.vitality === 50, `force ${c.strength}, dextérité ${c.dexterity}, vitalité ${c.vitality}`);
  const items = names(sim.inventory);
  check(items.length === 4 && items.includes('Torch'), `inventaire de départ : ${items.join(', ')}`);
  check(sim.state.itemsAt(0, 10, 6).length === 0, 'le miroir de Zed (0, 10, 6) est vide');
}

// 2. Level 1: kill the Screamers of (8, 24), which carry two items.
{
  sim.reset();
  const group = sim.state.groupAt(1, 8, 24);
  const carried = names(group.items);
  check(group && creatureInfo(group.type).name === 'Screamer', `N1 (8, 24) : ${group.members.length} × Screamer, possessions ${carried.join(', ')}`);
  check(faceGroup(group), `le groupe face aux Screamers, en (${sim.party.x}, ${sim.party.y})`);
  const hits = [];
  const off = sim.on('creatureHit', (e) => hits.push(e));
  const outcomes = strikeUntilGone(group);
  off();
  const counts = Object.groupBy(outcomes, (o) => o.result);
  check(!sim.state.groupAt(1, 8, 24), `groupe tué en ${outcomes.length} coups (${Object.entries(counts).map(([k, v]) => `${k} ${v.length}`).join(', ')})`);
  check(hits.filter((h) => h.killed).length === 4, '4 Screamers tués, un par un');
  const lying = names(sim.state.itemsAt(1, 8, 24));
  check(carried.every((name) => lying.includes(name)), `possessions tombées sur la case : ${lying.join(', ')}`);
  check(sim.champion.health > 0, `Zed a ${sim.champion.health} PV après le combat`);
}

// 3. Level 2: next to a Trolin, Zed loses health; his stamina goes down with each strike.
{
  sim.reset();
  const group = sim.state.groupAt(2, 10, 20);
  faceGroup(group);
  const struck = [];
  const off = sim.on('championHit', (e) => struck.push(e));
  sim.tick(6 * 10);
  off();
  const hit = struck.filter((s) => s.result === 'hit');
  check(hit.length > 0 && sim.champion.health < 60, `10 s au contact d'un Trolin : ${struck.length} attaques, ${hit.length} touchent, PV ${sim.champion.health}`);
  const before = sim.champion.stamina;
  sim.tick(sim.fatigue);
  sim.attack();
  check(sim.champion.stamina === before - 3, `endurance après un coup : ${before} → ${sim.champion.stamina} (×10, coût 3)`);
  check(sim.attack().result === 'busy', 'un second coup tout de suite : fatigue');
}

// 4. A non-material creature (Ghost) ignores the strikes.
{
  sim.reset();
  const ghost = [...sim.state.groups].find((g) => creatureInfo(g.type).nonMaterial && creatureInfo(g.type).name === 'Ghost' && faceGroup(g));
  check(ghost, `Ghost au niveau ${ghost?.level} (${ghost?.x}, ${ghost?.y})`);
  check(sim.attack().result === 'immaterial', 'Frapper un Ghost : aucun effet');
}

// 5. N3 (7, 5): killing the mummy releases its plate, "YOU WILL REGRET THAT." (criterion of C4).
{
  sim.reset();
  const mummy = sim.state.groupAt(3, 7, 5);
  // North of it, the open pit (7, 4): F places the party there without falling.
  sim.teleport(3, 7, 4);
  while (sim.party.facing !== 'S') sim.command('turnRight');
  const texts = [];
  const off = sim.on('textChanged', ({ index, visible }) => visible && texts.push(dungeon.data.texts[index].text.replaceAll('\n', ' ')));
  const outcomes = strikeUntilGone(mummy);
  sim.tick(3);
  off();
  check(!sim.state.groupAt(3, 7, 5), `momie tuée en ${outcomes.length} coups`);
  check(texts.some((t) => t.includes('REGRET')), `textes : ${JSON.stringify(texts)}`);
}

// 6. Death of the champion: the game stops, reset brings Zed back.
{
  sim.reset();
  const group = sim.state.groupAt(2, 10, 20);
  faceGroup(group);
  sim.champion.health = 1;
  let died = null;
  const off = sim.on('championDied', (e) => (died = e));
  for (let t = 0; t < 6 * 60 && !died; t++) sim.tick(1);
  off();
  check(died && sim.champion.dead && sim.champion.health === 0, `Zed meurt, tué par ${died && creatureInfo(died.group.type).name}`);
  const { x, y } = sim.party;
  sim.command('back');
  check(sim.party.x === x && sim.party.y === y && sim.attack().result === 'dead', 'mort : plus de déplacement ni de coup');
  sim.tick(6 * 10);
  sim.reset();
  check(!sim.champion.dead && sim.champion.health === 60, 'recommencer : Zed revient avec 60 PV');
}

console.log(failures ? `${failures} échec(s)` : 'tout est bon');
process.exit(failures ? 1 : 0);
