# 037 — Lumière : refonte simplifiée

> Remplace le rendu de la lumière des docs [035](035-lumiere-phase-h2.md) (H2) et [036](036-lumiere-phase-h3.md) (H3). Le modèle de la simulation ([032](032-lumiere-phase-h1.md), `src/sim/light.js`) ne change pas.
> Sources : ReDMCSB, `F337_INVENTORY_SetDungeonViewPalette` (6 palettes de la vue, déjà citée en 032) ; Three.js 0.170, `PointLight` (`intensity`, `distance`, `decay`), d’après les connaissances préalables de l’API. Voir [000-sources.md](000-sources.md).

## 1. Pourquoi

- Les ombres des lumières ponctuelles (cube maps) faisaient ramer la vue sur la machine de l'utilisateur.
- Le résultat voulu est plus simple : **une seule quantité de lumière**, celle de DM (torches en main et sorts, niveau 0 toujours éclairé), qui règle à la fois l'**intensité** et la **portée** de la lumière : plus c'est sombre, moins on voit loin.

## 2. Ce qui est supprimé

Il n'en reste aucune trace dans le code, ni dans le panneau de configuration :

- **les ombres :** `shadowMap`, lumières à ombre, réglage « Ombres » ;
- **le scintillement :** boucle d'animation à 30 images/s, réglage « Scintillement des flammes » ;
- **le brouillard :** `scene.fog`, réglage « Brouillard » ;
- **le relief des textures :** `normal-map.js`, normal maps, réglage « Relief des textures » ;
- **la lumière hémisphérique** et le réglage « Lumière globale » (0 à 100 %) ;
- **les lumières séparées** de la torche du groupe (côté de la main) et de la lumière magique ;
- **la portée des torches** (`torchRange`) ;
- **les couleurs :** toutes les lumières sont blanches.

Les préférences enregistrées gardent peut-être d'anciennes clés (`shadows`, `fog`…). `main.js` les ignore et les efface au prochain changement d'un réglage de la lumière.

## 3. Le nouveau modèle (`fp-lights.js`)

**Lumière du groupe :** une `PointLight` blanche portée par l'œil.

1. La simulation donne la **palette** de DM, de 0 (la plus claire) à 5 (noir), d'après la quantité de lumière des torches en main et des sorts (`paletteOf`, doc 032).
2. La palette donne un **ratio** par paliers : 1 ; 0,8 ; 0,6 ; 0,4 ; 0,2 ; 0.
3. Ce ratio module les réglages :
   - intensité = `intensité × ratio` ;
   - portée = `portée × ratio`, au moins 1 case ;
   - atténuation (`decay`) : celle du réglage, sans changement.
4. Au niveau 0 (difficulté 0), ou avec la case « Lumière permanente », le ratio vaut toujours 1.

Plus loin que la portée, la lumière s'éteint en douceur (coupure de `PointLight.distance`), puis c'est le noir.

**Porte-torches** (case « Torches murales lumineuses », cochée par défaut) :
- une `PointLight` blanche devant chaque « Full Torch Holder » du niveau, avec les réglages à pleine puissance, sans ratio ;
- **écart avec DM :** les porte-torches y sont purement décoratifs ; ici, ils éclairent ;
- il y a 4 lumières au plus, autant que de porte-torches au niveau 1, le niveau qui en a le plus. Toutes sont allumées : il n'y a plus de choix des plus proches.

**Champs des téléporteurs :** leur lueur suit le ratio du groupe. On les voit à peine dans le noir, et en plein à la lumière du Hall.

**Nombre de lumières :** il reste fixe (1 + 4). Une lumière inutilisée a une intensité 0, si bien que changer un réglage ne recompile jamais les shaders.

## 4. Panneau « Lumière (vue du jeu) »

| Réglage | Clé | Bornes | Défaut |
|---|---|---|---|
| Intensité | `intensity` | 0,1 à 10, pas de 0,1 | 2,5 |
| Portée | `distance` | 1 à 6 cases, pas de 0,5 | 4 |
| Atténuation | `decay` | 0 à 10, pas de 0,1 | 1 |
| Lumière permanente (tout à 100 %) | `permanentLight` | case | non |
| Torches murales lumineuses | `torchHolders` | case | oui |

Les défauts sont dans `lighting-settings.js`. Les réglages s'appliquent tout de suite et sont gardés dans les préférences du navigateur.

Avec une atténuation de 0, la lumière reste égale jusqu'au bord de sa portée. Avec 2 ou plus, elle tombe vite et il faut monter l'intensité.

## 5. Fichiers

| Fichier | Changement |
|---|---|
| `src/render/first-person/fp-lights.js` | Réécrit : lumière du groupe, porte-torches, lueur des téléporteurs |
| `src/render/first-person/lighting-settings.js` | Nouveaux réglages |
| `src/render/first-person/fp-renderer.js` | Ni ombres, ni boucle d'animation, ni relief : le rendu se fait seulement à la demande |
| `src/render/first-person/normal-map.js` | Supprimé |
| `src/main.js` | Section du panneau, filtrage des anciennes clés des préférences |

## 6. Vérification

- `node tools/test-light.mjs`, `test-magic.mjs` et `test-spells.mjs` : tout est bon (le modèle n'a pas changé).
- Navigateur, niveau 0 : vue éclairée en blanc, le couloir se perd dans le noir au-delà de la portée ; panneau avec les 5 nouveaux réglages ; aucune erreur dans la console.
- **Reste à vérifier par l'utilisateur :**
  - un niveau sombre, avec et sans torche (paliers quand la torche s'use) ;
  - les porte-torches du niveau 1 ;
  - les bons défauts des trois curseurs.
