# 033 — Sorts, phase G3 : Open Door, Fireball, Torch

> Quatrième sous-phase du plan [029-sorts-et-lumiere-plan.md](029-sorts-et-lumiere-plan.md), après [032-lumiere-phase-h1.md](032-lumiere-phase-h1.md). Suivante : G4 (parchemins et infobulles).
> Sources :
> - ReDMCSB : `MENUS.C` (`F412`), `CHAMPION.C` (`F327`, `F303`), `PROJEXPL.C` (`F213`, `F216`, `F217`, `F219`, `F220`), `GROUP1.C` (`F191`), `GROUP2.C` (`F232`) ;
> - moteur DM de ScummVM, pour la défense des portes ;
> - Encyclopaedia, *Creature Details*, colonne *Fire resistance*.
>
> Voir [000-sources.md](000-sources.md).

## 1. Ce qui est fait

Les trois sorts de magicien retenus agissent dans le donjon :

- **Open Door** (Zo) et **Fireball** (Ful Ir) partent en projectiles magiques depuis le groupe. Dans la vue, ce sont des sphères lumineuses : orange pour la boule de feu, bleue pour Open Door ;
- **Torch** (Ful) ajoute de la lumière magique au modèle de H1. On ne la voit pas encore : elle s'affiche dans la ligne d'état, et sera rendue en H2.

| Fichier | Rôle |
|---|---|
| `src/sim/magic.js` | Nouveau. Énergie d'un sort projectile, lancer, sort Torch, impacts sur une porte, un mur ou une créature, explosion de la boule de feu, porte détruite |
| `src/sim/projectiles.js` | Un projectile peut porter un sort (`spell`, `attack`) au lieu d'un objet. Déplacement du moteur, nouveau crochet `impact` |
| `src/sim/logic.js` | `doorAt()`, `toggleDoor()`, `breakDoor()` (la casse au coup de `clickDoor` passe par la même fonction) |
| `src/sim/spells.js` | Les effets sont donnés par sort (`effects[spell.effect]`). Raison `cast` pour un sort qui agit |
| `src/sim/simulation.js` | `createMagic()`, `woundChampion()` (portes et boule de feu), blessures des créatures par le feu |
| `src/core/creature-info.js` | Colonne `fireResistance` (0 à 15, 15 = insensible) |
| `src/render/first-person/fp-renderer.js` | Sphères des sorts en vol, à hauteur d'œil, de taille proportionnelle à l'énergie (§ 3) |
| `src/main.js` | Messages : sort lancé, créature brûlée, groupe brûlé, porte en éclats (avec un flash) |
| `tools/test-magic.mjs` | 17 vérifications |

**Événements :** `explosion { level, x, y, spell }`, `doorBroken { level, x, y, by }`. `creatureHit` et `championHit` portent `spell: 'fireball'`.

## 2. Lancer un sort projectile (`F412`, `F327`)

**Énergie :** `borne(21, (p + 2) × (4 + 2 × compétence), 255)`, avec p = 1 (Lo) à 6 (Mon).
- Open Door compte la compétence **doublée**.
- Compétence : Air pour Open Door, Fire pour Fireball.

**Perte par pas :** `10 − min(8, mana max / 8)`. Si l'énergie est inférieure à 4 fois la perte, elle gagne 3 et la perte baisse de 1.

**Attaque de départ :** 90. Elle baisse de la perte à chaque pas, comme l'énergie.

**Zed** (Fire 1, Air 2, 10 de mana) a une perte de 9 :

| Sort | Énergie | Portée |
|---|---|---|
| Lo Zo | 36 | 2 cases |
| Lo Ful Ir | 24 (perte 8) | à peine plus d'une case |
| Mon Ful Ir | 48 | environ 3 cases |

**Niveau de compétence :** pris tel quel dans la fiche de Zed (lettres décodées en doc 010), au minimum 1. Le moteur le calcule d'après l'expérience (`F303`). C'est une approximation, à revoir avec C3c.

**Départ :** le projectile part du rang avant de la case du groupe, côté droit (main d'action).

## 3. Déplacement (`F219`)

- **Pas :** deux pas par case, un pas par tick (comme les objets lancés, doc 024).
- **Premier pas :** gratuit.
- **Pas suivants :** si l'énergie n'est plus au-dessus de la perte, le sort **s'éteint** sans effet. Sinon, l'énergie et l'attaque baissent de la perte.
- **Porte :** un sort **entre** dans la case d'une porte, même fermée, et rencontre la porte en la traversant.
- **Mur, faux mur fermé, escalier :** le sort les rencontre **depuis sa propre case**.

### Taille du sort en vol

Dans DM, un sort en vol est dessiné à une échelle qui suit son énergie **courante** (ReDMCSB `DUNVIEW.C`, `F115`) : `× max(96, énergie + 1) / 256`.
Il est donc :
- plus gros quand il est puissant ;
- de plus en plus petit à mesure qu'il avance ;
- jamais sous 37,5 % de sa taille maximale.

Ici, la sphère a un rayon de `0,12 × max(96, énergie + 1) / 256` case : 0,12 à l'énergie 255, 0,045 au minimum.
Les sorts de Zed (énergie 48 au plus) sont donc dessinés à la taille minimale.

### Fin de course : obstacle ou énergie ?

Un sort s'arrête aussi quand son énergie est épuisée, sans exploser. C'est dans `F219` :
- avant chaque pas, si l'énergie n'est pas au-dessus de la perte par pas, le projectile est supprimé (`F215`) ;
- `F215` ne crée pas d'explosion pour un sort.

Mais la perte par pas dépend du **mana maximum** du lanceur. Avec 64 de mana ou plus, elle tombe à 2 :
une boule de feu Mon d'énergie 255 fait alors environ 127 pas, soit une soixantaine de cases.
Pour un magicien confirmé, le sort ne s'arrête donc en pratique que sur un obstacle.
Zed, avec 10 de mana, perd 9 par pas, d'où ses sorts très courts.

## 4. Impacts (`F217`, `F213`, `F220`)

**Open Door sur une porte :**
- la porte a un bouton : elle est actionnée comme par son bouton (`toggle`), au tick suivant. Une porte fermée s'ouvre, une porte ouverte **se ferme** : le sort traverse son embrasure et l'actionne quand même ;
- elle n'a pas de bouton : rien.

Le sort s'arrête dans les deux cas.

**Open Door sur une créature :** pas de dégâts, le sort s'arrête. Une créature immatérielle le laisse passer.

**Fireball sur une porte :**
- une porte ouverte au moins aux 3/4 (cran ≤ 1), ou cassée, laisse passer la boule ;
- sinon, la boule frappe la porte :
  1. une porte cassable à la force (`force`) cède si l'attaque d'impact + un aléa ≥ sa défense ;
  2. la boule explose sur la case de la porte ;
  3. au tick suivant, une porte **fermée** cassable par la boule de feu (`fireball`) cède si l'attaque d'explosion ≥ sa défense.

**Défense des portes** (`G0254_DoorInfo`, valeurs de ScummVM) :

| Type | Défense |
|---|---|
| Portcullis | 110 |
| Wooden | 42 |
| Iron | 230 |
| Ra | 255 |

**Fireball sur une créature :**
- **Black Flame :** la boule la soigne et s'arrête, sans exploser ;
- **créature immatérielle :** la boule la traverse ;
- **autre créature :** une créature du groupe perd `(attaque d'impact × 64) / défense`, puis la boule explose sur la case.

**Fireball contre un mur :** elle explose sur sa propre case. Lancée face à un mur, elle explose donc **sur le groupe**, comme dans DM.

**Formules :**
- **Attaque d'impact** (`F216`) :
  1. `a = rnd(16) + rnd(16) + 10` ;
  2. `a = ((a + énergie) >> 4) + 1` ;
  3. `a += rnd(a / 2 + 1) + rnd(4)` ;
  4. résultat : `max(a / 2, a − (32 − attaque / 8))`.
- **Attaque d'explosion :** `(énergie / 2 + 1)`, plus un aléa de 1 à autant.
- **Explosion** (`F213`, puis `F191`) :
  - sur la case du groupe : Zed perd l'attaque. **Provisoire** : ni armure ni résistance au feu, en attendant C3c ;
  - sinon, chaque créature de la case perd l'attaque. On applique d'abord :
    - une réduction aléatoire selon la résistance au feu ;
    - le quart seulement pour une créature immatérielle ;
    - l'immunité à 15 ;
    - l'étalement de `F191` (un huitième retiré, puis un aléa).

**Avec Zed :** son énergie maximale (48) donne une explosion de 21 à 40. Il ne peut donc pas casser une porte en bois (défense 42). Il faut un lanceur plus fort : le test monte sa compétence Fire à 6 pour le vérifier.

## 5. Torch (`F412`)

Lumière magique de puissance `p + 2` pendant `2000 + ((4(p + 1) − 3) << 7)` ticks, puis décroissance d'un cran tous les 4 ticks (H1, `addMagical`).

| Sort | Lumière | Durée |
|---|---|---|
| Lo Ful | 24 | 2 640 ticks, environ 7 min 20 s |
| Mon Ful | 59 | 5 200 ticks, environ 14 min 30 s |

## 6. Vérification

- **`node tools/test-magic.mjs` :**
  - projectile magique sans objet ;
  - portée de Lo Zo ;
  - **porte (1, 0) du niveau 1 ouverte par Lo Zo, depuis (0, 0) face à l'est**, puis refermée par un second Lo Zo ;
  - porte sans bouton intacte ;
  - porte en bois intacte avec Zed, détruite avec Fire 6 ;
  - Skeleton brûlé ;
  - groupe brûlé par sa propre boule contre un mur ;
  - durée et décroissance de Torch.
- **Les 7 autres tests** passent toujours (dans `test-spells.mjs`, Torch rend maintenant la raison `cast`).
- **Navigateur** (serveur `127.0.0.1:5500`) : « Mon Ful Ir » au départ fait partir une sphère orange dans le couloir. Aucune erreur dans la console.
  La taille selon l'énergie n'a pas pu être vue : le vol dure environ 1 s, moins que le délai d'une capture.

**Critère de fin :** au niveau 1, « Lo Zo » face à la porte (1, 0) l'ouvre. Vérifié par le test.
