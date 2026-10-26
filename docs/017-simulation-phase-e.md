# 017 — Simulation, phase E : objets

> Suite de [016-simulation-phase-d.md](016-simulation-phase-d.md).
> Phase E : ramasser, poser, main active, serrures à clé, alcôves, détecteurs.
> Gestion simplifiée (réponse Q2) : un **inventaire** du groupe. Pour une serrure, il suffit de **posséder** la clé.

## 1. Utilisation

- **Ramasser :** un clic sur un objet **de la case du groupe**, dans la vue à la première personne. Le curseur devient une main.
  - Un objet est dans la sous-case avant gauche quand on le pose, et les deux sous-cases de devant sont visibles.
- **Alcôve en face :** un clic sur le mur (ou Espace) prend les objets de la face.
  - Avec un objet **en main**, le clic le pose dans l'alcôve.
  - Les actuators de la face réagissent d'abord : prendre le Firestaff dans son alcôve ouvre des portes.
- **Inventaire :** une barre sous la zone de messages, avec une pastille par objet, de la couleur de sa catégorie.
  - Un clic sur une pastille prend l'objet **en main**, un second clic le lâche.
  - **Poser** dépose l'objet en main, ou à défaut le dernier ramassé, sur la case du groupe.
- **Serrures :** Espace ou un clic sur la serrure, avec la clé dans l'inventaire, qu'elle soit en main ou non. La serrure **garde** la clé.
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
   - « objet précis » (3) et serrure (4) : l'objet `data` est en main ou dans l'inventaire ;
   - la **serrure garde la clé** quand elle réagit.
2. **Objets :**
   - si un objet est encore en main et que la face a une **alcôve** (décor « … Alcove »), il y est posé ;
   - sinon, les objets de la face sont pris.

Ne sont pas gérés : les supports à torche et alcôves à actuator (type 13), l'échangeur (16) et le type 17.

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
- Les **identifiants** probables (pièces, torche, Firestaff) et la règle « posséder suffit » restent à confronter au jeu.

## Sources

Aucune nouvelle source. Identifiants : doc 009 ; décors muraux (alcôves) : doc 002.
