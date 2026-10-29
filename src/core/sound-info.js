// The sounds of the simulation (docs/040, docs/041): the 33 sounds of DM Amiga 3.6
// (graphics.dat items 671 to 712, labels of greatstone.free.fr), named by what makes them.
// The files are assets/sounds/NN.mp3, NN = number of the Amiga sound ("Sound 01 - Switch": 01).
//
// file     number of the Amiga sound
// range    multiplies the common reach of the sounds (audio settings); provisional
// The order of SOUNDS is the priority, highest first: when several sounds are asked during
// the same tick, the loudest plays, then the one listed first (docs/041 § 3).

// Delay of the sounds that follow the one of their cause (ReDMCSB C02_MODE_PLAY_ONE_TICK_LATER),
// in ticks: the wound after the attack, the thud of a door after the blow, the loot after the
// death. The audio module plays them that long after their request (docs/046).
export const LATER_TICKS = 1;

const sound = (file, range = 1) => ({ file: String(file).padStart(2, '0'), range });

export const SOUNDS = {
  scream: sound(5, 1.5), // fall in a pit, death of the champion
  wall: sound(14), // the party runs into a wall, a door closes on it
  teleport: sound(13), // audible teleporter, generated group
  explosion: sound(4, 1.5), // Fireball (ST: strong and weak explosions; mapping deduced from the labels)
  spell: sound(11), // Open Door
  wounded: sound(7), // the champion is hit (Zed: "Champion Wounded 1")
  swallow: sound(6), // a potion drunk
  combat: sound(12), // strike, throw
  door: sound(2), // each step of a door
  metal: sound(0), // a thrown weapon hits, a dead creature drops a weapon
  thud: sound(3), // another thrown item hits, drops without weapon, a door hit (mapping deduced)
  switch: sound(1, 0.5), // audible actuator, button of a door
};

// Attack and move sounds of the species (Encyclopaedia, "Dungeon Master Creatures"): Amiga numbers.
// prettier-ignore
const SPECIES = {
  // type: [attack, move]
  0: [18, 25],   // Giant Scorpion
  1: [null, 26], // Swamp Slime
  2: [20, 23],   // Giggler
  4: [15, 25],   // Pain Rat
  5: [null, 25], // Ruster
  6: [17, 25],   // Screamer
  7: [28, 25],   // Rockpile
  8: [16, null], // Ghost
  9: [3, 23],    // Stone Golem
  10: [16, 23],  // Mummy
  12: [12, 32],  // Skeleton
  13: [30, 22],  // Couatl
  14: [null, 23], // Vexirk
  15: [19, 25],  // Magenta Worm
  16: [3, 23],   // Trolin
  17: [null, 22], // Giant Wasp
  18: [12, 21],  // Animated Armour
  20: [29, 26],  // Water Elemental
  21: [17, 25],  // Oitu
  22: [null, 23], // Demon
  24: [15, 31],  // Red Dragon
};

for (const [attack, move] of Object.values(SPECIES)) {
  if (attack !== null) SOUNDS[`attack:${attack}`] ??= sound(attack);
  if (move !== null) SOUNDS[`move:${move}`] ??= sound(move);
}

/** Sound of a species attacking, or null. */
export const attackSound = (type) => (SPECIES[type]?.[0] != null ? `attack:${SPECIES[type][0]}` : null);
/** Sound of a species stepping, or null. */
export const moveSound = (type) => (SPECIES[type]?.[1] != null ? `move:${SPECIES[type][1]}` : null);

/** Priority of a sound: lower is higher (order of SOUNDS). */
export const soundPriority = (id) => Object.keys(SOUNDS).indexOf(id);
