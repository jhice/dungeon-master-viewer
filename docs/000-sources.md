# Claude Code sources

La liste des sources utilisées par Claude Code, de la première analyse (001) aux ajustements (011).
Elles sont classées selon leur traçabilité : ce qui a été **consulté** pendant les sessions, ce qui vient des
**connaissances préalables** du modèle, sans consultation, et ce qui a été **déduit des données** elles-mêmes.

## 1. Sources consultées pendant les sessions

| Source | Lien | Description | Usage |
|---|---|---|---|
| Fichier du donjon | `Dungeon.xml` (identique à `0000.DUNGEON [Dungeon].xml`), fourni par l'utilisateur | Dump XML du `DUNGEON.DAT` de Dungeon Master, avec des commentaires qui documentent chaque champ : taille en bits, plage de valeurs, cas DM, CSB et DM2. L'outil qui a produit ce dump n'est pas identifié | **Source principale.** Toute la structure (001), la conversion (002), et des précisions reprises telles quelles des commentaires : rune de potion = puissance ÷ 40, valeurs de `seed` selon le jeu, rôle de `difficulty`, apparence des portes 0 à 3, champs inutilisés en DM, objets « cursed » lâchés par les Animated Armours… |
| Scripts PHP | `map.php`, `reader.php`, fournis par l'utilisateur | Premiers essais de lecture du XML avec SimpleXML | Lecture seule, pour comprendre le point de départ |
| graphics.dat de DM Amiga 3.6 (version CAPS) | http://greatstone.free.fr/dm/db_data/dm_amiga_36_caps/graphics.dat/graphics.dat.html, lien donné par l'utilisateur | Page de l'extraction des graphismes du jeu original, avec le libellé de chaque graphisme (« [0584] Creature 00 (Front) (Giant Scorpion) »…) | Étape 008 : **mesure de la teinte moyenne** des sprites de face des créatures, calculée dans le navigateur. Aucune image téléchargée, copiée ni reproduite. Ces teintes ont servi de point de départ à la palette des espèces, complétée de mémoire, car le jeu recolore certaines créatures à l'affichage |
| Three.js 0.170.0 | https://threejs.org/ (servi par le CDN https://cdn.jsdelivr.net/npm/three@0.170.0/) | Bibliothèque 3D, avec ses modules `OrbitControls` et `CSS2DRenderer` | Dépendance du renderer 3D (005 à 011). Sa documentation n'a pas été consultée : usage d'après les connaissances préalables de l'API |
| Dungeon Master Encyclopaedia, *Creature Details* | http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/creature-details/ | Table des descripteurs de créatures du moteur (graphics.dat, item 559) : taille, lévitation, immatériel, vitesse de déplacement, PV de base, etc., avec la définition de chaque colonne | Étape 021 : table `src/core/creature-info.js` (5 colonnes seulement). Règle « les créatures en lévitation n'enfoncent pas les plaques ». Étape 022 : colonnes vue, ouïe et odorat (version d, Amiga 3.6). Étape 023 : colonnes Attack Ticks, Defense, Attack, Dexterity |
| Dungeon Master Encyclopaedia, *Creature Generators* | http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/creature-generators/ | Formule des PV des créatures produites par un générateur | Étape 021 : PV des groupes générés |
| Dungeon Master Encyclopaedia, *Graphics.dat Item 559* | http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/graphics.dat-item-559/ | Format des descripteurs de créatures ; mentionne les « données étendues » tenues seulement pour les créatures du niveau du groupe | Étape 021 : seules les créatures du niveau du groupe sont actives. Étape 022 : caractéristiques des portes (les créatures voient à travers les grilles et les portes Ra) |
| Dungeon Master Encyclopaedia, *Actions and Combos* | http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/actions-and-combos/ | Table des actions (compétence, expérience, défense, endurance, probabilité de toucher, dégâts, fatigue) et des combos par objet ; les trois tests pour toucher | Étape 023 : action « Hit » / « Frapper » de Zed |
| Dungeon Master Encyclopaedia, *Attacks and Defenses* | http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/attacks-and-defenses/ | Les 8 types d'attaque, leurs causes, les espèces qui les utilisent et les défenses du champion | Étape 023 : type d'attaque des espèces, caractéristique de défense |
| Dungeon Master Encyclopaedia, *Skills and Statistics* | http://dmweb.free.fr/community/documentation/dungeon-master-and-chaos-strikes-back/skills-and-statistics/ | Compétences, niveaux, rôle de chaque caractéristique, endurance stockée × 10, réincarnation | Étape 023 : le champion Zed |
| Dungeon Master Encyclopaedia, *Dungeon Master Items* | http://dmweb.free.fr/games/dungeon-master/solutions/items/ | Liste de tous les objets de DM : poids, actions, bonus de force, énergie cinétique, armure, emplacements | Étape 024 : table `src/core/item-info.js` (poids, armes), portée et dégâts des objets lancés |
| Dungeon Master Encyclopaedia, *Dungeon Master Creatures* | http://dmweb.free.fr/games/dungeon-master/solutions/creatures/ | Fiche de chaque espèce de DM : groupes, sorts, objets laissés à la mort, emplacements, notes (vol du Giggler selon les versions) | Étape 025 : butin des espèces (`src/core/creature-drops.js`), vol du Giggler |
| Dungeon Master Encyclopaedia, *Dungeon Files* | http://dmweb.free.fr/community/documentation/file-formats/dungeon-files/ | Format de dungeon.dat, dont les capteurs : le générateur (type 6) est déclenché par un autre capteur, attend que sa case soit libre, puis se repose `delay` ticks (par 64 au-delà de 127) | Étape 021, retours : correction du déclenchement des générateurs |
| ReDMCSB Release 2, de Christophe Fontanel (miroir GitHub) | https://github.com/gondur/ReDMCSB_Release2, fichier `SOURCE/ENGINE/TIMELINE.C` | Reconstruction du code source du moteur de DM / CSB : la timeline des événements et leur traitement | Étape 026 : fusion des événements d'une même case au même tick, sens des compteurs, déclenchement des portes logiques. Fichier téléchargé dans le dossier temporaire de la session et lu, sans rien en reprendre dans le projet |

Avant l'étape 021, aucune autre page web n'avait été consultée. Aucun fichier n'a été téléchargé (les pages de l'étape 021
ont été lues comme du texte, sans rien en reprendre que les valeurs de la table).

## 2. Connaissances préalables du modèle (non consultées, sans lien vérifié)

Ces points viennent de l'entraînement du modèle, et non d'une page lue pendant les sessions. **Je ne peux pas dire
précisément de quels documents ils proviennent.** La documentation publiée par la communauté de Dungeon Master les couvre
très probablement, en particulier la *Dungeon Master Encyclopaedia* de Christophe Fontanel (http://dmweb.free.fr/),
qui héberge aussi le projet ReDMCSB (reconstruction du code source de DM / CSB). Mais je ne peux pas affirmer
que ce sont mes sources. **À vérifier sur ces références avant de les citer comme faits.**

| Point | Utilisé dans | Statut |
|---|---|---|
| Ordre des 4 positions d'une case : sens horaire depuis le nord-ouest (0 NO, 1 NE, 2 SE, 3 SO), contre les annotations du dump | 008 | **Vérifié dans le jeu original** par l'utilisateur |
| Sens des drapeaux des trappes (ouverte, invisible, imaginaire) et des faux murs (ouvert = disparu, imaginaire = illusoire) | 006 | Cohérent avec les comptes des données, non vérifié en jeu |
| États d'une porte (0 = ouverte, 4 = fermée, valeurs intermédiaires en mouvement) | 002, 006 | 0 et 4 confirmés par les libellés `state_str` du dump. Les autres valeurs, absentes des données, ne sont pas vérifiées |
| Format des fiches de champions : lettres A à P = chiffres hexadécimaux ; PV, endurance (stockée × 10), mana ; ordre des 7 attributs ; 16 compétences cachées, 4 par classe, avec leurs noms | 010 | Cohérent : classes décodées conformes aux champions connus (Halk guerrier, Mophus prêtre, Wuuf ninja et prêtre…), non vérifié en jeu |
| Idée que l'« item identifier » des actuators est un **index d'icône** et non un type d'objet | 009 | Hypothèse de départ, ensuite démontrée par les données pour les clés (voir § 3) |
| Les 25 noms d'espèces et leurs types (0 Giant Scorpion … 24 Red Dragon) | 008 | Les noms viennent des commentaires du dump. Seules les couleurs complétées de mémoire relèvent des connaissances préalables |
| Le niveau 0 est le Hall of Champions, le niveau 13 le repaire de Lord Chaos ; rôle de l'Amalgam, du Firestaff et de la Power Gem dans la fin du jeu | 003, 009 | Contexte d'interprétation, non vérifié |
| Conventions roguelike (`<` et `>` pour les escaliers) | 003 | Choix d'affichage |

## 3. Déductions faites à partir des données (sans source externe)

Ces résultats ont été établis par analyse et contre-vérification du fichier XML, avec des scripts Node et Python
écrits pour l'occasion. Ils sont reproductibles avec les outils du projet.

| Résultat | Méthode | Doc |
|---|---|---|
| Index des tuiles = `y × width + x` (ordre ligne par ligne) | Commentaires `(x;y)` du dump, et concordance totale avec l'`<overview>` | 001 |
| Superposition des niveaux par `offsetx` et `offsety` | Les 29 paires d'escaliers et les 67 trappes tombent aux mêmes coordonnées globales | 003 |
| `orientation` des portes et des escaliers = axe de passage | Voisins praticables de 169 portes sur 170 et de 56 escaliers sur 58 | 004 |
| Mots spéciaux de l'encodage (`_THE`, `_AND`, `_YOU`) = mot **suivi d'une espace** | Les 48 occurrences sont toutes suivies directement d'une lettre | 010 |
| Clés : identifiant = type d'objet divers + 167 (176 Iron Key … 191 Master Key) | Graphisme des serrures (« Gold Lock » ↔ 184, « Iron Lock » ↔ 176), et chaque clé présente aux niveaux de ses serrures | 009 |
| `actuator.graphic` = index **en base 1** dans les décorations murales du niveau | Correspondance serrure ↔ clé ci-dessus | 009 |
| Pièces, torche, Firestaff (identifiants 125-127, 4, 27-28) | Graphisme mural de l'actuator (Coin Slot, Full Torch Holder, Amalgam) et emplacement des détecteurs | 009, **probable** |
| Générateurs de créatures : `data` = type de créature | Chaque espèce générée fait partie des créatures autorisées sur son niveau | 009 |
| Textes de fin préfixés A, B, C, D | Observation : probablement un code d'ordre lu par le moteur | 010, hypothèse |

## 4. Outils utilisés

- **Node.js 24 et Python 3** : conversion, validation et scripts d'analyse ponctuels.
- **Chrome avec l'extension Claude** : tests de l'interface, sur un serveur local (`python3 -m http.server`).
