# 014 — Simulation, phase B

> Suite de [013-simulation-phase-a.md](013-simulation-phase-a.md).
> Phase B : escaliers, trappes, téléporteurs (rotations et chaînes). Les faux murs étaient déjà traités en phase A :
> fermés, ils bloquent et ressemblent à des murs ; ouverts ou imaginaires, on les traverse.

## 1. Règles implémentées (`src/sim/rules.js`)

Après chaque **pas réussi**, `resolveArrival()` applique l'effet de la case d'arrivée, puis celui de la case suivante,
jusqu'à ce que le groupe s'arrête. Les rotations sur place ne déclenchent rien.

| Case | Condition | Effet |
|---|---|---|
| Escalier | toujours | Niveau ±1, mêmes coordonnées globales (l'escalier opposé). Le groupe est posé **à côté**, sur le côté d'accès de l'escalier d'arrivée, **dos à l'escalier** |
| Trappe | ouverte (même invisible), non imaginaire | Chute au niveau inférieur, mêmes coordonnées globales, orientation conservée |
| Téléporteur | ouvert, portée `all` ou `items_party` | Vers `dest`. Rotation **relative** (quarts de tour horaires, `rotation / 90`) ou **absolue** (orientation finale N, E, S, O) |

- **Côté d'accès à l'arrivée :** voisin franchissable sur l'axe de l'escalier, **dans l'état courant**.
  - `Dungeon.accessSide()` se fonde sur le type de tuile. Les 2 escaliers du niveau 12 sans côté d'accès, (3, 8) et (3, 10), s'ouvrent sur le faux mur ouvert (3, 9) : l'état courant les rend accessibles.
  - Sans côté franchissable, le groupe reste sur l'escalier d'arrivée.
- **Chaînes :** une case déjà traversée dans la chaîne n'est pas retraitée.
  - DM compte **21 « spinners »**, des téléporteurs dont la destination est leur propre case (niveaux 2, 4, 7, 8). Ils font seulement tourner le groupe, une fois.
  - Un retour sur une case **différente** déjà traversée est signalé comme boucle (`loop`), et la chaîne s'arrête. Au-delà de 32 effets, elle s'arrête aussi.
- **`F` (aller à la case sélectionnée)** ne déclenche pas l'effet de la case : on peut se poser sur une trappe ou un téléporteur pour l'examiner.
  L'effet se produit quand on y entre par un pas.
- La règle « posé à côté de l'escalier, dos à lui » reste **à vérifier** dans le jeu original (doc 012 § 3, point 3).

## 2. Interface

- La vue à la première personne reconstruit le niveau d'arrivée. La 2D et la 3D affichent le nouveau niveau, avec le marqueur.
- La barre d'état décrit les effets, enchaînés :
  - « Escalier ↓ → niveau 1 (3, 0) » ;
  - « Chute → niveau 2 (19, 9) » ;
  - « Téléporteur → niveau 5 (x, y), face est » ;
  - « Téléporteur : rotation, face ouest » pour un spinner ;
  - « · boucle interrompue » en cas de boucle.
- L'événement `partyMoved` porte désormais `effects` (liste ordonnée) et `loop`.
- `FACINGS` passe dans `src/core/dungeon.js`, à côté de `SIDE_DELTAS`, pour éviter un import circulaire entre `party.js` et `rules.js`.

## 3. Vérifications (Node, état initial)

| Test | Résultat |
|---|---|
| Chaque escalier pris depuis chaque voisin franchissable | 57 passages, tous arrivent à côté de l'escalier opposé, dos à lui |
| Toutes les trappes | 31 trappes ouvertes font chuter, aucune chaîne |
| Tous les téléporteurs (179) | 64 fermés au départ, 34 hors portée du groupe (créatures ou objets seuls), 81 transportent le groupe, aucune boucle |
| Chaîne d'escaliers, à pied, portes et faux murs ouverts | Depuis chaque arrivée d'un escalier descendant, on atteint l'escalier descendant suivant, **du niveau 2 au niveau 13** |

**Niveau 1 :** l'arrivée depuis le niveau 0 (3, 0) ne mène à pied à aucun escalier descendant, même avec toutes les portes
et tous les faux murs ouverts. La moitié nord du niveau ne communique avec la moitié sud, où se trouve l'escalier (6, 26)
vers le niveau 2, que par des mécanismes : téléporteurs fermés au départ, trappes. Le critère « descente de 0 à 13 »
de la phase B demande donc la **phase C**. En attendant, `F` permet de sauter d'une moitié à l'autre.

**Chrome :**
- l'escalier (3, 15) du niveau 0, pris depuis (4, 15) face à l'ouest, mène au niveau 1 en (3, 0), face au nord ;
- la trappe (24, 5) du niveau 1 fait chuter en (19, 9) du niveau 2 ;
- le spinner (3, 8) du niveau 2, rotation relative de 90°, fait passer de « face sud » à « face ouest ».

## Sources

Aucune nouvelle source : règles du brouillon 012, données de `dungeon.json` (docs 002, 003, 005, 009).
