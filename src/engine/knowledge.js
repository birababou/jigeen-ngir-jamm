// Base de connaissances : recherche dans les fiches validées + réponse éventuellement reformulée par un LLM.
// Règle : l'assistant ne répond QU'À PARTIR des fiches. Sinon, il oriente vers une sage-femme.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const load = (f) => JSON.parse(fs.readFileSync(path.join(config.root, 'data', f), 'utf8'));
export const fiches = load('fiches.json').fiches;
export const annuaire = load('annuaire.json');
export const danger = load('danger.json');

export const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const contains = (text, kw) => {
  const k = norm(kw);
  return k.length > 0 && ` ${text} `.includes(` ${k}`);
};

export function search(question, { theme } = {}) {
  const q = norm(question);
  return fiches
    .filter((f) => !theme || f.theme === theme || theme === 'sante')
    .map((f) => {
      let score = 0;
      for (const lang of Object.keys(f.mots_cles)) for (const kw of f.mots_cles[lang]) if (contains(q, kw)) score += norm(kw).split(' ').length;
      if (f.urgence && score > 0) score += 0.5; // en cas de doute, les signes de danger passent devant
      return { f, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.f);
}

export function detectDanger(text) {
  const q = norm(text);
  for (const kind of ['detresse', 'violence'])
    for (const lang of Object.keys(danger[kind])) for (const kw of danger[kind][lang]) if (contains(q, kw)) return kind;
  return null;
}

// Réponse : texte de la fiche, ou reformulation par LLM si une clé est configurée.
export async function answer(question, lang) {
  const found = search(question).slice(0, 3);
  if (!found.length) return null;
  const best = found[0];
  let text = best.texte[lang] || best.texte.fr;
  if (config.llm.apiKey) {
    try {
      const llm = await askLLM(question, lang, found);
      if (llm && llm !== 'NO_ANSWER') text = llm;
    } catch (e) {
      console.warn('[llm] repli sur la fiche :', e.message);
    }
  }
  return { fiche: best, text };
}

async function askLLM(question, lang, found) {
  const sources = found.map((f) => `### ${f.titre.fr}\n${f.texte[lang] || f.texte.fr}`).join('\n\n');
  const system = [
    "Tu es Jigéen Ngir Jàmm, un assistant d'information en santé pour les femmes et les filles au Sénégal.",
    `Réponds en ${lang === 'wo' ? 'wolof' : 'français'}, en 4 phrases maximum, avec des mots simples.`,
    'Tu réponds UNIQUEMENT avec les informations des fiches fournies. Tu ne poses jamais de diagnostic, tu ne prescris jamais de médicament ni de dose.',
    "Si les fiches ne répondent pas à la question, réponds exactement : NO_ANSWER",
    "Si la question évoque une urgence ou une violence, rappelle d'aller immédiatement au poste de santé ou d'appeler le 17."
  ].join('\n');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: ctrl.signal,
    headers: { 'content-type': 'application/json', 'x-api-key': config.llm.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: config.llm.model,
      max_tokens: 400,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: `Fiches validées :\n\n${sources}\n\nQuestion de l'utilisatrice : ${question}` }]
    })
  }).finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text?.trim();
}

// Audio enregistré (voix humaine) d'une fiche : web/audio/<langue>/<id-fiche>.mp3
export function audioFor(lang, ficheId) {
  const rel = `/audio/${lang}/${ficheId}.mp3`;
  return fs.existsSync(path.join(config.root, 'web', rel)) ? rel : undefined;
}

export function structuresFor(district, types) {
  return annuaire.structures.filter((s) => s.district === district && (!types || types.includes(s.type)));
}
