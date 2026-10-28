// Light of the party (phase H1, docs/032): how much light there is around the party and which
// torches burn. No rendering here: the first-person view will turn the amount into lights (H2).
// ReDMCSB: F337_INVENTORY_SetDungeonViewPalette, F338_INVENTORY_DecreaseTorchesLightPower
// (INVNTORY.C), F257_TIMELINE_ProcessEvent70_Light (TIMELINE.C), F301 / F300 (CHAMPION.C:
// a torch is lit when put in a hand, put out when taken from it), MAIN.C (wear every 512 ticks).
// The two tables are in graphics.dat (item 562), not in the code: values of the DM engine of
// ScummVM (engines/dm/champion.cpp and inventory.cpp).

// Light amount of a light power (a torch's charges, 0..15, or a spell's power).
export const LIGHT_POWER_TO_AMOUNT = [0, 5, 12, 24, 33, 40, 46, 51, 59, 68, 76, 82, 89, 94, 97, 100];
// Minimum light amount of each of the 6 palettes of the view, from the brightest (0) to black (5).
export const PALETTE_LIGHT_AMOUNTS = [99, 75, 50, 25, 1, 0];
export const TORCH = 2; // weapon type
export const TORCH_WEAR_TICKS = 512;
const MAGICAL_DECAY_TICKS = 4;
const FULL = 100;

/** Palette index (0 brightest .. 5 black) of a total light amount (F337). */
export function paletteOf(amount) {
  if (amount <= 0) return 5;
  let palette = 0;
  while (PALETTE_LIGHT_AMOUNTS[palette] > amount) palette++;
  return palette;
}

/**
 * Light amount of the torches held in hand (F337): sorted by power (charges), the strongest
 * counts whole, the next one half, then a quarter, an eighth, a sixteenth; empty torches don't count.
 */
export function torchesLightAmount(charges) {
  let multiplier = 6;
  let total = 0;
  for (const power of [...charges].sort((a, b) => b - a).slice(0, 5)) {
    if (!power) continue;
    total += (LIGHT_POWER_TO_AMOUNT[power] << multiplier) >> 6;
    multiplier = Math.max(0, multiplier - 1);
  }
  return total;
}

/**
 * @param {import('../core/dungeon.js').Dungeon} dungeon
 * @param {ReturnType<import('./state.js').createState>} state
 * @param {ReturnType<import('./clock.js').createClock>} clock
 * @param {object} hooks
 * @param {(type: string, payload: object) => void} hooks.emit 'lightChanged', 'torchesWorn'
 * @param {() => object} hooks.party
 */
export function createLight(dungeon, state, clock, { emit, party }) {
  const weapons = dungeon.data.weapons;
  let magical; // light amount of spells (Torch, Light…), F257
  let lit; // torch entries lit (in a hand)
  let shown; // key of the last light emitted

  // Torches in the champion's hands (ready 0, action 1): the cursor's torch does not burn (doc 029, Q5).
  const handTorches = () =>
    state.hands.flatMap((item, hand) => (item?.kind === 'weapon' && weapons[item.index].type === TORCH ? [{ hand, item, entry: weapons[item.index] }] : []));

  /**
   * The light now: { amount, palette, permanent, torches: [{ hand, item, charges }], magical }.
   * A level of difficulty 0 (the Hall) is always lit at the brightest: amount 100.
   */
  function current() {
    const torches = handTorches().map(({ hand, item, entry }) => ({ hand, item, charges: entry.charges }));
    const permanent = dungeon.level(party().level).difficulty === 0;
    const amount = permanent ? FULL : torchesLightAmount(torches.map((t) => t.charges)) + magical;
    return { amount, palette: permanent ? 0 : paletteOf(amount), permanent, torches, magical };
  }

  // Lights the torches in hand, puts out the others, and tells the views when the light changed.
  function update() {
    const now = new Set(handTorches().map((t) => t.entry));
    for (const entry of lit) if (!now.has(entry)) entry.lit = false;
    for (const entry of now) entry.lit = true;
    lit = now;
    const light = current();
    const key = `${light.amount}|${light.torches.map((t) => `${t.hand}:${t.charges}`).join()}`;
    if (key === shown) return;
    shown = key;
    emit('lightChanged', light);
  }

  /** A tick: every 512 ticks, each torch in hand loses a charge (F338); at 0 it is burnt out. */
  function tick() {
    if (clock.now % TORCH_WEAR_TICKS === 0) {
      const worn = handTorches().filter(({ entry }) => entry.charges > 0);
      for (const { entry } of worn) entry.charges--;
      if (worn.length) emit('torchesWorn', { torches: worn.map(({ hand, item, entry }) => ({ hand, item, charges: entry.charges })) });
    }
    update();
  }

  /**
   * Magical light (spells Torch, Light; doc 029 § 1): adds the amount of `power` for `ticks`,
   * then fades one power step every 4 ticks (F404 then F257). A negative `power` takes light
   * away for `ticks` (Darkness), then gives it back.
   */
  function addMagical(power, ticks) {
    const p = Math.abs(power);
    magical += Math.sign(power) * LIGHT_POWER_TO_AMOUNT[p];
    clock.schedule(ticks, () => fade(-power));
    update();
  }

  // F257: one step of a magical light; `power` < 0: a light fading, > 0: a darkness lifting.
  function fade(power) {
    if (!power) return;
    const p = Math.abs(power);
    const step = LIGHT_POWER_TO_AMOUNT[p] - LIGHT_POWER_TO_AMOUNT[p - 1];
    magical += power < 0 ? -step : step;
    if (p > 1) clock.schedule(MAGICAL_DECAY_TICKS, () => fade(power < 0 ? -(p - 1) : p - 1));
    update();
  }

  function reset() {
    magical = 0;
    lit = new Set();
    shown = null;
  }
  reset();

  return { current, update, tick, addMagical, reset };
}
