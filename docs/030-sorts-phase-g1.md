# 030 — Sorts, phase G1 : panneau de sorts et reconnaissance

> Première sous-phase du plan [029-sorts-et-lumiere-plan.md](029-sorts-et-lumiere-plan.md). Suivante : G2 (conditions et potions).
> Sources : la page *Spells* de la *Dungeon Master Encyclopaedia*, les icônes Atari ST des symboles, ReDMCSB `MENUS.C` et `CHAMPION.C`.
> Voir [000-sources.md](000-sources.md).

## 1. Ce qui est fait

On compose un sort au clic dans un panneau à droite du cadre de Zed. Le sort est reconnu, et son nom s'affiche dans la barre de messages.
Il n'a **aucun effet** pour l'instant, sauf la **fatigue** : la main d'action est bloquée pendant la durée propre au sort.

| Fichier | Rôle |
|---|---|
| `src/core/spell-info.js` | Données du moteur : les 4 rangées de symboles, les 25 sorts, le coût en mana des symboles, `findSpell()`, `symbolManaCost()`, `spellManaCost()` |
| `src/core/spell-glyphs.js` | Les 24 glyphes Atari ST, en masques 7 × 7 (fichier généré) |
| `tools/fetch-spell-glyphs.mjs` | Télécharge les 24 PNG de l'Encyclopaedia, les décode (décodeur PNG minimal, sans dépendance) et écrit `spell-glyphs.js`. À lancer une seule fois |
| `src/sim/spells.js` | `addSymbol()`, `deleteSymbol()`, `castSpell()` sur `champion.symbols`, sans DOM |
| `src/sim/champion.js` | `champion.symbols`, et `disableAction()` (fatigue cumulée comme `F330`) |
| `src/sim/simulation.js` | `sim.symbols`, `sim.addSymbol(i)`, `sim.deleteSymbol()`, `sim.castSpell()`. Événements `symbolsChanged` et `spellCast` |
| `src/ui/spell-panel.js` | Le panneau : onglet au nom du champion, rangée des 6 symboles, ligne du sort (clic : lancer), flèche d'effacement |
| `styles/main.css` | Section « Spell area » : cyan de DM, glyphes en pixels nets (SVG, `shape-rendering: crispEdges`) |
| `tools/test-spells.mjs` | 22 vérifications |

## 2. Règles du moteur reprises

- **Symboles :** gardés comme indices 0 à 5 dans la rangée de leur étape. La puissance est le premier.
- **Reconnaissance** (`F409`) : on compare les symboles **sans la puissance**. Une puissance seule n'est pas un sort.
- **Ligne pleine :** après 4 symboles, la rangée est vide (cases grisées). Il reste à lancer ou à effacer.
- **Lancer** (`F408`, `F412`) : la ligne est vidée, que le sort soit reconnu ou non.
  - En G2, elle restera si une potion manque de flasque.
  - Un sort inconnu ne fatigue pas.
- **Fatigue** (`F330_CHAMPION_DisableAction`) : si la main est déjà bloquée, la plus longue des deux durées reçoit la moitié de l'autre.
  Exemple : Fireball (42) juste après Torch (15) bloque 42 + 7 = 49 ticks.
- **Mana** (`F399`) : un symbole de puissance coûte son niveau (1 à 6). Les autres coûtent leur coût de base × (8, 12, 16, 20, 24, 28 selon la puissance) / 8, arrondi en dessous.
  Les coûts sont **calculés mais pas décomptés** (doc 029, Q2). Le test vérifie quelques valeurs contre la table de l'Encyclopaedia.

## 3. Données de chaque sort

Pour chaque sort, `spell-info.js` garde :

- symboles, nom, nom de la potion, école ;
- genre (`potion`, `projectile`, `other`), difficulté, fatigue, compétence ;
- `effect`, la clé de l'effet pour G2 et G3 ;
- `retained`, s'il fait partie de G2 et G3 ;
- `scroll`, la case du parchemin qui le révèle (pour le grimoire de G4).

**Compétences :** les indices du moteur, de 0 à 19 (`SKILLS`). See Through Walls est pris avec la compétence 15 (Defend) de la version Atari ST. Les autres versions utilisent 18 (Earth).

## 4. Glyphes

- Les 24 icônes `Game,Dungeon_Master,Atari_ST,Symbol,<Nom>,Screenshot.png` existent toutes. Le symbole de classe s'écrit **Dain** (pas Dane).
- Les PNG sont blancs sur noir. Le script garde les pixels clairs et opaques.
- Les formes diffèrent un peu de la capture `assets/spells-ui.png` (une autre version). Par exemple, Ya est une grille dans la version Atari ST.

## 5. Interface et messages

- Infobulle d'un symbole : son nom. Infobulle de la ligne : « Lancer le sort : Lo Ful ».
- Messages dans la barre d'état :
  - sort inconnu : « Zed a prononcé un sort incompréhensible » ;
  - sort retenu : « Zed lance Torch (Lo Ful) · effet à venir » ;
  - sort non retenu : « … · pas encore implémenté ».
- Les boutons d'action de Zed se grisent pendant la fatigue du sort.
- Champion mort : le panneau ne réagit plus.
- Pas de raccourci clavier (doc 029).

## 6. Vérification

- `node tools/test-spells.mjs` : composition, effacement, 25 sorts reconnus aux 6 puissances, sort incompréhensible, fatigue, coûts en mana, glyphes.
- Les 5 autres tests passent toujours.
- **Non vérifié dans le navigateur :** l'extension Chrome n'était pas connectée pendant la session. La mise en page du panneau est à contrôler à l'œil.

**Critère de fin :** « Lo Ful » affiche Torch, « Lo Ya Ven » le sort incompréhensible. Les deux sont vérifiés par le test.
