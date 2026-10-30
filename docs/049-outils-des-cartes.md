# 049 — Outils des cartes 2D et 3D

> Demande de l'utilisateur : un menu contextuel au clic droit sur les cartes 2D et 3D (se téléporter, ramasser les objets, activer les actuators), un bouton « Valeurs par défaut » dans le panneau, une option « Invincibilité ».
> Pas de source externe.

## 1. Menu contextuel des cartes

- **Ouverture :** clic droit sur une case.
  - En 2D, sur toute case de la grille.
  - En 3D, sur une case du niveau pointable, si le pointeur n'a pas bougé (plus de 4 px) entre l'appui et le relâchement. Le clic droit glissé reste le déplacement de la caméra.
- **Titre :** niveau, coordonnées locales et type de la case.
- **Commandes :**
  - **Se téléporter ici (F) :** comme la touche F, sans sélection préalable. Ouvre la simulation si elle est fermée ; sans les effets de la case ni ses plaques (`sim.teleport`).
  - **Ramasser les objets (n) :** tous les objets posés sur la case vont dans l'inventaire, y compris ceux des alcôves d'un mur, quelle que soit la distance (`sim.collectAll`). Un coffre y entre avec son contenu, comme avec « Ranger ». Les plaques de la case remarquent le départ des objets.
  - **Activer les actuators (n) :** chaque actuator de la case agit comme déclenché, quelle que soit sa condition (`sim.fireAll`) : un `hold` envoie `set`, une serrure ne prend pas de clé. Les actuators désactivés (`onceOnly` déjà utilisé, générateur au repos) ne font rien.
  - Une commande sans objet ou sans actuator est grisée.
- **Fermeture :** un choix, un clic ailleurs, Échap, la molette ou la perte du focus.
- **Code :** `src/ui/context-menu.js` (générique) ; option `onContextMenu(info, event)` des renderers 2D et 3D ; `openTileMenu()` dans `main.js` ; `collectAll()` et `fireAll()` dans `src/sim/logic.js`.

### Limite : actuators à objet (porte-torche, alcôve)

« Activer » et « Ramasser » sont deux commandes séparées. Quand l'actuator d'une case est lié à un objet, il faut les deux pour garder un état cohérent :

- **Porte-torche** (niveau 0, (3, 14)) : l'actuator 7 est un « Item storage » (type 13) avec une rotation locale. En jeu, un clic main vide prend la torche **et** fait tourner l'actuator, ce qui affiche le porte-torche vide.
  - « Activer » fait seulement tourner l'actuator : le porte-torche paraît vide, mais la torche reste dans le mur.
  - « Ramasser » prend seulement la torche : le porte-torche paraît encore plein.
  - Les deux commandes ensemble donnent l'état du jeu. Une seule laisse un décalage, qui inverse la suite des clics dans la vue.
- **Alcôve** (niveau 0, (4, 18)) : son seul actuator (620) est « Inactive » (type 0, sans action). Il ne fait que porter le décor de l'alcôve. « Activer » ne fait rien, mais compte quand même un actuator, dans le menu et dans le message. Ce qu'il faut ici, c'est « Ramasser ».

Pistes, pas encore faites :
- ne pas compter les actuators « Inactive » (type 0) dans le menu ;
- pour un « Item storage », faire jouer à « Activer » le clic complet : prendre ou poser l'objet, puis tourner.

## 2. Valeurs par défaut

- Bouton en bas du panneau. Il remet toutes les valeurs du panneau :
  - visionneuse : repère local, couches, états, liens, infobulle, auto-ajustement, règles, invincibilité (`PANEL_DEFAULTS`, `main.js`) ;
  - réglages de chaque renderer (le 3D expose `defaultSettings`) ;
  - lumière de la vue du jeu (`DEFAULT_LIGHTING`) et sons (`DEFAULT_AUDIO`).
- Le renderer et le panneau sont reconstruits. Le niveau affiché, le renderer choisi et le zoom ne changent pas.

## 3. Invincibilité

- Case « Invincibilité (Zed ne perd pas de PV) » du panneau ; préférence `invincible`, mémorisée.
- `sim.invincible` : les coups des créatures, les portes, les boules de feu et les murs heurtés comptent pour 0 PV. Les événements et les sons restent.

## 4. Tests

- `node tools/test-map-tools.mjs` : mur heurté sans perte de PV, ramassage d'une alcôve (niveau 0, (14, 2)), actuator qui ouvre une porte.
