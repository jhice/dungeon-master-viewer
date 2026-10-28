# 031 — Sorts, phase G2 : flasques et potions

> Deuxième sous-phase du plan [029-sorts-et-lumiere-plan.md](029-sorts-et-lumiere-plan.md), après [030-sorts-phase-g1.md](030-sorts-phase-g1.md). Suivante : H1 (modèle de lumière).
> Sources : ReDMCSB `MENUS.C` (`F408`, `F411`, `F412`), `INVNTORY.C` (`F349`) et `DEFS.H` (types de potions). Voir [000-sources.md](000-sources.md).

## 1. Ce qui est fait

- Les **10 sorts de potion** remplissent une flasque vide :
  - les 9 du prêtre ;
  - Poison Potion (Zo Ven), du magicien (doc 029, Q1).
- On **boit** la potion tenue au curseur en cliquant sur le cadre de Zed, hors de ses mains. C'est la bouche de l'inventaire de DM.

| Fichier | Rôle |
|---|---|
| `src/sim/potions.js` | `emptyFlaskHand()`, `fillFlask()`, `drinkable()`, `drinkPotion()`, sans DOM |
| `src/sim/spells.js` | `castSpell(champion, now, effects)` : un sort de potion appelle `effects.potion()`. Sans flasque, la ligne reste |
| `src/sim/simulation.js` | `fillHandFlask()` (effet de potion), `sim.drink()`, événement `potionDrunk` |
| `src/sim/state.js` | Les potions de `dungeon.json` modifiées en jeu sont restaurées au `reset()` |
| `src/core/spell-info.js` | Chaque sort de potion porte le `type` de potion du moteur (`DEFS.H`) |
| `src/core/item-info.js` | Poids de la Ma Potion (11) et de l'Ee Potion (13), qu'on n'obtient que par un sort : 0,3 kg comme les autres |
| `src/ui/champion-panel.js` | Clic sur le cadre (hors mains) : `onMouth`. Les barres sont plafonnées à 100 % (l'Ee Potion dépasse le maximum de mana) |
| `src/ui/spell-panel.js` | L'infobulle de la ligne donne le coût en mana du sort, non décompté |
| `tools/test-spells.mjs` | 19 vérifications de plus (41 en tout) |

## 2. Règles du moteur reprises

**Flasque** (`F411`) : on cherche une Empty Flask (type 20) dans la **main d'action**, puis dans la **main de réserve**.
Une flasque tenue au curseur ou rangée dans l'inventaire ne compte pas.

**Sans flasque** (`F408`, `F412`) :
- message « Zed a besoin d'une flasque vide en main pour … » ;
- les **symboles restent**, pour qu'on prenne une flasque et relance ;
- pas de fatigue.

**Remplissage** (`F412`) : la flasque prend le type de la potion du sort et son nom (Vi Potion…).
Sa puissance vaut `random(16) + 40 × p`, où p = 1 (Lo) à 6 (Mon). Le tirage utilise le générateur de la simulation, celui du combat.

| Sort | Potion | Type |
|---|---|---|
| Vi | Vi Potion (santé) | 14 |
| Ya | Ma Potion (endurance) | 11 |
| Zo Bro Ra | Ee Potion (mana) | 13 |
| Ful Bro Ku | Ku Potion | 7 |
| Oh Bro Ros | Ros Potion | 6 |
| Ya Bro Dain | Dane Potion | 8 |
| Ya Bro Neta | Neta Potion | 9 |
| Vi Bro | Bro Potion | 10 |
| Ya Bro | Ya Potion | 12 |
| Zo Ven | Ven Potion | 3 |

**Boire** (`F349`) : la potion reste au curseur et devient une Empty Flask.
- **Ne se boivent pas** : une flasque vide, une Ful Bomb.
- **Formules**, avec `P` = puissance de la potion :
  - `compteur = ((511 − P) / (32 + (P + 1) / 8)) / 2` (divisions entières) ;
  - `ajusté = P / 25 + 8`.
- **Effets codés :**
  - **Vi** : santé + `max / compteur`, bornée au maximum. Les blessures ne sont pas encore modélisées ;
  - **Ma** : endurance + `min(manque, max / compteur)` (endurance stockée × 10, comme le moteur) ;
  - **Ee** : mana = `min(900, mana + ajusté + (ajusté − 8))`. Si le résultat dépasse le maximum, on retire la moitié du dépassement : le mana peut donc **passer au-dessus du maximum**, comme dans DM.
- **Effets pas encore codés** : Ku, Ros, Dane et Neta (caractéristiques), Bro (poison) et Ya (bouclier). Ces potions se boivent sans effet, avec le message « effet pas encore implémenté ».
  Dans DM, Ven Potion, Des Potion et Water Flask n'ont pas non plus d'effet sur la santé, l'endurance ou le mana.
- **Écart voulu :** DM garde l'ancienne puissance dans la flasque vidée (BUG0_49 de ReDMCSB). Ici, elle repasse à 0, pour que la flasque n'affiche plus de puissance.

## 3. Restauration au `reset()`

Les potions sont des entrées de `dungeon.data.potions`, partagées par les vues : on les modifie **en place**.
`createState()` garde une copie du type, de la puissance et du nom de chaque potion, et la remet à chaque `reset()`.
C'est le même principe que les objets créés en jeu, retirés des listes au reset (doc 025).

## 4. Mana

Le coût du sort est calculé (`spellManaCost`) et affiché dans l'infobulle de la ligne : « Lancer le sort : On Vi (9 mana, non décompté) ».
Il n'est pas retiré, car Zed n'a que 10 points de mana : les essais seraient trop lents.
Il suffira de décompter le coût symbole par symbole dans `addSymbol()`, comme `F399`.

## 5. Vérification

- **`node tools/test-spells.mjs` :**
  - sans flasque, puis flasque en main d'action et en main de réserve ;
  - puissance bornée (On : 120 à 135, Mon : 240 à 255) ;
  - les 10 sorts de potion aux puissances Lo et Mon ;
  - Zo Ven ;
  - reset ;
  - boire une Vi, une Ma, une Ee et une Ku Potion ;
  - flasque vide non buvable.
- **Les 5 autres tests** passent toujours.
- **Navigateur** (serveur `127.0.0.1:5500`) : sans flasque, « On Vi » laisse les deux symboles sur la ligne, et le message s'affiche.
  Le remplissage et la boisson n'ont été vérifiés qu'en Node. Il faut aller chercher une flasque, par exemple au niveau 1 en (19, 11).

**Critère de fin :** avec une flasque vide en main, « On Vi » donne une Vi Potion. Sans flasque, le message s'affiche et les symboles restent.
