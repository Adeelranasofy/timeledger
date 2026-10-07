'use strict';
/*
 * TimeLedger backup core — no Electron here, so it can be tested with plain Node.
 *
 *   Envelope   the portable backup file (see docs/BACKUP_FORMAT.md); optional AES-256-GCM encryption
 *   Naming     backup file names and retention (one week, newest always kept)
 *   Drive      a tiny Google Drive v3 REST client (drive.file scope, one "TimeLedger Backups" folder)
 *   OAuth      PKCE helpers for Google's installed-app (loopback) sign-in
 */
const crypto = require('crypto');

const FORMAT = 'timeledger-backup';
const FORMAT_VERSION = 1;
const KDF_ITERATIONS = 310000;

// ---------- envelope ----------

function summarize(data) {
  const rows = Object.values((data && data.rows) || {}).reduce((a, w) => a + (Array.isArray(w) ? w.length : Object.values(w || {}).reduce((b, r) => b + (Array.isArray(r) ? r.length : 0), 0)), 0);
  return { workspaces: Array.isArray(data && data.workspaces) ? data.workspaces.length : 1, employees: Array.isArray(data && data.employees) ? data.employees.length : 0, rows };
}

const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * Wrap app data in a backup envelope.
 * @param data  the app's data object (or its JSON string)
 * @param meta  { appVersion, platform, deviceId, deviceName, reason, createdAt? }
 * @param passphrase  optional: encrypts the data with AES-256-GCM (key from PBKDF2-SHA256)
 * @returns JSON text
 */
function makeEnvelope(data, meta, passphrase) {
  const obj = typeof data === 'string' ? JSON.parse(data) : data;
  // the checksum covers the canonical JSON, so any reader can re-serialise data and compare
  const payload = JSON.stringify(obj);
  const env = {
    format: FORMAT, formatVersion: FORMAT_VERSION, schemaVersion: obj.version || 1,
    app: 'TimeLedger', appVersion: meta.appVersion || '', platform: meta.platform || '',
    deviceId: meta.deviceId || '', deviceName: meta.deviceName || '',
    createdAt: meta.createdAt || new Date().toISOString(), reason: meta.reason || 'manual',
    summary: summarize(obj), checksum: 'sha256:' + sha256(payload), encrypted: !!passphrase,
  };
  if (!passphrase) return JSON.stringify(Object.assign(env, { data: obj }));
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(String(passphrase), salt, KDF_ITERATIONS, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(payload, 'utf8'), c.final()]);
  env.encryption = { cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') };
  env.ciphertext = ct.toString('base64');
  return JSON.stringify(env);
}

class BackupError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

/**
 * Read any TimeLedger backup: an envelope (plain or encrypted), or an older plain data export.
 * @returns { data, meta } — throws BackupError NOT_BACKUP | NEEDS_PASSPHRASE | BAD_PASSPHRASE | CORRUPT
 */
function openEnvelope(text, passphrase) {
  let o;
  try { o = JSON.parse(String(text).replace(/^﻿/, '')); } catch (_) { throw new BackupError('NOT_BACKUP', 'Not a TimeLedger backup (not valid JSON)'); }
  if (o && o.format === FORMAT) {
    if (o.formatVersion > FORMAT_VERSION) throw new BackupError('TOO_NEW', 'This backup was made by a newer TimeLedger. Update the app to open it.');
    const meta = Object.assign({}, o); delete meta.data; delete meta.ciphertext;
    let payload;
    if (o.encrypted) {
      if (!passphrase) throw new BackupError('NEEDS_PASSPHRASE', 'This backup is encrypted');
      try {
        const e = o.encryption;
        const key = crypto.pbkdf2Sync(String(passphrase), Buffer.from(e.salt, 'base64'), e.iterations, 32, 'sha256');
        const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'base64'));
        d.setAuthTag(Buffer.from(e.tag, 'base64'));
        payload = Buffer.concat([d.update(Buffer.from(o.ciphertext, 'base64')), d.final()]).toString('utf8');
      } catch (_) { throw new BackupError('BAD_PASSPHRASE', 'Wrong passphrase, or the file is damaged'); }
    } else payload = JSON.stringify(o.data);
    if (o.checksum && o.checksum !== 'sha256:' + sha256(payload)) throw new BackupError('CORRUPT', 'The backup is damaged (checksum does not match)');
    const data = JSON.parse(payload);
    if (!data || !Array.isArray(data.employees) || typeof data.rows !== 'object') throw new BackupError('CORRUPT', 'The backup has no TimeLedger data');
    return { data, meta };
  }
  // older exports: the data object itself, possibly with exportedAt / app on top
  if (o && Array.isArray(o.employees) && o.rows && typeof o.rows === 'object') {
    const data = Object.assign({}, o); delete data.exportedAt; delete data.app;
    return { data, meta: { legacy: true, createdAt: o.exportedAt || null, summary: summarize(data), encrypted: false } };
  }
  throw new BackupError('NOT_BACKUP', 'Not a TimeLedger backup');
}

/** Just the header of an envelope, without decrypting (for listings). */
function peekMeta(text) {
  try {
    const o = JSON.parse(String(text).replace(/^﻿/, ''));
    if (o && o.format === FORMAT) { const m = Object.assign({}, o); delete m.data; delete m.ciphertext; return m; }
    if (o && Array.isArray(o.employees)) return { legacy: true, createdAt: o.exportedAt || null, summary: summarize(o), encrypted: false };
  } catch (_) { /* not readable */ }
  return null;
}

// ---------- naming & retention ----------

const NAME_RE = /^TimeLedger-backup_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})(?:_[\w-]*)?\.json$/;
const pad = n => String(n).padStart(2, '0');
function backupFileName(date, deviceName, reason) {
  const d = date instanceof Date ? date : new Date(date);
  const dev = String(deviceName || '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return `TimeLedger-backup_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    + (dev ? '_' + dev : '') + (reason === 'before-restore' ? '_before-restore' : '') + '.json';
}
function timeFromName(name) {
  const m = NAME_RE.exec(name); if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}
const KEEP_DAYS = 7;
/**
 * Files to delete because they are older than `days` (default one week). Only touches names TimeLedger made,
 * and always keeps the newest backup, so a long break from the app never leaves no backup at all.
 * files: [{ name, time? }]  (time in ms; otherwise read from the name)
 */
function pruneByAge(files, days, now) {
  const cutoff = (now == null ? Date.now() : +now) - (days || KEEP_DAYS) * 24 * 3600 * 1000;
  const ours = files.filter(f => NAME_RE.test(f.name)).map(f => Object.assign({ t: f.time != null ? f.time : timeFromName(f.name) }, f)).sort((a, b) => b.t - a.t);
  return ours.slice(1).filter(f => f.t < cutoff);
}
/** Files to delete so only the newest `keep` TimeLedger backups remain. Only touches names TimeLedger made. */
function pruneList(files, keep) {
  if (!(keep > 0)) return [];
  const ours = files.filter(f => NAME_RE.test(f.name)).map(f => Object.assign({ t: f.time != null ? f.time : timeFromName(f.name) }, f)).sort((a, b) => b.t - a.t);
  return ours.slice(keep);
}

// ---------- schedule ----------

/**
 * Is a scheduled backup due, and when is the next one?
 * schedule: { mode: 'off' | 'daily' | 'every', time: 'HH:MM', everyHours }
 * lastAt:   ISO time of the last scheduled run (the service sets a baseline, so null means "never ran, not due")
 * A slot missed while the computer was off is caught up the next time the app runs.
 */
function scheduleState(schedule, lastAt, now) {
  now = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
  const last = lastAt ? Date.parse(lastAt) : 0;
  const s = schedule || {};
  if (s.mode === 'every') {
    const ms = Math.min(24, Math.max(1, +s.everyHours || 4)) * 3600e3;
    if (!last) return { due: false, next: new Date(now.getTime() + ms) };
    const at = last + ms;
    return { due: now.getTime() >= at, next: new Date(Math.max(at, now.getTime())) };
  }
  if (s.mode === 'daily') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s.time || ''));
    const h = m ? Math.min(23, +m[1]) : 18, mi = m ? Math.min(59, +m[2]) : 0;
    const recent = new Date(now); recent.setHours(h, mi, 0, 0);
    if (recent > now) recent.setDate(recent.getDate() - 1); // most recent slot at or before now
    const due = last > 0 && last < recent.getTime();
    const next = new Date(recent); next.setDate(next.getDate() + 1);
    return { due, next: due ? now : next };
  }
  return { due: false, next: null };
}

// ---------- Google Drive (v3 REST) ----------

const DRIVE_FOLDER = 'TimeLedger Backups';
function createDrive({ getToken, fetchImpl, api = 'https://www.googleapis.com' }) {
  const f = fetchImpl || fetch;
  async function call(method, url, opts) {
    const token = await getToken();
    const res = await f(url, Object.assign({ method, headers: Object.assign({ Authorization: 'Bearer ' + token }, (opts && opts.headers) || {}) }, opts && opts.body != null ? { body: opts.body } : {}));
    if (res.status === 204) return null;
    const text = await res.text();
    if (!res.ok) {
      let msg = text; try { msg = JSON.parse(text).error.message; } catch (_) { /* keep text */ }
      const e = new BackupError(res.status === 401 ? 'AUTH' : 'DRIVE', 'Google Drive: ' + msg); e.status = res.status; throw e;
    }
    return opts && opts.raw ? text : text ? JSON.parse(text) : null;
  }
  const q = s => encodeURIComponent(s);
  return {
    async ensureFolder(knownId) {
      if (knownId) {
        try { const m = await call('GET', `${api}/drive/v3/files/${knownId}?fields=id,trashed`); if (m && !m.trashed) return m.id; } catch (e) { if (e.status !== 404) throw e; }
      }
      const found = await call('GET', `${api}/drive/v3/files?q=${q(`name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)&spaces=drive`);
      if (found.files && found.files.length) return found.files[0].id;
      const made = await call('POST', `${api}/drive/v3/files?fields=id`, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder', description: 'Backups made by the TimeLedger app' }) });
      return made.id;
    },
    async upload(folderId, name, content, appProperties) {
      const boundary = 'tl' + crypto.randomBytes(8).toString('hex');
      const meta = { name, parents: [folderId], mimeType: 'application/json', appProperties: appProperties || {} };
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
      return call('POST', `${api}/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime`, { headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body });
    },
    async list(folderId) {
      const r = await call('GET', `${api}/drive/v3/files?q=${q(`'${folderId}' in parents and trashed=false`)}&orderBy=createdTime desc&pageSize=200&fields=files(id,name,size,createdTime,appProperties)`);
      return r.files || [];
    },
    download(id) { return call('GET', `${api}/drive/v3/files/${id}?alt=media`, { raw: true }); },
    remove(id) { return call('DELETE', `${api}/drive/v3/files/${id}`); },
  };
}

// ---------- Google OAuth (installed app, loopback + PKCE) ----------

const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'];
const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  return { verifier, challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), state: b64url(crypto.randomBytes(16)) };
}
function authUrl(clientId, redirectUri, p) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: GOOGLE_SCOPES.join(' '), code_challenge: p.challenge, code_challenge_method: 'S256', state: p.state, access_type: 'offline', prompt: 'consent' }).toString();
  return u.toString();
}
async function tokenRequest(params, fetchImpl, tokenUrl) {
  const res = await (fetchImpl || fetch)(tokenUrl || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new BackupError(j.error === 'invalid_grant' ? 'AUTH' : 'OAUTH', 'Google sign-in: ' + (j.error_description || j.error || res.status));
  return j;
}
function emailFromIdToken(idToken) {
  try { return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64').toString('utf8')).email || ''; } catch (_) { return ''; }
}

module.exports = {
  FORMAT, FORMAT_VERSION, BackupError, summarize, makeEnvelope, openEnvelope, peekMeta,
  NAME_RE, backupFileName, timeFromName, pruneList, pruneByAge, KEEP_DAYS, scheduleState,
  DRIVE_FOLDER, createDrive, GOOGLE_SCOPES, pkce, authUrl, tokenRequest, emailFromIdToken,
};
