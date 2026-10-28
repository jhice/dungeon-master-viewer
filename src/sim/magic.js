// Spells that act in the dungeon (phase G3, docs/033): Open Door and Fireball fly as projectiles
// (projectiles.js), Torch adds magical light (light.js).
// ReDMCSB: F412 (MENUS.C, energy and light), F327 (CHAMPION.C, step loss), F216 / F217 / F213 / F220
// (PROJEXPL.C, impacts and explosions), F232 (GROUP2.C, doors destroyed), F191 (GROUP1.C).
// Door defences: G0254_DoorInfo of graphics.dat (item 559), as in the DM engine of ScummVM.

import { SKILLS } from '../core/spell-info.js';
import { creatureInfo } from '../core/creature-info.js';
import { DOOR_CLOSED, doorStep } from '../core/tile-states.js';

const DOOR_DEFENSE = { Porticullis: 110, Wooden: 42, Iron: 230, Ra: 255 };
const SPELL_ATTACK = 90; // attack of a spell projectile when cast (F327)
const FIRE_IMMUNE = 15;
const BLACK_FLAME = 11;
const MAX_HEALTH = 1000;

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 * @param {ReturnType<import('./state.js').createState>} state
 * @param {ReturnType<import('./clock.js').createClock>} clock
 * @param {object} hooks
 * @param {(type: string, payload: object) => void} hooks.emit 'explosion', 'doorBroken'
 * @param {() => object} hooks.party
 * @param {() => object} hooks.champion
 * @param {() => () => number} hooks.random the simulation's random draw (0 ≤ r < 1)
 * @param {object} hooks.logic doorAt, toggleDoor, breakDoor (logic.js)
 * @param {object} hooks.projectiles launch (projectiles.js)
 * @param {object} hooks.light addMagical (light.js)
 * @param {(damage: number) => void} hooks.hurtChampion
 * @param {(group, member, damage: number) => boolean} hooks.hurtCreature returns true if the group is gone
 * @param {(group) => void} hooks.provoke a creature group survived a spell
 */
export function createMagic(dungeon, state, clock, hooks) {
  const { emit, party, champion, logic, projectiles, light } = hooks;
  const rnd = (n) => Math.floor(hooks.random()() * n); // 0..n-1, M02 / M03 of the engine

  /**
   * Energy of a projectile spell (F412): bounded(21, (power + 2) × (4 + 2 × skill), 255), the skill
   * of Open Door doubled; then the step loss of the caster (F327): 10 − min(8, max mana / 8), and a
   * weak spell gets 3 more energy and loses 1 less a step.
   */
  function projectileEnergy(caster, spell, power) {
    let skill = Math.max(1, caster.skills[SKILLS[spell.skill]] ?? 0);
    if (spell.effect === 'openDoor') skill <<= 1;
    let energy = Math.min(255, Math.max(21, (power + 2) * (4 + (skill << 1))));
    let stepLoss = 10 - Math.min(8, caster.maxMana >> 3);
    if (energy < stepLoss << 2) {
      energy += 3;
      stepLoss--;
    }
    return { energy, stepLoss };
  }

  /** Casts a projectile spell (Open Door, Fireball) in front of the party, from its right side. */
  function launch(spell, power) {
    const p = party();
    return projectiles.launch({ spell: spell.effect, attack: SPELL_ATTACK, level: p.level, x: p.x, y: p.y, direction: p.facing, side: 'right', ...projectileEnergy(champion(), spell, power) });
  }

  /** The Torch spell (F412): magical light of power p + 2 for 2000 + ((4(p + 1) − 3) << 7) ticks. */
  function torch(power) {
    const spellPower = (power + 1) << 2;
    light.addMagical((spellPower >> 2) + 1, 2000 + ((spellPower - 3) << 7));
  }

  // Attack of a fireball meeting a door or a creature (F216).
  function impactAttack(p) {
    let attack = rnd(16) + rnd(16) + 10;
    attack = ((attack + p.energy) >> 4) + 1;
    attack += rnd((attack >> 1) + 1) + rnd(4);
    return Math.max(attack >> 1, attack - (32 - (p.attack >> 3)));
  }

  // Attack of an explosion (F213, F220): (energy / 2 + 1), plus as much again at most.
  function explosionAttack(energy) {
    const attack = (energy >> 1) + 1;
    return attack + rnd(attack) + 1;
  }

  // F232: a closed door of a destructible kind gives way to an attack at least equal to its defence.
  function attackDoor(level, x, y, attack, magic) {
    const door = logic.doorAt(level, x, y);
    const detail = state.tileAt(level, x, y)?.detail;
    if (!door || !detail || detail.broken || !(magic ? door.fireball : door.force)) return false;
    if (attack < (DOOR_DEFENSE[dungeon.level(level).doorTypes[door.type]] ?? Infinity) || doorStep(detail) !== DOOR_CLOSED) return false;
    logic.breakDoor(level, x, y);
    emit('doorBroken', { level, x, y, by: 'fireball' });
    return true;
  }

  /**
   * A fireball explodes on a tile (F213): it burns the party standing there, or else every creature
   * of the group there (fire resistance, non-material ones a quarter); a tick later, a door of the
   * tile may break (F220).
   */
  function explode(level, x, y, energy) {
    emit('explosion', { level, x, y, spell: 'fireball' });
    let attack = explosionAttack(energy);
    const p = party();
    if (p.level === level && p.x === x && p.y === y) hooks.hurtChampion(attack);
    else {
      const group = state.groupAt(level, x, y);
      const info = group && creatureInfo(group.type);
      if (info && info.fireResistance !== FIRE_IMMUNE) {
        if (info.nonMaterial) attack >>= 2;
        attack -= rnd((info.fireResistance << 1) + 1);
        if (attack > 0) burnAll(group, attack);
      }
    }
    if (state.tileAt(level, x, y)?.type === 'door') clock.schedule(1, () => attackDoor(level, x, y, explosionAttack(energy), true));
  }

  // F191: every creature of the group takes the attack, less up to an eighth, plus a random part.
  function burnAll(group, attack) {
    const spread = (attack >> 3) + 1;
    attack -= spread;
    let gone = false;
    for (const member of [...group.members]) gone = hooks.hurtCreature(group, member, attack + rnd(spread << 1)) || gone;
    if (!gone) hooks.provoke(group);
  }

  /**
   * A spell projectile meets the door of its tile, or the wall in front of it (F217): Open Door
   * toggles a door with a button (open or closed), the next tick; Fireball goes through a door
   * open at least to 3/4, else hits it (a door breakable by force may give way) and explodes.
   * On a wall, a fireball explodes on its own tile. Returns true if the projectile stops.
   */
  function impact(p, target) {
    if (target === 'door') {
      const detail = state.tileAt(p.level, p.x, p.y).detail;
      if (p.spell === 'openDoor') {
        if (!detail.broken && logic.doorAt(p.level, p.x, p.y)?.button) clock.schedule(1, () => logic.toggleDoor(p.level, p.x, p.y));
        return true;
      }
      if (detail.broken || doorStep(detail) <= 1) return false;
      const attack = impactAttack(p) + 1;
      attackDoor(p.level, p.x, p.y, attack + rnd(attack), false);
    }
    if (p.spell === 'fireball') explode(p.level, p.x, p.y, p.energy);
    return true;
  }

  /**
   * A spell projectile reaches a creature group (F217): a fireball heals a Black Flame; non-material
   * creatures let spells through; Open Door does no harm; a fireball wounds one creature
   * ((attack × 64) / defence), then explodes on the tile. Returns true if the projectile stops.
   */
  function hitGroup(p, group) {
    const info = creatureInfo(group.type);
    const member = group.members[rnd(group.members.length)];
    if (p.spell === 'fireball' && group.type === BLACK_FLAME) {
      member.hp = Math.min(MAX_HEALTH, member.hp + impactAttack(p));
      return true;
    }
    if (info.nonMaterial) return false;
    if (p.spell === 'fireball') {
      const damage = info.defense ? Math.floor((impactAttack(p) << 6) / info.defense) : 0;
      const gone = damage > 0 && hooks.hurtCreature(group, member, damage);
      if (!gone && state.groupAt(group.level, group.x, group.y) === group) hooks.provoke(group);
      explode(p.level, p.x, p.y, p.energy);
    }
    return true;
  }

  return { launch, torch, impact, hitGroup, projectileEnergy };
}
