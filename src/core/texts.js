// Texts of the dungeon: wall inscriptions, messages shown by mechanisms,
// scrolls and the champion sheets of the Hall of Champions (decoded).

import { ITEM_POOLS } from './contents.js';

export const TEXT_KIND_LABELS = {
  inscription: 'Inscriptions',
  message: 'Messages',
  scroll: 'Parchemins',
  champion: 'Champions',
};

// Champion sheet: NAME / TITLE / (empty) / M|F / 3 lines of letters A..P = hex digits.
const CHAMPION_SHEET = /^(.*)\n(.*)\n\n([MF])\n([A-P]{12})\n([A-P]{14})\n([A-P]{16})$/;
export const ATTRIBUTE_LABELS = ['Chance', 'Force', 'Dextérité', 'Sagesse', 'Vitalité', 'Anti-magie', 'Anti-feu'];
// The 16 hidden skills, 4 per class (the class level derives from them).
export const SKILL_CLASSES = [
  { name: 'Guerrier', skills: ['Swing', 'Thrust', 'Club', 'Parry'] },
  { name: 'Ninja', skills: ['Steal', 'Fight', 'Throw', 'Shoot'] },
  { name: 'Prêtre', skills: ['Identify', 'Heal', 'Influence', 'Defend'] },
  { name: 'Magicien', skills: ['Fire', 'Air', 'Earth', 'Water'] },
];

const hex = (letters) => [...letters].reduce((value, c) => value * 16 + (c.charCodeAt(0) - 65), 0);

/** Decodes a champion sheet, or returns null if the text is not one. */
export function decodeChampion(text) {
  const m = text.match(CHAMPION_SHEET);
  if (!m) return null;
  const [, name, title, gender, vitals, attributes, skills] = m;
  const levels = [...skills].map((c) => c.charCodeAt(0) - 65);
  return {
    name,
    title,
    gender: gender === 'M' ? 'homme' : 'femme',
    health: hex(vitals.slice(0, 4)),
    stamina: hex(vitals.slice(4, 8)) / 10, // stored ×10, displayed /10 in the game
    mana: hex(vitals.slice(8, 12)),
    attributes: ATTRIBUTE_LABELS.map((label, i) => ({ label, value: hex(attributes.slice(i * 2, i * 2 + 2)) })),
    classes: SKILL_CLASSES.map((c, k) => ({
      name: c.name,
      skills: c.skills.map((skill, i) => ({ skill, level: levels[k * 4 + i] })),
    })).filter((c) => c.skills.some((s) => s.level > 0)),
  };
}

/** One-line summary of a champion, for tooltips. */
export function championSummary(c) {
  const classes = c.classes.map((k) => k.name).join(' / ') || 'aucune classe';
  return [
    `${c.gender} · ${classes}`,
    `PV ${c.health} · Endurance ${c.stamina} · Mana ${c.mana}`,
    c.attributes.map((a) => `${a.label} ${a.value}`).join(' · '),
  ];
}

// Location of a scroll: its tile, or the tile of the chest / creature holding it.
function locate(dungeon, at) {
  if (!at) return null;
  if (at.in) {
    const owner = dungeon.data[at.in === 'creature' ? 'creatures' : ITEM_POOLS[at.in]][at.index];
    const place = locate(dungeon, owner?.at);
    return place && { ...place, inside: owner.name ?? at.in };
  }
  return { level: at.map, x: at.x, y: at.y };
}

/**
 * All texts, classified: [{ index, kind, text, champion?, level, x, y, position?, onWall, inside? }].
 * Texts placed on tiles are inscriptions (visible) or messages (invisible, shown
 * by a mechanism); texts referred to by scrolls are scrolls; champion sheets are
 * recognised by their format. Texts found nowhere are skipped.
 */
export function buildTexts(dungeon) {
  const scrollTexts = new Map(); // text index -> location of the scroll
  dungeon.data.scrolls.forEach((s) => {
    const place = locate(dungeon, s.at);
    if (place) scrollTexts.set(s.text, place);
  });

  const positions = new Map(); // "level:x,y:index" -> position of the text reference on its tile
  for (let level = 0; level < dungeon.levelCount; level++) {
    for (const { x, y, detail } of dungeon.detailedTiles(level)) {
      for (const ref of detail.items ?? []) if (ref.kind === 'text') positions.set(ref.index, { level, x, y, position: ref.position, onWall: detail.type === 'wall' });
    }
  }

  const entries = [];
  dungeon.data.texts.forEach((t, index) => {
    const champion = decodeChampion(t.text);
    const onTile = positions.get(index);
    const scroll = scrollTexts.get(index);
    const place = onTile ?? scroll;
    if (!place) return;
    const kind = champion ? 'champion' : scroll ? 'scroll' : t.visible ? 'inscription' : 'message';
    entries.push({ index, kind, text: t.text, champion, onWall: false, ...place });
  });
  return entries;
}

/** Texts placed on a tile (inscriptions, messages, champion sheets — not scrolls). */
export function textsAt(texts, level, x, y) {
  return texts.filter((t) => t.kind !== 'scroll' && t.level === level && t.x === x && t.y === y);
}
