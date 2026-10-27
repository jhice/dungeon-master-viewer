// Checks of phase C3a (docs/023 and 024): the champion Zed, his hands, the actions
// "Frapper" and "Lancer", the attacks of the creatures, thrown items, death of a creature
// (possessions, plate) and of the champion.
// Run: node tools/test-combat.mjs

import { readFileSync } from 'node:fs';
import { Dungeon, SIDE_DELTAS } from '../src/core/dungeon.js';
import { createSimulation } from '../src/sim/simulation.js';
import { creatureInfo } from '../src/core/creature-info.js';
import { describeItem } from '../src/core/contents.js';
import { blockReason } from '../src/sim/rules.js';
import { itemInfo } from '../src/core/item-info.js';

const dungeon = new Dungeon(JSON.parse(readFileSync(new URL('../data/dungeon.json', import.meta.url))));
const sim = createSimulation(dungeon);
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};
const names = (refs) => refs.map((ref) => describeItem(dungeon, ref).name);
// The throwing tests must not be cut short by a creature passing by.
const immortalOnce = () => Object.assign(sim.champion, { health: 1e9, maxHealth: 1e9 });

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

// 7. Hands: an item held by the cursor goes into a hand; the action hand gives the actions.
const weaponIndex = (name) => dungeon.data.weapons.findIndex((w) => w.name === name);
{
  sim.reset();
  check(sim.actions.join() === 'hit', `main d'action vide : ${sim.actions}`);
  const torch = sim.inventory.findIndex((ref) => names([ref])[0] === 'Torch');
  sim.takeFromInventory(torch);
  sim.swapHand(1);
  check(!sim.hand && names([sim.hands[1]])[0] === 'Torch', 'la Torch passe du curseur à la main droite');
  check(sim.actions.join() === 'hit', `Torch : ${sim.actions}`);
  sim.swapHand(1);
  check(names([sim.hand])[0] === 'Torch' && !sim.hands[1], 'clic sur la main : elle revient au curseur');
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('Dagger') };
  check(sim.actions.join() === 'throw,hit', `Dagger : ${sim.actions}`);
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('Throwing Star') };
  check(sim.actions.join() === 'throw', `Throwing Star : ${sim.actions}`);
  sim.state.hands[1] = { kind: 'cloth', index: 18 };
  check(sim.actions.length === 0, 'Mail Aketon : aucune action');
}

// 8. Throwing: range by weight, against a wall, onto a creature.
// A straight line of free floor tiles (no creature, no item), at least `n` long, on any level.
function corridor(n) {
  for (let level = 1; level < dungeon.levelCount; level++) {
    const map = dungeon.level(level);
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++)
        for (const [facing, [dx, dy]] of Object.entries(SIDE_DELTAS)) {
          const free = (k) => {
            const [tx, ty] = [x + k * dx, y + k * dy];
            return sim.state.tileAt(level, tx, ty)?.type === 'floor' && !sim.state.groupAt(level, tx, ty) && !sim.state.itemsAt(level, tx, ty).length;
          };
          if (Array.from({ length: n + 1 }, (_, k) => k).every(free)) return { level, x, y, facing };
        }
  }
  return null;
}
function throwAndLand(ref) {
  sim.state.hand = ref;
  const out = sim.throwHeld('right');
  let landed = null;
  const off = sim.on('itemsChanged', (e) => (landed ??= e));
  for (let t = 0; t < 60 && !landed; t++) sim.tick(1);
  off();
  return { out, landed };
}
{
  sim.reset();
  immortalOnce();
  const start = corridor(10);
  check(start, `couloir de 10 cases : niveau ${start?.level} depuis (${start?.x}, ${start?.y}) vers ${start?.facing}`);
  sim.teleport(start.level, start.x, start.y);
  while (sim.party.facing !== start.facing) sim.command('turnRight');
  const distance = ({ x, y }) => Math.abs(x - start.x) + Math.abs(y - start.y);
  const star = throwAndLand({ kind: 'weapon', index: weaponIndex('Throwing Star') });
  const mail = throwAndLand({ kind: 'cloth', index: 18 });
  check(star.out.result === 'thrown' && star.landed, `Throwing Star (0,1 kg) : tombe à ${distance(star.landed)} cases`);
  const mailKg = itemInfo(dungeon, { kind: 'cloth', index: 18 }).weight;
  check(mail.landed && distance(mail.landed) < distance(star.landed), `Mail Aketon (${mailKg} kg) : tombe à ${distance(mail.landed)} cases`);
  check(!sim.hand, 'le curseur est vide après le lancer');
}
{
  // Facing a wall: the item falls on the party's tile, front row.
  sim.reset();
  immortalOnce();
  const front = () => {
    const [dx, dy] = SIDE_DELTAS[sim.party.facing];
    return sim.state.tileAt(sim.party.level, sim.party.x + dx, sim.party.y + dy)?.type;
  };
  for (let i = 0; i < 4 && front() !== 'wall'; i++) sim.command('turnRight');
  const { x, y, facing } = sim.party;
  const { landed } = throwAndLand({ kind: 'weapon', index: weaponIndex('Dagger') });
  check(front() === 'wall' && landed?.x === x && landed?.y === y, `face à un mur (${facing}) : la Dagger tombe sur la case du groupe (${landed?.x}, ${landed?.y})`);
}
{
  // Onto the Screamers of N1 (8, 24): a thrown Torch hits one, then lies on their tile.
  sim.reset();
  immortalOnce();
  const group = sim.state.groupAt(1, 8, 24);
  faceGroup(group);
  const hits = [];
  const off = sim.on('creatureHit', (e) => e.thrown && hits.push(e));
  const torch = sim.inventory.find((ref) => names([ref])[0] === 'Torch');
  const { landed } = throwAndLand(torch);
  off();
  check(hits.length === 1, `la Torch touche un Screamer : ${hits[0]?.result}, ${hits[0]?.damage} PV`);
  check(landed && landed.x === 8 && landed.y === 24, `et tombe sur sa case (${landed?.x}, ${landed?.y})`);
}

// 9. A strike that meets no creature: into the void, a wall, a door; it costs its fatigue all the same.
{
  sim.reset();
  immortalOnce();
  const front = () => {
    const [dx, dy] = SIDE_DELTAS[sim.party.facing];
    return sim.state.tileAt(sim.party.level, sim.party.x + dx, sim.party.y + dy)?.type;
  };
  for (let i = 0; i < 4 && front() !== 'floor'; i++) sim.command('turnRight');
  const air = sim.attack();
  check(air.result === 'air' && sim.fatigue === 4, `dans le vide : ${air.result}, fatigue ${sim.fatigue} ticks`);
  check(sim.attack().result === 'busy', 'un second coup tout de suite : fatigue');
  for (let i = 0; i < 4 && front() !== 'wall'; i++) sim.command('turnRight');
  sim.tick(sim.fatigue);
  const wall = sim.attack();
  check(wall.result === 'wall' && sim.fatigue === 4, `contre le mur : ${wall.result}, fatigue ${sim.fatigue} ticks`);
  // A closed door of level 0, from the tile north (or west) of it.
  const map = dungeon.level(0);
  let door = null;
  for (let y = 0; y < map.height && !door; y++)
    for (let x = 0; x < map.width && !door; x++) {
      const tile = sim.state.tileAt(0, x, y);
      if (tile?.type !== 'door' || tile.detail.open) continue;
      const [dx, dy] = tile.detail.orientation === 'NS' ? [0, 1] : [1, 0];
      if (!blockReason(sim.state, 0, x - dx, y - dy)) door = { x, y, from: [x - dx, y - dy], facing: dx ? 'E' : 'S' };
    }
  sim.teleport(0, ...door.from);
  while (sim.party.facing !== door.facing) sim.command('turnRight');
  sim.tick(sim.fatigue);
  const hit = sim.attack();
  check(hit.result === 'door' && sim.state.tileAt(0, door.x, door.y).detail.open === false, `contre la porte N0 (${door.x}, ${door.y}) : ${hit.result}, elle reste fermée`);
}

console.log(failures ? `${failures} échec(s)` : 'tout est bon');
process.exit(failures ? 1 : 0);
