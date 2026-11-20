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
function speak(btn, text, audio, onDone = () => {}) {
  const wasOn = btn.classList.contains('on');
  stopVoice();
  if (wasOn) return;
  btn.classList.add('on');
  const done = () => { btn.classList.remove('on'); onDone(); };
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
// Elle a parlé au micro : les réponses sont lues l'une après l'autre (texte puis choix numérotés).
// Toute nouvelle action (envoi, bouton Écouter, sortie rapide) arrête la lecture.
let queue = 0;
let toRead = [];
function stopAll() { queue++; stopVoice(); }
function playAll(items) {
  const id = ++queue;
  const next = () => {
    const it = items.shift();
    if (it && id === queue) speak(it.btn, it.text, it.audio, next);
  };
  next();
}

function bot(text, audio, speech) {
  const m = el('div', 'msg bot');
  m.append(el('span', null, text));
  if (canSpeak(audio)) {
    const b = el('button', 'speak');
    b.type = 'button';
    b.setAttribute('aria-label', 'Écouter');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z"/></svg>';
    b.onclick = () => { queue++; speak(b, speech || text, audio); };
    m.append(b);
    toRead.push({ btn: b, text: speech || text, audio });
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
    wrap.append(bot(r.text, r.audio, r.speech));
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
    log.append(bot(r.text, r.audio, r.speech));
  }
  if (r.options?.length) {
    const ids = r.options.map((o) => o.id);
    const isMenu = ids.every((id) => id.startsWith('menu:'));
    const isLang = ids.every((id) => id.startsWith('lang:'));
    const box = el('div', isMenu ? 'grid' : isLang ? 'options lang' : 'options');
    // Le numéro du bouton est celui dit dans la lecture (« J'accepte : dites un »).
    for (const [k, o] of r.options.entries()) {
      const b = el('button', o.id === 'alert' ? 'alert-btn' : null, `${k + 1} · ${o.label}`);
      b.type = 'button';
      b.dataset.id = o.id;
      b.onclick = () => send({ action: o.id, label: o.label });
      box.append(b);
    }
    log.append(box);
  }
}

const MIC = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>';

async function send({ text = '', action = null, label = null, silent = false, spoken = false, audio = null }) {
  stopAll();
  let me = null;
  if (!silent) {
    disableOld();
    me = el('div', 'msg me', audio ? 'Message vocal…' : label || text);
    if (spoken || audio) me.insertAdjacentHTML('afterbegin', MIC);
    log.append(me);
    scroll();
  }
  // Indicateur « en train d'écrire » (après 150 ms seulement, pour ne pas clignoter si la réponse est immédiate)
  const typing = el('div', 'typing');
  typing.setAttribute('aria-label', 'Réponse en cours');
  typing.append(el('i'), el('i'), el('i'));
  const tShow = setTimeout(() => { log.append(typing); scroll(); }, 150);
  try {
    // Vocal enregistré : envoyé tel quel au serveur, qui le transcrit puis l'oublie.
    const res = audio
      ? await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm', 'X-User-Id': uid }, body: audio })
      : await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid, text, action, spoken })
        });
    const data = await res.json();
    clearTimeout(tShow); typing.remove();
    if (audio && me) {
      me.textContent = data.heard ? `« ${data.heard} »` : 'Message vocal';
      me.insertAdjacentHTML('afterbegin', MIC);
    }
    if (data.ui?.clear) { store.clear(); uid = crypto.randomUUID(); store.set(KEY, uid); }
    if (data.ui?.neutral) return neutral();
    if (data.lang) lang = data.lang;
    toRead = [];
    data.replies.forEach(renderReply);
    if (data.ui?.speak) playAll(toRead);
  } catch {
    clearTimeout(tShow); typing.remove();
    log.append(el('div', 'msg bot', 'Connexion difficile. Réessayez dans un instant.'));
  }
  scroll();
}

// Sortie rapide : écran neutre + effacement de l'historique local.
function neutral() {
  stopAll();
  toggleWhatsApp(false);
  stopRecording(false); // sortie rapide pendant un enregistrement : rien n'est envoyé
  if (listening) rec.stop();
  log.innerHTML = '';
  store.clear();
  $('chat').hidden = true;
  $('neutral').hidden = false;
  document.title = 'Recettes';
  history.replaceState(null, '', '/');
}

// Panneau « Continuer sur WhatsApp » (QR code + lien direct).
function toggleWhatsApp(open = $('wa').hidden) {
  $('wa').hidden = !open;
  $('btn-wa').setAttribute('aria-expanded', String(open));
}

$('btn-exit').onclick = neutral;
$('btn-wa').onclick = () => toggleWhatsApp();
$('btn-menu').onclick = () => send({ action: 'menu', label: 'Menu' });
// ---------- Micro : on touche, on parle, on touche Envoyer ----------
// 1) Si le serveur sait transcrire : le site enregistre la voix et l'envoie au serveur (marche dans tous les navigateurs).
// 2) Sinon : dictée du navigateur (Chrome et Edge seulement), le texte s'écrit dans la zone au fur et à mesure.
// Retoucher le micro arrête sans rien envoyer.
const MAX_RECORD_MS = 60000;
const MIC_ERRORS = {
  'not-allowed': 'Le micro est bloqué. Autorisez-le : touchez le cadenas à gauche de l’adresse du site, puis « Micro » → Autoriser.',
  'service-not-allowed': 'Le micro est bloqué. Autorisez-le : touchez le cadenas à gauche de l’adresse du site, puis « Micro » → Autoriser.',
  'audio-capture': 'Aucun micro n’a été trouvé sur cet appareil.',
  'no-speech': 'Je n’ai rien entendu. Touchez le micro et parlez un peu plus près.',
  network: 'La dictée a besoin d’internet : le navigateur transforme la voix en texte en ligne.'
};
function micMessage(code) {
  log.append(el('div', 'msg bot', MIC_ERRORS[code] || 'Le micro ne fonctionne pas dans ce navigateur. Écrivez votre question, ou essayez avec Chrome.'));
  scroll();
}
function micOn(placeholder) {
  $('btn-mic').classList.add('listening');
  $('btn-mic').setAttribute('aria-label', 'Arrêter sans envoyer');
  $('input').placeholder = placeholder;
}
function micOff() {
  $('btn-mic').classList.remove('listening');
  $('btn-mic').setAttribute('aria-label', 'Parler');
  $('input').placeholder = 'Écrivez votre question…';
}

let serverVoice = false;
fetch('/health').then((r) => r.json()).then((h) => {
  serverVoice = Boolean(h.voice && window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
}).catch(() => {});

// 1) Enregistrement envoyé au serveur
let recorder = null;
let sendWhenStopped = false;
async function startRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    return micMessage(e.name === 'NotFoundError' ? 'audio-capture' : 'not-allowed');
  }
  const chunks = [];
  const started = Date.now();
  recorder = new MediaRecorder(stream);
  sendWhenStopped = false;
  const tick = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    micOn(`● Enregistrement ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} — touchez Envoyer`);
    if (Date.now() - started > MAX_RECORD_MS) stopRecording(true);
  }, 500);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    clearInterval(tick);
    stream.getTracks().forEach((t) => t.stop());
    micOff();
    const type = recorder.mimeType;
    recorder = null;
    if (sendWhenStopped && chunks.length) send({ audio: new Blob(chunks, { type }) });
  };
  recorder.start();
  micOn('● Enregistrement 0:00 — touchez Envoyer');
}
function stopRecording(andSend) {
  if (recorder?.state !== 'recording') return;
  sendWhenStopped = andSend;
  recorder.stop();
}

// 2) Dictée du navigateur
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let listening = false;
let dictated = false; // le texte de la zone vient du micro : il sera envoyé comme « dit à voix haute »
if (SR) {
  rec = new SR();
  rec.lang = 'fr-FR';
  rec.continuous = true;
  rec.interimResults = true;
  let before = '';
  rec.onstart = () => {
    listening = true;
    before = $('input').value.trim();
    micOn('Je vous écoute… puis touchez Envoyer');
  };
  rec.onresult = (e) => {
    const heard = Array.from(e.results, (r) => r[0].transcript).join(' ').trim();
    $('input').value = [before, heard].filter(Boolean).join(' ');
    dictated = true;
  };
  rec.onerror = (e) => { if (e.error !== 'aborted') micMessage(e.error); };
  rec.onend = () => { listening = false; micOff(); };
}

$('btn-mic').onclick = () => {
  if (recorder) return stopRecording(false);
  if (listening) return rec.stop();
  stopAll();
  if (serverVoice) return startRecording();
  if (!rec) return micMessage('unsupported');
  try {
    rec.start();
  } catch {
    rec.stop();
  }
};

$('composer').onsubmit = (e) => {
  e.preventDefault();
  if (recorder) return stopRecording(true);
  if (listening) rec.stop();
  const v = $('input').value.trim();
  if (!v) return;
  $('input').value = '';
  send({ text: v, spoken: dictated });
  dictated = false;
};
$('input').oninput = () => { if (!$('input').value.trim()) dictated = false; };

// Démarrage : la conversation se charge pendant l'écran d'accueil, qui reste au moins 0,9 s puis s'efface en fondu.
const minSplash = new Promise((r) => setTimeout(r, 900));
$('chat').hidden = false;
Promise.all([send({ text: 'bonjour', silent: true }), minSplash]).finally(() => {
  $('splash').classList.add('out');
  $('splash').setAttribute('aria-busy', 'false');
  setTimeout(() => ($('splash').hidden = true), 400);
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
