// Procedural drawings of the ornaments of the dungeon (walls, floors, doors),
// on a 2D canvas: no image file, a consistent stone-and-metal style. Pure
// drawing code, no Three.js: fp-decor.js turns the drawings into textures.
//
// Catalogue entries:
//   WALL_ART[name]  = { w, h, y, draw(g, W, H) }  plane on a wall face: width w (tiles),
//                     height h and bottom y (fractions of the wall height)
//   FLOOR_ART[name] = { size, draw(g, W, H) }    decal on the floor, size × size (tiles), seen from above
//   DOOR_TYPES[name](g, W, H)                    leaf of a door (transparent where it can be seen through)
//   DOOR_ART[name](g, W, H)                      ornament drawn over the leaf
// The drawings use the whole canvas (W × H pixels) and leave it transparent elsewhere.

const IRON = '#5c5852';
const IRON_DARK = '#2b2926';
const IRON_LIGHT = '#8d877c';
const STONE = '#8a8172';
const STONE_DARK = '#4d463c';
const WOOD = '#7a5532';
const WOOD_DARK = '#4a321c';
const BRASS = '#b8913f';
const SHADOW = 'rgb(0 0 0 / 0.55)';

// --- Small drawing helpers -------------------------------------------------------------

function rect(g, x, y, w, h, fill, stroke = null, line = 3) {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = line;
    g.strokeRect(x, y, w, h);
  }
}

function disc(g, x, y, r, fill, stroke = null, line = 3) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = line;
    g.stroke();
  }
}

function ring(g, x, y, r, color, width) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke();
}

function path(g, points, color, width, close = false, fill = null) {
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (color) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke();
  }
}

// Bevelled plate: light top-left edge, dark bottom-right edge.
function plate(g, x, y, w, h, fill = IRON) {
  rect(g, x, y, w, h, fill);
  g.fillStyle = 'rgb(255 255 255 / 0.18)';
  g.fillRect(x, y, w, 4);
  g.fillRect(x, y, 4, h);
  g.fillStyle = 'rgb(0 0 0 / 0.4)';
  g.fillRect(x, y + h - 4, w, 4);
  g.fillRect(x + w - 4, y, 4, h);
}

// Deterministic noise, so that the drawings are the same at every load.
function random(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// --- Wall ornaments ------------------------------------------------------------------------

const SWITCH_COLORS = { Green: '#3f9a45', Red: '#b8392d', Blue: '#3a68b8', Big: '#8d877c', Small: '#8d877c', Tiny: '#8d877c', Crack: '#6f6a60', Eye: '#c9b98a' };

// Push button on a plate: "In" = pressed (flat, dark rim), "Out" = raised.
function switchArt(color, pressed, scale = 1) {
  return (g, W, H) => {
    const s = Math.min(W, H) * 0.8 * scale;
    const x = (W - s) / 2;
    const y = (H - s) / 2;
    plate(g, x, y, s, s, IRON_DARK);
    const b = s * 0.56;
    const bx = (W - b) / 2;
    const by = (H - b) / 2;
    if (pressed) {
      rect(g, bx, by, b, b, color, 'rgb(0 0 0 / 0.7)', 6);
    } else {
      rect(g, bx + 6, by + 8, b, b, SHADOW);
      plate(g, bx, by, b, b, color);
    }
  };
}

// The eye switch: an eye carved in a plate.
function eyeSwitch(g, W, H) {
  plate(g, W * 0.15, H * 0.2, W * 0.7, H * 0.6, STONE_DARK);
  g.beginPath();
  g.ellipse(W / 2, H / 2, W * 0.26, H * 0.14, 0, 0, Math.PI * 2);
  g.fillStyle = '#e8e0c8';
  g.fill();
  disc(g, W / 2, H / 2, H * 0.11, '#3a68b8');
  disc(g, W / 2, H / 2, H * 0.05, '#111');
}

// Crack switch: a crack in the stone with a small stone inside, pushed in or not.
function crackSwitch(pressed) {
  return (g, W, H) => {
    crack(g, W, H);
    rect(g, W * 0.38, H * 0.38, W * 0.24, H * 0.24, pressed ? STONE_DARK : STONE, 'rgb(0 0 0 / 0.6)', 4);
  };
}

function lever(up) {
  return (g, W, H) => {
    plate(g, W * 0.3, H * 0.35, W * 0.4, H * 0.3, IRON_DARK);
    const pivot = [W / 2, H / 2];
    const end = up ? [W / 2, H * 0.06] : [W / 2, H * 0.94];
    path(g, [pivot, end], IRON_LIGHT, W * 0.07);
    disc(g, end[0], end[1], W * 0.08, '#2b2926', IRON_LIGHT, 4);
    disc(g, pivot[0], pivot[1], W * 0.06, BRASS);
  };
}

const LOCK_COLORS = {
  Gold: '#c9a23e', Iron: '#6f6a62', Stone: '#8a8172', Skeleton: '#d8d0b8', Tourquoise: '#3fb3a8', Ra: '#b07a2a',
  Onyx: '#2a2a32', Cross: '#8a6f9a', Master: '#a8a8b0', Square: '#7f7a70', Ruby: '#b0283a', Emerald: '#2f9a5a',
  Topaz: '#d89a30', Winged: '#c0c8d0',
};

// Lock: a coloured plate with its keyhole (a cross, a square… for some locks).
function lock(color, hole = 'key') {
  return (g, W, H) => {
    plate(g, W * 0.2, H * 0.12, W * 0.6, H * 0.76, color);
    ring(g, W / 2, H / 2, W * 0.22, 'rgb(0 0 0 / 0.25)', 4);
    g.fillStyle = '#0d0b09';
    if (hole === 'cross') {
      g.fillRect(W * 0.46, H * 0.3, W * 0.08, H * 0.4);
      g.fillRect(W * 0.36, H * 0.42, W * 0.28, H * 0.08);
    } else if (hole === 'square') {
      g.fillRect(W * 0.41, H * 0.41, W * 0.18, H * 0.18);
    } else if (hole === 'wing') {
      path(g, [[W * 0.3, H * 0.42], [W * 0.5, H * 0.52], [W * 0.7, H * 0.42], [W * 0.5, H * 0.66]], null, 0, true, '#0d0b09');
    } else if (hole === 'skull') {
      disc(g, W / 2, H * 0.46, W * 0.12, '#0d0b09');
      disc(g, W * 0.45, H * 0.45, W * 0.03, color);
      disc(g, W * 0.55, H * 0.45, W * 0.03, color);
      g.fillStyle = '#0d0b09';
      g.fillRect(W * 0.46, H * 0.55, W * 0.08, H * 0.12);
    } else if (hole === 'ankh') {
      ring(g, W / 2, H * 0.38, W * 0.06, '#0d0b09', 6);
      g.fillRect(W * 0.47, H * 0.44, W * 0.06, H * 0.26);
      g.fillRect(W * 0.4, H * 0.5, W * 0.2, H * 0.05);
    } else {
      disc(g, W / 2, H * 0.44, W * 0.06, '#0d0b09');
      path(g, [[W * 0.47, H * 0.46], [W * 0.44, H * 0.64], [W * 0.56, H * 0.64], [W * 0.53, H * 0.46]], null, 0, true, '#0d0b09');
    }
  };
}

function gemHole(g, W, H) {
  plate(g, W * 0.25, H * 0.2, W * 0.5, H * 0.6, STONE_DARK);
  path(g, [[W / 2, H * 0.32], [W * 0.62, H / 2], [W / 2, H * 0.68], [W * 0.38, H / 2]], 'rgb(0 0 0 / 0.6)', 4, true, '#0d0b09');
}

function torchHolder(full) {
  return (g, W, H) => {
    // Bracket: a ring on an arm fixed to the wall.
    plate(g, W * 0.42, H * 0.62, W * 0.16, H * 0.2, IRON_DARK);
    path(g, [[W / 2, H * 0.66], [W / 2, H * 0.56]], IRON_LIGHT, W * 0.05);
    ring(g, W / 2, H * 0.52, W * 0.11, IRON_LIGHT, W * 0.04);
    if (!full) return;
    // Torch: a wooden stick and its flame.
    rect(g, W * 0.46, H * 0.3, W * 0.08, H * 0.32, WOOD, WOOD_DARK, 2);
    const flame = g.createRadialGradient(W / 2, H * 0.24, 2, W / 2, H * 0.22, W * 0.2);
    flame.addColorStop(0, '#fff6c8');
    flame.addColorStop(0.35, '#ffc040');
    flame.addColorStop(0.7, 'rgb(230 90 20 / 0.8)');
    flame.addColorStop(1, 'rgb(200 40 0 / 0)');
    g.fillStyle = flame;
    g.beginPath();
    g.ellipse(W / 2, H * 0.2, W * 0.15, H * 0.2, 0, 0, Math.PI * 2);
    g.fill();
  };
}

// Champion mirror: a gilded frame, a bluish reflection.
function mirror(g, W, H) {
  rect(g, W * 0.12, H * 0.04, W * 0.76, H * 0.92, BRASS, '#5a4416', 6);
  const glass = g.createLinearGradient(0, 0, W, H);
  glass.addColorStop(0, '#9fb6c8');
  glass.addColorStop(0.5, '#4a5f72');
  glass.addColorStop(1, '#1e2a36');
  rect(g, W * 0.2, H * 0.1, W * 0.6, H * 0.8, glass);
  path(g, [[W * 0.28, H * 0.2], [W * 0.42, H * 0.14]], 'rgb(255 255 255 / 0.55)', 5);
  path(g, [[W * 0.27, H * 0.3], [W * 0.5, H * 0.18]], 'rgb(255 255 255 / 0.3)', 4);
}

function coinSlot(g, W, H) {
  plate(g, W * 0.25, H * 0.2, W * 0.5, H * 0.6, BRASS);
  rect(g, W * 0.46, H * 0.32, W * 0.08, H * 0.36, '#0d0b09');
}

// Fountain: a lion's head spitting water into a basin.
function fountain(g, W, H) {
  disc(g, W / 2, H * 0.3, W * 0.16, STONE, STONE_DARK, 4);
  disc(g, W * 0.44, H * 0.26, W * 0.025, '#111');
  disc(g, W * 0.56, H * 0.26, W * 0.025, '#111');
  disc(g, W / 2, H * 0.38, W * 0.04, '#111');
  rect(g, W * 0.485, H * 0.4, W * 0.03, H * 0.38, 'rgb(120 170 220 / 0.85)');
  path(g, [[W * 0.15, H * 0.72], [W * 0.85, H * 0.72], [W * 0.75, H * 0.96], [W * 0.25, H * 0.96]], STONE_DARK, 4, true, STONE);
  g.fillStyle = 'rgb(80 140 200 / 0.9)';
  g.fillRect(W * 0.2, H * 0.72, W * 0.6, H * 0.06);
}

// Vi altar: a carved frame around the alcove (the niche itself is geometry).
function viAltar(g, W, H) {
  g.lineWidth = W * 0.05;
  g.strokeStyle = STONE;
  g.strokeRect(W * 0.08, H * 0.1, W * 0.84, H * 0.84);
  g.strokeStyle = STONE_DARK;
  g.lineWidth = 3;
  g.strokeRect(W * 0.05, H * 0.07, W * 0.9, H * 0.9);
  g.font = `bold ${Math.round(H * 0.12)}px serif`;
  g.textAlign = 'center';
  g.fillStyle = '#d8c890';
  g.fillText('VI', W / 2, H * 0.08 + H * 0.1);
}

// Amalgam: the statue's gem, missing, free, or encased.
function amalgam(state) {
  return (g, W, H) => {
    path(g, [[W * 0.3, H * 0.95], [W * 0.36, H * 0.15], [W * 0.64, H * 0.15], [W * 0.7, H * 0.95]], STONE_DARK, 4, true, '#6a5f52');
    disc(g, W / 2, H * 0.4, W * 0.11, '#1a1714');
    if (state === 'without') return;
    path(g, [[W / 2, H * 0.29], [W * 0.59, H * 0.4], [W / 2, H * 0.51], [W * 0.41, H * 0.4]], '#e0f0ff', 3, true, state === 'encased' ? '#3a8ac8' : '#7ad0ff');
    if (state === 'encased') ring(g, W / 2, H * 0.4, W * 0.12, BRASS, 6);
  };
}

function lordOrder(g, W, H) {
  disc(g, W / 2, H / 2, W * 0.38, '#2a2a32', BRASS, 8);
  path(g, [[W / 2, H * 0.2], [W * 0.66, H * 0.5], [W / 2, H * 0.8], [W * 0.34, H * 0.5]], '#e8e0c8', 5, true);
  disc(g, W / 2, H / 2, W * 0.06, '#e8e0c8');
}

// Holes of a missile shooter: a pattern of dark holes, tinted by what comes out.
function holes(count, tint) {
  return (g, W, H) => {
    plate(g, W * 0.1, H * 0.25, W * 0.8, H * 0.5, STONE_DARK);
    for (let i = 0; i < count; i++) {
      const x = W * (0.2 + (0.6 * i) / Math.max(1, count - 1));
      disc(g, count === 1 ? W / 2 : x, H / 2, W * 0.06, '#0d0b09', tint, 3);
    }
  };
}

// --- Decorative wall ornaments ----------------------------------------------------------------

function slime(g, W, H) {
  const rand = random(3);
  g.fillStyle = 'rgb(90 140 40 / 0.85)';
  g.fillRect(W * 0.1, 0, W * 0.8, H * 0.08);
  for (let i = 0; i < 9; i++) {
    const x = W * (0.12 + rand() * 0.76);
    const len = H * (0.2 + rand() * 0.6);
    g.fillRect(x - 5, 0, 10, len);
    disc(g, x, len, 9, 'rgb(90 140 40 / 0.85)');
  }
}

function hook(g, W, H) {
  plate(g, W * 0.42, H * 0.2, W * 0.16, H * 0.14, IRON_DARK);
  path(g, [[W / 2, H * 0.3], [W / 2, H * 0.6], [W * 0.62, H * 0.72], [W * 0.68, H * 0.6]], IRON_LIGHT, W * 0.05);
}

function crack(g, W, H) {
  path(g, [[W * 0.3, H * 0.05], [W * 0.42, H * 0.3], [W * 0.36, H * 0.48], [W * 0.55, H * 0.66], [W * 0.5, H * 0.95]], 'rgb(10 8 6 / 0.85)', 6);
  path(g, [[W * 0.42, H * 0.3], [W * 0.6, H * 0.36]], 'rgb(10 8 6 / 0.85)', 4);
}

function wallRing(color, dark) {
  return (g, W, H) => {
    plate(g, W * 0.42, H * 0.18, W * 0.16, H * 0.14, IRON_DARK);
    ring(g, W / 2, H * 0.55, W * 0.2, dark, W * 0.08);
    ring(g, W / 2, H * 0.55, W * 0.2, color, W * 0.05);
  };
}

function manacles(g, W, H) {
  for (const x of [0.3, 0.7]) {
    plate(g, W * (x - 0.06), H * 0.1, W * 0.12, H * 0.1, IRON_DARK);
    path(g, [[W * x, H * 0.18], [W * x, H * 0.5]], IRON, 5);
    ring(g, W * x, H * 0.62, W * 0.1, IRON_LIGHT, 8);
  }
}

function grate(g, W, H) {
  rect(g, W * 0.15, H * 0.2, W * 0.7, H * 0.6, '#0d0b09', IRON, 6);
  for (let i = 1; i < 6; i++) rect(g, W * (0.15 + (0.7 * i) / 6) - 3, H * 0.2, 6, H * 0.6, IRON);
}

function ghoulHead(g, W, H) {
  disc(g, W / 2, H * 0.45, W * 0.3, '#9a9278', STONE_DARK, 5);
  disc(g, W * 0.38, H * 0.4, W * 0.07, '#1a1410');
  disc(g, W * 0.62, H * 0.4, W * 0.07, '#1a1410');
  path(g, [[W * 0.35, H * 0.62], [W * 0.65, H * 0.62]], '#1a1410', 8);
  for (let i = 0; i < 5; i++) rect(g, W * (0.37 + i * 0.06), H * 0.6, 4, H * 0.06, '#e8e0c8');
}

// Slime outlet: a drain in the wall, with green ooze.
function slimeOutlet(g, W, H) {
  g.beginPath();
  g.ellipse(W / 2, H * 0.6, W * 0.28, H * 0.18, 0, 0, Math.PI * 2);
  g.fillStyle = '#0d0b09';
  g.fill();
  for (let i = -2; i <= 2; i++) rect(g, W / 2 + i * W * 0.1 - 3, H * 0.44, 6, H * 0.32, IRON);
  g.fillStyle = 'rgb(90 140 40 / 0.85)';
  g.fillRect(W * 0.32, H * 0.76, W * 0.36, H * 0.05);
  rect(g, W * 0.46, H * 0.76, W * 0.06, H * 0.2, 'rgb(90 140 40 / 0.85)');
}

function dent(g, W, H) {
  g.beginPath();
  g.ellipse(W / 2, H / 2, W * 0.3, H * 0.22, -0.3, 0, Math.PI * 2);
  g.fillStyle = 'rgb(0 0 0 / 0.35)';
  g.fill();
}

function scratches(g, W, H) {
  for (let i = 0; i < 4; i++) path(g, [[W * (0.25 + i * 0.12), H * 0.2], [W * (0.35 + i * 0.12), H * 0.8]], 'rgb(10 8 6 / 0.7)', 4);
}

// name -> { w, h, y, draw }: size and height of the plane on the face.
const small = (draw) => ({ w: 0.24, h: 0.24, y: 0.42, draw });
const medium = (draw) => ({ w: 0.36, h: 0.36, y: 0.36, draw });

export const WALL_ART = {
  'Empty Torch Holder': { w: 0.3, h: 0.5, y: 0.35, draw: torchHolder(false) },
  'Full Torch Holder': { w: 0.3, h: 0.5, y: 0.35, draw: torchHolder(true) },
  'Champion Mirror': { w: 0.5, h: 0.6, y: 0.25, draw: mirror },
  'Lever Up': { w: 0.24, h: 0.44, y: 0.3, draw: lever(true) },
  'Lever Down': { w: 0.24, h: 0.44, y: 0.3, draw: lever(false) },
  'Coin Slot': small(coinSlot),
  'Gem Hole': small(gemHole),
  Fountain: { w: 0.5, h: 0.6, y: 0.18, draw: fountain },
  'Vi Altar': { w: 0.62, h: 0.56, y: 0.27, draw: viAltar }, // frames the alcove niche
  'Amalgam (Without Gem)': { w: 0.5, h: 0.8, y: 0.1, draw: amalgam('without') },
  'Amalgam (Free Gem)': { w: 0.5, h: 0.8, y: 0.1, draw: amalgam('free') },
  'Amalgam (Encased Gem)': { w: 0.5, h: 0.8, y: 0.1, draw: amalgam('encased') },
  'Lord Order (Outside)': medium(lordOrder),
  'Fireball Holes': { w: 0.5, h: 0.24, y: 0.5, draw: holes(3, '#c85a20') },
  'Poison Holes': { w: 0.5, h: 0.24, y: 0.5, draw: holes(3, '#5aa040') },
  'Dagger Holes': { w: 0.5, h: 0.24, y: 0.5, draw: holes(4, IRON_LIGHT) },
  'Eye Switch': small(eyeSwitch),
  'Crack Switch In': medium(crackSwitch(true)),
  'Crack Switch Out': medium(crackSwitch(false)),
  'Big Switch In': medium(switchArt(SWITCH_COLORS.Big, true)),
  'Big Switch Out': medium(switchArt(SWITCH_COLORS.Big, false)),
  'Small Switch': small(switchArt(SWITCH_COLORS.Small, false)),
  'Tiny Switch': { w: 0.14, h: 0.14, y: 0.47, draw: switchArt(SWITCH_COLORS.Tiny, false) },
  Slime: { w: 0.8, h: 0.5, y: 0.5, draw: slime },
  Hook: small(hook),
  Crack: { w: 0.5, h: 0.7, y: 0.15, draw: crack },
  'Wood Ring': small(wallRing(WOOD, WOOD_DARK)),
  'Iron Ring': small(wallRing(IRON_LIGHT, IRON_DARK)),
  Manacles: medium(manacles),
  Grate: { w: 0.44, h: 0.3, y: 0.08, draw: grate },
  "Ghoul's Head": medium(ghoulHead),
  'Slime Outlet': { w: 0.44, h: 0.4, y: 0.05, draw: slimeOutlet },
  'Dent 1': medium(dent),
  Scratches: medium(scratches),
};
for (const color of ['Green', 'Red', 'Blue']) {
  WALL_ART[`${color} Switch In`] = small(switchArt(SWITCH_COLORS[color], true));
  WALL_ART[`${color} Switch Out`] = small(switchArt(SWITCH_COLORS[color], false));
}
const LOCK_HOLES = { Cross: 'cross', Square: 'square', Winged: 'wing', Skeleton: 'skull', Ra: 'ankh' };
for (const [name, color] of Object.entries(LOCK_COLORS)) WALL_ART[`${name} Lock`] = small(lock(color, LOCK_HOLES[name]));

// Ornaments drawn as geometry (the alcove niche), not as a plane.
export const NICHE_ORNAMENTS = new Set(['Square Alcove', 'Arched Alcove', 'Vi Altar']);

// --- Floor ornaments (seen from above) ----------------------------------------------------------

function pad(shape) {
  return (g, W, H) => {
    if (shape === 'round') {
      disc(g, W / 2, H / 2, W * 0.42, STONE, STONE_DARK, 6);
      ring(g, W / 2, H / 2, W * 0.3, 'rgb(0 0 0 / 0.25)', 4);
    } else {
      plate(g, W * 0.06, H * 0.06, W * 0.88, H * 0.88, STONE);
    }
  };
}

function moss(g, W, H) {
  const rand = random(5);
  for (let i = 0; i < 26; i++) disc(g, W * (0.15 + rand() * 0.7), H * (0.15 + rand() * 0.7), W * (0.04 + rand() * 0.08), `rgb(${60 + rand() * 30} ${110 + rand() * 40} 50 / 0.8)`);
}

function puddle(g, W, H) {
  g.beginPath();
  g.ellipse(W / 2, H / 2, W * 0.4, H * 0.28, 0.4, 0, Math.PI * 2);
  g.fillStyle = 'rgb(60 90 120 / 0.75)';
  g.fill();
  path(g, [[W * 0.36, H * 0.42], [W * 0.5, H * 0.36]], 'rgb(220 235 255 / 0.5)', 4);
}

function floorGrate(shape) {
  return (g, W, H) => {
    if (shape === 'round') disc(g, W / 2, H / 2, W * 0.42, '#0d0b09', IRON, 8);
    else rect(g, W * 0.1, H * 0.1, W * 0.8, H * 0.8, '#0d0b09', IRON, 8);
    g.save();
    if (shape === 'round') {
      g.beginPath();
      g.arc(W / 2, H / 2, W * 0.42, 0, Math.PI * 2);
      g.clip();
    }
    for (let i = 1; i < 6; i++) rect(g, W * (0.1 + (0.8 * i) / 6) - 4, H * 0.08, 8, H * 0.84, IRON);
    g.restore();
  };
}

function blackFlamePit(g, W, H) {
  disc(g, W / 2, H / 2, W * 0.42, '#08060a', '#2a2030', 6);
  const flame = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.38);
  flame.addColorStop(0, 'rgb(150 90 200 / 0.6)');
  flame.addColorStop(1, 'rgb(20 10 30 / 0)');
  disc(g, W / 2, H / 2, W * 0.38, flame);
}

// name -> { size, draw }: size of the decal (tiles).
export const FLOOR_ART = {
  'Square Pressure Pad': { size: 0.62, draw: pad('square') },
  'Round Pressure Plate': { size: 0.62, draw: pad('round') },
  'Tiny Pressure Pad': { size: 0.32, draw: pad('square') },
  Moss: { size: 0.8, draw: moss },
  Crack: { size: 0.8, draw: crack },
  Puddle: { size: 0.7, draw: puddle },
  'Square Grate': { size: 0.6, draw: floorGrate('square') },
  'Round Grate': { size: 0.6, draw: floorGrate('round') },
  'Black Flame Pit': { size: 0.8, draw: blackFlamePit },
};

// --- Doors --------------------------------------------------------------------------------------

// The leaf of each door type, filling the canvas (transparent where one sees through).
export const DOOR_TYPES = {
  Porticullis(g, W, H) {
    for (let i = 0; i < 7; i++) rect(g, W * (0.04 + i * 0.15), 0, W * 0.05, H, IRON, IRON_DARK, 2);
    for (let j = 0; j < 5; j++) rect(g, 0, H * (0.06 + j * 0.22), W, H * 0.04, IRON, IRON_DARK, 2);
  },
  Wooden(g, W, H) {
    for (let i = 0; i < 6; i++) rect(g, (W * i) / 6, 0, W / 6, H, i % 2 ? WOOD : '#83603a', WOOD_DARK, 3);
    for (const y of [0.15, 0.82]) rect(g, 0, H * y, W, H * 0.06, IRON, IRON_DARK, 2);
  },
  Ra(g, W, H) {
    rect(g, 0, 0, W, H, '#5a4a2a', '#2a2010', 8);
    ring(g, W / 2, H / 2, W * 0.3, BRASS, 8);
  },
  Iron(g, W, H) {
    rect(g, 0, 0, W, H, IRON, IRON_DARK, 8);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) disc(g, W * (0.15 + i * 0.23), H * (0.12 + j * 0.25), 5, IRON_LIGHT);
  },
};

// The ornaments drawn over a door leaf.
export const DOOR_ART = {
  'Arched Grid'(g, W, H) {
    g.save();
    g.beginPath();
    g.moveTo(W * 0.3, H * 0.55);
    g.lineTo(W * 0.3, H * 0.3);
    g.arc(W / 2, H * 0.3, W * 0.2, Math.PI, 0);
    g.lineTo(W * 0.7, H * 0.55);
    g.closePath();
    g.fillStyle = '#0d0b09';
    g.fill();
    g.clip();
    for (let i = 0; i < 4; i++) rect(g, W * (0.34 + i * 0.1), 0, 5, H, IRON);
    g.restore();
  },
  'Square Grid'(g, W, H) {
    rect(g, W * 0.3, H * 0.2, W * 0.4, H * 0.3, '#0d0b09', IRON, 5);
    for (let i = 1; i < 4; i++) rect(g, W * (0.3 + i * 0.1) - 2, H * 0.2, 5, H * 0.3, IRON);
    rect(g, W * 0.3, H * 0.35 - 2, W * 0.4, 5, IRON);
  },
  'Wooden Bars'(g, W, H) {
    for (const y of [0.3, 0.45, 0.6]) rect(g, W * 0.05, H * y, W * 0.9, H * 0.06, WOOD_DARK, '#2a1a0a', 2);
  },
  'Iron Bars'(g, W, H) {
    for (let i = 0; i < 5; i++) rect(g, W * (0.2 + i * 0.15), H * 0.08, W * 0.04, H * 0.84, IRON_DARK);
  },
  'Red Triangle Lock'(g, W, H) {
    path(g, [[W / 2, H * 0.38], [W * 0.62, H * 0.6], [W * 0.38, H * 0.6]], '#2a0a08', 4, true, '#b8392d');
  },
  Jewels(g, W, H) {
    ['#b0283a', '#2f9a5a', '#3a68b8', '#c9a23e'].forEach((color, i) => disc(g, W * (0.3 + i * 0.13), H * 0.3, W * 0.04, color, '#111', 2));
  },
  'Corner Lock'(g, W, H) {
    for (const [x, y] of [[0.08, 0.06], [0.82, 0.06], [0.08, 0.86], [0.82, 0.86]]) plate(g, W * x, H * y, W * 0.1, H * 0.08, BRASS);
  },
  'Ra Door Energy'(g, W, H) {
    const energy = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.45);
    energy.addColorStop(0, 'rgb(255 230 140 / 0.9)');
    energy.addColorStop(1, 'rgb(255 160 40 / 0)');
    disc(g, W / 2, H / 2, W * 0.45, energy);
  },
  'Block Lock'(g, W, H) {
    plate(g, W * 0.4, H * 0.42, W * 0.2, H * 0.16, IRON_DARK);
  },
  'Black door (Dungeon Entrance)'(g, W, H) {
    rect(g, W * 0.06, H * 0.04, W * 0.88, H * 0.92, 'rgb(10 8 6 / 0.85)');
  },
  'Iron Door Damages'(g, W, H) {
    dent(g, W, H);
    scratches(g, W, H);
  },
};

// Button of a door with one: on the right of the leaf, half-way up.
export function doorButton(g, W, H) {
  plate(g, W * 0.86, H * 0.44, W * 0.1, H * 0.1, IRON_DARK);
  disc(g, W * 0.91, H * 0.49, W * 0.03, '#b8392d', '#2a0a08', 2);
}
