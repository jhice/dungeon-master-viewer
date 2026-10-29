# 042 — Sons : simulation, lecture et réglages (phase 4)

> Réalisation du plan de la [041](041-sons-plan.md), à partir de l'inventaire de la [040](040-sons-inventaire.md).
> Sources : les fichiers sonores d'Amiga 3.6 hébergés par greatstone. Voir [000-sources.md](000-sources.md).

## 1. Les fichiers

- **33 sons** d'Amiga 3.6, téléchargés depuis la page graphics.dat de greatstone, à la demande de l'utilisateur, faute d'autre pack.
- Rangés dans `assets/sounds/NN.mp3`, avec NN le numéro du son Amiga (`01.mp3` = « Sound 01 - Switch »).
- Format : MP3 mono, 44,1 kHz, 64 kb/s, 356 Ko en tout.
- 30 sont utilisés. Restent hors jeu : 24 (Horn of Fear) et 27 (War Cry), en attente de leurs actions (C3c).

## 2. Étape 1 : la simulation annonce les sons

- Événement **`sound`** `{ id, level, x, y, immediate? }`, documenté dans `src/sim/events.js`.
- Table des sons dans **`src/core/sound-info.js`** :
  - pour chaque son, son fichier et son multiplicateur de portée ;
  - l'ordre de la table donne la priorité ;
  - sons des espèces : `attackSound(type)`, `moveSound(type)`.

| Fichier | Sons émis |
|---|---|
| `simulation.js` | mur heurté (pas de son contre une créature) ; chute et mort (cri) ; téléporteur sonore pris par le groupe ; coup et lancer ; potion bue ; blessure ; attaque d'une créature (son de l'espèce) ; porte qui se ferme sur le groupe (`wall`) ou sur une créature (`thud`) |
| `logic.js` | actuator avec le bit `sound` (sur sa case) ; bouton de porte ; **chaque cran** d'une porte ; coup d'arme sur une porte cassable |
| `creatures.js` | pas d'une créature (son de l'espèce, sauf demi-tours) ; arrivée par un téléporteur sonore ; groupe généré ; butin qui tombe (`metal` s'il contient une arme, sinon `thud`) |
| `rules.js` | `resolveCreatureArrival()` marque `audible` quand la chaîne passe par un téléporteur sonore |
| `projectiles.js` | objet lancé qui heurte un mur ou une créature (`metal` pour une arme, sinon `thud`) |
| `magic.js` | explosion de Fireball ; impact d'Open Door |

Les sons « immédiats » viennent des actions du groupe : mur, chute, téléporteur pris par le groupe, coup, lancer, potion, mort.

Test : `node tools/test-sounds.mjs` couvre :
- le mur heurté ;
- le bouton et les 4 crans d'une porte ;
- les téléporteurs sonore et muet ;
- les boutons muraux sonore et muet ;
- l'attaque d'une créature et la blessure de Zed ;
- les pas des créatures.

## 3. Étape 2 : lecture (`src/audio/audio.js`)

- **Web Audio API** :
  - un `AudioContext` créé au premier son, donc après un geste de l'utilisateur ;
  - un fichier chargé à sa première demande, puis gardé en cache ; un fichier manquant ne fait que du silence ;
  - chaque son passe par un `StereoPannerNode` puis un `GainNode`.
- **Filtre :** seul le niveau du groupe s'entend.
- **Volume :** `volume × (1 − d / portée)`, avec :
  - `d` = |dx| + |dy| ;
  - `portée` = portée commune × multiplicateur du son ;
  - au-delà, pas de son.
- **Stéréo :** `pan` = (composante à droite du groupe) / max(1, d).
- **Un son par tick :** `main.js` fait passer `sim.tick()` par `audio.tick()`. Les demandes du tick sont comparées, et seule la gagnante est jouée : la plus forte, puis la plus prioritaire. Les sons immédiats, et ceux des actions faites hors d'un tick, partent tout de suite.
- **Au plus 4 voix :** la plus ancienne s'arrête. Un même son demandé deux fois en moins de 50 ms n'est joué qu'une fois.

## 4. Réglages

- Défauts dans `src/audio/audio-settings.js`, tous **provisoires** :
  - `soundEnabled: true` ;
  - `soundVolume: 0.8` ;
  - `soundRange: 8` cases.
- Section **« Sons »** du panneau, sous la lumière :
  - « Sons activés » ;
  - Volume, de 0 à 100 % ;
  - Portée, de 2 à 16 cases.
- Les réglages sont gardés dans les préférences (`prefs.audio`). Désactiver les sons coupe aussi ceux en cours.

## 5. Vérifications

- Tests Node : les 9 passent (les 8 existants et `test-sounds.mjs`).
- Navigateur (Chrome) : la section « Sons » s'affiche. Avancer contre un mur joue `14.mp3`, une fois par choc.
- Dans la simulation, il y a **environ 250 pas de créatures par minute** au niveau 2. Seuls ceux à portée sont joués, au plus un par tick : la fréquence perçue reste à juger en jouant.

## 6. Écarts et points ouverts

- Les délais de DM (blessure et coup sur une porte, joués un tick plus tard) sont ignorés.
- La chute joue le cri même sans dégâts : nos chutes n'en font pas encore.
- Correspondances déduites des libellés, à confirmer :
  - `thud` = son 03 ;
  - un seul son d'explosion (04) pour les explosions fortes et faibles.
- Priorités et multiplicateurs de portée provisoires, faute de la table du graphisme 562.
- À régler aux essais : la portée commune et la fréquence des pas.
