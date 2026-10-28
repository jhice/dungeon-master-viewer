# 026 — Timeline : l'oscillateur de la mauvaise fin, les compteurs

> Point laissé en attente en [021-creatures-phase-c1.md](021-creatures-phase-c1.md) § 5 : la **lenteur de la marche aléatoire** des tests.
> Règles confrontées au code du moteur reconstitué (ReDMCSB, `TIMELINE.C`), voir [000-sources.md](000-sources.md).

## 1. Diagnostic

La marche aléatoire de `test-creatures.mjs` (100 000 actions, 123 000 ticks) prenait **9,7 s**, pour **12 millions** de déclenchements d'actuators.
Un comptage par actuator montre que deux d'entre eux en font presque tout :

| Actuator | Où | Rôle | Déclenchements |
|---|---|---|---|
| 651 | N0, mur (10, 1) | Porte ET/OU, s'envoie `set` à elle-même (bit nord) avec 1 tick de délai | 6 024 900 |
| 652 | N0, mur (10, 1) | Porte ET/OU, envoie `set` au mur (9, 0) avec 15 ticks de délai | 6 024 900 |
| 653 | N0, plaque (9, 1) | P « face au nord », `hold` inversé, vise le téléporteur (9, 1) | 200 |
| 650 | N0, plaque (9, 1) | TPCI, envoie `set` au mur (10, 1) avec 15 ticks de délai | 100 |

**C'est la cellule de la mauvaise fin.** Le groupe y arrive quand il rapporte le Firestaff au Hall sans l'avoir complété :
- le texte de la case : « IT IS TOO BAD YOU DID NOT DISCOVER THE TRUE SECRET OF THE FIRESTAFF. NOW THAT I HAVE IT I HAVE NO FURTHER NEED FOR YOU! » ;
- la plaque 650 lance, 15 ticks plus tard, l'**oscillateur** 651 : ses bits égalent déjà sa référence, donc chaque `set` qu'il se renvoie le redéclenche, à chaque tick, sans fin ;
- à chaque battement, 652 commande le mur (9, 0), un **lance-boules de feu double** (puissance 120, non géré en simulation, voir C3b) ;
- la plaque 653 et le téléporteur (9, 1), qui ramène sur lui-même face au nord, **empêchent de se détourner** : dès que le groupe ne regarde plus le nord, le téléporteur s'active et le replace face au nord.

L'oscillateur est donc **voulu**. Le problème vient de l'emballement : chaque demi-tour renvoie le groupe par le téléporteur, il ressort de la case puis y revient, et la plaque 650 est pressée de nouveau.
Notre horloge ajoutait alors une **seconde boucle**, puis une troisième… Les 100 pressions de la marche aléatoire faisaient tourner en moyenne 49 boucles à chaque tick, et elles continuaient après le départ du groupe.
Dans le jeu, la mort sous les boules de feu met fin à la partie, mais le champion des tests est immortel.

## 2. Ce que fait le moteur original

`F238_TIMELINE_AddEvent_GetEventIndex` (ReDMCSB, `TIMELINE.C`) :
- un **événement de case** (couloir, mur, faux mur, téléporteur, trappe, porte) qui tombe sur la **même carte**, le **même tick** et la **même case** qu'un événement déjà en attente
  (et sur la **même face** pour un mur) **n'est pas ajouté** ;
- l'événement existant prend simplement l'**effet du nouveau**.

Les boucles empilées de 651 visent toutes le mur (10, 1), face nord, au tick suivant : elles se fondent en une seule.

Le même code confirme deux autres règles :
- **Porte ET/OU :** elle met à jour le bit de la face visée, puis se déclenche à **chaque** événement où ses bits égalent la référence, pas seulement quand l'égalité change. C'est déjà le cas chez nous, et c'est ce qui fait battre 651.
- **Compteur :** voir § 4.

## 3. Correctif de la timeline

- `src/sim/clock.js` : `schedule(delay, run, key)`. Un événement qui porte une clé **remplace** celui de même clé prévu au même tick.
- `src/sim/logic.js`, `fire()` : la clé est la case visée (`niveau:x,y`), plus la face pour un mur.
  - Les nouvelles tentatives de fermeture d'une porte ou d'un faux mur sur le groupe (`RETRY`) et la fin du repos des générateurs ne sont pas concernées.

| Mesure | Avant | Après |
|---|---|---|
| Marche aléatoire, 100 000 actions | 9,7 s, 12 050 000 déclenchements | **0,6 s**, 240 000 déclenchements |
| 651 pour 123 000 ticks | 6 024 900 | 120 170 (un battement par tick depuis le premier passage) |

Les deux horloges du doc 015 ne changent pas : le compteur sur 2 bits du niveau 11 fait toujours tourner ses 4 trappes, à l'identique.

## 4. Les compteurs étaient inversés

Dans ReDMCSB, un compteur dont la valeur est supérieure à 0 :
- **`set` incrémente** (jusqu'à 511), **`clear` et `toggle` décrémentent** ;
- il se déclenche en atteignant 0, puis ne bouge plus ;
- en mode `hold`, il envoie `set` s'il est à 0, `clear` sinon, à chaque événement (aucun compteur du donjon n'est dans ce cas).

Notre code faisait l'inverse (doc 015 : « `set` décrémente, `clear` incrémente »). Or les 4 compteurs du donjon ne reçoivent que des `clear` :
avec l'ancien code, ils montaient sans fin et **aucune de leurs énigmes ne pouvait se résoudre**.

| Compteur | Où | Valeur | Source | Effet, une fois à 0 |
|---|---|---|---|---|
| 81 | N2, mur (10, 13) | 2 | Serrure « Specific item / Removed » (8, 14), `clear` | `set` vers le mur (9, 13) |
| 421 | N11, mur (27, 7) | 3 | Plaque TPC (26, 7), `clear` | Le faux mur (27, 6) disparaît, **au 3e pas** sur la plaque |
| 135 | N5, mur (13, 23) | 3 | 4 alcôves « Any item / No empty hand », `hold` inversé : un objet posé envoie `clear` | La porte (13, 20) s'ouvre **au 3e objet posé** |
| 616 | N5, mur (13, 23) | 4 | Les mêmes alcôves | `clear` vers le mur (13, 19), au 4e objet |

## 5. Vérifications

Nouveau test : `node tools/test-logic.mjs`.

| Cas | Résultat |
|---|---|
| N0 (9, 1) : 10 demi-tours, donc 10 relances de la plaque 650 | L'oscillateur bat 100 fois en 100 ticks (800 avant) |
| N11 : trois pas sur la plaque (26, 7) | Le faux mur (27, 6) disparaît au 3e pas (jamais avant) |
| N5 : un objet dans chacune des 4 alcôves | La porte (13, 20) s'ouvre au 3e ; le compteur 616 atteint 0 au 4e (jamais avant) |

Les 4 cas échouent avec l'ancien code. `test-creatures.mjs`, `test-combat.mjs` et `test-loot.mjs` passent.

## 6. Limites

- **Taille de la timeline :** le moteur original la limite. Quand elle est pleine, DM 1.0 à 1.1 ignore les nouveaux événements et DM 1.2 s'arrête sur une erreur.
  Notre file n'a pas de limite.
- La fusion ne s'applique qu'aux événements envoyés par les actuators. Dans DM, elle touche aussi l'animation des portes, qui n'est pas simulée ici.
- Le **lance-boules de feu** (9, 0) reste ignoré jusqu'à C3b. Hors des tests, la mauvaise fin ne tue donc pas encore le groupe.
