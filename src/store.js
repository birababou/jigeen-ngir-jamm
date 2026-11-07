// Stockage minimal en fichier JSON pour la démo.
// V1 pilote : remplacer par PostgreSQL en gardant la même interface (voir docs/ARCHITECTURE.md).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const FILE = path.join(config.dataDir, 'store.json');

const empty = () => ({ sessions: {}, alerts: [], followups: [], stats: { counters: {}, users: {} } });
let db = load();
let saveTimer = null;

function load() {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    return empty();
  }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
  }, 50);
}

// ---------- Protection : pseudonymisation et chiffrement ----------
const key = crypto.createHash('sha256').update(config.encryptionKey).digest();

export function hashUser(channel, id) {
  return crypto.createHmac('sha256', config.hashSecret).update(`${channel}:${id}`).digest('hex').slice(0, 32);
}

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(blob) {
  const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

// ---------- Sessions (uniquement après consentement) ----------
export const sessions = {
  get: (h) => db.sessions[h],
  set(h, s) {
    db.sessions[h] = { ...s, updatedAt: Date.now() };
    save();
  },
  erase(h) {
    delete db.sessions[h];
    db.followups = db.followups.filter((f) => f.userHash !== h);
    // Les alertes déjà transmises restent au relais (prise en charge en cours), sans lien avec la session.
    save();
  },
  // Minimisation : supprime les sessions inactives (le fichier ne grossit pas indéfiniment).
  purgeInactive(days) {
    const limit = Date.now() - days * 86400000;
    const pending = new Set(db.followups.map((f) => f.userHash));
    let n = 0;
    for (const [h, s] of Object.entries(db.sessions))
      if (s.updatedAt < limit && !pending.has(h)) {
        delete db.sessions[h];
        n++;
      }
    if (n) save();
    return n;
  }
};

// ---------- Alertes et transferts humains ----------
export const alerts = {
  add(a) {
    const alert = { id: crypto.randomUUID().slice(0, 8), status: 'nouveau', createdAt: new Date().toISOString(), ...a };
    db.alerts.push(alert);
    save();
    return alert;
  },
  list: () => db.alerts,
  setStatus(id, status) {
    const a = db.alerts.find((x) => x.id === id);
    if (!a) return null;
    a.status = status;
    if (status === 'clos') a.closedAt = new Date().toISOString();
    save();
    return a;
  },
  purgeClosed(days) {
    const limit = Date.now() - days * 86400000;
    db.alerts = db.alerts.filter((a) => !(a.status === 'clos' && Date.parse(a.closedAt) < limit));
    save();
  }
};

// ---------- Rappels de suivi ----------
export const followups = {
  add(f) {
    db.followups.push({ id: crypto.randomUUID().slice(0, 8), ...f });
    save();
  },
  due: (now = Date.now()) => db.followups.filter((f) => f.dueAt <= now),
  remove(id) {
    db.followups = db.followups.filter((f) => f.id !== id);
    save();
  }
};

// ---------- Statistiques agrégées (aucune donnée personnelle) ----------
export const stats = {
  track(event, { district = 'non_precise', lang = 'fr', userHash } = {}) {
    const month = new Date().toISOString().slice(0, 7);
    const k = `${month}|${district}|${lang}|${event}`;
    db.stats.counters[k] = (db.stats.counters[k] || 0) + 1;
    if (userHash) {
      const u = (db.stats.users[month] ||= {});
      u[userHash] = 1;
    }
    save();
  },
  raw: () => db.stats
};

export function _resetForTests() {
  db = empty();
}
