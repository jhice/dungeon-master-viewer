// The champion's box over the first-person view, top left, as in DM (phase C3a, docs/023):
// his name, his two hands (the action hand holds the item in hand) and three bars
// (health, stamina, mana). Below, the action "Frapper"; after a strike, it shows the
// damage done, as the action area of DM does. A hit taken shows the damage on the box.
// When the champion dies, a veil covers the view with a "Recommencer" button.

const DAMAGE_MS = 900;

/**
 * @param {HTMLElement} container the game viewport
 * @param {object} options
 * @param {() => void} options.onAction the action button
 * @param {() => void} options.onRestart the button of the death veil
 */
export function createChampionPanel(container, { onAction, onRestart }) {
  const panel = element('div', 'champion-panel');
  const box = element('div', 'champion-box');
  const name = element('div', 'champion-name');
  const hands = element('div', 'champion-hands');
  const readyHand = element('span', 'champion-hand');
  const actionHand = element('span', 'champion-hand is-action');
  hands.append(readyHand, actionHand);
  const bars = element('div', 'champion-bars');
  const bar = (kind, label) => {
    const outer = element('span', `champion-bar is-${kind}`);
    outer.title = label;
    const fill = element('i');
    outer.append(fill);
    bars.append(outer);
    return { outer, fill, label };
  };
  const health = bar('health', 'Santé');
  const stamina = bar('stamina', 'Endurance');
  const mana = bar('mana', 'Mana');
  const body = element('div', 'champion-body');
  body.append(hands, bars);
  const wound = element('div', 'champion-wound');
  wound.hidden = true;
  box.append(name, body, wound);

  const action = element('button', 'champion-action');
  action.type = 'button';
  action.textContent = 'Frapper';
  action.title = 'Frapper la créature en face (Espace, ou clic sur la créature)';
  action.addEventListener('click', () => {
    onAction();
    action.blur(); // keep the keyboard for the game
  });
  panel.append(box, action);

  const veil = element('div', 'champion-dead');
  veil.hidden = true;
  const veilText = element('p');
  const restart = element('button');
  restart.type = 'button';
  restart.textContent = 'Recommencer';
  restart.addEventListener('click', () => {
    onRestart();
    restart.blur();
  });
  veil.append(veilText, restart);
  container.append(panel, veil);

  let woundTimer = 0;
  let damageTimer = 0;
  let ready = true;

  // `scale`: stored / shown (stamina is stored ×10).
  const setBar = ({ outer, fill, label }, value, max, scale = 1) => {
    fill.style.height = `${max ? Math.round((100 * value) / max) : 0}%`;
    outer.title = `${label} : ${Math.floor(value / scale)} / ${Math.floor(max / scale)}`;
  };

  return {
    /** Shows the champion ({ name, health, stamina (×10), mana… }) and the item in hand ({ name, color } or null). */
    update(champion, hand) {
      name.textContent = champion.name;
      name.title = `${champion.name}, ${champion.title}`;
      setBar(health, champion.health, champion.maxHealth);
      setBar(stamina, champion.stamina, champion.maxStamina, 10);
      setBar(mana, champion.mana, champion.maxMana);
      actionHand.style.setProperty('--c', hand?.color ?? 'transparent');
      actionHand.classList.toggle('is-empty', !hand);
      actionHand.title = `Main d’action : ${hand ? hand.name : 'vide'}`;
      readyHand.classList.add('is-empty');
      readyHand.title = 'Main gauche : vide';
      box.classList.toggle('is-dead', champion.dead);
      veil.hidden = !champion.dead;
      veilText.textContent = `${champion.name} est mort`;
    },
    /** The champion can act (no fatigue): the action button is enabled. */
    setReady(value) {
      if (value === ready) return;
      ready = value;
      action.classList.toggle('is-tired', !ready);
    },
    /** Result of a strike, in the action area: the damage done, or a word. */
    showStrike(text) {
      clearTimeout(damageTimer);
      action.textContent = text;
      action.classList.add('is-result');
      damageTimer = setTimeout(() => {
        action.textContent = 'Frapper';
        action.classList.remove('is-result');
      }, DAMAGE_MS);
    },
    /** Damage taken by the champion: shown on his box. */
    wounded(damage) {
      clearTimeout(woundTimer);
      wound.textContent = String(damage);
      wound.hidden = false;
      woundTimer = setTimeout(() => (wound.hidden = true), DAMAGE_MS);
    },
    dispose() {
      clearTimeout(woundTimer);
      clearTimeout(damageTimer);
      panel.remove();
      veil.remove();
    },
  };
}

function element(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
