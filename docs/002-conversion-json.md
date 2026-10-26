# 002 — Conversion XML → JSON

> Suite de [001-structure-format.md](001-structure-format.md).
> Résultat : `data/dungeon.json`, 573 Ko (55 Ko en gzip), contre 4,4 Mo pour le XML.

## 1. Utilisation

```sh
npm run build:data
# équivaut à : node tools/build-dungeon.mjs [Dungeon.xml] [data/dungeon.json]
```

- Node ≥ 20, aucune dépendance. La conversion prend environ 90 ms.
- Les avertissements de conversion et les erreurs de validation s'affichent dans la console.
  **En cas d'erreur, le JSON n'est pas écrit.**
- `Dungeon.xml` reste la source de vérité. `data/dungeon.json` est un fichier généré, que le
  visualisateur charge directement (aucune étape de build côté navigateur).

## 2. Fichiers

| Fichier | Rôle |
|---|---|
| `tools/xml-parser.mjs` | Petit parseur XML qui **conserve les commentaires** et les numéros de ligne. DOMParser et consorts les perdent, or les noms ne sont que là. |
| `tools/dungeon-converter.mjs` | Arbre XML → modèle JSON. Il signale tout champ inattendu (champ « unused » non nul, sous-élément d'actuator inconnu…). |
| `tools/dungeon-validator.mjs` | Contrôles de cohérence sur le modèle produit |
| `tools/build-dungeon.mjs` | Point d'entrée en ligne de commande : lecture latin1 → parse → conversion → validation → écriture |

Le JSON est sérialisé **à raison d'une entrée par ligne** (objet d'une liste, tuile, rangée de grille) :
il reste compact, lisible et facile à comparer d'une version à l'autre.

## 3. Modèle JSON

```jsonc
{
  "format": "dm-dungeon", "version": 1, "seed": 99,
  "start": { "map": 0, "x": 1, "y": 3, "facing": "S" },
  "counts": { "maps": 14, "doors": 170, … },          // compteurs de l'en-tête d'origine
  "catalog": { "weapon": { "0": "Eye Of Time", … }, "creature": { "6": "Screamer", … }, … },
  "maps": [ … ],
  "doors": [], "teleporters": [], "texts": [], "actuators": [], "creatures": [],
  "weapons": [], "clothes": [], "scrolls": [], "potions": [], "containers": [], "miscellaneous": []
}
```

### Conventions

- **Directions** : `"N" | "E" | "S" | "W"`. Orientation des escaliers et des portes : `"NS" | "WE"`.
- **Indices** : la position dans chaque liste remplace l'attribut `index` du XML (la continuité de 0 à n−1 est vérifiée).
- **Booléens** à la place des 0/1. Noms de champs en camelCase.
- **Coordonnées locales à la carte.** Coordonnées globales = `(x + map.offset.x, y + map.offset.y)`.

### `maps[i]`

```jsonc
{
  "index": 0, "level": 0, "offset": { "x": 0, "y": 0 }, "width": 19, "height": 19,
  "difficulty": 0, "creatureTypeCount": 0, "unused3": 0,
  "doorTypes": ["Porticullis", "Wooden"],           // apparence des portes de type 0 et 1
  "graphicsCounts": { "wall": 10, "wallRandom": 10, "floor": 4, "floorRandom": 4, "door": 1 },
  "creatureGraphics": [{ "type": 14 }],
  "wallDecorations":  [{ "type": 4, "name": "Hook" }, …],
  "floorDecorations": [{ "type": 2, "name": "Moss" }, …],
  "doorDecorations":  [{ "type": 7, "name": "Black door (Dungeon Entrance)" }],
  "borderDecorations": [{ "x": -1, "y": 5, "graphic": 2, "side": "E" }],
  "grid": ["WWWWWWWWWWWWWWWWWWW", …],                 // 1 caractère par tuile, grid[y][x]
  "allowDecoration": ["0000004000000000000", …],   // 1 chiffre hexa par tuile
  "tiles": { "9,1": { "type": "teleporter", "open": false, "visible": false, "items": [ … ] }, … }
}
```

- **`grid`** utilise les mêmes caractères que l'`<overview>` du XML : `W` wall, `.` floor, `p` pit, `s` stairs,
  `d` door, `t` teleporter, `w` fake wall. Il suffit au rendu ASCII et sert de base au 2D et au 3D.
- **`allowDecoration`** indique les emplacements où le jeu *peut* placer une décoration aléatoire.
  Pour un mur, c'est un masque de bits N=1, E=2, S=4, W=8. Pour un sol ou un faux mur, 1 = autorisé.
  Les décorations effectivement tirées se trouvent déjà dans `tiles[…].decorations`.
- **`tiles`** est un dictionnaire clairsemé de clés `"x,y"`. Il ne contient que les tuiles qui portent des données
  (1 993 sur 12 087). Une tuile absente est un mur ou un sol nu, décrit entièrement par `grid`.

### `tiles["x,y"]`

| Champ | Présent pour | Contenu |
|---|---|---|
| `type` | toutes | `wall` `floor` `pit` `stairs` `door` `teleporter` `fakewall` |
| `open`, `imaginary`, `invisible` | pit | |
| `direction` (`up` / `down`), `orientation` | stairs | |
| `open`, `orientation` | door | `open` est déduit de `state` : 0 = ouverte, 4 = fermée |
| `open`, `visible` | teleporter | |
| `open`, `imaginary` | fakewall | |
| `decorations` | si décor | `[{ graphic, side }]` sur un mur, `[{ graphic }]` sur un sol |
| `items` | si objets | `[{ kind, index, position }]`, **dans l'ordre d'origine** (ordre d'empilement) |

`kind` donne la liste ciblée (`door` → `doors`, `cloth` → `clothes`, etc.).
`position` vaut 0–3 : la face pour un mur, le quart de case pour un sol (voir 001 § 6.4).

> `graphic` dans `decorations` vaut 1–6 alors que les listes `wallDecorations` sont indexées à partir de 0.
> Hypothèse à vérifier au moment du rendu : `graphic` est un index base 1 dans `wallDecorations` / `floorDecorations`.
>
> **Mise à jour (009) :** pour les actuators, `graphic` est bien un index **en base 1** dans `wallDecorations`
> (0 = invisible). Les serrures « Gold Lock » attendent la Gold Key, les « Iron Lock » l'Iron Key.
> Les décorations aléatoires suivent très probablement la même convention.

### Listes d'objets

Chaque objet posé reçoit un champ **`at`** (lien retour) :

- `{ map, x, y }` s'il est sur une tuile ;
- `{ in: "creature" | "container", index }` s'il est porté par un monstre ou rangé dans un coffre.

Le `name` vient du commentaire XML. Le dictionnaire `catalog[kind][type]` regroupe ces noms : on y vérifie
qu'un même `type` porte toujours le même nom.

| Liste | Champs |
|---|---|
| `doors` | `type`, `ornate`, `opening` (`vertical`/`horizontal`), `button`, `fireball`, `force` |
| `teleporters` | `dest {map,x,y}`, `rotation`, `rotationType`, `scope` (`items`/`creatures`/`items_party`/`all`), `sound` |
| `texts` | `visible`, `offset`, `text` (sans les `_`), `raw` (seulement s'il contient des `_`) |
| `creatures` | `type`, `name`, `count`, `members [{hp, position}]` (`position` null = seul au centre), `facing`, `important`, `items`, et `inGame` / `byte4bit7` s'ils sont non nuls |
| `weapons` | `type`, `name`, `charges`, `broken`, `poisoned`, `cursed`, `important` |
| `clothes` | `type`, `name`, `broken`, `cursed`, `important` |
| `scrolls` | `text` (index dans `texts`) |
| `potions` | `type`, `name`, `power` |
| `containers` | `type`, `name`, `items` |
| `miscellaneous` | `type`, `name`, `subtype`, `important` |

### `actuators`

On ne garde que la **forme décodée**, lue dans les tuiles. La forme brute de la liste d'origine
(`word2`, `word3`) sert uniquement à vérifier que les `type` concordent.

```jsonc
{ "kind": "wall", "type": 5, "typeName": "And/Or gate",
  "gate": { "current": [true,false,false,false], "reference": [true,false,false,false] },
  "graphic": 0, "delay": 15, "sound": false, "onceOnly": false,
  "target": "remote", "action": "set", "revert": false,
  "remote": { "x": 9, "y": 0, "direction": "S" },
  "at": { "map": 0, "x": 10, "y": 1 } }
```

Blocs optionnels selon le type :

- `remote {x, y, direction}` ou `local {action, name}` ;
- `missile {power, powerDecrease}` ;
- `generator {count, isMax, hpMultiplier, word2bit11}`, sans `target`, `action` ni `revert` ;
- `gate`, qui remplace `data` ;
- `dataNote`, la note du dump sur `data` : `"champion identifier: Nabi"`, `"missile identifier: Fireball"`,
  `"activated only if party faces north"`…

Un sous-élément XML inconnu n'est pas perdu : il atterrit dans `extra`, et le validateur le signale.

## 4. Ce qui est volontairement abandonné

Ces champs sont abandonnés **uniquement après vérification qu'ils valent 0** (sinon le convertisseur émet un avertissement) :

- en-tête : `unused1`, `start_unused`, `number_of_unused1..3`, `number_of_missiles`, `number_of_clouds` ;
- `bits_*`, `word_2_bits_0_7`, `unused*`, `byte_3_bits_3_7` ;
- champs DM2 des textes (`actuator`, `complex`) ;
- `graphics_floor_style` et `graphics_map_style`.

Sont aussi abandonnés :

- les tailles binaires (`maps_data_size`, `texts_data_size`, `objects_list_size`) ;
- les doublons `*_str` ;
- `textdata` (le texte est porté par `texts`) ;
- le texte recopié des parchemins (on passe par `scroll.text`) ;
- `runtime` (toujours 1 sur les parchemins, 0 sur les armes) ;
- `container.bit_0` et `bit_3_15`, documentés comme du « contenu aléatoire » ;
- les listes vides `missiles` et `clouds`.

## 5. Validation

| Contrôle | Résultat |
|---|---|
| Compteurs de l'en-tête = tailles des listes (12 listes) | ✅ |
| Indices XML continus de 0 à n−1 (listes et tuiles) | ✅ |
| `width × height` tuiles par carte (12 087) | ✅ |
| `grid` identique à l'`<overview>` du dump, pour les 14 cartes | ✅ |
| `has_objects` cohérent avec la présence d'objets | ✅ |
| Toute référence pointe vers un objet existant ; aucun objet n'est placé deux fois | ✅ |
| Exactement 1 objet porte par tuile porte et 1 objet téléporteur par tuile téléporteur, et aucun ailleurs | ✅ |
| Destinations des téléporteurs et cibles des actuators `remote` dans les bornes | ✅ |
| Type d'actuator identique entre la liste brute et la forme décodée (683) | ✅ |
| Nom unique par `type` dans `catalog` | ✅ |
| Aucun champ abandonné non nul, aucun sous-élément d'actuator non géré | ✅ (0 avertissement) |
| **Contre-vérification indépendante en Python** : types et drapeaux des tuiles, ordre des objets (1 911 références), décorations, armes, créatures (PV), téléporteurs | ✅ |

Remarques :

- **Position de départ** : le groupe démarre sur une **tuile téléporteur** (map 0, (1,3)), fermée et invisible :
  c'est l'entrée du donjon. Le validateur refuse donc seulement un départ dans un mur.
- **Objets non placés** (présents dans la source) : `weapons[105]`, `scrolls[33]`, `potions[37]`, `miscellaneous[8, 116]`.
- **Libellés d'actuators** : 4 compteurs (wall type 6) ont un commentaire supplémentaire
  `Wall 06 specific: position ignored` placé avant le libellé. Le convertisseur cherche donc le libellé dans tous les commentaires.

## 6. Chargement côté navigateur

```js
// Module ES6, sans bundler
const dungeon = await fetch('./data/dungeon.json').then((r) => r.json());
const map = dungeon.maps[0];
const char = map.grid[y][x];
const tile = map.tiles[`${x},${y}`]; // undefined = mur ou sol nu
```

Le JSON doit être servi en HTTP (`npx serve`, `python3 -m http.server`…) : `fetch` ne fonctionne pas en `file://`.

## 7. Suite

- **003** : les 14 niveaux, un rendu ASCII global avec les offsets, et la vérification de la superposition
  des escaliers et des trappes d'un niveau à l'autre.
