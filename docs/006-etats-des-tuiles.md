# 006 — États des tuiles

> Suite de [005-renderer-3d.md](005-renderer-3d.md).
> Affichage des portes ouvertes ou fermées, des trappes ouvertes, fermées ou invisibles, et des faux murs
> fermés, imaginaires ou ouverts, en 2D et en 3D. L'ASCII reste en « types seuls » (décision consignée dans CLAUDE.md).

## 1. États présents dans le donjon

| Tuile | État | Nb | Sens (moteur DM, cohérent avec les données) |
|---|---|---|---|
| Porte | fermée | 160 | |
| Porte | ouverte | 10 | Relevée |
| Trappe | ouverte | 31 | Trou actif : on tombe |
| Trappe | fermée | 32 | Couverte, se comporte comme un sol tant qu'un mécanisme ne l'ouvre pas |
| Trappe | fermée et invisible | 4 | Le jeu ne la dessine pas (niveau 11, de (10,26) à (10,29)) |
| Faux mur | fermé | 72 | Ressemble à un mur et bloque, mais peut disparaître (passage secret) |
| Faux mur | fermé et imaginaire | 12 | Mur illusoire : dessiné mais franchissable |
| Faux mur | ouvert | 3 | Mur disparu : franchissable et non dessiné (niveau 11 (24,9), niveau 12 (8,8) et (3,9)) |

Aucune trappe « imaginaire » (dessinée mais sans danger) n'est présente. Le code la gère tout de même : elle serait atténuée.

## 2. Rendu

Principe : **tout reste visible**. Un état caché est atténué (40 % d'opacité), jamais supprimé.

| État | 2D | 3D |
|---|---|---|
| Porte fermée | Vantail plein | Vantail plein |
| **Porte ouverte** | **Rectangle vide avec bordure** | **Vantail relevé** comme une herse : seul son bas reste dans l'encadrement, le reste dépasse au-dessus des murs |
| Trappe ouverte | Disque noir | Disque noir |
| Trappe fermée | Couvercle brun bordé de pointillés | Disque couleur couvercle |
| Trappe invisible | Son rendu ouvert ou fermé à 40 %, plus une **pastille dorée** dans le coin | Disque à 40 % |
| Faux mur fermé | Bloc violet hachuré | Bloc violet plein |
| Faux mur imaginaire | Bloc à 40 % sur le sol, plus une pastille dorée | Bloc translucide à 40 % sur une dalle |
| Faux mur ouvert | Sol, avec le contour du mur en pointillés | Dalle, avec les arêtes du bloc en fil de fer |

- **Touche S** : affiche ou masque les états. Sans les états, on retrouve exactement le rendu de 005 (types seuls).
  Le choix est mémorisé dans les préférences (`showStates`, activé par défaut). En ASCII, la touche ne fait rien.
- **Légende** : 5 entrées s'ajoutent quand les états sont affichés (door open, pit closed, pit invisible,
  fake wall imaginary, fake wall open).
- **Survol** : la barre d'état indique l'état, par exemple « pit · fermée, invisible » ou
  « fakewall · imaginaire (franchissable) ».

Cas d'une porte ouverte vue en 3D **strictement de dessus** : son empreinte reste identique à celle d'une porte fermée,
puisque le vantail est vertical. On ne la distingue que de biais : elle dépasse des murs.

## 3. Architecture

- **`src/core/tile-states.js`** (nouveau) : source unique de la sémantique.
  - `tileState(type, detail)` renvoie les drapeaux de la tuile ;
  - `stateModifiers()` renvoie les classes `is-open`, `is-closed`, `is-invisible`, `is-imaginary` ;
  - `describeState()` renvoie le texte pour la barre d'état.
- **2D** : `tileClasses()` ajoute toujours les classes d'état. Elles n'ont d'effet que sous la classe `.show-states`
  de la grille, donc `setShowStates()` bascule une seule classe, sans recalculer les 2 652 cases.
  Dans `tiles-2d.css`, la trappe et le bloc du faux mur passent en `::after`, pour que l'opacité et les pointillés
  ne touchent pas le sol. La pastille est un `::before`.
- **3D** : chaque maillage porte une **variante**. Changer d'affichage revient à changer la visibilité des maillages,
  sans rien reconstruire.

  | Variante | Visible |
  |---|---|
  | `all` | Toujours |
  | `types` | États masqués (rendu de 005) |
  | `states` | États affichés |

  Une tuile sans changement d'aspect n'a qu'une instance `all`. Les autres ont une instance `types` et une instance `states`.
  Les nouvelles parties sont `pitLid`, `pitHidden`, `pitLidHidden`, `fakewallImaginary`, et un `LineSegments` d'arêtes
  par niveau pour les murs disparus.
  Le survol ne vise que les maillages instanciés **visibles** : le raycasting de Three.js ignore `visible`,
  donc le filtrage est explicite.
- **Thème** : nouvelle variable CSS `--tile-pit-lid`, lue aussi par le 3D. `--hidden-opacity` et `--hidden-mark`
  règlent l'atténuation et la pastille en 2D.

## 4. Vérifications (Chrome)

- **2D**, niveau 11 en repère local :
  - porte ouverte (16,9) en rectangle vide, faux mur ouvert (24,9) en pointillés, 4 trappes invisibles atténuées avec pastille ;
  - le survol de (10,27) affiche « pit · fermée, invisible » ;
  - la touche S donne le rendu types seuls (légende à 8 entrées), et un second appui rétablit les états (13 entrées).
- **3D**, niveau 11 en mode solo :
  - le faux mur ouvert bascule entre bloc plein et fil de fer avec S ;
  - les trappes invisibles sont translucides.
- **Contrôle de géométrie dans la page** (`import()` de `level-meshes.js`) pour le niveau 11 :
  - variantes générées : `door:types=1`, `door:states=1`, `pitLidHidden:states=4`, `fakewall:types=1`, `fakewallOpen:states` ;
  - la porte (16,9) est pleine en variante `types` et relevée en variante `states`.
- Aucune erreur dans la console.

## 5. Suite (CLAUDE.md)

- **007** : réglages 3D (espacement des niveaux, hauteur des murs, étiquettes de niveau).
- **008** : inventaire des objets et des monstres.
- **009** : logique des actuators et des téléporteurs.
- **010** : textes.
