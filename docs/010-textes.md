# 010 — Textes

> Suite de [009-logique-actuators-teleporteurs.md](009-logique-actuators-teleporteurs.md).
> Inscriptions murales, messages, parchemins et fiches des champions : correction de l'encodage,
> décodage des fiches, marqueurs sur la carte, infobulle et panneau de lecture.

## 1. Les 125 textes

| Genre | Nb | Où | Remarques |
|---|---|---|---|
| Inscriptions | 59 | 58 contre un mur (sur une face), 1 sur un téléporteur du niveau 0 (« IT IS TOO BAD YOU… ») | Visibles (`visible = 1`) |
| Messages | 8 | Au sol ou au mur, invisibles | Affichés par un mécanisme : « WELCOME BACK BRAVE ADVENTURERS » au retour au Hall, « YOU WILL REGRET THAT », « READING ROOM KEEP OUT », « SHORTCUT BACK », et les 4 textes de fin au niveau 12 (0, 0) |
| Parchemins | 34 | Sur la case du parchemin, ou de son contenant (6 sont dans un coffre ou portés par une créature) | Le 35ᵉ parchemin n'est placé nulle part (voir 002) |
| Champions | 24 | Au sol du Hall (niveau 0), devant le miroir de chaque champion | Fiche encodée, décodée ci-dessous |

Les 4 textes de fin commencent par une lettre parasite : « **A**THANK YOU MY FRIENDS… », « **B**ONLY BY LEARNING… »,
« **C**BY YOUR BRAVE DEEDS… », « **D**YOUR NAMES WILL… ». C'est très probablement un **code d'ordre** ou de variante
de fin, lu par le moteur. Ces lettres sont affichées telles quelles.

## 2. Correction de l'encodage (convertisseur)

Les mots spéciaux de l'encodage 5 bits (`_THE`, `_AND`, `_YOU`) **incluent leur espace**. Dans les données, ils sont
toujours suivis directement d'une lettre (`PUT _THEGEM`, `IF _YOUWANT`), sur 48 occurrences. Le nettoyage de 002 donnait
« THEGEM ». Il donne maintenant « PUT THE GEM », « HALK, THE BARBARIAN ».

- **Correction :** `cleanText()` dans `tools/dungeon-converter.mjs`, puis régénération de `data/dungeon.json`
  (validateur à 0 avertissement). Seul le champ `texts[].text` a changé : le reste du JSON est identique, comparaison faite.

## 3. Fiches des champions (`decodeChampion`)

Le format est connu pour DM. Les lettres A à P valent les chiffres hexadécimaux 0 à F.

```
HALK                         nom
THE BARBARIAN                titre
                             (vide)
M                            sexe
AAFK ACOO AAAA               PV 0x5A = 90 · endurance 0x2EE = 750 → 75 affiché (÷ 10) · mana 0
CI DH CL BO CO CG DA         chance 40 · force 55 · dextérité 43 · sagesse 30 · vitalité 46 · anti-magie 38 · anti-feu 48
EAEA AAAA AAAA AAAA          16 compétences cachées (4 par classe) : Guerrier Swing 4, Club 4
```

| Classe | Compétences cachées (dans l'ordre) |
|---|---|
| Guerrier | Swing, Thrust, Club, Parry |
| Ninja | Steal, Fight, Throw, Shoot |
| Prêtre | Identify, Heal, Influence, Defend |
| Magicien | Fire, Air, Earth, Water |

**Vérification :** les classes décodées correspondent aux champions connus. Halk et Stamm sont guerriers purs (mana 0),
Mophus (« The Healer ») prêtre, Gothmog magicien, Wuuf ninja et prêtre, Zed et Linflas touche-à-tout, Daroou guerrier
et magicien avec 100 PV. Ces correspondances viennent de ma connaissance du jeu : à confirmer dans l'original si tu le souhaites.

## 4. Rendu et interface

| Élément | 2D | 3D |
|---|---|---|
| Inscription murale | « ≡ » parchemin contre la face | Plaque claire sur la face, aux 3/4 de la hauteur |
| Message invisible | « … » bleuté, atténué | Plaque bleutée |
| Fiche de champion | — (le miroir est déjà signalé) | — |

- **Calque Textes** (case du panneau, touche `X`), en 2D et en 3D.
- **Infobulle :**
  - inscription ou message : **texte intégral**, avec la face (« Inscription (face E) · THIS WALL SAYS NOTHING ») ;
  - message : la mention « affiché par un mécanisme » ;
  - fiche de champion : le résumé décodé (sexe, classes, PV, endurance, mana, attributs).
  - La ligne « Déclenché par… » de 009 montre aussi quel mécanisme affiche un message.
- **Panneau Textes** (touche `J`), sous l'inventaire :
  - filtres Inscriptions 59, Messages 8, Parchemins 34, Champions 24 ;
  - recherche dans le texte ;
  - fiches triées par niveau puis par position, avec le texte en capitales comme dans le jeu, ligne à ligne ;
  - pour les champions, la fiche complète avec les compétences non nulles par classe ;
  - **un clic localise** le texte sur la carte, comme dans l'inventaire.
- **Colonne de droite :** avec plusieurs panneaux ouverts, c'est la colonne qui défile, et non plus toute la page.

## 5. Architecture

```
src/core/texts.js         buildTexts() : classification et emplacement ; decodeChampion(), championSummary(), textsAt()
src/ui/texts-panel.js     panneau Textes
src/render/palette.js     + TEXT_COLORS
src/render/dom/…          + textMarkers() (calque 'texts')
src/render/three/…        + plaques de texte (InstancedMesh, échelle par instance)
```

## 6. Vérifications (Chrome)

- **2D, niveau 1 :** 5 marqueurs de texte. L'infobulle de (21, 8) affiche « Inscription (face E) · THIS WALL SAYS NOTHING
  · Déclenché par 1 source(s) (23, 8) ».
- **Panneau :** les filtres comptent 59 / 8 / 34 / 24. La fiche d'Iaido affiche « Guerrier / Prêtre · PV 48 · Endurance 65 · Mana 11 »
  et ses compétences. Le clic sur « HALL OF » ouvre le niveau 0 et met en évidence la case (8, 5).
- **Colonne :** avec l'inventaire et les textes ouverts, la page ne défile plus.
- **3D :** 67 plaques de texte générées (59 inscriptions et 8 messages), réparties sur les niveaux. Aucune erreur dans la console.

## 7. Bilan des étapes de CLAUDE.md

Les étapes 001 à 010 sont faites. Reste « plus tard » : la vue à la première personne vers un mode jouable,
avec en préalable la **simulation de la logique** (voir 009 § 7) et éventuellement les **sprites d'origine** (voir 008).
