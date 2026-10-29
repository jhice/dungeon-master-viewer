# Les sons dans la simulation

## Objectifs : ajouter les sons comme dans DM

- les sons se trouvent dans graphics.dat, d'après http://greatstone.free.fr/dm/db_data/dm_amiga_36_caps/graphics.dat/graphics.dat.html
- on trouve les sons liés aux créatures (déplacement et attaques) ici : http://dmweb.free.fr/games/dungeon-master/solutions/creatures/
- trouver une source pour télécharger tous les sons en local
  - si il existe des soucis de droits, on essaiera de les remplacer par d'autres sons (ou obtenir l'autorisation, d'autres outils ou remakes l'ont obtenu)
- identifier l'action qui lance tel ou tel son, par ex. (non exhaustif)
  - le groupe se heurte à un mur
  - le groupe meurt
  - la main frappe un mur
  - son d'une arme
  - déplacement créature
  - attaque créature
  - clic sur un actuator
  - activation de téléporteur (ceux qui émettent un son sont indiqués comme tel dans les données)
  - etc.

A noter : dans DM, on entend les créatures qui se déplacent au même niveau. de mémoire, il doit y a voir un système qui gère l'audio : nombre max. de créatures à entendre pour éviter l'effet de chorus si on joue le même son plusieurs fois, créature la plus proche, le volume qui diminue avec la distance. spatialiser à minima avec de la stéréo (+ le volume donc).

## Phases possibles

Je te suggère des phases, à toi de voir comment tu veux gérer :

1. identifier tous les sons du jeu
2. trouver les sons en ligne et les télécharger (format web si possible .mp3 ou .wave. ou .ogg)
3. planifier les impacts dans le code
4. coder
5. ajouter une option pour désactiver les sons dans le panen 2D/3D

## Outils

Je suggère l'utilisation de [Howler.js](https://github.com/goldfire/howler.js), le quick start devrait suffire.