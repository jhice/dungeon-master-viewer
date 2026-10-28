# 034 — Sorts, phase G4 : parchemins, grimoire et infobulles

> Cinquième sous-phase du plan [029-sorts-et-lumiere-plan.md](029-sorts-et-lumiere-plan.md), après [033-sorts-phase-g3.md](033-sorts-phase-g3.md). Suivante : H2 (rendu de la lumière).
> Aucune source nouvelle : les textes des parchemins sont dans `dungeon.json` (doc 010).

## 1. Ce qui est fait

**Grimoire :** un parchemin tenu par le groupe (curseur, mains ou inventaire) est lu une fois pour toutes. Son texte est gardé, et les sorts qu'il nomme deviennent **connus**.
- Le bouton « Grimoire (n) » du panneau de sorts ouvre la liste des sorts connus : leurs symboles (sans la puissance) et leur nom.
- Un message annonce les sorts appris : « Grimoire : Torch (Ful) ».
- L'infobulle de la ligne du sort la nomme quand le sort est connu : « Lancer le sort Lo Ful : Torch (6 mana, non décompté) ».
- **Les messages du lancer** ne nomment aussi le sort que s'il est connu : « Zed lance Torch (Lo Ful) », sinon « Zed lance Lo Ful ».
  Sans flasque, le message est générique, comme dans DM (« NEEDS AN EMPTY FLASK IN HAND FOR POTION ») : « Zed a besoin d'une flasque vide en main pour cette potion (Lo Vi) ».
  *(Retour de l'utilisateur : ces messages révélaient le nom des sorts pas encore découverts.)*

**Infobulles des objets tenus** (curseur dans la vue, mains de Zed, objet tenu et objets de l'inventaire) : le nom, puis une ligne par détail.

| Objet | Détails |
|---|---|
| Parchemin | son texte complet, ligne par ligne |
| Potion | sa puissance et le symbole de puissance correspondant (`puissance / 40`, comme DM). Une flasque vide l'indique |
| Torche | charges sur 15, allumée, éteinte ou consumée |
| Arme | bonus de force, énergie cinétique au lancer, actions et dégâts (`item-info.js`) |
| Tout objet | charges, et les états de l'objet (empoisonné, maudit, cassé), puis son poids |
| Coffre | nombre d'objets dedans |

**Symbole :** son infobulle reste son nom (doc 029).

| Fichier | Rôle |
|---|---|
| `src/core/spell-info.js` | `spellsInText(text)` : les sorts nommés par un texte. Le champ `scroll` (emplacements de l'Encyclopaedia) est retiré, voir § 2 |
| `src/core/item-info.js` | `itemDetails(dungeon, ref)` : les lignes de l'infobulle d'un objet |
| `src/sim/grimoire.js` | Nouveau. Lit les parchemins tenus, liste les parchemins et les sorts connus |
| `src/sim/state.js` | `state.knownScrolls`, vidé au `reset()` |
| `src/sim/simulation.js` | `sim.knownScrolls`, `sim.knownSpells`. Le grimoire se met à jour à chaque `inventoryChanged` |
| `src/ui/spell-panel.js` | Bouton et liste du grimoire. Nom du sort connu dans l'infobulle de la ligne |
| `src/ui/champion-panel.js`, `game-window.js`, `src/main.js` | Infobulles détaillées des mains, de l'objet tenu, de l'inventaire et du curseur |
| `styles/main.css` | Grimoire. L'infobulle de la vue passe à la ligne (`white-space: pre`) |
| `tools/test-spells.mjs` | 9 vérifications de plus (50 en tout) |

**Événement :** `grimoireChanged { scrolls, learned }`.

## 2. Reconnaître les sorts d'un parchemin

Le plan prévoyait une correspondance faite à la main, avec les emplacements de l'Encyclopaedia.
Deux constats l'ont remplacée par une lecture du texte :

- **Les textes nomment les sorts** par leurs symboles : « INVOKE FUL FOR A MAGIC TORCH », « CASTING VI BRO INTO A FLASK… ».
- **Les emplacements de l'Encyclopaedia** ne sont pas dans le repère de `dungeon.json`.
  - Torch (0, 4, 15) correspond bien ;
  - Vi Bro est donné en (1, 19, 25), alors que son parchemin est en (1, 19, 11) dans `dungeon.json`.

**Règle de `spellsInText`** :
- une suite de mots-symboles **dans l'ordre des étapes** (élément, puis forme, puis classe) forme un sort si elle correspond exactement à l'un des 25 ;
- un autre mot ou une ponctuation coupe la suite ;
- la puissance n'est jamais écrite. Les mots « ON » ou « EE » de l'anglais ne gênent donc pas, car seules les étapes 2 à 4 comptent ;
- le mot « ZOKATHRA » désigne Zo Kath Ra.

**Résultat sur les 35 parchemins :** **24 sorts** sont nommés. Il ne manque que **Poison Potion** (Zo Ven), comme l'indique l'Encyclopaedia (« le seul sort révélé par aucun parchemin »).
Exemples :
- « FIREBALL / FUL IR. / FIRE SHIELD / FUL BRO NETA. » donne Fireball et Fire Shield ;
- le parchemin des quatre potions de caractéristiques donne Ku, Ros, Dane et Neta.

## 3. Quand un parchemin est-il lu ?

Dès qu'il est tenu par le groupe : ramassé au curseur, mis en main, ou rangé dans l'inventaire, y compris quand il sort d'un coffre rangé.
Un parchemin déjà lu ne l'est pas deux fois. Le grimoire se vide au retour au départ.

## 4. Vérification

- **`node tools/test-spells.mjs` :**
  - 24 sorts nommés par les parchemins ;
  - deux sorts séparés par la ponctuation ;
  - grimoire vide au départ ;
  - le parchemin de (4, 15) ramassé apprend Torch ;
  - son texte est gardé et affiché dans l'infobulle ;
  - le ranger ne le relit pas ;
  - le reset vide le grimoire.
- **Les 7 autres tests** passent toujours.
- **Navigateur** (serveur `127.0.0.1:5500`) :
  - grimoire vide (« Aucun sort connu ») ;
  - au niveau 0 en (4, 15) (touche F), le clic sur le parchemin le prend. Le panneau passe à « Grimoire (1) » avec Torch et son glyphe, et l'infobulle du curseur affiche « Scroll / INVOKE FUL / FOR A MAGIC / TORCH / Poids : 0,1 kg » ;
  - l'infobulle de la torche de l'inventaire donne ses charges, son bonus de force et ses actions.

**Critère de fin :** ramasser le parchemin de la case (4, 15) du niveau 0 fait apparaître Torch dans le grimoire, et le survol de ce parchemin en main affiche son texte.
