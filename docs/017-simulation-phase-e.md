# 017 — Simulation, phase E : objets

> Suite de [016-simulation-phase-d.md](016-simulation-phase-d.md).
> Phase E : ramasser, poser, main active, serrures à clé, alcôves, détecteurs.
> Gestion simplifiée (réponse Q2) : un **inventaire** du groupe, avec une **main** : la clé doit être en main.
> Voir § 5 pour les ajustements après les retours de test.

## 1. Utilisation

- **Portée :** 4 sous-cases.
  - Les **deux sous-cases de devant** de la case du groupe.
  - Les **deux sous-cases proches** de la case d'en face, si le groupe pourrait y entrer (ni mur ni porte fermée).
- **Ramasser :** un clic sur un objet à portée, dans la vue à la première personne. Le curseur devient une main au survol.
- **Alcôve en face :** un clic sur le mur (ou Espace) prend les objets de la face.
  - Avec un objet **en main**, le clic le pose dans l'alcôve.
  - Les actuators de la face réagissent d'abord : prendre le Firestaff dans son alcôve ouvre des portes.
- **Inventaire :** une barre sous la zone de messages, avec une pastille par objet, de la couleur de sa catégorie.
  - Un clic sur une pastille prend l'objet **en main**. Le curseur devient un carré de la couleur de l'objet.
  - Un second clic sur la pastille le remet dans l'inventaire.
- **Poser :** objet en main, un clic sur le **sol** dans l'une des 4 sous-cases à portée l'y dépose.
- **Serrures :** Espace ou un clic sur la serrure, **la clé en main**. La serrure **garde** la clé.
- **Supports à torche :** un clic main vide prend la torche, un clic torche en main la remet.
- **Vues :**
  - la 2D, la 3D et les infobulles montrent les objets là où ils sont maintenant ;
  - un objet posé sur une case vide apparaît aussi, puisque toutes les cases sont parcourues, et non plus seulement celles de `dungeon.json`.

## 2. Règles

### Identifiant d'un objet

Les actuators désignent un objet par un identifiant (doc 009). `itemIdOf()` (`src/core/item-ids.js`) fait l'inverse de `decodeItemId()` :

| Objets | Identifiant |
|---|---|
| Clés (divers 9 à 24) | type + 167, par exemple Gold Key 184 |
| Copper / Silver / Gold Coin | 125 / 126 / 127 (probable) |
| Torch | 4 (probable) |
| The Firestaff / The Firestaff (Complete) | 27 / 28 (probable) |
| Autres | aucun : ils n'actionnent rien |

### Actuators au sol : enfoncés ou relâchés

Les actuators au sol suivent maintenant un état **enfoncé / relâché**, recalculé avant et après chaque changement :
- le groupe arrive ou part ;
- le groupe tourne ;
- on ramasse ou on pose un objet.

Un actuator n'agit que quand cet état **change**. Il est déclenché quand il devient enfoncé, sauf `revert`.

| Type | Enfoncé quand |
|---|---|
| P (3) | le groupe est sur la case, avec l'orientation demandée si `data` vaut 1 à 4 |
| TPCI (1) | le groupe, un objet ou une créature est sur la case |
| TPC (2) | le groupe ou une créature est sur la case |
| I (4) | l'objet `data` est posé sur la case |
| Détecteur d'objet porté (8) | le groupe est sur la case **et porte** l'objet `data` |

Les règles de la phase C sont retrouvées : une plaque TPCI déjà chargée d'un objet ne réagit pas au groupe. Elles sont maintenant étendues :
- **poser** un objet sur une plaque TPCI vide l'enfonce ;
- **ramasser** l'objet d'une plaque I la relâche.

### Clic sur une face de mur

1. **Actuators de la face :**
   - bouton (1) : toujours ;
   - « main non vide » (2) : un objet en main ;
   - « objet précis » (3) et serrure (4) : l'objet `data` est **en main** ;
   - la **serrure garde la clé** quand elle réagit ;
   - support (13, « Item storage », supports à torche) :
     - réagit si l'objet attendu y est et que la main est vide (l'objet est pris) ;
     - ou si l'objet attendu est en main et que le support est vide (il y est posé).
2. **Objets :**
   - si un objet est encore en main et que la face a une **alcôve**, il y est posé ;
   - une alcôve, c'est un décor « Square Alcove », « Arched Alcove » ou « Vi Altar ». Il est porté par la tuile ou par le **graphisme d'un actuator** de la face (`src/core/ornaments.js`) ;
   - sinon, les objets de la face sont pris.

Ne sont pas gérés : l'échangeur (16) et le type 17.

## 3. Vérifications

**Node :**
- **Serrure Gold Key (5, 4) du niveau 1**, face sud, actionnée depuis (5, 5) face au nord :
  - sans clé, rien ne se passe ;
  - on ramasse la Gold Key en (8, 3) ;
  - la serrure ouvre la porte (6, 5) au tick suivant et garde la clé.
- **WELCOME BACK** (critère de la phase D) :
  - Espace face à l'alcôve (14, 16) du niveau 6 ouvre les portes (13, 15) et (15, 15) et donne **The Firestaff** ;
  - de retour au Hall, le pas de (1, 5) vers (1, 4) imprime « WELCOME BACK BRAVE ADVENTURERS. ».
- **Poser :** le Firestaff en main, posé en (1, 4) face au nord, se retrouve dans la sous-case 0 (nord-ouest).
- **Non-régression :** la porte (18, 1) et ses plaques, et la marche aléatoire de 200 000 actions sans exception.

**Chrome :**
- **Serrure :** un clic souris sur la Gold Key à ses pieds la met dans l'inventaire (son marqueur disparaît de la 2D). Espace sur la serrure ouvre la porte (6, 5) et vide l'inventaire.
- **WELCOME BACK :** Espace sur l'alcôve du niveau 6 donne le Firestaff. Le pas sur (1, 4) affiche le message dans la zone de messages.
- **Poser :** clic sur la pastille (en main), puis « Poser ». Le marqueur réapparaît en 2D.
- Aucune erreur dans la console.

## 4. Limites

- Pas de **lancer**, ni de main gauche / droite. Le groupe est abstrait : un inventaire sans limite de poids.
- Les objets dans les **coffres** et ceux que portent les créatures restent inaccessibles.
- Les **identifiants** probables (pièces, torche, Firestaff) restent à confronter au jeu.

## 5. Retours de test et ajustements

| Retour | Ajustement |
|---|---|
| Ramasser jusqu'aux 2 premières sous-cases de la case d'en face | Portée de 4 sous-cases : `sim.reachable(level, x, y, position)` |
| Poser sur ces sous-cases, au clic, l'objet pris en main | Le bouton « Poser » est supprimé. Un clic sur le sol pose l'objet en main sur la sous-case visée, calculée à partir du point touché |
| Impossible de poser dans l'autel N0 (4, 18) ni de remettre la torche N0 (3, 14) | L'autel de Vi est un **graphisme d'actuator** (inactif, graphisme 5), pas une décoration de tuile. C'est désormais une alcôve. Le support à torche est un actuator de **type 13**, maintenant géré |
| Curseur quand un objet est en main | Carré de la couleur de la catégorie, avec une petite flèche |
| Supprimer « posséder suffit » | Serrures et « objet précis » : objet **en main**. Le détecteur d'objet porté (au sol) compte toujours tout l'inventaire |
| Dans un téléporteur, impossible d'agir (N1 (13, 16)) | Le champ du téléporteur, à 0,35 de son centre, arrêtait les rayons de la souris, alors que l'œil est reculé de 0,35. Les **téléporteurs sont ignorés** par le pointeur |
| Visuel des alcôves | Une **niche** sombre avec un rebord de pierre, à la hauteur où les objets y reposent |

**Vérifications :**
- **Node :**
  - une clé hors de portée n'est pas prise ;
  - la serrure ne réagit pas à la clé restée dans l'inventaire, mais réagit à la clé en main ;
  - support à torche : prendre puis remettre, et l'ordre de ses actuators alterne ;
  - autel : prendre puis remettre le parchemin ;
  - poser sur la sous-case proche de la case d'en face réussit, mais pas sur la sous-case éloignée.
- **Chrome :**
  - la niche de l'autel s'affiche ;
  - un clic prend le parchemin, la pastille passe en main avec son curseur, et un clic sur la niche le repose ;
  - depuis le téléporteur N1 (13, 16), un clic au centre atteint les murs sud et est.
- Aucune erreur dans la console.

## 6. Retours graphiques et objets en mouvement

| Retour | Ajustement |
|---|---|
| Créatures qui ne touchent pas le sol | Le cylindre mesure 0,7 × la hauteur des murs, mais il était centré à 0,35 quelle que soit cette hauteur. Il est maintenant posé au sol, en 3D et dans la vue à la première personne (`level-contents.js`) |
| Portes à la hauteur des murs | Une porte fait maintenant toute la hauteur du mur (`dimensions.door`). Les téléporteurs restent à 90 % (`dimensions.teleporter`). En 3D, une porte ouverte remonte toujours en laissant dépasser son quart inférieur |
| Flash à la chute dans une trappe | Même liseré rouge qu'une collision, à chaque effet `fall` (pas ou mécanisme) |
| Objets dans les trappes et les téléporteurs | `resolveItemArrival()` (`rules.js`) fait tomber un objet par les trappes ouvertes et l'envoie par les téléporteurs actifs dont la portée inclut les objets (`all`, `items`, `items_party`), en chaîne. Les escaliers ne sont pas concernés |
| `F` désactive la sélection courante | Après le déplacement, la sélection et ses liens sont effacés |

**Quand un objet se déplace :**
- quand on le **pose** ;
- quand une **trappe s'ouvre** ou qu'un **téléporteur s'active** sous lui, comme pour le groupe.

Il garde sa sous-case. Les actuators au sol des deux cases réagissent, et la barre d'état l'annonce (événement `itemsMoved`).

**Exemple :** le téléporteur N1 (13, 16) ne transporte que les objets, vers (14, 14). Juste à côté, l'inscription (14, 16) dit « TO CLOSE PIT LEAVE A VALUABLE ON FLOOR » : l'énigme devient jouable.

**Vérifications :**
- **Node :**
  - une Gold Key posée sur la trappe (7, 8) du niveau 1, fermée par le levier, y reste ;
  - au clic suivant sur le levier, la trappe s'ouvre et la clé tombe en N2 (2, 12) ;
  - une seconde clé posée sur la trappe ouverte tombe aussitôt ;
  - les 5 téléporteurs « objets » ouverts emportent un objet et laissent le groupe sur place.
- **Chrome :**
  - la porte fermée (18, 1) occupe toute la hauteur ;
  - une créature du niveau 1, en (27, 2), repose au sol ;
  - `F` efface la sélection ;
  - aucune erreur dans la console.

## Sources

Aucune nouvelle source. Identifiants : doc 009 ; décors muraux (alcôves) : doc 002.
