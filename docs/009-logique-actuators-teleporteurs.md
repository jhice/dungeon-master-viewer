# 009 — Logique des actuators et des téléporteurs

> Suite de [008-inventaire-objets-creatures.md](008-inventaire-objets-creatures.md).
> Cette étape **visualise** qui déclenche quoi : mécanismes sur la carte, liens vers leurs cibles,
> téléporteurs vers leurs destinations et inspection d'une case.
> La **simulation** (actionner un levier et voir la porte s'ouvrir) est reportée à plus tard.

## 1. Décisions (réponses de l'utilisateur)

| Question | Décision |
|---|---|
| Visualiser ou simuler | Visualiser ; la simulation viendra plus tard |
| Liens affichés par défaut | Seulement ceux de la case **sélectionnée**, avec une case « Tous les liens » |
| Identifiants d'objets des serrures | Tenter de les décoder |
| Générateurs de créatures | Marqueur, avec l'espèce et le nombre dans l'infobulle |

## 2. Données

### Actuators : 683

| Famille (`actuatorFamily`) | Nb | Types |
|---|---|---|
| Déclencheurs au sol | 243 | P (groupe seul) 172, TPCI 50, TPC 13, I 1, détecteur d'objet porté 7 |
| Déclencheurs muraux | ~265 | Any item / Empty hand 153, Specific item / Removed 71, No empty hand 15, Item storage 14, Specific item 9, Item exchanger 1… |
| Logique | 33 | Porte ET/OU 29, compteur 4 |
| Lanceurs | 17 | Projectiles magiques 15 et 1 double, projectile d'arme double 1 |
| Générateurs | 50 | |
| Portraits de champions | 24 | Non signalés sur la carte : ce sont les miroirs du Hall |
| Inactifs | 52 | Décors avec graphisme, non signalés |

**Cibles**
- 507 actuators sont « remote » : ils visent une case **du même niveau**.
  - Ces cibles sont des portes (114), des téléporteurs (91), des faux murs (81), des trappes (73), des sols (63) et des murs (85).
  - 81 cibles murales portent elles-mêmes des actuators, ce qui crée des **chaînes** (déclencheur → porte logique ou compteur → porte).
- Actions : set 437, clear 65, toggle 84, hold 47.
- 149 actuators sont à usage unique et 636 ont un délai.
- 126 actuators « local » agissent sur leur propre case, surtout par une rotation des actuators de la case (65).

### Téléporteurs : 179

- 163 restent sur le même niveau et 16 changent de niveau.
- 54 arrivent sur un autre téléporteur, ce qui forme des chaînes ou des boucles.
- Portée : tout 140, créatures 30, objets 7, groupe et objets 2.
- 37 font tourner le groupe à l'arrivée, de façon relative ou absolue.
- Tuiles : 57 ouvertes et visibles, 58 ouvertes et invisibles, 28 fermées et visibles, 36 fermées et invisibles.

## 3. Décodage des identifiants (`src/core/item-ids.js`)

Les serrures, alcôves, fentes à pièces, détecteurs et l'échangeur désignent l'objet attendu par un
**index d'icône global**, et non par un type d'objet. La correspondance a été établie à partir des données :

| Identifiant | Objet | Certitude | Preuve |
|---|---|---|---|
| 176–191 | Clés : type divers 9 (Iron Key) à 24 (Master Key), **identifiant = type + 167** | **confirmé** | Les serrures dessinées « Gold Lock » attendent 184 = Gold Key, et les « Iron Lock » 176 = Iron Key. Chaque clé se trouve aux niveaux de ses serrures (Tourquoise Key au niveau 6 pour 4 serrures au niveau 6, Cross Key au niveau 10 pour 3 serrures au niveau 10…) |
| 125, 126, 127 | Copper, Silver, Gold Coin | probable | Graphisme « Coin Slot » ; l'ordre des 3 pièces est supposé |
| 4 | Torch | probable | Alcôves de stockage dessinées « Full Torch Holder » |
| 27 / 28 | The Firestaff / The Firestaff (Complete) | probable | Item exchanger sur l'Amalgam (niveau 13), détecteurs d'objets portés au Hall (niveau 0) et au niveau 13 |
| 129 | une gemme | incertain | Graphisme « Gem Hole », sans pouvoir dire laquelle |
| 39, 131, 197 | ? | inconnu | Affichés « objet #n » |

Deux constats en sont sortis :

- **Graphisme mural :** `actuator.graphic` est un **index en base 1** dans `map.wallDecorations` (0 = invisible).
  Cela tranche l'hypothèse laissée ouverte en 002.
- **Générateurs :** `data` est le **type de créature** généré. Chaque espèce générée figure bien
  dans `creatureGraphics` de son niveau (par exemple 11 Black Flame au niveau 12).

## 4. Rendu

**Marqueurs de mécanismes** (case **Mécanismes**, touche `M`), colorés par famille :

| Famille | 2D | 3D |
|---|---|---|
| Déclencheur au sol | Cadre intérieur orange | Plaque fine au sol |
| Déclencheur mural, lanceur | Pastille sur la face | Petit octaèdre devant la face |
| Logique (ET/OU, compteur) | Glyphe ⊕ | Octaèdre au-dessus du mur |
| Générateur | Glyphe ✶ | Octaèdre au-dessus du sol |

**Liens**

- **Par défaut**, seuls les liens de la **case sélectionnée** s'affichent, sortants et entrants. Cliquer sur une case la sélectionne,
  recliquer dessus ou `Échap` la désélectionne.
- La case **Tous les liens** (touche `T`) affiche tous les liens du niveau courant.
- **Couleurs :** les actuators sont colorés par action (set vert, clear rouge, toggle jaune, hold bleu), les téléporteurs
  par portée (violet tout, rose créatures, cyan objets, mauve groupe et objets).
- **En 2D**, ce sont des flèches SVG par-dessus la grille, avec la même échelle que les cases :
  - pointillés serrés pour un lien avec délai, tirets pour un téléporteur ;
  - un lien vers un autre niveau se termine par une étiquette cliquable « → N2 (19, 8) » (« ← … » pour un lien entrant),
    qui mène à l'autre extrémité et la sélectionne.
- **En 3D**, ce sont des segments au-dessus des murs, plus clairs vers la destination.
  Un téléporteur vers un autre niveau dessine un arc. La sélection se fait par un clic sans glisser, et s'entoure d'une boîte blanche.

**Infobulle** : elle liste maintenant les mécanismes de la case, même sans objet.

- Pour chaque actuator : type, objet attendu décodé avec sa certitude, espèce générée, état d'une porte logique,
  cible et action, délai, usage unique.
- Pour un téléporteur : destination, portée et rotation.
- La ligne « Déclenché par n source(s) » liste les coordonnées des sources.

Exemple : la serrure du niveau 1 en (5, 4) affiche « Specific item / Removed · objet attendu : Gold Key ·
→ active / ouvre (6, 5) · délai 1 · une seule fois ».

## 5. Architecture

```
src/core/item-ids.js        decodeItemId(dungeon, id) → { name, certainty }
src/core/logic.js           buildLogic(dungeon) : links, outgoing(), incoming(), actuatorsAt(), teleporterAt(), linksOfLevel()
                            actuatorFamily(), describeActuator(), describeTeleporter()
src/render/palette.js       + ACTION_COLORS, TELEPORTER_COLORS, FAMILY_COLORS, linkColor()
src/render/dom/…            + mechanismMarkers(), surcouche SVG, showLinks(links, selection), clic = onSelect, étiquettes = onFollow
src/render/three/…          + plaques et octaèdres (calque 'mechanisms'), showLinks(), sélection au clic
```

- **Graphe calculé une seule fois :** 686 liens au total, soit 507 actuators distants et 179 téléporteurs.
  Ils sont indexés par case (`niveau:x,y`) en sortie et en entrée.
- **Renderers passifs :** `main.js` décide quels liens afficher (sélection ou niveau) et les passe à `renderer.showLinks()`.
  Le renderer ne fait que dessiner. Les nouvelles extensions optionnelles du contrat sont `showLinks`, `onSelect` et `onFollow` (2D).

## 6. Vérifications (Chrome)

- **2D, niveau 1 :**
  - la sélection de la porte (18,1) affiche « 0 lien(s) sortant(s), 4 entrant(s) », avec 4 flèches jaunes (toggle avec délai)
    depuis les plaques encadrées ;
  - l'infobulle de la serrure (5,4) affiche « objet attendu : Gold Key » ;
  - `T` affiche tous les liens du niveau, avec les étiquettes vers le niveau 2. Le clic sur « N2 (19, 8) » passe au niveau 2 et sélectionne la case.
- **3D, niveau 2 en solo :** liens, arcs de téléporteurs et plaques visibles. Le clic sur (20, 17) sélectionne la plaque,
  et son infobulle affiche « P · always activated · → active / ouvre (24, 28) · délai 1 ». `Échap` annule la sélection.
- Aucune erreur de la page dans la console (une erreur venait d'une extension du navigateur).
  Les préférences de test ont été effacées.

Limite constatée : en mode « Tous les liens », les étiquettes de deux liens inter-niveaux voisins peuvent se chevaucher.

## 7. Suite

- **010** : textes (inscriptions murales, parchemins, fiches des champions encodées).
- **Plus tard :** simulation de la logique (propagation de set, clear, toggle et hold, délais, portes logiques,
  compteurs, rotations), en vue du mode jouable.
