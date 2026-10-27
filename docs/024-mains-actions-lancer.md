# 024 — Mains, panneau d'actions et lancer

> Suite de [023-combat-phase-c3a.md](023-combat-phase-c3a.md), avant C3b.
> Réponse à la question Q5 du doc 020 : **un panneau d'actions par objet, comme dans DM**.

## 1. Demande

- **Mains :** tout objet tenu peut être posé dans l'une des deux mains de Zed. Ce n'est plus automatique, et les mains deviennent une partie de l'inventaire.
- **Actions :** chaque objet a son panneau d'actions, placé sous le cadre de Zed pour l'instant :
  - les armes de poing : **Frapper** ;
  - les projectiles (Throwing Star…) : **Lancer**.
- **Lancer :** on peut lancer **n'importe quel objet** devant soi.
  - Il tombe quelques sous-cases plus loin, selon son poids.
  - Il peut heurter un mur, ou toucher une créature : elle perd des PV selon l'objet, et l'objet tombe au sol.
  - Cette logique de projectile doit resservir en C3b.
- **Clic droit** dans la vue : range l'objet tenu dans l'inventaire, comme le bouton « Ranger ».

## 2. Données des objets (`src/core/item-info.js`)

La page *Dungeon Master Items* de l'Encyclopaedia donne, pour chaque type d'objet, les valeurs de l'item 559 de graphics.dat (extraites de DM pour Atari ST).

| Colonne | Usage |
|---|---|
| Poids (kg) | Portée d'un lancer, dégâts d'un objet qui n'est pas une arme |
| Armes : Strength | Bonus de force quand l'arme est en main d'action : il s'ajoute à la force de Zed pour « Frapper » |
| Armes : Kinetic Energy | Énergie de départ d'une arme lancée, et base de ses dégâts à l'impact (la page le précise) |
| Armes : Actions (combo) | Une arme est **lançable** si son combo contient Throw, **de frappe** si une de ses actions a des dégâts |

Les 43 armes, 55 vêtements, 12 potions, le coffre, le parchemin et 47 objets divers du catalogue y sont, retrouvés par leur nom.

## 3. Règles

### Curseur et mains

- **Curseur :** c'est l'ancien « objet en main » (`state.hand`), comme la main-curseur de DM. La barre d'inventaire l'affiche : « Tenu : Torch » ou « Rien de tenu ».
- **Mains de Zed** (`state.hands`) : gauche et droite (main d'action). Un clic sur une main **échange** l'objet tenu et celui de la main.
- **Objets possédés :** les détecteurs d'objet porté (plaques de type 8) tiennent compte des mains.
- **Serrures et alcôves :** elles utilisent toujours l'objet tenu par le curseur, comme dans DM.

### Panneau d'actions

Comme dans DM, il affiche les actions de la **main d'action** (droite).

| Main d'action | Actions | Exemples |
|---|---|---|
| Vide | Frapper | À mains nues |
| Arme de frappe | Frapper (force + bonus de l'arme) | Torch, Sword, Axe, Mace |
| Arme lançable et de frappe | Lancer, Frapper | Dagger, Arrow, Club, Poison Dart |
| Arme seulement lançable | Lancer | Throwing Star, Rock |
| Autre objet | « Aucune action » | Vêtements, potions, clés |

« Frapper » reste l'action *Hit* de DM (doc 023). Les autres actions des combos (Swing, Chop, Thrust…) viendront en C3c.

### Lancer

| Comment | Quoi |
|---|---|
| Bouton « Lancer » | L'objet de la main d'action part du côté droit |
| Clic dans la vue avec un objet tenu, sur rien d'accessible (sol lointain, mur lointain, fond du couloir) ou sur la créature en face | L'objet tenu part du côté cliqué (moitié gauche ou droite de la vue) |
| Clic sur une case de sol accessible avec un objet tenu | Il est posé, comme avant |

**Vol (`src/sim/projectiles.js`) :**
- **Déplacement :**
  - un objet lancé avance d'une sous-case par tick, soit deux pas par case, comme les projectiles de DM ;
  - il part du rang avant de la case du groupe, du côté choisi.
- **Arrêts :** il tombe sur la sous-case où il se trouve quand :
  - **son énergie est épuisée** ;
  - la case suivante l'arrête : mur, escalier, porte fermée, faux mur fermé (un mur imaginaire le laisse passer).
- **Créature touchée :**
  - il entre sur sa case, la blesse, et tombe sur cette case ;
  - les créatures immatérielles le laissent passer.
- **En tombant :** il suit les trappes et les téléporteurs, comme tout objet (`itemsDropped()`).

**Valeurs (provisoires) :**
- énergie de départ : `force de Zed + énergie cinétique de l'arme (0 sinon) + aléa(16)` ;
- perte par pas : `4 + poids en 100 g / 2` ;
- dégâts à l'impact : `énergie cinétique (arme) ou poids en 100 g / 2 (autre), + énergie restante / 4 × masse, + aléa(moitié), − aléa(défense / 2 + 1)` ;
- masse : 1 pour une arme, sinon le poids divisé par 2 kg, plafonné à 1. Un vêtement léger frappe donc à peine, un Boulder (8 kg) beaucoup ;
- coût d'un lancer : 2 points d'endurance stockés et 4 ticks de fatigue. Dans la table de DM, l'action Throw a une fatigue et une endurance de 0 : le moteur les fixe ailleurs.

Ordres de grandeur, pour Zed (force 40) :

| Objet | Poids | Distance |
|---|---|---|
| Throwing Star | 0,1 kg | 8 cases |
| Dagger | 0,5 kg | 5 cases environ |
| Torch | 1,1 kg | 2 à 3 cases |
| Mail Aketon | 6,5 kg | 1 case |

### Clic droit

Un clic droit dans la vue range l'objet tenu dans l'inventaire, comme « Ranger ». Le menu contextuel du navigateur ne s'ouvre plus dans la vue.

## 4. Vues

- **Cadre de Zed :**
  - les deux mains sont des boutons, avec la couleur de l'objet qu'elles tiennent ;
  - le survol donne le nom de l'objet ;
  - sous le cadre, le **panneau d'actions** présente une ligne par action ;
  - après une action, le panneau affiche un instant le résultat (dégâts, « Raté », « Sans effet »).
- **Objets en vol :** dans la vue à la première personne, un petit cube de la couleur de leur catégorie, au centre de leur sous-case, à hauteur de main. Ils sont redessinés une fois par image (événement `projectilesMoved`). Ils ne sont pas encore dessinés en 2D ni en 3D.
- **Barre d'état :** « Lancé : Hosen », « Screamer touché : 15 PV ».

## 5. Vérifications

**Node** (`node tools/test-combat.mjs` et `node tools/test-creatures.mjs` : tout est bon)

| Cas | Résultat |
|---|---|
| Torch du curseur vers la main droite, puis retour | Échange correct ; actions de la Torch : Frapper |
| Actions par objet | Main vide : Frapper. Dagger : Lancer, Frapper. Throwing Star : Lancer. Mail Aketon : aucune |
| Couloir du niveau 2 depuis (15, 20) vers le sud | Throwing Star : 8 cases. Mail Aketon : 1 case. Curseur vide ensuite |
| Face à un mur | La Dagger tombe sur la case du groupe |
| Torch lancée sur les Screamers de N1 (8, 24) | Un Screamer touché (15 PV), la Torch tombe sur leur case |

**Chrome :**
- **Mains :** Torch prise dans l'inventaire puis posée en main droite. Le panneau affiche « Frapper ».
- **Lancer sur une créature :** Hosen tenu, clic sur un Screamer : l'objet part et le panneau affiche les dégâts.
- **Clic droit :** Mail Aketon tenue, clic droit dans la vue : elle revient dans l'inventaire.
- **Lancer au loin :** Hosen tenu, clic au fond du couloir. Le cube vert vole, puis l'objet se pose deux cases plus loin, en 2D comme à la première personne.
- **Console :** aucune erreur.

## 6. Limites et suite

- **Main gauche :** elle n'a pas de panneau d'actions, comme dans DM, où seule la main d'action en a un.
- **Portes cassables :** elles réagissent toujours à l'arme tenue par le curseur (doc 019). En C3c, ce sera « Frapper » sur la porte.
- **Grilles :** dans DM, un petit objet (rangeable dans la poche, sauf les clés) passe à travers une grille fermée. Ici, toute porte fermée l'arrête.
- **Toucher :** un objet lancé touche toujours la créature qu'il atteint. Dans DM, il y a un test, et l'objet peut passer à côté.
- **C3b** reprendra `createProjectiles()` pour les lanceurs muraux et les sorts : `launch()` accepte une énergie, une perte par pas et des dégâts quelconques.

## Sources

- *Dungeon Master Encyclopaedia*, **Dungeon Master Items** : http://dmweb.free.fr/games/dungeon-master/solutions/items/.
  Poids, actions, bonus de force et énergie cinétique de chaque objet, avec la définition des colonnes. Reprise sous forme de table dans `src/core/item-info.js`.
- *Dungeon Master Encyclopaedia*, **Graphics.dat Item 559** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/graphics.dat-item-559/.
  Format des descripteurs d'armes (classe, perte d'énergie des projectiles, deux pas par case) et des emplacements de transport (poche, objets qui passent les grilles).
- *Dungeon Master Encyclopaedia*, **Actions and Combos** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/actions-and-combos/.
  Action 42 « Throw » / « Lancer ».
