// Checks of phase G3 (docs/033): the spells Open Door, Fireball and Torch. Energy and range of
// a spell projectile, a door with a button toggled, a door broken by a fireball, a creature
// burnt, the party burnt by its own fireball against a wall, the magical light of Torch.
// Run: node tools/test-magic.mjs

import { readFileSync } from 'node:fs';
import { Dungeon, SIDE_DELTAS } from '../src/core/dungeon.js';
import { createSimulation } from '../src/sim/simulation.js';
import { SYMBOLS, SPELLS } from '../src/core/spell-info.js';
import { LIGHT_POWER_TO_AMOUNT } from '../src/sim/light.js';
import { doorStep } from '../src/core/tile-states.js';

const dungeon = new Dungeon(JSON.parse(readFileSync(new URL('../data/dungeon.json', import.meta.url))));
const sim = createSimulation(dungeon);
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};
const cast = (line) => {
  sim.tick(sim.fatigue);
  line.split(' ').forEach((name, step) => sim.addSymbol(SYMBOLS[step].indexOf(name)));
  return sim.castSpell();
};
const face = (facing) => {
  while (sim.party.facing !== facing) sim.command('turnRight');
};
// Places the party on a free floor tile next to (x, y), facing it; false if there is none.
function faceTile(level, x, y) {
  for (const [facing, [dx, dy]] of Object.entries(SIDE_DELTAS)) {
    const [fx, fy] = [x - dx, y - dy];
    if (dungeon.tileAt(level, fx, fy)?.type !== 'floor' || sim.state.groupAt(level, fx, fy)) continue;
    if (sim.teleport(level, fx, fy)) continue;
    face(facing);
    return true;
  }
  return false;
}
// Places the party on the first tile of level 1 where it can stand.
const toLevel1 = () => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (!sim.teleport(1, x, y)) return;
};
const doorDetail = (level, x, y) => sim.state.tileAt(level, x, y).detail;
const immortal = () => Object.assign(sim.champion, { health: 1e6, maxHealth: 1e6 });

// 1. Energy of a spell projectile (F412, F327), with Zed's skills (Fire 1, Air 2) and 10 mana.
{
  const spell = (name) => SPELLS.find((s) => s.name === name);
  // Open Door: Air 2 doubled = 4 → (1 + 2) × (4 + 8) = 36; step loss 10 − 10 / 8 = 9 (range: § 2).
  check(cast('Lo Zo').reason === 'cast', 'Lo Zo : lancé');
  const flying = sim.projectilesOn(sim.party.level);
  check(flying.length === 1 && flying[0].spell === 'openDoor' && !flying[0].item, 'un projectile magique Open Door, sans objet');
  sim.reset();
  check(spell('Fireball').effect === 'fireball' && spell('Open Door').effect === 'openDoor', 'effets des sorts');
}

// 2. Range: 36 energy, 9 a step, first step free → it vanishes 2 tiles ahead; nothing falls.
{
  sim.reset();
  immortal();
  // A floor tile of level 1 with 3 free floor tiles ahead.
  let found = null;
  for (let y = 1; y < 31 && !found; y++) {
    for (let x = 1; x < 31 && !found; x++) {
      for (const [facing, [dx, dy]] of Object.entries(SIDE_DELTAS)) {
        const run = [0, 1, 2, 3].every((k) => dungeon.tileAt(1, x + k * dx, y + k * dy)?.type === 'floor' && !sim.state.groupAt(1, x + k * dx, y + k * dy));
        if (run && !sim.teleport(1, x, y)) {
          face(facing);
          found = { x, y, dx, dy };
          break;
        }
      }
    }
  }
  cast('Lo Zo');
  let furthest = 0;
  for (let i = 0; i < 10 && sim.projectilesOn(1).length; i++) {
    sim.tick();
    for (const p of sim.projectilesOn(1)) furthest = Math.max(furthest, Math.abs(p.x - found.x) + Math.abs(p.y - found.y));
  }
  check(!sim.projectilesOn(1).length && furthest === 2, `Lo Zo s’éteint à ${furthest} cases`);
}

// 3. Open Door on the door (1, 0) of level 1 (button): it opens; again: it closes.
{
  sim.reset();
  immortal();
  check(faceTile(1, 1, 0), `groupe face à la porte (1, 0) du niveau 1, depuis (${sim.party.x}, ${sim.party.y})`);
  const before = doorStep(doorDetail(1, 1, 0));
  cast('Lo Zo');
  sim.tick(10);
  check(before === 4 && doorStep(doorDetail(1, 1, 0)) === 0, `Lo Zo ouvre la porte (cran ${before} → ${doorStep(doorDetail(1, 1, 0))})`);
  cast('Lo Zo');
  sim.tick(10);
  check(doorStep(doorDetail(1, 1, 0)) === 4, 'un second Lo Zo la referme (la porte ouverte est traversée puis actionnée)');
}

// 4. Open Door on a door without a button: nothing.
{
  sim.reset();
  immortal();
  const door = dungeon.data.doors.find((d) => !d.button && d.at.map === 1 && !doorDetail(1, d.at.x, d.at.y).open && faceTile(1, d.at.x, d.at.y));
  cast('Lo Zo');
  sim.tick(10);
  check(door && doorStep(doorDetail(1, door.at.x, door.at.y)) === 4, `porte sans bouton (${door?.at.x}, ${door?.at.y}) : reste fermée`);
}

// 5. Fireball on a closed wooden door that fireballs break: Zed (Fire 1) is too weak; a strong caster breaks it.
{
  sim.reset();
  immortal();
  const broken = [];
  sim.on('doorBroken', (e) => broken.push(e));
  check(faceTile(1, 11, 0) || faceTile(1, 29, 27), 'groupe face à une porte que la boule de feu casse');
  const [x, y] = [sim.party.x + SIDE_DELTAS[sim.party.facing][0], sim.party.y + SIDE_DELTAS[sim.party.facing][1]];
  cast('Mon Ful Ir');
  sim.tick(10);
  check(!doorDetail(1, x, y).broken, 'Mon Ful Ir de Zed (Feu 1, énergie 48) : explosion de 21 à 40, sous la défense 42 du bois');
  sim.champion.skills.Fire = 6; // energy (6 + 2) × (4 + 12) = 128 → explosion 65 to 129
  cast('Mon Ful Ir');
  sim.tick(10);
  check(doorDetail(1, x, y).broken && broken.length === 1, 'avec Feu 6 : la porte vole en éclats');
}

// 6. Fireball on a creature: wounds it, and the explosion burns the group.
{
  sim.reset();
  immortal();
  const hits = [];
  sim.on('creatureHit', (e) => e.spell && hits.push(e));
  const group = [...dungeon.data.creatures.keys()]
    .map((id) => sim.state.groupAt(dungeon.data.creatures[id].at.map, dungeon.data.creatures[id].at.x, dungeon.data.creatures[id].at.y))
    .find((g) => g && g.type === 12 && faceTile(g.level, g.x, g.y)); // a Skeleton (fire resistance 6)
  const before = group.members.reduce((sum, m) => sum + m.hp, 0);
  sim.champion.skills.Fire = 4;
  cast('Ee Ful Ir');
  sim.tick(4);
  const after = group.members.reduce((sum, m) => sum + m.hp, 0);
  check(hits.length > 0 && (after < before || hits.some((h) => h.killed)), `Skeleton au niveau ${group.level} : ${hits.length} blessure(s), PV ${before} → ${after}`);
}

// 7. Fireball against a wall right in front: it explodes on the party's tile.
{
  sim.reset();
  Object.assign(sim.champion, { health: 500, maxHealth: 500 });
  let spot = null;
  for (let y = 1; y < 31 && !spot; y++) {
    for (let x = 1; x < 31 && !spot; x++) {
      if (dungeon.tileAt(1, x, y)?.type !== 'floor' || dungeon.tileAt(1, x, y - 1)?.type !== 'wall' || sim.teleport(1, x, y)) continue;
      spot = { x, y };
    }
  }
  face('N');
  const burns = [];
  sim.on('championHit', (e) => e.spell && burns.push(e.damage));
  cast('Lo Ful Ir');
  sim.tick(3);
  check(burns.length === 1 && sim.champion.health === 500 - burns[0], `boule de feu contre le mur d’en face : le groupe brûle (${burns[0]} PV)`);
}

// 8. Torch: magical light of power p + 2 for 2000 + ((4(p + 1) − 3) << 7) ticks, then fading.
{
  sim.reset();
  toLevel1();
  cast('Lo Ful');
  check(sim.light.magical === LIGHT_POWER_TO_AMOUNT[3] && sim.light.amount === 24, `Lo Ful : lumière magique ${sim.light.magical} (puissance 3)`);
  sim.tick(2640); // its duration: 2000 + ((8 − 3) << 7)
  check(sim.light.magical === LIGHT_POWER_TO_AMOUNT[2], `après 2640 ticks : un cran de moins (${sim.light.magical})`);
  sim.tick(8);
  check(sim.light.magical === 0, 'puis éteinte en 8 ticks');
  cast('Mon Ful');
  check(sim.light.magical === LIGHT_POWER_TO_AMOUNT[8], `Mon Ful : ${sim.light.magical} (puissance 8)`);
}

console.log(failures ? `\n${failures} échec(s)` : '\nTout est bon');
process.exit(failures ? 1 : 0);
