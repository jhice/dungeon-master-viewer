# 036 — Lumière, phase H3 : réglages et finitions

> Dernière sous-phase du plan [029-sorts-et-lumiere-plan.md](029-sorts-et-lumiere-plan.md), après [035-lumiere-phase-h2.md](035-lumiere-phase-h2.md).
> Sources : Three.js 0.170 (normal maps, ombres), et le filtre de Sobel, d'après les connaissances préalables. Voir [000-sources.md](000-sources.md).

## 1. Ce qui est fait

Le panneau de configuration a une nouvelle section, **« Lumière (vue du jeu) »**. Elle est présente quel que soit le renderer (2D ou 3D), car elle règle la fenêtre de jeu.

| Réglage | Type | Défaut | Effet |
|---|---|---|---|
| Lumière globale | curseur, 0 à 100 % par pas de 5 | 0 % (fidèle à DM) | S'ajoute au modèle hors du niveau 0 : lumière hémisphérique et appoint du groupe à cette part de leur intensité du Hall |
| Portée des torches | curseur, 1,5 à 8 cases par pas de 0,5 | 3,5 (l'ancien `fogFar`) | Portée de la torche du groupe et des porte-torches. Lumière magique : 1,6 × cette portée. Fin du brouillard |
| Brouillard (niveau éclairé) | case | oui | Sur un niveau éclairé (niveau 0, ou lumière globale > 0), le lointain se fond dans le noir, de `portée − 1` à `portée`. Sur un niveau sombre, le noir hors des lumières le remplace toujours |
| Scintillement des flammes | case | oui | Coupé : intensité fixe, et plus de boucle de rendu |
| Ombres | case | oui | Les 3 lumières à ombre (torche du groupe, 2 porte-torches) n'en projettent plus |
| Relief des textures | case | non | Normal maps des murs, du sol et du plafond (§ 3) |

**Conservation :** les valeurs sont gardées dans les préférences du navigateur (`prefs.lighting`, `preferences.js`). Elles s'appliquent immédiatement, sans rouvrir la fenêtre de jeu.

| Fichier | Rôle |
|---|---|
| `src/render/first-person/lighting-settings.js` | **Nouveau.** `DEFAULT_LIGHTING`, sans Three.js : `main.js` le lit sans charger la 3D (repli sur la 2D si le CDN manque) |
| `src/render/first-person/fp-lights.js` | Réglages modifiables à chaud (`configure`), brouillard géré ici, lueur des téléporteurs (`setGlowing`) |
| `src/render/first-person/normal-map.js` | **Nouveau.** `normalMapOf(texture, strength)` |
| `src/render/first-person/fp-renderer.js` | Option `lighting`, `setLighting(changes)`, relief des parties texturées, miroir des normal maps une case sur deux |
| `src/ui/control-panel.js` | Nouveau type de schéma `heading` (titre de section) |
| `src/main.js`, `styles/main.css` | Section du panneau, préférences, style du titre |

## 2. Téléporteurs dans le noir

**Avant :** leur matière émissive les rendait visibles dans le noir complet (doc 035, § 5).

**Désormais :** leur lueur suit la lumière globale, à `0,6 × part globale` :
- au niveau 0, rien ne change ;
- sur un niveau sombre sans lumière globale, ils ne se voient qu'à la lumière d'une torche. C'est vérifié avec le téléporteur (26, 29) du niveau 1.

## 3. Relief des textures

- **Calcul** (`normal-map.js`) :
  - la luminance de la texture procédurale sert de hauteur : les blocs clairs ressortent de leurs joints sombres ;
  - un filtre de Sobel en donne les pentes, multipliées par `strength` = 2 ;
  - le filtre boucle sur les bords, car la texture se répète d'une case à l'autre ;
  - la normal map est en couleurs linéaires (`NoColorSpace`).
- **Calcul paresseux :** chaque texture n'est traitée qu'une fois, au premier passage en relief. Les cartes sont gardées jusqu'à la fermeture de la vue.
- **Intensité :** `normalScale` = **0,7**. La doc 029 proposait 0,3, mais à 0,3 la différence était invisible. À 1,5, le relief est net (arêtes des blocs en biseau, mouchetures en creux), mais trop marqué. C'est une valeur réglée à l'œil, **provisoire**.
- **Miroir une case sur deux** (doc 027) : le shader retourne aussi les coordonnées de la normal map (`vNormalMapUv`). Three.js calcule le repère tangent à partir des dérivées des coordonnées, donc le relief se retourne avec la texture.
- **Parties concernées :** murs, sol et plafond (avec ou sans trou de trappe). Les portes et les décors n'ont pas de relief.

## 4. Détails

- **Basculer les ombres** change `castShadow` sur les lumières. Three.js recompile alors les matériaux : c'est un à-coup unique, au moment du clic.
- **Couper le scintillement** remet les intensités à leur valeur de base. La boucle de rendu s'arrête d'elle-même.
- **Clés du panneau :** les réglages de lumière sont séparés des réglages du renderer actif (3D : `links`, `labels`, `levelGap`…), sans conflit de clés.

## 5. Vérification

- **Tests Node** (8) : ils passent toujours. H3 ne touche pas à `src/sim/`.
- **Navigateur** (serveur `127.0.0.1:5500`), au niveau 1, en (17, 13), face au porte-torche :
  - lumière globale à 40 % : murs visibles au loin, avec le brouillard ;
  - portée à 6 cases : le couloir est éclairé plus loin ;
  - ombres coupées : l'ombre de l'objet au sol disparaît ;
  - relief : comparaison à 0, 0,7 et 1,5 ;
  - les valeurs sont retrouvées après un rechargement.
- **Téléporteur (26, 29)** : invisible dans le noir, visible à la torche.
- **Niveau 0 :** inchangé.
- **Console :** aucune erreur.
- **Préférences :** celles modifiées pendant les tests ont été remises aux valeurs par défaut.

**Fin des phases G et H** (doc 029). Il reste :
- les valeurs provisoires (intensités, relief, tables de lumière) ;
- la reprise des performances avec les déplacements fluides (phase F, doc 035 § 7).
