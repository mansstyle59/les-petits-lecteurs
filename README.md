# Les Petits Lecteurs

**Apprendre à lire en s'amusant — pour les enfants de 5 à 6 ans.**

Les Petits Lecteurs est un projet d'application éducative Android qui accompagne les enfants dans la découverte des lettres, des sons, des syllabes et de leurs premiers mots grâce à des activités courtes, des illustrations, de l'audio et des mini-jeux.

## Plateformes visées

- **Android mobile et tablette** : expérience tactile adaptée aux petits écrans.
- **Android TV** : interface horizontale dédiée, utilisable intégralement avec une télécommande.

Les deux versions partageront les contenus pédagogiques et la progression, mais auront des interfaces adaptées à leurs usages. Une application mobile simplement agrandie ne sera pas considérée comme une version TV terminée.

## Fonctionnalités prévues pour le MVP

- Profils locaux pour plusieurs enfants.
- Alphabet A à Z, majuscules et minuscules.
- Découverte des sons des lettres avec lecture audio.
- Premières syllabes simples.
- Premiers mots illustrés.
- Mini-jeux d'association, d'écoute et de construction de syllabes.
- Étoiles et progression individuelle, sans classement.
- Espace parent pour les profils, le volume et le suivi.

## Principes importants

- Apprentissage positif, ludique et progressif.
- Consignes simples, de préférence lues à voix haute.
- Gros caractères, boutons lisibles et animations légères.
- Pas de publicité, de chat ni d'achat intégré dans l'espace enfant.
- Distinguer le **nom d'une lettre** du **son** utile à la lecture.
- Contenus et prononciations françaises à faire relire par une personne compétente en apprentissage de la lecture.
- Priorité au fonctionnement hors connexion pour le premier prototype.

## Technologies envisagées

- Flutter / Dart.
- Android mobile et Android TV avec adaptations d'interface distinctes.
- Stockage local pour le MVP.
- Synchronisation en ligne éventuelle dans une version ultérieure, après étude des besoins et de la confidentialité.

## Documentation

- [Cahier des charges](docs/CAHIER_DES_CHARGES.md)
- [Prompt de développement pour un agent IA](docs/PROMPT_DE_DEVELOPPEMENT.md)
- [Architecture technique proposée](docs/ARCHITECTURE.md)
- [Feuille de route](docs/ROADMAP.md)

## État du projet

**Version d'essai jouable.**

- Application web : https://mansstyle59.github.io/les-petits-lecteurs/app/ (fonctionne hors connexion après la première ouverture ; sur iPhone, Safari → Partager → « Sur l'écran d'accueil »).
- APK Android mobile et Android TV : https://github.com/mansstyle59/les-petits-lecteurs/releases/tag/essai (signature de développement, installation manuelle).
- 4 modules, 17 leçons, 213 voix françaises générées (Piper, voix siwis).

À faire : relecture pédagogique des contenus, enregistrement humain des sons courts (p, t, b, d, c, k, g), synchronisation en ligne éventuelle, illustrations dédiées, application iOS native (nécessite un Mac et un compte développeur Apple).

L'architecture actuelle (application web embarquée dans une WebView Android) remplace pour l'instant le projet Flutter décrit dans la documentation.

## Développement

- `tools/generer_voix.py` : régénère les voix à partir de `contenu/cours.json`.
- `tools/build_sw.py` : régénère le cache hors connexion après toute modification.
- Les APK sont compilés automatiquement par GitHub Actions à chaque push sur `main`.
