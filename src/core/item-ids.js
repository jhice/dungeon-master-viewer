// Decoding of the "item identifier" used by actuators (locks, alcoves, coin
// slots, possession detectors, item exchanger). It is a global icon index,
// not an object type; the mapping below is inferred from the data (docs/009):
//   - keys: identifier = miscellaneous type + 167, confirmed by the lock
//     graphics (Gold Lock <- 184 Gold Key, Iron Lock <- 176 Iron Key) and by
//     the levels where each key lies;
//   - the others: deduced from the wall graphic of the actuator using them.

const KEYS_OFFSET = 167; // icons 176..191 = miscellaneous types 9 (Iron Key) .. 24 (Master Key)

const KNOWN = {
  4: { name: 'Torch', certainty: 'probable' }, // alcoves drawn as "Full Torch Holder"
  27: { name: 'The Firestaff', certainty: 'probable' }, // item exchanger on the Amalgam, party detectors in the Hall
  28: { name: 'The Firestaff (Complete)', certainty: 'probable' },
  125: { name: 'Copper Coin', certainty: 'probable' }, // "Coin Slot" graphics; order of the coins assumed
  126: { name: 'Silver Coin', certainty: 'probable' },
  127: { name: 'Gold Coin', certainty: 'probable' },
  129: { name: 'gemme', certainty: 'incertain' }, // "Gem Hole" graphic, which gem is unknown
};

/**
 * Identifier of an item ({ kind, index }), the reverse of decodeItemId(): keys by
 * their type, the other known items by their name; null if unknown.
 */
export function itemIdOf(dungeon, { kind, index }) {
  const entry = dungeon.data[kind === 'miscellaneous' ? 'miscellaneous' : kind === 'weapon' ? 'weapons' : null]?.[index];
  if (!entry) return null;
  if (kind === 'miscellaneous' && entry.type >= 9 && entry.type <= 24) return entry.type + KEYS_OFFSET;
  const known = Object.entries(KNOWN).find(([, item]) => item.name === entry.name);
  return known ? Number(known[0]) : null;
}

/**
 * @returns {{ name: string, certainty: 'confirmé'|'probable'|'incertain'|'inconnu' }}
 */
export function decodeItemId(dungeon, id) {
  const keyType = id - KEYS_OFFSET;
  if (keyType >= 9 && keyType <= 24) {
    const name = dungeon.data.catalog.miscellaneous[keyType];
    if (name) return { name, certainty: 'confirmé' };
  }
  return KNOWN[id] ?? { name: `objet #${id}`, certainty: 'inconnu' };
}
