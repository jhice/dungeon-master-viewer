# Dungeon Master clone 3D

## Objectifs

- Visualisateur 3D du jeu Dungeon Master sorti en 1989 (environ).
- Evoluer peut-être par la suite vers un jeu jouable.

## Données

- le fichier `Dungeon.xml` contient toutes les données du jeu (pas le moteur).

## Premières étapes possibles

Analyser le fichier XML en se concentrant d'abord sur

- la structure complète du format
  - si tu penses à un format de stockage plus souple que le XML dis-moi (JSON, autre, aucun ?)
- les 14 niveaux/maps
- un rendu ASCII des 14 niveaux
  - utiliser l'offset de chaque niveau : certains "pits" ou "stairs" doivent se superposer correctement
  - important : dans un premier temps ne rendre que les types de tuiles (wall, teleporter, door, etc.), pas leur contenu.
- idéalement, le moteur de rendu est interchangeable
  - ASCII
  - 2D (sprites)
  - 3D (modèles)
- vue des niveaux
  - 2D : niveau vue de dessus, on peut passer d'un niveau à l'autre au clavier
  - 3D : on voit les 14 niveaux superposés, au centre, avec une caméra orbitale et un zoom (voir technos ci-dessous)

## Technos

- HTML
- CSS
- JS
  - sous forme de modules ES6
  - on découpe les fichiers selon leur fonctionnalité
  - 2D : le DOM avec CSS
  - 3D : Three.js

## Etat du projet

> Mis à jour le 2026-10-29, après la doc 041.

### Données et visualiseur

- **Données :** le modèle `data/dungeon.json` est généré par `npm run build:data` (format : doc 002).
- **Renderers :** leur contrat est dans `src/render/renderer.js`. Il y en a trois : ASCII (outil en ligne de commande), 2D (DOM/CSS), 3D (Three.js).
  - La 2D affiche les coordonnées locales, et globales en repère global, sur les bords (doc 027).
- **Logique du donjon :** le graphe des actuators, `buildLogic()` dans `src/core/logic.js`, est décrit dans la doc 009.
- **Docs :** toutes les docs sont dans `docs/`. À lire en priorité : 009 (logique) et 002 (format JSON) ; les sources sont dans 000.

### Simulation (`src/sim/`, sans DOM, testable dans Node)

- **Mécanique du donjon, phases A à E (docs 013 à 017) :**
  - déplacement ;
  - escaliers, trappes, téléporteurs ;
  - actuators, textes ;
  - objets.
- **Vue à la première personne :** `src/render/first-person/`, avec les décors dessinés dans `ornament-art.js` (doc 018).
  - Les téléporteurs y sont des cubes translucides, visibles de l'intérieur (doc 024).
  - Murs pleins autour de la carte, textures inversées une case sur deux, trous au plafond sous les trappes du dessus (doc 027).
- **Main, inventaire, coffres, portes cassables (doc 019).** Le curseur (`state.hand`) tient un objet ; clic droit dans la vue : le ranger.
- **Créatures (plan : doc 020) :**
  - C1, déplacement, plaques, générateurs (doc 021) ;
  - C2, perception et poursuite, `perception.js` (doc 022) ;
  - C4, butin des espèces, peur et fuite, Giggler voleur (doc 025).
  - Seules les créatures du niveau du groupe sont actives.
- **Champion et combat :**
  - C3a (doc 023) :
    - un seul champion, **Zed, Duke of Banville**, pris dans sa fiche du Hall (`champion.js`) ;
    - son cadre en haut à gauche de la vue (`src/ui/champion-panel.js`) ;
    - « Frapper » ;
    - attaques des créatures, mort des deux côtés.
  - Mains, panneau d'actions et lancer (doc 024) :
    - les deux mains de Zed et un panneau d'actions par objet, avec délai de fatigue ;
    - lancer de tout objet et moteur de projectiles (`projectiles.js`) ;
    - caractéristiques des objets dans `src/core/item-info.js`.
- **Données du moteur reconstituées** depuis la *Dungeon Master Encyclopaedia* :
  - `creature-info.js` (espèces) ;
  - `item-info.js` (objets) ;
  - `creature-drops.js` (butin) ;
  - `spell-info.js` (sorts) ;
  - résistance au feu des espèces (`creature-info.js`, doc 033).
- **Timeline fidèle à ReDMCSB (doc 026) :** les événements d'une même case au même tick fusionnent ; compteurs : `set` incrémente, `clear` décrémente.
- **Portes animées (doc 028) :** crans 0 à 4, un par tick ; le groupe passe jusqu'à 1/4, une créature jusqu'à sa hauteur ; une porte qui se ferme sur quelqu'un remonte et le blesse ; bouton sur un montant fixe.
- **Sorts, G1 (doc 030) :** panneau de sorts à droite du cadre de Zed (`src/ui/spell-panel.js`), glyphes Atari ST (`spell-glyphs.js`), 25 sorts reconnus (`spell-info.js`, `src/sim/spells.js`), sans effet sauf la fatigue.
- **Sorts, G2 (doc 031) :** les sorts de potion remplissent une flasque vide en main (`src/sim/potions.js`) ; clic sur le cadre de Zed avec une potion au curseur : la boire (santé, endurance, mana).
- **Lumière, H1 (doc 032) :** modèle sans rendu (`src/sim/light.js`) : niveau 0 toujours éclairé, torches en main pondérées et usées tous les 512 ticks, lumière magique par crans ; affichée dans la ligne d'état du jeu.
- **Sorts, G3 (doc 033) :** Open Door et Fireball en projectiles magiques (`src/sim/magic.js`, `projectiles.js`) : porte à bouton actionnée, porte cassée, créatures et groupe brûlés ; Torch ajoute de la lumière magique.
- **Sorts, G4 (doc 034) :** grimoire des parchemins tenus (`src/sim/grimoire.js`, sorts reconnus dans le texte) ; infobulles détaillées des objets tenus (`itemDetails`, `item-info.js`).
- **Lumière, H2 et H3 (docs 035, 036) :** remplacées par la refonte de la doc 037.
- **Lumière, refonte (doc 037) :** dans `src/render/first-person/fp-lights.js`, toutes les lumières sont blanches et sans ombre.
  - Une `PointLight` portée par le groupe ; la palette de DM (0 à 5) donne un ratio par paliers, qui module son intensité et sa portée.
  - Les porte-torches ont une `PointLight` chacun (option, écart avec DM).
  - Panneau « Lumière (vue du jeu) » : intensité, portée, atténuation, lumière permanente, torches murales lumineuses ; défauts dans `lighting-settings.js`.
  - Plus d'ombres, de scintillement, de brouillard, de relief ni de lumière hémisphérique.
- **Lumière arrêtée par les murs (doc 038) :** option du panneau (`occlusion`, `fp-occlusion.js`). Un masque par case et par lumière, calculé par rayons sur la grille, est lu par le shader des matériaux Lambert de la vue.
- **Tests Node :** `node tools/test-creatures.mjs`, `node tools/test-combat.mjs`, `node tools/test-loot.mjs`, `node tools/test-logic.mjs`, `node tools/test-doors.mjs`, `node tools/test-spells.mjs`, `node tools/test-light.mjs`, `node tools/test-magic.mjs`.

### En attente

- **C3b** (projectiles muraux, sorts des créatures) et **C3c** (fidélité du combat : vraies formules, actions des combos, expérience, armures, cri de guerre) : mises de côté **en attendant le système de sorts du groupe**.
- **Valeurs provisoires**, à confirmer dans ReDMCSB :
  - formules de dégâts et de toucher ;
  - portée et dégâts des objets lancés ;
  - peur et durée de fuite ;
  - régénération ;
  - délai d'errance.
  
  Chaque doc les signale.
- **Phase F de la simulation** (doc 012) : transitions animées, 16/9, sauvegarde de partie.
- **Sons (docs 039 à 041) :** inventaire (doc 040) : 33 sons d'Amiga 3.6, déclencheurs pris dans ReDMCSB. Plan (doc 041) : événement `sound` de la simulation, module `src/audio/` en Web Audio API (Howler en réserve), volume linéaire selon la distance de Manhattan, stéréo, un son par tick, 4 voix. Fichiers : l'utilisateur choisit la source.
- **Phases G (sorts) et H (lumière)** : planifiées dans la doc 029, questions tranchées. Ordre : G1 (faite, doc 030), G2 (faite, doc 031), H1 (faite, doc 032), G3 (faite, doc 033), G4 (faite, doc 034), H2 (faite, doc 035), H3 (faite, doc 036), puis la refonte de la lumière (docs 037, 038).

## Simulation

@docs/012-simulation.md

## Workflow

- résume toutes tes analyses suite à nos échanges dans un dossier `docs/` avec un préfixe 001, 002, 003.
- lister toutes les sources (lien et description, pas d'extraits de code) que tu as utilisé
- si l'extension Claude Chrome n'est pas connecté, j'ai en général un serveur qui tourne ici : http://127.0.0.1:5500/index.html
- commiter après chaque étape
