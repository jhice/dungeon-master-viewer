# 005 — Renderer 3D (Three.js)

> Suite de [004-renderer-2d.md](004-renderer-2d.md).
> Les 14 niveaux sont empilés selon leurs offsets, avec une caméra orbitale et un zoom. Seuls les types de tuiles sont rendus.

## 1. Utilisation

On ouvre la même page (`python3 -m http.server`, puis `http://localhost:8000`) et on appuie sur **R** pour passer au
renderer **3D**. L'ordre de rotation est 2D → 3D → ASCII.

| Entrée | Action |
|---|---|
| Glisser avec le bouton gauche | Orbite autour du niveau courant |
| Molette, ou + / − | Zoom |
| Glisser avec le bouton droit | Déplacement latéral (pan) |
| ↑ / ↓, Début / Fin | Changer de niveau courant : la caméra glisse vers lui |
| 0 | Recadrer la caméra sur le niveau courant |
| F | Mode d'affichage : niveau courant mis en avant → tous les niveaux → niveau courant seul |
| L | Afficher ou masquer les liens entre niveaux |
| Survol | Barre d'état : niveau, coordonnées locales et globales, type, cible des escaliers |

- **Chargement de Three.js :** la bibliothèque (version figée **0.170.0**) est chargée depuis jsDelivr par une
  *import map* déclarée dans `index.html`, sans bundler ni `npm install`. Le module 3D est importé **à la demande**
  (`import()` dynamique), donc le 2D et l'ASCII marchent hors ligne. Si le CDN est inaccessible, la page affiche
  l'erreur dans la barre d'état et repasse en 2D.

## 2. Scène

- **Repère :** 1 case = 1 unité, x vers l'est, z vers le sud (le nord est en −z), y vers le haut.
  Le cadre global de 52 × 51 cases est centré sur l'origine.
- **Empilement :** le niveau *n* est placé à `y = −3n`. Le niveau 0 est en haut et le 13 tout en bas.
  Comme chaque niveau est positionné par son offset global, **les escaliers et les trappes s'alignent verticalement**,
  ce qui confirme visuellement la doc 003.
- **Liens** (touche L) : un segment vertical par connexion, doré pour les 29 paires d'escaliers et rouge pour les 67 trappes.
- **Éclairage :** une lumière hémisphérique et une lumière directionnelle. Les matériaux sont de type Lambert (peu coûteux).
- **Couleurs :** elles sont lues dans les variables CSS de `styles/tiles-2d.css` (`--tile-wall`, etc.).
  Le 2D et le 3D partagent donc **un seul thème**.

| Type | Modèle 3D |
|---|---|
| wall | Bloc 1 × 0,8 × 1 |
| fake wall | Même bloc, couleur du faux mur |
| floor | Dalle de 0,05 d'épaisseur |
| pit | Dalle, plus un disque noir |
| stairs | 3 marches qui montent au-dessus du sol (claires) ou descendent sous le sol (sombres), en partant du **côté d'accès** |
| door | Dalle, plus un vantail en travers de l'axe de passage |
| teleporter | Dalle, plus une colonne cyan translucide et émissive |

**Côté d'accès des escaliers :** c'est le voisin praticable sur l'axe `orientation` (nouvelle méthode
`Dungeon.accessSide`). On le trouve pour 56 escaliers sur 58 (15 E, 13 N, 16 S, 12 W) ; les 2 restants prennent l'orientation par défaut.

### Modes d'affichage (F)

| Mode | Effet |
|---|---|
| `focus` (par défaut) | Niveau courant opaque, les autres à 12 % d'opacité sans écriture de profondeur, pour voir à travers |
| `all` | Tous les niveaux opaques : vue d'ensemble de la « tour » de face ou de biais |
| `solo` | Niveau courant seul, avec ses liens descendants et les liens qui y arrivent |

Le survol ne peut sélectionner que le niveau courant, sauf en mode `all`.

## 3. Architecture

```
src/render/three/
├── three-renderer.js   scène, caméra, OrbitControls, boucle de rendu, modes, liens, survol (raycasting)
├── level-meshes.js     maillages d'un niveau : un InstancedMesh par partie (wall, floor, stepUp, door…)
└── theme.js            couleurs lues dans les variables CSS
```

- **Même contrat** que les autres renderers : `showLevel(i)`, `currentLevel`, `dispose()`. Quelques extensions optionnelles :
  - `zoom(step)` et `resetView()` : `main.js` les utilise s'ils existent, sinon il agit sur la variable CSS `--cell` ;
  - `keys` et `keyHint` : touches propres au renderer (F et L). `bindKeys` accepte maintenant une fonction de
    résolution, ce qui permet de consulter `renderer.keys` avant les touches globales.
- **`main.js`** : la création d'un renderer peut être asynchrone. Les touches sont ignorées pendant le chargement,
  et un renderer 3D qui échoue bascule vers le 2D.
- **Performance :** environ 12 000 cases, soit environ 8 parties par niveau × 14 niveaux, donc ~100 *draw calls*
  grâce à l'instanciation. Le survol fait un raycast au plus une fois par image.
  `dispose()` libère géométries, matériaux, contrôles, observateur de redimensionnement et contexte WebGL.
- **Mise en page :** le `body` est désormais une colonne flex sur toute la hauteur et `#view` prend l'espace restant.
  C'est indispensable pour que le canvas ait une taille, et l'ajustement du zoom 2D s'en sert aussi.

## 4. Vérifications (Chrome)

- Bascule 2D → 3D : chargement de Three.js depuis le CDN, aucune erreur dans la console.
- Mode `focus` au niveau 7 : niveau opaque, les autres en transparence, liens dorés et rouges entre les étages.
- Mode `all` après une orbite vers le bas : les niveaux opaques se superposent correctement.
- Mode `solo` au niveau 0, puis `0` : le Hall of Champions est centré à l'écran.
- ↓ vers le niveau 1 : la caméra glisse et les trappes du niveau 1 montrent leurs liens rouges vers le niveau 2.
- Survol : « niveau 7 · (6, 29) local · [26, 40] global · wall ».

Correctif après retour utilisateur : **le panoramique (clic droit) partait d'un côté puis revenait.**

- **Cause :** la boucle de rendu ramenait en permanence `controls.target` vers le centre du niveau courant
  (l'effet de glissement entre niveaux). Or le panoramique d'OrbitControls déplace justement `controls.target`,
  et chaque image le tirait en arrière.
- **Correction :** le glissement n'est actif que pendant une transition de niveau. `targetGoal` vaut `null` le reste du temps ;
  il s'arrête à l'arrivée, sur `resetView()`, et dès que l'utilisateur agit sur la caméra (événement `start` d'OrbitControls).
- **Vérification :** le panoramique n'a pas pu être simulé dans le navigateur de test (ni clic droit ni Maj + glisser),
  il reste à confirmer à la main.

Limites constatées :

- **Escaliers descendants :** ils sont creusés sous le sol, donc peu lisibles en vue plongeante (on voit surtout une case claire
  traversée par le lien doré). Piste d'amélioration : les dessiner en relief avec une flèche, ou ouvrir le sol autour.
- **Mode `all` :** les niveaux opaques se masquent mutuellement vus de dessus. C'est voulu, ce mode est fait pour les vues de biais ou de profil.

## 5. Suite possible

- **Contenu**, étape « Plus tard » de CLAUDE.md : objets, monstres, actuators, téléporteurs (y compris leurs destinations
  en lignes 3D), et textes muraux.
- **États des tuiles :** portes ouvertes ou fermées, trappes ouvertes ou invisibles, faux murs franchissables.
- **3D :** réglage de l'espacement des niveaux et de la hauteur des murs, étiquettes de niveau,
  et vue « à la première personne » vers un mode jouable.
