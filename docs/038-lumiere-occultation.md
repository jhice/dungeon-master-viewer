# 038 — Lumière : arrêtée par les murs

> Suite de la [037](037-lumiere-refonte.md).
> Sources : Three.js 0.170, code source de `build/three.module.js` (morceau de shader `lights_fragment_begin`, ordre des lumières dans `WebGLLights.setup`, `unrollLoops`), consulté sur le CDN jsDelivr. Voir [000-sources.md](000-sources.md).

## 1. Le problème

Depuis la doc 037, il n'y a plus d'ombres. Or, une `PointLight` sans ombre éclaire toute face tournée vers elle et placée dans sa portée, même s'il y a un mur entre les deux.

Exemple au niveau 1 : la torche du mur (15,8), qui éclaire la case (14,8), éclairait aussi le sol et le plafond de (14,10), derrière le mur (14,9).

## 2. La solution : un masque par case

Elle s'active avec la case **« Lumière arrêtée par les murs »** du panneau (clé `occlusion`, cochée par défaut). Décochée, les matériaux sont recompilés sans le code du masque : on peut comparer les performances.

**1. Sur la grille** (`lightMasks`, `fp-occlusion.js`)
- Chaque lumière reçoit un bit : bit 0 pour celle du groupe, bits 1 à 4 pour les porte-torches.
- Pour chaque lumière, on teste les cases dans sa portée. Une case est **vue** si l'un des 5 rayons tirés vers elle (centre et près des 4 coins) ne traverse aucune case opaque.
- Le rayon avance par pas de 0,05 case.
- La case visée peut être opaque elle-même : on éclaire ainsi ses faces et les niches.
- Cases opaques (`opaqueTile`) :
  - les murs ;
  - les faux murs non ouverts (y compris les imaginaires, qui sont dessinés) ;
  - les portes fermées à fond (cran 4), sauf si elles sont cassées.
- Une porte en partie levée laisse passer la lumière.

**2. Dans le shader** (`patchMaterial`)
- Les bits sont rangés dans une texture d'un octet par case (`DataTexture` R8, lue avec `texelFetch`).
- Chaque `MeshLambertMaterial` de la vue cherche la case de son fragment, puis multiplie la contribution de la lumière ponctuelle `i` par son bit.
- La case du fragment vient de sa position dans le monde, décalée de 0,05 le long de sa normale. Un fragment posé sur une face de mur tombe ainsi dans la case que regarde cette face.
- Hors de la carte, le bit vaut 0.
- Le patch s'ajoute au `onBeforeCompile` existant, celui du miroir une case sur deux, et la clé de cache du programme intègre l'état de l'option.
- Les uniformes du masque sont ajoutés **même quand l'option est décochée**. Sinon :
  - un matériau garde ses programmes compilés, un par clé ;
  - quand on recoche l'option, Three.js réutilise le programme déjà compilé sans rappeler `onBeforeCompile`, avec les uniformes de la dernière compilation, faite sans le masque ;
  - le shader lit alors une autre texture comme masque, ce qui donnait des taches noires autour du groupe (retour de l'utilisateur, niveau 0, case (4,11)).

**3. Quand recalculer** : les masques sont recalculés au rendu suivant un changement :
- déplacement du groupe ;
- construction du niveau (porte, faux mur, changement de niveau) ;
- lumière de la simulation ;
- réglages.

Le calcul prend quelques millisecondes (environ 4 ms pour 2 lumières, mesurées dans Node).

**L'ordre des bits suit celui des lumières dans Three.js :**
- Three.js range les lumières dans l'ordre de parcours de la scène, puis les trie par ombre et par texture.
- Ici, aucune lumière n'a d'ombre ni de texture : l'ordre reste celui du parcours.
- La caméra est ajoutée à la scène avant les porte-torches, et elle porte la lumière du groupe. Celle-ci est donc la lumière d'indice 0.
- `fp-lights.js` renvoie ses sources (`sources()`) dans ce même ordre.

## 3. Limites

- **Occultation à la case près :** une case vue est éclairée en entier, sans ombre progressive. Cela reste dans l'esprit de DM, où tout se joue sur la grille.
- **Coins en diagonale :** deux murs qui se touchent par un coin peuvent laisser passer la lumière si un rayon frôle le coin exact.
- Les objets en vol (projectiles) ne sont pas masqués.

## 4. Fichiers

| Fichier | Changement |
|---|---|
| `src/render/first-person/fp-occlusion.js` | **Nouveau.** `opaqueTile`, `lightMasks`, `createOcclusion` (texture et patch des matériaux) |
| `src/render/first-person/fp-lights.js` | `sources()` : position et portée des lumières allumées, dans l'ordre de la scène |
| `src/render/first-person/fp-renderer.js` | Patch des matériaux du niveau et des créatures, masques recalculés si besoin, bascule de l'option |
| `src/render/first-person/lighting-settings.js`, `src/main.js` | Réglage `occlusion` et sa case dans le panneau. Ce commit inclut aussi les défauts choisis par l'utilisateur (intensité 5, portée 3,7, atténuation 0,2) et un pas de 0,1 pour la portée |

## 5. Vérification

- **Dans Node**, masque de la torche (15,8) au niveau 1 : (12..14, 7..9) éclairés ; (14,10) et les cases derrière les murs ne le sont pas.
- **Dans le navigateur**, au niveau 1 :
  - en (14,8), face à l'est : la torche murale éclaire bien sa case ;
  - en (14,11), face au nord, sans torche : vue noire avec l'option ; sans l'option, les murs de (14,10) sont éclairés à travers le mur.
  - Aucune erreur dans la console.
