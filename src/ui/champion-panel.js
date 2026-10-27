// The champion's box over the first-person view, top left, as in DM (docs/023, 024): his
// name, his two hands and three bars (health, stamina, mana). A click on a hand swaps
// the item held by the cursor with the item of the hand. Below, the action panel of the
// action hand (right): one button per action ("Frapper", "Lancer"), disabled while the
// champion recovers from his last action (its fatigue, as in DM); after an action, the
// damage done shows for a moment above them, as the action area of DM does. A hit taken shows
// the damage on the box. When the champion dies, a veil covers the view with a
// "Recommencer" button.

const RESULT_MS = 900;
const HAND_LABELS = ['Main gauche', 'Main droite (action)'];

/**
 * @param {HTMLElement} container the game viewport
 * @param {object} options
 * @param {(id: string) => void} options.onAction an action button ('hit', 'throw')
 * @param {(hand: number) => void} options.onHand a hand was clicked (0 left, 1 right)
 * @param {() => void} options.onRestart the button of the death veil
 */
export function createChampionPanel(container, { onAction, onHand, onRestart }) {
  const panel = element('div', 'champion-panel');
  const box = element('div', 'champion-box');
  const name = element('div', 'champion-name');
  const hands = element('div', 'champion-hands');
  const handSlots = HAND_LABELS.map((_, i) => {
    const slot = element('button', `champion-hand${i === 1 ? ' is-action' : ''}`);
    slot.type = 'button';
    slot.addEventListener('click', () => {
      onHand(i);
      slot.blur(); // keep the keyboard for the game
    });
    hands.append(slot);
    return slot;
  });
  const bars = element('div', 'champion-bars');
  const bar = (kind, label) => {
    const outer = element('span', `champion-bar is-${kind}`);
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

  // Action panel: the actions of the action hand, or the result of the last one.
  const actions = element('div', 'champion-actions');
  const result = element('div', 'champion-result');
  result.hidden = true;
  panel.append(box, result, actions);

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
  let resultTimer = 0;
  let ready = true;
  let shownActions = '';

  // `scale`: stored / shown (stamina is stored ×10).
  const setBar = ({ outer, fill, label }, value, max, scale = 1) => {
    fill.style.height = `${max ? Math.round((100 * value) / max) : 0}%`;
    outer.title = `${label} : ${Math.floor(value / scale)} / ${Math.floor(max / scale)}`;
  };

  return {
    /**
     * Shows the champion ({ name, health, stamina (×10), mana… }), his hands
     * ([{ name, color } or null, …]) and the actions of the action hand ([{ id, name }]).
     */
    update(champion, handItems, actionList) {
      name.textContent = champion.name;
      name.title = `${champion.name}, ${champion.title}`;
      setBar(health, champion.health, champion.maxHealth);
      setBar(stamina, champion.stamina, champion.maxStamina, 10);
      setBar(mana, champion.mana, champion.maxMana);
      handSlots.forEach((slot, i) => {
        const item = handItems[i];
        slot.style.setProperty('--c', item?.color ?? 'transparent');
        slot.classList.toggle('is-empty', !item);
        slot.title = `${HAND_LABELS[i]} : ${item ? item.name : 'vide'} (clic : échanger avec l’objet tenu)`;
      });
      const key = actionList.map((a) => a.id).join();
      if (key !== shownActions) {
        shownActions = key;
        actions.replaceChildren(
          ...actionList.map(({ id, name: label }) => {
            const button = element('button', 'champion-action');
            button.type = 'button';
            button.disabled = !ready;
            button.textContent = label;
            button.addEventListener('click', () => {
              onAction(id);
              button.blur();
            });
            return button;
          }),
        );
        if (!actionList.length) {
          const none = element('span', 'champion-no-action');
          none.textContent = 'Aucune action';
          actions.append(none);
        }
      }
      box.classList.toggle('is-dead', champion.dead);
      veil.hidden = !champion.dead;
      veilText.textContent = `${champion.name} est mort`;
    },
    /** The champion can act (no fatigue): the action buttons are enabled. */
    setReady(value) {
      if (value === ready) return;
      ready = value;
      for (const button of actions.querySelectorAll('button')) button.disabled = !ready;
    },
    /** Result of an action, in the action area: the damage done, or a word. */
    showResult(text) {
      clearTimeout(resultTimer);
      result.textContent = text;
      result.hidden = false;
      resultTimer = setTimeout(() => (result.hidden = true), RESULT_MS);
    },
    /** Damage taken by the champion: shown on his box. */
    wounded(damage) {
      clearTimeout(woundTimer);
      wound.textContent = String(damage);
      wound.hidden = false;
      woundTimer = setTimeout(() => (wound.hidden = true), RESULT_MS);
    },
    dispose() {
      clearTimeout(woundTimer);
      clearTimeout(resultTimer);
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
