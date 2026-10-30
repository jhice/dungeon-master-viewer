# 051 — Lancer contre une porte, dégâts de chute

> Demande de l'utilisateur :
> - une porte cassable ne doit plus se casser au clic avec un objet en main : on doit pouvoir lancer un objet, qui tombe dans les 2 sous-cases de la porte face au groupe ;
> - confirmer le mécanisme de cassage : compteur de coups ou défense de la porte ?
> - gérer les dégâts de chute dans une trappe, avec et sans corde.
>
> Sources : ReDMCSB `COMMAND.C` (F375, F377), `GROUP2.C` (F232), `PROJEXPL.C` (F216, F217), `CHAMPION.C` (F328, F321, F313, F309, F306), `MOVE.C` (F267). Voir [000-sources.md](000-sources.md).

## 1. Cassage des portes : défense, pas de compteur

- **Dans DM (F232) :** une porte fermée cède à **une** attaque au moins égale à la défense de son type :

  | Type | Défense |
  |---|---|
  | Wooden | 42 |
  | Porticullis | 110 |
  | Iron | 230 |
  | Ra | 255 |

  - Les coups ne s'additionnent pas. Chaque attaque est comparée seule.
  - La porte doit être complètement fermée et destructible par le moyen employé : `force` pour les coups et les objets lancés, `fireball` pour la magie.
- **Les trois façons de casser une porte :**
  - une action de frappe qui casse les portes (doc 044) ;
  - l'impact ou l'explosion d'une boule de feu (doc 033) ;
  - **un objet lancé** (ajouté ici).
- **Supprimé :** le compteur de coups de la doc 019 (`DOOR_HITS`, 3 coups pour une porte en bois, 6 pour une herse). C'était une simplification pour un groupe abstrait ; il n'existe pas dans DM.

## 2. Clic sur une porte avec un objet en main

- **Dans DM (F377, F375) :**
  - le bouton d'une porte ne s'actionne que la main vide ;
  - avec un objet au curseur, un clic au centre de la vue le **lance**.
- **Ici :** clic dans la vue (ou Espace) sur une porte, objet au curseur : il est lancé, du côté du clic (`throwHeld`).

## 3. Un objet lancé contre une porte

- **Dans DM (F217) :** le projectile entre dans la case de la porte. Il la rencontre en passant de sa moitié proche à sa moitié lointaine.
  - Si la porte est cassée ou ouverte à plus des 3/4, il passe.
  - Sinon, il l'attaque (F232, attaque non magique) : attaque = impact + 1, plus un tirage entre 0 et cette valeur.
  - Il tombe ensuite sur sa sous-case, devant le battant, du côté du groupe.
- **Impact d'un objet (F216) :**
  - base = énergie cinétique d'une arme, ou 0 à 3 pour un autre objet, plus la moitié de son poids (en 100 g) ;
  - puis ((base + énergie) / 16) + 1, plus deux tirages, moins (32 − attaque / 8) ;
  - minimum : la moitié de cette valeur.
- **Attaque du lancer (F328) :** 40 à 200, d'après la compétence Throw (niveau × 8 + 0 à 31). Elle est portée par le projectile.
- **Code :** `projectiles.js` fait entrer les objets dans la case d'une porte et appelle `impact` au milieu de la case ; `magic.js` calcule l'impact (`itemAttack`) et attaque la porte (`by: 'thrown'`).
- **En pratique :** avec l'énergie de lancer provisoire de la doc 024, l'attaque d'un objet lancé reste entre 9 et 15 environ, très loin des 42 d'une porte en bois. Avec la formule de DM (F328), elle reste aussi presque toujours sous 42. Une porte en bois se casse donc surtout à coups d'arme ou par le feu, comme dans le jeu.
- **Pas fait :** une herse laisse passer certains objets dans DM : ceux qui vont dans une bourse, avec un tirage sur l'attaque, mais pas les clés. Il manque les emplacements autorisés de chaque objet. Ici, tout objet tombe devant la herse.

## 4. Dégâts de chute

- **Sans corde (F267 → F324) :** à chaque trappe traversée, le champion subit une attaque de 20, de type « self », aux jambes et aux pieds.
  - L'attaque vaut 17 + un tirage de 0 à 5.
  - Dégâts (F321) : attaque × (130 − défense) / 64.
  - La défense est la moitié de celle des jambes et des pieds (F313). Sans armure (C3c), c'est un tirage entre 0 et vitalité / 8.
  - Pour Zed (60 PV), une chute coûte **34 à 44 PV** : deux chutes de suite le tuent.
  - Le champion crie. Le cri ne joue plus pour une descente à la corde.
- **Avec la corde (action Climb Down) :** la première trappe ne fait pas de dégâts.
  - Elle coûte de l'endurance : (charge × 25 / charge maximale) + 1.
  - Charge maximale (F309) : 8 × force + 100, réduite si l'endurance est sous la moitié (F306), arrondie à la dizaine supérieure.
  - Une trappe suivante, dans la même chute, blesse normalement : DM remet l'indicateur de corde à zéro après la première.
  - Sans endurance, le manque blesse (F325).
- **Invincibilité :** la chute est signalée, sans dégâts.
- **Messages :** « Chute : 38 PV » ; « Zed est mort, dans sa chute ».
- **Pas fait :** les créatures qui tombent dans une trappe devraient aussi subir 20 (F191).

## 5. Tests

- `node tools/test-falls-doors.mjs` :
  - 20 chutes dans la plage attendue, un cri chacune ;
  - descente à la corde ;
  - chute en invincibilité ;
  - clic sur une porte avec une épée, qui ne la frappe plus ;
  - épée lancée qui tombe sur une sous-case proche de la porte N1 (11, 0), et porte qui tient.
