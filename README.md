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

**Phase actuelle : préparation du projet.** Ce dépôt contient les spécifications initiales. Le code Flutter, les médias audio, les tests et les APK restent à construire et à valider.

## Démarrage futur

Une fois le projet Flutter initialisé :

```bash
flutter pub get
flutter analyze
flutter test
flutter run
```

Construction Android mobile (après configuration du SDK Android) :

```bash
flutter build apk --release
```

La version Android TV nécessitera une configuration spécifique, une navigation complète à la télécommande et des tests sur émulateur ou appareil Android TV. Ne pas annoncer un APK TV opérationnel avant ces validations.
