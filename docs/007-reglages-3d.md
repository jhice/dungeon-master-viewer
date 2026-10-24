# 007 — Réglages 3D

> Suite de [006-etats-des-tuiles.md](006-etats-des-tuiles.md).
> Espacement des niveaux, hauteur des murs et étiquettes de niveau, depuis un panneau de contrôle.
> La § 4 décrit les retours intégrés : valeurs par défaut, et panneau de contrôle en 2D comme en 3D.

## 1. Utilisation

En 3D, un panneau **Réglages** s'affiche en haut à droite de la vue. On peut le replier en cliquant sur son titre.

| Réglage | Plage | Défaut | Effet |
|---|---|---|---|
| Espacement des niveaux | 1,5 à 10 (pas de 0,5) | **5** | Distance verticale entre deux sols. La caméra suit le niveau courant. |
| Hauteur des murs | 10 % à 100 % d'une case (pas de 5 %) | **70 %** | Murs, faux murs, portes et téléporteurs (90 % du mur), marches d'escalier, arêtes des murs disparus, départ des liens |
| Étiquettes de niveau | oui / non (touche **E**) | oui | Une étiquette « Niveau n » par niveau |

- **Hauteur des murs :** CLAUDE.md demande « jusqu'à 70 % sur un cube ». La plage va jusqu'au cube complet (100 %)
  pour couvrir les deux lectures : 70 % comme valeur, ou des murs plus hauts encore. Pour l'ambiance
  claustrophobe du jeu d'origine, 70 % à 100 % donnent des couloirs nettement encaissés, surtout en mode solo
  avec la caméra rapprochée.
- **Étiquettes :**
  - elles sont placées au coin nord-ouest de chaque niveau, juste au-dessus des murs ;
  - celle du niveau courant est en doré, et en mode `focus` les autres sont estompées ;
  - en mode `solo`, seule celle du niveau courant reste ;
  - **un clic sur une étiquette fait passer à ce niveau**, avec la même glissade de caméra qu'au clavier.
- **Mémorisation :** les réglages sont enregistrés dans les préférences du navigateur, par renderer (`prefs.settings.three`).
- **Clavier :** les touches tapées dans le panneau (flèches sur un curseur) ne pilotent pas la vue. Après un réglage
  à la souris, le curseur rend le focus, et les flèches changent de nouveau de niveau.

## 2. Architecture

- **`src/ui/settings-panel.js`** (devenu `control-panel.js`, voir § 4) : panneau générique construit à partir d'un **schéma** publié par le renderer
  (`{ key, label, type: 'range' | 'checkbox', min, max, step, format }`). Il ne connaît pas Three.js.
  `setValues()` le resynchronise quand un réglage change ailleurs, par exemple avec la touche E.
- **Contrat du renderer**, extensions optionnelles : `settingsSchema`, `settings` (lecture) et `applySettings(changes)`.
  `main.js` crée le panneau si `settingsSchema` existe, sauvegarde les préférences et transmet `onRequestLevel` (clic sur une étiquette).
  Le 2D et l'ASCII n'en ont pas, donc pas de panneau.
- **`three-renderer.js`** : `applySettings()` ne reconstruit que ce qui dépend du réglage modifié.

  | Changement | Travail | Durée mesurée |
  |---|---|---|
  | Hauteur des murs | Reconstruction des maillages des 14 niveaux et des liens | ~23 ms |
  | Espacement | Déplacement des groupes et des étiquettes, reconstruction des liens | ~1 ms |
  | Étiquettes | Visibilité seule | — |

  Le niveau courant reste à l'écran pendant les réglages : la cible et la caméra sont décalées du même déplacement vertical.
- **`level-meshes.js`** : `WALL_HEIGHT` constant devient l'option `wallHeight` (défaut `DEFAULT_WALL_HEIGHT` = 0,8).
  Les dimensions dérivées (porte et téléporteur à 90 %, marches, porte relevée, arêtes) sont calculées à partir d'un objet `h`.
- **Étiquettes :** `CSS2DRenderer` (addon de Three.js) superpose des `<button>` HTML positionnés en 3D : texte net,
  style en CSS, cliquables. La surcouche ignore la souris (`pointer-events: none`), sauf sur les étiquettes, pour ne pas bloquer l'orbite.

## 3. Vérifications (Chrome)

- Niveau 3 en mode `focus` : panneau à 3,0, 80 % et étiquettes cochées, les 14 étiquettes visibles, « Niveau 3 » en doré.
- Hauteur à 100 % et espacement à 6 : murs en cubes, niveaux plus espacés, préférences enregistrées
  (`{"levelGap":6,"wallHeight":1,"labels":true}`).
- Clic sur l'étiquette « Niveau 7 » : passage au niveau 7, et l'en-tête affiche « Niveau 7 / 13 ».
- Touche E : la barre d'état indique « Étiquettes de niveau : masquées » et la case du panneau se décoche.
- Rechargement : les réglages 6,0 et 100 % sont restaurés. Mode solo avec zoom : couloirs encaissés, murs pleine hauteur.
- Aucune erreur dans la console. Les préférences de test ont ensuite été effacées du navigateur.

Limite constatée : en mode `focus`, les étiquettes des autres niveaux restent dessinées par-dessus le niveau courant.
Le HTML n'est pas masqué par la profondeur 3D. Elles sont estompées, et les masquer reste possible avec E ou en mode `solo`.

## 4. Retours intégrés

**Valeurs par défaut :** murs à **70 %** (`DEFAULT_WALL_HEIGHT`) et espacement à **5** (`DEFAULT_SETTINGS.levelGap`).
Elles s'appliquent tant que l'utilisateur n'a pas modifié et enregistré ses propres réglages.

**Panneau de contrôle**, pour tous les renderers (`src/ui/control-panel.js`, qui remplace `settings-panel.js`) :

| Contrôle | 2D | 3D | ASCII |
|---|---|---|---|
| Boutons **▲ Haut / ▼ Bas** (désactivés aux niveaux 0 et 13) | ✅ | ✅ | ✅ |
| États des tuiles `S` | ✅ | ✅ | — (types seuls) |
| Repère global `G` | ✅ | — (toujours global) | ✅ |
| Liens escaliers / trappes `L` | — | ✅ | — |
| Étiquettes de niveau `E` | — | ✅ | — |
| Espacement des niveaux, hauteur des murs | — | ✅ | — |

- **Composition :** `main.js` assemble le schéma, avec d'abord les contrôles communs puis `renderer.settingsSchema`.
  Le panneau, lui, ne connaît que des boutons, des cases et des curseurs.
- **Raccourcis :** une case du renderer qui déclare `shortcut` (L, E) est automatiquement liée à sa touche.
  `L` n'est donc plus une action propre au renderer : les liens sont devenus un réglage (`links`), mémorisé comme les autres.
- **Synchronisation :** les touches S, L et E mettent à jour la case correspondante.
  G recrée le renderer, donc le panneau aussi, avec la bonne valeur.
- **Mise en page :** le panneau est ancré dans `#view-wrap`. La vue `#view` défile dessous en 2D, alors que le panneau reste fixe.
  Son état replié ou déplié est mémorisé (`prefs.panelOpen`).

Vérifié dans Chrome :
- **en 2D :** Bas passe du niveau 0 au niveau 1 et réactive Haut ; la case États masque les états et S la recoche ;
  la case Repère passe en local ;
- **en 3D :** panneau à 5,0 et 70 % ; L donne « Liens escaliers / trappes : non » et décoche la case ;
  Haut ramène au niveau 0 et se désactive ;
- aucune erreur dans la console.

Attention au cache : après cette mise à jour de `index.html`, un navigateur qui sert l'ancienne page en cache plante au démarrage
(`#view-wrap` introuvable). Un rechargement forcé (Ctrl+Maj+R) suffit.

## 5. Suite (CLAUDE.md)

- **008** : inventaire des objets et des monstres.
- **009** : logique des actuators et des téléporteurs.
- **010** : textes.
