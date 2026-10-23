# 003 — Les 14 niveaux et le rendu ASCII

> Suite de [002-conversion-json.md](002-conversion-json.md).
> Rendu complet des 14 niveaux : [003-niveaux-ascii.txt](003-niveaux-ascii.txt), généré par le script.
> Conformément à CLAUDE.md, **seuls les types de tuiles sont rendus**, pas leur contenu
> (ni objets, ni monstres, ni actuators, ni décorations).

## 1. Les 14 niveaux

| Niv. | Taille | Offset | Diff. | Wall | Floor | Pit | Stairs ↑/↓ | Door | Teleporter | Fake wall |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 19×19 | 0,0 | 0 | 218 | 137 | 0 | 0/1 | 3 | 2 | 0 |
| 1 | 32×32 | 0,14 | 1 | 503 | 483 | 3 | 1/1 | 25 | 7 | 1 |
| 2 | 32×32 | 5,10 | 1 | 539 | 425 | 4 | 1/1 | 25 | 20 | 9 |
| 3 | 32×32 | 0,0 | 2 | 488 | 498 | 2 | 1/2 | 16 | 12 | 5 |
| 4 | 30×31 | 5,0 | 2 | 478 | 368 | 26 | 2/2 | 10 | 35 | 9 |
| 5 | 32×32 | 5,5 | 2 | 513 | 453 | 2 | 2/1 | 20 | 20 | 13 |
| 6 | 30×31 | 5,5 | 3 | 511 | 393 | 0 | 1/2 | 16 | 3 | 4 |
| 7 | 32×32 | 20,11 | 3 | 387 | 588 | 14 | 2/4 | 3 | 14 | 12 |
| 8 | 31×32 | 12,5 | 3 | 502 | 460 | 3 | 4/4 | 8 | 6 | 5 |
| 9 | 31×32 | 10,10 | 4 | 468 | 465 | 0 | 4/3 | 11 | 33 | 8 |
| 10 | 31×32 | 10,10 | 5 | 527 | 419 | 0 | 3/3 | 14 | 17 | 9 |
| 11 | 32×31 | 20,20 | 5 | 476 | 478 | 8 | 3/3 | 15 | 3 | 6 |
| 12 | 22×20 | 25,30 | 6 | 178 | 240 | 5 | 3/2 | 2 | 6 | 4 |
| 13 | 26×13 | 25,32 | 6 | 191 | 140 | 0 | 2/0 | 2 | 1 | 2 |

Observations :

- **Niveau 0** : le Hall of Champions, petit (19×19), avec la lumière permanente (difficulté 0).
  Le groupe démarre en (1,3) sur un téléporteur fermé (l'entrée du donjon).
- **Niveau 13** : le plus profond (repaire de Chaos). Il n'a que des escaliers montants.
- **Niveau 4** concentre les trappes (26) et les téléporteurs (35), ce qui correspond à une zone de pièges.
- La difficulté croît de 0 à 6 avec la profondeur.
- **Repère global** : 52 × 51 cases (x de 0 à 51, y de 0 à 50), les offsets allant de (0,0) à (25,32).
- Une carte n'est pas toujours bordée de murs : la carte 1 a des sols sur son bord x = 0.
  Le rendu doit donc traiter « hors carte » comme du vide, et non comme un mur.
- Sur 179 téléporteurs, 163 restent sur le même niveau et 16 changent de niveau.
  Leurs destinations seront exploitées à l'étape « logique des téléporteurs ».

## 2. Superposition : escaliers et trappes

Le principe se vérifie sur les données : **un escalier ou une trappe mène aux mêmes coordonnées globales
`(x + offset.x, y + offset.y)` sur le niveau adjacent.**

| Lien | Nb | Résultat |
|---|---|---|
| Escalier descendant (niveau L) → escalier montant (niveau L+1) | 29 | ✅ 29/29 |
| Escalier montant (niveau L) → escalier descendant (niveau L−1) | 29 | ✅ 29/29 |
| Trappe (niveau L) → case praticable du niveau L+1 | 67 | ✅ 67/67 : 64 sols, 2 téléporteurs, 1 trappe |

Les 58 escaliers forment donc **29 paires exactes**, et aucune trappe ne débouche dans un mur ou hors carte.
Cas particuliers :

- **2 trappes tombent sur un téléporteur.** Niveau 1 (13,15) → niveau 2 [13,29] et niveau 2 (6,16) → niveau 3 [11,26].
  Ce sont des chutes suivies d'une téléportation.
- **1 trappe tombe sur une autre trappe.** Niveau 7 (1,1) → niveau 8 [21,12] : chute sur deux niveaux.
- **4 trappes invisibles**, toutes fermées. Aucune trappe « imaginaire » n'est présente.
  Au total : 31 trappes ouvertes et 36 fermées (elles s'ouvrent par des actuators).

Exemple de l'escalier du Hall (niveau 0) vers le niveau 1, en coordonnées globales (3,15) :

```
niveau 0 (lignes y = 14..16)     niveau 1 (lignes y = 14..16)
#+##.#.##.#...#...#              .+......#..+..#...####.#
#.#>.#.......##.#.#              .##<##+##.###.....++.#..
..##.#....#####.#.#              ..####.#....###...##.#..
```

Le contrôle est rejouable à tout moment avec `node tools/render-ascii.mjs links`.
La commande se termine en erreur si un lien est cassé.

## 3. Symboles ASCII

| Symbole | Type | Symbole | Type |
|---|---|---|---|
| `#` | wall | `>` | stairs down |
| `.` | floor | `+` | door |
| `O` | pit | `*` | teleporter |
| `<` | stairs up | `%` | fake wall |
| (espace) | hors carte | | |

`<` et `>` reprennent la convention des roguelikes. Le sens de l'escalier est une propriété du type de tuile,
pas un contenu, ce qui respecte la consigne « types uniquement ».
Le mode `--wide` dessine 2 caractères par case (`##` ou `. `) pour obtenir des cases à peu près carrées.

## 4. Architecture : renderers interchangeables

```
src/
├── core/
│   ├── tile-types.js       types de tuiles (code, caractère de grille, solide ou non)
│   ├── dungeon.js          classe Dungeon : niveaux, tileAt (local), globalTileAt, bounds, loadDungeon()
│   └── connections.js      liens escaliers / trappes et leur validation
├── render/
│   ├── renderer.js         contrat commun : showLevel(i), currentLevel, dispose()
│   └── ascii/
│       └── ascii-renderer.js   renderLevelAscii() (fonction pure) + createAsciiRenderer() (DOM)
├── ui/
│   └── level-keys.js       navigation au clavier, indépendante du renderer
└── main.js                 point d'entrée du navigateur
index.html, styles/main.css
tools/render-ascii.mjs      rendu ASCII en ligne de commande (réutilise src/)
```

- **`src/core` et `renderLevelAscii` n'utilisent aucune API propre au navigateur ou à Node.** Le même code
  sert la ligne de commande et la page web.
- **Un renderer ne fait que lire le modèle `Dungeon`.** Pour ajouter le 2D (DOM et CSS) ou le 3D (Three.js),
  il suffira d'écrire `createDomRenderer` / `createThreeRenderer` avec le même contrat et de les brancher
  dans `main.js`. La bascule entre global et local montre déjà ce démontage et remontage (`dispose()`, puis nouveau renderer).
- **Repère global par défaut.** Tous les niveaux sont dessinés dans le même cadre 52 × 51 : en passant d'un
  niveau à l'autre, un escalier reste visuellement à la même place. C'est la base du futur empilement 3D.

## 5. Utilisation

```sh
node tools/render-ascii.mjs                 # les 14 niveaux, repère global
node tools/render-ascii.mjs 4 --rulers      # niveau 4 avec la numérotation des colonnes et des lignes
node tools/render-ascii.mjs 4 --local       # niveau 4 seul, sans offset
node tools/render-ascii.mjs 4 --wide        # cases à 2 caractères
node tools/render-ascii.mjs links           # rapport des escaliers et trappes
node tools/render-ascii.mjs all --rulers --out docs/003-niveaux-ascii.txt
```

**Page web** : il faut la servir en HTTP, par exemple `python3 -m http.server`, puis ouvrir `http://localhost:8000`.

| Touche | Action |
|---|---|
| ↑ / ↓ (ou PgUp / PgDn) | Niveau précédent / suivant |
| G | Bascule entre repère global et local |

> Vérification : les fichiers sont servis avec les bons types MIME, et `main.js` a été exécuté dans Node
> avec un faux DOM (chargement, navigation, butées, bascule G).
> La page n'a pas encore été vue dans un vrai navigateur (extension Chrome non connectée).

## 6. Suite possible

- **004** : renderer 2D (DOM et CSS, vue de dessus, une case = un élément ou une grille CSS),
  avec la même navigation au clavier.
- **005** : renderer 3D (Three.js) : les 14 niveaux empilés selon leurs offsets, avec caméra orbitale et zoom.
