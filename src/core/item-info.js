// Characteristics of the item types that the engine keeps out of Dungeon.xml
// (graphics.dat item 559): weight, and for the weapons the strength bonus, the
// kinetic energy when thrown and the actions (combo). Used to wield and throw items
// (docs/024). Indexed by category and type, as the catalog of dungeon.json.
// Source: Dungeon Master Encyclopaedia, "Dungeon Master Items"
// (http://dmweb.free.fr/games/dungeon-master/solutions/items/), extracted from DM for
// Atari ST; damage of each action in 1/32 ("Actions and Combos").

import { ITEM_POOLS } from './contents.js';

// prettier-ignore
const WEAPONS = [
  // type, weight (kg), strength, kinetic energy, actions (name:damage)
  [0, 0.1, 2, 0, 'Punch:32 Freeze_Life:0'], // Eye Of Time
  [1, 0.1, 2, 0, 'Swing:16 Lightning:0'], // Stormring
  [2, 1.1, 8, 2, 'Swing:16'], // Torch
  [3, 1.2, 10, 80, 'Swing:16 Fireball:0'], // Flamitt
  [4, 0.9, 16, 7, 'Slash:16 Brandish:0 Confuse:0'], // Staff Of Claws
  [5, 3.0, 49, 110, 'Jab:8 Chop:48 Lightning:0'], // Bolt Blade
  [6, 4.7, 55, 20, 'Chop:48 Melee:60 Fireball:0'], // Fury
  [7, 2.4, 25, 10, 'Parry:8 Brandish:0 Fireshield:0'], // The Firestaff
  [8, 0.5, 10, 19, 'Throw:0 Stab:48 Slash:16'], // Dagger
  [9, 3.3, 30, 8, 'Swing:16 Parry:8 Chop:48'], // Falchion
  [10, 3.2, 34, 10, 'Swing:16 Parry:8 Chop:48'], // Sword
  [11, 2.6, 38, 10, 'Jab:8 Parry:8 Thrust:66'], // Rapier
  [12, 3.5, 42, 11, 'Slash:16 Parry:8 Melee:60'], // Sabre
  [13, 3.6, 46, 12, 'Slash:16 Parry:8 Melee:60'], // Samurai Sword
  [14, 3.3, 50, 14, 'Chop:48 Melee:60 Thrust:66'], // Delta
  [15, 3.7, 62, 14, 'Stab:48 Chop:48 Cleave:48'], // Diamond Edge
  [16, 3.0, 48, 13, 'Jab:8 Cleave:48 Disrupt:55'], // Vorpal Blade
  [17, 3.9, 58, 15, 'Swing:16 Thrust:66 Berzerk:96'], // The Inquisitor
  [18, 4.3, 49, 33, 'Swing:16 Chop:48 Melee:60'], // Axe
  [19, 6.5, 70, 44, 'Chop:48 Cleave:48 Berzerk:96'], // Hardcleave
  [20, 3.1, 32, 10, 'Swing:16 Bash:50 Stun:16'], // Mace
  [21, 4.1, 42, 13, 'Swing:16 Bash:50 Stun:16'], // Mace Of Order
  [22, 5.0, 60, 15, 'Swing:16 Stun:16 Melee:60'], // Morningstar
  [23, 3.6, 19, 10, 'Throw:0 Bash:50'], // Club
  [24, 11.0, 44, 22, 'Throw:0 Bash:50'], // Stone Club (dropped by Stone Golems)
  [25, 1.0, 1, 50, 'Shoot:0'], // Bow
  [26, 2.8, 1, 180, 'Shoot:0'], // Crossbow
  [27, 0.2, 2, 10, 'Throw:0 Stab:48'], // Arrow
  [28, 0.2, 2, 28, 'Throw:0 Stab:48'], // Slayer
  [29, 1.9, 5, 20, 'Shoot:0'], // Sling
  [30, 1.0, 6, 18, 'Throw:0'], // Rock
  [31, 0.3, 7, 23, 'Throw:0 Stab:48'], // Poison Dart
  [32, 0.1, 3, 19, 'Throw:0'], // Throwing Star
  [34, 2.6, 12, 4, 'Swing:16'], // Staff
  [35, 0.1, 0, 0, 'Calm:0 Spellshield:0 Heal:0'], // Wand
  [36, 0.2, 1, 20, 'Spellshield:0 Fireshield:0'], // Teowand
  [37, 3.5, 18, 6, 'Parry:8 Light:0 Dispell:0'], // Yew Staff
  [38, 2.9, 0, 4, 'Swing:16'], // Staff Of Manar
  [39, 2.1, 0, 3, 'Heal:0 Calm:0 Brandish:0'], // Snake Staff
  [41, 0.8, 3, 1, 'Swing:16'], // Dragon Spit
  [42, 1.8, 9, 4, 'Parry:8 Heal:0'], // Sceptre Of Lyf
  [43, 0.8, 1, 1, 'Blow_Horn:0'], // Horn Of Fear
  [44, 3.0, 1, 220, 'Shoot:0'], // Speedbow
  [45, 3.6, 100, 50, 'Invoke:0 Fuse:0 Fluxcage:0'], // The Firestaff (Complete)
];

// prettier-ignore
const WEIGHTS = {
  cloth: [
  [1, 0.4], // Cloak Of Night
  [2, 0.3], // Barbarian Hide
  [3, 0.6], // Sandals
  [4, 1.6], // Leather Boots
  [5, 0.4], // Robe (Body)
  [6, 0.4], // Robe (Legs)
  [7, 0.3], // Fine Robe (Body)
  [8, 0.3], // Fine Robe (Legs)
  [9, 0.4], // Kirtle
  [10, 0.2], // Silk Shirt
  [11, 0.4], // Tabard
  [12, 0.5], // Gunna
  [13, 0.3], // Elven Doublet
  [14, 0.3], // Elven Huke
  [15, 0.4], // Elven Boots
  [16, 0.6], // Leather Jerkin
  [17, 0.8], // Leather Pants
  [18, 1.4], // Suede Boots
  [19, 0.6], // Blue Pants
  [20, 0.5], // Tunic
  [21, 0.5], // Ghi
  [22, 0.5], // Ghi Trousers
  [23, 0.4], // Calista
  [24, 0.6], // Crown Of Nerra
  [25, 1.1], // Bezerker Helm
  [26, 1.4], // Helmet
  [27, 1.5], // Basinet
  [28, 1.1], // Buckler
  [29, 1.0], // Hide Shield
  [30, 1.4], // Wooden Shield
  [31, 2.1], // Small Shield
  [32, 6.5], // Mail Aketon
  [33, 5.3], // Leg Mail
  [34, 5.2], // Mithral Aketon
  [35, 4.1], // Mithral Mail
  [36, 1.6], // Casque'n Coif
  [37, 1.6], // Hosen
  [38, 1.9], // Armet
  [39, 12.0], // Torso Plate
  [40, 8.0], // Leg Plate
  [41, 2.8], // Foot Plate
  [42, 3.4], // Large Shield
  [43, 1.7], // Helm Of Lyte
  [44, 10.8], // Plate Of Lyte
  [45, 7.2], // Poleyn Of Lyte
  [46, 2.4], // Greave Of Lyte
  [47, 3.0], // Shield Of Lyte
  [48, 3.5], // Helm Of Darc
  [49, 14.1], // Plate Of Darc
  [50, 9.0], // Poleyn Of Darc
  [51, 3.1], // Greave Of Darc
  [52, 4.0], // Shield Of Darc
  [54, 5.7], // Flamebain
  [56, 0.3], // Boots Of Speed
  [57, 0.2], // Halter
  ],
  potion: [
  [2, 0.3], // Des Potion
  [3, 0.3], // Ven Potion
  [6, 0.3], // Ros Potion
  [7, 0.3], // Ku Potion
  [8, 0.3], // Dane Potion
  [9, 0.3], // Neta Potion
  [10, 0.3], // Bro Potion
  [11, 0.3], // Ma Potion (made by a spell only, docs/031)
  [12, 0.3], // Ya Potion
  [13, 0.3], // Ee Potion (made by a spell only, docs/031)
  [14, 0.3], // Vi Potion
  [15, 0.3], // Water Flask
  [19, 0.3], // Ful Bomb
  [20, 0.1], // Empty Flask
  ],
  container: [
  [0, 5.0], // Chest
  ],
  miscellaneous: [
  [0, 0.1], // Compass
  [1, 0.5], // Water
  [2, 0.2], // Jewel Symal
  [3, 0.2], // Illumulet
  [4, 0.4], // Ashes
  [6, 0.1], // Copper Coin
  [7, 0.1], // Silver Coin
  [8, 0.1], // Gold Coin
  [9, 0.2], // Iron Key
  [10, 0.1], // Key Of B
  [11, 0.1], // Solid Key
  [12, 0.1], // Square Key
  [13, 0.1], // Tourquoise Key
  [14, 0.1], // Cross Key
  [16, 0.1], // Skeleton Key
  [17, 0.1], // Gold Key
  [18, 0.1], // Winged Key
  [19, 0.1], // Topaz Key
  [21, 0.1], // Emerald Key
  [22, 0.1], // Ruby Key
  [23, 0.1], // Ra Key
  [24, 0.1], // Master Key
  [25, 8.1], // Boulder
  [26, 0.2], // Blue Gem
  [27, 0.3], // Orange Gem
  [28, 0.2], // Green Gem
  [29, 0.4], // Apple
  [30, 0.4], // Corn
  [31, 0.3], // Bread
  [32, 0.8], // Cheese
  [33, 0.5], // Screamer Slice
  [34, 1.1], // Worm Round (dropped by Magenta Worms)
  [35, 0.4], // Drumstick
  [36, 0.6], // Dragon Steak
  [37, 0.2], // Gem Of Ages
  [38, 0.3], // Ekkhard Cross
  [39, 0.2], // Moonstone
  [40, 0.2], // The Hellion
  [41, 0.2], // Pendant Feral
  [42, 0.6], // Magical Box (Blue)
  [43, 0.9], // Magical Box (Green)
  [44, 0.3], // Mirror Of Dawn
  [45, 1.0], // Rope
  [46, 0.1], // Rabbit's Foot
  [47, 0.0], // Corbamite
  [48, 0.1], // Choker
  [49, 0.1], // Lock Picks
  [50, 0.2], // Magnifier
  ],
  scroll: [
  [0, 0.1], // Scroll
  ],
};

const WEAPON_INFO = new Map(
  WEAPONS.map(([type, weight, strength, kinetic, actions]) => [
    type,
    {
      weight,
      strength,
      kinetic,
      actions: actions.split(' ').map((a) => {
        const [name, damage] = a.split(':');
        return { name: name.replace('_', ' '), damage: Number(damage) };
      }),
    },
  ]),
);
const WEIGHT = Object.fromEntries(Object.entries(WEIGHTS).map(([kind, rows]) => [kind, new Map(rows)]));

/**
 * Characteristics of an item ({ kind, index }): { weight (kg), strength, kinetic, actions,
 * weapon, throwable, melee }. `throwable`: its combo has the action Throw; `melee`: it
 * is a weapon with a striking action (any action with damage).
 */
export function itemInfo(dungeon, { kind, index }) {
  const type = dungeon.data[ITEM_POOLS[kind]][index]?.type ?? 0;
  const weapon = kind === 'weapon' ? WEAPON_INFO.get(type) : null;
  if (weapon) {
    return {
      ...weapon,
      weapon: true,
      throwable: weapon.actions.some((a) => a.name === 'Throw'),
      melee: weapon.actions.some((a) => a.damage > 0),
    };
  }
  const weight = WEIGHT[kind]?.get(type) ?? 1;
  return { weight, strength: 0, kinetic: 0, actions: [], weapon: false, throwable: false, melee: false };
}

const POWER_SYMBOLS = ['Lo', 'Um', 'On', 'Ee', 'Pal', 'Mon'];
const TORCH = 2;
const EMPTY_FLASK = 20;
const kg = (weight) => `${weight.toFixed(1).replace('.', ',')} kg`;

/**
 * Lines describing an item held in hand (docs/034), for its tooltip: a scroll's whole text;
 * a potion's power (and its power symbol, as DM shows it); a torch's charges and flame; a
 * weapon's weight, bonuses and actions; for every item, what its entry says (charges,
 * poisoned, cursed, broken) and its weight.
 */
export function itemDetails(dungeon, ref) {
  const entry = dungeon.data[ITEM_POOLS[ref.kind]][ref.index] ?? {};
  const info = itemInfo(dungeon, ref);
  const lines = [];
  if (ref.kind === 'scroll') lines.push(...(dungeon.data.texts[entry.text]?.text ?? '(illisible)').split('\n'));
  if (ref.kind === 'potion') {
    if (entry.type === EMPTY_FLASK) lines.push('Flasque vide : un sort de potion la remplit');
    else if (entry.power) lines.push(`Puissance ${entry.power} (${POWER_SYMBOLS[Math.min(5, Math.max(1, Math.floor(entry.power / 40)) - 1)]})`);
  }
  if (ref.kind === 'weapon' && entry.type === TORCH) {
    lines.push(entry.charges ? `${entry.charges} charge${entry.charges > 1 ? 's' : ''} sur 15, ${entry.lit ? 'allumée' : 'éteinte'}` : 'Consumée');
  } else if (entry.charges) lines.push(`${entry.charges} charge${entry.charges > 1 ? 's' : ''}`);
  if (info.weapon) {
    if (info.strength) lines.push(`Bonus de force : ${info.strength}`);
    if (info.kinetic) lines.push(`Énergie cinétique (lancer) : ${info.kinetic}`);
    const actions = info.actions.filter((a) => a.name !== 'N');
    if (actions.length) lines.push(`Actions : ${actions.map((a) => (a.damage ? `${a.name} (${a.damage})` : a.name)).join(', ')}`);
  }
  const states = [entry.poisoned && 'empoisonné', entry.cursed && 'maudit', entry.broken && 'cassé'].filter(Boolean);
  if (states.length) lines.push(states.join(', '));
  if (ref.kind === 'container' && entry.items) lines.push(`${entry.items.length} objet${entry.items.length > 1 ? 's' : ''} dedans`);
  lines.push(`Poids : ${kg(info.weight)}`);
  return lines;
}
