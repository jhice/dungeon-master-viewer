# 028 — Portes animées : fermeture par crans, écrasement, passage sous la porte

> Demande de l'utilisateur après la doc 027. Règles prises dans le code du moteur reconstitué (ReDMCSB) et dans l'Encyclopaedia, voir [000-sources.md](000-sources.md).

## 1. Ce que fait le moteur original

**États d'une porte** (ReDMCSB, `DEFS.H`) : 0 = ouverte, 1 = fermée à 1/4, 2 = à moitié, 3 = aux 3/4, 4 = fermée, 5 = cassée.

**Animation** (`TIMELINE.C`, `F244` puis `F241`) :
- un événement de porte lance une animation d'**un cran par tick**, soit 4 ticks (environ 0,7 s) pour s'ouvrir ou se fermer ;
- une **bascule** (bouton de porte, actuator `toggle`) ferme la porte si elle est entièrement ouverte, sinon elle l'ouvre. Un clic pendant l'ouverture la poursuit donc, et un clic pendant la fermeture la fait remonter ;
- un nouvel événement pendant l'animation en **change le sens**.

**Fermeture sur le groupe** (`F241`) : si le groupe est sous la porte et qu'elle a commencé à descendre,
- elle remonte **d'un coup** en position ouverte ;
- chaque champion reçoit une attaque de 5 ;
- elle réessaie **2 ticks plus tard**.

Concrètement, la porte descend d'un cran, remonte et blesse, et ainsi de suite toutes les 3 ticks tant que le groupe reste dessous.

**Fermeture sur une créature** (`F241`) : si la créature est matérielle et que la porte a atteint sa **hauteur**,
- la porte **remonte d'un cran** ;
- chaque membre du groupe reçoit une attaque de 5 ;
- la créature réagit au « danger sur sa case » ;
- la porte réessaie 2 ticks plus tard.

La hauteur à prendre en compte est :
- pour une porte **verticale**, celle de la créature ;
- pour une porte **horizontale**, toujours 1/4.

**Hauteur des créatures** (*Creature Details*, colonne *Height*) :

| Hauteur | La porte s'arrête à | Exemples |
|---|---|---|
| 0 | ne bouge pas | Ghost, Materializer (immatériels, donc sans effet) |
| 1 | 1/4 | Mummy, Skeleton, Stone Golem, Demon… |
| 2 | 1/2 | Giggler, Pain Rat, Screamer, Rockpile |
| 3 | 3/4 | Ruster, Vexirk, Magenta Worm |

**Passage :**

| Qui | Passe tant que la porte est fermée à | Source |
|---|---|---|
| Groupe | 1/4 au plus (et porte cassée) | `COMMAND.C` |
| Projectiles | 1/4 au plus | `PROJEXPL.C` |
| Créature | sa hauteur (porte verticale) ou 1/4 (horizontale) au plus ; toujours si elle est immatérielle | `GROUP1.C` |
| Vue des créatures | bloquée à 3/4 et plus (sauf grilles et portes Ra) | `GROUP1.C` |

Tu avais raison : le groupe passe tant que la porte n'est pas descendue de plus d'un cran.

**Dégâts.** L'attaque de 5 vaut 4 ou 5 (`F324`, `F191`) :
- **champion** : attaque « sur soi », contre la moitié de son armure, soit × (130 − armure / 2) / 64. Sans armure pour l'instant (C3c), cela fait **8 à 10 PV** par coup ;
- **créature** : 4 ou 5 PV par membre, sans défense. Lord Chaos ne prend aucun dégât.

**Portes horizontales** (`DUNVIEW.C`, `F111`) : elles ne montent pas, leurs deux moitiés s'écartent vers les murs. Il y en a 20 sur 170.

## 2. Ce qui est implémenté

**État :**
- `src/core/tile-states.js` : `DOOR_CLOSED`, `doorStep()`, `doorPassable()` ;
- l'état mutable d'une porte (`src/sim/state.js`) porte `step` (0 à 4) et `vertical` ;
- `open` reste vrai seulement pour le cran 0 ;
- `moving` indique une animation en cours.

**Animation** : `doorEvent()` et `animateDoor()` dans `src/sim/logic.js`, qui émettent un `tileChanged` à chaque cran.

**Passage** :
- `blockReason()` et `creaturePassage()` dans `rules.js` ;
- `creatureDoorHeight()` ;
- `passes()` dans `projectiles.js` ;
- `opaque()` dans `perception.js`.

**Hauteur des créatures** : nouvelle colonne `height` dans `src/core/creature-info.js`.

**Écrasement** : crochet `crush` de la logique, `doorCrushes()` dans `simulation.js`.
- Pour le groupe, l'événement `championHit` porte `door`, et la mort peut venir d'une porte (`championDied` avec `group: null`).
- Pour une créature, `creatures.kill()` gère les morts, puis l'événement `doorCrushed` est émis.
- Les survivants agissent au tick suivant (`creatures.alarm()`).

**Vue à la première personne** (`fp-decor.js`) :
- une porte verticale monte de 1/4 de sa course par cran ;
- une porte horizontale s'ouvre en deux moitiés qui glissent dans les murs.

**Bouton de porte.** Il était dessiné sur le vantail, donc il serait monté avec lui. Il est maintenant sur un **montant fixe** à droite de l'embrasure, comme le cadre de porte de DM. Le montant est cliquable.

**Vue 3D** (`level-meshes.js`) : le vantail est levé selon son cran.

**Messages** : la barre d'état n'annonce une porte qu'une fois arrêtée, ainsi que les écrasements.

**Décoration plus basse.** La grille en arc était dessinée avec un rayon proportionnel à la **largeur** du vantail. Avec des murs de 0,7, le haut de l'arc touchait le bord du vantail.
- L'arc suit maintenant le plus petit côté.
- Les fenêtres (grille en arc, grille carrée, barreaux de bois, joyaux) sont descendues sous le milieu du vantail, sous le niveau de l'œil.

## 3. Écarts et valeurs provisoires

- **Un seul animateur par porte.** Dans DM, un événement de porte qui tombe à un autre tick que le prochain cran crée une seconde animation, et les deux se disputent la porte. Ici, le nouvel événement change le sens de l'animation en cours.
- **Réaction « danger sur la case »** (événement 29 de DM) : la créature agit simplement au tick suivant, elle ne cherche pas encore à quitter la case. Provisoire.
- **Armure et blessures** : aucune (C3c). Une porte verticale devrait viser la tête et le torse, une porte horizontale les mains et le torse.
- **Rendu par crans**, comme dans DM (6 ticks par seconde). Une interpolation entre les crans pourrait venir avec les transitions de la phase F.
- **Vue 2D** : une porte en mouvement s'affiche fermée. Seul le libellé de l'infobulle donne le cran (« fermée à 2/4 »).
- **Sans rapport avec cette doc, mais repéré :** dans DM, un faux mur revient sur une créature immatérielle (`F242`). Ici, aucune créature ne le laisse revenir.

## 4. Tests

`node tools/test-doors.mjs` vérifie :
- l'ouverture et la fermeture en 4 ticks ;
- le passage du groupe jusqu'à 1/4 ;
- le comportement de la bascule pendant le mouvement ;
- le groupe sous la porte : 3 coups de 8 à 10 PV en 9 ticks, et la porte se ferme une fois le groupe parti ;
- un ver (la porte oscille entre 2/4 et 3/4), une momie (entre 0 et 1/4), un ver sous une porte horizontale (entre 0 et 1/4) ;
- le passage d'un ver sous une porte aux 3/4, refusé à une momie.

`test-logic.mjs` attend maintenant les 4 crans de la porte N5 (13, 20).
