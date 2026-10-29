// Checks of phase C3a (docs/023 and 024) and of the actions of DM (docs/044): the champion Zed,
// his hands, the combos of the action hand, the attacks of the creatures, thrown items, death of
// a creature (possessions, plate) and of the champion.
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

const weaponIndex = (name) => dungeon.data.weapons.findIndex((w) => w.name === name);
const miscIndex = (name) => dungeon.data.miscellaneous.findIndex((w) => w.name === name);
const actionIndex = (name) => sim.actions.find((a) => a.name === name)?.index;

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
  sim.attack(); // empty hand: Punch, stamina 1 (+ 0 or 1)
  const spent = before - sim.champion.stamina;
  check(spent === 1 || spent === 2, `endurance après un coup de poing : ${before} → ${sim.champion.stamina} (×10, coût 1 ou 2)`);
  check(sim.attack().result === 'busy', 'un second coup tout de suite : fatigue');
}

// 4. A non-material creature (Ghost) ignores the strikes.
{
  sim.reset();
  const ghost = [...sim.state.groups].find((g) => creatureInfo(g.type).nonMaterial && creatureInfo(g.type).name === 'Ghost' && faceGroup(g));
  check(ghost, `Ghost au niveau ${ghost?.level} (${ghost?.x}, ${ghost?.y})`);
  check(sim.attack().result === 'immaterial', 'Cogner un Ghost : aucun effet');
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('Vorpal Blade') };
  sim.tick(sim.fatigue);
  check(sim.attack().result !== 'immaterial', 'la Vorpal Blade atteint le Ghost (F402)');
  sim.state.hands[1] = null;
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

// 7. Hands: an item held by the cursor goes into a hand; the action hand gives the actions of
// its combo, those above Zed's skill levels (Apprentice: 2 or 3) left out.
{
  const shown = () => sim.actions.map((a) => a.name).join();
  sim.reset();
  check(shown() === 'Punch,Kick,War Cry', `main d'action vide : ${shown()}`);
  const torch = sim.inventory.findIndex((ref) => names([ref])[0] === 'Torch');
  sim.takeFromInventory(torch);
  sim.swapHand(1);
  check(!sim.hand && names([sim.hands[1]])[0] === 'Torch', 'la Torch passe du curseur à la main droite');
  check(shown() === 'Swing', `Torch : ${shown()}`);
  sim.swapHand(1);
  check(names([sim.hand])[0] === 'Torch' && !sim.hands[1], 'clic sur la main : elle revient au curseur');
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('Dagger') };
  check(shown() === 'Throw,Stab,Slash', `Dagger : ${shown()}`);
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('Throwing Star') };
  check(shown() === 'Throw', `Throwing Star : ${shown()}`);
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('Sword') };
  check(shown() === 'Swing,Parry', `Sword : ${shown()} (Chop demande le niveau 3 en Club)`);
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('Flamitt') };
  check(shown() === 'Swing', `Flamitt : ${shown()} (Fireball demande le niveau 7 en Fire)`);
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('Yew Staff') };
  check(shown() === 'Parry,Light', `Yew Staff : ${shown()}`);
  sim.state.hands[1] = { kind: 'miscellaneous', index: miscIndex('Copper Coin') };
  check(shown() === 'Flip', `Copper Coin : ${shown()}`);
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

// 9. A strike that meets no creature: into the void, a wall, a door; it costs half its fatigue
// (Swing: 6, so 3). An action that breaks doors (Swing) attacks a closed door instead (fatigue 6);
// another one (Jab) does nothing to it.
{
  sim.reset();
  immortalOnce();
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('Sword') };
  const front = () => {
    const [dx, dy] = SIDE_DELTAS[sim.party.facing];
    return sim.state.tileAt(sim.party.level, sim.party.x + dx, sim.party.y + dy)?.type;
  };
  for (let i = 0; i < 4 && front() !== 'floor'; i++) sim.command('turnRight');
  const air = sim.attack();
  check(air.result === 'air' && sim.fatigue === 3, `dans le vide : ${air.result}, fatigue ${sim.fatigue} ticks`);
  check(sim.attack().result === 'busy', 'un second coup tout de suite : fatigue');
  for (let i = 0; i < 4 && front() !== 'wall'; i++) sim.command('turnRight');
  sim.tick(sim.fatigue);
  const wall = sim.attack();
  check(wall.result === 'wall' && sim.fatigue === 3, `contre le mur : ${wall.result}, fatigue ${sim.fatigue} ticks`);
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
  const swing = sim.attack();
  check(swing.result === 'doorHit' && sim.fatigue === 6, `Taillader la porte N0 (${door.x}, ${door.y}) : ${swing.result}, fatigue ${sim.fatigue} ticks`);
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('Rapier') };
  sim.tick(sim.fatigue);
  const jab = sim.attack();
  check(jab.result === 'door' && sim.state.tileAt(0, door.x, door.y).detail.open === false, `Piquer la porte : ${jab.result}, elle reste fermée`);
}

// 10. The other kinds of actions (docs/044).
{
  // Shoot: the Bow shoots the Arrow of the ready hand; without it, nothing flies.
  sim.reset();
  immortalOnce();
  const start = corridor(6);
  sim.teleport(start.level, start.x, start.y);
  while (sim.party.facing !== start.facing) sim.command('turnRight');
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('Bow') };
  const empty = sim.act(actionIndex('Shoot'));
  check(empty.result === 'noAmmo' && sim.projectilesOn(start.level).length === 0, `Tirer sans flèche : ${empty.result}`);
  sim.tick(sim.fatigue);
  sim.state.hands[0] = { kind: 'weapon', index: weaponIndex('Arrow') };
  const shot = sim.act(actionIndex('Shoot'));
  check(shot.result === 'shot' && !sim.hands[0] && sim.projectilesOn(start.level).length === 1, `Tirer avec une Arrow en main gauche : ${shot.result}, la flèche vole`);
}
{
  // Light (Yew Staff): magical light, one charge less.
  sim.reset();
  const index = weaponIndex('Yew Staff');
  sim.state.hands[1] = { kind: 'weapon', index };
  const charges = dungeon.data.weapons[index].charges;
  const before = sim.light.magical;
  const out = sim.act(actionIndex('Light'));
  check(out.result === 'light' && sim.light.magical > before && dungeon.data.weapons[index].charges === charges - 1, `Lumière : lumière magique ${before} → ${sim.light.magical}, charges ${charges} → ${dungeon.data.weapons[index].charges}`);
  sim.reset();
  check(dungeon.data.weapons[index].charges === charges, 'recommencer : les charges reviennent');
}
{
  // Heal (Snake Staff): health back for 2 mana a step (Heal level 2: 2 health a step).
  sim.reset();
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('Snake Staff') };
  sim.champion.health = 50;
  const out = sim.act(actionIndex('Heal'));
  check(out.result === 'healed' && out.healed === 10 && sim.champion.health === 60 && sim.champion.mana === 0, `Guérir : +${out.healed} PV, mana ${sim.champion.mana}`);
}
{
  // Flip (a coin), and a pending action (Fireshield of the Firestaff) that costs nothing.
  sim.reset();
  sim.state.hands[1] = { kind: 'miscellaneous', index: miscIndex('Copper Coin') };
  const flip = sim.act(actionIndex('Flip'));
  check(flip.result === 'heads' || flip.result === 'tails', `Pile ou face : ${flip.result}`);
  sim.tick(sim.fatigue);
  sim.champion.experience.Defend = 1e6; // Fireshield needs Defend 5
  sim.state.hands[1] = { kind: 'weapon', index: weaponIndex('The Firestaff') };
  const stamina = sim.champion.stamina;
  const pending = sim.act(actionIndex('Fireshield'));
  check(pending.result === 'pending' && sim.champion.stamina === stamina && sim.fatigue === 0, `Pare-feu : ${pending.result}, sans coût`);
}
{
  // Fireball (Flamitt), with the Fire skill raised to 7: a spell projectile, mana and a charge spent.
  sim.reset();
  immortalOnce();
  sim.champion.experience.Fire = 1e6;
  const index = weaponIndex('Flamitt');
  sim.state.hands[1] = { kind: 'weapon', index };
  const charges = dungeon.data.weapons[index].charges;
  const out = sim.act(actionIndex('Fireball'));
  const flying = sim.projectilesOn(sim.party.level);
  check(out.result === 'cast' && flying.length === 1 && flying[0].spell === 'fireball', `Boule de feu : ${out.result}, ${flying.length} projectile`);
  check(sim.champion.mana === 9 && dungeon.data.weapons[index].charges === charges - 1, `mana 10 → ${sim.champion.mana} (Fire niveau ≥ 6 : 1), charges ${charges} → ${dungeon.data.weapons[index].charges}`);
}
{
  // War Cry: a fright of 3 + Influence 2, so a draw of 0..4 against the fear resistance. The Trolin of
  // N2 (10, 20) (4) ends up fleeing; the Screamers (15) never do.
  sim.reset();
  immortalOnce();
  const screamers = sim.state.groupAt(1, 8, 24);
  faceGroup(screamers);
  check(sim.act(actionIndex('War Cry')).result === 'resisted', `Amort sur les Screamers (peur ${creatureInfo(screamers.type).fear}) : immunisés`);
  const group = sim.state.groupAt(2, 10, 20);
  faceGroup(group);
  const results = [];
  for (let i = 0; i < 30 && !results.includes('frightened'); i++) {
    sim.tick(sim.fatigue);
    results.push(sim.act(actionIndex('War Cry')).result);
  }
  check(results.includes('frightened') && group.fleeUntil > sim.time, `Amort sur le Trolin (peur ${creatureInfo(group.type).fear}) : ${results.length} cri(s), le groupe fuit`);
}
{
  // Climb Down (Rope): down the open pit N3 (7, 4) from the north, onto level 4.
  sim.reset();
  immortalOnce();
  sim.teleport(3, 7, 3);
  while (sim.party.facing !== 'S') sim.command('turnRight');
  sim.state.hands[1] = { kind: 'miscellaneous', index: miscIndex('Rope') };
  const out = sim.act(actionIndex('Climb Down'));
  check(out.result === 'climbed' && sim.party.level === 4, `Descendre à la corde : ${out.result}, niveau ${sim.party.level}`);
}

console.log(failures ? `${failures} échec(s)` : 'tout est bon');
process.exit(failures ? 1 : 0);
