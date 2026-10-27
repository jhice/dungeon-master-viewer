# 019 — Objet en main, coffres, portes cassables

> Suite de [018-decors.md](018-decors.md), après une exploration du donjon par l'utilisateur.
> Objectif : se rapprocher du comportement d'origine, où l'on trie les objets devant soi avec la main (le pointeur), sans passer par l'inventaire.

## 1. La main, distincte de l'inventaire

**Avant**, un objet ramassé allait dans l'inventaire, et la « main » n'était que l'un des objets de l'inventaire. **Maintenant**, la main tient **un objet à part**, comme le pointeur de DM :

| Action | Effet |
|---|---|
| Clic sur un objet à portée (main vide) | L'objet vient **en main** |
| Clic sur le sol à portée, objet en main | L'objet y est posé |
| Clic sur une alcôve, main vide | L'objet du **dessus** vient en main, un seul à la fois |
| Clic sur une alcôve, objet en main | L'objet y est posé |
| Support à objet (torche, égout) | Prend l'objet en main, ou le donne à la main vide |
| Serrure | La clé doit être en main, et la serrure la garde |
| **Ranger** (bouton de la barre d'inventaire) | L'objet en main va dans l'inventaire |
| Clic sur un objet de l'inventaire | Il vient en main ; l'objet tenu retourne dans l'inventaire |

**Portée :** inchangée, les 4 sous-cases de la doc 017. Le détecteur d'objet porté (« WELCOME BACK ») compte l'inventaire **et** la main.

**Interface :**
- La barre d'inventaire affiche d'abord la **main**, avec le nom de l'objet ou « Main vide », puis le bouton **Ranger**, puis les objets de l'inventaire.
- Une **infobulle** suit le pointeur dans la vue : le nom de l'objet en main, ou à défaut celui de l'objet survolé.
- Le curseur reste le carré de couleur de l'objet en main.

**Implémentation :**
- `state.hand` (`src/sim/state.js`).
- `pickUp`, `drop`, `stow` et `takeFromInventory` dans `src/sim/logic.js`, exposés par la simulation (`sim.stow()`, `sim.takeFromInventory(i)`).
- Option `labelOf` de la vue à la première personne.

## 2. Coffres

Les coffres ne s'ouvrent pas encore. Quand on **range** un coffre :
- le coffre et **tous ses objets** entrent dans l'inventaire ;
- le coffre est noté vidé (`state.emptiedChests`), pour qu'on ne puisse pas récupérer son contenu une seconde fois.

Exemple : le coffre N1 (2, 31) donne 8 objets (Drumstick, Corn, Cheese, Bread ×2, Magical Box (Blue), Scroll, Empty Flask).

**Limite :** un coffre vidé, reposé au sol, garde l'anneau « contient des objets » en 2D et en 3D. Ces vues lisent le contenu dans `dungeon.json`.

## 3. Portes cassables

**Données :** 12 portes ont `force: true` (cassables par la force), et toutes ont aussi `fireball: true` (cassables par une boule de feu). Il y a 10 portes en bois et 2 herses :

```
N1 (11, 0), (6, 1), (29, 27)   N3 (21, 25), (22, 30), (0, 4), (18, 14), (23, 3)
N4 (7, 28), (4, 28)            N7 (16, 5)                       N10 (8, 12)
```

Les portes Ra et en fer ne sont jamais cassables.

**Dans DM :** d'après ma connaissance du moteur, chaque coup compare la force de l'attaque à la **défense** du type de porte. Cette force dépend du champion, de l'arme et du hasard. La porte cède dès qu'un coup dépasse sa défense : les coups **ne s'additionnent pas**. **À vérifier.**

**Ici**, le groupe étant abstrait :
- Le nombre de coups est **fixe** : **3 pour une porte en bois, 6 pour une herse** (`DOOR_HITS` dans `logic.js`, réglable).
- Un coup = un clic ou Espace sur la porte **fermée** devant soi, avec une **arme en main** (objet de la catégorie `weapon`). La barre d'état compte : « Coup sur la porte (2/3) ».
- Au dernier coup, la porte est **cassée** : `detail.broken`, ouverte pour de bon. Les mécanismes ne la referment plus. La fenêtre flashe, et la barre d'état annonce « La porte vole en éclats ».
- Une porte à bouton garde son bouton si on clique sans arme.
- Les boules de feu (`fireball`) attendent la magie.

**Visuel :**
- La porte cassée reste en place, avec un grand trou aux bords déchiquetés et des restes sur les côtés et en haut. On voit à travers (`brokenDoor()` dans `ornament-art.js`).
- En 2D et dans les infobulles, l'état devient « cassée (franchissable) ».

## 4. Vérifications

**Node :**
- la Gold Key ramassée est en main, et « Ranger » la met dans l'inventaire ;
- la serrure ne réagit pas main vide, mais réagit à la clé reprise de l'inventaire, qui disparaît ;
- le coffre N1 (2, 31) rangé donne 9 entrées : le coffre et ses 8 objets ;
- la porte N3 (22, 30), frappée avec une arme en main : 1/3, 2/3, puis cassée, et le passage est libre ;
- non-régression : la porte (18, 1) et ses plaques, et la marche aléatoire de 200 000 actions sans exception.

**Chrome :**
- infobulle sur l'objet survolé (« Empty Flask »), puis sur l'objet en main ;
- main et « Ranger » dans la barre ;
- l'arme reprise en main casse la porte N3 (22, 30) au 3e coup, et le trou montre le couloir derrière ;
- aucune erreur dans la console.

## Sources

Aucune nouvelle source. Drapeaux des portes : doc 002 (`doors[].force`, `fireball`). Le principe attaque contre défense
vient de ma connaissance du moteur de DM, sans consultation de ReDMCSB.
