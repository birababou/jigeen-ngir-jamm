# Travailler ensemble — Talismeas × Thioro

## Rôles

| Qui | Rôle |
|---|---|
| **Birahim** (Talismeas) | Product owner : priorités, validation des démos, contenus, partenaires, comptes (Meta, VPS, domaine) |
| **Thioro** | Développement : web, WhatsApp, back-office, déploiement |
| **Claude** (assistant IA de Birahim) | Base de code initiale, revue des pull requests, tests, documentation, à la demande de Birahim |
| **Sage-femme / relectrice wolof** | Validation des fiches et des traductions |

## Outils

- **GitHub** : dépôt `talismeas/jigeen-ngir-jamm` (privé jusqu'à la publication open source). Thioro est ajoutée en *collaboratrice* avec droits d'écriture.
- **Tableau GitHub Projects** : colonnes *À faire / En cours / En revue / Fait*. Une tâche = une *issue* (voir `docs/FEUILLE_DE_ROUTE.md`).
- **WhatsApp** : groupe court pour les questions rapides ; les décisions sont reportées dans l'issue concernée.
- **Point hebdomadaire** de 30 min (démo de ce qui marche + priorités de la semaine). Jusqu'au dépôt : point court tous les 2 jours.

## Règles de code

1. La branche `main` est protégée : on ne pousse jamais directement dessus.
2. Une branche par tâche : `feat/whatsapp-vocal`, `fix/menu-wolof`…
3. Pull request avec une courte description + capture d'écran si l'interface change. `npm test` doit passer.
4. Revue par Birahim (ou Claude à sa demande), puis fusion.
5. **Aucun secret dans le dépôt** : les clés vont dans `.env` (jamais commité). Les secrets se partagent en direct, pas sur le groupe WhatsApp.
6. **Aucune donnée réelle** dans le dépôt : uniquement des données d'exemple.
7. Toute modification d'un contenu santé passe par la validation de la sage-femme (`statut: "valide"`).

## Environnements

| Environnement | Usage | Qui déploie |
|---|---|---|
| Local | développement | Thioro |
| Démo (`demo.<domaine>`) | candidature, tests avec l'équipe | Thioro, après accord de Birahim |
| Pilote | utilisatrices réelles (après audit) | Thioro + Birahim |

## Comptes à créer par Talismeas (et partager avec Thioro)

- Compte Meta Business au nom de Talismeas → Thioro ajoutée comme *développeuse* de l'app.
- Accès SSH au VPS de démo.
- Clé d'API IA (optionnelle) avec plafond de dépense.
