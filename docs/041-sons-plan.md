# 041 — Sons : plan (phase 3)

> Suite de la [040](040-sons-inventaire.md) (inventaire et réponses de l'utilisateur).
> Consigne : **au plus simple** pour ce qu'on cherche à obtenir. Pas de nouvelle source consultée.

## 1. Principe

```
src/sim/  ── emit('sound', { id, level, x, y, immediate? }) ──▶  src/audio/audio.js  ──▶  Web Audio API
```

- **La simulation** ne fait qu'**annoncer** un son : un nom et une case. Elle reste sans DOM et testable dans Node.
- **Le module audio** décide s'il le joue, à quel volume et de quel côté.
- Pas de délai entre la cause et le son : les « +1 tick » de DM sont ignorés.

## 2. Les sons (`src/core/sound-info.js`)

Une table `id → { file, range }`. `range` multiplie la portée commune.

| id | Fichier Amiga | range | Déclencheur dans notre code |
|---|---|---|---|
| `wall` | 14 Running Into A Wall | 1 | `command()` : le groupe est bloqué par un mur ou une porte fermée (pas par une créature, réponse 5). Immédiat |
| `switch` | 01 Switch | 0,5 | `actuatorFired` d'un actuator **avec `sound`** (mural : case du groupe ; au sol : sa case) ; clic sur le bouton d'une porte |
| `door` | 02 Door | 1 | `setDoorStep()` : chaque cran d'une porte |
| `teleport` | 13 Teleporting | 1 | groupe porté par un téléporteur **avec `sound`** (immédiat) ; créature portée par un tel téléporteur ; groupe de créatures généré |
| `scream` | 05 Falling and Dying | 1,5 | chute du groupe dans une trappe ; mort du champion. Immédiat |
| `swallow` | 06 Swallowing | 1 | `potionDrunk`. Immédiat |
| `wounded` | 07 Champion Wounded 1 | 1 | `championHit` touché (un seul champion : Zed) |
| `combat` | 12 Attack (… Party Slash) | 1 | action de mêlée de Zed, lancer d'un objet |
| `metal` | 00 Falling item | 1 | impact d'une arme lancée ; butin contenant une arme |
| `thud` | 03 … Touching Wall | 1 | impact d'un autre objet lancé ; butin sans arme ; porte frappée ; créature coincée par une porte |
| `explosion` | 04 Exploding Fireball | 1,5 | explosion de Fireball |
| `spell` | 11 Exploding Spell | 1 | impact d'Open Door |
| `attack:<n>` | 03, 12, 15 à 20, 28 à 30 | 1 | attaque d'une créature : son de son espèce (tableau 3.2 de la 040) |
| `move:<n>` | 21 à 23, 25, 26, 31, 32 | 1 | pas d'une créature (pas les demi-tours sur place) : son de son espèce (tableau 3.3 de la 040) |

- Les sons d'espèce sont dans `sound-info.js` (et non `creature-info.js`, finalement), avec `attackSound(type)` et `moveSound(type)`.
- Le **cri de guerre** et le **Horn of Fear** attendront que leurs actions existent (C3c).
- Les correspondances 03 et 04 restent déduites des libellés (040).

## 3. Le module audio (`src/audio/audio.js`)

- **Chargement :** un `AudioContext`, créé ou réveillé au premier clic ou à la première touche (règle des navigateurs). Un fichier est chargé à sa première demande (`fetch` + `decodeAudioData`), puis gardé en cache. Un fichier absent est ignoré, sans erreur bloquante.
- **Filtre :** un son d'un autre niveau que celui du groupe est ignoré.
- **Volume :** avec `d` = |dx| + |dy| entre la case du son et celle du groupe, et `r` = portée commune × `range` du son :
  - `gain = volume × (1 − d / r)` ;
  - si `d ≥ r` : pas de son.
- **Stéréo :** la case du son est ramenée au repère du groupe (droite / devant), avec `pan = droite / max(1, d)` entre −1 et 1. Le son passe par un `StereoPannerNode` puis un `GainNode`.
- **Un son par tick (réponse 2) :**
  - pendant `sim.tick()`, les demandes sont mises de côté ;
  - après le tick, on joue la gagnante : la plus forte, puis la plus prioritaire (ordre du tableau ci-dessus) ;
  - les sons **immédiats** (actions du groupe, hors tick) partent tout de suite.
- **Au plus 4 voix :** un son en cours n'est pas coupé ; au-delà de 4, la voix la plus ancienne s'arrête.

C'est la fusion des réponses 1 et 2 : les règles de DM, sans les limites du circuit sonore de l'ST.

## 4. Réglages et panneau

- `src/audio/audio-settings.js` : `DEFAULT_AUDIO = { enabled: true, volume: 0.8, range: 8 }`. Valeurs **provisoires, à ajuster après tests**. Il est séparé du module audio, comme `lighting-settings.js`.
- `main.js` ajoute une section **« Sons »** au panneau :
  - « Sons activés » (case à cocher) ;
  - volume (0 à 100 %) ;
  - portée (2 à 16 cases).

  Les réglages sont gardés dans les préférences.

## 5. Fichiers

- Dossier `assets/sounds/`, un fichier par son, nommé par son numéro Amiga : `00.mp3` à `32.mp3`.
- Le nom du fichier est dans `sound-info.js` : un pack de remplacement n'a qu'à suivre ces noms, ou à changer la table.
- **Phase 2, à toi :** choix de la source (greatstone ou un pack) et vérification des droits. Sans fichiers, tout le reste fonctionne en silence.

## 6. Ordre de travail

1. **Simulation :**
   - `sound-info.js`, les sons d'espèce dans `creature-info.js` ;
   - émission de `sound` aux endroits du § 2 ;
   - documentation dans `events.js` ;
   - test Node `tools/test-sounds.mjs` : mur, porte (un son par cran), téléporteur avec et sans `sound`, bouton, attaque d'une créature.
2. **Audio :** `audio.js`, `audio-settings.js`, branchement dans `main.js` (abonnement, envoi des sons après `sim.tick()`), section du panneau.
3. **Essai dans le navigateur** avec quelques fichiers, puis réglage de la portée et du volume des pas.
4. **Doc 042** (ce qui a été fait), commit.
