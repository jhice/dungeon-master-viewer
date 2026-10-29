# 040 — Sons : inventaire (phase 1)

> Suite de la [039](039-sons.md), qui pose les objectifs.
> Choix technique tranché par l'utilisateur : **Web Audio API** directe (pas de Howler pour l'instant).
> Sources : ReDMCSB Release 2 (`SOUND.C`, `DEFS.H` et les fichiers qui demandent un son), page graphics.dat d'Amiga 3.6 sur greatstone, page des créatures de la *Dungeon Master Encyclopaedia*. Voir [000-sources.md](000-sources.md).

## 1. Deux versions du jeu, deux jeux de sons

| | Atari ST (code de ReDMCSB) | Amiga 3.6 (graphics.dat de greatstone) |
|---|---|---|
| Nombre de sons | 22 entrées dans la table des sons, dont 15 utilisées | **33 sons** (graphismes 671 à 712) |
| Pas des créatures | aucun | 7 sons de déplacement, selon l'espèce |
| Cri de guerre, Horn of Fear | non | oui |
| Lecture | **un seul son à la fois**, en mono, sur le circuit sonore de l'ST, à 5 486 Hz en 4 bits | non vérifiable : ReDMCSB Release 2 ne couvre que l'Atari ST |

On vise les **33 sons d'Amiga 3.6** : c'est la version la plus riche, et la DM Encyclopaedia y rattache les sons de chaque créature. Les règles de déclenchement viennent du code ST, le seul qu'on puisse lire. On les étend à l'Amiga pour les sons qui n'existent que là (pas, cri de guerre, cor).

## 2. Les règles du moteur (ReDMCSB, `F064` dans `SOUND.C`)

Chaque son a une fiche (`SOUND`, table `G060`, chargée depuis le graphisme 562), avec :
- **`Priority`** : la priorité ;
- **`LoudDistance`** et **`SoftDistance`** : deux seuils de distance.

Les valeurs de ces fiches sont dans les données du jeu, pas dans le code : je ne les ai pas.

Une demande de son porte une position (x, y) sur la carte, et un mode :

1. **Autre niveau que le groupe** : en mode « si prioritaire » et « plus tard », le son est **ignoré**. Seul le mode « immédiat » passe, et il ne sert qu'aux sons du groupe. On n'entend donc que le niveau du groupe, ce qui confirme ton souvenir.
2. **Distance** : distance de Manhattan entre la source et le groupe (|dx| + |dy|).
   - moins que `LoudDistance` : son **fort** ;
   - moins que `SoftDistance` : son **faible** ;
   - au-delà : **pas de son**.
3. **Modes :**
   - **immédiat** : coupe le son en cours (choc contre un mur, déglutition, téléporteur pris par le groupe, cri) ;
   - **si prioritaire** : le son devient le son « en attente », joué à la boucle suivante, **un seul par tick**. Il remplace le son déjà en attente s'il est plus fort (fort bat faible) ou, à force égale, de priorité plus haute ;
   - **plus tard (n ticks)** : un événement `PLAY_SOUND` est mis dans la timeline (blessure d'un champion, bruit de porte frappée).

On a bien un système anti-« chorus », mais très simple : **un seul son par tick**, choisi par volume puis par priorité. Il n'y a pas de stéréo sur l'ST. Pour l'Amiga, qui a 4 voies et la stéréo, je n'ai pas de source.

## 3. Inventaire : son, déclencheur, données

Les numéros Amiga suivent les libellés de greatstone (« Sound 00 » à « Sound 32 »). La correspondance avec les constantes ST est **déduite des libellés**, sauf mention contraire.

### 3.1 Sons du monde et du groupe (présents sur l'ST)

| Amiga | Libellé | Constante ST | Déclencheur (fichier ReDMCSB) | Position | Mode |
|---|---|---|---|---|---|
| 00 | Falling item | `C00` METALLIC_THUD | une créature tuée lâche au moins une arme (`GROUP1.C`) ; impact d'une arme lancée (`PROJEXPL.C`) | case | prioritaire |
| 01 | Switch | `C01` SWITCH | actuator mural ou au sol **avec le bit `sound`** déclenché (`SENSOR.C`) ; clic sur le bouton d'une porte (`COMMAND.C`) | groupe (mur, bouton) ou case (sol) | prioritaire |
| 02 | Door | `C02` DOOR_RATTLE | **chaque cran** d'une porte qui s'ouvre ou se ferme (`TIMELINE.C`) | porte | prioritaire |
| 03 | Attack (Trolin - Stone Golem) - Touching Wall | `C04` WOODEN_THUD (**probable**) | une créature tuée lâche des objets sans arme ; porte frappée (1 tick plus tard) ; créature heurtée par une porte qui se ferme ; impact d'un objet lancé qui n'est pas une arme | case | prioritaire / +1 tick |
| 04 | Exploding Fireball | `C05` STRONG_EXPLOSION et `C20` WEAK_EXPLOSION (**à confirmer**) | explosion de Fireball, Slime, Lightning Bolt : forte si l'attaque dépasse 80, faible sinon (`PROJEXPL.C`) | case | prioritaire |
| 05 | Falling and Dying | `C06` SCREAM | chute dans une trappe avec des dégâts ; mort de tout le groupe (`MOVE.C`) | groupe | immédiat |
| 06 | Swallowing | `C08` SWALLOW | un champion mange ou boit (`INVNTORY.C`) | groupe | immédiat |
| 07 à 10 | Champion Wounded 1 à 4 | `C09` à `C12` | un champion blessé, un son par position dans le groupe (`GROUP2.C`) | groupe | +1 tick |
| 11 | Exploding Spell | `C13` SPELL | explosions non élémentaires : Open Door, Harm Non Material, Poison Bolt, Poison Cloud… (`PROJEXPL.C`) | case | prioritaire |
| 12 | Attack (Skeleton - Animated Armour - Party Slash) | `C16` COMBAT | **toute action de mêlée** du groupe, tir, lancer (`MENUS.C`, `CHAMPION.C`) ; attaques du Skeleton et de l'Animated Armour | groupe / créature | prioritaire |
| 13 | Teleporting | `C17` BUZZ | téléporteur **avec le bit `sound`** pris par le groupe (immédiat) ou par une créature ; générateur de créatures avec `sound` ; apparition d'un groupe généré ; saut d'un archennemi (`MOVE.C`, `TIMELINE.C`, `GROUP1.C`) | arrivée | immédiat / prioritaire |
| 14 | Running Into A Wall | `C18` PARTY_DAMAGED | le groupe **se cogne** à un mur (avec dégâts) ; une porte se ferme sur le groupe (`COMMAND.C`, `TIMELINE.C`) | groupe | immédiat |

Sur l'ST, la **frappe d'une main nue sur un mur** n'a pas de son à elle : c'est le son de combat (12), joué pour toute action de mêlée. Sur une porte, le bruit sourd (03) suit un tick plus tard.

### 3.2 Attaques des créatures

Une espèce a un `AttackSoundOrdinal` (table `G244`, dans les données du jeu). L'attaque joue ce son sur la case de la créature (`GROUP1.C`). Correspondance d'après la DM Encyclopaedia et les libellés de greatstone :

| Amiga | Espèces |
|---|---|
| 03 | Trolin, Stone Golem |
| 12 | Skeleton, Animated Armour |
| 15 | Pain Rat, Red Dragon |
| 16 | Mummy, Ghost |
| 17 | Screamer, Oitu |
| 18 | Giant Scorpion |
| 19 | Magenta Worm |
| 20 | Giggler |
| 28 | Rockpile |
| 29 | Water Elemental |
| 30 | Couatl |
| — | Giant Wasp, Swamp Slime, Wizard Eye, Vexirk, Ruster, Materializer, Black Flame, Demon, Lord Chaos : pas de son d'attaque |

### 3.3 Sons propres à l'Amiga

| Amiga | Libellé | Déclencheur supposé | Espèces |
|---|---|---|---|
| 21 | Move (Animated Armour) | déplacement d'une créature | Animated Armour |
| 22 | Move (Giant Wasp - Couatl) | id. | Giant Wasp, Couatl |
| 23 | Move (Mummy - Trolin - Stone Golem - Giggler - Vexirk - Demon) | id. | ces 6 espèces |
| 25 | Move (Screamer - Rockpile - Magenta Worm - Pain Rat - Ruster - Giant Scorpion - Oitu) | id. | ces 7 espèces |
| 26 | Move (Swamp Slime - Water Elemental) | id. | ces 2 espèces |
| 31 | Move (Red Dragon) | id. | Red Dragon |
| 32 | Move (Skeleton) | id. | Skeleton |
| 24 | Blowing Horn Of Fear | action « Blow Horn » du Horn of Fear | — |
| 27 | War Cry | action « War Cry » (C3c, en attente) | — |

Ghost, Wizard Eye, Materializer, Black Flame et les Lords n'ont **pas de son de déplacement**.

## 4. Ce que nos données fournissent déjà

Le bit `sound` du XML est déjà dans `data/dungeon.json` :

| Élément | Avec `sound` | Son |
|---|---|---|
| Téléporteurs | 79 sur 179 | 13 (Teleporting) |
| Actuators muraux | 219 (surtout boutons et serrures) | 01 (Switch) |
| Actuators au sol | 77 (dont 1 générateur de créatures) | 01 (Switch), ou 13 pour le générateur |

Rien à ajouter au format.

## 5. Correspondance avec la simulation actuelle

La simulation émet déjà la plupart des événements utiles :

| Son | Événement existant | À ajouter |
|---|---|---|
| 14 mur | `blocked` | distinguer mur et créature ; DM ne joue le son que si le groupe prend des dégâts |
| 01 switch | `actuatorFired` | lire le bit `sound` ; clic sur un bouton de porte |
| 02 porte | `tileChanged` (cran de porte) | savoir que c'est une porte qui change de cran |
| 13 téléporteur | `partyMoved` (téléporté) | bit `sound`, téléportation d'une créature, générateurs |
| 05 cri | `partyMoved` (chute), `championDied` | — |
| 06 déglutition | `potionDrunk` | — |
| 07 blessure | `championHit` | — |
| 12 combat | action de mêlée, lancer | un événement d'action, ou `creatureHit` |
| 00 / 03 impacts | `projectilesMoved`, `itemsMoved` | impact d'un projectile, butin lâché |
| 04 / 11 explosions | `explosion`, `doorBroken` | force de l'explosion, type |
| attaques, pas | `creaturesMoved`, `championHit` | espèce et case de la créature qui attaque ou bouge |

Le plan détaillé (phase 3) proposera un événement unique **`sound`** `{ id, level, x, y, mode }`, émis par la simulation aux endroits indiqués par ReDMCSB. Un module `src/audio/` s'y abonnera.

## 6. Récupération des fichiers (phase 2)

- **greatstone** sert les 33 sons d'Amiga 3.6 en **.mp3**, un fichier par son, sur la page de graphics.dat. Par exemple `0672.SND2 [Sound 01 - Switch].mp3`, dans le même dossier que la page. Je n'ai **rien téléchargé** : j'ai seulement vérifié que les liens répondent.
- Ces sons appartiennent aux ayants droit de FTL. Comme prévu dans la 039, on les utilise si les droits le permettent (usage personnel, autorisation), sinon on les remplace par un pack libre.
- Les volumes « fort » et « faible » des tables du circuit sonore de l'ST ne se transposent pas tels quels. Avec la Web Audio API, on aura un gain continu selon la distance.

## 7. Questions pour la phase 3

1. **Stéréo et volume :** DM (ST) joue fort, faible ou rien, en mono. On fait un gain continu selon la distance de Manhattan, plus un panoramique gauche/droite selon la position relative à l'orientation du groupe, comme tu le proposais dans la 039 ?
2. **Plusieurs sons à la fois :** DM n'en joue qu'**un par tick**. Proposition :
   - garder la règle du « gagnant » (le plus fort, puis le plus prioritaire), pour rester fidèle ;
   - mais laisser finir les sons déjà en cours, avec au plus 4 voix ;
   - un même son n'est joué qu'une fois par tick, ce qui évite le chorus.
3. **Distances :** les seuils `LoudDistance` et `SoftDistance` de chaque son sont dans les données du jeu, pas dans le code. Je propose des valeurs provisoires, signalées comme les autres, à confirmer si on trouve la table du graphisme 562.
4. **Pas des créatures :** à chaque pas, ou seulement pour les créatures à moins de N cases ? Sans source pour l'Amiga, je propose les seuils de la question 3.
5. **Sons sans équivalent :** heurter une créature (le groupe est bloqué sans dégâts) reste silencieux, comme dans DM ?
