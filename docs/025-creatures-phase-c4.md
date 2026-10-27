# 025 — Créatures, phase C4 : mort, butin, peur et vol

> Suite de [020-creatures-plan.md](020-creatures-plan.md), phase C4, après [024-mains-actions-lancer.md](024-mains-actions-lancer.md).
> C3b (projectiles muraux, sorts) et C3c (fidélité du combat) sont **mises de côté** par l'utilisateur, en attendant le système de sorts du groupe.

## 1. Point de départ

Une partie de C4 était déjà faite en C3a (doc 023, § 4) :

| Point du plan (doc 020) | État |
|---|---|
| La mort d'un membre le retire de sa sous-case ; la mort du dernier fait disparaître le groupe et relâche sa plaque | Fait en C3a |
| Les possessions du groupe (18 groupes, 25 objets) tombent sur sa case | Fait en C3a |
| Critère : tuer la momie de N3 (7, 5) relâche sa plaque, et « YOU WILL REGRET THAT » s'affiche | Fait en C3a (test `test-combat.mjs`) |
| **Butin propre à l'espèce** (os, nourriture…) | **Cette phase** |
| **Objets volés par une créature** (Giggler) | **Cette phase** |
| **Fuite** des créatures (reportée depuis C2, doc 022) | **Cette phase, pour la peur après une mort.** Le cri de guerre et les autres actions qui effraient attendent C3c |

## 2. Butin des espèces (`src/core/creature-drops.js`)

**Ce que dit la documentation :**
- *Graphics.dat Item 559* décrit les « creature droppings ». Ce sont des listes d'objets qu'une créature laisse en mourant, en plus de ses possessions.
- Chaque objet de la liste est toujours laissé, ou laissé avec une chance de 50 %. Seules 9 espèces en ont une.
- Les objets de l'Animated Armour sont rendus maudits par le code.
- *Dungeon Master Creatures* donne le contenu de chaque liste. Par exemple, « Screamer Slice (1-2) » se lit : une toujours, une seconde à 50 %.

| Espèce | Objets laissés |
|---|---|
| Screamer | Screamer Slice (1 à 2) |
| Magenta Worm | Worm Round (1 à 3) |
| Pain Rat | Drumstick (1 à 2) |
| Rockpile | Rock (0 à 2), Boulder (1 à 2) |
| Trolin | Club |
| Stone Golem | Stone Club |
| Skeleton | Wooden Shield, Falchion |
| Animated Armour | Armet, Torso Plate, Leg Plate, Foot Plate, 2 Swords (maudits) |
| Red Dragon | Dragon Steak (8 à 10) |

**Règles :**
- **Moment :** le butin est laissé **à la mort de chaque membre**, pas seulement à celle du dernier. Il tombe sur la sous-case du membre, ou sur une sous-case au hasard s'il était seul au centre.
- **Possessions du groupe :** elles tombent à la mort du dernier membre, comme avant.
- **Après la chute :** les objets suivent les trappes et les téléporteurs (`itemsDropped()`).

**Objets créés en cours de partie** (`state.createItem()`, `src/sim/state.js`) :
- ce sont de nouvelles entrées, ajoutées aux tables d'objets du donjon chargé, en mémoire seulement : `dungeon.json` n'est pas modifié ;
- elles portent `created: true`, et `cursed` pour celles de l'Animated Armour ;
- « Recommencer » ramène chaque table à sa taille de départ ;
- deux types absents du donjon ont été ajoutés à `item-info.js`, depuis la page *Dungeon Master Items* : Stone Club (11 kg) et Worm Round (1,1 kg).

## 3. Peur et fuite

**Ce que dit la documentation :** *Creature Details* décrit la colonne Fear resistance (0 à 15). Elle sert à décider si un groupe fuit quand l'un de ses membres a été tué, ou devant War Cry, Calm, Brandish, Blow Horn et Confuse. À 15, la créature n'a jamais peur.

`creature-info.js` reprend cette colonne (version d, Amiga 3.6). Quelques valeurs :

| Résistance | Espèces |
|---|---|
| 0 | Giggler |
| 3 à 5 | Ruster 3, Trolin 4, Couatl 4, Vexirk 5 |
| 8 à 12 | Ghost 8, Mummy 9, Skeleton 9, Magenta Worm 10, Red Dragon 11, Rockpile 12 |
| 15 (jamais) | Screamer, Pain Rat, Stone Golem, Giant Wasp, Animated Armour, Demon |

**Règles (provisoires, la formule exacte n'est pas documentée) :**
- **Test :** quand un membre meurt et que d'autres survivent, le groupe **fuit si un tirage entre 0 et 14 atteint sa résistance**. Un Trolin fuit donc environ 7 fois sur 10, un Giggler toujours, un Screamer jamais.
- **Durée :** la fuite dure de 10 à 20 s (60 ticks, plus 0 à 60).
- **Déplacement :**
  - le groupe fait un pas qui l'**éloigne** du groupe de joueurs, à chaque `moveTicks` ;
  - un coup reçu ne le fait pas revenir ;
  - **acculé** (aucun pas ne l'éloigne), il se défend si le groupe de joueurs est à côté, et attend sinon.
- **Fin :** la fuite terminée, il reprend son comportement : poursuite s'il voit le groupe, errance sinon.
- **Message :** « Trolin : le groupe prend peur et s'enfuit ».

## 4. Le Giggler voleur

**Ce que dit la documentation :** *Dungeon Master Creatures* indique que dans DM pour PC et Amiga 3.6, le Giggler vole **dans la main d'action (7 fois sur 8) ou dans la main gauche (1 fois sur 8)**. Les premières versions ne volaient que dans la main gauche. *Creature Details* précise que ce vol est codé en dur et que le Giggler n'attaque jamais.

**Règles :**
- **Le vol :** au contact et face au groupe, à chaque `attackTicks` (5 ticks), le Giggler tente un vol au lieu d'une attaque.
  - Il choisit la main d'action 7 fois sur 8, sinon la main gauche.
  - Si cette main est vide, il ne prend rien.
  - Sinon, il doit atteindre le champion : même test que pour une attaque (dextérité, ou une chance sur 4), provisoire.
- **Après un vol :**
  - l'objet passe dans les **possessions du Giggler** ;
  - le Giggler **s'enfuit** (même fuite qu'au § 3) ;
  - message : « Giggler vous a volé : Torch ».
- **Récupérer l'objet :** il faut tuer le Giggler. L'objet tombe alors sur sa case, avec ses autres possessions.
- **Fuite sans fin :** un Giggler qui garde un objet volé **fuit pour de bon**, jusqu'à sa mort (`fleeUntil = Infinity`).
  - Bloqué, il attend sur place. Il ne revient jamais vers le groupe.
  - Si le groupe le rejoint au contact, il peut voler l'autre main.
  - Avant le retour de l'utilisateur, sa fuite durait 10 à 20 s comme une fuite de peur. Une fois bloqué, il revenait ensuite vers le groupe. Cas signalé : N9 (11, 5), avec le groupe à sa droite.
- **Mains vides :** il ne prend rien, et ne frappe pas.

## 5. Vérifications

**Node** (`node tools/test-loot.mjs`, nouveau, tout est bon ; `test-combat.mjs` et `test-creatures.mjs` aussi) :

| Cas | Résultat |
|---|---|
| 4 Screamers de N1 (8, 24) tués | 7 Screamer Slice sur leur case, avec leurs possessions (Torch, Empty Flask) |
| Un Trolin seul tué en N2 | 1 Club sur sa case ; une entrée créée dans la table des armes |
| Recommencer | La table des armes revient à sa taille de départ |
| Groupes de Trolins de N2, un membre tué | Un groupe prend peur ; 5 s plus tard, sa distance au groupe est passée de 1 à 3 |
| Screamer | Résistance 15 : jamais effrayé |
| Giggler de N9 (7, 6), Torch en main droite | Il vole la Torch, la garde et s'enfuit en (4, 4). Rattrapé et tué, la Torch tombe sur sa case |
| Giggler, mains vides | Rien de volé, aucun coup |
| N9 (11, 5), groupe à sa droite en (12, 5) | Vol de la Torch, fuite jusqu'en (5, 0), à 12 cases. Deux minutes plus tard, il n'est jamais revenu plus près |

**Chrome :**
- au niveau 1, les 4 Screamers sont tués à coups de « Frapper » ;
- leurs Screamer Slice s'empilent sur leurs sous-cases avec la Torch et l'Empty Flask, en 2D comme à la première personne ;
- aucune erreur dans la console.

## 6. Limites et suite

- **Valeurs provisoires :** la formule de la peur, la durée de la fuite et le test de vol. À confirmer dans ReDMCSB, avec C3c.
- **Objets maudits :** le drapeau `cursed` est posé, mais ne fait encore rien. Dans DM, un objet maudit diminue la chance.
- **Fuite :** le cri de guerre et les autres actions qui effraient (War Cry, Calm, Brandish, Blow Horn, Confuse) arriveront avec les actions des objets, en C3c.
- **Mort du champion :** dans DM, un champion mort laisse ses os, qui servent à le ressusciter. Avec un seul champion, la partie s'arrête. C'est à revoir si le groupe compte un jour plusieurs champions.
- **Créature tuée par un mécanisme :** une porte qui se ferme sur elle, une téléportation vers un niveau interdit… Ce n'est pas encore simulé.

## Sources

- *Dungeon Master Encyclopaedia*, **Dungeon Master Creatures** : http://dmweb.free.fr/games/dungeon-master/solutions/creatures/.
  Objets laissés par chaque espèce et leur nombre, mains où vole le Giggler selon les versions.
- *Dungeon Master Encyclopaedia*, **Graphics.dat Item 559** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/graphics.dat-item-559/.
  Format des listes d'objets laissés (bit des 50 %), espèces concernées, objets maudits de l'Animated Armour.
- *Dungeon Master Encyclopaedia*, **Creature Details** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/creature-details/.
  Colonne Fear resistance et son sens ; vol du Giggler codé en dur.
- *Dungeon Master Encyclopaedia*, **Dungeon Master Items** : http://dmweb.free.fr/games/dungeon-master/solutions/items/.
  Poids et énergie cinétique du Stone Club et de la Worm Round.
