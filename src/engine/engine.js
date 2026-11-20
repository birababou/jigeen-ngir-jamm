// Moteur conversationnel unique, partagé par le chatbot web et WhatsApp.
// Entrée : { channel, userId, text?, action?, voice?, spoken? } (spoken : texte dicté au micro)
// Sortie : { replies: [{ text, speech, options?: [{id,label}], card?: {title, items} }], ui?: { neutral?, clear?, speak? } }
// Les canaux ne font que traduire ces réponses dans leur format (boutons web, boutons/listes WhatsApp).
import { t, LANG_LABELS, NUMBERS } from './i18n.js';
import { norm, answer, search, detectDanger, structuresFor, annuaire, fiches, audioFor } from './knowledge.js';
import { sessions, alerts, followups, stats, hashUser, encrypt } from '../store.js';
import { config } from '../config.js';

const preConsent = new Map(); // avant consentement : rien n'est écrit sur disque
let notifyRelay = async () => {};
export function setRelayNotifier(fn) {
  notifyRelay = fn;
}

const COMMANDS = {
  erase: ['effacer', 'far', 'supprimer'],
  menu: ['menu', 'accueil', 'retour'],
  lang: ['langue', 'lakk', 'language'],
  human: ['aide', 'ndimbal', 'humain', 'parler a quelqu un'],
  help: ['?', 'commandes'],
  hello: ['bonjour', 'salut', 'salaam', 'salam', 'asalaa maalekum', 'hello', 'start']
};
const isCmd = (n, k) => COMMANDS[k].includes(n);
const isAnyCmd = (n) => Object.keys(COMMANDS).some((k) => isCmd(n, k));

// Choix dit à voix haute : « deux », « le 2 », « numéro trois », « la deuxième »… → index du choix, ou -1.
// Dans une longue phrase, un « un » isolé n'est pas un choix (« j'ai un problème »).
const CHOICE_WORDS = [
  // « hein » et « de » : ce que la dictée du téléphone entend souvent pour « un » et « deux » dits seuls.
  ['1', 'un', 'une', 'premier', 'premiere', 'hein'],
  ['2', 'deux', 'deuxieme', 'second', 'seconde', 'de'],
  ['3', 'trois', 'troisieme'],
  ['4', 'quatre', 'quatrieme'],
  ['5', 'cinq', 'cinquieme'],
  ['6', 'six', 'sixieme'],
  ['7', 'sept', 'septieme'],
  ['8', 'huit', 'huitieme'],
  ['9', 'neuf', 'neuvieme'],
  ['10', 'dix', 'dixieme']
];
function spokenChoice(n) {
  const words = n.split(' ').filter(Boolean);
  const after = n.match(/\b(?:numero|choix|dites|le|la)\s+(\S+)/);
  const candidates = after ? [after[1]] : words.length <= 2 ? words : [words[0]];
  for (const w of candidates) {
    const i = CHOICE_WORDS.findIndex((ws) => ws.includes(w));
    if (i >= 0) return i;
  }
  return -1;
}

// Texte lu à voix haute : le message, les lieux proposés, puis « J'accepte : dites un. »
export function spokenText(reply, lang) {
  const nums = NUMBERS[lang] || NUMBERS.fr;
  const parts = [reply.text.replace(/\n*\([^)]*\)\s*$/, '')];
  for (const i of reply.card?.items || []) parts.push(`${i.name.replace(/\s*\(exemple\)/, '')}.`);
  (reply.options || []).forEach((o, k) => parts.push(t(lang, 'say_choice').replace('{label}', o.label).replace('{n}', nums[k] || k + 1)));
  return parts.join('\n');
}

// Le moteur garde les derniers choix proposés (pour comprendre « deux » dit au micro)
// et ajoute à chaque réponse le texte à lire. ui.speak : elle a parlé, le site lit la réponse tout seul.
export async function handle(input) {
  const r = await turn(input);
  const h = hashUser(input.channel, input.userId);
  const s = sessions.get(h) || preConsent.get(h);
  if (s && !r.ui?.neutral && !r.ui?.clear) {
    const last = [...r.replies].reverse().find((x) => x.options?.length);
    s.lastOptions = last ? last.options : [];
    if (s.consent) sessions.set(h, s);
    else preConsent.set(h, s);
  }
  const lang = s?.lang || 'fr';
  const replies = r.replies.map((x) => (x.text ? { ...x, speech: spokenText(x, lang) } : x));
  return { ...r, replies, ...(input.spoken && !r.ui?.neutral && { ui: { ...r.ui, speak: true } }) };
}

const opt = (lang, id, key) => ({ id, label: t(lang, key) });

const menu = (lang) => ({
  text: t(lang, 'menu_title'),
  options: [opt(lang, 'menu:soins', 'p_soins'), opt(lang, 'menu:sante', 'p_sante'), opt(lang, 'menu:bienetre', 'p_bienetre'), opt(lang, 'menu:securite', 'p_securite')]
});
const langChoice = (lang) => ({
  text: t(lang, 'choose_lang'),
  options: [{ id: 'lang:wo', label: LANG_LABELS.wo }, { id: 'lang:ff', label: LANG_LABELS.ff }, { id: 'lang:fr', label: LANG_LABELS.fr }]
});
const askDistrict = (lang) => ({
  text: t(lang, 'ask_district'),
  options: annuaire.districts.map((d) => ({ id: `district:${d.id}`, label: d.nom }))
});
const card = (lang, list) => ({
  text: t(lang, 'near_you'),
  card: { title: t(lang, 'near_you'), items: list.map((s) => ({ label: s.type, name: s.nom, phone: s.telephone, hours: s.horaires })) }
});
const ficheReply = (lang, id) => {
  const f = fiches.find((x) => x.id === id);
  const draft = f.statut !== 'valide' ? `\n\n${t(lang, 'draft_notice')}` : '';
  return (f.texte[lang] || f.texte.fr) + draft;
};

async function turn({ channel, userId, text = '', action = null, voice = false, spoken = false }) {
  const h = hashUser(channel, userId);
  let s = sessions.get(h) || preConsent.get(h) || { state: 'new', lang: 'fr', channel };
  const lang = () => s.lang;
  const out = [];
  const ui = {};
  const n = norm(text);
  const ctx = () => ({ district: s.district, lang: s.lang, userHash: h });
  const persist = () => (s.consent ? (preConsent.delete(h), sessions.set(h, s)) : preConsent.set(h, s));

  // 1. Mot de code : écran neutre immédiat, rien n'est enregistré.
  if (n && n === config.codeWord) return { replies: [{ text: t(lang(), 'neutral') }], ui: { neutral: true, clear: true } };

  if (voice) return { replies: [{ text: t(lang(), 'voice_unsupported') }] };

  // Texte dicté au micro : un numéro dit vaut le bouton correspondant. Sinon, s'il ne s'agit ni d'une question,
  // ni d'un danger, ni d'une commande, on la guide : « dites un numéro », puis on propose une personne.
  if (action) s.misses = 0;
  else if (spoken && n) {
    const choices = s.lastOptions || [];
    const k = spokenChoice(n);
    if (k >= 0 && k < choices.length) {
      action = choices[k].id;
      s.misses = 0;
    } else if (choices.length && !['sante', 'callback'].includes(s.state) && !detectDanger(text) && !isAnyCmd(n) && !search(text).length) {
      s.misses = (s.misses || 0) + 1;
      persist();
      if (s.misses === 1) return { replies: [{ text: t(lang(), 'not_understood'), options: choices }] };
      return { replies: [{ text: t(lang(), 'not_understood_again'), options: [opt(lang(), 'human', 'talk_human'), opt(lang(), 'menu', 'back_menu')] }] };
    }
  }

  // 2. Consentement préalable. Les numéros d'urgence restent donnés même sans consentement.
  if (!s.consent) {
    if (action === 'consent:yes') {
      s.consent = true;
      s.state = 'lang';
      persist();
      stats.track('consentement', ctx());
      return { replies: [langChoice(lang())] };
    }
    if (action === 'consent:no') {
      preConsent.delete(h);
      return { replies: [{ text: t(lang(), 'consent_refused') }] };
    }
    if (detectDanger(text)) out.push({ text: t(lang(), 'danger_detected') });
    persist();
    out.push({ text: t(lang(), 'welcome') }, { text: t(lang(), 'consent_ask'), options: [opt(lang(), 'consent:yes', 'consent_yes'), opt(lang(), 'consent:no', 'consent_no')] });
    return { replies: out };
  }

  // 3. Commandes globales tapées en texte.
  if (!action && n) {
    if (isCmd(n, 'erase')) {
      sessions.erase(h);
      return { replies: [{ text: t(lang(), 'erased') }], ui: { clear: true } };
    }
    if (isCmd(n, 'menu') || isCmd(n, 'hello')) action = 'menu';
    else if (isCmd(n, 'lang')) action = 'lang';
    else if (isCmd(n, 'human')) action = 'human';
    else if (isCmd(n, 'help')) return { replies: [{ text: t(lang(), 'help') }] };
  }

  // 4. Actions (boutons web ou WhatsApp, ou commandes ci-dessus).
  if (action) {
    const [a, arg] = action.split(':');
    switch (a) {
      case 'menu':
        if (!arg) {
          s.state = 'menu';
          out.push(menu(lang()));
          break;
        }
        stats.track(`parcours_${arg}`, ctx());
        if (arg === 'soins') {
          s.state = 'soins';
          out.push(s.district ? orientation(s) : askDistrict(lang()));
        } else if (arg === 'sante') {
          s.state = 'sante';
          out.push({ text: t(lang(), 'sante_intro') });
        } else if (arg === 'bienetre') {
          s.state = 'bienetre';
          out.push({ text: t(lang(), 'bienetre_intro'), options: [opt(lang(), 'bien:exercise', 'exercise'), opt(lang(), 'human', 'talk_human')] });
        } else if (arg === 'securite') {
          s.state = 'securite';
          // Elle a parlé : la réponse sera lue à voix haute, d'abord le conseil des écouteurs.
          if (spoken) out.push({ text: t(lang(), 'earphones_hint') });
          out.push(securiteMenu(lang()), { text: t(lang(), 'code_word_hint') });
        }
        break;
      case 'lang':
        if (!arg) {
          out.push(langChoice(lang()));
          break;
        }
        if (arg === 'ff') {
          s.lang = 'fr';
          out.push({ text: t('fr', 'pulaar_soon') });
        } else s.lang = arg;
        stats.track('langue_choisie', ctx());
        s.state = 'menu';
        out.push(menu(lang()));
        break;
      case 'district':
        s.district = arg;
        if (s.state === 'securite:where') out.push(securiteWhere(s));
        else out.push(orientation(s));
        break;
      case 'orient':
        s.state = 'soins';
        stats.track('orientation_demandee', ctx());
        out.push(s.district ? orientation(s) : askDistrict(lang()));
        break;
      case 'reminder':
        if (arg === 'yes') {
          followups.add({ userHash: h, channel, to: encrypt(userId), lang: s.lang, dueAt: Date.now() + config.followupDelayMinutes * 60000 });
          stats.track('rappel_programme', ctx());
          out.push({ text: t(lang(), 'reminder_set') });
        }
        out.push(menu(lang()));
        break;
      case 'followup':
        stats.track(arg === 'yes' ? 'suivi_consultation_oui' : 'suivi_consultation_non', ctx());
        if (arg === 'yes')
          out.push({ text: t(lang(), 'followup_yes') }, { text: t(lang(), 'satisfaction_q'), options: [opt(lang(), 'sat:yes', 'useful'), opt(lang(), 'sat:no', 'not_useful')] });
        else out.push({ text: t(lang(), 'followup_no'), options: [opt(lang(), 'orient', 'orient_me'), opt(lang(), 'human', 'talk_human')] });
        break;
      case 'sat':
        stats.track(arg === 'yes' ? 'satisfaction_oui' : 'satisfaction_non', ctx());
        out.push({ text: t(lang(), 'satisfaction_thanks') });
        break;
      case 'bien':
        out.push({ text: ficheReply(lang(), 'stress-tristesse'), audio: audioFor(lang(), 'stress-tristesse'), options: [opt(lang(), 'human', 'talk_human'), opt(lang(), 'menu', 'back_menu')] });
        break;
      case 'sec':
        if (arg === 'rights')
          out.push({ text: ficheReply(lang(), 'violences-droits'), audio: audioFor(lang(), 'violences-droits'), options: [opt(lang(), 'alert', 'send_alert'), opt(lang(), 'sec:where', 'where_help')] });
        else if (arg === 'where') {
          s.state = 'securite:where';
          out.push(s.district ? securiteWhere(s) : askDistrict(lang()));
        }
        break;
      case 'alert':
      case 'human': {
        const kind = a === 'alert' ? 'alerte' : 'humain';
        if (arg === 'this') {
          out.push(await createCallback(s, kind === 'alerte' && s.pendingKind ? s.pendingKind : kind, channel, userId));
          break;
        }
        s.pendingKind = kind;
        s.state = 'callback';
        const options = channel === 'whatsapp' ? [{ id: `${a}:this`, label: t(lang(), 'this_number') }] : undefined;
        out.push({ text: t(lang(), 'alert_contact_ask') + (options ? `\n${t(lang(), 'this_number_hint')}` : ''), options });
        break;
      }
      default:
        out.push(menu(lang()));
    }
    persist();
    return { replies: out, ui };
  }

  // 5. Texte libre.
  const d = detectDanger(text);
  if (d) {
    stats.track(d === 'detresse' ? 'detresse_detectee' : 'violence_detectee', ctx());
    s.state = 'securite';
    persist();
    return { replies: [{ text: t(lang(), 'danger_detected'), options: [opt(lang(), 'alert', 'send_alert'), opt(lang(), 'human', 'talk_human')] }] };
  }

  if (s.state === 'callback') {
    const digits = text.replace(/[^\d+]/g, '');
    if (digits.length >= 8 || (channel === 'whatsapp' && /nimero bii|ce numero/.test(n))) {
      out.push(await createCallback(s, s.pendingKind || 'alerte', channel, digits.length >= 8 ? digits : userId));
    } else out.push({ text: t(lang(), 'alert_contact_ask') });
    persist();
    return { replies: out };
  }

  if (!n) {
    persist();
    return { replies: [menu(lang())] };
  }

  stats.track('question', ctx());
  const res = await answer(text, s.lang);
  if (res) {
    stats.track('reponse_fiche', ctx());
    const draft = res.fiche.statut !== 'valide' ? `\n\n${t(lang(), 'draft_notice')}` : '';
    out.push({ text: res.text + draft, audio: audioFor(s.lang, res.fiche.id) });
    if (res.fiche.theme === 'securite') out.push(securiteMenu(lang()));
    else if (res.fiche.theme === 'bienetre') out.push({ text: t(lang(), 'want_orientation'), options: [opt(lang(), 'human', 'talk_human'), opt(lang(), 'menu', 'later')] });
    else if (res.fiche.orienter) out.push({ text: t(lang(), 'want_orientation'), options: [opt(lang(), 'orient', 'orient_me'), opt(lang(), 'menu', 'later')] });
  } else {
    stats.track('sans_reponse', ctx());
    out.push({ text: t(lang(), 'no_answer'), options: [opt(lang(), 'orient', 'orient_me'), opt(lang(), 'human', 'talk_human')] });
  }
  persist();
  return { replies: out };
}

function securiteMenu(lang) {
  return {
    text: t(lang, 'securite_intro'),
    options: [opt(lang, 'alert', 'send_alert'), opt(lang, 'sec:rights', 'info_rights'), opt(lang, 'sec:where', 'where_help')]
  };
}

function orientation(s) {
  const list = structuresFor(s.district, ['poste_sante', 'relais']);
  stats.track('orientation_proposee', { district: s.district, lang: s.lang });
  if (!list.length) return { text: t(s.lang, 'no_structure'), options: [opt(s.lang, 'human', 'talk_human')] };
  return { ...card(s.lang, list), options: [opt(s.lang, 'reminder:yes', 'yes'), opt(s.lang, 'reminder:later', 'later')], text: `${t(s.lang, 'near_you')}\n\n${t(s.lang, 'reminder_ask')}` };
}

function securiteWhere(s) {
  const list = structuresFor(s.district, ['violences', 'relais']);
  if (!list.length) return { text: t(s.lang, 'no_structure'), options: [opt(s.lang, 'alert', 'send_alert')] };
  return { ...card(s.lang, list), options: [opt(s.lang, 'alert', 'send_alert')] };
}

async function createCallback(s, kind, channel, contact) {
  const alert = alerts.add({ type: kind, district: s.district || 'non_precise', lang: s.lang, channel, contact: encrypt(contact) });
  stats.track(kind === 'alerte' ? 'alerte_envoyee' : 'transfert_humain', { district: s.district, lang: s.lang });
  s.state = 'menu';
  delete s.pendingKind;
  try {
    await notifyRelay(alert, contact);
  } catch (e) {
    console.error('[relais] échec de notification', e.message);
  }
  return { text: t(s.lang, kind === 'alerte' ? 'alert_sent' : 'human_sent') };
}

// Message de suivi (rappel J+3), utilisé par le planificateur.
export function followupMessage(lang) {
  return { text: t(lang, 'followup_q'), options: [opt(lang, 'followup:yes', 'yes'), opt(lang, 'followup:no', 'consent_no')] };
}

export function _resetPreConsent() {
  preConsent.clear();
}
