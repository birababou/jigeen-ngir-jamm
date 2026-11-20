// Voix de synthèse PROVISOIRE (ElevenLabs) pour répondre en vocal sur WhatsApp, en attendant les
// enregistrements des traducteurs. Seuls les textes du bot partent chez ElevenLabs, jamais les paroles
// des utilisatrices. Chaque audio est fabriqué une seule fois puis gardé dans var/voix/ (même texte = même fichier).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const tts = config.tts;
const DIR = path.join(config.dataDir, 'voix');
export const ttsEnabled = () => Boolean(tts.apiKey && tts.voiceId);

// Renvoie { key, data } : l'audio MP3 du texte, depuis le cache ou fabriqué à la demande.
export async function speechAudio(text) {
  const key = crypto.createHash('sha256').update(`${tts.voiceId}|${tts.model}|${text}`).digest('hex').slice(0, 24);
  const file = path.join(DIR, `${key}.mp3`);
  if (fs.existsSync(file)) return { key, data: fs.readFileSync(file) };
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${tts.voiceId}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': tts.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: tts.model, language_code: 'fr' }),
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`voix ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, data);
  return { key, data };
}
