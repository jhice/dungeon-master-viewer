# 048 — Messages du jeu et règles de la vue 2D

> Demande de l'utilisateur : les messages destinés au joueur doivent apparaître dans la zone de messages de la simulation (`game-messages`), pas seulement dans la barre d'état ; les règles de la vue 2D deviennent une option du panneau.
> Pas de source externe.

## 1. Messages du jeu

- **Avant :** seuls les textes du donjon (`textShown`) allaient dans la zone de messages, sous la vue. Les autres messages (`showInfo`) n'allaient que dans la barre d'état.
- **Maintenant :** `say(text)`, dans `main.js`, écrit dans la barre d'état **et** dans la zone de messages (`game.window.message`, 3 lignes, effacement après 12 s).
- **Messages concernés :**
  - clic dans la vue : porte frappée ou cassée, objet pris ou posé, « Rien ne se passe », « Hors de portée » ;
  - actions et lancer : résultats, « Trop fatigué », munitions ;
  - sorts : sort incompréhensible, flasque manquante, potion, sort lancé ; grimoire ; potion bue ;
  - combat : créature touchée, tuée, brûlée, immatérielle ; vol, fuite, peur ; blessures et mort de Zed ; porte qui écrase ;
  - torche consumée.
- **Restent dans la barre d'état seule** (informations de débogage, avec coordonnées) :
  - effets d'arrivée (escalier, chute, téléporteur) et objets téléportés ;
  - générateurs, créatures qui repèrent le groupe ;
  - changements d'état des tuiles, « Bloqué : … » ;
  - tout ce qui concerne la visionneuse (survol, sélection, raccourcis).

## 2. Règles de la vue 2D

- Case « Règles (coordonnées sur les bords) » dans le panneau, en 2D seulement ; préférence `showRulers` (cochée par défaut), mémorisée.
- Décochée : classe `hide-rulers` sur `#view` ; la CSS (`tiles-2d.css`) cache les règles et ramène leurs pistes à 0. L'ajustement du zoom (`fitCell`) n'en tient plus compte.
