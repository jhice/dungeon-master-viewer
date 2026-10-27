# 018 — Décors de la vue à la première personne

> Suite de [017-simulation-phase-e.md](017-simulation-phase-e.md).
> La vue à la première personne dessine désormais les décors des murs, des sols et des portes, au lieu des marqueurs de la 3D.
> Décisions de l'utilisateur : **dessins procéduraux** (canvas, aucun fichier externe), pour les **4 familles** de décors.
>
> Ajout dans la même session : un **menu déroulant** d'accès direct aux niveaux dans le panneau, à côté du bouton « Jeu ».

## 1. Inventaire des décors utilisés dans le donjon

**56 décors muraux, 9 décors de sol, 11 ornements de porte et 4 types de porte.** Tous ont un dessin : un script Node vérifie que chaque nom utilisé dans `dungeon.json` a son entrée dans le catalogue.

### Murs : décors fonctionnels

Ils sont portés par un actuator et changent avec les rotations.

| Décor | Faces | Dessin |
|---|---|---|
| Empty / Full Torch Holder | 13 + 13 | Support en fer ; plein, une torche et sa flamme |
| Champion Mirror | 24 | Cadre doré, reflet bleuté |
| Lever Up / Down | 12 + 12 | Platine et manche haut ou bas |
| Interrupteurs In / Out | 112 | Bouton sur platine, sorti (en relief) ou enfoncé. Familles : Green, Red, Blue, Big, Small, Tiny, Crack (pierre dans une fissure) et Eye (un œil) |
| Serrures | 77 | Platine de couleur et trou de serrure : croix (Cross), carré (Square), aile (Winged), crâne (Skeleton), ankh (Ra). Familles : Gold, Iron, Stone, Skeleton, Tourquoise, Ra, Onyx, Cross, Master, Square, Ruby, Emerald, Topaz, Winged |
| Gem Hole | 1 | Logement en losange |
| Coin Slot | 14 | Platine en laiton, fente |
| Fountain | 29 | Tête de lion, filet d'eau, bassin |
| Vi Altar | 4 | Cadre gravé « VI » autour de la niche |
| Amalgam (sans gemme, gemme libre, gemme sertie) | 3 | Statue et gemme |
| Lord Order (Outside) | 2 | Emblème |
| Fireball / Poison / Dagger Holes | 16 | Trous dans la pierre, cerclés selon le projectile |
| Square / Arched Alcove | 64 | Niche sombre avec un rebord (inchangé, doc 017) |

### Murs : décors décoratifs

Ils sont portés par la tuile.

| Décor | Faces | Dessin |
|---|---|---|
| Slime | 75 | Coulures vertes |
| Hook | 64 | Crochet |
| Crack | 61 | Fissure |
| Wood Ring / Iron Ring | 58 / 28 | Anneau |
| Manacles | 32 | Deux fers et leurs chaînes |
| Grate | 21 | Grille basse |
| Ghoul's Head | 21 | Tête sculptée |
| Slime Outlet | 42 | Bouche d'égout et sa bave |
| Dent 1 / Scratches | 13 / 2 | Creux / rayures |

### Sol

Les décors de sol sont des **décalques** vus de dessus. Ceux des plaques remplacent les carrés orange.

| Décor | Cases | Dessin |
|---|---|---|
| Square Pressure Pad / Round Pressure Plate / Tiny Pressure Pad | 69 / 15 / 9 | Dalle carrée, ronde ou petite |
| Moss, Puddle, Crack | 34 / 18 / 21 | Mousse, flaque, fissure |
| Square Grate / Round Grate | 14 / 11 | Grille d'égout |
| Black Flame Pit | 13 | Fosse sombre à lueur violette |

### Portes

| Type (`map.doorTypes`) | Feuille |
|---|---|
| Porticullis | Herse de barreaux, **transparente** entre les barreaux |
| Wooden | Planches et deux ferrures |
| Ra | Panneau sombre et cercle doré |
| Iron | Plaque rivetée |

**Ornements** (`map.doorDecorations`), dessinés sur la feuille :
- Arched Grid, Square Grid ;
- Wooden Bars, Iron Bars ;
- Red Triangle Lock, Corner Lock, Block Lock ;
- Jewels, Ra Door Energy ;
- Black door (Dungeon Entrance), Iron Door Damages.

**Bouton de porte** (72 portes) : un bouton rouge sur le côté droit de la feuille. Un clic sur la porte l'ouvre (phase C).

## 2. Règles d'affichage (`src/core/ornaments.js`)

- **Mur :** chaque face affiche **un** décor, celui du dernier actuator à graphisme de la face, sinon la décoration de la tuile (doc 017, § 7).
- **Sol :** `shownFloorOrnament()` donne le graphisme du dernier actuator **au sol** de la case qui en a un, sinon la décoration de la tuile (index base 1 dans `map.floorDecorations`).
  - Une plaque **sans graphisme reste invisible**, comme dans DM : il y a des plaques cachées.
- **Porte :** `doorLook()` donne le type (`doors[].type` → `map.doorTypes`), l'ornement (`doors[].ornate`, base 1 → `map.doorDecorations`) et le bouton (`doors[].button`).

## 3. Implémentation

```
src/core/ornaments.js                   + shownFloorOrnament(), doorLook()
src/render/first-person/ornament-art.js  catalogue des dessins, sans Three.js : WALL_ART, FLOOR_ART, DOOR_TYPES, DOOR_ART
src/render/first-person/fp-decor.js      placement : décors muraux, niches, inscriptions, décalques de sol, portes
src/render/first-person/fp-renderer.js   branchement ; plus de marqueurs de mécanismes ni de portes génériques
```

- **Dessins** groupés par familles paramétrées : `switchArt(couleur, enfoncé)`, `lever(haut)`, `lock(couleur, trou)`, `torchHolder(plein)`, `holes(nombre, teinte)`, `amalgam(état)`, `pad(forme)`, `floorGrate(forme)`.
  - Le canvas fait 256 px de large. Sa hauteur suit les proportions du plan, pour ne pas déformer les dessins.
- **Cache des textures** par nom (`wall:…`, `floor:…`, `door:type|ornement|bouton`, `text:…`), pour toute la vie de la vue.
  - Les reconstructions de niveau ne libèrent que les géométries et les matériaux.
- **Plans des décors :** à 4 mm de la face, et les inscriptions à 6 mm, par-dessus.
  - Ce ne sont pas des `InstancedMesh` : le pointeur les traverse et touche le mur derrière, donc la même face. Le clic ne change pas.
- **Portes :** une boîte texturée par porte, en `InstancedMesh` d'une instance avec `userData.tiles`, donc cliquable comme avant.
  - Fermée, elle occupe toute la hauteur. Ouverte, elle est relevée, et son quart inférieur reste visible.
  - Le matériau est en `alphaTest`, pour voir à travers une herse.
  - La porte générique de `level-meshes.js` est masquée dans la vue (`part === 'door'`).
- **Marqueurs de mécanismes** (losanges, plaques orange) : ils ne sont plus dessinés dans la vue à la première personne. Ils restent en 2D et en 3D.
- **Mises à jour :** les reconstructions existantes suffisent. `ornamentChanged` couvre levier, support à torche et alcôve révélée, `tileChanged` couvre les portes.

## 4. Menu des niveaux (panneau)

- Le schéma du panneau (`src/ui/control-panel.js`) accepte un élément `{ type: 'select', options, value(), onChange() }` dans une rangée de boutons.
- `main.js` y place « Niveau 0 » … « Niveau 13 », à côté de « ▶ Jeu ».
- Le menu suit le niveau affiché (`refresh()` à chaque changement de niveau).
- Les flèches dans le menu ouvert ne changent pas de niveau, et le focus est rendu au clavier après un choix.

## 5. Vérifications

- **Couverture (Node) :** 0 décor manquant pour les murs, le sol, les ornements et les types de porte.
- **Non-régression (Node) :**
  - la porte (18, 1) s'ouvre puis se ferme sur ses plaques ;
  - la marche aléatoire de 200 000 actions, qui lit aussi les décors autour du groupe, ne lève aucune exception ;
  - le Falchion N1 (6, 4) reste accessible après le bouton.
- **Chrome :**
  - support à torche N0 (3, 14), avec sa flamme ;
  - miroir N0 (14, 2) ;
  - levier N1 (6, 8) : en position haute, puis basse après le clic, et la trappe se ferme ;
  - plaques de pression en dalles de pierre en N1 (15–16, 0–2) ;
  - herse transparente N1 (18, 1) ;
  - porte en bois à bouton N1 (1, 0) : le clic l'ouvre, et la mousse apparaît au sol derrière ;
  - Gold Lock N1 (5, 4), gros bouton N1 (6, 4), crochet N0 (7, 1) ;
  - menu des niveaux : le choix « Niveau 7 » affiche le niveau 7, et PgPréc le fait passer à 6 ;
  - aucune erreur dans la console.

## 6. Limites

- **Pas d'animation :** la flamme, l'énergie Ra et l'eau sont fixes (phase F).
- **Portes à ouverture horizontale** (`opening: horizontal`, 22 portes) : elles se relèvent comme les autres, au lieu de coulisser.
- **Miroirs sans portrait :** les champions ne sont pas simulés.
- **Dessins évocateurs**, pas des copies des sprites originaux. Un passage aux sprites reste possible : il suffirait de remplacer le catalogue `ornament-art.js`.

## Sources

Aucune nouvelle source. Les noms des décors viennent de `dungeon.json` (`wallDecorations`, `floorDecorations`,
`doorDecorations`, `doorTypes`, docs 002 et 009). Les dessins sont originaux et ne copient pas les graphismes du jeu.
