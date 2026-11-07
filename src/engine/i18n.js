// Textes de l'interface. Français = référence ; wolof = BROUILLON à faire relire par un locuteur.
// Pour ajouter une langue : copier le bloc "fr", traduire, et ajouter le code dans LANGS.

export const LANGS = ['fr', 'wo'];
export const LANG_LABELS = { fr: 'Français', wo: 'Wolof', ff: 'Pulaar' };

const T = {
  fr: {
    welcome:
      "Bonjour, je suis Jigéen Ngir Jàmm. Je donne des informations confidentielles sur la santé, le bien-être et la sécurité des femmes et des filles. C'est gratuit, aucun nom n'est demandé. Je ne pose pas de diagnostic : je vous informe et je vous oriente vers des personnes qualifiées.",
    consent_ask: "Acceptez-vous de continuer ? Seules les informations nécessaires au service sont gardées, sans votre nom.",
    consent_yes: "J'accepte",
    consent_no: 'Non merci',
    consent_refused: "D'accord. Rien n'a été enregistré. Écrivez « bonjour » si vous changez d'avis.",
    choose_lang: 'Choisissez votre langue',
    pulaar_soon: 'Le pulaar arrive bientôt. Je continue en français pour le moment.',
    menu_title: 'De quoi avez-vous besoin ?',
    p_soins: 'Me faire soigner',
    p_sante: 'Ma santé de femme',
    p_bienetre: 'Parler, me sentir mieux',
    p_securite: 'Être en sécurité',
    ask_district: 'Dans quelle zone êtes-vous ? Votre position exacte n’est pas enregistrée.',
    near_you: 'Où aller près de vous',
    call: 'Appeler',
    no_structure: "Je n'ai pas encore de structure enregistrée dans cette zone. Une personne formée peut vous aider à trouver où aller.",
    reminder_ask: 'Voulez-vous que je vous demande dans 3 jours si vous avez pu consulter ?',
    yes: 'Oui',
    later: 'Plus tard',
    reminder_set: "C'est noté. Je vous écrirai dans 3 jours, avec un message neutre.",
    followup_q: 'Bonjour. Avez-vous pu consulter ?',
    followup_yes: "Tant mieux. Merci de m'avoir répondu.",
    followup_no: 'Voulez-vous que je vous propose une autre structure ou une personne à qui parler ?',
    satisfaction_q: 'Ce service vous a-t-il été utile ?',
    satisfaction_thanks: 'Merci pour votre réponse.',
    useful: 'Utile',
    not_useful: 'Pas utile',
    sante_intro: 'Posez votre question en écrivant ou en parlant. Personne d’autre ne l’entendra.',
    no_answer:
      "Je n'ai pas d'information validée sur cette question. Je ne veux pas risquer de vous donner une mauvaise réponse. Une sage-femme peut vous répondre.",
    want_orientation: 'Voulez-vous une orientation ?',
    orient_me: 'Oui, orientez-moi',
    bienetre_intro:
      "Je suis là pour vous écouter. Dites-moi ce que vous ressentez, ou choisissez : un exercice pour vous apaiser, ou parler à une personne formée.",
    exercise: 'Un exercice',
    talk_human: 'Parler à quelqu’un',
    securite_intro: 'Vous n’êtes pas seule. Vous choisissez ce qui se passe ensuite.',
    send_alert: 'Alerte discrète',
    info_rights: 'Mes droits',
    where_help: 'Où trouver de l’aide',
    alert_contact_ask:
      'Sur quel numéro une personne formée peut-elle vous rappeler sans danger ?',
    this_number_hint: 'Ou touchez « Ce numéro » si c’est celui-ci.',
    this_number: 'Ce numéro',
    alert_sent: 'Alerte envoyée. Une personne formée vous rappelle. Rien n’apparaît sur l’écran.',
    human_sent: 'Une personne formée a été prévenue et va reprendre la conversation dès que possible.',
    danger_detected:
      "Ce que vous vivez est grave et vous méritez de l'aide maintenant. Si vous êtes en danger immédiat, appelez le 17 (police) ou le 18 (pompiers). Je peux aussi prévenir tout de suite une personne formée.",
    code_word_hint: 'Mot de code : dites-le pour passer à un écran neutre.',
    erased: 'Vos données ont été effacées. Pensez aussi à supprimer cette discussion de votre téléphone.',
    voice_unsupported: 'Je ne comprends pas encore les messages vocaux. Pouvez-vous écrire votre question ?',
    back_menu: 'Menu',
    neutral: 'Recette du jour : thiéboudienne. Ingrédients : riz, poisson, légumes, tomate.',
    help:
      'Commandes : « menu » pour revenir au début, « langue » pour changer de langue, « effacer » pour supprimer vos données, « aide » pour parler à une personne formée.',
    draft_notice: '(Contenu de démonstration, en cours de validation par des professionnelles de santé.)'
  },
  wo: {
    welcome:
      "Asalaa maalekum, maa ngi tudd Jigéen Ngir Jàmm. Maa ngi lay jox ay xibaar yu nëbbu ci wér-gu-yaramu jigéen ñi ak janq yi, seen jàmm ak seen kaarange. Amul fey, kenn du la laaj sa tur. Duma def diagnostic : dama lay xamal te won la nit ñu ko mën.",
    consent_ask: 'Ndax nangu nga ñu wéy ? Lu soxla rekk lañuy denc, te du sa tur.',
    consent_yes: 'Nangu naa',
    consent_no: 'Déedéet',
    consent_refused: 'Waaw. Dara denccuñu ko. Bindal « salaam » bu nga soppee sa xalaat.',
    choose_lang: 'Tànnal sa làkk',
    pulaar_soon: 'Pulaar dina ñëw ci kanam. Léegi maa ngi wéy ci farañse.',
    menu_title: 'Lan nga soxla ?',
    p_soins: 'Faju',
    p_sante: 'Sama wér-gu-yaram',
    p_bienetre: 'Waxtaan, dal',
    p_securite: 'Am kaarange',
    ask_district: 'Ci ban gox nga nekk ? Fi nga nekk dëgg-dëgg, duñu ko denc.',
    near_you: 'Fan nga mën a dem',
    call: 'Woo',
    no_structure: 'Amaguma benn bérab ci gox boobu. Nit ku ñu tàggat mën na la dimbali.',
    reminder_ask: 'Ndax nga bëgg ma laaj la ci 3 fan ndax dem nga ca fajkat ba ?',
    yes: 'Waaw',
    later: 'Ci kanam',
    reminder_set: 'Bind naa ko. Dinaa la bindal ci 3 fan, ak ab bataaxal bu amul dara.',
    followup_q: 'Asalaa maalekum. Ndax dem nga ca fajkat ba ?',
    followup_no: 'Ndax nga bëgg ma won la beneen bérab walla nit ku nga mën a waxtaanal ?',
    followup_yes: 'Baax na. Jërëjëf ci sa tontu.',
    satisfaction_q: 'Ndax liggéey bii jariñ na la ?',
    satisfaction_thanks: 'Jërëjëf ci sa tontu.',
    useful: 'Jariñ na',
    not_useful: 'Jariñul',
    sante_intro: 'Laajal sa laaj, bindal walla waxal. Kenn du ko dégg.',
    no_answer: 'Amuma xibaar bu ñu wóoral ci laaj bii. Bëggumaa la jox tontu bu baaxul. Sage-femme mën na la tontu.',
    want_orientation: 'Ndax nga bëgg ma won la fan nga mën a dem ?',
    orient_me: 'Waaw, won ma',
    bienetre_intro:
      'Maa ngi fi ngir déglu la. Waxal ma li ngay yëg, walla tànnal : ab exercice ngir dal, walla waxtaan ak nit ku ñu tàggat.',
    exercise: 'Exercice',
    talk_human: 'Waxtaan ak nit',
    securite_intro: 'Du yaw rekk. Yaw yaay tànn li ñuy def.',
    send_alert: 'Alerte bu nëbbu',
    info_rights: 'Samay sañ-sañ',
    where_help: 'Fan laa mën a jot ndimbal',
    alert_contact_ask: 'Ci ban nimero la nit ku ñu tàggat mën a woo te amul musiba ?',
    this_number_hint: 'Walla bësal « Nimero bii » su fekkee bii la.',
    this_number: 'Nimero bii',
    alert_sent: 'Alerte bi dem na. Nit ku ñu tàggat dina la woo. Dara du feeñ ci écran bi.',
    human_sent: 'Nit ku ñu tàggat xam na ko te dina wéy waxtaan wi ci lu gaaw.',
    danger_detected:
      'Li ngay dund dafa diis te war nga am ndimbal léegi. Su fekkee yaa ngi ci musiba léegi, wool 17 (police) walla 18 (pompiers). Mën naa xamal léegi nit ku ñu tàggat.',
    code_word_hint: 'Baat bu nëbbu : wax ko ngir dem ci écran bu amul dara.',
    erased: 'Sa xibaar yi far nañu leen. Faral itam waxtaan wii ci sa telefon.',
    voice_unsupported: 'Xamaguma bataaxal yu baat. Ndax mën nga bind sa laaj ?',
    back_menu: 'Menu',
    neutral: 'Recette bu tey : ceebu jën. Li ci nekk : ceeb, jën, ay lujum, tamaate.',
    help:
      'Bindal « menu » ngir dellu ci tàmbali, « làkk » ngir soppi làkk, « far » ngir far sa xibaar, « ndimbal » ngir waxtaan ak nit ku ñu tàggat.',
    draft_notice: '(Lii ab misaal la, fajkat yi ngi koy saytu.)'
  }
};

export function t(lang, key) {
  return (T[lang] && T[lang][key]) || T.fr[key] || key;
}
