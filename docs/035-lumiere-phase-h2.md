# 035 — Lumière, phase H2 : rendu des torches, ombres, scintillement

> Sous-phase du plan [029-sorts-et-lumiere-plan.md](029-sorts-et-lumiere-plan.md), après [034-sorts-phase-g4.md](034-sorts-phase-g4.md). Suivante : H3 (réglages et finitions).
> Elle dessine le modèle de lumière de H1 ([032-lumiere-phase-h1.md](032-lumiere-phase-h1.md)).
> Sources : Three.js 0.170 (lumières ponctuelles, ombres cubiques), d'après les connaissances préalables de l'API. Voir [000-sources.md](000-sources.md).

## 1. Ce qui est fait

La vue à la première personne est éclairée par la lumière de la simulation (`sim.light`) :

- **Niveau 0** (difficulté 0, le Hall) : rien ne change, la lumière reste pleine, avec le brouillard.
- **Autres niveaux :** il n'y a plus de lumière globale. Sans torche, la vue est **noire**.
- **Torche en main :** elle éclaire autour du groupe, du côté de sa main, avec des ombres.
- **Porte-torche plein :** il éclaire son couloir. Il s'éteint quand on prend la torche.
- **Lumière magique** (sort Torch) : une lumière froide et large, centrée sur le groupe, sans scintillement.
- **Scintillement** des flammes : torche du groupe et porte-torches.

| Fichier | Rôle |
|---|---|
| `src/render/first-person/fp-lights.js` | **Nouveau.** Lumières de la vue : lumière globale, torche du groupe, lumière magique, porte-torches, budget d'ombres, scintillement. Réglages dans `LIGHTING` |
| `src/render/first-person/fp-renderer.js` | Ombres activées, `castShadow` / `receiveShadow` des meshes, `setLight(light)`, boucle d'animation tant qu'une flamme brûle |
| `src/render/first-person/fp-decor.js` | `build()` renvoie aussi `torchHolders` : les faces de mur qui montrent un « Full Torch Holder » |
| `src/main.js` | Transmet `sim.light` à la vue, à l'ouverture et à chaque `lightChanged` |

## 2. Les lumières

| Lumière | Type Three.js | Intensité | Portée | Ombre |
|---|---|---|---|---|
| Globale | `HemisphereLight` | 1,6 au niveau 0, sinon 1,6 × `globalLight` (0 par défaut) | — | — |
| Appoint du groupe | `PointLight` sur la caméra | 2,2 × la même part que la globale | infinie | non |
| Torche du groupe | `PointLight` sur la caméra, à hauteur de main | 2,6 × force des torches | `torchRange` = 3,5 cases (le `fogFar` de la vue) | oui |
| Lumière magique | `PointLight` sur la caméra, au centre | 2,2 × force de la lumière magique | 1,6 × `torchRange` | non |
| Porte-torches | 4 `PointLight` dans la scène | 2,2 | `torchRange` | les 2 plus proches |

**Force d'une quantité de lumière** (0 à 100 du modèle, voir 032) : `√(quantité / 100)`. Avec la racine, une torche presque consumée (quantité 5) éclaire encore un peu, comme les palettes sombres de DM.
- Les torches comptent ensemble, pondérées comme dans `F337` (`torchesLightAmount`).
- Une lumière magique négative (sort Darkness) retire d'abord sa part aux torches.

**Position de la torche du groupe :** à 0,16 case à gauche (main de réserve) ou à droite (main d'action), 0,1 sous l'œil et 0,12 en avant. C'est la main de la torche la plus forte. Avec deux torches de même force, la lumière est au centre.

**Porte-torches :** la lumière est à 0,14 case devant la face du mur, à 75 % de la hauteur du mur (la flamme du dessin). Les 4 lumières vont aux porte-torches les plus proches du groupe, à moins de `2 × torchRange + 1` cases. Il y en a 4 au plus sur un niveau de DM (niveau 1).

**Brouillard :** au niveau 0, il reste comme avant (de 2,5 à 3,5 cases). Ailleurs, il est repoussé : le noir au-delà de la portée des lumières le remplace. Sinon, un porte-torche lointain ne se verrait pas au bout de son couloir.

## 3. Ombres

- **Carte d'ombre** `PCFShadowMap`, 512 × 512 par face du cube, biais −0,004 et biais normal 0,02.
- **Projettent une ombre :** murs, portes, marches, objets, créatures (des `InstancedMesh` opaques).
- **Ne projettent pas d'ombre :** sol, plafond, trappes, décors plaqués (ornements, inscriptions, niches) et parties translucides (téléporteurs, faux murs imaginaires). Ils reçoivent les ombres.
- **Budget** (doc 029, Q6) :
  - une `PointLight` avec ombre coûte 6 rendus de la scène ;
  - il y en a 3 au plus : la torche du groupe et les 2 porte-torches les plus proches.
- **Nombre de lumières fixe :** les lumières inutilisées restent dans la scène, à intensité 0. Leur ombre n'est plus recalculée (`shadow.autoUpdate = false`). Ainsi, changer la lumière ne recompile jamais les shaders.

## 4. Scintillement et boucle de rendu

- **Bruit lent** : une somme de trois sinus de périodes sans rapport, avec une phase par flamme.
- **Effet** : l'intensité varie de ±10 %. Les sources **ne bougent pas**, pour que les ombres restent valables (voir § 7).
- **Rendu :**
  - **Sur demande, tout de suite :** déplacement, changement d'état, lumière, redimensionnement. Ce rendu redessine aussi les ombres (`shadowMap.autoUpdate = false`, `needsUpdate` à chaque rendu sur demande).
  - **Scintillement :** tant qu'une flamme brûle (torche du groupe, ou porte-torche allumé à portée), une boucle change son intensité environ **30 fois par seconde** (`FLICKER_MS` = 33). Elle redessine sans recalculer les ombres, puis s'arrête d'elle-même.
  - La lumière magique, qui ne scintille pas, ne déclenche pas la boucle.
- **Option :** `LIGHTING.flicker`. Le panneau de configuration l'exposera en H3.

## 5. Écarts et limites

- **Écart voulu à DM :** les porte-torches éclairent (doc 029). Dans DM, seules les torches en main et les sorts comptent.
- **Téléporteurs :** leur matière est émissive, ils restent donc visibles dans le noir. C'est à reconsidérer en H3 avec le réglage de la lumière globale.
- **Valeurs réglées à l'œil** : intensités, décroissance (1,2 pour les flammes, 1 pour la magie), couleurs, position de la torche. **Provisoires.**
- **Réglages** : `LIGHTING` (`globalLight`, `torchRange`, `flicker`, `shadows`, `holderShadows`) est une constante du module. Les curseurs et les cases à cocher viendront en **H3**.
- **Les sorts en vol** (boule de feu) n'émettent pas de lumière.

## 6. Vérification

- **Tests Node** (8) : ils passent toujours. H2 ne touche pas à `src/sim/`.
- **Navigateur** (serveur `127.0.0.1:5500`) :
  - niveau 0 : vue inchangée, lumière permanente ;
  - niveau 1, case (6, 2), sans torche : vue entièrement noire ;
  - même case, torche de Zed (15 charges) en main d'action : murs éclairés autour du groupe, noir au-delà de 3 cases environ, l'ombre d'une créature sur le mur du fond ;
  - niveau 1, case (17, 13), face à l'ouest : le porte-torche (15, 13) éclaire le couloir, et un objet au sol projette son ombre. Avec la torche en main en plus (3 lumières à ombre), le navigateur tient environ 240 images par seconde, la fréquence de l'écran ;
  - sort Torch simulé (`addMagicalLight(5, 200)`, quantité 40) : lumière froide autour du groupe ;
  - aucune erreur dans la console.

## 7. Retour : sensation de lag

**Version initiale :** le scintillement déplaçait aussi les sources, de 1 cm environ. Une source qui bouge oblige à recalculer sa carte d'ombre. Chaque image de la boucle refaisait donc les 3 cartes cubiques, soit 19 rendus de la scène, à la fréquence de l'écran. De plus, pendant le scintillement, un déplacement attendait l'image suivante pour s'afficher.

**Mesures**, dans Chrome, vue de 630 × 473 et écran à 240 Hz, au niveau 1 en (17, 13), avec la torche en main et le porte-torche (3 lumières à ombre) :

| | Avant la correction | Après |
|---|---|---|
| Coût d'une image avec ombres (rendu synchrone, `readPixels`) | 1,26 ms (1,59 ms en 1600 × 1200) | 0,94 ms, seulement quand la vue change |
| Coût d'une image de scintillement | 1,26 ms (avec ombres) | 0,42 ms (sans ombres) |
| Images de scintillement par seconde | ≈ 240 (fréquence de l'écran) | ≈ 30 |
| Délai entre la commande et le rendu | ≈ 4 ms (image suivante) | rendu dans la commande, sans attendre l'image suivante |

**Ce que montrent les mesures :**
- Sur cette machine, il n'y avait ni image perdue ni tâche longue. La surcharge du GPU n'est donc **pas confirmée** ici.
- La seule différence mesurée est le délai d'une image, environ 4 ms à 240 Hz. Il atteindrait environ 16 ms à 60 Hz.

La correction réduit quand même le coût du scintillement d'un facteur 3 environ, et son nombre d'images d'un facteur 8.

**À revoir** avec les déplacements fluides (phase F) : la caméra bougera à chaque image, et les ombres de la torche du groupe devront suivre.

**Critère de fin (doc 029) :**
- niveau 1 noir sans torche ;
- torche en main avec ombres ;
- porte-torche qui éclaire son couloir ;
- plus de 60 images par seconde.

Tous les points sont atteints.
