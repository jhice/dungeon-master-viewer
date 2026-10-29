# 043 — Portes : le premier cran tombe sur un tick

> Suite de la [028](028-portes-animees.md) (portes animées) et de la [042](042-sons-lecture.md) (sons).
> Source : ReDMCSB, `COMMAND.C` et `TIMELINE.C` (F244). Voir [000-sources.md](000-sources.md).

## 1. Le problème

En jeu, l'intervalle entre les sons de cran d'une porte variait parfois légèrement.

- Le **premier cran** partait au moment de la cause : clic sur le bouton, pas sur une plaque, bouton mural. Ce moment tombe n'importe où entre deux ticks.
- Les **crans suivants** tombent sur les ticks de l'horloge (`setInterval` de `main.js`).
- Le premier intervalle durait donc entre `d − 1` et `d` ticks (`d` = ticks par cran) ; les suivants, `d` ticks. Analyse confirmée par l'utilisateur aux essais.

## 2. Ce que fait DM

- Un clic sur le bouton d'une porte ajoute un événement de porte à `GameTime + 1` (`COMMAND.C`). Un Open Door fait de même (`PROJEXPL.C`).
- `F244` change cet événement en animation de porte, au même tick.
- La porte démarre donc toujours sur un tick.

## 3. Correctif

- `src/sim/clock.js` : la propriété `ticking` dit si l'horloge est en train de jouer un tick (`advance()`).
- `src/sim/logic.js`, `doorEvent()` : le premier cran est **programmé** au lieu d'être joué tout de suite :
  - pendant un tick (actuator à délai, sort, créature) : au même tick, comme F244 ;
  - entre deux ticks (clic, pas du groupe) : au tick suivant, comme le bouton de DM.
- Effet : une porte démarre au plus un tick après le clic (1/6 s), et tous ses crans sont espacés régulièrement.

## 4. Vérifications

- `tools/test-doors.mjs` : les clics qui lancent une porte sont suivis du tick du premier cran (`press()`).
- `tools/test-sounds.mjs` : nouveau contrôle, aucun cran au clic, puis un par tick (ticks 1 à 4).
- Les 9 tests Node passent.

## 5. Note : vitesse des portes

- La vitesse se règle par le délai entre deux crans, `again(1)` dans `animateDoor()` (`logic.js`).
- L'horloge ne compte que des **ticks entiers** : un délai de `1.2` revient à 2 ticks par cran.
- Un réglage plus fin que le tick demanderait d'animer le battant dans le rendu, ou de changer `TICK_MS` (toute la simulation).
