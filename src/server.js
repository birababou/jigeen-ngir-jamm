// Serveur : chatbot web, webhook WhatsApp, API relais (back-office minimal) et statistiques publiques.
import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import { handle, setRelayNotifier, followupMessage } from './engine/engine.js';
import { alerts, followups, sessions, stats, decrypt, hashUser } from './store.js';
import * as wa from './channels/whatsapp.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback'); // derrière Apache/Nginx : vraie IP via X-Forwarded-For

// Limitation de débit simple (en mémoire) : protège contre les abus et les boucles.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const n = (hits.get(req.ip) || 0) + 1;
    hits.set(req.ip, n);
    if (n > max) return res.status(429).json({ error: 'Trop de messages, réessayez dans une minute.' });
    next();
  };
}
app.use((req, res, next) => {
  res.set({ 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
  next();
});
app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => (req.rawBody = buf) }));

// ---------- Notification du relais (alertes et transferts humains) ----------
setRelayNotifier(async (alert, contact) => {
  const msg = `Nouvelle demande #${alert.id} (${alert.type}) — zone : ${alert.district} — langue : ${alert.lang}\nRappeler : ${contact}\nRépondre en restant neutre (ne pas citer le service si quelqu'un d'autre décroche).`;
  if (config.relay.whatsapp) await wa.sendReplies(config.relay.whatsapp, [{ text: msg }]);
  else console.log('[relais:démo]', msg);
});

// ---------- Chatbot web ----------
app.post('/api/chat', rateLimit({ windowMs: 60000, max: 60 }), async (req, res) => {
  const { userId, text, action } = req.body || {};
  if (!userId || typeof userId !== 'string' || userId.length > 64) return res.status(400).json({ error: 'userId requis' });
  const h = hashUser('web', userId);
  const s = sessions.get(h);
  const pending = s?.pending || [];
  if (pending.length) sessions.set(h, { ...s, pending: [] });
  const result = await handle({ channel: 'web', userId, text: String(text || '').slice(0, 1000), action });
  res.json({ ...result, lang: sessions.get(h)?.lang || 'fr', replies: [...pending, ...result.replies] });
});

// ---------- Webhook WhatsApp ----------
app.get('/webhook/whatsapp', (req, res) => {
  const ok = req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.whatsapp.verifyToken && config.whatsapp.verifyToken;
  return ok ? res.send(req.query['hub.challenge']) : res.sendStatus(403);
});

app.post('/webhook/whatsapp', async (req, res) => {
  if (!wa.verifySignature(req.rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  res.sendStatus(200); // Meta exige une réponse rapide
  for (const m of wa.parseWebhook(req.body)) {
    try {
      await wa.markRead(m.messageId);
      const result = await handle(m);
      await wa.sendReplies(m.userId, result.replies);
    } catch (e) {
      console.error('[whatsapp] traitement', e);
    }
  }
});

// ---------- API relais (protégée par jeton) ----------
const requireAdmin = (req, res, next) => {
  if (!config.adminToken || req.get('authorization') !== `Bearer ${config.adminToken}`) return res.sendStatus(401);
  next();
};
app.get('/api/admin/alerts', requireAdmin, (_req, res) => {
  res.json(alerts.list().map((a) => ({ ...a, contact: a.contact ? decrypt(a.contact) : null })));
});
app.post('/api/admin/alerts/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!['nouveau', 'pris_en_charge', 'clos'].includes(status)) return res.status(400).json({ error: 'statut invalide' });
  const a = alerts.setStatus(req.params.id, status);
  return a ? res.json({ ok: true }) : res.sendStatus(404);
});

// ---------- Statistiques publiques, agrégées, avec seuil ----------
app.get('/api/stats', (_req, res) => {
  const { counters, users } = stats.raw();
  const mask = (v) => (v < config.statsThreshold ? `<${config.statsThreshold}` : v);
  const byMonth = {};
  for (const [k, v] of Object.entries(counters)) {
    const [month, district, lang, event] = k.split('|');
    const m = (byMonth[month] ||= { utilisatrices_uniques: 0, evenements: {}, par_langue: {}, par_district: {} });
    m.evenements[event] = (m.evenements[event] || 0) + v;
    m.par_langue[lang] = (m.par_langue[lang] || 0) + v;
    m.par_district[district] = (m.par_district[district] || 0) + v;
  }
  for (const [month, u] of Object.entries(users)) (byMonth[month] ||= { evenements: {}, par_langue: {}, par_district: {} }).utilisatrices_uniques = Object.keys(u).length;
  for (const m of Object.values(byMonth)) {
    m.utilisatrices_uniques = mask(m.utilisatrices_uniques);
    for (const g of ['evenements', 'par_langue', 'par_district']) for (const k of Object.keys(m[g])) m[g][k] = mask(m[g][k]);
  }
  res.json({ seuil_de_publication: config.statsThreshold, mois: byMonth });
});

app.get('/health', (_req, res) => res.json({ ok: true, whatsapp: wa.whatsappEnabled(), llm: Boolean(config.llm.apiKey) }));

// Fichiers statiques : images en cache 7 jours ; HTML/JS/CSS revalidés (le service worker gère le hors-ligne).
app.use(
  express.static(path.join(config.root, 'web'), {
    extensions: ['html'],
    setHeaders(res, file) {
      if (/\.(png|ico|svg)$/.test(file)) res.set('Cache-Control', 'public, max-age=604800');
      else res.set('Cache-Control', 'no-cache');
    }
  })
);

// ---------- Planificateur : rappels J+3 et purge des alertes closes ----------
async function tick() {
  for (const f of followups.due()) {
    followups.remove(f.id);
    const msg = followupMessage(f.lang);
    if (f.channel === 'whatsapp') {
      const to = decrypt(f.to);
      // Hors fenêtre de 24 h, WhatsApp impose un modèle approuvé.
      if (config.whatsapp.followupTemplate) await wa.sendTemplate(to, config.whatsapp.followupTemplate, f.lang);
      else await wa.sendReplies(to, [msg]);
    } else {
      const s = sessions.get(f.userHash);
      if (s) sessions.set(f.userHash, { ...s, pending: [...(s.pending || []), msg] });
    }
  }
  alerts.purgeClosed(config.alertRetentionDays);
  sessions.purgeInactive(config.sessionRetentionDays);
}
setInterval(() => tick().catch((e) => console.error('[planificateur]', e)), 30000);

if (process.env.NODE_ENV !== 'test')
  app.listen(config.port, () => console.log(`Jigéen Ngir Jàmm — http://localhost:${config.port} (WhatsApp ${wa.whatsappEnabled() ? 'actif' : 'en mode démo'})`));

export default app;
