# Architecture

```
 Chatbot web (PWA) ──► POST /api/chat ──┐
                                        ├──► engine.handle() ──► knowledge (fiches, annuaire, danger)
 WhatsApp (Meta) ──► /webhook/whatsapp ─┘          │                    └─► IA optionnelle (ancrée sur les fiches)
                                                   ├──► store (sessions, alertes, rappels, stats)
                                                   └──► notifyRelay() ──► WhatsApp du relais
```

**Principe** : un seul moteur. Il renvoie des réponses génériques (`text`, `options`, `card`) ; chaque canal les traduit (boutons web, boutons/listes WhatsApp). Ajouter un canal (SMS, USSD, vocal) = écrire un adaptateur, sans toucher au moteur.

## Données

| Donnée | Où | Protection |
|---|---|---|
| Identifiant utilisatrice | session | HMAC (pseudonyme), jamais le numéro en clair |
| Session (langue, zone, étape) | store | après consentement uniquement |
| Numéro de rappel (alerte, suivi) | store | chiffré AES-256-GCM |
| Alertes | store | supprimées N jours après clôture |
| Statistiques | compteurs agrégés | aucun identifiant, seuil de publication |

## Passage à PostgreSQL (V1)

Garder les objets exportés par `store.js` (`sessions`, `alerts`, `followups`, `stats`) avec les mêmes méthodes, en version `async`, et ajouter `await` dans le moteur. Les tests restent valables.
