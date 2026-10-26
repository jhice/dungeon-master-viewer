# 013 — Simulation, phase A

> Suite de [012-simulation.md](012-simulation.md) (brouillon et réponses aux questions ouvertes).
> Phase A : état mutable, personnage, contrôles instantanés, vue à la première personne en 4/3,
> marqueur du personnage dans la 2D et la 3D, qui suivent son niveau.

## 1. Utilisation

- **`P`** ou le bouton **▶ Jeu** du panneau ouvre ou ferme la fenêtre de simulation. Elle se rouvre au rechargement si elle était ouverte.
- La fenêtre **flotte** au-dessus des vues 2D / 3D, qui restent visibles (réponse Q1) :
  - on la **déplace** par sa barre de titre ;
  - on la **redimensionne** par le coin inférieur droit (largeur, le viewport garde le 4/3) ;
  - la position et la largeur sont mémorisées (`prefs.gameLayout`) ;
  - par défaut, elle est en haut à droite, à gauche des panneaux, pour ne pas cacher la carte ;
  - **⟲** ramène au départ, **×** ferme.
- La barre de titre affiche la position : « niveau 0 · (1, 3) · face sud ».
- Un déplacement bloqué fait clignoter le bord de la fenêtre en rouge, et la barre d'état indique la raison : « Bloqué : mur », « porte fermée ».

### Clavier en jeu (par `KeyboardEvent.code`, identique en QWERTY et AZERTY)

| Action | Main gauche (AZERTY / QWERTY) | Flèches | Pavé numérique |
|---|---|---|---|
| Avancer / reculer | Z / S — W / S | ↑ / ↓ | 5 / 2 |
| Pas de côté | Q / D — A / D | — | 1 / 3 |
| Tourner | A / E — Q / E | ← / → | 4 / 6 |

- Touche maintenue : un pas toutes les 160 ms au plus (sinon la répétition du clavier fait traverser le niveau d'un coup).
- Les touches de déplacement ne sont prises **qu'en jeu**. Fenêtre fermée, ↑ / ↓ changent de niveau comme avant.
- En jeu, **PgPréc / PgSuiv** et **Maj + molette** permettent toujours de regarder un autre niveau. La vue revient au niveau du personnage au pas suivant.

### Raccourcis remappés

| Fonction | Avant | Maintenant |
|---|---|---|
| États des tuiles | `S` | **`V`** |
| Étiquettes de niveau (3D) | `E` | **`N`** |
| Liens escaliers / trappes (3D) | `L` | `L` (inchangé) |
| Mode d'affichage (3D) | `F` | **`M`** |
| Mécanismes | `M` | **`K`**, puisque `M` est repris par le mode |
| Aller à la case sélectionnée | — | **`F`** (voir ci-dessous) |
| Renderer ASCII | dans la rotation de `R` | **sorti de la rotation** (`R` alterne 2D ↔ 3D). Le code reste, pour l'outil en ligne de commande |

Les autres raccourcis de la visionneuse restent actifs en jeu (réponse Q5). Aucune lettre de la visionneuse
ne tombe sur W, A, S, D, Q, E, Z.

### Aller à la case sélectionnée (`F`)

Outil de test : après un clic sur une case (2D ou 3D), **`F`** y place le personnage, sur n'importe quel niveau, sans changer son orientation.
- La fenêtre de jeu s'ouvre si elle était fermée.
- Une case infranchissable est refusée, avec la raison dans la barre d'état : « F : case infranchissable (mur) ».
- Sans sélection, la barre d'état le rappelle.
- Côté simulation, c'est `sim.teleport(level, x, y)`, qui émet `partyMoved` avec `kind: 'teleport'`. Pour l'instant, cela ne déclenche aucun effet de la case d'arrivée.

## 2. Architecture

```
src/sim/                     sans DOM ni Three.js : testable dans Node
├── simulation.js   façade : createSimulation(dungeon) → { state, party, command(), reset(), on() }
├── state.js        copie mutable des tuiles à état (portes, trappes, faux murs, téléporteurs) ; tileAt() a la forme de Dungeon.tileAt()
├── party.js        personnage { level, x, y, facing } immuable ; step(), turn(), rotate()
├── rules.js        blockReason() : pourquoi une case est infranchissable
├── events.js       bus d'événements : partyMoved, blocked, reset
└── controls.js     KeyboardEvent.code → commande (forward, back, left, right, turnLeft, turnRight)
src/render/first-person/
└── fp-renderer.js  vue à la première personne (Three.js)
src/ui/game-window.js   fenêtre flottante déplaçable
```

- `clock.js` (délais en ticks) et `logic.js` (actions des actuators) du brouillon viendront en phase C.
- **Une seule simulation** pour toutes les vues. `main.js` s'abonne à `partyMoved` :
  - il met à jour la vue à la première personne ;
  - il affiche le niveau du personnage dans la 2D / 3D s'il a changé ;
  - il place le marqueur.
- **Contrat des renderers** (`src/render/renderer.js`) : nouvelle méthode optionnelle `setParty(party | null)`.
  - **2D :** une flèche rouge dans la case, orientée, et la case défile dans la vue si besoin.
  - **3D :** un cône rouge orienté et un **faisceau vertical** pour le repérer de loin. Il suit l'espacement des niveaux et se masque en mode solo sur un autre niveau.
- `bindKeys()` passe désormais l'événement au résolveur (`(key, event)`), pour que la simulation lise `event.code`.

### Règles de passage (phase A)

| Case | Passage |
|---|---|
| Mur, hors carte | bloque |
| Faux mur fermé | bloque |
| Faux mur ouvert ou imaginaire | passe |
| Porte | passe si ouverte |
| Sol, trappe, escalier, téléporteur | passe, **sans effet** (phase B) |
| Créatures | ignorées : on les traverse (réponse Q4) |

Au départ, en (1, 3) du niveau 0 face au sud, on est sur le téléporteur fermé de fin de partie. Il n'a aucun effet, comme prévu.

## 3. Vue à la première personne

- **Ce qu'on voit :** seul le niveau du personnage est construit. On réutilise `buildLevelMeshes()` avec deux nouvelles options :
  - `tileAt` : la source des tuiles. La simulation passe son état mutable, et la vue suivra donc les portes et les faux murs en phase C (`updateTile()` reconstruit le niveau, environ 2 ms) ;
  - `game: true` : ce que voit le joueur, sans les aides de la visionneuse :
    - les faux murs fermés ou imaginaires ressemblent à des murs ;
    - un faux mur ouvert devient du sol, sans contour filaire. Un faux mur imaginaire a aussi un sol, visible quand on se tient dedans ;
    - les trappes invisibles ne sont pas dessinées ;
    - les téléporteurs ne sont dessinés que s'ils sont **visibles et ouverts** ;
    - seul le rendu « avec états » est construit.
- **Murs :** pleine hauteur (1 case), et un plafond.
- **Textures** procédurales (canvas, aucune image externe) : blocs de pierre décalés pour les murs, quatre dalles par case au sol. Elles sont teintées par les couleurs du thème (`--tile-wall`, `--tile-floor`).
- **Lumière** permanente sur tous les niveaux (réponse Q7) :
  - une lumière hémisphérique ;
  - une lumière portée par le personnage, qui éclaire davantage les faces proches et distingue les murs ;
  - un brouillard noir de 2,5 à 9 cases.
- **Champ de vision** (constantes `VIEW` en tête de `fp-renderer.js`, faciles à régler) :
  - FOV vertical de 62° en 4/3 ;
  - œil à 0,52 de hauteur, **reculé de 0,42 case** vers l'arrière de la case.
  
  On voit ainsi le sol de la case courante et les ouvertures latérales de la case suivante, comme dans `assets/crawler.gif`.
- **Rendu à la demande** (déplacement, redimensionnement), sans boucle d'animation. Les transitions viendront en phase F.

## 4. Vérifications

- **Node :** depuis le départ, 4 pas au sud, rotation, 2 pas à l'est, puis un pas de côté contre un mur → « blocked wall ».
- **Chrome :**
  - la fenêtre s'ouvre avec `P` ;
  - la vue correspond à la carte. En (3, 7) face à l'est, le mur du fond est à une case, et l'ouverture vers le nord en (4, 6) apparaît à gauche ;
  - le marqueur 2D est dans la bonne case et la bonne orientation, et le cône 3D est sur le niveau 0 ;
  - `N` / `L` basculent étiquettes et liens, `M` le mode 3D, `K` les mécanismes, `V` les états ;
  - `F` après un clic sur (9, 9) y place le personnage. Sur un mur, c'est refusé (« mur »), et sans sélection, un message le rappelle ;
  - en jeu, `PgSuiv` affiche le niveau 1, et `↓` fait reculer le personnage et ramène au niveau 0 ;
  - fenêtre fermée, `↓` change de niveau ;
  - ⟲ ramène en (1, 3), et la fenêtre déplacée retrouve sa position au rechargement ;
  - `R` alterne 2D ↔ 3D.

## 5. Reste à faire (phases suivantes)

- **B :**
  - escaliers : arrivée à côté de l'escalier, dos à lui ;
  - trappes ouvertes : chute ;
  - téléporteurs : portée, rotation, chaînes sans boucle infinie.
- **C :** actuators, horloge, clic dans le viewport (raycasting).
- **F :** transitions animées, 16/9 (FOV et recul distincts), sauvegarde. La position du personnage n'est **pas** mémorisée au rechargement pour l'instant.

## Sources

Aucune nouvelle source externe pour cette étape. Le code s'appuie sur les docs 002 à 012 et sur Three.js, déjà listé
dans [000-sources.md](000-sources.md). Comme pour les étapes précédentes, sa documentation n'a pas été consultée.
