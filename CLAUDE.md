# Dungeon Master clone 3D

## Objectifs

- Visualisateur 3D du jeu Dungeon Master sorti en 1989 (environ).
- Evoluer peut-être par la suite vers un jeu jouable.

## Données

- le fichier `Dungeon.xml` contient toutes les données du jeu (pas le moteur).

## Premières étapes possibles

Analyser le fichier XML en se concentrant d'abord sur

- la structure complète du format
  - si tu penses à un format de stockage plus souple que le XML dis-moi (JSON, autre, aucun ?)
- les 14 niveaux/maps
- un rendu ASCII des 14 niveaux
  - utiliser l'offset de chaque niveau : certains "pits" ou "stairs" doivent se superposer correctement
  - important : dans un premier temps ne rendre que les types de tuiles (wall, teleporter, door, etc.), pas leur contenu.
- idéalement, le moteur de rendu est interchangeable
  - ASCII
  - 2D (sprites)
  - 3D (modèles)
- vue des niveaux
  - 2D : niveau vue de dessus, on peut passer d'un niveau à l'autre au clavier
  - 3D : on voit les 14 niveaux superposés, au centre, avec une caméra orbitale et un zoom (voir technos ci-dessous)

## Technos

- HTML
- CSS
- JS
  - sous forme de modules ES6
  - on découpe les fichiers selon leur fonctionnalité
  - 2D : le DOM avec CSS
  - 3D : Three.js

## Etapes suivantes

### 006 - Les états des tuiles

On afficherait les portes ouvertes ou fermées, les trappes ouvertes ou invisibles et les faux murs franchissables.

Ta proposition de `6:10 PM` sur la session d'hier est très bien.

Réponses à tes questions :

- le repère d'un état caché (opacité réduite ou autre) ;
  - réponse : comme tu as suggéré
- la porte ouverte en 3D (relevée ou masquée) ;
  - réponses :
    - relevée en 3D,
    - un rectangle vide avec une bordure en 2D
- la touche S pour afficher ou masquer les états ;
  - réponse : OK
- les états en ASCII, oui ou non.
  - réponse : on laisse de côté pour le moment, je verrais ce que je fais du mode ASCII, si je le conserve ou non.

### 007 - réglages 3D

- espacement des niveaux
- hauteur des murs (pouvoir aller jusqu'à 70% de hauteur sur un cube, pour refléter le côté claustrophobe du jeu original)
- étiquettes de niveau

### 008 - inventaire des objets et des monstres

- l'idée ici est de pouvoir visualier où se trouvent créatures et objets.
- si l'inventaire comprend aussi sa disposition (2D et 3D), rappelle-toi que chaque tile contient 4 positions. à voir aussi comment cela pourra se gérer au survol en 2D et en 3D. ce qui se fait dans d'autres éditeurs, c'est d'afficher le contenu de la tile au survol.
- si tu as des questions ou que tu souhaites détailler cette étape, pose-moi des questions.

### 009 - logique des actuators et téléporteurs

### 010 - textes

### plus tard

Vue « à la première personne » vers un mode jouable.

## Workflow

- résume toutes tes analyses suite à nos échanges dans un dossier `docs/` avec un préfixe 001, 002, 003.