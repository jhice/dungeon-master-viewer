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

## 7. Retours après les tests

### Délai entre deux actions

**Demande :** dans DM, chaque action du champion est suivie d'un temps mort, pendant lequel son bouton est désactivé. Cela évite de cliquer sans arrêt.

**Ce que dit la documentation :** la table de l'Encyclopaedia (*Actions and Combos*) donne cette durée pour chaque action, dans la colonne **Fatigue**. Elle est exprimée en 1/6 de seconde : c'est le temps avant de pouvoir agir de nouveau.

| Action | Fatigue | Durée |
|---|---|---|
| Punch | 1 | 0,17 s |
| Hit (Frapper) | 4 | 0,67 s |
| Kick, Stab | 5 | 0,83 s |
| Swing, Block | 6 | 1 s |
| Chop | 8 | 1,33 s |
| Thrust | 16 | 2,67 s |
| Berzerk | 30 | 5 s |
| Throw (Lancer) | 0 dans la table | 4 ticks ici, soit 0,67 s, **provisoire** |

La fatigue existait déjà dans la simulation, mais le bouton restait cliquable : le coup était simplement refusé. Désormais :
- **pendant la fatigue**, les boutons du panneau d'actions sont **désactivés** et grisés ;
- ils le sont **dès le clic**, sans attendre le tick suivant ;
- Espace et le clic sur une créature sont refusés de la même façon ;
- **le résultat** (dégâts, « Raté ») s'affiche **au-dessus** des boutons au lieu de les remplacer, pour qu'on voie le bouton se griser puis revenir.

**Vérification dans Chrome :** après un « Frapper » sur un Screamer, le bouton est désactivé tout de suite, se réactive au bout de 0,6 s, et le résultat (35) s'affiche au-dessus.

### Inscription sur une décoration

**Constat :** en N0 (5, 17), la face ouest porte une décoration aléatoire du niveau (un crochet, « Hook ») et l'inscription « VI ALTAR OF REBIRTH ». Les deux étaient dessinés l'un sur l'autre.

**Règle :**
- une face qui porte une **inscription visible** n'affiche plus sa décoration aléatoire (`shownOrnament()`, `src/core/ornaments.js`) ;
- les ornements des actuators (boutons, serrures…) ne sont pas concernés ;
- un message encore caché laisse la décoration en place, jusqu'à ce qu'un mécanisme le fasse apparaître. La face est alors redessinée.

**Faces concernées dans le donjon :**

| Face | Situation |
|---|---|
| N0 (5, 17), ouest | Inscription visible : la décoration disparaît |
| N1 (14, 16), ouest | Inscription visible : la décoration disparaît |
| N3 (15, 17), ouest | Message caché : la tête de goule reste visible tant que le message n'est pas affiché |

### Frapper dans le vide

**Demande :** on doit pouvoir frapper même sans créature en face. Le coup peut ne rien toucher, toucher un mur, une porte ou une créature, et le délai s'applique dans tous les cas.

**Règle** (`attack()`, `src/sim/simulation.js`) : « Frapper » coûte toujours son endurance et sa fatigue (4 ticks), puis il se résout sur la case en face :

| En face | Résultat | Affichage |
|---|---|---|
| Un groupe de créatures | Touché, raté ou sans effet (immatériel), comme avant | Dégâts, « Raté » ou « Sans effet » |
| Un mur, un faux mur fermé | `wall` | « Mur » ; « Le coup frappe le mur » |
| Une porte fermée | `door` : la porte n'est pas abîmée | « Porte » ; « Le coup frappe la porte, sans l'abîmer » |
| Rien : case libre, porte ouverte, mur imaginaire | `air` | « Dans le vide » ; « Le coup frappe dans le vide » |

**Pourquoi la porte n'est pas abîmée :** d'après la note (e) de la table *Actions and Combos*, seules Chop, Kick, Swing, Hack, Berzerk et Bash peuvent détruire une porte. « Frapper » (*Hit*) n'en fait pas partie. Une porte cassable se casse toujours au clic avec une arme tenue par le curseur (doc 019). Les vraies actions de combo arriveront en C3c.

**Espace :** la touche actionne toujours ce qui est en face : un mur, une porte, ou la créature, qui est alors frappée.

**Tests Node :**
- dans le vide : `air`, fatigue de 4 ticks ;
- un second coup immédiat est refusé ;
- contre un mur : `wall` ;
- contre la porte fermée N0 (5, 9) : `door`, et elle reste fermée.

**Chrome :** au départ, « Frapper » affiche « Dans le vide » et le bouton est grisé pendant la fatigue.

### Téléporteurs dans la vue de jeu

**Demande :** dans la vue à la première personne, les téléporteurs doivent être translucides et occuper toute la case, en largeur et en hauteur.

**Avant :** un bloc de 70 % de la case, à 90 % de la hauteur des murs, opaque (la vue de jeu n'applique pas l'opacité du rendu 3D).

**Maintenant** (`level-meshes.js`, pièce `teleporterGame`, utilisée seulement avec `game: true`) :
- le volume remplit **toute la case, du sol au plafond**. Il est réduit de 0,2 % pour que ses faces ne se superposent pas à celles des murs voisins ;
- il est **translucide** : opacité 0,3, il n'écrit pas dans le tampon de profondeur, et on voit le couloir à travers ;
- il garde sa couleur lumineuse.

Le rendu 3D des niveaux superposés garde son bloc de 70 %. Un téléporteur invisible ou désactivé reste non dessiné dans la vue de jeu.

**Chrome :** en N1, le téléporteur (26, 29) vu depuis (24, 29) remplit sa case, et on voit le fond du couloir à travers lui.

**Ensuite, un cube complet visible de l'intérieur :**
- le volume est un **cube fermé**, du sol au plafond, réduit de 4 millièmes pour ne toucher ni les murs, ni le sol, ni le plafond ;
- il est **dessiné des deux côtés** (`side: DoubleSide`). Un groupe qui se tient sur un téléporteur qui ne l'emporte pas (portée `items` ou `creatures`) voit donc tout teinté de sa couleur, avec les bords du cube autour de lui.
- **Exemple :** N1 (13, 16), un téléporteur de portée `items` vers (14, 14). Le groupe y reste, la vue est teintée de cyan, et on voit le couloir à travers.

**Inscription dessinée par-dessus le téléporteur :** « TO CLOSE PIT LEAVE A VALUABLE ON FLOOR », sur la face ouest du mur N1 (14, 16), juste derrière ce téléporteur, apparaissait devant lui.
- **Cause :** les inscriptions et le téléporteur sont tous deux translucides. Three.js les trie d'après le centre de chaque objet, et celui des téléporteurs, dessinés ensemble (*instanced mesh*), est faussé.
- **Correction :** les téléporteurs de la vue de jeu sont dessinés **après** les autres objets translucides (`renderOrder: 1`). Ce qui est derrière un mur reste caché par le mur.
- **Chrome :** le texte apparaît derrière le cube, teinté, aussi bien de l'intérieur (13, 16) que de l'extérieur (12, 16).

## Sources

- *Dungeon Master Encyclopaedia*, **Dungeon Master Items** : http://dmweb.free.fr/games/dungeon-master/solutions/items/.
  Poids, actions, bonus de force et énergie cinétique de chaque objet, avec la définition des colonnes. Reprise sous forme de table dans `src/core/item-info.js`.
- *Dungeon Master Encyclopaedia*, **Graphics.dat Item 559** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/graphics.dat-item-559/.
  Format des descripteurs d'armes (classe, perte d'énergie des projectiles, deux pas par case) et des emplacements de transport (poche, objets qui passent les grilles).
- *Dungeon Master Encyclopaedia*, **Actions and Combos** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/actions-and-combos/.
  Action 42 « Throw » / « Lancer ».
