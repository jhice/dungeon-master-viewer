// Checks of phases G1 and G2 (docs/030, 031): composing a line of spell symbols, deleting,
// recognising the 25 spells of DM whatever the power, meaningless spells, the line emptied
// after a cast, the fatigue of a spell, the mana costs of the Encyclopaedia, the 24 glyphs;
// potion spells and empty flasks, drinking potions.
// Run: node tools/test-spells.mjs

import { readFileSync } from 'node:fs';
import { Dungeon } from '../src/core/dungeon.js';
import { createSimulation } from '../src/sim/simulation.js';
import { SYMBOLS, SPELLS, findSpell, spellManaCost } from '../src/core/spell-info.js';
import { GLYPHS } from '../src/core/spell-glyphs.js';

const dungeon = new Dungeon(JSON.parse(readFileSync(new URL('../data/dungeon.json', import.meta.url))));
const sim = createSimulation(dungeon);
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};
// Indices of a line of symbol names ("Lo Ful"): each name in the row of its step.
const indices = (line) => line.split(' ').map((name, step) => SYMBOLS[step].indexOf(name));
const compose = (line) => indices(line).every((i) => sim.addSymbol(i));
const clearLine = () => {
  while (sim.deleteSymbol());
};
const potions = dungeon.data.potions;
// The first empty flasks of dungeon.json, as item references.
const flasks = potions.flatMap((p, index) => (p.type === 20 ? [{ kind: 'potion', index }] : [])).slice(0, 2);
const events = [];
sim.on('spellCast', (e) => events.push(e));

// 1. Composing and deleting.
{
  check(compose('Lo Ful') && sim.symbols.join() === '0,3', 'Lo Ful : symboles [0, 3]');
  check(sim.deleteSymbol() && sim.symbols.join() === '0', 'la flèche efface Ful');
  check(sim.deleteSymbol() && sim.symbols.length === 0, 'puis Lo');
  check(!sim.deleteSymbol(), 'ligne vide : rien à effacer');
  check(compose('Mon Zo Kath Ra') && !sim.addSymbol(0), '4 symboles : la ligne est pleine');
  sim.deleteSymbol();
  check(sim.addSymbol(4) && sim.symbols.join() === '5,5,2,4', 'après effacement, le 4e symbole se rechoisit');
  sim.castSpell();
}

// 2. Recognition: the 25 spells at every power, and the line emptied.
{
  check(SPELLS.length === 25, `${SPELLS.length} sorts`);
  let recognised = 0;
  for (const spell of SPELLS) {
    for (const power of SYMBOLS[0]) {
      sim.tick(100); // fatigue gone
      compose(`${power} ${spell.symbols.join(' ')}`);
      const result = sim.castSpell();
      // Without a flask, a potion spell keeps its symbols (G2).
      const kept = spell.kind === 'potion' ? sim.symbols.length === spell.symbols.length + 1 : !sim.symbols.length;
      if (result?.spell === spell && result.power === SYMBOLS[0].indexOf(power) + 1 && kept) recognised++;
      clearLine();
    }
  }
  check(recognised === 25 * 6, `sorts reconnus à toutes les puissances : ${recognised} / 150`);
  check(new Set(SPELLS.map((s) => s.symbols.join())).size === 25, 'aucun sort en double');
}

// 3. The end criterion, meaningless spells, nothing to cast.
{
  sim.tick(100);
  compose('Lo Ful');
  const torch = sim.castSpell();
  check(torch.spell?.name === 'Torch' && torch.reason === 'noEffect', `Lo Ful → ${torch.spell?.name} (${torch.reason})`);
  check(events.at(-1).spell?.name === 'Torch', 'événement spellCast émis');
  compose('Lo Ya Ven');
  const meaningless = sim.castSpell();
  check(meaningless.spell === null && meaningless.reason === 'meaningless' && !sim.symbols.length, 'Lo Ya Ven : sort incompréhensible, ligne vidée');
  compose('Pal');
  check(sim.castSpell()?.reason === 'meaningless', 'une puissance seule : sort incompréhensible');
  check(sim.castSpell() === null, 'ligne vide : rien à lancer');
  compose('On Des Ir Sar');
  check(sim.castSpell().reason === 'unimplemented', 'Darkness : reconnu, pas encore implémenté');
  check(findSpell(indices('Lo Ful Ir'))?.name === 'Fireball' && findSpell(indices('Lo Ir')) === null, 'Ful Ir = Fireball ; Ir seul n’est pas un sort');
}

// 4. Fatigue (F330): the action hand is disabled; a second cast extends it by half.
{
  sim.reset();
  compose('Lo Ful');
  sim.castSpell();
  check(sim.fatigue === 15, `fatigue de Torch : ${sim.fatigue} ticks`);
  compose('Lo Ful Ir');
  sim.castSpell();
  check(sim.fatigue === 42 + 7, `Fireball juste après : ${sim.fatigue} ticks (42 + 15 / 2)`);
  sim.tick(49);
  compose('Lo Ya Ven');
  sim.castSpell();
  check(sim.fatigue === 0, 'un sort incompréhensible ne fatigue pas');
}

// 5. Mana costs of the Encyclopaedia (whole line, power included), stored for later.
{
  const costs = { 'Lo Vi': 4, 'Mon Vi': 16, 'Lo Zo Bro Ra': 21, 'Mon Zo Bro Ra': 75, 'Ee Ful Ir': 33, 'Pal Oh Ew Sar': 53, 'Um Zo Kath Ra': 30 };
  const wrong = Object.entries(costs).filter(([line, cost]) => spellManaCost(indices(line)) !== cost);
  check(!wrong.length, `coûts en mana : ${wrong.length ? wrong.map(([l]) => l).join(', ') : 'conformes'}`);
}

// 6. Dead champion: the spell area does nothing; the 24 glyphs are 7 × 7.
{
  sim.champion.dead = true;
  check(!sim.addSymbol(0) && sim.castSpell() === null, 'champion mort : aucun symbole');
  sim.reset();
  const glyphs = SYMBOLS.flat().map((name) => GLYPHS[name]);
  check(glyphs.every((g) => g?.length === 7 && g.every((row) => /^[.#]{7}$/.test(row))), '24 glyphes de 7 × 7');
}

// 7. G2: a potion spell needs an empty flask in hand, action hand first.
{
  sim.reset();
  compose('On Vi');
  const none = sim.castSpell();
  check(none.reason === 'needsFlask' && sim.symbols.length === 2 && sim.fatigue === 0, 'On Vi sans flasque : symboles gardés, pas de fatigue');
  sim.state.hands[0] = flasks[0];
  sim.state.hands[1] = flasks[1];
  const vi = sim.castSpell();
  const filled = potions[flasks[1].index];
  check(vi.reason === 'potion' && vi.item === flasks[1] && !sim.symbols.length, 'la flasque de la main d’action est remplie, ligne vidée');
  check(filled.type === 14 && filled.name === 'Vi Potion' && filled.power >= 120 && filled.power < 136, `Vi Potion, puissance ${filled.power} (On : 120 à 135)`);
  check(sim.fatigue === 32, `fatigue : ${sim.fatigue} ticks`);
  sim.tick(32);
  compose('Mon Zo Ven');
  sim.castSpell();
  const ven = potions[flasks[0].index];
  check(ven.type === 3 && ven.name === 'Ven Potion' && ven.power >= 240 && ven.power < 256, `Zo Ven (magicien) dans la main de réserve : Ven Potion, puissance ${ven.power}`);
  sim.tick(30);
  compose('Lo Ya');
  check(sim.castSpell().reason === 'needsFlask', 'deux mains pleines de potions : plus de flasque vide');
  clearLine();
  // Every potion spell, at the lowest and highest power.
  let ok = 0;
  for (const spell of SPELLS.filter((s) => s.kind === 'potion')) {
    for (const power of ['Lo', 'Mon']) {
      Object.assign(potions[flasks[1].index], { type: 20, name: 'Empty Flask', power: 0 });
      sim.tick(100);
      compose(`${power} ${spell.symbols.join(' ')}`);
      sim.castSpell();
      const p = potions[flasks[1].index];
      const base = power === 'Lo' ? 40 : 240;
      if (p.type === spell.type && p.name === spell.potion && p.power >= base && p.power < base + 16) ok++;
    }
  }
  check(ok === 20, `10 sorts de potion aux puissances Lo et Mon : ${ok} / 20`);
  sim.reset();
  check(potions[flasks[0].index].type === 20 && potions[flasks[1].index].power === 0, 'reset : les flasques redeviennent vides');
}

// 8. G2: drinking the potion held by the cursor; the flask stays in hand, empty.
{
  sim.reset();
  const c = sim.champion;
  sim.state.hands[1] = flasks[0];
  compose('Mon Vi');
  sim.castSpell();
  check(sim.drink() === null, 'rien au curseur : rien à boire');
  sim.state.hand = flasks[0];
  sim.state.hands[1] = null;
  c.health = 10;
  const power = potions[flasks[0].index].power;
  const drunk = sim.drink();
  // F349: counter = ((511 - power) / (32 + (power + 1) / 8)) / 2, health + max / counter.
  const counter = Math.floor(Math.floor((511 - power) / (32 + Math.floor((power + 1) / 8))) / 2);
  check(drunk.effect === 'health' && c.health === 10 + Math.floor(60 / counter), `Vi Potion (${power}) : +${drunk.gained} PV`);
  check(sim.hand === flasks[0] && potions[flasks[0].index].type === 20, 'la flasque reste au curseur, vide');
  check(sim.drink() === null, 'une flasque vide ne se boit pas');
  // Ma (stamina) and Ee (mana), made by hand with a known power: Ma 40 → counter 6;
  // Ee 255 → 18 + 10 = 28 mana, over the maximum (10) by 18, of which half is lost.
  Object.assign(potions[flasks[0].index], { type: 11, name: 'Ma Potion', power: 40 });
  c.stamina = 100;
  const ma = sim.drink();
  check(ma.effect === 'stamina' && c.stamina === 100 + Math.floor(600 / 6), `Ma Potion (40) : endurance ${c.stamina / 10}`);
  Object.assign(potions[flasks[0].index], { type: 13, name: 'Ee Potion', power: 255 });
  c.mana = 0;
  const ee = sim.drink();
  check(ee.effect === 'mana' && c.mana === 28 - ((28 - 10) >> 1), `Ee Potion (255) : mana ${c.mana} (au-delà du maximum, à moitié)`);
  Object.assign(potions[flasks[0].index], { type: 7, name: 'Ku Potion', power: 100 });
  const ku = sim.drink();
  check(ku.effect === null && ku.name === 'Ku Potion' && potions[flasks[0].index].type === 20, 'Ku Potion : bue sans effet (pas encore implémentée)');
  sim.reset();
}

console.log(failures ? `\n${failures} échec(s)` : '\nTout est bon');
process.exit(failures ? 1 : 0);
