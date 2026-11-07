// Configuration par variables d'environnement (voir .env.example).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

if (!env.HASH_SECRET || !env.ENCRYPTION_KEY) {
  console.warn('[config] HASH_SECRET / ENCRYPTION_KEY absents : valeurs de démo utilisées. À définir en production.');
}

export const config = {
  root,
  port: Number(env.PORT || 3000),
  dataDir: env.DATA_DIR || path.join(root, 'var'),
  hashSecret: env.HASH_SECRET || 'demo-hash-secret-a-changer',
  encryptionKey: env.ENCRYPTION_KEY || 'demo-encryption-key-a-changer',
  codeWord: (env.CODE_WORD || 'mango').toLowerCase(),
  followupDelayMinutes: Number(env.FOLLOWUP_DELAY_MINUTES || 3 * 24 * 60),
  alertRetentionDays: Number(env.ALERT_RETENTION_DAYS || 90),
  sessionRetentionDays: Number(env.SESSION_RETENTION_DAYS || 60),
  statsThreshold: Number(env.STATS_THRESHOLD || 10),
  adminToken: env.ADMIN_TOKEN || '',
  whatsapp: {
    token: env.WHATSAPP_TOKEN || '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: env.WHATSAPP_APP_SECRET || '',
    followupTemplate: env.WHATSAPP_FOLLOWUP_TEMPLATE || '',
    graphVersion: env.WHATSAPP_GRAPH_VERSION || 'v21.0'
  },
  relay: {
    whatsapp: env.RELAY_WHATSAPP || ''
  },
  llm: {
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.LLM_MODEL || 'claude-haiku-5-5'
  }
};
