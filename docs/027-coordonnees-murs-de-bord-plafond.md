# 027 — Coordonnées sur la carte, murs de bord, inversion une case sur deux, plafond

> Demandes de l'utilisateur après la doc 026. Règles de rendu confrontées à ReDMCSB (`DUNVIEW.C`), voir [000-sources.md](000-sources.md).

## 1. Carte 2D : coordonnées sur les bords

- Une **règle** en haut et une à gauche de la grille donnent les coordonnées de chaque colonne et de chaque ligne.
- **Repère local** : une seule rangée, les coordonnées locales du niveau.
- **Repère global** : deux rangées, comme sur les cartes de greatstone.free.fr :
  - **G**, les coordonnées globales (couleur d'accent), sur toute la largeur du cadre ;
  - **L**, les coordonnées locales, seulement là où le niveau a des cases.
- Les multiples de 5 sont en clair. Quand les cases font moins de 12 px, seuls les multiples de 5 restent affichés.
- Les règles restent visibles quand on fait défiler la carte (`position: sticky`). L'ajustement automatique du zoom leur réserve leur place.
- Code : `drawRulers()` dans `src/render/dom/dom-renderer.js` ; styles `.dom-frame`, `.ruler…` dans `styles/tiles-2d.css`.

## 2. Vue 1re personne : murs de bord

Hors de la carte, DM considère que tout est mur. On voyait jusqu'ici le vide (noir) quand une case de sol touchait le bord, par exemple au niveau 0 en (0, 5).

`buildLevelMeshes()` en mode `game` entoure maintenant le niveau d'un **anneau de murs**. Leurs instances portent `outside: true` : la souris ne les désigne pas (un clic dessus n'actionne rien).

## 3. Inversion une case sur deux

**Dans DM** (`DUNVIEW.C`) : quand `(x + y + direction)` est impair, le moteur **inverse horizontalement** le sol et les murs, et sinon le plafond. Dans un couloir droit, l'image change donc à chaque pas, et on voit qu'on avance.

**Ici** : la vue est en 3D, donc on rattache l'inversion aux **cases** plutôt qu'à la vue entière. La texture d'un mur, d'un sol ou d'un plafond est inversée (u → 1 − u) sur les cases où `x + y` est impair.
- En avançant d'une case, chaque case visible prend la place d'une case de parité opposée : on obtient le même effet que dans DM.
- En tournant, rien ne saute d'un coup.
- Technique : un attribut d'instance `mirror` lu par le vertex shader (`mirrorOddTiles()` dans `fp-renderer.js`).

Les textures procédurales étaient presque **symétriques** (briques décalées d'une demi-largeur, quatre dalles égales) : inversées, elles ne changeaient pas. Elles sont maintenant **asymétriques** :
- murs : rangées de briques décalées de façon irrégulière ;
- sol : dalles de tailles inégales.

Test : le couloir du niveau 2 en (15, 30), face à l'est.

## 4. Plafond

Le plafond n'est plus un plan uni. Il y a maintenant un **panneau texturé par case** (dalles irrégulières), inversé une case sur deux lui aussi.

**Trappes au plafond.** Dans DM, sous une trappe **ouverte** du niveau du dessus, aux mêmes coordonnées globales, le plafond montre un trou. Le moteur dessine ce trou que la trappe soit invisible ou non (`F112_DUNGEONVIEW_DrawCeilingPit`).
- Ici, ces cases reçoivent une texture de plafond percée d'un trou sombre, de la taille d'une trappe au sol (0,76 case).
- La vue se reconstruit aussi quand une tuile du **niveau du dessus** change, car une trappe peut s'ouvrir ou se fermer.
- Test : niveau 3, case (21, 15), vue depuis (21, 13) face au sud (trappe du niveau 2 au-dessus).

## 5. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/render/dom/dom-renderer.js` | Cadre `.dom-frame` (règles et grille), `drawRulers()` |
| `styles/tiles-2d.css` | Règles collantes, marge de défilement des cases |
| `src/main.js` | `fitCell()` réserve la place des règles |
| `src/render/three/level-meshes.js` | Anneau de murs autour du niveau en mode `game` |
| `src/render/first-person/fp-renderer.js` | Inversion par case, plafond par case avec trappes du dessus, textures asymétriques |
