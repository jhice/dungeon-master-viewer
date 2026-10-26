# Simulation

Premières pistes (en anglais)

- first person grid based dungeon crawler
- In this context, a dungeon crawler is a grid based RPG viewed in first person and with 90 degree turning.

## Controls and controller behavior

For keyboard controls, use the default keybinds that (most) players are used to in modern dungeon crawlers:

- W/S move forward/backward
- A/D strafe side to side
- Q/E turn left/right

Note : if possible, use the keyboard code so that QWERTY/AZERTY works with the same scheme.
Note : we must remap the current keys "S" and "E" respectively "tile states" and "level labels"

Additionally, ideally support both left and right handed players. This typically means support for Arrow Keys and Num Pad to allow more people to be able to comfortably play your game. In that case :

- 5/2 move forward/backward
- 1/3 strafe side to side
- 4/6 turn left/right

A solid implementation of movement and turning. Instant step is easiest to do, but if you add transitional movement between grid squares and transitional turning there are some things you should consider:

We strongly recommend that you focus on having a solid implementation of movement and turning. Instant step is easiest to do, but if you add transitional movement between grid squares and transitional turning there are some things you should consider:

- Too slow transition speed will make the player wait unnecessarily and it slows down the overall pace of the game.
- Make sure your game responds well to input while moving. Queuing the input allows the player to initiate a turn or a move before the current transition has ended. This prevents full stops and allows for fluid movement and turning.
- Perspective (field of view) is a very important part of crawling a dungeon. If the field of view is so narrow that the player can't see parts of the floor square he/she are standing on but instead is facing a wall which fills the whole viewport, orientation will be extremely difficult. It is highly recommended to show parts of the current floor square and also side corners. This enables the player to easily see if there is an exit to the left or right. See [this GIF](./assets/crawler.gif) for a good example of proper field of view. Often this is done by adjusting field of view and/or pulling the eye-position back a little bit.
- When possible you should consider adding an option to toggle between instant and transitional movement and turning. Some players prefer one over the other.

## 2D et 3D

(je repasse en français)

Déjà, on peut mettre de côté le renderer ASCII (juste le sortir de la touche "R").

Idéalement, la simulation prend place dans un encart autonome, au-dessus des vues 2D et 3D. La même simulation est accessible pour les 2 vues. Elles vont dont partager le déplacement et les rotations du personnage. Donc bien séparer les contrôles du rendu. Un personnage serait visible dans le rendu 2D et 3D (direction visible).

Le viewport du jeu de l'époque est en 4/3. On pourrait imaginer un switch 4/3 et 16/9, cela impliquerait sûrement des ajustement de fov et/ou de position de caméra.

On doit pouvoir interagir à la souris dans le viewport : actuators, items, tout ce qui est interactif.

Ce qui est prioritaire : rendu, déplacement, activation des actuators, escaliers, téléporteurs, trappes, faux murs, lire les textes (j'en oublie peut-être)

## Brouillon

> Rédigé par Claude Code à partir des sections ci-dessus et des docs 001 à 011. Point de départ pour la session
> qui codera la simulation. Les **questions ouvertes** (§ 7) sont à trancher avant ou au début de cette session.

### 1. Objectif de la première version

Un **dungeon crawler à la première personne**, en déplacement case par case avec rotations de 90°, dans le donjon de DM.
On y joue la **mécanique du donjon** : déplacements, escaliers, trappes, téléporteurs, faux murs, portes, actuators et textes.
Pas encore de combat, de champions, de magie ni de créatures actives : celles-ci restent visibles mais immobiles (voir Q4).

Priorités de l'utilisateur, dans l'ordre : rendu, déplacement, activation des actuators, escaliers, téléporteurs,
trappes, faux murs, lecture des textes.

### 2. Ce que les données fournissent déjà

Tout est dans `data/dungeon.json` (voir 002), avec les accès de `src/core/`.

| Besoin | Donnée | Remarques |
|---|---|---|
| Position de départ | `start` : niveau 0, (1, 3), face au sud | La case de départ est un **téléporteur fermé** qui porte 2 détecteurs d'objet porté (Firestaff). C'est la fin du jeu : il renvoie vers (9, 1) quand on revient avec le Firestaff. Il ne doit pas se déclencher au départ |
| Murs et sols | `grid`, `tiles` | `Dungeon.tileAt()`, `globalTileAt()` |
| États initiaux | portes `open`, trappes `open` / `invisible`, faux murs `open` / `imaginary`, téléporteurs `open` / `visible` | `src/core/tile-states.js`. La simulation doit les **copier dans un état mutable**, sans toucher au JSON |
| Escaliers | `direction`, `orientation`, liens de `findConnections()` | Les 29 paires se correspondent aux mêmes coordonnées globales (003). Côté d'accès : `Dungeon.accessSide()` (005) |
| Trappes | Chute au niveau inférieur, mêmes coordonnées globales | 67 chutes valides, dont 2 sur un téléporteur et 1 sur une autre trappe (003) |
| Téléporteurs | `dest`, `rotation`, `rotationType`, `scope` | 54 arrivent sur un autre téléporteur : il faut **éviter les boucles infinies** |
| Actuators | 683, décodés (`kind`, `type`, `action`, `delay`, `onceOnly`, `revert`, `remote`, `local`, `gate`…) | Graphe de liens dans `buildLogic()` (009) : 507 actuators distants et 179 téléporteurs |
| Cibles des actions | portes 114, téléporteurs 91, trappes 73, faux murs 81, sols 63, murs 85 | Actions par type de cible : voir le tableau ci-dessous |
| Textes | `buildTexts()`, `textsAt()` (010) | Inscriptions lisibles face à leur face de mur. Un **message** apparaît quand un actuator lui envoie un `set` (par exemple « WELCOME BACK » déclenché par un détecteur à l'entrée du Hall) |
| Objets | 606 placés, positions dans la case (008) | Nécessaires aux serrures (clés : identifiant = type + 167, voir 009) |

Actions reçues par type de cible :

| Cible | set | clear | toggle | hold |
|---|---|---|---|---|
| Porte | 80 | 12 | 18 | 4 |
| Trappe | 21 | 17 | 29 | 6 |
| Faux mur | 56 | 6 | 18 | 1 |
| Téléporteur | 33 | 24 | 3 | 31 |
| Mur (chaîne vers des actuators) | 64 | 6 | 10 | 5 |
| Sol | 63 | — | — | — |

### 3. Règles à implémenter (à valider contre le jeu original)

Ces règles viennent de ma connaissance générale du moteur. **Elles sont à vérifier** dans le jeu original
ou sur la *Dungeon Master Encyclopaedia* et ReDMCSB (http://dmweb.free.fr/), voir `docs/000-sources.md`.

1. **Passage d'une case à l'autre :**
   - bloquent : mur, faux mur fermé non imaginaire, porte fermée ;
   - passent : faux mur ouvert ou imaginaire, trappe fermée (sol).
2. **Trappe ouverte**, même invisible : on tombe au niveau inférieur, aux mêmes coordonnées globales.
   On enchaîne si on arrive sur une autre trappe ou un téléporteur.
3. **Escalier :** entrer sur la case mène à l'escalier correspondant du niveau adjacent. Dans DM, le groupe est
   ensuite placé **à côté** de l'escalier d'arrivée, sur son côté d'accès, et orienté dos à l'escalier. À vérifier.
4. **Téléporteur ouvert** dont la portée inclut le groupe (`all`, `items_party`) : déplacement immédiat vers `dest`,
   avec une rotation relative ou absolue. Un téléporteur fermé est un simple sol.
5. **Actuators au sol :**
   - déclenchés à l'entrée sur la case, et selon le type à la sortie ;
   - P = groupe seul, TPCI / TPC = objets, groupe ou créatures ;
   - le type 3 a une condition d'orientation (« activated only if party faces north »).
6. **Actuators muraux :** déclenchés par un **clic** sur la face du mur qu'on regarde, depuis la case voisine.
   - Les boutons (« Any item / Empty hand ») marchent tout de suite.
   - Les serrures (« Specific item ») demandent un objet en main (voir Q2).
7. **Effet sur une cible :**
   - porte : `set` = ouvrir, `clear` = fermer, `toggle` = inverser, `hold` = ouvrir tant que la cause dure ;
   - trappe : ouvrir ou fermer ;
   - faux mur : faire disparaître ou réapparaître ;
   - téléporteur : activer ou désactiver ;
   - mur portant des actuators : envoyer l'action aux portes logiques et aux compteurs, qui la propagent à leur tour ;
   - message : le faire apparaître ou le masquer.
   - **Le sens exact de `set` et `clear` pour chaque cible est à confirmer.**
8. **Temps :** `delay` est exprimé en **ticks** du moteur. Il faut une horloge et un ordonnanceur d'événements différés.
   La durée d'un tick dans DM est à confirmer (de l'ordre d'une fraction de seconde).
9. **Autres comportements :** `onceOnly` désactive l'actuator après usage, `revert` inverse l'action.
   Les portes logiques ET/OU comparent l'état courant à leur `reference`. Les compteurs décomptent `data`.

### 4. Architecture proposée

```
src/sim/
├── state.js        état mutable : copie des états de tuiles, actuators (usages, bits des portes logiques,
│                   compteurs), textes visibles, objets déplacés ; reset()
├── party.js        position (niveau, x, y), orientation ; move / strafe / turn → résultat (bloqué, chute, téléporté…)
├── rules.js        passage, escaliers, trappes, téléporteurs : fonctions pures sur (état, position)
├── logic.js        moteur d'actions : déclenchement, propagation set / clear / toggle / hold, chaînes
├── clock.js        horloge en ticks et file d'événements différés (delay)
├── events.js       bus d'événements : tileChanged, partyMoved, textShown… (abonnement des vues)
└── controls.js     entrées clavier par KeyboardEvent.code → commandes, file d'attente, mode instantané ou transition
src/render/first-person/
└── fp-renderer.js  vue à la première personne (Three.js), viewport 4/3 ou 16/9, picking souris
```

- **Séparer simulation, contrôles et rendu**, comme demandé. `src/sim/` ne dépend ni du DOM ni de Three.js, ce qui permet de le tester dans Node.
- **Une seule simulation pour toutes les vues.** La vue 1re personne, la 2D et la 3D s'abonnent aux événements :
  - la 2D et la 3D affichent un **marqueur du personnage** (position et orientation) et suivent son niveau ;
  - la 2D et la 3D doivent pouvoir **mettre à jour une tuile** quand son état change (`renderer.updateTile(level, x, y)`).
    En 2D, il suffit de changer des classes. En 3D, on reconstruit le niveau (environ 2 ms, voir 007) ou seulement l'instance concernée.
- **Vue 1re personne :** une scène dédiée, qui réutilise `level-meshes.js` avec des **murs pleine hauteur**,
  plus un plafond et un éclairage d'ambiance. Tout ce qui est interactif doit être cliquable par raycasting : faces de murs, objets, boutons.
- **Champ de vision :** il faut voir une partie de la case courante et les coins latéraux (cf. `assets/crawler.gif`), donc reculer légèrement
  l'œil et ajuster le FOV, avec des réglages distincts en 4/3 et en 16/9.
- **Mouvement :** une transition rapide et interruptible, avec une file d'entrées, et une option « instantané ou transition ».

### 5. Clavier (par `KeyboardEvent.code`, donc identique en QWERTY et AZERTY)

| Action | Main gauche | Main droite (flèches) | Pavé numérique |
|---|---|---|---|
| Avancer / reculer | `KeyW` / `KeyS` (Z / S en AZERTY) | ↑ / ↓ | `Numpad5` / `Numpad2` |
| Pas de côté | `KeyA` / `KeyD` (Q / D) | — | `Numpad1` / `Numpad3` |
| Tourner | `KeyQ` / `KeyE` (A / E) | ← / → | `Numpad4` / `Numpad6` |

Conséquences pour les raccourcis existants :
- **↑ / ↓ et PgUp / PgDn :** en mode jeu, le niveau affiché suit le personnage. Le changement de niveau au clavier
  reste disponible avec PgUp / PgDn ou Maj + molette, en dehors du jeu.
- **Conflits :** `S` (états des tuiles) et `E` (étiquettes) sont à **remapper**, comme demandé. `A`, `Q`, `W`, `Z`, `D` doivent aussi rester libres.
  Proposition : états `V`, étiquettes `N`, à confirmer (Q5).
- **ASCII :** le renderer ASCII sort de la rotation de la touche `R`, comme demandé. Le code reste en place pour l'outil en ligne de commande.

### 6. Phasage proposé

| Phase | Contenu | Critère de fin |
|---|---|---|
| A | État mutable, `party`, contrôles (instantané), vue 1re personne 4/3, marqueur dans la 2D et la 3D qui suivent le niveau | On se promène dans le niveau 0 sans traverser les murs, la 2D et la 3D suivent |
| B | Escaliers, trappes, téléporteurs (avec rotations et chaînes), faux murs | Descente du niveau 0 au niveau 13 par les escaliers, chutes et téléportations cohérentes |
| C | Moteur d'actions : actuators au sol, boutons muraux au clic, set / clear / toggle / hold, délais, une seule fois, portes logiques, compteurs ; mise à jour des vues | La porte (18, 1) du niveau 1 et ses 4 plaques se comportent comme dans le jeu |
| D | Textes : inscription affichée face à sa face de mur, messages déclenchés | « WELCOME BACK » apparaît au bon moment |
| E | Objets : ramasser, poser, main active → serrures à clé, alcôves, détecteurs | La serrure Gold Key (5, 4) du niveau 1 s'ouvre avec la Gold Key |
| F | Transitions animées et option instantané / transition, 16/9, sauvegarde de partie | — |

### 7. Questions ouvertes

1. **Disposition de l'encart :** « au-dessus des vues 2D et 3D », c'est un empilement vertical
   (la 1re personne en haut, la 2D ou la 3D en dessous) ou une fenêtre flottante superposée et déplaçable ?
   Et la vue 2D / 3D reste-t-elle visible en même temps (carte de suivi) ?
2. **Objets et serrures :** beaucoup de portes demandent une clé. Faut-il la gestion des objets dès la phase C,
   ou un **mode exploration** en attendant (portes à clé ouvrables d'un clic, traversée des murs en option) ?
3. **Groupe :** un personnage abstrait sans caractéristiques au début, ou déjà les 4 champions
   (choix au Hall des champions, fiches décodées en 010) ?
4. **Créatures :** visibles mais immobiles et non bloquantes au début, ou bloquantes (on ne traverse pas une case occupée) ?
5. **Raccourcis :** d'accord pour états → `V` et étiquettes → `N` ? Et les autres lettres de la visionneuse,
   comme `T` (tous les liens) et `C` (créatures), restent-elles actives en mode jeu ?
6. **Fidélité des règles :** on implémente les règles du § 3 en l'état, et tu les vérifies dans l'original au fil de l'eau
   (comme pour l'ordre des positions en 008), ou il faut d'abord les confronter à la documentation (ReDMCSB) ?
7. **Lumière :** donjon éclairé uniformément au début, ou obscurité et torches dès la première version ?
   Le niveau 0 a `difficulty = 0`, c'est-à-dire une lumière permanente.

#### Réponses

1. fenêtre flottante superposée et déplaçable / les vues restent visibles en même temps
2. on peut avoir une gestion simplifiée des clés/objets : crée un inventaire qui stocke les objets dans la "party". au clic sur une porte, on doit posséder l'objet en question dans l'inventaire.
3. personnage abstrait
4. traversons les créatures, sinon on pourra être bloqué pour tester les niveaux
5. je propose `L` pour les étiquettes / les raccourcis restent actifs en jeu
6. on implément en l'état. je vérifierai par la suite, ton analyse semble juste (je devrais aussi vérifier ou se trouve le nord)
7. lumière permanente sur tous les niveaux pour le moment.