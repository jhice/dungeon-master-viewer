# 021 — Créatures, phase C1 : présence et déplacement

> Suite de [020-creatures-plan.md](020-creatures-plan.md), phase C1.
> Les créatures se déplacent et actionnent les mécanismes, sans combat.

## 1. Décisions prises en début de session

| Question (doc 020, § 4) | Réponse |
|---|---|
| Q1, créatures bloquantes ? | **Oui (option B).** Le groupe ne peut pas entrer sur la case d'une créature. `F` reste l'échappatoire pour les tests : il place le groupe même sur une case occupée |
| Q2, caractéristiques des espèces | **D'abord la documentation, mais seulement le strict minimum** : 5 colonnes de la table du moteur (§ 2) |
| Q3, mouvement | **Pas instantané**, comme le groupe. Les transitions viendront avec la phase F |
| Question de l'utilisateur en cours de session : les créatures ne vivent-elles que sur le niveau du joueur ? | **Oui, comme dans DM** (§ 3). C'est aussi moins coûteux |

## 2. Caractéristiques des espèces

`src/core/creature-info.js` reprend 5 colonnes de la table *Creature Details* de l'Encyclopaedia, qui décode
les descripteurs de créatures du moteur (item 559 de graphics.dat) :

| Colonne | Usage |
|---|---|
| Movement Ticks | Temps minimal entre deux pas, en ticks de 1/6 s. 255 = immobile |
| Levitation | Passe au-dessus des trappes, **n'enfonce pas les plaques** (précisé par l'Encyclopaedia) |
| Non Material | Traverse les portes, quel que soit leur type |
| Size | Nombre par case : 0 = 4, 1 = 2, 2 = 1 (au centre) |
| Base Health | PV des créatures produites par un générateur |

Quelques valeurs pour fixer les idées :

| Espèce | Ticks par pas | Particularités |
|---|---|---|
| Giant Wasp | 1 | lévitation |
| Couatl, Materializer | 5 | lévitation (Materializer : immatériel aussi) |
| Skeleton, Oitu | 7 | — |
| Ghost | 11 | lévitation, immatériel |
| Trolin | 13 | — |
| Mummy | 17 | — |
| Screamer | 120 | — |
| Rockpile | 185 | — |
| Black Flame | 255 | immobile, immatériel |

Les autres colonnes (attaque, défense, vue, odorat, peur…) seront ajoutées par les phases C2 et C3, quand elles en auront besoin.

## 3. Règles

### Activité limitée au niveau du groupe

Seuls les groupes du **niveau où se trouve le groupe de joueurs** sont actifs.
- Les autres sont figés, et reprennent quand le joueur arrive sur leur niveau.
- C'est le comportement de DM : la page *Graphics.dat Item 559* explique que le moteur tient des « données étendues »
  seulement pour les créatures du niveau du groupe.
- Une créature emportée vers un autre niveau, par une trappe ou un téléporteur, s'y fige aussi.

### Errance

Un groupe actif fait **un pas** toutes les `moveTicks` + un tirage entre 0 et `moveTicks` :
- il choisit une direction au hasard parmi celles qu'il peut prendre, et se tourne vers elle ;
- s'il est bloqué de tous côtés, il reste sur place.

Le tirage est **à graine fixe** (`mulberry32`, `src/sim/creatures.js`) : une partie se rejoue à l'identique, et les tests sont reproductibles.

> **Provisoire :** le délai exact de l'errance dans DM n'est pas dans la table, qui ne donne qu'un minimum. Le tirage supplémentaire est un choix de ma part.

### Passage (`creaturePassage()`, `src/sim/rules.js`)

- Comme pour le groupe : murs, portes fermées et faux murs fermés bloquent.
- Les immatériels traversent les portes fermées.
- Les créatures ne prennent **jamais les escaliers**.
- Elles **n'entrent pas d'elles-mêmes dans une trappe ouverte**, sauf en lévitation. Elles tombent en revanche si une trappe s'ouvre sous elles.
- **Un groupe par case**, et jamais sur la case du groupe de joueurs.

> Les deux règles sur les escaliers et les trappes viennent de ma connaissance du moteur, **pas** de l'Encyclopaedia. Elles sont à vérifier.

### Arrivée (`resolveCreatureArrival()`)

Elle suit la même chaîne que pour les objets : chute par les trappes ouvertes (sauf en lévitation), téléporteurs de portée `all` ou `creatures`, avec leur rotation.
- Si la case d'arrivée est occupée, le pas est annulé.
- Les **30 téléporteurs « créatures »** fonctionnent désormais.

### Mécanismes (`src/sim/logic.js`)

- **Plaques :** `pressedOn()` lit les groupes de l'état, et plus ceux de `dungeon.json`. Une créature en lévitation n'enfonce rien.
  - Un pas actionne les plaques des deux cases à la fois (`floorChanges()`).
- **Portes et faux murs :**
  - une porte ne se referme pas sur une créature matérielle ;
  - un faux mur ne réapparaît sur aucune créature.
  - Dans les deux cas, on réessaie au tick suivant, comme pour le groupe.
- **Trappe qui s'ouvre, téléporteur qui s'active sous un groupe :** il tombe ou il est emporté.

### Générateurs (50 actuators au sol, type 6)

| Étape | Règle | Origine |
|---|---|---|
| Déclenchement | Le groupe de joueurs entre sur la plaque | Connaissance du moteur |
| Nombre | `count`, ou un tirage entre 1 et `count` si `isMax`. Limité par la taille de l'espèce | Données (008) |
| PV de chaque membre | `multiplicateur × PV de base + aléa(PV de base / 4 + 1)`. Multiplicateur : `hpMultiplier`, ou à défaut la `difficulty` du niveau | Encyclopaedia, *Creature Generators*. Les PV des groupes posés dans `dungeon.json` le confirment : Magenta Worm du niveau 3 (difficulté 2) ≈ 2 × 70 |
| Emplacement | La case du générateur. Comme le groupe de joueurs s'y trouve, la créature **apparaît quand il en part** | Connaissance du moteur (ReDMCSB), à vérifier |
| Repos | Le générateur est ensuite désactivé pendant `delay`. Au-delà de 127, le délai compte par 64 ticks : `(delay − 126) × 64`, soit environ 3 min pour 145 | **Formule de mémoire (ReDMCSB), à vérifier** |

## 4. Vues

- **Contenus de case :** `tileContents()` accepte le groupe de l'état (`describeGroup()`). `contentsAt()` de `main.js` le lui passe.
- **Événement `creaturesMoved`** `{ group, from, to, carried?, generated? }`. `main.js` regroupe les cases touchées et redessine **une fois par image** :
  - en 2D, seulement les cases de départ et d'arrivée (`updateTile`) ;
  - en 3D et dans la vue à la première personne, seulement les maillages des créatures du niveau (`updateCreatures(level)`), et non tout le niveau.
- **Orientation :**
  - en 2D, chaque disque porte une pointe de la couleur de l'espèce ;
  - en 3D et à la première personne, un « nez » sombre est posé devant chaque cylindre.
- **Barre d'état :** « Bloqué : créature » ; « Générateur : 2 × Magenta Worm en (4, 23) ».

Les maillages des créatures sont construits par `buildLevelCreatures()` (`level-contents.js`), marqués `userData.creatures`.

## 5. Vérifications

**Node** (`node tools/test-creatures.mjs`) :

| Cas | Résultat |
|---|---|
| Niveau 1, 5 min de jeu | 512 pas, 12 groupes sur 15 ont bougé (les autres sont des Screamers lents ou coincés). Aucun pas dans un mur ou une porte fermée |
| Niveau 2 pendant ce temps | Tous les groupes figés |
| Groupe face à un Screamer | « Bloqué : créature ». `F` reste possible sur la case |
| N3 (7, 5), la momie | Voir ci-dessous |
| Générateur N3 (4, 23) | Rien n'apparaît tant que le groupe est sur la plaque. Il en sort : 2 Magenta Worms (PV 140 et 147), puis le générateur est au repos |
| Marche aléatoire, 100 000 actions sur les 14 niveaux | Aucune exception, invariants tenus (un groupe par case, aucun dans un mur), 9,6 s |

**La momie de N3 (7, 5) est enfermée.** Elle a un mur à l'est et au sud, un faux mur fermé à l'ouest (que sa propre plaque ouvre),
et une **trappe ouverte au nord**, où une créature n'entre pas d'elle-même. Elle ne quitte donc jamais sa plaque en errant.
C'est sans doute voulu : dans le jeu, elle la quitte **en mourant** (phase C4, dont c'est d'ailleurs le critère de fin).
Pour vérifier la mécanique, le test ferme la trappe : la momie sort au bout de 11 ticks, et « YOU WILL REGRET THAT. » s'affiche.

**Lenteur de la marche aléatoire (déjà présente avant cette phase) :** elle vient des actuators, avec **12 millions de déclenchements**
pour 123 000 ticks, contre environ 700 ms pour les créatures. Un oscillateur s'emballe sans doute, voir doc 015. À examiner à part.

**Chrome :**
- niveau 1 : les momies et les Screamers se déplacent en 2D et en 3D ;
- dans la vue à la première personne, les Screamers sont visibles devant le groupe ;
- les pointes en 2D et les nez en 3D indiquent l'orientation ;
- aucune erreur dans la console.

## 6. Limites et suite

- **Pas de combat ni de perception.** Les créatures errent sans voir le groupe : c'est la phase C2.
- Les **possessions** suivent le groupe, mais ne tombent pas encore (C4).
- Les **membres** gardent leur sous-case et l'orientation du groupe (pas d'orientation par membre).
- Une créature qui **arrive sur une case occupée** à la suite d'une chute ou d'un téléporteur reste où elle est.
  Dans DM, d'autres règles s'appliquent, à voir en C2 et C3.
- Le critère **Intelligence**, qui empêche une créature de prendre un téléporteur vers un niveau où son espèce n'est pas admise, n'est pas repris.
- **À vérifier dans le jeu :** le délai d'errance, le repos des générateurs, les escaliers et les trappes pour les créatures.

## Sources

- *Dungeon Master Encyclopaedia*, **Creature Details** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/creature-details/.
  Table des descripteurs de créatures. Reprise pour 5 colonnes (§ 2), avec leur définition.
- *Dungeon Master Encyclopaedia*, **Creature Generators** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/creature-generators/.
  Formule des PV des créatures générées.
- *Dungeon Master Encyclopaedia*, **Graphics.dat Item 559** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/graphics.dat-item-559/.
  Seules les créatures du niveau du groupe ont des « données étendues ».
- **Connaissance du moteur, sans consultation de ReDMCSB** : escaliers et trappes pour les créatures, emplacement et repos des générateurs. À vérifier.
