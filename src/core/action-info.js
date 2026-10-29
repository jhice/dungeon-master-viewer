// The 44 actions of DM (graphics.dat item 560) and what each one does (docs/044).
// Source: Dungeon Master Encyclopaedia, "Actions and Combos" (values of DM 1.2 and later,
// Amiga 2.0: column (c)); the effect of each action is that of ReDMCSB F407 (MENUS.C).
//
// An action: { index, name (English, the key), label (French, DM 1.3), skill, stamina, hitProbability
// (0..75), damage (1/32), fatigue (ticks), kind, ... }. `kind` says what F407 does with it:
//   melee     a strike on the group in front (F402); `breaksDoors`: on a closed door, an attack of
//             the door instead (F232), with a fatigue of 6
//   throw     the item of the action hand is thrown
//   shoot     the ammunition of the ready hand is shot by the bow or sling of the action hand
//   spell     a spell projectile (`spell`, `energy`), paid with mana (F327)
//   fright    the group in front may flee (F401), `fright` + the Influence skill level
//   light     magical light (F404)
//   heal      the champion heals himself with his mana
//   flip      heads or tails
//   climb     the rope: climb down a pit in front
//   defend    nothing but its fatigue (Block, Hit: DM does nothing else with them)
//   pending   not done yet (freeze, shields, fluxcage, fuse, window, lightning, dispell)

// Skills by index (ReDMCSB C00..C19): 4 base skills, then 4 hidden skills for each.
export const SKILLS = ['Fighter', 'Ninja', 'Priest', 'Wizard', 'Swing', 'Thrust', 'Club', 'Parry', 'Steal', 'Fight', 'Throw', 'Shoot', 'Identify', 'Heal', 'Influence', 'Defend', 'Fire', 'Air', 'Earth', 'Water'];

// prettier-ignore
const TABLE = [
  // index, name, label, skill, stamina, hit probability, damage, fatigue, kind
  [0, 'N', 'N', 0, 0, 0, 0, 0, 'defend'],
  [1, 'Block', 'Fendre', 7, 4, 22, 15, 6, 'defend'],
  [2, 'Chop', 'Entailler', 6, 10, 48, 48, 8, 'melee'],
  [3, 'X', 'X', 0, 0, 0, 0, 0, 'defend'],
  [4, 'Blow Horn', 'Sonner fort', 14, 1, 0, 0, 6, 'fright'],
  [5, 'Flip', 'Pile ou face', 12, 0, 0, 0, 3, 'flip'],
  [6, 'Punch', 'Cogner', 9, 1, 38, 32, 1, 'melee'],
  [7, 'Kick', 'Coup de pied', 9, 3, 28, 48, 5, 'melee'],
  [8, 'War Cry', 'Amort', 7, 1, 0, 0, 3, 'fright'],
  [9, 'Stab', 'Poignarder', 9, 3, 30, 48, 5, 'melee'],
  [10, 'Climb Down', 'Descendre', 8, 40, 0, 0, 35, 'climb'],
  [11, 'Freeze Life', 'Congeler', 14, 3, 0, 0, 20, 'pending'],
  [12, 'Hit', 'Frapper', 9, 3, 20, 20, 4, 'defend'],
  [13, 'Swing', 'Taillader', 4, 2, 32, 16, 6, 'melee'],
  [14, 'Stab', 'Poignarder', 5, 4, 42, 60, 10, 'melee'],
  [15, 'Thrust', 'Plonger', 5, 17, 57, 66, 16, 'melee'],
  [16, 'Jab', 'Piquer', 5, 3, 70, 8, 2, 'melee'],
  [17, 'Parry', 'Parer', 7, 1, 18, 8, 18, 'melee'],
  [18, 'Hack', 'Abattre', 4, 6, 27, 25, 8, 'melee'],
  [19, 'Berzerk', 'Se ruer sur', 4, 40, 46, 96, 30, 'melee'],
  [20, 'Fireball', 'Boule de feu', 16, 5, 0, 0, 42, 'spell'],
  [21, 'Dispell', 'Conjurer', 17, 2, 0, 0, 31, 'pending'],
  [22, 'Confuse', 'Subjuguer', 14, 2, 0, 0, 10, 'fright'],
  [23, 'Lightning', 'Éclair', 17, 4, 0, 0, 38, 'pending'],
  [24, 'Disrupt', 'Ensorceler', 17, 5, 46, 55, 9, 'melee'],
  [25, 'Melee', 'Mêlée', 6, 25, 64, 60, 20, 'melee'],
  [26, 'X', 'X', 8, 1, 0, 0, 10, 'defend'],
  [27, 'Invoke', 'Invoquer', 3, 2, 0, 0, 16, 'spell'],
  [28, 'Slash', 'Taillader', 4, 2, 26, 16, 4, 'melee'],
  [29, 'Cleave', 'Pourfendre', 4, 10, 40, 48, 12, 'melee'],
  [30, 'Bash', 'Assommer', 6, 9, 32, 50, 20, 'melee'],
  [31, 'Stun', 'Étourdir', 6, 2, 50, 16, 7, 'melee'],
  [32, 'Shoot', 'Tirer', 11, 3, 0, 0, 14, 'shoot'],
  [33, 'Spellshield', 'Aura magique', 15, 1, 0, 0, 30, 'pending'],
  [34, 'Fireshield', 'Pare-feu', 15, 2, 0, 0, 35, 'pending'],
  [35, 'Fluxcage', 'Cage', 3, 6, 0, 0, 2, 'pending'],
  [36, 'Heal', 'Guérir', 13, 1, 0, 0, 19, 'heal'],
  [37, 'Calm', 'Tranquilliser', 14, 1, 0, 0, 9, 'fright'],
  [38, 'Light', 'Lumière', 17, 3, 0, 0, 10, 'light'],
  [39, 'Window', 'Fenêtre', 18, 2, 0, 0, 15, 'pending'],
  [40, 'Spit', 'Cracher', 16, 3, 0, 0, 22, 'spell'],
  [41, 'Brandish', 'Brandir', 14, 2, 0, 0, 10, 'fright'],
  [42, 'Throw', 'Lancer', 10, 0, 0, 0, 0, 'throw'],
  [43, 'Fuse', 'Fusionner', 3, 2, 0, 0, 2, 'pending'],
];

// F407: actions that break a closed door instead of striking; spells and their energy; F401: fright.
const BREAKS_DOORS = new Set(['Bash', 'Hack', 'Berzerk', 'Kick', 'Swing', 'Chop']);
const SPELLS = { Fireball: ['fireball', 150], Spit: ['fireball', 250], Invoke: ['invoke', 0] };
const FRIGHT = { 'War Cry': 3, Calm: 7, Brandish: 6, 'Blow Horn': 6, Confuse: 12 };
// F407: the actions that use a charge of the item when done.
const USE_CHARGE = new Set(['Fireball', 'Spit', 'Invoke', 'Lightning', 'Dispell', 'Confuse', 'Spellshield', 'Fireshield', 'Freeze Life', 'Light', 'Window']);

export const ACTIONS = TABLE.map(([index, name, label, skill, stamina, hitProbability, damage, fatigue, kind]) => ({
  index,
  name,
  label,
  skill: SKILLS[skill],
  stamina,
  hitProbability,
  damage,
  fatigue,
  kind,
  breaksDoors: BREAKS_DOORS.has(name),
  spell: SPELLS[name]?.[0],
  energy: SPELLS[name]?.[1],
  fright: FRIGHT[name],
  usesCharge: USE_CHARGE.has(name),
}));

// Index of an action by its name; the second Stab (14, unused by the combos) is left out.
const BY_NAME = new Map(ACTIONS.filter((a) => a.index !== 14).map((a) => [a.name, a]));
export const actionNamed = (name) => BY_NAME.get(name);

/**
 * Parses a combo ("Swing Lightning:3*"): up to 3 actions, `_` for a space in a name, `:n` the minimum
 * skill level (0 if none), `*` the action is hidden when the item has no charge left (F383).
 * @returns {{ action, minLevel: number, needsCharge: boolean }[]}
 */
export function parseCombo(combo) {
  return combo.split(' ').map((entry) => {
    const [, name, level, star] = entry.match(/^([^:*]+)(?::(\d+))?(\*)?$/);
    return { action: actionNamed(name.replaceAll('_', ' ')), minLevel: Number(level ?? 0), needsCharge: Boolean(star) };
  });
}

// The empty action hand: Punch, Kick, War Cry (combo 2).
export const EMPTY_HAND = parseCombo('Punch Kick War_Cry');
