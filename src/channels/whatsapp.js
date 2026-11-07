// Adaptateur WhatsApp Business Cloud API (Meta).
// Sans identifiants configurés, les messages sont affichés dans la console (mode démo hors ligne).
import crypto from 'node:crypto';
import { config } from '../config.js';

const wa = config.whatsapp;
export const whatsappEnabled = () => Boolean(wa.token && wa.phoneNumberId);

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// Vérifie la signature X-Hub-Signature-256 (si WHATSAPP_APP_SECRET est défini).
export function verifySignature(rawBody, header) {
  if (!wa.appSecret) return true;
  if (!header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', wa.appSecret).update(rawBody).digest('hex');
  return header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

// Transforme le webhook Meta en messages entrants normalisés pour le moteur.
export function parseWebhook(body) {
  const out = [];
  for (const entry of body?.entry || [])
    for (const change of entry.changes || [])
      for (const m of change.value?.messages || []) {
        const base = { channel: 'whatsapp', userId: m.from, messageId: m.id };
        if (m.type === 'text') out.push({ ...base, text: m.text.body });
        else if (m.type === 'interactive') {
          const r = m.interactive.button_reply || m.interactive.list_reply;
          out.push({ ...base, action: r.id, text: r.title });
        } else if (m.type === 'button') out.push({ ...base, action: m.button.payload, text: m.button.text });
        else if (m.type === 'audio') out.push({ ...base, voice: true, mediaId: m.audio.id });
        else out.push({ ...base, text: '' });
      }
  return out;
}

// Convertit une réponse du moteur en payload WhatsApp.
export function toWhatsApp(to, reply) {
  let body = reply.text || '';
  if (reply.card) {
    const lines = reply.card.items.map((i) => `• *${i.name}*\n  📞 ${i.phone}\n  🕑 ${i.hours}`).join('\n\n');
    body = `*${reply.card.title}*\n\n${lines}${reply.text && reply.text !== reply.card.title ? `\n\n${reply.text.replace(reply.card.title, '').trim()}` : ''}`;
  }
  body = clip(body, 1024);
  const options = reply.options || [];
  if (!options.length) return { messaging_product: 'whatsapp', to, type: 'text', text: { body: clip(body, 4096) } };
  if (options.length <= 3)
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: { type: 'button', body: { text: body }, action: { buttons: options.map((o) => ({ type: 'reply', reply: { id: o.id, title: clip(o.label, 20) } })) } }
    };
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body },
      action: { button: 'Choisir · Tànn', sections: [{ title: 'Options', rows: options.slice(0, 10).map((o) => ({ id: o.id, title: clip(o.label, 24) })) }] }
    }
  };
}

async function post(payload) {
  if (!whatsappEnabled()) {
    console.log('[whatsapp:démo]', JSON.stringify(payload));
    return;
  }
  const res = await fetch(`https://graph.facebook.com/${wa.graphVersion}/${wa.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${wa.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) console.error('[whatsapp] erreur', res.status, await res.text());
}

export async function sendReplies(to, replies) {
  for (const r of replies) await post(toWhatsApp(to, r));
}

// Message hors fenêtre de 24 h : nécessite un modèle approuvé par Meta (texte neutre).
export async function sendTemplate(to, name, lang = 'fr') {
  await post({ messaging_product: 'whatsapp', to, type: 'template', template: { name, language: { code: lang === 'wo' ? 'fr' : lang } } });
}

export async function markRead(messageId) {
  if (whatsappEnabled() && messageId) await post({ messaging_product: 'whatsapp', status: 'read', message_id: messageId });
}
