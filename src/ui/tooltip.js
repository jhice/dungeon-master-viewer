// Floating tooltip that follows the pointer and lists a tile's contents.

import { SUBCELL_LABELS, FACE_LABELS } from '../core/contents.js';
import { CATEGORY_COLORS, creatureColor } from '../render/palette.js';

const OFFSET = 16; // px between the pointer and the tooltip

export function createTooltip(container = document.body) {
  const element = document.createElement('div');
  element.className = 'tile-tooltip';
  element.hidden = true;
  container.append(element);

  let pointer = { x: 0, y: 0 };
  const place = () => {
    // Keep inside the window: flip to the left/top of the pointer near the edges.
    const { innerWidth: w, innerHeight: h } = window;
    const { width, height } = element.getBoundingClientRect();
    const left = pointer.x + OFFSET + width > w ? pointer.x - OFFSET - width : pointer.x + OFFSET;
    const top = pointer.y + OFFSET + height > h ? pointer.y - OFFSET - height : pointer.y + OFFSET;
    element.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`;
  };
  const onMove = (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    if (!element.hidden) place();
  };
  window.addEventListener('pointermove', onMove);

  return {
    /**
     * Shows `title`, the tile contents (filtered by layers) and its mechanisms
     * ([{ color, title, details: [] }]); hides if there is nothing to show.
     */
    show(title, contents, { items = true, creatures = true, onWall = false, mechanisms = [] } = {}) {
      const body = [
        ...(contents ? contentLines(contents, { items, creatures, onWall }) : []),
        ...mechanisms.flatMap((m) => [line(m.color, m.title), ...m.details.map((d) => detailLine(d))]),
      ];
      if (!body.length) return this.hide();
      const heading = document.createElement('div');
      heading.className = 'tooltip-title';
      heading.textContent = title;
      element.replaceChildren(heading, ...body);
      element.hidden = false;
      place();
    },
    hide() {
      element.hidden = true;
    },
    dispose() {
      window.removeEventListener('pointermove', onMove);
      element.remove();
    },
  };
}

function contentLines(contents, { items, creatures, onWall }) {
  const lines = [];
  const c = contents.creature;
  if (creatures && c) {
    const hp = c.members.map((m) => m.hp).join(' · ');
    lines.push(line(creatureColor(c.type), `${c.count > 1 ? `${c.count} × ` : ''}${c.name}`, `PV ${hp} · face ${c.facing}`));
    for (const item of c.possessions) lines.push(itemLine(item, 1, 'porte'));
  }
  if (items) {
    const labels = onWall ? FACE_LABELS : SUBCELL_LABELS;
    for (const item of contents.items) {
      lines.push(itemLine(item, 0, labels[item.position]));
      for (const child of item.contents ?? []) lines.push(itemLine(child, 1));
    }
  }
  return lines;
}

function detailLine(text) {
  const row = document.createElement('div');
  row.className = 'tooltip-line tooltip-sub';
  row.textContent = text;
  return row;
}

const itemLine = (item, depth, where) =>
  line(CATEGORY_COLORS[item.category], item.name, [where, item.note].filter(Boolean).join(' · '), depth);

function line(color, text, detail, depth = 0) {
  const row = document.createElement('div');
  row.className = 'tooltip-line';
  row.style.paddingLeft = `${depth * 1.1}rem`;
  const dot = document.createElement('span');
  dot.className = 'tooltip-dot';
  dot.style.background = color;
  const name = document.createElement('span');
  name.textContent = depth ? `↳ ${text}` : text;
  row.append(dot, name);
  if (detail) {
    const small = document.createElement('span');
    small.className = 'tooltip-detail';
    small.textContent = detail;
    row.append(small);
  }
  return row;
}
