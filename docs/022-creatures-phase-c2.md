# 022 — Créatures, phase C2 : perception et poursuite

> Suite de [020-creatures-plan.md](020-creatures-plan.md), phase C2, après [021-creatures-phase-c1.md](021-creatures-phase-c1.md).
> Les créatures remarquent le groupe, viennent au contact et restent face à lui. Pas encore de dégâts.

## 1. Données ajoutées aux espèces

`src/core/creature-info.js` reçoit 3 colonnes de la table *Creature Details* de l'Encyclopaedia.

| Colonne | Sens | Usage |
|---|---|---|
| Sight range | Distance maximale à laquelle la créature voit le groupe, **si elle lui fait face**. Divisée par 2 par niveau d'obscurité | Vue |
| Smell range | Distance à laquelle elle détecte le groupe et **se tourne vers lui**, même de dos | Odorat |
| Hear range | Utilisée seulement par les versions 3.1 et suivantes, quand le groupe se tient **à côté** d'une créature qui ne le voit pas | Ouïe |

- **Version :** quand les versions diffèrent, on prend la colonne (d), celle de DM Amiga 3.6 et PC 3.4. C'est la version des graphismes de référence (doc 008). Seule la Black Flame change : sa vue passe de 4 à 2.
- **Lumière :** elle reste permanente (doc 012, Q7), donc la vue n'est jamais divisée par 2.

Quelques valeurs :

| Espèce | Vue | Odorat | Ouïe |
|---|---|---|---|
| Wizard Eye | 10 | 2 | 0 |
| Materializer | 8 | 2 | 5 |
| Giggler | 6 | 3 | 7 |
| Mummy | 4 | 2 | 2 |
| Trolin, Skeleton | 3 | 3 et 0 | 4 et 1 |
| Magenta Worm | 1 | **10** | 10 |
| Screamer | 1 | 1 | 1 |

## 2. Règles (`src/sim/perception.js`)

### Remarquer le groupe

Un groupe actif (du niveau du groupe de joueurs, doc 021) regarde **à chaque fois qu'il doit agir**, c'est-à-dire à l'échéance de son prochain pas.

| Sens | Condition | Effet |
|---|---|---|
| **Vue** | Distance ≤ vue, le groupe de joueurs est **devant** (voir ci-dessous), ligne de vue dégagée | Il le poursuit |
| **Odorat** | Distance ≤ odorat, ligne de vue dégagée, orientation indifférente | Il se tourne vers lui. Il le verra peut-être au tour suivant |
| **Ouïe** | Le groupe de joueurs est sur une case voisine, l'ouïe n'est pas nulle | Il se tourne vers lui, et le poursuit s'il bouge |

- **Devant :** l'orientation de la créature est l'une des deux directions qui mènent au groupe de joueurs (l'axe principal, et l'autre axe s'il n'est pas aligné). Cela fait un cône de 180° environ.
- **Distance :** le plus grand des deux écarts, plus la moitié du plus petit. Par exemple, 3 cases en ligne valent 3, et (3, 2) vaut 4.
- **Ligne de vue :** la droite entre les centres des deux cases ne doit traverser :
  - aucun mur ;
  - aucun faux mur fermé (un mur imaginaire cache aussi la vue) ;
  - aucune porte fermée en bois ou en fer. Les grilles et les portes Ra laissent voir (Encyclopaedia, *Graphics.dat Item 559*, caractéristiques des portes).

> **Provisoire, de mémoire (ReDMCSB, non vérifié) :** la formule de distance et le cône de vue.

### Poursuivre

- **Groupe vu :**
  - la créature retient la case où il se trouve ;
  - elle fait un pas vers une case voisine de cette case, par le plus court chemin.
- **Chemin :** une recherche en largeur, sur les cases que l'espèce peut prendre d'elle-même (`creaturePassage()`, doc 021) :
  - jamais par une trappe ouverte, sauf en lévitation ;
  - par une porte ouverte, ou fermée si l'espèce est immatérielle ;
  - en contournant les **téléporteurs** qui l'emporteraient ;
  - en contournant les autres groupes.
  - La recherche est limitée à 400 cases.
- **Rythme :** un pas toutes les `moveTicks`, sans le tirage d'attente de l'errance.
- **Au contact :**
  - sur une case voisine du groupe de joueurs, elle ne bouge plus, et **se tourne vers lui** chaque fois qu'elle doit agir ;
  - si le groupe se décale, elle le suit.
- **Groupe perdu de vue** (porte refermée, groupe parti) : elle va jusqu'à la dernière case où elle l'a vu, puis reprend l'errance.
- **Pas de chemin :** elle se tourne vers le groupe et attend.

### Ce qui n'est pas repris

- **Fuite.** D'après l'Encyclopaedia, une créature fuit selon sa résistance à la peur, après la mort d'un membre de son groupe, ou quand le groupe utilise War Cry, Calm, Brandish, Blow Horn ou Confuse.
  - Tout cela demande le combat et des champions (C3 et C4).
  - La colonne *Fear resistance* sera ajoutée à ce moment-là. C'est aussi là que se placera le **cri de guerre**.
- **Bruit qui attire les créatures** (prévu dans doc 020). D'après l'Encyclopaedia, l'ouïe ne sert dans DM que pour un groupe voisin. Il n'y a pas de bruit qui porte au loin, donc rien n'est fait.
- **Attaque à distance** (`Attack range`, sorts des Vexirks, Demons…) : en C3.
- **Faux murs imaginaires.** L'Encyclopaedia indique qu'une créature les traverse si elle a vu le groupe le faire.
  - Ici, `creaturePassage()` laisse déjà toutes les créatures les traverser, depuis C1.
  - C'est plus permissif que DM, à affiner plus tard.

## 3. Événements et vues

- **`groupAlerted { group, seen }`** : un groupe vient de remarquer le groupe de joueurs. La barre d'état affiche « 3 × Trolin vous ont repéré », ou « … trouvé » s'il l'a seulement rencontré à côté de lui.
- **`creaturesMoved`** reçoit `turned: true` quand un groupe se tourne sur place. Les vues redessinent le repère d'orientation :
  - la pointe en 2D ;
  - le « nez » en 3D et à la première personne.
  
  Dans la vue à la première personne, une créature au contact montre donc **sa face**.

## 4. Vérifications

**Node** (`node tools/test-creatures.mjs`, tout est bon) :

| Cas | Résultat |
|---|---|
| Niveau 2, Trolin en (10, 20) face au nord, groupe en (10, 18) | Il le voit, `groupAlerted`, contact en 2 ticks en (10, 19) |
| 20 s plus tard | Toujours au contact, face au nord (vers le groupe) |
| Le groupe se décale en (9, 18) | Le Trolin suit en (10, 18), face à l'ouest |
| Ligne de vue à travers une porte fermée | Grille N0 (5, 9) : on voit à travers. Porte en bois N0 (1, 14) : elle cache le groupe |
| Tests de C1 | Inchangés, tous bons |
| Marche aléatoire, 100 000 actions | Aucune exception, invariants tenus, 9,7 s (dont la lenteur des actuators, doc 021) |

**Chrome :** au niveau 2, le groupe est placé en (10, 18) avec `F`.
- « 3 × Trolin vous ont repéré » s'affiche.
- Le groupe vient en (10, 19), et on le voit de face dans la vue à la première personne.
- Un second groupe de Trolins s'approche aussi.
- Aucune erreur dans la console.

## 5. Limites et suite

- Une créature lente ne regarde qu'à l'échéance de son pas : un Screamer (120 ticks) met jusqu'à 20 s à réagir.
  C'est logique dans ce modèle. Dans DM, les créatures du niveau du groupe sont aussi traitées par événements, mais leurs délais exacts restent à vérifier.
- Tous les membres d'un groupe partagent son orientation (doc 021).
- **À vérifier dans le jeu :** la formule de distance, le cône de vue, la réaction quand il n'y a pas de chemin.
- **Suite : C3, le combat.** La question « groupe abstrait ou vrais champions » (doc 020, § 4, Q4) est à trancher en début de session.

## Sources

- *Dungeon Master Encyclopaedia*, **Creature Details** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/creature-details/.
  Colonnes Sight, Hear et Smell range et leur définition, résistance à la peur (pour la suite), comportement des créatures face aux faux murs imaginaires.
- *Dungeon Master Encyclopaedia*, **Graphics.dat Item 559** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/graphics.dat-item-559/.
  Caractéristiques des portes : les créatures voient à travers les grilles et les portes Ra, pas à travers les portes en bois ou en fer.
- **Connaissance du moteur, sans consultation de ReDMCSB :** formule de distance, cône de vue. À vérifier.
