// Checks of phase G1 (docs/030): composing a line of spell symbols, deleting, recognising
// the 25 spells of DM whatever the power, meaningless spells, the line emptied after a cast,
// the fatigue of a spell, the mana costs of the Encyclopaedia, the 24 glyphs.
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
      if (result?.spell === spell && result.power === SYMBOLS[0].indexOf(power) + 1 && !sim.symbols.length) recognised++;
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

console.log(failures ? `\n${failures} échec(s)` : '\nTout est bon');
process.exit(failures ? 1 : 0);
