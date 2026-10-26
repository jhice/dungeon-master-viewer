# 011 — Ajustements UX 2D et 3D

> Suite de [010-textes.md](010-textes.md).
> Liste de réglages demandés dans CLAUDE.md (étape 011), tous intégrés et testés dans Chrome.

## 1. 2D et 3D

| Demande | Réalisation |
|---|---|
| Une créature seule reste au centre, mais à la taille d'une créature en groupe | 2D : la classe `.alone` (×1,5) est supprimée. 3D : l'échelle ×1,5 du cône est supprimée |
| Changer de niveau en cliquant sur un escalier | Un clic sur un escalier mène à l'autre extrémité (mêmes coordonnées globales, niveau ±1), qui est **sélectionnée et mise en évidence**, comme avec les étiquettes de téléporteurs. La barre d'état l'indique : « ↑ vers niveau 0 (clic) » |
| Trappes carrées, mêmes dimensions | 2D : carré de 58 % de la case, à la place du disque. 3D : dalle 0,76 × 0,76 à la place du cylindre de rayon 0,38 (les 4 variantes : ouverte, fermée, invisible…) |
| Infobulle toujours affichée, avec les infos de la barre d'état | L'en-tête de l'infobulle reprend la ligne de la barre d'état (coordonnées locales et globales, type, cible d'un escalier, axe, état). Elle s'affiche même sur une case vide |
| Option « always show tooltip » | Case **Toujours afficher l'infobulle** dans le panneau (2D et 3D), activée par défaut. Décochée, on retrouve le comportement précédent : infobulle seulement si la case a du contenu |

## 2. 2D

| Demande | Réalisation |
|---|---|
| Téléporteurs : même couleur, hachures verticales comme les faux murs, plus étroits (comme en 3D) | Bloc de **70 %** de la case (`inset: 15 %`), couleur `--tile-teleporter`, hachures verticales de 1 px tous les 3 px, liseré sombre. Le halo radial est supprimé |
| Liens plus fins | Fait par l'utilisateur dans `tiles-2d.css` (traits de 0,08 case, étiquettes de 0,5), conservé tel quel |
| Repère local par défaut | `frame: 'local'` dans les préférences par défaut |
| En repère local, toujours ajuster après un changement de niveau | Après chaque changement de niveau, le zoom est recalculé pour que le niveau tienne dans la vue. Effet testé : 48 px au niveau 0 (19 × 19), puis 36 px au niveau 1 (32 × 32) |
| Option « auto-adjust » dans le panneau 2D | Case **Auto-ajustement (repère local)**, activée par défaut (aussi en ASCII). Décochée, le zoom choisi est conservé d'un niveau à l'autre |

L'ajustement tient désormais compte de la colonne de panneaux de droite, qui recouvre la vue : la carte se loge à côté.

## 3. 3D

| Demande | Réalisation |
|---|---|
| Maj + molette = changer de niveau | Écouteur `wheel` en phase de capture sur le canvas, avant celui d'OrbitControls : avec Maj, le zoom est bloqué et le niveau change, molette vers soi = niveau inférieur. **Un niveau au plus toutes les 200 ms**, pour qu'un coup de molette n'en saute pas plusieurs. `deltaX` est aussi pris en compte, car certains systèmes transforment Maj + molette en défilement horizontal |
| Toujours ajuster après un changement de niveau | La caméra **glisse** vers la position de cadrage du niveau (celle de la touche `0`) en même temps que sa cible. C'est un mouvement animé, pas un saut. Toucher la souris interrompt la glissade, comme avant |
| Option « auto-adjust » dans le panneau 3D | Case **Auto-ajustement** (réglage `autoAdjust` du renderer 3D, mémorisé). Décochée, seule la cible glisse, la distance et l'angle de la caméra sont conservés (comportement de 005) |

Le réglage 3D s'appelle `autoAdjust` et non `autoFit`, pour ne pas entrer en conflit avec la préférence 2D `autoFit`
que `main.js` traite lui-même.

## 3 bis. Retours intégrés

| Demande | Réalisation |
|---|---|
| 3D : conserver le mode d'affichage au changement de renderer et dans le localStorage | Le mode (`focus` / `all` / `solo`, touche F) devient un réglage du renderer 3D (`settings.mode`, hors panneau). À chaque appui sur F, le renderer le signale à `main.js` (option `onSettingsChange`), qui l'enregistre dans `prefs.settings.three`. Il est restauré quand on revient au 3D et au rechargement |
| 2D : changement de niveau avec Maj + molette | Le code est factorisé dans `src/render/shift-wheel.js` (`bindShiftWheel`), utilisé par les renderers 2D et 3D. En 2D, l'écoute porte sur toute la vue, donc ça marche aussi à côté d'un petit niveau. La molette sans Maj fait toujours défiler la carte |

Vérifié dans Chrome :
- **2D :** Maj + molette donne 0 → 1, puis → 2 hors de la grille, puis → 1 vers le haut. Sans Maj, l'événement n'est pas intercepté.
- **3D :** deux appuis sur F donnent le mode solo, enregistré (`"mode": "solo"`). Après un passage par l'ASCII et la 2D, puis retour au 3D,
  un appui sur F donne « mis en avant », la suite logique du mode solo, qui a donc bien été restauré.

## 4. Vérifications (Chrome, préférences vides)

- **Démarrage :** 2D en repère local, panneau avec « Toujours afficher l'infobulle » et « Auto-ajustement » cochés.
- **Infobulle :** sur une case vide (0, (6, 1)), elle affiche « niveau 0 · (6, 1) local · [6, 1] global · floor ».
- **Escalier :** le clic sur l'escalier (3, 15) du niveau 0 mène au niveau 1, où la case (3, 1) est sélectionnée. Le zoom passe de 48 à 36 px.
- **Visuels :** trappes carrées, téléporteurs hachurés et réduits, créatures seules de taille normale.
- **3D :** Maj + molette donne niveau 1 → 2, un second cran à moins de 200 ms est ignoré, puis 2 → 3 et 3 → 2. Avec l'auto-ajustement, le niveau 2 est recadré au centre.
- Aucune erreur dans la console. Les préférences de test ont été effacées.

## 5. Documents antérieurs

- 004 indiquait le **repère global par défaut** : c'est maintenant le repère local.
- 005 décrivait une caméra qui garde sa distance en changeant de niveau : c'est maintenant le cas seulement avec l'auto-ajustement décoché.
