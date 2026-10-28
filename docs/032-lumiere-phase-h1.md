# 032 — Lumière, phase H1 : modèle de lumière dans la simulation

> Troisième sous-phase du plan [029-sorts-et-lumiere-plan.md](029-sorts-et-lumiere-plan.md), après [031-sorts-phase-g2.md](031-sorts-phase-g2.md). Suivante : G3 (Open Door, Fireball, Torch).
> Sources :
> - ReDMCSB : `INVNTORY.C` (`F337`, `F338`), `TIMELINE.C` (`F257`), `CHAMPION.C` (`F300`, `F301`) et `MAIN.C` ;
> - moteur DM de ScummVM, pour les deux tables.
>
> Voir [000-sources.md](000-sources.md).

## 1. Ce qui est fait

La simulation sait combien il y a de lumière autour du groupe, et quelles torches brûlent. **Rien n'est encore dessiné**, c'est l'objet de H2.
La valeur s'affiche dans la ligne d'état de la fenêtre de jeu, par exemple « lumière 147 (palette 0, torche 15, torche 13) », ou « lumière permanente » au niveau 0.

| Fichier | Rôle |
|---|---|
| `src/sim/light.js` | Tables, `paletteOf()`, `torchesLightAmount()`, `createLight()` : `current()`, `update()`, `tick()`, `addMagical()`, `reset()` |
| `src/sim/simulation.js` | `sim.light` (lumière courante), `sim.addMagicalLight(power, ticks)` (pour le sort Torch de G3). Mise à jour à chaque tick, à chaque changement des mains et à chaque déplacement |
| `src/sim/state.js` | Les charges et l'état `lit` des torches sont restaurés au `reset()`, comme les potions (doc 031) |
| `src/core/contents.js` | Note d'une torche : « 15 charges, allumée », ou « consumée » à 0 charge |
| `src/main.js` | Ligne d'état avec la lumière. Message « Une torche s'est consumée » |
| `tools/test-light.mjs` | 23 vérifications |

**Événements :**
- `lightChanged { amount, palette, permanent, torches, magical }` : émis seulement quand la quantité ou les torches changent ;
- `torchesWorn { torches }` : les torches en main ont perdu une charge.

## 2. Règles du moteur reprises

**Niveau de difficulté 0** (le Hall, niveau 0 de DM) : toujours la palette la plus claire (`F337`). Ici : `permanent: true`, quantité 100.

**Torches en main** (`F337`) :
- Seules les deux mains comptent : une torche au curseur n'éclaire pas et ne s'use pas, comme dans DM (doc 029, Q5).
- La puissance d'une torche est son **nombre de charges** (0 à 15).
- Les torches sont **triées** de la plus forte à la plus faible.
- La quantité de chacune est `LightPowerToLightAmount[charges]`, pondérée par `(q << m) >> 6`, avec `m` = 6, 5, 4, 3, 2. Cela fait 100 %, 50 %, 25 %, 12,5 %, 6,25 %, sur 5 torches au plus.
- Le multiplicateur ne baisse qu'après une torche non vide.

**Quantité totale** = torches + lumière magique. La **palette** est la première dont le seuil est ≤ la quantité :

| Palette | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| Quantité minimale | 99 | 75 | 50 | 25 | 1 | ≤ 0 (noir) |

**Table `LightPowerToLightAmount`** (puissance 0 à 15) : 0, 5, 12, 24, 33, 40, 46, 51, 59, 68, 76, 82, 89, 94, 97, 100.

Les deux tables viennent de `graphics.dat` (item 562). Elles ne sont pas dans le code de ReDMCSB. Les valeurs sont celles de ScummVM (`engines/dm/champion.cpp` et `inventory.cpp`), qui lit les mêmes données.

**Allumage** (`F301`, `F300`) : une torche s'allume quand on la met dans une main, et s'éteint quand on l'en retire. Ici, `entry.lit` est recalculé à chaque mise à jour.

**Usure** (`MAIN.C`, `F338`) : quand le temps de jeu est un multiple de **512 ticks**, chaque torche en main non vide perd une charge.
Une torche neuve (15 charges) dure donc 15 × 512 = 7 680 ticks, soit environ 21 minutes. À 0 charge, elle est consumée et n'éclaire plus.

**Lumière magique** (`F404`, `F257`) :
- `addMagical(p, durée)` ajoute `LightPowerToLightAmount[p]` ;
- après la durée, la lumière baisse d'un cran de puissance tous les **4 ticks**, jusqu'à 0 ;
- une puissance négative (sort Darkness) retire de la lumière, puis la rend par crans.

G3 l'appellera pour le sort Torch : puissance `p + 2`, durée `2000 + ((4(p+1) − 3) << 7)` (doc 029 § 1).

## 3. Écarts et limites

- **Torches murales :** pas encore de lumière. Ce sera en H2, comme sources Three.js (écart voulu à DM, doc 029).
- **Illumulet et actions « Light » des bâtons :** pas gérés. Ils passeront par `addMagical`.
- **Débogage :** la ligne d'état de la fenêtre de jeu remplace un indicateur dans le panneau de configuration. Le rendu de H2 rendra la lumière visible.

## 4. Vérification

- **`node tools/test-light.mjs` :**
  - tables et palettes ;
  - niveau 0 éclairé, niveau 1 noir sans torche ;
  - torche en main (100) et au curseur (0) ;
  - usure après 512 ticks, torche au curseur intacte ;
  - deux torches pondérées (100 + 94 / 2), torche consumée ;
  - lumière magique et obscurité par crans ;
  - reset.
- **Les 6 autres tests** passent toujours.
- **Navigateur** (serveur `127.0.0.1:5500`) : la torche de Zed mise en main d'action, la ligne d'état affiche « lumière permanente » au niveau 0. Aucune erreur dans la console.

**Critère de fin :** les tests passent, et la lumière courante est affichée.
