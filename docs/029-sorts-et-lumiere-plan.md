# 029 — Sorts et lumière : plan de travail (phases G et H)

> Suite de [028-portes-animees.md](028-portes-animees.md). Demande de l'utilisateur : [012-simulation.md](012-simulation.md),
> sections « Système de sorts (phase G) » et « Gestion de la lumière (phase H) ».
> **Document de planification**, à lire au début de la session qui codera l'une des sous-phases.
> Rien n'est implémenté ici. Une sous-phase par session, dans l'ordre (voir § 4).
> Les questions du § 5 sont **tranchées** (réponses de l'utilisateur, 2026-10-28) et reportées dans les sous-phases.

## 1. Ce que dit le moteur original

Sources : la page *Spells* de la *Dungeon Master Encyclopaedia*, et ReDMCSB (`MENUS.C`, `INVNTORY.C`, `TIMELINE.C`,
`CHAMPION.C`, `MAIN.C`), voir [000-sources.md](000-sources.md).

### Les symboles

Un sort compte **2 à 4 symboles** : d'abord la **puissance**, puis 1 à 3 symboles qui désignent le sort.
Les symboles se choisissent dans l'ordre des 4 rangées, une rangée de 6 à chaque étape :

| Étape | Rangée | Symboles (1 à 6) |
|---|---|---|
| 1 | Puissance | Lo, Um, On, Ee, Pal, Mon |
| 2 | Élément | Ya, Vi, Oh, Ful, Des, Zo |
| 3 | Forme | Ven, Ew, Kath, Ir, Bro, Gor |
| 4 | Classe / alignement | Ku, Ros, Dain, Neta, Ra, Sar |

- **Codage du moteur :** le symbole `i` (0 à 5) de l'étape `s` (0 à 3) vaut `96 + 6s + i`.
  Le sort est cherché sur les symboles **sans la puissance** (`F409_MENUS_GetSpellFromSymbols`).
- **Après le 4e symbole,** la rangée des choix est vide : il ne reste qu'à lancer ou effacer.
- **La flèche** efface le dernier symbole (`F400_MENUS_DeleteChampionSymbol`).
- **Après un lancer,** la ligne est vidée, **sauf** si le sort échoue faute de flasque : on peut alors en prendre une et relancer.
- **Mana :** chaque symbole coûte du mana, au moment où on le choisit, selon la puissance.
  La table complète est sur la page de l'Encyclopaedia. Mise de côté pour l'instant (demande 3).

### Les sorts de DM

Les symboles sont donnés **sans la puissance**.

| Classe | Symboles | Sort | Genre | Retenu |
|---|---|---|---|---|
| Prêtre | Vi | Health Potion (Vi Potion) | potion | **oui** |
| Prêtre | Ya | Stamina Potion (Ma Potion) | potion | **oui** |
| Prêtre | Zo Bro Ra | Mana Potion (Ee Potion) | potion | **oui** |
| Prêtre | Ful Bro Ku | Strength Potion (Ku Potion) | potion | **oui** |
| Prêtre | Oh Bro Ros | Dexterity Potion (Ros Potion) | potion | **oui** |
| Prêtre | Ya Bro Dain | Wisdom Potion (Dane Potion) | potion | **oui** |
| Prêtre | Ya Bro Neta | Vitality Potion (Neta Potion) | potion | **oui** |
| Prêtre | Vi Bro | Cure Poison Potion (Bro Potion) | potion | **oui** |
| Prêtre | Ya Bro | Shield Potion (Ya Potion) | potion | **oui** |
| Prêtre | Ful Bro Neta | Fire Shield | autre | non |
| Prêtre | Ya Ir | Party Shield | autre | non |
| Prêtre | Des Ir Sar | Darkness | autre | non |
| Magicien | Ful | **Torch** | autre (lumière) | **oui** |
| Magicien | Oh Ir Ra | Light | autre (lumière) | non (phase H, plus tard) |
| Magicien | Zo | **Open Door** | projectile | **oui** |
| Magicien | Ful Ir | **Fireball** | projectile | **oui** |
| Magicien | Zo Ven | Poison Potion (Ven Potion) | potion | **oui** (Q1) |
| Magicien | Ya Bro Ros | Magic Footprints | autre | non |
| Magicien | Oh Ew Ra | See Through Walls | autre | non |
| Magicien | Oh Ew Sar | Invisibility | autre | non |
| Magicien | Des Ven | Poison Bolt | projectile | non |
| Magicien | Oh Ven | Poison Cloud | projectile | non |
| Magicien | Des Ew | Weaken Nonmaterial Beings | projectile | non |
| Magicien | Oh Kath Ra | Lightning Bolt | projectile | non |
| Magicien | Zo Kath Ra | Zokathra | autre | non |

Les symboles Gor ne servent qu'aux sorts de carte magique de CSB. Ces sorts n'existent pas dans DM.

**Tous les sorts sont reconnus**, retenus ou non. Un sort reconnu mais non retenu affiche son nom, avec la mention « pas encore implémenté ».

### Le lancer (`F412_MENUS_GetChampionSpellCastResult`)

Le moteur fait, dans l'ordre :

1. **Sort inconnu :** « ZED MUMBLES A MEANINGLESS SPELL. » Demande de l'utilisateur : « Zed a prononcé un sort incompréhensible ».
2. **Test de compétence :** pour chaque niveau qui manque au champion, un tirage contre la sagesse. En cas d'échec : « NEEDS MORE PRACTICE WITH THIS … SPELL ». Voir Q2.
3. **Effet, selon le genre :**
   - **Potion :** il faut une **flasque vide** en main d'action, sinon en main de réserve. Sinon : « NEEDS AN EMPTY FLASK IN HAND », et les symboles restent.
     La flasque devient la potion du sort, de puissance `random(16) + 40 × puissance` (1 à 6).
   - **Projectile :** il part de devant le groupe, dans sa direction.
     Énergie : `borne(21, (puissance + 2) × (4 + 2 × compétence), 255)`. Open Door compte une compétence doublée.
   - **Torch :** une puissance de lumière `p + 2` (p = puissance du sort, 1 à 6), ajoutée à la lumière magique du groupe pendant `2000 + ((4(p+1) − 3) << 7)` ticks,
     puis décroissance d'un cran tous les 4 ticks (`F257_TIMELINE_ProcessEvent70_Light`).
4. **Expérience** dans la compétence du sort, puis **fatigue** : la main d'action est indisponible pendant la durée propre au sort.

### La lumière (`F337_INVENTORY_SetDungeonViewPalette`)

- **Niveau de difficulté 0** (le niveau 0, le Hall) : toujours la palette la plus claire. Cela confirme la demande « sauf niveau 0 ».
- **Ailleurs,** la lumière totale est la somme de deux termes :
  - les **torches en main** des champions. Puissance = nombre de charges, de 0 à 15. On prend la plus forte à 100 %, la suivante à 50 %, puis 25 %, 12 %, 6 % ;
  - la **lumière magique** du groupe : sorts Torch et Light, Illumulet, actions « Light » de certains bâtons.
- La puissance se convertit en quantité de lumière par la table `LightPowerToLightAmount[16]`.
  La quantité totale choisit l'une des **6 palettes**, de la plus claire au noir complet.
  Les deux tables sont dans `graphics.dat` (item 562), pas dans le code. Valeurs à confirmer : la source la plus simple est le moteur DM de ScummVM.
- **Usure :** tous les **512 ticks**, chaque torche en main perd une charge. Avec un tick de 1/6 s, cela fait environ 85 s par charge, et environ 21 min pour une torche neuve à 15 charges. Une torche à 0 charge est consumée.
- **Allumage :** une torche s'allume quand on la met en main.
- **Torches murales :** dans DM, ce ne sont que des décors (« Full Torch Holder »). Elles **n'éclairent pas**. Ici, elles deviennent des sources de lumière : c'est un écart à l'original, voulu par la demande.

Dans DM, la lumière est une **palette globale** de la vue. Ici, elle devient un **éclairage Three.js** :
des sources ponctuelles, de la portée et des ombres. La quantité de lumière du moteur reste le modèle de la simulation.
Le rendu la traduit en intensités.

## 2. Ce qui existe et servira

| Besoin | Existant |
|---|---|
| Mains du champion | `state.hands[0]` (main de réserve), `state.hands[1]` (main d'action), `state.hand` (curseur), doc 024 |
| Fatigue | `champion.readyAt` et le délai des actions (doc 024) |
| Compétences, sagesse, mana | fiche de Zed, `src/sim/champion.js` (doc 023) |
| Projectiles | `src/sim/projectiles.js` : pas, collisions avec les groupes, chute, rendu en cubes |
| Portes | crans, `button` (72 portes sur 170), `fireball` (12 portes cassables par boule de feu), doc 028 et `dungeon.json` |
| Objets | `potions` (56, dont les flasques vides, type 20), `weapons` (torches type 2, `charges` 15), `scrolls` (35, `text`) |
| Infos des objets | `src/core/item-info.js` (poids, actions) |
| Textes des parchemins | `buildTexts()`, `src/core/texts.js` (doc 010) |
| Panneau du champion | `src/ui/champion-panel.js`, en haut à gauche de la vue |
| Infobulle | `src/ui/tooltip.js`, `labelOf` dans `fp-renderer.js` |
| Éclairage actuel | `fp-renderer.js` : `HemisphereLight` uniforme, `PointLight` attachée à la caméra, `Fog(fogNear 2.5, fogFar 3.5)` |
| Décor des porte-torches | `ornament-art.js` : `Empty Torch Holder` et `Full Torch Holder` |
| Réglages | `src/ui/control-panel.js`, `src/ui/preferences.js` |

## 3. Les sous-phases

### G1 — Panneau de sorts et reconnaissance

> **Faite :** voir [030-sorts-phase-g1.md](030-sorts-phase-g1.md).

**Objectif :** composer un sort au clic et savoir lequel c'est. Aucun effet.

- **Simulation,** nouveau `src/sim/spells.js`, sans DOM :
  - table `SPELLS` : symboles, nom, classe, genre, compétence, difficulté, fatigue, coût en mana.
    Compétence, difficulté et coût en mana sont **stockés mais pas utilisés** : le sort réussit toujours, sans expérience (Q2). Ils serviront avec C3c ;
  - `champion.symbols` (0 à 4 symboles), `addSymbol(i)`, `deleteSymbol()`, `cast()` ;
  - `cast()` émet `spellCast { spell | null, reason }` et vide la ligne.
- **Données du moteur,** nouveau `src/core/spell-info.js` : la table du § 1, avec sa source, comme `creature-info.js`.
- **UI,** nouveau `src/ui/spell-panel.js`, **à droite du cadre de Zed** (image de référence `assets/spells-ui.png`) :
  - un onglet au nom du champion ;
  - la rangée des 6 symboles de l'étape courante ;
  - la ligne du sort composé, cliquable pour lancer ;
  - la flèche d'effacement.
- **Glyphes (Q4) :** les icônes Atari ST de l'Encyclopaedia, 7 × 7 pixels, une par symbole :
  `http://dmweb.free.fr/files/Game,Dungeon_Master,Atari_ST,Symbol,<Nom>,Screenshot.png` (`<Nom>` = Lo, Um… ; URL vérifiée pour Lo, Mon, Ya, Zo, Ven, Gor, Ku, Sar).
  - Les 24 PNG sont téléchargés une fois par un script (`tools/`), puis convertis en données (masque 7 × 7 par symbole, dans `src/core/spell-info.js` ou un fichier voisin).
  - Le panneau les dessine agrandis en pixels nets (`image-rendering: pixelated`, ou SVG de carrés), dans la couleur du thème.
  - Vérifier l'orthographe exacte de chaque nom dans l'URL (Dain ou Dane…). Ajouter l'Encyclopaedia aux sources (doc 000).
- **Infobulle d'un symbole :** toujours son nom (« Ful »). Les sorts connus sont listés à part, dans le grimoire (G4).
- **Retour :** le nom du sort dans la zone de messages, ou « Zed a prononcé un sort incompréhensible ».
- **Clavier (proposition) :** aucun pour l'instant. Les touches libres sont rares (doc 012 § 5).
- **Test Node :** `tools/test-spells.mjs`. On y vérifie la composition, l'effacement, la reconnaissance des 25 sorts, la puissance ignorée et la ligne vidée.
- **Critère de fin :** « Lo Ful » affiche « Torch », « Lo Ya Ven » affiche le sort incompréhensible.

### G2 — Conditions et potions

> **Faite :** voir [031-sorts-phase-g2.md](031-sorts-phase-g2.md).

**Objectif :** les sorts de potion remplissent une flasque, et on peut boire les potions.
Toutes les potions de la table du § 1 : celles du prêtre, plus Poison Potion (Zo Ven) du magicien (Q1).

- **Condition :** une flasque vide en main d'action, sinon en main de réserve (ordre du moteur).
  Sinon « Zed a besoin d'une flasque vide en main », et les symboles restent.
- **Effet :** la flasque change de type et de nom (Vi Potion…), avec la puissance `random(16) + 40 × p`. Le poids suit `item-info.js`.
- **Réussite :** toujours, sans test de compétence ni expérience (Q2).
- **Fatigue :** gardée. La main d'action est bloquée pendant la durée du sort, comme pour les autres actions.
- **Mana :** ignoré, mais on décompte déjà le coût si c'est gratuit à faire. Le panneau pourra griser les symboles trop chers plus tard.
- **Boire une potion (Q3) :** la potion devient une flasque vide (comme dans `F349_INVENTORY_ProcessCommand70_ClickOnMouth`, `INVNTORY.C`).
  - Effets codés : Vi = santé, Ma (Mon) = endurance, Ee = mana, avec les formules de `F349`. Les autres potions se boivent sans effet, avec un message « pas encore implémenté ».
  - Geste proposé : clic sur le cadre de Zed avec la potion au curseur. À confirmer en début de session si le cadre a déjà un rôle au clic.
- **Test Node :** flasque en main d'action ou de réserve, pas de flasque, puissance bornée, Zo Ven, boire une Vi Potion.
- **Critère de fin :** avec une flasque vide en main, « On Vi » donne une Vi Potion. Sans flasque, le message s'affiche et les symboles restent.

### G3 — Sorts de magicien : Open Door, Fireball, Torch

> **Faite :** voir [033-sorts-phase-g3.md](033-sorts-phase-g3.md).

**Objectif :** les trois sorts retenus agissent dans le donjon.

- **Projectiles magiques** dans `projectiles.js` : un projectile peut porter un **sort** au lieu d'un objet.
  - Énergie du § 1. Elle fixe la portée, et les dégâts de la boule de feu.
  - Rendu : une sphère lumineuse orange pour Fireball, bleue pour Open Door. Pas de cube.
- **Open Door :** à l'impact sur une porte qui a un **bouton** (`button: true`), on l'actionne comme son bouton (`toggle`). Sur une autre porte ou un mur, rien.
  À vérifier dans `PROJEXPL.C`.
- **Fireball :** explosion à l'impact (case et sous-case) :
  - dégâts aux créatures de la case (formule de `PROJEXPL.C`, sinon provisoire, marquée) ;
  - une porte `fireball: true` est détruite (12 portes) ;
  - le groupe est blessé s'il est sur la case de l'explosion.
- **Torch :** ajoute `party.magicalLight`, avec une durée et une décroissance par crans (événements de `clock.js`, § 1).
  Le modèle de lumière existe déjà (H1 est faite avant G3) : le sort Torch y ajoute sa lumière magique. Elle ne se voit qu'avec H2.
- **Test Node :** portée d'un projectile, porte à bouton ouverte puis refermée, porte cassable détruite, durée de la lumière magique.
- **Critère de fin :** au niveau 1, « Lo Zo » face à la porte (1, 0) l'ouvre.

### G4 — Parchemins et infobulles

> **Faite :** voir [034-sorts-phase-g4.md](034-sorts-phase-g4.md).

**Objectif :** les parchemins font connaître les sorts, et les objets en main se décrivent.

- **Grimoire :** quand le groupe ramasse un parchemin, on garde son texte dans `state.knownScrolls`.
  - Les sorts mentionnés deviennent « connus » (correspondance texte ↔ sort à établir à la main, avec les emplacements de l'Encyclopaedia).
  - Une liste des sorts connus s'ouvre depuis le panneau de sorts.
- **Infobulle de l'objet en main** (curseur ou mains) :
  - parchemin : son texte complet ;
  - potion : type et puissance ;
  - torche : charges restantes, allumée ou non ;
  - arme : poids, actions et dégâts (`item-info.js`) ;
  - autre objet : ce que les données directes contiennent (charges, empoisonné, maudit, cassé).
- **Critère de fin :** ramasser le parchemin de la case (4, 15) du niveau 0 fait apparaître Torch dans le grimoire. Le survol de ce parchemin en main affiche son texte.

### H1 — Modèle de lumière dans la simulation

> **Faite :** voir [032-lumiere-phase-h1.md](032-lumiere-phase-h1.md).

**Objectif :** la simulation sait combien il y a de lumière et quelles torches brûlent. Pas encore de rendu.

- **Nouveau `src/sim/light.js`, sans DOM :**
  - `lightAmount(state)` : 100 % au niveau 0 (difficulté 0), sinon torches en main (pondération du § 1) plus `magicalLight` ;
  - `magicalLight` : la lumière des sorts, avec sa durée et sa décroissance par crans (`F257_TIMELINE_ProcessEvent70_Light`), prête pour le sort Torch de G3 ;
  - les tables `LightPowerToLightAmount` et `PaletteIndexToLightAmount`, à confirmer (§ 1) ;
  - usure des torches tous les 512 ticks, en main de réserve et en main d'action seulement.
    Comme dans DM, une torche tenue au curseur n'éclaire pas et ne s'use pas (Q5). Cela remplace la demande de la doc 012.
- **État des torches :** `lit`, `charges` sur l'objet, avec un nom ou un aspect « consumée » à 0.
- **Événement** `lightChanged { amount, sources }` pour les vues.
- **Test Node :** niveau 0 éclairé, une torche à 15 charges, usure après 512 ticks, deux torches pondérées, torche au curseur sans effet, décroissance de la lumière magique.
- **Critère de fin :** les tests passent. Le panneau de debug affiche la lumière courante.

### H2 — Rendu : torches, ombres, scintillement

> **Faite :** voir [035-lumiere-phase-h2.md](035-lumiere-phase-h2.md).

**Objectif :** la vue à la première personne est éclairée par les torches.

- **Lumière globale :** `HemisphereLight` à `amount × réglage global`. Au niveau 0, elle reste pleine.
- **Torche du groupe :**
  - une `PointLight` rattachée au groupe, à hauteur de main, un peu à gauche ou à droite selon la main ;
  - portée = **réglage « portée des torches »**, par défaut l'équivalent de `fogFar` (3,5 cases) ;
  - intensité selon les charges (`LightPowerToLightAmount`).
- **Lumière magique (Q7) :** une seconde lumière **centrée sur le groupe**, plus large, sans scintillement. Elle remplace l'idée d'une lumière ambiante.
- **Torches murales :** une `PointLight` devant chaque « Full Torch Holder » **du niveau courant**, qui disparaît quand on prend la torche.
- **Ombres :**
  - les murs, les portes, les objets et les créatures projettent des ombres (`castShadow`, `receiveShadow`, compatibles avec les `InstancedMesh`) ;
  - une `PointLight` avec ombre coûte **6 rendus** (carte cubique). Il faut donc un **budget** : la torche du groupe et les N porte-torches les plus proches (N = 2 au départ, réglable), les autres sans ombre ou éteintes au-delà de la portée (Q6).
- **Scintillement :** un bruit lent sur l'intensité (±10 %) et un léger déplacement de la source. Option dans les réglages.
- **Plafond et sol** : ils doivent recevoir les ombres, et le noir hors portée remplace le brouillard.
- **Critère de fin :**
  - au niveau 1 sans torche, la vue est noire (lumière globale à 0) ;
  - une torche en main éclaire autour du groupe, avec des ombres ;
  - un porte-torche éclaire son couloir ;
  - au-delà de 60 images par seconde sur la machine de test.

### H3 — Réglages et finitions

> **Faite :** voir [036-lumiere-phase-h3.md](036-lumiere-phase-h3.md).

- **Panneau de configuration** (`control-panel.js`, valeurs gardées par `preferences.js`) :
  - slider **lumière globale**, de 0 à 100 % : elle s'ajoute au modèle, 0 = fidèle à DM ;
  - slider **portée des torches**, autour de `fogFar`, par exemple de 1,5 à 8 cases ;
  - cases à cocher : **brouillard**, **scintillement**, **ombres**.
- **Relief des textures (optionnel) :** une normal map calculée depuis les textures procédurales (luminance → hauteur → Sobel). On ne la calcule qu'une fois par texture, et on la règle faible (`normalScale` ≈ 0,3). Une case à cocher pour comparer.
- **Vues 2D et 3D :** inchangées. La lumière ne concerne que la première personne.

## 4. Ordre retenu

**G1 → G2 → H1 → G3 → G4 → H2 → H3.**

H1 est faite juste après G2 : le sort Torch de G3 tombe directement dans le modèle de lumière, sans indicateur de debug à coder puis jeter.

Les valeurs reprises sans vérification restent **provisoires** et sont marquées, comme dans les docs précédentes : les tables de lumière et les dégâts de la boule de feu.

## 5. Questions (tranchées)

1. **Poison Potion (Zo Ven)** est un sort de **magicien** qui crée une potion. Faut-il l'inclure aux potions de G2, ou rester à « prêtre : potions uniquement » ?
2. **Test de compétence et expérience :** on les ignore, et le sort réussit toujours (en attendant C3c) ? Ou on applique déjà le tirage du moteur (§ 1, point 2) avec les compétences de Zed ?
   Je propose de réussir toujours, mais de garder la fatigue.
3. **Boire les potions créées :** hors périmètre, ou effets simples dès G2 ? Les effets simples seraient : Vi = santé, Ma = endurance, Ee = mana, Ku / Ros / Dane / Neta = bonus temporaire, Bro = antidote, Ya = bouclier.
   Je propose : boire la potion, avec les effets santé, endurance et mana seulement, et la flasque redevient vide.
4. **Glyphes des symboles :** SVG redessinés d'après l'image, ou extraits de la police de `graphics.dat` (sources de doc 018) ? L'extraction est plus fidèle, mais plus longue.
5. **Torche tenue au curseur** : elle éclaire, comme le demande la doc 012. Dans DM, elle n'éclaire pas, et ne s'use pas non plus. Doit-elle s'user ?
6. **Porte-torches :** combien éclairent en même temps avec des ombres ? Je propose 2 avec ombre, et tous ceux de la portée sans ombre. À ajuster selon les performances.
7. **Lumière globale « venue des sorts de lumière, plus tard » :** la lumière magique (Torch, et plus tard Light) passe-t-elle par la lumière globale (ambiante), ou par une source centrée sur le groupe ? Je propose une source centrée sur le groupe, plus large que la torche : c'est plus lisible en 3D.

### Réponses aux questions :

1. on inclut la potion du magicien
2. on ignore compétence et expérience, mais stocker leurs statistiques dans les tables de calcul. réussir toujours et garder la fatigue, OK.
3. Ok pour boire la potion
4. le SVG de la capture n'est pas complet, tu dois pouvoir télécharger et/ou extraire les icones de l'atari ST ici http://dmweb.free.fr/files/Game,Dungeon_Master,Atari_ST,Symbol,Lo,Screenshot.png en remplaçant le nom du symbole "Lo" ? format 7x7 pixels
5. oublie ma suggestion pour la torche tenue en main, on garde le fonctionnement de DM
6. je te suis pour les portes-torches
7. OK pour une lumière globale centrée sur le groupe au lieu de ambiante

pour l'ordre proposé (point 4) on peut traiter H1 juste après H2 en effet *(précisé ensuite : juste après **G2**)*

annexe symbole : tooltip sur symbole = afficher le nom du symbole, à moins que le grimoire n'indique déjà les deux