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
| Message vocal compris (FR) : on touche le micro, on parle, on envoie | ✔ (transcription serveur, sinon dictée du navigateur) | ✔ (transcription serveur) |
| Choix dit par son numéro (« deux », « le 3 ») et boutons numérotés | ✔ | ✔ (choix dit) |
| Réponse en vocal quand elle a parlé, choix compris | ✔ (voix du téléphone) | ✔ (voix de synthèse provisoire, puis écrit) |
| « Pas compris » guidé, puis proposition d'une personne | ✔ | ✔ |
| Vocal en wolof | à faire | à faire |
| Passer sur WhatsApp : bouton « WhatsApp », QR code et lien direct | ✔ | — |

## Démarrer

```bash
npm install
cp .env.example .env      # puis compléter
node --env-file=.env src/server.js
# → http://localhost:3000
npm test                  # 25 tests
```

Sans identifiants WhatsApp, les messages sortants s'affichent dans la console (mode démo).

## Vocal (français)

Pour les utilisatrices qui ne lisent ou n'écrivent pas : elles parlent, le bot répond. L'écrit ne change pas.

- **Comprendre** : le vocal (micro du site ou note vocale WhatsApp) est transcrit par une API compatible OpenAI (`STT_URL`, `STT_API_KEY`, `STT_MODEL` ; Groq `whisper-large-v3` ou OpenAI `whisper-1`). Le texte passe au moteur comme un message « dit à voix haute » : un numéro dit vaut le bouton correspondant, une question cherche la fiche, le danger et le mot de code restent prioritaires. Sans clé, le site se rabat sur la dictée du navigateur (Chrome et Edge seulement) et WhatsApp répond que les vocaux ne sont pas encore compris.
- **Répondre** : sur le site, si elle a parlé, la réponse est lue automatiquement par la voix du téléphone, avec les choix numérotés (« J'accepte : dites un »). Sur WhatsApp, chaque message part d'abord en vocal puis en écrit ; la voix est pour l'instant une voix de synthèse provisoire (ElevenLabs, `ELEVENLABS_API_KEY`), fabriquée une fois par texte et gardée dans `var/voix/`, en attendant les enregistrements des traducteurs. Seuls les textes du bot sont envoyés au service de voix.
- **Confidentialité** : l'audio reste en mémoire ; ni le son ni le texte transcrit ne sont écrits sur disque ou dans les journaux. Le service de transcription reçoit le son : à mentionner dans la politique de confidentialité.

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
6. Publier l'app Meta (mode Live) avant d'ouvrir le service : en développement, Meta prévient que les messages des utilisatrices peuvent ne pas être transmis. La publication demande une URL de politique de confidentialité.
7. Pour le rappel J+3 : créer un modèle de message neutre avec deux boutons de réponse rapide dont les *payloads* sont `followup:yes` et `followup:no`, puis `WHATSAPP_FOLLOWUP_TEMPLATE=<nom>`.

## Structure

```
src/
  server.js            routes web, webhook WhatsApp, API relais, stats, planificateur
  config.js            variables d'environnement
  speech.js            transcription des messages vocaux (API compatible OpenAI)
  tts.js               voix de synthèse provisoire pour les réponses vocales WhatsApp (ElevenLabs)
  store.js             stockage (JSON en démo → PostgreSQL en V1), hachage, chiffrement
  engine/engine.js     moteur conversationnel unique (machine à états, choix dits par numéro)
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
