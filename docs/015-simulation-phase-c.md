# 015 — Simulation, phase C : moteur d'actions

> Suite de [014-simulation-phase-b.md](014-simulation-phase-b.md).
> Phase C :
> - actuators au sol, boutons et leviers muraux au clic ;
> - effets set / clear / toggle / hold, délais, usage unique ;
> - portes logiques et compteurs ;
> - horloge, mise à jour des vues.
>
> Critère de fin : la porte (18, 1) du niveau 1 et ses 4 plaques.

## 1. Utilisation

- **Actionner :** un **clic** dans la vue à la première personne sur le mur ou la porte juste devant (le curseur devient une main), ou **Espace**.
  - Si rien ne réagit, la barre d'état indique « Rien ne se passe ».
- **Plaques de pression :** elles agissent quand on entre sur la case ou qu'on la quitte.
- **Barre d'état :** chaque changement y est annoncé, par exemple « Porte (18, 1) niveau 1 : ouverte » ou « Trappe (7, 8) niveau 1 : fermée ».
  - La 2D et la 3D redessinent la tuile ; en 3D, c'est le niveau entier qui est reconstruit.
  - La vue à la première personne reconstruit le niveau.
- **Ce qu'on voit dans la vue à la première personne :** on y voit maintenant les marqueurs de la 3D. Ils restent à remplacer par les vrais graphismes :
  - **plaques** au sol (orange) ;
  - **boutons et leviers** : un losange devant la face du mur ;
  - **objets et créatures** (immobiles) ;
  - **textes**.
- **Horloge :** elle tourne tant que la fenêtre de jeu est ouverte, à **6 ticks par seconde** (`TICK_MS` dans `main.js`). Elle s'arrête quand la fenêtre est fermée.
- **⟲** remet aussi tous les mécanismes dans leur état initial.

## 2. Architecture

```
src/sim/
├── clock.js     horloge en ticks, file d'événements différés (ordre d'insertion à tick égal), flush() des délais nuls
├── logic.js     moteur d'actions : fire(), effets sur les cibles, portes logiques, compteurs, rotations, clic mural
├── state.js     + état des actuators (désactivé, compteur, bits des portes logiques), ordre des actuators par case, visibilité des textes
└── simulation.js  + tick(), clickFront(), time ; sortie / entrée de case → actuators au sol
```

- **Événements ajoutés :**
  - `tileChanged { level, x, y, type, detail }` ;
  - `textChanged { index, visible }` (affichage en phase D) ;
  - `actuatorFired { index, actuator, effect }` (débogage).
- **Contrat des renderers :** méthode optionnelle `updateTile(level, x, y)`, et option `tileAt`. `main.js` leur passe l'état de la simulation, si bien que l'infobulle et les états affichés sont ceux du moment.
- **Vue à la première personne :** option `onClickFront`. Le **raycasting** vérifie que le clic touche la case juste devant le groupe (mur ou porte).

## 3. Règles implémentées

**À vérifier** dans le jeu original ou ReDMCSB (doc 012 § 3). Elles viennent de ma connaissance du moteur et de ce que montrent les données.

### Déclenchement

| Source | Condition |
|---|---|
| Plaque P (type 3) | Le groupe entre ou sort. Avec `data` de 1 à 4, seulement s'il regarde N, E, S ou O. Dans ce cas, **tourner** sur la case compte aussi : la plaque passe à « relâchée » avec l'ancienne orientation, puis à « pressée » avec la nouvelle |
| Plaque TPCI (type 1) | Le groupe entre ou sort, **sauf** si un objet ou une créature est déjà sur la case : la plaque est alors déjà enfoncée |
| Plaque TPC (type 2) | Idem, sauf si une créature est sur la case |
| Bouton mural (type 1) | Clic sur la face |
| Type 2 (main non vide), 3 (objet précis), 4 (serrure) | Demandent un objet en main : ils ne réagissent pas avant la **phase E** |

- **Réaction :** `déclenché = (entrée ou condition remplie) XOR revert`.
  - Un actuator **hold** envoie `set` s'il est déclenché, `clear` sinon.
  - Les autres actions n'agissent que s'il est déclenché.
- **Usage unique :** `onceOnly` désactive l'actuator après usage.
- **Ordre :** les actuators de la case quittée réagissent avant ceux de la case d'arrivée.
- **Pas d'effet de case avec `F` :** la touche ne déclenche ni les effets de case ni les plaques.

### Effets sur la cible, après `delay` ticks

| Cible | set | clear | toggle |
|---|---|---|---|
| Porte | ouvre | ferme (reporté d'un tick si le groupe est dessous) | inverse |
| Trappe | ouvre (le groupe **tombe** s'il est dessus) | ferme | inverse |
| Téléporteur | active | désactive | inverse |
| Faux mur | disparaît | revient (reporté si le groupe est dedans) | inverse |
| Mur | voir ci-dessous | | |
| Sol | générateurs de créatures : non simulés | | |

**Événement sur un mur :**
- Les **portes logiques** reçoivent l'événement **quelle que soit leur face** : la direction de l'événement désigne le **bit** modifié.
  - Dans les données, 75 envois visent une porte logique sur une autre face que la sienne, contre 36 sur la même.
  - Une fois le bit mis à jour, la porte est déclenchée si ses 4 bits sont égaux à la référence.
- Les **compteurs** reçoivent eux aussi l'événement quelle que soit leur face :
  - `set` décrémente, `clear` incrémente ;
  - le compteur se déclenche en atteignant 0.
- Les **textes** de la face visée apparaissent ou disparaissent : ce sont les messages, affichés en phase D.

### Rotations et leviers

- Les 61 faces à plusieurs actuators sont presque toutes des **leviers** :
  - un actuator à rotation locale (graphisme 10 ou 14, levier dans une position) ;
  - un actuator qui agit sur la cible (graphisme 11 ou 12, l'autre position).
- Un clic traite **tous** les actuators de la face. La rotation fait passer le **premier** actuator de la face en dernier, ce qui alterne le graphisme affiché (il sera dessiné en phase F).

### Oscillateurs

Certaines portes logiques s'envoient un `toggle` à elles-mêmes avec un délai : ce sont des **horloges** voulues par les auteurs du jeu.
- Au niveau 11, le mur (19, 11) fait s'ouvrir et se fermer en rythme les 4 trappes (15–16, 11–12).
- Au niveau 2, le mur (4, 27) fait clignoter le téléporteur (4, 28).

Une fois lancés, ils tournent indéfiniment, comme dans le jeu.

## 4. Vérifications

**Node :**
- **Porte (18, 1) :** on part de (14, 1) face à l'est.
  - La plaque (15, 1) ouvre la porte au tick suivant, la plaque (16, 1) la referme.
  - En (17, 1), une autre plaque ouvre la porte voisine (19, 1).
  - En revenant, (16, 1) puis (15, 1) rebasculent la porte (18, 1).
- **Levier (6, 8) du niveau 1, face nord :**
  - chaque clic bascule la trappe (7, 8) ;
  - l'ordre des actuators alterne entre 271, 0 et 0, 271.
- **Marche aléatoire** (200 000 actions, sauts sur les 14 niveaux, clics) : aucune exception, 260 ms.
  - Au repos, seuls les deux oscillateurs ci-dessus continuent.

**Chrome :**
- Espace puis **clic souris** sur le levier ferment et rouvrent la trappe (7, 8), et la 2D suit.
- En 3D, la plaque (15, 1) lève la porte (18, 1), visible dans la vue à la première personne.
- Aucune erreur dans la console.

## 5. Limites et suite

- Les **serrures et objets** sont prévus en phase E (inventaire simplifié, réponse Q2). La phase E alimentera `hand` dans `clickFront()`.
- Les **lanceurs de projectiles, générateurs, portraits, alcôves et échangeurs** sont ignorés, ainsi que les **détecteurs d'objet porté** du Hall.
- La **durée d'un tick** (1/6 s) et le **sens de set et clear** restent à confirmer.
- **Niveau 1 :** le passage du nord au sud (doc 014) peut maintenant s'ouvrir par ses mécanismes. Je ne l'ai pas encore cherché.

## Sources

Aucune nouvelle source. Les règles reposent sur ma connaissance générale du moteur de DM, sans consultation de ReDMCSB
pour cette étape, et sur les régularités des données (docs 009, 012).
