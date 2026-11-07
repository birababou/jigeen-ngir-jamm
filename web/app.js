// Client du chatbot web. Toute la logique est côté serveur (même moteur que WhatsApp).
const $ = (id) => document.getElementById(id);
const log = $('log');
const KEY = 'jnj_uid';
const LABELS = { poste_sante: 'Structure la plus proche', relais: 'Relais communautaire', violences: 'Écoute et prise en charge' };

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  clear() { try { localStorage.clear(); sessionStorage.clear(); } catch {} }
};

let uid = store.get(KEY);
let lang = 'fr';

// ---------- Lecture à voix haute ----------
// 1) Audio enregistré par une voix humaine (fiches validées, idéal pour le wolof et le pulaar)
// 2) Sinon, synthèse vocale du téléphone (français uniquement : les navigateurs n'ont pas de voix wolof)
const tts = 'speechSynthesis' in window ? window.speechSynthesis : null;
let player = null;
function stopVoice() {
  if (tts) tts.cancel();
  if (player) { player.pause(); player = null; }
  document.querySelectorAll('.speak.on').forEach((b) => b.classList.remove('on'));
}
// Choix d'une voix féminine française parmi celles du téléphone (les noms varient selon Android, iOS, Windows).
const FEMALE = /(audrey|am[ée]lie|marie|aur[ée]lie|virginie|julie|denise|hortense|c[ée]line|sylvie|l[ée]a|eloise|[ée]lo[ïi]se|brigitte|vivienne|jos[ée]phine|charlotte|chantal|google fran[cç]ais|female|femme|fr-fr-x-(frc|vlf|fra))/i;
const MALE = /(thomas|paul|henri|daniel|nicolas|claude|jacques|antoine|r[ée]my|yves|\bmale\b|homme|fr-fr-x-(frd|frb))/i;
let voiceCache = null;
function frenchFemaleVoice() {
  if (voiceCache) return voiceCache;
  const fr = tts.getVoices().filter((x) => (x.lang || '').toLowerCase().replace('_', '-').startsWith('fr'));
  const score = (x) => (FEMALE.test(x.name) ? 4 : 0) - (MALE.test(x.name) ? 4 : 0) + (/fr-fr/i.test(x.lang.replace('_', '-')) ? 2 : 0) + (x.localService ? 1 : 0);
  voiceCache = fr.sort((a, b) => score(b) - score(a))[0] || null;
  return voiceCache;
}
if (tts) tts.onvoiceschanged = () => { voiceCache = null; };

function canSpeak(audio) {
  return Boolean(audio) || (tts && lang === 'fr');
}
function speak(btn, text, audio) {
  const wasOn = btn.classList.contains('on');
  stopVoice();
  if (wasOn) return;
  btn.classList.add('on');
  const done = () => btn.classList.remove('on');
  if (audio) {
    player = new Audio(audio);
    player.onended = done;
    player.play().catch(done);
    return;
  }
  const u = new SpeechSynthesisUtterance(text.replace(/\(Contenu de démonstration[^)]*\)/, ''));
  u.lang = 'fr-FR';
  u.rate = 0.95;
  const v = frenchFemaleVoice();
  if (v) u.voice = v;
  u.onend = done;
  u.onerror = done;
  tts.speak(u);
}
function bot(text, audio) {
  const m = el('div', 'msg bot');
  m.append(el('span', null, text));
  if (canSpeak(audio)) {
    const b = el('button', 'speak');
    b.type = 'button';
    b.setAttribute('aria-label', 'Écouter');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z"/></svg>';
    b.onclick = () => speak(b, text, audio);
    m.append(b);
  }
  return m;
}
if (!uid) { uid = crypto.randomUUID(); store.set(KEY, uid); }

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function scroll() { log.scrollTop = log.scrollHeight; }

function disableOld() {
  log.querySelectorAll('.options button, .grid button').forEach((b) => (b.disabled = true));
}

function renderReply(r) {
  if (r.card) {
    const wrap = el('div', 'card');
    wrap.append(bot(r.text, r.audio));
    for (const i of r.card.items) {
      const p = el('div', 'place');
      p.append(el('div', 'kind', LABELS[i.label] || i.label), el('div', 'name', i.name), el('div', 'hours', i.hours));
      const a = el('a', null, 'Appeler');
      a.href = `tel:${i.phone.replace(/\s/g, '')}`;
      p.append(a);
      wrap.append(p);
    }
    log.append(wrap);
  } else if (r.text) {
    log.append(bot(r.text, r.audio));
  }
  if (r.options?.length) {
    const ids = r.options.map((o) => o.id);
    const isMenu = ids.every((id) => id.startsWith('menu:'));
    const isLang = ids.every((id) => id.startsWith('lang:'));
    const box = el('div', isMenu ? 'grid' : isLang ? 'options lang' : 'options');
    for (const o of r.options) {
      const b = el('button', o.id === 'alert' ? 'alert-btn' : null, o.label);
      b.type = 'button';
      b.dataset.id = o.id;
      b.onclick = () => send({ action: o.id, label: o.label });
      box.append(b);
    }
    log.append(box);
  }
}

async function send({ text = '', action = null, label = null, silent = false }) {
  if (!silent) {
    disableOld();
    log.append(el('div', 'msg me', label || text));
    scroll();
  }
  // Indicateur « en train d'écrire » (après 150 ms seulement, pour ne pas clignoter si la réponse est immédiate)
  const typing = el('div', 'typing');
  typing.setAttribute('aria-label', 'Réponse en cours');
  typing.append(el('i'), el('i'), el('i'));
  const tShow = setTimeout(() => { log.append(typing); scroll(); }, 150);
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid, text, action })
    });
    const data = await res.json();
    clearTimeout(tShow); typing.remove();
    if (data.ui?.clear) { store.clear(); uid = crypto.randomUUID(); store.set(KEY, uid); }
    if (data.ui?.neutral) return neutral();
    if (data.lang) lang = data.lang;
    data.replies.forEach(renderReply);
  } catch {
    clearTimeout(tShow); typing.remove();
    log.append(el('div', 'msg bot', 'Connexion difficile. Réessayez dans un instant.'));
  }
  scroll();
}

// Sortie rapide : écran neutre + effacement de l'historique local.
function neutral() {
  stopVoice();
  log.innerHTML = '';
  store.clear();
  $('chat').hidden = true;
  $('neutral').hidden = false;
  document.title = 'Recettes';
  history.replaceState(null, '', '/');
}

$('btn-exit').onclick = neutral;
$('btn-menu').onclick = () => send({ action: 'menu', label: 'Menu' });
$('composer').onsubmit = (e) => {
  e.preventDefault();
  const v = $('input').value.trim();
  if (!v) return;
  $('input').value = '';
  send({ text: v });
};

// Dictée vocale du navigateur (français ; le wolof n'est pas encore reconnu par les navigateurs).
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const rec = new SR();
  rec.lang = 'fr-FR';
  rec.interimResults = false;
  rec.onresult = (e) => send({ text: e.results[0][0].transcript });
  rec.onend = () => $('btn-mic').classList.remove('listening');
  $('btn-mic').onclick = () => { $('btn-mic').classList.add('listening'); rec.start(); };
} else {
  $('btn-mic').onclick = () => $('input').focus();
}

// Démarrage : la conversation se charge pendant l'écran d'accueil, qui reste au moins 0,9 s puis s'efface en fondu.
const minSplash = new Promise((r) => setTimeout(r, 900));
$('chat').hidden = false;
Promise.all([send({ text: 'bonjour', silent: true }), minSplash]).finally(() => {
  $('splash').classList.add('out');
  $('splash').setAttribute('aria-busy', 'false');
  setTimeout(() => ($('splash').hidden = true), 400);
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
