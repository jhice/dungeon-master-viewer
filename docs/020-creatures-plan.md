# 020 — Créatures : plan de travail

> Suite de [019-main-coffres-portes-cassables.md](019-main-coffres-portes-cassables.md).
> **Document de planification**, à lire au début de la session qui codera l'un des points.
> Rien n'est implémenté ici. Les phases sont pensées pour être faites **une par session**, dans l'ordre ou presque (voir § 3).

## 1. Point de départ

### Ce que les données fournissent (`data/dungeon.json`, doc 008)

| Élément | Nombre | Champs utiles |
|---|---|---|
| Groupes de créatures | 182 (303 individus, 25 espèces) | `type`, `name`, `count`, `members[]` (`hp`, `position` = sous-case, `null` = seul au centre), `facing`, `important`, `at`, `items` (possessions) |
| Espèces les plus nombreuses | Trolin 47, Skeleton 42, Mummy 38, Screamer 30, Wizard Eye 17, Giant Wasp 14, Rockpile 13, Giggler 13… | `catalog.creature[type]` donne le nom |
| Groupes portant des objets | 18 (25 objets) | `items` du groupe |
| Générateurs de créatures | 50 actuators au sol | `generator { count, isMax, hpMultiplier }`, `data` = type de créature, `delay` (régénération) |
| Téléporteurs « créatures seules » | 30 | `scope: 'creatures'` : aujourd'hui sans effet |
| Groupes posés sur une plaque TPC / TPCI | 1 | N3 (7, 5) : la plaque de « YOU WILL REGRET THAT » (doc 016) |
| Répartition | aucune au niveau 0, 1 au niveau 13 | 15 à 23 groupes par niveau ailleurs |
| Fiches des champions (Hall) | 24 | Décodées en doc 010 (`decodeChampion()`) : PV, endurance, mana, 7 attributs, 16 compétences |

### Ce que les données ne fournissent pas

Les **caractéristiques des espèces** font partie du moteur, pas de `Dungeon.xml` :
- vitesse et fréquence d'attaque, attaque et défense, PV de base ;
- taille (combien par case) ;
- capacités : immatériel (traverse les portes), vole (ignore les trappes), lance des sorts ;
- portée de vue, réaction à la lumière, butin à la mort (os…).

**Première tâche de chaque phase qui en a besoin :** les reconstituer.
- Sources : la *Dungeon Master Encyclopaedia* et ReDMCSB (table des créatures du moteur), sur http://dmweb.free.fr/, listées dans `docs/000-sources.md`.
- Format : une table `src/core/creature-info.js`, avec la source de chaque valeur.
- Sinon, des valeurs **provisoires**, marquées comme telles.

### Ce qui existe déjà et servira

- **Règles de passage et d'arrivée** (`src/sim/rules.js`) : `blockReason()`, `resolveArrival()`, `resolveItemArrival()`. Il faudra un équivalent `resolveCreatureArrival()` avec la portée `creatures`.
- **Plaques enfoncées / relâchées** (`floorChange()` et `pressedOn()` dans `src/sim/logic.js`) : elles lisent déjà la présence d'une créature, aujourd'hui fixe dans `dungeon.json`.
- **Horloge et file d'événements** (`src/sim/clock.js`) : les créatures agiront par ticks.
- **Affichage :** cylindres colorés par espèce en 2D, en 3D et dans la vue à la première personne (`level-contents.js`), et sources des contenus (`contentsAt()` dans `main.js`).
- **Brouillon de la simulation** (doc 012, réponses Q3 et Q4) :
  - Q3, **groupe abstrait** : sans caractéristiques ;
  - Q4, **créatures traversables** : on passe à travers, pour ne pas être bloqué en testant.
  
  Les phases ci-dessous reviennent sur ces deux réponses, au moment voulu.

## 2. Les phases

### Phase C1 — Présence et déplacement

> **Faite**, voir [021-creatures-phase-c1.md](021-creatures-phase-c1.md). Q1 : bloquantes ; Q2 : documentation, strict minimum ; Q3 : pas instantané.

**Objectif :** le donjon vit. Les créatures se déplacent et interagissent avec les mécanismes, sans combat.

- **État** (`src/sim/state.js`) : les groupes deviennent mutables, avec leur position, leur orientation et leurs membres (PV restants). On copie `dungeon.data.creatures` comme les objets, et les vues lisent l'état, plus `dungeon.json`.
- **Déplacement** (nouveau `src/sim/creatures.js`) : à intervalle propre à l'espèce, un pas vers une case voisine franchissable.
  - Comportement simple au départ : errance aléatoire et déterministe (graine), ou immobilité selon l'espèce.
  - Une case par groupe : un groupe n'entre pas sur la case d'un autre groupe.
- **Passage :**
  - murs, portes fermées et faux murs fermés bloquent, comme pour le groupe ;
  - les espèces **immatérielles** traversent les portes ;
  - les espèces **volantes** ignorent les trappes ;
  - les autres tombent par les trappes ouvertes et suivent les téléporteurs de portée `all` ou `creatures`, en chaîne.
- **Mécanismes :**
  - les plaques TPC / TPCI réagissent à l'arrivée et au départ d'une créature (`floorChange()`) ;
  - une porte ne se referme pas sur une créature, comme pour le groupe ;
  - les 30 téléporteurs « créatures » s'animent.
- **Générateurs :** quand le groupe enfonce la plaque d'un générateur, celui-ci crée un groupe de l'espèce `data`, avec `count` et `isMax`, puis attend `delay` avant de pouvoir recommencer.
- **Le groupe et les créatures :** Q4 à revoir.
  - Option A : on garde les créatures traversables.
  - Option B : elles bloquent, et `F` reste l'échappatoire pour les tests.
- **Vues :**
  - les cylindres suivent les déplacements (événement `creaturesMoved`), avec une mise à jour ciblée de la case et sans reconstruire tout le niveau à chaque pas ;
  - le cylindre devient orienté, avec un repère de face.
- **Critère de fin :**
  - des créatures se déplacent au niveau 1 sans traverser les murs ;
  - une créature qui passe sur une plaque l'actionne ;
  - « YOU WILL REGRET THAT » s'affiche quand la créature de N3 (7, 5) quitte sa plaque ;
  - un générateur produit son groupe.
- **Tests Node :** marche aléatoire étendue aux créatures (aucune exception, aucune créature dans un mur), cas du générateur et de la plaque N3 (7, 5).

### Phase C2 — Perception et poursuite

**Objectif :** les créatures réagissent au groupe, sans encore faire de dégâts.

- **Vue :** le groupe est-il visible ? Même niveau, ligne de vue dégagée dans la grille, distance maximale selon l'espèce. La lumière est permanente pour l'instant (Q7).
- **Ouïe :** un bruit (porte, combat plus tard) attire les créatures proches.
- **Poursuite :** une recherche de chemin (BFS) vers le groupe, dans la limite des cases franchissables pour l'espèce. Elle peut passer par les portes ouvertes, jamais par les trappes ouvertes.
- **Orientation :** une créature qui voit le groupe se tourne vers lui. Dans la vue à la première personne, on voit sa face.
- **Fuite** de certaines espèces, si les données reconstituées le prévoient.
- **Critère de fin :** au niveau 2, s'approcher d'un groupe fait venir les créatures au contact, puis elles restent face au groupe.
- **Dépendance :** C1.

### Phase C3 — Combat

**Objectif :** attaquer et être attaqué. C'est la plus grosse phase.

- **Prérequis, à décider en début de phase :** le groupe a besoin de **caractéristiques**.
  - Option A : un groupe abstrait avec des PV, une force et une défense simples.
  - Option B : de vrais **champions**, choisis au Hall. Leurs fiches sont déjà décodées (doc 010), et chacun a ses mains et ses PV.
  - L'option B rapproche du jeu, mais demande une interface de portraits (3 ou 4 champions).
- **Attaque du groupe :** une action d'attaque de l'arme en main, comme dans DM (Swing, Chop, Thrust…), sur la case en face.
  - Dégâts selon la force, l'arme et la défense de l'espèce, avec du hasard.
  - Le même calcul remplace le compteur de coups des portes cassables (doc 019, § 3) : attaque contre défense de la porte.
- **Attaque des créatures :** au contact, à la fréquence de l'espèce. Dégâts sur le groupe ou sur un champion. Mort du groupe, ou d'un champion, puis écran de fin.
- **Projectiles :** les lanceurs muraux (types 8 à 10, 17 actuators) et les créatures qui lancent des sorts.
  - Projectiles qui avancent case par case, touchent, ricochent.
  - Les boules de feu cassent les portes `fireball`.
- **Retour visuel :** flash de dégâts, chiffres de dégâts et barre de PV dans la fenêtre de jeu.
- **Critère de fin :** tuer un Screamer au niveau 1 avec une arme ; perdre des PV au contact d'un Trolin.
- **Dépendances :** C2 pour que les créatures attaquent d'elles-mêmes. Le combat « dans un sens » (le groupe attaque une créature immobile) peut se faire sur C1 seul.

### Phase C4 — Mort et butin

**Objectif :** les conséquences du combat.

- **Mort d'un membre :** il disparaît de sa sous-case. À la mort du dernier, le groupe disparaît, et sa plaque éventuelle se relâche (`floorChange()`).
- **Butin :**
  - les possessions du groupe (18 groupes, 25 objets) tombent sur sa case ;
  - certaines espèces laissent un objet propre : os, ou de quoi manger chez certaines espèces. C'est à reconstituer, comme les caractéristiques.
- **Objets en main d'une créature :** les voleurs (Giggler) prennent des objets au groupe. À voir si les données le permettent.
- **Critère de fin :** tuer la créature de N3 (7, 5) relâche sa plaque, et « YOU WILL REGRET THAT » s'affiche. Tuer un groupe qui porte des objets les laisse au sol.
- **Dépendance :** C3.

## 3. Ordre conseillé

```
C1 présence et déplacement ──► C2 perception et poursuite ──► C3 combat ──► C4 mort et butin
           └──────────────► (C3 « dans un sens » possible dès C1)
```

- **C1** est indépendante et visible tout de suite. Elle débloque déjà les plaques, les téléporteurs « créatures » et les générateurs.
- **C3** demande d'abord la décision sur le groupe (abstrait ou champions). C'est la question qui pèse le plus sur la suite du projet.

## 4. Questions à trancher au début de la session concernée

1. **(C1) Créatures bloquantes ?** On garde Q4 (traversables), ou elles bloquent le groupe, avec `F` comme échappatoire ?
2. **(C1) Caractéristiques des espèces :** reconstituer depuis la documentation (ReDMCSB, Encyclopaedia), ce qui est plus long mais fidèle, ou commencer avec des valeurs provisoires ?
3. **(C1) Mouvement :** pas à pas instantané (comme le groupe aujourd'hui), ou attendre les transitions de la phase F ?
4. **(C3) Le groupe :** abstrait avec des statistiques, ou de vrais champions choisis au Hall ?
5. **(C3) Interface de combat :** panneau d'actions par arme, comme dans DM, ou attaque simplifiée au clic ?

## Sources

Aucune nouvelle source consultée pour ce plan. Les chiffres viennent de `dungeon.json` (docs 002, 008, 009, 010). Les caractéristiques
des créatures seront à prendre dans la *Dungeon Master Encyclopaedia* et ReDMCSB (http://dmweb.free.fr/, voir `docs/000-sources.md`),
à citer dans la doc de chaque phase.
