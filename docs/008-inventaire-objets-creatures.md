# 008 — Inventaire des objets et des créatures

> Suite de [007-reglages-3d.md](007-reglages-3d.md).
> Où se trouvent les objets et les créatures : marqueurs sur la carte en 2D et en 3D, infobulle de survol
> avec le contenu de la case, et inventaire global filtrable avec localisation.

## 1. Ce que contient le donjon

| | Nombre | Remarques |
|---|---|---|
| Objets placés | 606 | 381 au sol, 157 contre un mur, 43 dans des coffres, ~25 portés par des créatures |
| Groupes de créatures | 182 | **303 individus**, 25 espèces ; 114 groupes d'un seul monstre, placés au centre de la case |
| Cases avec objets | 332 | Jusqu'à 7 objets par case, et 6 empilés sur une même position |
| Objets non placés | 5 | `weapons[105]`, `scrolls[33]`, `potions[37]`, `miscellaneous[8, 116]` (voir 002), absents de l'inventaire |

- **Répartition par catégorie :** 106 armes, 121 vêtements, 34 parchemins, 55 potions, 12 coffres, 278 objets divers.
- **Espèces les plus nombreuses :** Trolin 47, Skeleton 42, Mummy 38, Screamer 30.
- **Niveau 0 :** les 98 objets du niveau 0 sont l'équipement des champions, posés devant leurs miroirs (objets « sur un mur »).

## 2. Décisions (réponses de l'utilisateur)

| Question | Décision |
|---|---|
| Inventaire global | Oui |
| Visuels | Formes et couleurs. Les sprites d'origine pourront servir plus tard |
| Infobulle de survol | Flottante, près du curseur |
| Contenu des coffres et des monstres | Signalé sur la carte, détaillé dans l'infobulle |
| Ordre des 4 positions | Celui du moteur, **confirmé ensuite dans le jeu** |

### Positions dans une case

| Position | Au sol | Sur un mur |
|---|---|---|
| 0 | Nord-ouest (NO) | Face N |
| 1 | Nord-est (NE) | Face E |
| 2 | **Sud-est (SE)** | Face S |
| 3 | **Sud-ouest (SO)** | Face O |

**Ordre vérifié dans le jeu original** par l'utilisateur : c'est bien celui du moteur, dans le sens horaire depuis le nord-ouest.
Les annotations du dump (« South/BottomLeft », « West/BottomRight ») sont trompeuses pour 2 et 3.
J'ai donc retiré l'alternative `'dump'` du code.

### Couleurs

- **Objets :** une couleur par catégorie (arme argent, vêtement vert, parchemin crème, potion rose, coffre brun, divers orange).
- **Créatures :** une couleur par espèce, regroupées dans `src/render/palette.js`.
  J'ai mesuré la teinte moyenne des sprites de face sur la page de référence
  (graphics.dat de DM Amiga 3.6, greatstone.free.fr), directement dans le navigateur, sans rien télécharger.
  Mais ces images sont stockées avec leur **palette brute**, que le jeu recolore à l'affichage pour plusieurs créatures
  (le Ghost y apparaît vert, le Magenta Worm brun). J'ai donc gardé les teintes plausibles
  (Swamp Slime vert, Mummy et Skeleton blancs, Stone Golem gris, Giant Wasp jaune…) et complété de mémoire.
- **Anneau doré :** il signale un coffre qui contient des objets, ou une créature qui en porte.

## 3. Rendu

| Élément | 2D | 3D |
|---|---|---|
| Objets au sol | Carré dans le quart de case, couleur de la catégorie du premier objet, nombre affiché s'il y en a plusieurs | Petits pavés **empilés** dans le quart de case (un par objet) |
| Objets sur un mur | Barre contre la face concernée | Pavés contre la face, à mi-hauteur |
| Créatures | Disque par individu dans son quart de case ; un monstre seul est au centre et plus gros | Cône par individu (×1,5 s'il est seul) |
| Contenu (coffre, possessions) | Anneau doré autour du marqueur | Petite sphère dorée au-dessus |

- **Infobulle :** elle apparaît au survol d'une case qui a du contenu, près du curseur, et passe de l'autre côté près des bords de la fenêtre. Elle affiche :
  - le titre « Niveau n (x, y) · type » ;
  - le groupe de créatures (effectif, PV de chaque membre, orientation) et ses possessions en retrait ;
  - chaque objet avec sa position (NO, NE, SE, SO, ou la face pour un mur) ;
  - des précisions selon l'objet (première ligne d'un parchemin, puissance d'une potion, charges d'une arme) ;
  - le contenu des coffres en retrait.
- **Calques :** les cases **Objets** `O` et **Créatures** `C` du panneau de contrôle, en 2D et en 3D, sont mémorisées.
  L'infobulle respecte les calques affichés.
- **Inventaire** (touche `I`), sous le panneau de contrôle :
  - des puces par catégorie avec les totaux, qui servent de filtre (un clic sur une puce active le filtre, un nouveau clic l'annule) ;
  - un choix de niveau et une recherche par nom (le nom du contenant compte aussi) ;
  - une liste groupée par nom, par effectif décroissant (« Trolin 47 », « Torch 22 »…). À l'ouverture d'un groupe, chaque occurrence s'affiche :
    « Niveau 7 (3, 2) — SE », « … dans Chest », « ×4 » pour un groupe de créatures ;
  - **un clic sur une occurrence** passe au niveau et met la case en évidence : contour doré pulsé en 2D avec défilement jusqu'à elle,
    boîte dorée en fil de fer en 3D avec glissade de la caméra.
- **Légende :** elle ajoute les couleurs des catégories, la créature et l'anneau « contient des objets ».

## 4. Architecture

```
src/core/contents.js            tileContents(), describeItem(), describeCreature(), buildInventory(),
                                positions (subcellOffset, libellés)
src/render/palette.js           couleurs des catégories et des espèces (2D, 3D, légende, inventaire)
src/render/dom/dom-renderer.js  + marqueurs dans les cellules, setLayers(), highlightTile()
src/render/three/level-contents.js  3 InstancedMesh par niveau (objets, créatures, anneaux) à couleur par instance
src/render/three/three-renderer.js  + calques, setLayers(), highlightTile()
src/ui/tooltip.js               infobulle flottante
src/ui/inventory-panel.js       inventaire global
```

- **Contrat du renderer**, extensions optionnelles : `setLayers({ items, creatures })` et `highlightTile(x, y)`.
  L'ASCII n'en a pas, donc pas de calques ni d'infobulle en ASCII.
- **Performance :**
  - en 2D, seules les cases avec du contenu reçoivent des marqueurs, recréés à chaque changement de niveau ;
  - en 3D, il suffit de **3 draw calls par niveau** pour tout le contenu, grâce à `InstancedMesh.setColorAt`.
    Les marqueurs 3D portent un `layer` (`items`, `creatures`, ou `contents` pour les anneaux, visibles avec l'un ou l'autre calque).
- **Survol :** le renderer remonte la case, et `main.js` en calcule le contenu avec `tileContents()`, sans dépendre du renderer.
  En 3D, les marqueurs sont eux-mêmes survolables.
- **Mise en page :** une colonne `.side-panels` à droite contient le panneau de contrôle (recréé pour chaque renderer)
  et l'inventaire, qui reste le même quand on change de renderer.
- **Clavier :** les panneaux ne bloquent les raccourcis que dans les champs de saisie (recherche, liste des niveaux, curseurs).
  Après un clic sur un bouton du panneau, les touches pilotent de nouveau la vue.
  C'est une correction trouvée en test : O et C étaient ignorés après un clic dans l'inventaire.

## 5. Vérifications (Chrome)

- **2D, niveau 1 :** marqueurs d'objets et de créatures visibles. Le survol du coffre en (2,31) affiche « Chest NO »
  et ses 8 objets en retrait, dont « Scroll · DES VEN WILL ». Le survol en (20,29) affiche « 4 × Screamer · PV 46 · 51 · 51 · 49 · face N ».
- **Inventaire :** la puce Coffres donne 1 groupe de 12 occurrences. Le clic sur « Niveau 7 (3, 2) — SE » passe au niveau 7
  et met en évidence la case du coffre.
- **3D, niveau 7 en solo :** cônes des créatures et pavés des objets. Le survol d'un cône affiche « Ghost · PV 7 · face S ».
  Le clic sur un coffre de l'inventaire affiche la boîte dorée.
- **O et C :** ils masquent puis réaffichent objets et créatures en 2D et en 3D, et les cases du panneau suivent.
- Aucune erreur dans la console. Les préférences de test ont été effacées du navigateur.

## 6. Suite (CLAUDE.md)

- **009** : logique des actuators et des téléporteurs.
- **010** : textes.
- **Plus tard :** remplacer les formes par les sprites d'origine (les catégories et les espèces sont déjà séparées
  dans la palette).
