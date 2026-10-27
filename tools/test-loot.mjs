// Checks of phase C4 (docs/025): items left by dead creatures, the possessions of a
// group, fear after a death, the Giggler that steals and flees, the reset.
// Run: node tools/test-loot.mjs

import { readFileSync } from 'node:fs';
import { Dungeon, SIDE_DELTAS } from '../src/core/dungeon.js';
import { createSimulation } from '../src/sim/simulation.js';
import { creatureInfo } from '../src/core/creature-info.js';
import { describeItem } from '../src/core/contents.js';
import { blockReason } from '../src/sim/rules.js';

const dungeon = new Dungeon(JSON.parse(readFileSync(new URL('../data/dungeon.json', import.meta.url))));
const sim = createSimulation(dungeon);
const weaponsAtStart = dungeon.data.weapons.length;
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};
const names = (refs) => refs.map((ref) => describeItem(dungeon, ref).name);
const immortal = () => Object.assign(sim.champion, { health: 1e9, maxHealth: 1e9 });
const speciesOf = (group) => creatureInfo(group.type).name;

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
const alive = (group) => sim.state.groupAt(group.level, group.x, group.y) === group;
// Strikes until the group is gone, following it if it moves (fleeing).
function killGroup(group, max = 400) {
  for (let i = 0; i < max && alive(group); i++) {
    if (!faceGroup(group)) return false;
    sim.tick(sim.fatigue);
    sim.attack();
  }
  return !alive(group);
}

// 1. Screamers and a Trolin leave the items of their species.
{
  sim.reset();
  immortal();
  const screamers = sim.state.groupAt(1, 8, 24);
  const carried = names(screamers.items);
  killGroup(screamers);
  const lying = names(sim.state.itemsAt(1, 8, 24));
  const slices = lying.filter((n) => n === 'Screamer Slice').length;
  check(slices >= 4 && slices <= 8, `4 Screamers tués : ${slices} Screamer Slice (1 à 2 chacun)`);
  check(carried.every((n) => lying.includes(n)), `et leurs possessions : ${carried.join(', ')}`);
  const trolin = [...sim.state.groups].find((g) => g.level === 2 && speciesOf(g) === 'Trolin' && g.members.length === 1 && faceGroup(g));
  killGroup(trolin);
  const clubs = names(sim.state.itemsAt(2, trolin.x, trolin.y)).filter((n) => n === 'Club').length;
  check(clubs === 1, `Trolin tué en N2 (${trolin.x}, ${trolin.y}) : ${clubs} Club`);
  check(dungeon.data.weapons.length === weaponsAtStart + 1, `un objet créé dans la table des armes (${dungeon.data.weapons.length})`);
  sim.reset();
  check(dungeon.data.weapons.length === weaponsAtStart, 'recommencer : les objets créés disparaissent');
}

// 2. Fear: killing a member of a group may make the others flee, away from the party.
{
  sim.reset();
  immortal();
  let fled = null;
  const off = sim.on('groupFled', (e) => e.reason === 'fear' && (fled ??= e.group));
  const groups = [...sim.state.groups].filter((g) => g.level === 2 && speciesOf(g) === 'Trolin' && g.members.length > 1);
  for (const group of groups) {
    if (fled) break;
    const count = group.members.length;
    for (let i = 0; i < 100 && alive(group) && group.members.length === count; i++) {
      if (!faceGroup(group)) break;
      sim.tick(sim.fatigue);
      sim.attack();
    }
  }
  off();
  check(fled, `un groupe de Trolins prend peur après une mort (résistance à la peur ${creatureInfo(16).fear})`);
  if (fled) {
    const { x, y } = sim.party;
    const before = Math.abs(fled.x - x) + Math.abs(fled.y - y);
    sim.tick(6 * 5);
    const after = Math.abs(fled.x - x) + Math.abs(fled.y - y);
    check(after > before, `il s'éloigne : distance ${before} → ${after}`);
  }
  check(creatureInfo(6).fear === 15, 'Screamer : résistance 15, jamais effrayé');
}

// 3. A Giggler steals the item of a hand, flees with it, and gives it back when killed.
{
  sim.reset();
  immortal();
  const giggler = [...sim.state.groups].find((g) => speciesOf(g) === 'Giggler' && g.members.length === 1);
  check(giggler, `Giggler au niveau ${giggler.level} (${giggler.x}, ${giggler.y})`);
  const torch = sim.inventory.findIndex((ref) => names([ref])[0] === 'Torch');
  sim.takeFromInventory(torch);
  sim.swapHand(1);
  faceGroup(giggler);
  let stolen = null;
  const off = sim.on('itemStolen', (e) => (stolen = e));
  const fled = [];
  const offFled = sim.on('groupFled', (e) => fled.push(e.reason));
  for (let t = 0; t < 6 * 30 && !stolen; t++) sim.tick(1);
  off();
  offFled();
  check(stolen && names([stolen.item])[0] === 'Torch' && !sim.hands[1], `le Giggler vole la ${stolen && names([stolen.item])[0]} de la main droite`);
  check(fled.includes('theft') && names(giggler.items).includes('Torch'), 'il la garde et s’enfuit');
  const { x: px, y: py } = sim.party;
  sim.tick(6 * 3);
  check(Math.abs(giggler.x - px) + Math.abs(giggler.y - py) > 1, `il s'est éloigné, en (${giggler.x}, ${giggler.y})`);
  check(killGroup(giggler), 'rattrapé et tué');
  check(names(sim.state.itemsAt(giggler.level, giggler.x, giggler.y)).includes('Torch'), `la Torch tombe sur sa case (${giggler.x}, ${giggler.y})`);
}

// 4. A Giggler finds empty hands: nothing stolen.
{
  sim.reset();
  immortal();
  const giggler = [...sim.state.groups].find((g) => speciesOf(g) === 'Giggler');
  faceGroup(giggler);
  let stolen = null;
  const off = sim.on('itemStolen', (e) => (stolen = e));
  const hits = [];
  const offHit = sim.on('championHit', (e) => e.group === giggler && hits.push(e));
  sim.tick(6 * 10);
  off();
  offHit();
  check(!stolen && !hits.length, 'mains vides : rien de volé, et le Giggler ne frappe pas');
}

console.log(failures ? `${failures} échec(s)` : 'tout est bon');
process.exit(failures ? 1 : 0);
