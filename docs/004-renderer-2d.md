# 004 — Renderer 2D (DOM et CSS)

> Suite de [003-niveaux-rendu-ascii.md](003-niveaux-rendu-ascii.md).
> Vue de dessus, niveau par niveau, navigation au clavier. Seuls les types de tuiles sont rendus.

## 1. Utilisation

```sh
python3 -m http.server      # puis http://localhost:8000
```

| Touche | Action |
|---|---|
| ↑ / ↓, PgUp / PgDn | Niveau précédent / suivant |
| Début / Fin | Niveau 0 / niveau 13 |
| R | Renderer suivant : 2D ↔ ASCII |
| G | Repère global ↔ local |
| + (ou =) / − | Zoom avant / arrière (de 6 à 48 px par case) |
| 0 | Revenir au zoom ajusté à la fenêtre |

- **Survol d'une case** : la barre d'état affiche les coordonnées locales et globales, le type de tuile,
  la cible des escaliers (« ↑ vers niveau 0 ») et l'axe des portes et escaliers.
- **Préférences** : le renderer, le niveau, le repère et le zoom sont mémorisés dans le `localStorage`
  du navigateur. Si le stockage est indisponible, la page fonctionne quand même.

## 2. Rendu des tuiles

Chaque case est une `<div class="tile t-<type>">` dans une grille CSS (`grid-template-columns: repeat(var(--cols), var(--cell))`).
Le dessin est **entièrement en CSS** (couleurs, dégradés, pseudo-éléments), sans aucune image.

| Type | Rendu |
|---|---|
| wall | Bloc de pierre gris avec biseau (arête claire en haut à gauche, sombre en bas à droite) |
| fake wall | Pierre violacée hachurée, pour la distinguer d'un vrai mur sur la carte |
| floor | Dalle sombre avec un joint fin |
| pit | Sol, plus un disque noir |
| stairs | Marches rayées perpendiculaires à l'axe de passage ; claires et marquées ▲ si elles montent, sombres et marquées ▼ si elles descendent |
| door | Sol, plus un vantail orange en travers de l'axe de passage |
| teleporter | Sol, plus un halo bleu |
| hors carte | Transparent, sur le fond du cadre |

**Sens de `orientation`**, vérifié sur les données : c'est l'**axe de passage**.

- Porte `NS` : on la franchit du nord au sud, son vantail est donc horizontal. Cela vaut pour 83 portes sur 84 ;
  la dernière a un seul côté ouvert.
- Porte `WE` : 86 portes sur 86 ont leurs voisins est et ouest praticables.
- Escalier : un seul côté d'accès, situé sur l'axe indiqué (56 cas sur 58 ; 2 escaliers n'ont aucun voisin praticable dans la grille).

Seuls le sens des escaliers et l'axe des portes et escaliers sont exploités, car ils sont nécessaires au dessin.
**Les états ne sont pas rendus** : porte ouverte ou fermée, trappe ouverte, invisible, etc.
Comme les objets, ils relèvent du « contenu », laissé pour plus tard.

**Repère global** : le cadre de 52 × 51 cases est toujours dessiné avec un fond discret, le niveau y occupe
sa place réelle. En changeant de niveau, un escalier reste exactement au même endroit de l'écran.

## 3. Architecture

```
src/
├── core/                         (inchangé depuis 003)
├── render/
│   ├── renderer.js               contrat : showLevel(i), currentLevel, dispose()
│   ├── ascii/ascii-renderer.js
│   └── dom/dom-renderer.js       ← nouveau : createDomRenderer(container, dungeon, { frame, onHover }), tileClasses(tile)
├── ui/
│   ├── keyboard.js               ← bindKeys({ key: action }) générique (remplace level-keys.js)
│   ├── legend.js                 ← légende dessinée avec les visuels du renderer actif
│   └── preferences.js            ← localStorage protégé par try/catch
└── main.js                       table RENDERERS { dom, ascii }, zoom, barre d'état
styles/
├── main.css                      mise en page générale, ASCII, légende
└── tiles-2d.css                  ← thème des tuiles (variables CSS --tile-*)
```

- **Renderers interchangeables** : `main.js` détient une table `RENDERERS`. Changer de renderer appelle
  `dispose()` sur l'ancien et crée le nouveau sur le même niveau. Le futur renderer 3D s'ajoutera à cette table.
- **Zoom commun** : la variable CSS `--cell` pilote la taille des cases en 2D et la taille de police en ASCII
  (`font-size: --cell / 1.2`, car 2 caractères ≈ 1,2 em).
- **Performance** : les cellules sont créées une seule fois pour une taille de cadre donnée (2 652 en repère global).
  Changer de niveau ne fait que réécrire leurs `className`. Le survol passe par un seul écouteur délégué
  sur la grille, avec `data-i` pour retrouver la case.
- **Vers les sprites** (CLAUDE.md « 2D (sprites) ») : tout le visuel tient dans `tiles-2d.css`. Passer aux sprites
  revient à donner un `background-image` à chaque `.t-<type>`, ou à fournir un autre fichier de thème, sans toucher au JS.

## 4. Vérifications

Testé dans Chrome sur `http://127.0.0.1:8765` :

- affichage des niveaux 0, 1, 7 et 13, en repère global et local ;
- navigation ↑ / ↓ / Fin, bascules R et G ;
- survol : (3,1) au niveau 1 donne « [3, 15] global · stairs ↑ vers niveau 0 · axe NS », ce qui est cohérent avec la doc 003 ;
- zoom : `+++` fait passer la case de 16 à 22 px, `-` la ramène à 20 px, et `0` revient à l'ajustement (14 px) ;
- aucune erreur dans la console.

Les touches `equal` et `minus` de l'outil d'automatisation n'émettent pas de `keydown` : le zoom a donc été testé
en tapant les caractères `+`, `-` et `0`. Avec un vrai clavier, `+`, `=` et `-` sont reconnus, y compris sur le pavé numérique.

## 5. Suite possible

- **005** : renderer 3D (Three.js), avec les 14 niveaux empilés selon leurs offsets, une caméra orbitale et un zoom.
  On y ajouterait aussi `createThreeRenderer` dans `RENDERERS`, avec en plus la possibilité d'isoler ou de
  mettre en avant un niveau (`showLevel`).
- Options 2D, si besoin : fantôme du niveau du dessus ou du dessous (« onion skin »), puis affichage des états
  (portes ouvertes, trappes, faux murs).
