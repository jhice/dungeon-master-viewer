# 016 — Simulation, phase D : textes

> Suite de [015-simulation-phase-c.md](015-simulation-phase-c.md).
> Phase D : inscriptions affichées face à leur mur, messages déclenchés par les mécanismes.

## 1. Les textes dans le donjon

Les textes placés sur des cases, hors fiches de champions (doc 010) :

| Genre | Nb | Où | Affichage |
|---|---|---|---|
| Inscription murale visible | 58 | sur une face de mur | **gravée** sur la face, dans la vue à la première personne |
| Message mural invisible | 3 | sur une face de mur | gravé sur la face **une fois rendu visible** par un mécanisme |
| Message au sol invisible | 5 | au sol | **imprimé** dans la zone de messages quand un mécanisme le rend visible |
| Texte visible au sol | 1 | sur le téléporteur (9, 1) du niveau 0 | imprimé quand le groupe y entre |

Les messages et ce qui les déclenche :

| Message | Où | Déclencheur |
|---|---|---|
| WELCOME BACK BRAVE ADVENTURERS. | N0 (1, 4), au sol | Détecteur d'objet porté de la case (1, 4) : le groupe porte **le Firestaff** (identifiant 27). Usage unique. **Phase E** |
| YOU WILL REGRET THAT. | N3 mur (6, 4), face N | Plaque TPC (7, 5), en `revert` : elle se déclenche quand la case se vide. Une **créature** s'y tient au départ et maintient la plaque enfoncée, donc le message attend la simulation des créatures |
| SHORTCUT BACK | N3 mur (15, 17), face O | Mur (28, 8), « Specific item » : il demande un objet (phase E) |
| READING ROOM KEEP OUT | N6 mur (27, 6), face E | Aucun déclencheur dans les données |
| Les 4 textes de fin (« ATHANK YOU… ») | N12 (0, 0), au sol | Aucun déclencheur : c'est le moteur qui les affiche à la fin |

## 2. Règles

- Un événement **set / clear / toggle** sur une **case de sol** montre ou cache ses textes (hors fiches de champions).
  - Un texte qui devient visible est **imprimé** (événement `textShown`).
- Quand le groupe **entre** sur une case qui porte un texte visible au sol, ce texte est imprimé.
  - Un message déclenché reste donc visible et serait imprimé de nouveau à chaque passage. **À vérifier** dans le jeu.
- Sur un **mur**, la phase C gérait déjà les messages de la face visée. La vue à la première personne les grave dès qu'ils sont visibles.

## 3. Interface

- **Inscriptions gravées** sur la face du mur : lettres claires avec une ombre décalée vers le bas, centrées, à la taille que permet la plus longue ligne.
  - C'est un plan transparent à 4 mm de la face, avec une texture canvas.
  - Les marqueurs de textes de la 3D ne sont plus dessinés dans la vue à la première personne.
- **Légende de lecture :** quand le groupe fait face à une inscription visible, son texte s'affiche en bas de la vue, lisible même dans une petite fenêtre (`sim.facedTexts()`).
- **Zone de messages** sous la vue, comme dans DM : les 3 derniers messages, qui pâlissent au bout de 12 s.

## 4. Vérifications

- **Chrome :** en (8, 4) du niveau 0, face au sud, « HALL OF CHAMPIONS » est gravé sur le mur (8, 5) et repris dans la légende.
- **Node :** la plaque (7, 5) du niveau 3 ne réagit pas au groupe, puisqu'une créature l'occupe. C'est conforme à la règle TPC de la phase C.
- « WELCOME BACK » : vérifié avec la phase E (doc 017), en rapportant le Firestaff au Hall.

## Sources

Aucune nouvelle source. Inventaire des textes : doc 010.
