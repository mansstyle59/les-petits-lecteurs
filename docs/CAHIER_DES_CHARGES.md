# Cahier des charges — Les Petits Lecteurs

## 1. Présentation

- **Public cible :** enfants de 5 à 6 ans qui commencent à apprendre à lire.
- **But :** découvrir les lettres, les sons, les syllabes et les premiers mots par le jeu.
- **Promesse :** apprendre en s'amusant, à son rythme, sans pression ni compétition.

## 2. Supports

### Android téléphone et tablette
- Interface tactile, prioritairement verticale sur téléphone.
- Boutons larges et espacés.
- Une consigne principale par écran.
- Audio réécoutable à tout moment.
- Navigation simple avec retour à l'accueil facilement accessible.
- Respect des zones de sécurité de l'écran.

### Android TV
- Interface horizontale 16:9, pensée pour une utilisation à distance.
- Navigation complète avec les flèches, OK et Retour de la télécommande.
- Focus très visible et ordre de navigation logique.
- Lettres, images et textes de grande taille.
- Marges de sécurité adaptées aux téléviseurs.
- Aucune action ne doit exiger un écran tactile.

## 3. Parcours enfant

1. Sélectionner son profil.
2. Arriver sur un accueil illustré avec un personnage-guide.
3. Choisir une activité : Lettres, Sons, Syllabes, Mots ou Jeux.
4. Écouter une consigne courte.
5. Répondre en touchant l'écran ou avec la télécommande.
6. Recevoir un retour positif, qu'il ait réussi ou non.
7. Gagner éventuellement une étoile et retrouver sa progression.

Le parcours doit rester utilisable par un enfant qui ne sait pas encore lire : icônes explicites, images et consignes audio.

## 4. Contenus pédagogiques

### Lettres
- Alphabet A à Z.
- Majuscules et minuscules.
- Exemple illustré et bouton audio.

### Sons
- Écouter le son travaillé.
- Réécouter autant que nécessaire.
- Identifier la lettre ou l'image correspondant au son.

### Syllabes
- Commencer par des combinaisons simples et régulières.
- Exemples initiaux : ma, me, mi, mo, mu.
- Faire entendre les sons puis la syllabe assemblée.

### Premiers mots
- Mots familiers et illustrés.
- Passer progressivement de la syllabe au mot.
- Introduire les phrases courtes seulement après les premières réussites.

Le français comporte des correspondances complexes (plusieurs sons pour une lettre, graphèmes composés, lettres muettes). Ne pas les simplifier à tort : prévoir une progression pédagogique et faire valider les contenus.

## 5. Mini-jeux du MVP

1. **J'écoute et je trouve :** entendre un son et choisir la lettre correspondante.
2. **Je construis une syllabe :** assembler des éléments pour former une syllabe.
3. **Je regarde et je choisis :** associer une image au mot correspondant.

Les jeux doivent être courts, rejouables et sans pénalité.

## 6. Profils et progression

- Jusqu'à quatre profils locaux pour le MVP.
- Progression distincte pour chaque profil.
- Activités terminées et étoiles gagnées.
- Possibilité de refaire une activité.
- Pas de classement public ni de comparaison entre enfants.

## 7. Espace parent

- Créer, modifier et supprimer les profils.
- Régler le volume et les paramètres audio.
- Consulter les activités réalisées.
- Accéder aux réglages depuis un espace séparé de l'expérience enfant.

## 8. Audio et illustrations

- Prévoir des fichiers audio français embarqués pour le MVP.
- Bouton de réécoute sur chaque leçon.
- Voix claire, débit adapté et prononciation validée.
- Utiliser des illustrations originales ou dont les droits d'utilisation sont vérifiés.
- Les audios temporaires doivent être signalés comme placeholders et remplacés avant diffusion.

## 9. Confidentialité et sécurité

- Stockage local prioritaire pour la première version.
- Ne demander aucune donnée personnelle inutile.
- Pas de publicité ciblée, de chat, de liens externes ou d'achat intégré dans l'espace enfant.
- Aucun secret ou clé API dans le dépôt.
- Avant une diffusion publique, faire vérifier les obligations légales et de protection des données applicables aux services destinés aux enfants.

## 10. Critères d'acceptation du MVP

- L'enfant peut suivre les activités principales sans lire les consignes.
- Chaque lettre et chaque exercice audio possède une commande de réécoute.
- Les profils conservent des progressions séparées.
- Les activités essentielles fonctionnent hors connexion si les médias sont embarqués.
- Sur TV, toutes les actions sont réalisables avec la télécommande.
- Le focus TV est toujours identifiable.
- Les parcours mobile et TV sont testés séparément.
- Les tests automatisés disponibles passent.
- Les APK ne sont annoncés comme prêts qu'après compilation et tests réels.

## 11. Hors périmètre initial

- Comptes en ligne et synchronisation multi-appareils.
- Reconnaissance vocale de la prononciation de l'enfant.
- Publicité, paiement et abonnement.
- Outils de classe et tableau de bord enseignant.
