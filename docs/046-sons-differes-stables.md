# 046 — Sons différés : un délai fixe

> Retours de l'utilisateur après la [045](045-chocs-et-sons-differes.md) :
> - le son du butin qui tombe ne semble pas décalé ;
> - le décalage semble fluctuer selon le moment où l'on frappe, comme pour l'animation des portes ([043](043-portes-rythme.md)).

## 1. Causes

- **Le butin** avait son propre délai (`clock.schedule(1)` dans `creatures.js`). Le réglage d'essai de l'utilisateur (2 ticks dans `soundLater`) ne le touchait pas.
- **La fluctuation** a la même cause qu'en 043.
  - Un coup du joueur a lieu entre deux ticks. Le son différé, confié à l'horloge du jeu, partait au tick suivant.
  - Son délai réel variait donc entre `n − 1` et `n` ticks, selon le moment du coup.
  - Seule la blessure par une créature, qui a lieu pendant un tick, avait un délai stable.

## 2. Correctif

- **`LATER_TICKS`** (`src/core/sound-info.js`) : le délai de tous les sons qui suivent celui de leur cause. Il vaut 1 tick dans DM ; il est réglé à **2**, la valeur d'essai de l'utilisateur.
- **La simulation** annonce le son **tout de suite**, avec `delay: LATER_TICKS` dans l'événement `sound`, au lieu de le confier à son horloge. C'est le cas de :
  - la blessure de Zed par une créature ;
  - le bruit sourd d'une porte frappée ;
  - le butin qui tombe.
- **Le module audio** (`audio.js`) joue un son différé exactement `delay × durée d'un tick` après sa demande (`setTimeout`).
  - Il ne participe pas au tirage « un son par tick ».
  - Sa position par rapport au groupe est calculée au moment où il est joué.
- La durée d'un tick vient de `main.js` (`tickMs: TICK_MS`).

## 3. Vérifications

- `tools/test-sounds.mjs` :
  - la blessure est demandée au même tick que l'attaque, avec un délai de `LATER_TICKS` ;
  - l'épée sur une porte donne le son de combat sans délai, puis le bruit sourd avec délai ;
  - le butin des Screamers tués a le délai, pour chacun de ses 4 sons.
- Les 9 tests Node passent.
- La régularité du délai se juge à l'écoute.
