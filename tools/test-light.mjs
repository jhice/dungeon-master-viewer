// Checks of phase H1 (docs/032): the light model of the simulation. The Hall (level 0) is
// always lit; elsewhere, torches in hand (weighted), wear every 512 ticks, a torch held by
// the cursor gives no light, magical light fading by steps.
// Run: node tools/test-light.mjs

import { readFileSync } from 'node:fs';
import { Dungeon } from '../src/core/dungeon.js';
import { createSimulation } from '../src/sim/simulation.js';
import { LIGHT_POWER_TO_AMOUNT, paletteOf, torchesLightAmount, TORCH } from '../src/sim/light.js';
import { describeItem } from '../src/core/contents.js';

const dungeon = new Dungeon(JSON.parse(readFileSync(new URL('../data/dungeon.json', import.meta.url))));
const sim = createSimulation(dungeon);
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};
const weapons = dungeon.data.weapons;
const torches = weapons.flatMap((w, index) => (w.type === TORCH ? [{ kind: 'weapon', index }] : [])).slice(0, 2);
const changes = [];
sim.on('lightChanged', (light) => changes.push(light));
// Places the party on the first tile of level 1 where it can stand.
const toLevel1 = () => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (!sim.teleport(1, x, y)) return;
};

// 1. Tables and palettes.
{
  check(LIGHT_POWER_TO_AMOUNT.length === 16 && LIGHT_POWER_TO_AMOUNT[15] === 100, 'table puissance → quantité : 16 valeurs, 100 au maximum');
  check([100, 99, 98, 75, 74, 50, 25, 24, 1, 0, -5].map(paletteOf).join() === '0,0,1,1,2,2,3,4,4,5,5', 'palettes : 99 / 75 / 50 / 25 / 1 / noir');
  check(torchesLightAmount([15]) === 100 && torchesLightAmount([15, 15]) === 150, 'une torche neuve : 100, deux : 100 + 50');
  check(torchesLightAmount([0, 8]) === 59 && torchesLightAmount([8, 15, 3]) === 100 + 29 + 6, 'tri par puissance, 100 % / 50 % / 25 % ; torche vide ignorée');
}

// 2. The Hall is lit; level 1 is black without a torch.
{
  sim.tick();
  check(sim.light.permanent && sim.light.amount === 100 && sim.light.palette === 0, 'niveau 0 : lumière permanente');
  toLevel1();
  check(sim.party.level === 1 && sim.light.amount === 0 && sim.light.palette === 5, `niveau 1 sans torche : noir (${sim.light.amount})`);
}

// 3. A torch in hand lights; held by the cursor it does not.
{
  sim.state.hand = torches[0];
  sim.swapHand(1); // the cursor's torch goes into the action hand
  const lit = sim.light;
  check(lit.amount === 100 && lit.palette === 0 && lit.torches.length === 1 && lit.torches[0].hand === 1, 'torche (15 charges) en main d’action : 100');
  check(weapons[torches[0].index].lit === true && describeItem(dungeon, torches[0]).note === '15 charges, allumée', 'la torche est allumée');
  check(changes.at(-1)?.amount === 100, 'événement lightChanged émis');
  sim.swapHand(1); // back to the cursor
  check(sim.light.amount === 0 && weapons[torches[0].index].lit === false, 'au curseur : pas de lumière, torche éteinte');
}

// 4. Wear: a charge every 512 ticks, in hand only; two torches weighted.
{
  sim.state.hand = torches[0];
  sim.swapHand(0);
  const before = weapons[torches[0].index].charges;
  sim.tick(512 - (sim.time % 512)); // to the next multiple of 512
  check(weapons[torches[0].index].charges === before - 1, `usure : ${before} → ${weapons[torches[0].index].charges} charges`);
  check(sim.light.amount === LIGHT_POWER_TO_AMOUNT[14], `lumière d’une torche à 14 charges : ${sim.light.amount}`);
  sim.state.hand = torches[1];
  sim.tick(512);
  check(weapons[torches[1].index].charges === 15, 'la torche au curseur ne s’use pas');
  sim.swapHand(1);
  check(sim.light.amount === 100 + (LIGHT_POWER_TO_AMOUNT[13] >> 1), `deux torches (15 et 13) : ${sim.light.amount}`);
  weapons[torches[0].index].charges = 1;
  sim.tick(512);
  check(weapons[torches[0].index].charges === 0 && describeItem(dungeon, torches[0]).note === 'consumée', 'torche à 0 charge : consumée');
  check(sim.light.amount === LIGHT_POWER_TO_AMOUNT[14], 'une torche consumée n’éclaire plus');
}

// 5. Magical light: power p for its duration, then one step less every 4 ticks.
{
  sim.reset();
  toLevel1();
  sim.addMagicalLight(3, 100);
  check(sim.light.magical === 24 && sim.light.amount === 24, 'lumière magique de puissance 3 : 24');
  sim.tick(100);
  check(sim.light.magical === 12, `après sa durée : un cran de moins (${sim.light.magical})`);
  sim.tick(4);
  check(sim.light.magical === 5, `4 ticks plus tard : ${sim.light.magical}`);
  sim.tick(4);
  check(sim.light.magical === 0, 'puis éteinte');
  sim.addMagicalLight(-2, 50); // Darkness
  check(sim.light.magical === -12 && sim.light.palette === 5, 'obscurité : lumière négative, noir');
  sim.tick(58);
  check(sim.light.magical === 0, 'l’obscurité se lève par crans');
}

// 6. Reset: charges and lit restored.
{
  sim.state.hand = torches[0];
  sim.swapHand(1);
  sim.reset();
  check(weapons[torches[0].index].charges === 15 && !weapons[torches[0].index].lit, 'reset : torches neuves et éteintes');
}

console.log(failures ? `\n${failures} échec(s)` : '\nTout est bon');
process.exit(failures ? 1 : 0);
