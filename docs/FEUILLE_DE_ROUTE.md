# Feuille de route — tâches pour Thioro

Chaque ligne devient une *issue* GitHub. Références F1-F11 = cahier des charges.

## Sprint 1 — Démo de candidature (objectif : 10 novembre 2026)

| # | Tâche | Réf. | Priorité |
|---|---|---|---|
| 1 | Prendre en main le code, lancer en local, lire les tests | — | 🔴 |
| 2 | Créer l'app Meta, numéro de test, brancher le webhook (ngrok puis VPS) | 3.3 | 🔴 |
| 3 | Tester tout le parcours sur un vrai téléphone WhatsApp (FR + WO) | F1-F10 | 🔴 |
| 4 | Déployer la démo web sur le VPS en HTTPS (Docker ou PM2 + Nginx) | 3.2 | 🔴 |
| 5 | Relayer les alertes vers le numéro WhatsApp du relais de test | F7 | 🔴 |
| 6 | Ajuster le design web aux maquettes si besoin, vérifier sur petit Android | 3.2 | 🟠 |
| 7 | QR code + lien `wa.me` pour la démo | 3.3 | 🟠 |
| 8 | Enregistrer la vidéo de démo (1-2 min) web + WhatsApp | — | 🔴 |

## Sprint 2 — Vers la V1 pilote (mois 1 à 3 du financement)

| # | Tâche | Réf. |
|---|---|---|
| 9 | Remplacer le stockage JSON par PostgreSQL (même interface que `store.js`) | 6 |
| 10 | Back-office web : connexion, fiches, annuaire, alertes | 3.4 |
| 11 | Notes vocales WhatsApp : téléchargement du média + transcription | F11 |
| 12 | Réponses audio (synthèse vocale FR/WO) | F11 |
| 13 | Recherche sémantique (embeddings) en plus des mots-clés | F4 |
| 14 | Page publique du tableau de bord (graphiques depuis `/api/stats`) | 3.5 |
| 15 | Modèles de message Meta (rappel J+3) + validation | F6 |
| 16 | Pulaar : textes d'interface + fiches | F2 |
| 17 | Limitation de débit, journaux d'accès, sauvegardes chiffrées | 4 |
| 18 | Dockerfile + documentation de déploiement + guide « ajouter une langue / un pays » | 7 |
| 19 | Préparation de l'audit de sécurité externe | 4 |

## Hors périmètre (financé par la subvention, plus tard)

Serveur vocal (appel), SMS, USSD, téléconsultation.
