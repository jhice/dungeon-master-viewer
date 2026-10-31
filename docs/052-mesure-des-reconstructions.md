# 052 — Mesure des reconstructions de niveau

> Demande de l'utilisateur :
> - à quels moments le niveau est-il reconstruit en entier (2D, 3D, simulation) ?
> - mesurer ce que ça coûte, avant d'envisager des mises à jour ciblées.
>
> Sources : Three.js 0.170 (connaissance de l'API), protocole DevTools de Chrome. Voir [000-sources.md](000-sources.md).

## 1. Qui reconstruit quoi

| Vue | Reconstruction complète | Mise à jour ciblée |
|---|---|---|
| Simulation | `sim.reset()` seulement (copie des états, `state.js`) | — |
| 2D (DOM) | `showLevel()` : chaque changement de niveau ; remontage du renderer | `updateTile(level, x, y)` : une cellule |
| 3D | les 14 niveaux au montage et quand la hauteur des murs change ; **un niveau entier** à chaque `tileChanged` et `itemsChanged` | créatures seules (`rebuildCreatures`) |
| 1re personne | `build(level)` : changement de niveau du groupe ; chaque `updateTile` du niveau affiché ou de celui du dessus (`tileChanged`, `itemsChanged`, `ornamentChanged`, `textChanged` mural) | créatures seules |

- Une porte animée émet un `tileChanged` **par cran** (doc 028), soit jusqu'à 4 reconstructions par mouvement, dans la vue à la 1re personne et dans la 3D.
- `reset` remonte tout le renderer (`mountRenderer()`) et appelle `updateTile` pour chaque niveau dans la vue à la 1re personne.

## 2. Méthode

- Une **copie** du projet, servie à part, avec des sondes `performance.now()` :
  - autour de `build()` et de `render()` dans `fp-renderer.js` ;
  - `gl.finish()` après le rendu, pour compter le travail du GPU dans la mesure.
- Chrome sans interface, piloté par le protocole DevTools depuis Node, avec le vrai GPU (ANGLE sur OpenGL, RTX 5070). SwiftShader (rendu logiciel) donne les mêmes ordres de grandeur.
- Pour chaque niveau : un tour de chauffe, puis la médiane de 7 mesures.
- Le code du projet n'est pas modifié par la mesure.

## 3. Résultats (médianes, en ms, GPU)

| Niveau | Taille | 1re pers. `updateTile` | dont `build` | dont 1er rendu | 3D `rebuildLevel` | Rendu sans rebuild |
|---|---|---|---|---|---|---|
| 0 | 19×19 | 103 | 2,3 | 98 | 2,1 | 1,8 |
| 1 | 32×32 | 115 | 4,1 | 109 | 4,2 | 3,3 |
| 2 | 32×32 | 136 | 3,2 | 132 | 1,8 | 1,0 |
| 6 | 30×31 | 138 | 3,2 | 134 | 1,7 | 0,4 |
| 9 | 31×32 | 95 | 3,4 | 91 | 3,4 | 1,2 |
| 13 | 26×13 | 71 | 1,8 | 69 | 1,9 | 0,3 |

Autres mesures :
- remontage du renderer 3D (14 niveaux) : 80 ms ;
- `sim.reset()` complet : 238 ms ;
- 2D : `showLevel` au plus 1,5 ms, `updateTile` moins de 0,1 ms, remontage 4 ms ;
- le calcul des masques d'occultation (doc 038) : 0 à 2 ms.

## 4. La cause : la recompilation des shaders

- Le build lui-même est rapide (2 à 5 ms). **Le premier rendu qui suit coûte 70 à 140 ms.**
- `clear()` libère les matériaux de l'ancien niveau (`material.dispose()`). Three.js compte les matériaux qui utilisent chaque programme de shaders. Quand ce compte tombe à zéro, il **détruit le programme**. Le nouveau niveau, aux matériaux identiques, doit donc tout recompiler (5 à 9 programmes, patchés par l'occultation).
- **Vérification :** dans la copie, la libération de l'ancien niveau est différée après le premier rendu du nouveau. Les programmes restent alors en cache :

  | | `updateTile` (1re pers.) | Changement de niveau | `reset` |
  |---|---|---|---|
  | Actuel | 70 à 140 ms | 67 à 135 ms | 238 ms |
  | Libération différée | **1,3 à 6,7 ms** | 4 à 37 ms | 36 ms |

- La 3D n'est pas touchée : ses 13 autres niveaux gardent les mêmes programmes en vie.

## 5. Conséquences

- Aujourd'hui, chaque cran de porte, chaque objet ramassé ou posé, chaque levier bloque la page environ 100 ms. Une porte qui s'ouvre ou se ferme le fait 4 fois de suite, alors qu'un tick dure 220 ms (doc 047).
- **Correctif simple, à faire d'abord :** garder les programmes de shaders en vie entre deux builds.
  - Soit libérer l'ancien niveau après le premier rendu du nouveau (mesuré ci-dessus). **C'est la solution retenue (§ 7).**
  - Soit réutiliser les matériaux d'un build à l'autre, ce qui est plus propre mais touche `level-meshes.js`, `fp-decor.js` et le plafond.
- **Ensuite**, une reconstruction coûte quelques ms. Les mises à jour ciblées (portes, objets, instances dormantes) ne gagneraient plus que 2 à 6 ms par changement : elles ne sont pas nécessaires pour l'instant. Regrouper les `updateTile` par frame reste utile quand plusieurs portes bougent dans le même tick.

## 6. Observation annexe

- Au démarrage avec un profil vide et la 3D sélectionnée, `openGame()` peut finir avant `mountRenderer()`, qui n'est pas attendu (`main.js`, dernières lignes). `updateHint()` lit alors `renderer.keyHint` alors que `renderer` vaut `null` : exception, et `showParty()` n'est pas appelé. C'est une course rare.
- **Corrigé :** `renderer` vaut `null` pendant chaque remontage (démarrage, `R`, repère, reset, valeurs par défaut), pas seulement au démarrage. `updateHint()` ne fait donc rien tant qu'il n'y a pas de renderer : `mountRenderer()` l'appelle une fois le renderer prêt, puis place le groupe. `showParty()` était déjà protégée.
- **Vérification :** quatre démarrages à profil vide, avec la 3D et le jeu ouvert, s'ouvrent sans erreur. La course ne s'est pas reproduite pendant ces essais, ni avec ni sans le correctif, car elle dépend de l'ordre de chargement des modules. Elle avait été observée une fois, lors de la première mesure.

## 7. Correctif : libération différée

- Dans `fp-renderer.js`, `clear()` retire l'ancien niveau de la scène et le met dans `retired`. `render()` le libère juste après avoir dessiné le nouveau, qui tient alors les programmes de shaders. `dispose()` libère aussi ce qui reste.
- Toute reconstruction est suivie d'un rendu (`setParty`, `updateTile`), donc un niveau retiré ne reste en mémoire que le temps d'un build.
- **Mesuré sur le code corrigé** (GPU, mêmes conditions qu'au § 3) :
  - reconstruction d'un niveau : 1,4 à 6,5 ms (médianes), au plus 8,8 ms ;
  - changement de niveau : 4 à 37 ms ;
  - `sim.reset()` : 38 ms.
- **Pas de fuite :** après 100 reconstructions de suite, `renderer.info` compte toujours 7 programmes, 64 géométries et 19 textures.
