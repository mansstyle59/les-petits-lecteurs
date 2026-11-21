# Architecture technique proposée

## 1. Vue d'ensemble

Application Flutter avec une base de code partagée et deux expériences d'interface :

- **Mobile** : tactile, prioritairement portrait.
- **TV** : paysage, navigation au D-pad et focus explicite.

Le contenu pédagogique, les profils, les règles de progression et les modèles sont partagés. La présentation et les interactions sont adaptées à chaque plateforme.

## 2. Architecture logique

```text
Application
├── App / navigation / thème
├── Domaine pédagogique
│   ├── Lettres et graphèmes
│   ├── Sons et ressources audio
│   ├── Syllabes
│   ├── Mots et images
│   └── Activités et règles de jeux
├── Profils et progression
├── Stockage local
├── Lecteur audio
└── Présentation
    ├── Mobile
    └── Android TV
```

## 3. Structure de dossiers indicative

```text
lib/
  main.dart
  app/
    app.dart
    router.dart
    theme/
  core/
    audio/
    storage/
    models/
    widgets/
  features/
    home/
    profiles/
    alphabet/
    sounds/
    syllables/
    words/
    games/
    progress/
    parent/
  platform/
    mobile/
    tv/
assets/
  audio/
  images/
  lessons/
test/
  unit/
  widget/
docs/
```

Adapter cette structure au framework et aux conventions retenues lors de l'initialisation. Ne pas créer tous les dossiers vides d'avance.

## 4. Modèles métier possibles

- **ChildProfile** : identifiant local, prénom ou pseudonyme, avatar, date de création.
- **Lesson** : identifiant, titre, niveau, type d'activité, ordre, contenu.
- **LetterItem** : graphème, forme majuscule, forme minuscule, son(s), exemple illustré.
- **SyllableItem** : graphèmes, audio, niveau et exemples.
- **WordItem** : orthographe, image, audio et difficulté.
- **ActivityResult** : profil, activité, date, réussite et étoiles.
- **ProgressSummary** : progression calculée pour un profil.

Ces modèles sont des propositions : les finaliser avant de figer le stockage.

## 5. Stockage et fonctionnement hors connexion

Pour le MVP :
- contenus pédagogiques embarqués dans l'application ;
- fichiers audio et illustrations locaux ;
- profils et progression conservés localement ;
- aucune connexion obligatoire ;
- stratégie de sauvegarde à documenter.

Ne pas ajouter Firebase ou un backend tant qu'un besoin concret de synchronisation n'est pas défini.

## 6. Audio

- Un service audio centralisé.
- Lecture, arrêt, reprise et réécoute.
- Gestion des interruptions et du volume.
- Association explicite entre contenu et fichier audio.
- Vérification des licences et de la qualité des voix françaises.

## 7. Adaptation Android TV

- Détecter la plateforme et choisir la navigation adaptée.
- Définir des composants focusables et un ordre D-pad prévisible.
- Afficher un état de focus distinct du simple survol.
- Garder le bouton Retour cohérent.
- Vérifier le lancement TV, le manifeste et les contraintes de distribution.
- Tester sur un émulateur TV et, si possible, un appareil réel.

## 8. Sécurité et confidentialité

- Aucune clé secrète dans le dépôt.
- Minimiser les données relatives aux enfants.
- Préférer le stockage local pour la première version.
- Protéger l'espace parent contre les ouvertures accidentelles.
- Examiner les exigences légales avant toute publication.

## 9. Choix techniques à confirmer

Avant le premier développement :
1. Version Flutter stable et version minimale Android.
2. Stratégie de navigation et gestion du focus TV.
3. Stockage local adapté au volume de données.
4. Format et provenance des audios.
5. Gestion des illustrations et licences.
6. Stratégie de tests sur mobile et TV.
