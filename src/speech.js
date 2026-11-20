// Transcription des messages vocaux (français pour l'instant ; wolof et pulaar à venir).
// API compatible OpenAI (/audio/transcriptions) : OpenAI Whisper, Groq ou un serveur Whisper local.
// L'audio reste en mémoire : il n'est jamais écrit sur disque, et ni l'audio ni le texte ne vont dans les journaux.
import { config } from './config.js';

const stt = config.stt;
export const speechEnabled = () => Boolean(stt.apiKey);

// Le service reconnaît le format à l'extension du nom de fichier (WhatsApp : ogg ; navigateurs : webm ou mp4).
const EXT = { 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };

export async function transcribe({ data, mime }, lang = 'fr') {
  if (!speechEnabled()) return '';
  const form = new FormData();
  form.append('file', new Blob([data], { type: mime }), `vocal.${EXT[String(mime).split(';')[0].trim()] || 'ogg'}`);
  form.append('model', stt.model);
  form.append('language', lang);
  const res = await fetch(stt.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${stt.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) {
    console.error('[transcription] erreur', res.status);
    return '';
  }
  const { text = '' } = await res.json();
  return text.trim().slice(0, 1000);
}
