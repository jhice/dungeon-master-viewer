# 023 — Combat, phase C3a : Zed, « Frapper » et attaques des créatures

> Suite de [020-creatures-plan.md](020-creatures-plan.md), phase C3, après [022-creatures-phase-c2.md](022-creatures-phase-c2.md).
> La phase C3 est découpée en trois sous-phases (§ 6). Celle-ci est la première.

## 1. Décisions de début de phase

| Question (doc 020, § 4) | Réponse de l'utilisateur |
|---|---|
| Q4, le groupe | **Un mélange des options A et B :** un seul champion, **Zed, Duke of Banville**, avec ses vraies caractéristiques. La logique de champion est en place, avec un personnage par défaut |
| Q5, interface de combat | **Un seul coup pour commencer, « Frapper ».** Le cadre du champion est placé comme dans l'original, dans la vue Three.js, en haut à gauche |

Zed est **pris tel que sa fiche le décrit**, c'est-à-dire ressuscité. Dans DM, la réincarnation remet les compétences à zéro et modifie un peu les caractéristiques. Ses règles exactes ne sont pas documentées ici, à voir plus tard si besoin.

## 2. Le champion (`src/sim/champion.js`)

Zed vient de sa fiche du Hall des champions, un texte du niveau 0 décodé par `decodeChampion()` (doc 010).

| Valeur | Zed | Remarque |
|---|---|---|
| Santé | 60 | |
| Endurance | 60 | Stockée × 10 (600), comme dans le moteur (Encyclopaedia, *Skills and Statistics*) |
| Mana | 10 | Inutilisée pour l'instant |
| Chance, Force, Dextérité, Sagesse, Vitalité, Anti-magie, Anti-feu | 58, 40, 40, 40, 50, 40, 40 | |
| Compétences cachées | Swing 2, Parry 2, Steal 2, Throw 2, Heal 2, Air 2, les autres à 1 | Gardées pour C3c |

- **Ses objets :** ceux qui sont posés sur son miroir, N0 (10, 6), passent dans l'inventaire au départ : Torch, Mail Aketon, Blue Pants, Hosen. Le miroir est retrouvé par l'actuator « Champion portrait » (type 127) qui porte son nom.
- **Régénération (provisoire) :**
  - endurance : 1 point stocké par tick, soit 0,6 point affiché par seconde ;
  - santé : 1 point toutes les 5 s ;
  - mana : 1 point toutes les 10 s.
  
  Dans DM, elle dépend de la vitalité, de la sagesse, de la nourriture et de l'eau (C3c).

## 3. Combat (`src/sim/combat.js`)

### Ce que dit la documentation

- *Actions and Combos* donne l'action 12, **« Hit »**, qui s'appelle **« Frapper »** dans la version française :
  - compétence Fight ;
  - endurance 3 ;
  - probabilité de toucher 20 ;
  - dégâts 20/32 ;
  - fatigue 4 ticks.
- La même page indique qu'une attaque touche si **l'un de trois tests** réussit :
  - un test de dextérité entre le champion et la créature ;
  - une chance sur 4 ;
  - un test de chance fondé sur la probabilité de l'action (75 = touche toujours).
- *Creature Details* :
  - **les créatures immatérielles ignorent les attaques normales** : Ghost, Materializer, Black Flame, Water Elemental. Seule l'action Disrupt les blesse ;
  - colonnes reprises : Attack Ticks, Defense, Attack, Dexterity.
- *Attacks and Defenses* donne le type d'attaque de chaque espèce et la caractéristique du champion qui s'y oppose :

| Type | Espèces (exemples) | Défense du champion |
|---|---|---|
| Blunt | Trolin, Mummy, Stone Golem, Demon | Vitalité (et armure, C3c) |
| Sharp | Skeleton, Rockpile, Magenta Worm, Red Dragon | Vitalité (et armure tranchante, C3c) |
| Mental | Screamer, Ghost | Sagesse |
| Magic | Wizard Eye, Vexirk, Lord Chaos | Anti-magie |
| Fire | Black Flame | Anti-feu |

- Le Giggler n'attaque jamais : il vole des objets, un comportement codé en dur (C4).

### Formules provisoires

Les formules exactes du moteur ne sont pas dans l'Encyclopaedia. Celles-ci en reprennent la structure, avec les valeurs documentées, et sont **à remplacer en C3c** par celles de ReDMCSB.

- **Coup de Zed :**
  - touche si `aléa(dextérité Zed + dextérité créature + 1) ≥ dextérité créature`, ou une chance sur 4, ou `aléa(75) < 20 + chance / 16` ;
  - dégâts : `(force + aléa(force / 2 + 1)) × 20 / 32 − aléa(défense / 2 + 1)`. S'ils sont ≤ 0, c'est raté ;
  - le coup frappe **un membre au hasard** du groupe.
- **Coup d'une créature :**
  - touche si `aléa(dextérité créature + dextérité Zed + 1) ≥ dextérité Zed`, ou une chance sur 4 ;
  - dégâts : `attaque / 4 + aléa(attaque / 4 + 1) − aléa(défense / 8 + 1)`, au moins 1.

Ordres de grandeur : Zed fait 22 à 38 points de dégâts à un Screamer (défense 5), et 11 à 38 à un Trolin (défense 28). Un Trolin (attaque 25) lui en fait 1 à 12.

### Rythme

- **Zed :** un coup, puis 4 ticks de fatigue (le bouton « Frapper » grisé). Il faut au moins 3 points d'endurance stockés, sinon « Trop fatigué ».
- **Créatures :** au contact et **face au groupe**, un groupe attaque toutes les `attackTicks` de l'espèce (Trolin 8, Mummy 12, Screamer 10…). Un seul membre attaque à chaque fois.
  - Sinon, il se tourne d'abord.
  - Une espèce immobile (Black Flame) attaque quelle que soit son orientation.
- **Riposte :** une créature frappée remarque le groupe et agit au tick suivant, même si elle errait ou tournait le dos.

## 4. Mort

- **D'une créature :**
  - elle disparaît du groupe ;
  - à la mort de la dernière, le groupe disparaît, sa plaque se relâche, et **ses possessions tombent sur sa case** ;
  - ces objets suivent ensuite les trappes et les téléporteurs, comme les autres.
  - C'était prévu en C4 : c'est fait dès maintenant, car le critère de C3 (« tuer un Screamer ») en a besoin. Le butin propre à chaque espèce (os…) reste pour C4.
- **De Zed :**
  - le jeu s'arrête : plus de déplacement, de coup ni de clic ;
  - les créatures l'ignorent et reprennent l'errance ;
  - un voile rouge couvre la vue, avec « ZED EST MORT » et un bouton **« Recommencer »**, qui fait la même chose que ⟲.

## 5. Interface

- **Cadre de Zed** (`src/ui/champion-panel.js`), en haut à gauche de la vue, comme dans DM :
  - son nom ;
  - ses deux mains (l'objet en main est dans la main d'action) ;
  - trois barres verticales : santé, endurance, mana (couleur du premier emplacement). Les valeurs s'affichent au survol.
  - Il suit la largeur de la fenêtre (unités `cqw`).
- **Action « Frapper »** sous le cadre. Après un coup, elle affiche **les dégâts infligés** ou « Raté » / « Sans effet » pendant un instant, comme la zone d'action de DM.
- **Frapper :**
  - le bouton ;
  - **Espace** ;
  - un **clic sur la créature** dans la vue.
  - Espace et le clic actionnent un mur quand aucune créature n'est en face.
- **Coup reçu :** le cadre se couvre de rouge avec le nombre de points perdus.
- **Barre d'état :** « Screamer tué », « Screamer : groupe anéanti », « Ghost : immatériel, les coups le traversent », « ZED est mort, tué par Trolin ».

## 6. Découpage de la phase C3

| Sous-phase | Contenu | État |
|---|---|---|
| **C3a** | Zed, son cadre, « Frapper », attaques des créatures au contact, mort des deux côtés, possessions qui tombent | **Faite** (ce document) |
| C3b | **Projectiles :** lanceurs muraux (17 actuators), sorts des créatures (Vexirk, Wizard Eye…), boules de feu qui cassent les portes `fireball` | À faire |
| C3c | **Fidélité :** formules de ReDMCSB, actions de chaque objet (combos : Swing, Chop, Thrust…), armes et armures, expérience et niveaux, blessures, nourriture et eau | À faire |

Le compteur de coups des portes cassables (doc 019) reste en place jusqu'à C3c, où il sera remplacé par une attaque contre la défense de la porte.

## 7. Vérifications

**Node** (`node tools/test-combat.mjs`, tout est bon ; `node tools/test-creatures.mjs` aussi, Zed y est rendu increvable) :

| Cas | Résultat |
|---|---|
| Zed | 60 / 60 / 10, force 40, dextérité 40, vitalité 50. Inventaire : Mail Aketon, Blue Pants, Torch, Hosen. Miroir vide |
| N1 (8, 24), 4 Screamers | Anéantis en 8 coups, un par un. Torch et Empty Flask tombent sur la case. Zed garde 55 PV |
| N2, 10 s au contact d'un Trolin | 7 attaques, 2 touchent, Zed passe à 50 PV |
| Un coup | Endurance 600 → 597. Un second coup immédiat : fatigue |
| Ghost, N3 (27, 17) | « Frapper » : aucun effet |
| Momie N3 (7, 5), frappée depuis la trappe (7, 4) | Tuée, sa plaque se relâche : « YOU WILL REGRET THAT. » (critère de C4) |
| Zed à 1 PV près d'un Trolin | Il meurt. Plus de déplacement ni de coup. Recommencer : 60 PV |

**Chrome :**
- **Cadre de Zed :** il s'affiche en haut à gauche de la vue, et l'inventaire contient ses 4 objets.
- **Screamers, N1 (8, 25) face au nord :**
  - un clic sur un Screamer affiche « 25 » dans la zone d'action ;
  - le groupe est anéanti en 8 coups ;
  - ses deux objets apparaissent sur sa case, en 2D et à la première personne.
- **Trolins, N2 (10, 18) :**
  - le cadre se couvre de rouge à chaque coup reçu ;
  - Zed meurt en 28 s environ face à 3 Trolins ;
  - le voile « ZED EST MORT » s'affiche, et « Recommencer » ramène Zed au départ avec 60 PV.
- **Console :** aucune erreur.

## Sources

- *Dungeon Master Encyclopaedia*, **Actions and Combos** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/actions-and-combos/.
  Action « Hit » / « Frapper » et ses valeurs, les trois tests pour toucher, les combos par objet (pour C3c).
- *Dungeon Master Encyclopaedia*, **Attacks and Defenses** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/attacks-and-defenses/.
  Types d'attaque des créatures et caractéristiques de défense du champion.
- *Dungeon Master Encyclopaedia*, **Skills and Statistics** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/skills-and-statistics/.
  Rôle des caractéristiques, endurance stockée × 10, niveaux et gains de caractéristiques (pour C3c), réincarnation.
- *Dungeon Master Encyclopaedia*, **Creature Details** : http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/creature-details/.
  Colonnes Attack Ticks, Defense, Attack, Dexterity ; créatures immatérielles.
- **Formules de dégâts et de toucher :** provisoires, construites pour cette phase. À remplacer par celles de ReDMCSB (C3c).
