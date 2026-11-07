# Jigéen Ngir Jàmm

**La femme pour la paix** — assistant conversationnel open source, gratuit et confidentiel pour la santé, le bien-être et la sécurité des femmes et des filles. Chatbot web + WhatsApp, en français et en wolof (pulaar à venir).

Porté par [Talismeas Technologies](https://talismeas.tech) — candidature UNICEF Femtech Ventures.

> ⚠️ **Version de démonstration.** Les contenus santé (`data/fiches.json`) sont des brouillons à faire valider par une sage-femme ; les traductions wolof sont à relire ; l'annuaire (`data/annuaire.json`) est fictif.

## Ce qui fonctionne

| Fonction | Web | WhatsApp |
|---|---|---|
| Consentement avant toute collecte | ✔ | ✔ |
| Choix de la langue (FR, WO ; pulaar → repli FR) | ✔ | ✔ |
| Menu à 4 parcours | ✔ (cartes) | ✔ (liste) |
| Questions-réponses ancrées sur les fiches validées, sans invention | ✔ | ✔ |
| Reformulation par IA (optionnelle, `ANTHROPIC_API_KEY`) | ✔ | ✔ |
| Orientation par zone + bouton Appeler | ✔ | ✔ |
| Rappel de suivi J+3 + question de satisfaction | ✔ | ✔ (modèle Meta requis hors 24 h) |
| Alerte discrète → relais notifié, numéro chiffré | ✔ | ✔ |
| Détection de détresse / violence dans tous les parcours | ✔ | ✔ |
| Mot de code et sortie rapide → écran neutre | ✔ | ✔ |
| Commande « effacer » | ✔ | ✔ |
| Statistiques publiques agrégées (seuil 10) | `/api/stats` | — |
| API relais (alertes) | `/api/admin/alerts` | — |
| Notes vocales | dictée navigateur (FR) | à faire |

## Démarrer

```bash
npm install
cp .env.example .env      # puis compléter
node --env-file=.env src/server.js
# → http://localhost:3000
npm test                  # 15 tests
```

Sans identifiants WhatsApp, les messages sortants s'affichent dans la console (mode démo).

## Mettre en ligne sur le serveur

Prérequis : un nom de domaine dont l'enregistrement DNS **A** pointe vers l'IP du serveur, un accès SSH par clé, et un utilisateur avec `sudo` (Debian/Ubuntu).

```bash
cp deploy/deploy.env.example deploy/deploy.env   # renseigner utilisateur, serveur, dossier, domaine, e-mail
./deploy/deploy.sh --setup     # 1re fois : Node 22, service systemd, Nginx (ou Apache existant), HTTPS, secrets
./deploy/deploy.sh             # mises à jour suivantes
./deploy/deploy.sh --rollback  # revenir à la version précédente
./deploy/deploy.sh --status    # état et journaux
```

Le script ne touche pas aux autres sites du serveur, garde les 5 dernières versions, et ne remplace jamais `shared/.env` (secrets générés au 1er déploiement) ni `shared/var` (données). Les clés WhatsApp se complètent ensuite dans `REMOTE_DIR/shared/.env`, puis `sudo systemctl restart jigeen-ngir-jamm`.

## Brancher WhatsApp

1. Créer une app sur developers.facebook.com (type *Business*), ajouter le produit **WhatsApp**.
2. Récupérer le **jeton** et le **Phone number ID** → `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.
3. Exposer le serveur en HTTPS (VPS ou `ngrok http 3000` en test).
4. Webhook : URL `https://<domaine>/webhook/whatsapp`, jeton de vérification = `WHATSAPP_VERIFY_TOKEN`, s'abonner au champ **messages**.
5. Renseigner `WHATSAPP_APP_SECRET` pour vérifier la signature des requêtes.
6. Pour le rappel J+3 : créer un modèle de message neutre avec deux boutons de réponse rapide dont les *payloads* sont `followup:yes` et `followup:no`, puis `WHATSAPP_FOLLOWUP_TEMPLATE=<nom>`.

## Structure

```
src/
  server.js            routes web, webhook WhatsApp, API relais, stats, planificateur
  config.js            variables d'environnement
  store.js             stockage (JSON en démo → PostgreSQL en V1), hachage, chiffrement
  engine/engine.js     moteur conversationnel unique (machine à états)
  engine/knowledge.js  recherche dans les fiches, détection de danger, IA optionnelle
  engine/i18n.js       textes FR / WO
  channels/whatsapp.js adaptateur WhatsApp Cloud API
data/                  fiches santé, annuaire, mots-clés de danger
web/                   chatbot web (PWA)
test/                  tests automatisés
docs/                  architecture, feuille de route
```

## Licence

Apache 2.0 — voir [LICENSE](LICENSE).
