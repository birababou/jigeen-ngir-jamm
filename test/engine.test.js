import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jnj-'));
process.env.CODE_WORD = 'mango';
const { handle, setRelayNotifier, _resetPreConsent } = await import('../src/engine/engine.js');
const store = await import('../src/store.js');
const wa = await import('../src/channels/whatsapp.js');

let relayed = [];
setRelayNotifier(async (a, contact) => relayed.push({ a, contact }));

beforeEach(() => {
  store._resetForTests();
  _resetPreConsent();
  relayed = [];
});

const say = (o) => handle({ channel: 'web', userId: 'u1', ...o });
const ids = (r) => r.replies.flatMap((x) => (x.options || []).map((o) => o.id));
async function onboard(lang = 'fr') {
  await say({ text: 'bonjour' });
  await say({ action: 'consent:yes' });
  return say({ action: `lang:${lang}` });
}

test('consentement demandé avant tout, rien enregistré avant accord', async () => {
  const r = await say({ text: 'bonjour' });
  assert.ok(ids(r).includes('consent:yes'));
  assert.equal(store.sessions.get(store.hashUser('web', 'u1')), undefined);
});

test('refus du consentement', async () => {
  await say({ text: 'bonjour' });
  const r = await say({ action: 'consent:no' });
  assert.match(r.replies[0].text, /Rien n'a été enregistré/);
});

test('numéros d’urgence donnés même avant consentement', async () => {
  const r = await say({ text: 'il me frappe tous les jours' });
  assert.match(r.replies[0].text, /17/);
});

test('menu à 4 parcours après choix de langue', async () => {
  const r = await onboard();
  assert.deepEqual(ids(r), ['menu:soins', 'menu:sante', 'menu:bienetre', 'menu:securite']);
});

test('wolof et repli pulaar', async () => {
  let r = await onboard('wo');
  assert.equal(r.replies[0].text, 'Lan nga soxla ?');
  r = await say({ action: 'lang:ff' });
  assert.match(r.replies[0].text, /pulaar/i);
});

test('question santé : réponse depuis une fiche + orientation', async () => {
  await onboard();
  await say({ action: 'menu:sante' });
  const r = await say({ text: 'Mes règles sont en retard. Que faire ?' });
  assert.match(r.replies[0].text, /retard de règles peut avoir plusieurs causes/);
  assert.ok(ids(r).includes('orient'));
});

test('question hors base : pas d’invention, orientation proposée', async () => {
  await onboard();
  const r = await say({ text: 'quel est le meilleur téléphone ?' });
  assert.match(r.replies[0].text, /pas d'information validée/);
});

test('signes de danger pendant la grossesse passent en priorité', async () => {
  await onboard();
  const r = await say({ text: 'je suis enceinte et j ai un saignement' });
  assert.match(r.replies[0].text, /IMMÉDIATEMENT/);
});

test('orientation par district + rappel programmé', async () => {
  await onboard();
  await say({ action: 'menu:soins' });
  let r = await say({ action: 'district:mbour' });
  assert.ok(r.replies[0].card.items.length >= 2);
  r = await say({ action: 'reminder:yes' });
  assert.equal(store.followups.due(Date.now() + 4 * 86400000).length, 1);
});

test('alerte discrète : numéro chiffré, relais notifié, message neutre', async () => {
  await onboard();
  await say({ action: 'menu:securite' });
  await say({ action: 'alert' });
  const r = await say({ text: '77 000 00 00' });
  assert.match(r.replies[0].text, /Alerte envoyée/);
  assert.equal(relayed.length, 1);
  const a = store.alerts.list()[0];
  assert.notEqual(a.contact, '770000000');
  assert.equal(store.decrypt(a.contact), '770000000');
});

test('détection de détresse dans n’importe quel parcours', async () => {
  await onboard();
  await say({ action: 'menu:sante' });
  const r = await say({ text: "je n'ai plus envie de vivre" });
  assert.ok(ids(r).includes('alert') && ids(r).includes('human'));
});

test('mot de code : écran neutre, rien enregistré', async () => {
  await onboard();
  const r = await say({ text: 'Mango' });
  assert.equal(r.ui.neutral, true);
});

test('effacer supprime la session', async () => {
  await onboard();
  await say({ text: 'effacer' });
  assert.equal(store.sessions.get(store.hashUser('web', 'u1')), undefined);
});

test('WhatsApp : boutons (≤3) et liste (>3)', () => {
  const b = wa.toWhatsApp('221', { text: 'x', options: [{ id: 'a', label: 'Oui, orientez-moi tout de suite' }] });
  assert.equal(b.interactive.type, 'button');
  assert.ok(b.interactive.action.buttons[0].reply.title.length <= 20);
  const l = wa.toWhatsApp('221', { text: 'x', options: [1, 2, 3, 4].map((i) => ({ id: `${i}`, label: `${i}` })) });
  assert.equal(l.interactive.type, 'list');
});

test('WhatsApp : lecture du webhook', () => {
  const msgs = wa.parseWebhook({
    entry: [{ changes: [{ value: { messages: [
      { from: '221770000000', id: 'm1', type: 'text', text: { body: 'bonjour' } },
      { from: '221770000000', id: 'm2', type: 'interactive', interactive: { button_reply: { id: 'consent:yes', title: "J'accepte" } } }
    ] } }] }]
  });
  assert.equal(msgs[0].text, 'bonjour');
  assert.equal(msgs[1].action, 'consent:yes');
});

test('purge des sessions inactives (sauf rappel en attente)', async () => {
  await onboard();
  const h = store.hashUser('web', 'u1');
  store.sessions.set(h, { ...store.sessions.get(h) });
  // Simule une session vieille de 90 jours
  store.sessions.get(h).updatedAt = Date.now() - 90 * 86400000;
  assert.equal(store.sessions.purgeInactive(60), 1);
  assert.equal(store.sessions.get(h), undefined);
});
