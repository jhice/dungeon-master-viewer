# 045 — Chocs contre les murs, clic sur un mur, sons différés

> Retours de l'utilisateur après la [044](044-actions-des-objets.md) :
> - dans DM, quand on frappe avec une arme, il y a un délai entre le son de l'arme et celui du choc ;
> - un clic sur un mur doit jouer le son sourd si rien ne se passe ;
> - le groupe qui heurte un mur en marchant perd des PV (Zed seulement pour l'instant).
>
> Sources : ReDMCSB, `DEFS.H` (modes de lecture des sons), `COMMAND.C` (F366, déplacement bloqué), `CHAMPION.C` (F321), `MENUS.C` (F407), `GROUP1.C` (F188), `GROUP2.C` (F230). Voir [000-sources.md](000-sources.md).

## 1. Sons différés d'un tick

DM a trois modes de lecture. Le troisième, `C02_MODE_PLAY_ONE_TICK_LATER`, sert à jouer un son juste **après** celui de l'attaque qui le cause. Le simulateur l'applique désormais avec `soundLater()` (`simulation.js`) :

| Son | Avant | Maintenant (DM) |
|---|---|---|
| Blessure de Zed par une créature (`wounded`) | En même temps que l'attaque | Un tick après le son d'attaque de l'espèce (F230) |
| Arme sur une porte fermée (`thud`) | En même temps que le son de combat | Un tick après le son de combat (F407) |
| Butin qui tombe à la mort d'une créature (`metal` / `thud`) | Tout de suite | Un tick plus tard (F188) |

- DM ne joue le son de blessure d'un champion que pour les **attaques des créatures**. Les blessures dues aux portes, aux boules de feu et aux murs ne le jouent plus.
- Une frappe sur une créature n'a pas de son d'impact dans DM : seul le son de combat est joué.

## 2. Choc contre un mur (F366, F321)

- Le groupe bloqué par un **mur**, une **porte fermée** ou un **faux mur fermé** : les champions du premier rang prennent une attaque de 1, de type « self ».
- Leur défense est divisée par 2, et ils n'ont pas encore d'armure. Les dégâts valent donc (1 × 130) / 64 = **2 PV**. Seul Zed est touché, faute d'autres champions.
- Le son « mur heurté » (14) est joué tout de suite. Le cadre de Zed montre les 2 PV perdus.
- Heurter une créature ne fait toujours rien.
- Zed peut mourir à force de foncer dans les murs, comme dans DM.

## 3. Clic sur un mur

- Un clic sur un mur, une porte ou un faux mur fermé, quand **rien ne se passe**, joue le bruit sourd (03).
- « Rien ne se passe » : pas d'actuator déclenché, pas d'objet pris ni posé, pas de coup sur une porte cassable.
- Un faux mur **imaginaire** ou **ouvert** laisse passer la main : pas de son.
- Ce son est une demande de l'utilisateur. Dans ReDMCSB, je n'ai trouvé aucun son pour un clic sur un mur nu.

## 4. Vérifications

- `tools/test-sounds.mjs` :
  - mur heurté : son 14, et Zed perd 2 PV ;
  - clic sur un mur nu : bruit sourd ;
  - blessure un tick après l'attaque d'une créature ;
  - épée sur une porte : son de combat, puis bruit sourd au tick suivant.
- Les 9 tests Node passent.
