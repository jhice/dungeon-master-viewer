# 050 — Eau : gourdes, fontaines et bouche

> Demande de l'utilisateur : gérer l'eau (gourdes, fontaines) avec une vraie bouche dans l'interface. La faim et la soif restent en attente.
> Sources : ReDMCSB `COMMAND.C` (F377), `INVNTORY.C` (F349, F342), `CHAMPION.C` (F280), `OBJECT.C` (F033), `DUNGEON.C` (F140). Voir [000-sources.md](000-sources.md).

## 1. Ce que fait DM

- **Gourde** (« Water », objet divers de type 1) : son `subtype` est le nombre de gorgées, de 0 à 3. DM la décrit ainsi :

  | Gorgées | État |
  |---|---|
  | 0 | vide |
  | 1 | presque vide |
  | 2 | presque pleine |
  | 3 | pleine |

  Le donjon en a 4 : N0 (4, 15), N1 (13, 29), N3 (23, 31), toutes pleines, et N2 (8, 28), vide.
- **Bouche** (F349) : l'objet tenu au curseur y est porté.
  - Gourde : une gorgée en moins, +800 d'eau pour le champion (maximum 2048). Une gourde vide ne se boit pas.
  - Water Flask : +1600 d'eau ; la flasque devient vide.
  - Son « swallow » dans tous les cas.
- **Fontaine** (F377) : clic sur la fontaine avec un objet en main.
  - Gourde : elle devient pleine.
  - Flasque vide : elle devient une Water Flask.
  - Ensuite, le mur est touché comme d'habitude : ses actuators réagissent à l'objet tenu.
  - **Pas de son**, et **on ne boit pas à la fontaine** : main vide, c'est un simple clic sur le mur.
- **Eau du champion :** 1500 + random(256) au départ (F280). Elle baisse avec le temps dans DM ; pas encore ici.
- **Poids :** une gourde pèse 0,2 kg de plus par gorgée (F140).

## 2. Choix (validés avec l'utilisateur)

- **Fontaine comme DM :** elle remplit, sans son ; on ne boit pas à la fontaine.
- **Jauge d'eau sans effet :** `champion.water` est tenue (départ, gorgées, Water Flask), sans baisse dans le temps ni conséquence. Elle servira telle quelle pour la faim et la soif.

## 3. Réalisation

- **`src/sim/water.js` :** constantes, `isWaterskin`, `startingWater`, `drinkWaterskin`, `fillAtFountain`.
- **`src/sim/potions.js` :** la Water Flask (type 15) donne de l'eau.
- **Simulation :**
  - `sim.drink()` boit une potion ou une gorgée de gourde ; une gourde vide rend `{ empty: true }`.
  - `logic.clickFront()` remplit à une fontaine (le décor affiché de la face est « Fountain ») avant les actuators du mur ; le résultat porte `filled: 'waterskin' | 'flask'`.
  - `createState()` restaure les gorgées des gourdes au reset.
- **Interface :**
  - La **bouche** (« 👄 Bouche ») est sous l'objet tenu, dans la fenêtre du jeu. Elle remplace le clic sur le cadre de Zed, retiré.
  - Le nom des gourdes porte leur état, dans l'inventaire, au curseur et dans les mains : « Water (presque vide) ».
  - L'infobulle d'une gourde donne ses gorgées ; celle du nom de Zed, son eau.
  - Messages : « Zed boit Water : +800 eau (1600 / 2048) », « la gourde est vide », « La fontaine remplit la gourde ».
- **Fontaine de N1 (18, 25) :** elle porte aussi un actuator « Specific item / Removed » qui attend une Copper Coin (identifiant 125). Ce mécanisme existait déjà ; il marche toujours, avec la pièce en main.

## 4. Valeurs à confirmer

- Poids de base de la gourde (0,5 kg, *Encyclopaedia*) : est-ce le poids vide ? On y ajoute 0,2 kg par gorgée.

## 5. Tests

- `node tools/test-water.mjs` : eau de départ, trois gorgées (la dernière plafonnée), gourde vide, fontaine (gourde et flasque), Water Flask bue, main vide, reset.
