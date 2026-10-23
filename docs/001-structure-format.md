# 001 — Structure complète du format `Dungeon.xml`

> Fichier analysé : `Dungeon.xml`, identique octet par octet à `0000.DUNGEON [Dungeon].xml`.
> Taille : 4,4 Mo et 143 935 lignes, encodé en **ISO-8859-1**.

## 1. Nature du fichier

Le fichier est un **dump XML du `DUNGEON.DAT` original** de Dungeon Master (seed = 99).
Chaque attribut correspond à un champ binaire (1 bit, 5 bits, 1 word…). Sa taille en bits
est documentée dans des commentaires `<!-- -->` placés en tête de chaque section.
Ce n'est pas un format pensé pour un moteur : il reflète fidèlement la structure mémoire du jeu de 1987.

Le fichier contient environ 21 000 commentaires, de deux sortes :

- **Documentation des champs**, en tête de section (signification, plage de valeurs, cas DM / CSB / DM2).
- **Libellés lisibles** : `<!-- Wall (9;0) -->` avant chaque tuile, `<!-- Screamer -->` après une créature,
  `<!-- Torch -->` après un objet, `<!-- Floor actuator: 3 - P -->`, etc.

> ⚠️ Les **noms** (créatures, objets, types d'actuators) n'existent **que dans les commentaires**.
> La plupart des parseurs XML (DOMParser, SimpleXML, ElementTree) les ignorent par défaut.
> Il faudra donc soit les extraire à la conversion, soit utiliser des tables de correspondance `type → nom`.

## 2. Arborescence générale

```
<dungeon …26 attributs d'en-tête…>
├── <textdata>                 125 <text> : textes bruts encodés
├── <objects>                  « pools » d'objets, indexés
│   ├── <doors>                170 <door>
│   ├── <teleporters>          179 <teleporter>
│   ├── <texts>                125 <text>        (références vers textdata)
│   ├── <actuators>            683 <actuator>    (forme brute, non décodée)
│   ├── <creatures>            182 <creature>    (groupes de 1 à 4 monstres)
│   ├── <weapons>              107 <weapon>
│   ├── <clothes>              121 <cloth>
│   ├── <scrolls>               35 <scroll>
│   ├── <potions>               56 <potion>
│   ├── <containers>            12 <container>   (coffres)
│   ├── <miscellaneouses>      280 <miscellaneous>
│   ├── <unuseditems1..3>        vides
│   ├── <missiles>               vide (runtime)
│   └── <clouds>                 vide (runtime)
└── <maps>                     14 <map>
    └── <map …21 attributs…>
        ├── <overview>               carte ASCII déjà prête
        ├── <tiles>                  width × height <tile>
        │   └── <tile>
        │       └── <items>          références vers les pools + objets imbriqués
        ├── <border_random_decorations>
        ├── <creature_graphics>
        ├── <wall_decoration_graphics>
        ├── <floor_decoration_graphics>
        └── <door_decoration_graphics>
```

**Modèle de données :** les entités vivent dans des **pools globaux** (`<objects>`), indexés à partir de 0.
Les tuiles des cartes les **référencent par index** :
`<tile><items><door index="12" position="0"/></items></tile>` pointe vers `objects/doors/door[@index=12]`.

## 3. En-tête `<dungeon>`

| Attribut | Valeur | Rôle |
|---|---|---|
| `seed` | 99 | Graine des décorations aléatoires (99 = DM, 13 = CSB, 8 = CSB prison, 0 = DM2) |
| `number_of_maps` | 14 | 1 carte par niveau en DM/CSB |
| `start_x`, `start_y`, `start_facing` | 1, 3, South | Position de départ du groupe, toujours sur la carte 0 |
| `maps_data_size`, `texts_data_size`, `objects_list_size` | — | Tailles binaires, sans intérêt pour nous |
| `number_of_<type>` | 170 portes, 179 téléporteurs, 683 actuators, 182 groupes de créatures, 107 armes, 121 vêtements, 35 parchemins, 56 potions, 12 coffres, 280 objets divers | Cohérents avec les pools |
| `unused1`, `start_unused`, `number_of_unused*`, `number_of_missiles`, `number_of_clouds` | 0 | Ignorables |

## 4. Textes

### `<textdata>` : texte brut

125 `<text>`. Les mots `_THE`, `_AND` et `_YOU` sont des « caractères spéciaux » de l'encodage
5 bits d'origine : il faut retirer le `_` à l'affichage (`_THEKEYS TO` → `THE KEYS TO`).

On y trouve deux familles :

- **Inscriptions murales et parchemins** : `"_THEKEYS TO\nPASSAGE LIE\nHIDDEN DEEP."`.
- **Fiches des 24 champions** (Hall of Champions), au format :
  ```
  NOM
  TITRE
  (vide)
  M|F                          ← sexe
  AAGEACIKAAAG                 ← santé / endurance / mana, encodés en lettres
  CDDCBOCDCNBOCN               ← caractéristiques
  DADAAAAAAAAAAABB             ← compétences
  ```
  Ces lignes codées seront décodées plus tard (voir l'étape « textes » de CLAUDE.md).

### `objects/texts/text` : objet texte

- Attributs : `index`, `visible`, `text_data` (offset en words dans `textdata`), plus `actuator` et `complex`, toujours à 0 en DM.
- Le texte y est **recopié** pour lecture (lecture seule).
- `visible="1"` : inscription murale affichée. `visible="0"` : texte caché (fiches de champions, textes portés par des parchemins).

## 5. Pools d'objets (`<objects>`)

Tous les éléments ont un `index` (de 0 à n−1). Les champs `unused*` et `bits_*` sont toujours à 0 ici.

| Pool | Attributs utiles | Notes |
|---|---|---|
| `door` | `type` (0/1 → `map.graphics_door0/1`), `ornate` (0–4), `opening` (Vertical/Horizontal), `button`, `fireball`, `force` | Portes destructibles par boule de feu ou à la hache |
| `teleporter` | `dest_map`, `dest_map_x`, `dest_map_y` (**coordonnées locales**, sans offset), `rotation` (0/90/180/270), `rotation_type` (Relative/Absolute), `scope` (Items/Creatures/Items_Party/All), `sound` | Toujours posé sur une tuile de type 5 |
| `actuator` | `type`, `data`, `graphic_number`, `word2_bits012`, `word3` | **Forme brute non décodée** : la forme décodée est dans les tuiles (§ 6.4) |
| `creature` | `type` (0–24), `number_of_creatures` (1–4), `position_1..4` (case 0–3 dans la tuile), `hit_point_1..4`, `facing`, `is_important`, `possession` | Nom en commentaire (`<!-- Screamer -->`). Un monstre seul au centre n'a pas de `position_1` |
| `weapon` | `type` (0–45), `number_of_charges`, `is_broken`, `is_poisoned`, `is_cursed`, `is_important` | |
| `cloth` | `type` (1–57), `is_broken`, `is_cursed`, `is_important` | |
| `scroll` | `referred_text` → index dans `objects/texts` | Texte recopié en contenu |
| `potion` | `type` (2–20), `power` (0–255, rune affichée = power / 40) | |
| `container` | `type` (toujours 0 = coffre) | Contenu imbriqué dans la tuile (§ 6.5) |
| `miscellaneous` | `type` (0–50), `subtype` (0–3 : gourde vide→pleine / boussole N-E-S-O / os de champion 1–4) | `subtype_str` présent parfois |

**Objets orphelins**, non posés sur la carte (sans doute sur les champions au départ, ou inutilisés) :
`weapon[105]`, `scroll[33]`, `potion[37]`, `miscellaneous[8, 116]`.
Les 34 `text` non référencés par les tuiles le sont par les parchemins ou par les fiches de champions.

## 6. Cartes (`<maps>/<map>`)

### 6.1 Attributs de `<map>`

| Attribut | Valeurs observées | Rôle |
|---|---|---|
| `index`, `level` | 0–13 (identiques) | Carte = niveau |
| `offsetx`, `offsety` | 0–25 / 0–32 | **Position de la carte dans un repère global commun**, indispensable pour superposer escaliers et trappes |
| `width`, `height` | 19–32 / 13–32 | Dimensions (max 32 × 32) |
| `graphics_wall`, `graphics_floor`, `graphics_door` (+ `_random`) | | Nombre de graphismes de décor disponibles sur ce niveau |
| `creature_types` | 0–6 | Nombre de types de monstres autorisés |
| `difficulty` | 0–6 | Multiplicateur d'XP, PV des monstres générés ; 0 = lumière permanente (Hall of Champions) |
| `graphics_door0`, `graphics_door1` | 0/2/3, 1 | Apparence des portes de type 0 et 1 : 0 = Porticullis, 1 = Wooden, 2 = Iron, 3 = Ra |
| `graphics_floor_style`, `graphics_map_style` | 0 | Toujours 0 en DM |

Tableau des 14 niveaux :

| Map | Offset (x, y) | Taille | Map | Offset (x, y) | Taille |
|---|---|---|---|---|---|
| 0 | 0, 0 | 19 × 19 | 7 | 20, 11 | 32 × 32 |
| 1 | 0, 14 | 32 × 32 | 8 | 12, 5 | 31 × 32 |
| 2 | 5, 10 | 32 × 32 | 9 | 10, 10 | 31 × 32 |
| 3 | 0, 0 | 32 × 32 | 10 | 10, 10 | 31 × 32 |
| 4 | 5, 0 | 30 × 31 | 11 | 20, 20 | 32 × 31 |
| 5 | 5, 5 | 32 × 32 | 12 | 25, 30 | 22 × 20 |
| 6 | 5, 5 | 30 × 31 | 13 | 25, 32 | 26 × 13 |

Au total : 12 087 tuiles (somme des width × height, vérifiée).

### 6.2 `<overview>` : carte ASCII prête à l'emploi

Une ligne par rangée y, un caractère par colonne x, avec une indentation de 6 espaces à retirer.
Elle concorde à 100 % avec les tuiles (vérifié sur la carte 4).

| Car. | Type | Car. | Type |
|---|---|---|---|
| `W` | 0 Wall | `d` | 4 Door |
| `.` | 1 Floor | `t` | 5 Teleporter |
| `p` | 2 Pit | `w` | 6 Fake wall |
| `s` | 3 Stairs | | |

### 6.3 `<tile>`

- **Coordonnées : `index = y × width + x`**, en ordre ligne par ligne (vérifié avec les commentaires `(x;y)`).
- Attributs communs : `index`, `type`, `has_objects`. `has_objects` vaut 1 si la tuile porte au moins une
  référence d'objet (cohérence vérifiée, 0 erreur).
- Attributs spécifiques à chaque type :

| type | Nom | Nb | Attributs spécifiques |
|---|---|---|---|
| 0 | Wall | 5 979 | `allow_decoration_north/east/south/west` |
| 1 | Floor | 5 547 | `allow_decoration` |
| 2 | Pit | 67 | `is_open`, `is_imaginary`, `is_invisible` |
| 3 | Stairs | 58 | `direction` (0/1, `direction_str` Down/Up), `orientation` (`orientation_str` North-South/West-East) |
| 4 | Door | 170 | `state` (0 = Open, 4 = Closed), `orientation` |
| 5 | Teleporter | 179 | `is_open`, `is_visible` |
| 6 | Fake wall | 87 | `is_open`, `is_imaginary`, `allow_decoration` |

Les attributs `*_str` sont des doublons lisibles des valeurs numériques.

### 6.4 `<items>` d'une tuile

Ce sont des listes ordonnées, dans l'ordre de la chaîne d'objets du jeu. Contenu possible :

| Élément | Forme | Remarque |
|---|---|---|
| `door`, `teleporter`, `text`, `creature`, `weapon`, `cloth`, `scroll`, `potion`, `container`, `miscellaneous` | `<x index="…" position="…"/>` | Référence vers le pool |
| `actuator` | `<actuator index="…" position="…">` + **sous-éléments décodés** | Voir ci-dessous |
| `random_wall_decoration` | `graphic`, `position` | Décoration calculée depuis `seed` |
| `random_floor_decoration` | `graphic` | |

**`position` (0–3)** :

- Sur un **mur**, c'est la **face** : 0 = north, 1 = east, 2 = south, 3 = west.
- Sur un **sol**, c'est le **quart de case** : 0 = North/TopLeft, 1 = East/TopRight, 2 = South/BottomLeft, 3 = West/BottomRight.

Les commentaires suivent cet ordre. Attention : `TopRight` et `BottomLeft` ne sont pas dans l'ordre horaire.

**Actuators décodés** : sous-éléments `type`, `data`, `graphic`, `action_target` (local/remote),
`delay`, `has_sound`, `has_revert`, `action_type` (Set/Clear/Toggle/Hold), `once_only`, plus des champs
qui dépendent du type :

- `remote` : `target_x`, `target_y`, `direction` (la cible de l'action) ;
- lanceurs de projectiles : `power`, `power_decrease` ;
- générateurs de créatures : `number_of_creatures`, `is_max_number`, `hit_point_multiplier` ;
- portes logiques (type 5) : `data` contient `current_state_*` et `reference_state_*`.

Types d'actuators présents dans le fichier :

- **Sol** : 1 TPCI, 2 TPC, 3 P, 4 I, 6 Creature generator, 8 Party possession detector.
  Les lettres indiquent qui déclenche la plaque : T = Thing (objet), P = Party (groupe), C = Creature, I = Item.
- **Mur** : 0 Inactive, 1 Any item / Empty hand, 2 Any item / No empty hand, 3 Specific item,
  4 Specific item / Removed, 5 And/Or gate, 6 Counter, 8 Magic missile shooter, 9 et 10 Double shooters,
  13 Item storage, 16 Item exchanger, 17, 127 Champion portrait.

Les références `teleporter` et `text` dans les tuiles sont précédées d'un `<!-- NOT_IMPLEMENTED -->` :
c'est une limite de l'outil de dump, qui n'a pas recopié leurs données en ligne. Il faut lire le pool correspondant.

### 6.5 Objets imbriqués

- `creature/items/…` : objets portés par un groupe de monstres, lâchés à sa mort (18 cas).
- `container/items/…` : contenu des coffres (parchemins, potions, objets divers, armes).

### 6.6 Listes graphiques du niveau

- `wall_decoration_graphics`, `floor_decoration_graphics` et `door_decoration_graphics` : tables `index → type`.
  `actuator.graphic` et les décorations font référence à ces index **locaux au niveau**.
- `creature_graphics` : types de monstres chargés sur ce niveau.
- `border_random_decorations` : décorations sur les murs **hors carte** (`x`/`y` peuvent valoir −1 ou 32).

## 7. Points d'attention pour le parseur

1. **Encodage ISO-8859-1** : à déclarer explicitement si on lit le fichier en JS (`TextDecoder('latin1')`).
2. **Noms uniquement en commentaires** : il faut les capturer pendant la conversion.
3. **Actuators en double** : forme brute dans le pool, forme décodée dans les tuiles. On ne garde que la forme décodée.
4. **Textes en double** : `textdata`, `objects/texts` et `scroll`. Une seule source suffit.
5. **Coordonnées des téléporteurs et des actuators remote** : elles sont **locales** à la carte cible.
   Pour le rendu global, appliquer `offsetx` et `offsety`.
6. **Champs runtime** (`in_game`, `runtime`, `missiles`, `clouds`) : sans intérêt pour un visualisateur.

## 8. Recommandation de format : JSON, dérivé du XML

**Recommandation : garder le XML comme source de vérité et générer une fois un JSON compact
avec un script de conversion** (Node ou Python, versionné dans le projet).

Pourquoi :

| Critère | XML actuel | JSON compact |
|---|---|---|
| Taille | 4,4 Mo (186 Ko en gzip) | Estimation 400–600 Ko au total ; ~315 Ko pour les seules cartes |
| Chargement en JS | DOMParser, plus l'encodage latin1, plus la traversée du DOM | `import data from './dungeon.json' with { type: 'json' }` ou `fetch().json()` |
| Noms d'entités | Perdus (commentaires) | Champs `name` explicites |
| Accès à une tuile | Requête XPath | `map.grid[y][x]` |
| Lisibilité et diff git | Verbeux | Raisonnable |

Structure cible proposée (à valider) :

```jsonc
{
  "start": { "map": 0, "x": 1, "y": 3, "facing": "S" },
  "maps": [{
    "index": 0, "offset": [0, 0], "size": [19, 19], "difficulty": 0,
    "doorGraphics": ["Porticullis", "Wooden"],
    "grid": ["WWWWWWWWW…", "…"],          // 1 caractère par tuile = overview
    "tiles": { "9,1": { "type": "teleporter", "teleporter": 66, "items": [...] } } // tuiles non triviales seulement
  }],
  "doors": [...], "teleporters": [...], "creatures": [{ "type": 6, "name": "Screamer", ... }],
  "items": { "weapons": [...], "clothes": [...], ... },
  "actuators": [...],                      // forme décodée
  "texts": [...]
}
```

- La **grille en chaînes de caractères** suffit pour le rendu ASCII et 2D, et sert de base au 3D.
- Seules les tuiles portant des données (objets, état, décoration) sont détaillées, en dictionnaire clairsemé.

Alternatives écartées :

- **Binaire d'origine** (`DUNGEON.DAT`) : très compact, mais il faudrait réécrire le décodage bit à bit.
- **Lecture directe du XML dans le navigateur** : possible et sans étape de build, mais lente et peu ergonomique,
  et on perd les noms.

## 9. Suite

- **002** : script de conversion XML → JSON et validation des compteurs.
- **003** : les 14 niveaux et un rendu ASCII superposé avec les offsets (correspondance des escaliers et des trappes).
