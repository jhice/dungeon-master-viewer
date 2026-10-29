# 044 — Actions des objets (combos de DM)

> Demande de l'utilisateur : mettre les vraies actions de DM dans la main d'action, à la place de « Frapper », avec le bon effet pour chaque type d'arme ou d'objet.
> Sources : *Dungeon Master Encyclopaedia*, « Actions and Combos » et « Dungeon Master Items » ; ReDMCSB, `MENUS.C` (F383, F401, F402, F403 à F407), `CHAMPION.C` (F280, F303, F312, F326, F327), `GROUP2.C` (F232). Voir [000-sources.md](000-sources.md).

## 1. Ce que fait DM

- Chaque objet a un **combo** : 0 à 3 actions, parmi les 44 actions du jeu. La main vide a le combo « Cogner, Coup de pied, Amort ».
- Pour chaque action du combo, deux conditions (F383) :
  - un **niveau minimum** dans la compétence de l'action ;
  - une **charge**, quand le combo l'exige.

  La première action est toujours affichée. Une action qui ne remplit pas ses conditions n'apparaît pas.
- Chaque action a une compétence, une endurance, une probabilité de toucher, des dégâts (en 1/32) et une fatigue (en ticks). Les valeurs sont celles de DM 1.2 et suivants (Amiga 2.0).
- **Niveau de compétence (F303) :**
  - une compétence cachée de niveau *n* sur la fiche part avec 125 × 2ⁿ points d'expérience ;
  - une classe part avec la somme de ses 4 compétences cachées ;
  - le niveau d'une compétence cachée vient de la moyenne de son expérience et de celle de sa classe : 1, plus 1 par division par 2 jusqu'à passer sous 500.
- **Zed** est Apprenti (3) dans les quatre classes. Ses compétences cachées sont au niveau 2 ou 3.

## 2. Effet de chaque sorte d'action (F407)

| Sorte | Actions | Effet dans le simulateur |
|---|---|---|
| Frappe | Entailler, Cogner, Coup de pied, Poignarder, Taillader, Plonger, Piquer, Parer, Abattre, Se ruer sur, Ensorceler, Mêlée, Pourfendre, Assommer, Étourdir | Coup sur le groupe en face, avec les valeurs de l'action. Sans créature (vide, mur, porte) : **demi-fatigue**. Ensorceler et la Vorpal Blade touchent les créatures immatérielles (F402) |
| Frappe contre une porte | Assommer, Abattre, Se ruer sur, Coup de pied, Taillader, Entailler | Sur une porte fermée : attaque de la porte (F232), fatigue 6, bruit sourd. Force : (force + 0 à 15 + bonus de l'arme) / 2, au plus 100 (F312 simplifiée) |
| Lancer | Lancer | Lancer existant (doc 024) |
| Tir | Tirer | L'arc ou la fronde de la main d'action tire la munition de la main gauche : flèches pour les arcs, pierre pour la fronde. Énergie = énergie cinétique des deux ; perte par pas : celle de l'arme. Sans munition : « Pas de munitions », et l'action est quand même payée, comme dans DM |
| Sort | Boule de feu, Cracher, Invoquer | Projectile de sort (F327). Mana : 7 − min(6, niveau de la compétence) ; avec moins de mana, l'énergie baisse en proportion. Une charge en moins. Invoquer tire une boule de feu 3 fois sur 6 ; ses autres effets ne sont pas encore faits |
| Peur | Amort, Tranquilliser, Brandir, Sonner fort, Subjuguer | Le groupe en face fuit si sa résistance à la peur est inférieure à un tirage de 0 à (frayeur de l'action + niveau Influence − 1). La résistance 15 rend immunisé. Fuite de (16 − résistance) × 4 ticks |
| Lumière | Lumière | Lumière magique de puissance 2 pendant 2500 ticks, une charge en moins |
| Soin | Guérir | Tant qu'il manque des PV et qu'il reste du mana : min(manque, min(10, niveau Heal)) PV pour 2 points de mana (DM 1.1 et suivants) |
| Pile ou face | Pile ou face | « C'est face » ou « C'est pile » |
| Corde | Descendre | Descente dans la trappe ouverte en face, s'il n'y a pas de groupe au-dessus ; sinon rien, sans fatigue |
| Défense | Fendre, Frapper (boucliers) | Seulement l'endurance et la fatigue : DM ne fait rien d'autre de ces actions |
| En attente | Congeler, Aura magique, Pare-feu, Cage, Fusionner, Fenêtre, Éclair, Conjurer | « Pas encore implémenté », sans coût |

Combos des objets qui ne sont pas des armes : boucliers (Fendre, Frapper), Ven Potion et Ful Bomb (Lancer), pièces (Pile ou face), boîtes magiques (Congeler), corde (Descendre).

## 3. Code

- **`src/core/action-info.js` (nouveau) :** les 44 actions (`ACTIONS`), avec la sorte de chacune, et `parseCombo()`. Un combo s'écrit `'Swing Lightning:3*'` : `:n` donne le niveau minimum, `*` indique qu'une charge est requise.
- **`src/core/item-info.js` :**
  - les armes portent leur combo à la place de la liste des actions avec leurs dégâts ;
  - les combos des autres objets sont dans `OTHER_COMBOS` ;
  - les données de tir (arme, munition, dégâts de tir, perte par pas) sont dans `LAUNCHERS` et `AMMUNITION` ;
  - l'infobulle liste les actions en français, avec leurs dégâts et leur niveau minimum.
- **`src/sim/champion.js` :** expérience de départ (`experience`) et `skillLevel()`.
- **`src/sim/simulation.js` :**
  - `actions` donne les actions de la main d'action (F383) ;
  - `act(index)` exécute une action (F407) ; `attack()` fait la première frappe du combo ;
  - l'endurance coûte celle de l'action + 0 ou 1.
- **`src/sim/creatures.js` :** `frighten()`.
- **`src/sim/magic.js` :** `launchAction()` (sort à énergie donnée) ; `attackDoor()` est exportée, avec l'auteur du bris (`by`).
- **`src/main.js` :**
  - boutons d'action aux noms français de DM ;
  - un clic sur une créature fait la première frappe ;
  - le résultat s'affiche dans la zone d'action (dégâts ou nom de l'action) et dans la ligne d'état.

## 4. Vérifications

`tools/test-combat.mjs`, sections 7, 9 et 10 :

- **Actions affichées :**
  - main vide : Cogner, Coup de pied, Amort ;
  - Sword : Taillader, Parer (Entailler demande Club 3) ;
  - Flamitt : Taillader seulement (Boule de feu demande Fire 7) ;
  - Yew Staff : Parer, Lumière ;
  - pièce : Pile ou face.
- **Demi-fatigue** dans le vide et contre un mur. Taillader attaque une porte fermée (fatigue 6) ; Piquer la laisse intacte.
- **Tir :** sans flèche, puis avec une flèche en main gauche.
- **Lumière :** une charge en moins, rendue par « Recommencer ».
- **Guérir :** +10 PV pour 10 de mana.
- **Boule de feu,** avec Fire relevé dans le test : 1 de mana et une charge en moins.
- **Amort :** les Screamers sont immunisés, le Trolin finit par fuir.
- **Descendre** dans la trappe N3 (7, 4).
- **Vorpal Blade** contre un Ghost.
- **Navigateur :** les boutons « Cogner, Coup de pied, Amort » s'affichent ; Amort sans personne devant affiche son nom et « personne devant ».
- Les 9 tests Node passent.

## 5. Écarts et valeurs provisoires

- **Non modélisés :**
  - le modificateur de défense des actions ;
  - le gain d'expérience ;
  - les bonus d'objets aux compétences (Firestaff, amulettes) ;
  - le poids de l'arme dans la force (F312).
- **Provisoires :**
  - les dégâts des tirs : la munition, plus un quart de l'attaque de tir ;
  - le coût du lancer, que la table de DM laisse à 0 ;
  - la durée de la fuite, calculée en ticks plutôt qu'en déplacements.
- **Inchangé :** le clic sur une porte cassable avec une arme en main (doc 019) existe toujours, à côté des actions.
- **Dragon Spit :** la page des objets ne lui donne que Taillader. Le combo 34 (Taillader, Parer, Cracher) pourrait être le sien, à vérifier.
