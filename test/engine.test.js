import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jnj-'));
process.env.CODE_WORD = 'mango';
process.env.STT_API_KEY = 'cle-de-test';
const { handle, setRelayNotifier, _resetPreConsent } = await import('../src/engine/engine.js');
const store = await import('../src/store.js');
const wa = await import('../src/channels/whatsapp.js');
const speech = await import('../src/speech.js');

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

test('journaux du mode démo : aucun numéro en clair', async () => {
  assert.equal(store.maskPhones('Rappeler : 221770000000 ou +221770000000'), 'Rappeler : [numéro masqué] ou [numéro masqué]');
  assert.equal(store.maskPhones('📞 33 951 00 00'), '📞 33 951 00 00');
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    await wa.sendReplies('221770000000', [{ text: 'Nouvelle demande\nRappeler : 221770000000' }]);
  } finally {
    console.log = orig;
  }
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /221770000000/);
  assert.match(logs[0], new RegExp(store.hashUser('whatsapp', '221770000000')));
});

// ---------- Vocal sur le site (dictée du micro) ----------
const speakIt = (text) => say({ text, spoken: true });

test('vocal : un numéro dit vaut le bouton correspondant, tout le parcours', async () => {
  let r = await speakIt('bonjour');
  assert.equal(r.ui.speak, true);
  r = await speakIt('un'); // J'accepte
  assert.ok(ids(r).includes('lang:fr'));
  r = await speakIt('le trois'); // Français
  assert.deepEqual(ids(r), ['menu:soins', 'menu:sante', 'menu:bienetre', 'menu:securite']);
  r = await speakIt('Deux.'); // Ma santé de femme
  assert.match(r.replies[0].text, /Posez votre question/);
  r = await speakIt('Mes règles sont en retard, que faire ?');
  assert.match(r.replies[0].text, /retard de règles peut avoir plusieurs causes/);
  r = await speakIt('numéro 1'); // Oui, orientez-moi
  assert.ok(ids(r).includes('district:mbour'));
});

test('vocal : texte lu avec les choix numérotés, sans la mention de démonstration', async () => {
  const r = await say({ text: 'bonjour' });
  const consent = r.replies.at(-1);
  assert.match(consent.speech, /J'accepte : dites un\.\nNon merci : dites deux\.$/);
  await say({ action: 'consent:yes' });
  await say({ action: 'lang:fr' });
  await say({ action: 'menu:sante' });
  const fiche = await say({ text: 'Mes règles sont en retard' });
  assert.doesNotMatch(fiche.replies[0].speech, /Contenu de démonstration/);
});

test('vocal : pas compris une fois, on la guide ; deux fois, on propose une personne', async () => {
  await onboard();
  let r = await speakIt('euh je sais pas');
  assert.match(r.replies[0].text, /Dites seulement un numéro/);
  assert.equal(ids(r).length, 4); // le menu est reproposé
  r = await speakIt('hmm');
  assert.deepEqual(ids(r), ['human', 'menu']);
  r = await speakIt('un');
  assert.match(r.replies[0].text, /Sur quel numéro/);
});

test('vocal : une question, un danger ou une commande ne sont jamais « pas compris »', async () => {
  await onboard();
  assert.match((await speakIt('mes règles sont en retard')).replies[0].text, /retard de règles/);
  await say({ action: 'menu' });
  assert.match((await speakIt('il me frappe tous les jours')).replies[0].text, /17/);
  await say({ action: 'menu' });
  assert.ok(ids(await speakIt('menu')).includes('menu:sante'));
  assert.equal((await speakIt('mango')).ui.neutral, true);
});

test('vocal : sécurité dite à voix haute → conseil des écouteurs en premier', async () => {
  await onboard();
  const r = await speakIt('quatre');
  assert.match(r.replies[0].text, /écouteurs/);
  const written = await say({ action: 'menu:securite' });
  assert.doesNotMatch(written.replies[0].text, /écouteurs/);
});

test('écrit inchangé : pas de lecture automatique, « un » écrit reste une question', async () => {
  const r = await onboard();
  assert.equal(r.ui?.speak, undefined);
  const typed = await say({ text: 'un' });
  assert.doesNotMatch(typed.replies[0].text, /Dites seulement un numéro/);
  assert.ok(!ids(typed).includes('district:mbour'));
});

test('vocal enregistré : le son part au service de transcription en français, texte nettoyé', async () => {
  const orig = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, opts) => {
    sent = opts;
    return new Response(JSON.stringify({ text: '  Deux.  ' }), { status: 200 });
  };
  try {
    assert.equal(await speech.transcribe({ data: Buffer.from('son'), mime: 'audio/webm;codecs=opus' }), 'Deux.');
  } finally {
    globalThis.fetch = orig;
  }
  assert.equal(sent.headers.Authorization, 'Bearer cle-de-test');
  assert.equal(sent.body.get('language'), 'fr');
  assert.equal(sent.body.get('file').name, 'vocal.webm');
});

test('WhatsApp : sans identifiants Meta, un vocal n’est pas téléchargé', async () => {
  assert.equal(wa.voiceEnabled(), false);
  assert.equal(await wa.voiceToText('media-123'), '');
});
