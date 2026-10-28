// The party's champion (phase C3, docs/023): a single one, Zed, Duke of Banville,
// taken from his sheet in the Hall of Champions (a text of the dungeon, decoded in
// docs/010). Stamina is kept as the engine does, ×10 (60 shown = 600 stored).
// Regeneration is provisional (docs/023 § 3).

import { decodeChampion } from '../core/texts.js';

export const DEFAULT_CHAMPION = 'ZED';
// Wall actuator "Champion portrait" (type 127): the mirror of a champion, where his items lie.
const PORTRAIT = 127;

// Regeneration, in ticks: 1 health point, 1 mana point; stamina regains 1 stored point a tick.
const HEALTH_EVERY = 30;
const MANA_EVERY = 60;

/**
 * Creates the champion from his sheet: { name, title, health, maxHealth, stamina,
 * maxStamina (×10), mana, maxMana, strength, dexterity, wisdom, vitality, antiMagic,
 * antiFire, luck, skills, readyAt, symbols, dead }.
 */
export function createChampion(dungeon, name = DEFAULT_CHAMPION) {
  const text = dungeon.data.texts.find((t) => t.text.split('\n')[0] === name);
  const sheet = text && decodeChampion(text.text);
  if (!sheet) throw new Error(`Champion inconnu : ${name}`);
  const [luck, strength, dexterity, wisdom, vitality, antiMagic, antiFire] = sheet.attributes.map((a) => a.value);
  return {
    name: sheet.name,
    title: sheet.title,
    health: sheet.health,
    maxHealth: sheet.health,
    stamina: sheet.stamina * 10,
    maxStamina: sheet.stamina * 10,
    mana: sheet.mana,
    maxMana: sheet.mana,
    luck,
    strength,
    dexterity,
    wisdom,
    vitality,
    antiMagic,
    antiFire,
    skills: Object.fromEntries(sheet.classes.flatMap((c) => c.skills.map((s) => [s.skill, s.level]))),
    readyAt: 0, // tick from which he can act again (fatigue of the last action)
    symbols: [], // spell being composed: symbol indices per step, the power first (spells.js)
    dead: false,
  };
}

/**
 * Disables the action hand for `ticks` (F330_CHAMPION_DisableAction): if it is already
 * disabled, the two delays add up partly (half of the shorter one is added to the longer one).
 */
export function disableAction(champion, now, ticks) {
  let until = now + ticks;
  if (champion.readyAt > now) {
    until = until >= champion.readyAt ? until + ((champion.readyAt - now) >> 1) : champion.readyAt + (ticks >> 1);
  }
  champion.readyAt = until;
}

/** Tile of the champion's mirror in the Hall (his items lie there), or null. */
export function championMirror(dungeon, name = DEFAULT_CHAMPION) {
  const wanted = name.toLowerCase();
  const a = dungeon.data.actuators.find(
    (a) => a.kind === 'wall' && a.type === PORTRAIT && a.dataNote?.toLowerCase().endsWith(`: ${wanted}`),
  );
  return a ? { level: a.at.map, x: a.at.x, y: a.at.y } : null;
}

/** One tick of regeneration; returns true if a value changed. */
export function regenerate(champion, now) {
  if (champion.dead) return false;
  let changed = false;
  if (champion.stamina < champion.maxStamina) {
    champion.stamina++;
    changed = champion.stamina % 10 === 0; // shown value changed
  }
  if (now % HEALTH_EVERY === 0 && champion.health < champion.maxHealth) {
    champion.health++;
    changed = true;
  }
  if (now % MANA_EVERY === 0 && champion.mana < champion.maxMana) {
    champion.mana++;
    changed = true;
  }
  return changed;
}
