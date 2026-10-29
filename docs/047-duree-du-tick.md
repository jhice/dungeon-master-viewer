# 047 — Durée d'un tick

> Question de l'utilisateur : la durée de notre tick est-elle proche de celle de DM, ou arbitraire ?
> Source : ReDMCSB, `MAIN.C` (boucle de jeu F002, interruption de synchronisation verticale) et `COMMAND.C`. Voir [000-sources.md](000-sources.md).

## 1. Avant

- `TICK_MS = 1000 / 6` (167 ms), dans `main.js`.
- La valeur venait de l'*Encyclopaedia*, qui exprime la fatigue des actions en « 1/6 de seconde ». Elle était marquée « à vérifier ».

## 2. Ce que fait DM

- **Le rythme :** la boucle de jeu avance le temps du jeu d'un tick **toutes les 11 synchronisations verticales** (VBL) de l'écran. Un compteur les compte dans l'interruption VBL ; le commentaire de ReDMCSB le dit.
- **La durée** dépend de la fréquence de l'écran :

  | Machine | Fréquence | Tick | Ticks / s |
  |---|---|---|---|
  | Atari ST ou Amiga **PAL** (Europe) | 50 Hz | **220 ms** | 4,5 |
  | Atari ST ou Amiga NTSC (US) | 60 Hz | 183 ms | 5,5 |

- **Les ticks écourtés :** certaines commandes terminent le tick en cours sans attendre les 11 VBL : tourner, avancer, prendre ou poser un objet, lancer, cliquer dans la vue. Une action du panneau d'actions n'en fait pas partie.

## 3. Choix

- `TICK_MS = 11 × 1000 / 50` = **220 ms**, le tick d'un écran PAL : celui de la version Amiga 3.6, dont viennent nos sons.
- `LATER_TICKS` revient à **1**, la valeur de DM. Les sons différés (blessure, porte frappée, butin) partent donc 220 ms après leur cause.
- Tout ce qui se compte en ticks ralentit d'un quart, comme dans le jeu d'origine :
  - les portes, les créatures, les projectiles ;
  - la fatigue, la lumière, la régénération.
- **Pas fait :**
  - les ticks écourtés par les commandes : notre horloge garde un rythme fixe ;
  - un choix 50 / 60 Hz dans le panneau.

## 4. Vérifications

- Les 9 tests Node passent : ils comptent en ticks, sans dépendre de leur durée.
- Le rythme est à juger en jeu.
