'use strict';
/*
 * Backup service (Electron main process).
 *
 * Destinations, all optional and usable together:
 *   - Google Drive      signed in with the user's Google account; files go to "TimeLedger Backups" in their Drive
 *   - A folder          on this computer, a USB drive, or a synced cloud folder (OneDrive, Dropbox, iCloud Drive,
 *                       Google Drive for desktop) — the provider's own app syncs it to the cloud
 *   - App data folder   the built-in daily safety copies (always on, last 7 days)
 *
 * Every destination keeps one week of backups; older ones are deleted, but the newest one always stays.
 *
 * Automatic backups (each can be switched off): a few minutes after the last change, on a schedule (daily at a
 * set time, or every N hours, catching up missed slots), and when the app closes with
 * unsaved-to-backup changes. Device-specific settings (folder path, sign-in) live in backup-config.json in the
 * app data folder — never inside the backup itself, so a backup can be restored on any device.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const core = require('./backup-core');

const LOCAL_DAILY_RE = /^timeledger-\d{4}-\d{2}-\d{2}\.json$/;
const SUB = 'TimeLedger Backups';

function createBackupService({ app, ipcMain, dialog, shell, safeStorage, getWin, dataFile, localDir }) {
  const CFG_FILE = path.join(app.getPath('userData'), 'backup-config.json');
  const defaults = () => ({
    deviceId: crypto.randomUUID(), deviceName: os.hostname() || 'This computer',
    onChange: true, delayMin: 5,          // back up a few minutes after the last change
    onClose: true,                        // back up unsent changes when the app closes
    schedule: { mode: 'daily', time: '18:00', everyHours: 4 }, lastScheduledAt: null,
    encrypt: false, passphrase: null, folder: null, gdrive: null, lastAutoAt: null,
  });
  let cfg = loadCfg();
  let dirty = false, timer = null, running = null, access = null, quitting = false;
  const pendingFiles = new Map(); // token -> file text awaiting a passphrase

  function loadCfg() {
    let c;
    try { c = Object.assign(defaults(), JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'))); } catch (_) { c = defaults(); }
    // older single switch: "auto" off meant no automatic backups of any kind
    if (c.auto === false) { c.onChange = false; c.onClose = false; c.schedule = Object.assign({}, c.schedule, { mode: 'off' }); }
    delete c.auto;
    delete c.keep; // retention is now a fixed week (core.KEEP_DAYS) for every destination
    c.schedule = Object.assign(defaults().schedule, c.schedule || {});
    // start the schedule clock now rather than firing straight away on first run
    if (!c.lastScheduledAt) c.lastScheduledAt = new Date().toISOString();
    return c;
  }
  function saveCfg() {
    fs.mkdirSync(path.dirname(CFG_FILE), { recursive: true });
    fs.writeFileSync(CFG_FILE + '.tmp', JSON.stringify(cfg, null, 2), 'utf8');
    fs.renameSync(CFG_FILE + '.tmp', CFG_FILE);
  }
  // secrets (refresh token, passphrase) are sealed with the OS keychain when available
  function seal(s) {
    if (safeStorage.isEncryptionAvailable()) return { v: safeStorage.encryptString(s).toString('base64'), safe: true };
    return { v: Buffer.from(s, 'utf8').toString('base64'), safe: false };
  }
  function unseal(o) {
    if (!o) return null;
    try { return o.safe ? safeStorage.decryptString(Buffer.from(o.v, 'base64')) : Buffer.from(o.v, 'base64').toString('utf8'); } catch (_) { return null; }
  }
  const meta = reason => ({ appVersion: app.getVersion(), platform: 'desktop-' + process.platform, deviceId: cfg.deviceId, deviceName: cfg.deviceName, reason });
  const hasDest = () => !!(cfg.folder || cfg.gdrive);

  // ---------- Google ----------
  function googleConfig() {
    const env = process.env.TIMELEDGER_GOOGLE_CLIENT_ID ? { client_id: process.env.TIMELEDGER_GOOGLE_CLIENT_ID, client_secret: process.env.TIMELEDGER_GOOGLE_CLIENT_SECRET || '' } : null;
    if (env) return env;
    for (const f of [path.join(app.getPath('userData'), 'google-oauth.json'), path.join(__dirname, 'google-oauth.json')]) {
      try {
        const j = JSON.parse(fs.readFileSync(f, 'utf8'));
        const c = j.installed || j; // accepts the JSON Google Cloud Console downloads
        if (c.client_id) return { client_id: c.client_id, client_secret: c.client_secret || '' };
      } catch (_) { /* try next */ }
    }
    return null;
  }
  async function getToken() {
    if (access && access.exp > Date.now()) return access.token;
    const g = googleConfig(); const rt = cfg.gdrive && unseal(cfg.gdrive.token);
    if (!g || !rt) throw new core.BackupError('AUTH', 'Sign in to Google again');
    try {
      const t = await core.tokenRequest({ client_id: g.client_id, client_secret: g.client_secret, refresh_token: rt, grant_type: 'refresh_token' });
      access = { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
      if (cfg.gdrive.needsReconnect) { cfg.gdrive.needsReconnect = false; saveCfg(); }
      return access.token;
    } catch (e) {
      if (e.code === 'AUTH') { cfg.gdrive.needsReconnect = true; saveCfg(); }
      throw e;
    }
  }
  const drive = () => core.createDrive({ getToken });

  function connectGoogle() {
    const g = googleConfig();
    if (!g) return Promise.reject(new core.BackupError('NOT_CONFIGURED', 'Google sign-in is not set up in this copy of TimeLedger'));
    const p = core.pkce();
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (err, val) => { if (done) return; done = true; clearTimeout(to); server.close(); err ? reject(err) : resolve(val); };
      const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;display:grid;place-items:center;height:90vh;color:#222"><div style="text-align:center"><h2>${title}</h2><p>${body}</p></div>`;
      const server = http.createServer(async (req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname !== '/') { res.writeHead(404); return res.end(); }
        if (u.searchParams.get('state') !== p.state) { res.writeHead(400, { 'Content-Type': 'text/html' }); return res.end(page('Sign-in failed', 'Please try again from TimeLedger.')); }
        const err = u.searchParams.get('error');
        if (err) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page('Sign-in cancelled', 'You can close this tab and return to TimeLedger.')); return finish(new core.BackupError('CANCELLED', err === 'access_denied' ? 'Google sign-in was cancelled' : 'Google sign-in: ' + err)); }
        try {
          const redirect = `http://127.0.0.1:${server.address().port}`;
          const t = await core.tokenRequest({ code: u.searchParams.get('code'), client_id: g.client_id, client_secret: g.client_secret, code_verifier: p.verifier, redirect_uri: redirect, grant_type: 'authorization_code' });
          if (!t.refresh_token) throw new core.BackupError('OAUTH', 'Google did not return a refresh token');
          access = { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
          cfg.gdrive = { email: core.emailFromIdToken(t.id_token), token: seal(t.refresh_token), folderId: null, last: null };
          cfg.gdrive.folderId = await drive().ensureFolder();
          saveCfg();
          res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page('TimeLedger is connected to Google Drive', 'Backups will be saved to the “' + SUB + '” folder in your Drive. You can close this tab.'));
          if (getWin()) { const w = getWin(); if (w.isMinimized()) w.restore(); w.focus(); }
          finish(null, { email: cfg.gdrive.email });
        } catch (e) { res.writeHead(500, { 'Content-Type': 'text/html' }); res.end(page('Sign-in failed', String(e.message || e))); finish(e); }
      });
      const to = setTimeout(() => finish(new core.BackupError('TIMEOUT', 'Google sign-in timed out')), 5 * 60 * 1000);
      server.listen(0, '127.0.0.1', () => shell.openExternal(core.authUrl(g.client_id, `http://127.0.0.1:${server.address().port}`, p)));
    });
  }
  async function disconnectGoogle() {
    const rt = cfg.gdrive && unseal(cfg.gdrive.token);
    if (rt) { try { await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(rt), { method: 'POST' }); } catch (_) { /* offline: forget locally anyway */ } }
    cfg.gdrive = null; access = null; saveCfg();
  }

  // ---------- folders ----------
  function suggestFolders() {
    const home = os.homedir();
    const c = [
      ['OneDrive', process.env.OneDrive || process.env.OneDriveConsumer || process.env.OneDriveCommercial || path.join(home, 'OneDrive')],
      ['Dropbox', path.join(home, 'Dropbox')],
      ['iCloud Drive', process.platform === 'darwin' ? path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs') : path.join(home, 'iCloudDrive')],
      ['Google Drive (desktop app)', process.platform === 'win32' ? 'G:\\My Drive' : path.join(home, 'Google Drive', 'My Drive')],
      ['Documents', app.getPath('documents')],
    ];
    const seen = new Set();
    return c.filter(([, p]) => { try { if (!p || seen.has(p) || !fs.statSync(p).isDirectory()) return false; seen.add(p); return true; } catch (_) { return false; } }).map(([label, p]) => ({ label, path: p }));
  }
  function useFolder(dir) {
    const target = path.basename(dir) === SUB ? dir : path.join(dir, SUB);
    fs.mkdirSync(target, { recursive: true });
    const probe = path.join(target, '.timeledger-write-test');
    fs.writeFileSync(probe, 'ok'); fs.unlinkSync(probe);
    cfg.folder = { path: target, last: null }; saveCfg();
    return target;
  }
  /** Only plain file names we created may be read from a folder (no paths from the renderer). */
  function safeName(name, allowDaily) {
    if (typeof name !== 'string' || name !== path.basename(name)) return false;
    return core.NAME_RE.test(name) || (allowDaily && LOCAL_DAILY_RE.test(name));
  }
  function writeAtomic(file, text) { fs.writeFileSync(file + '.tmp', text, 'utf8'); fs.renameSync(file + '.tmp', file); }
  /** Delete TimeLedger backups older than one week from a folder (the newest one always stays). */
  function pruneFolder(dir) {
    let names = []; try { names = fs.readdirSync(dir); } catch (_) { return; }
    const files = names.filter(n => core.NAME_RE.test(n)).map(name => ({ name }));
    for (const f of core.pruneByAge(files, core.KEEP_DAYS)) { try { fs.unlinkSync(path.join(dir, f.name)); } catch (_) { /* in use / synced */ } }
  }
  function headMeta(file) {
    // envelopes put their header before the data, so the first few KB are enough for a listing
    try {
      const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(4096); const n = fs.readSync(fd, buf, 0, 4096, 0); fs.closeSync(fd);
      const s = buf.slice(0, n).toString('utf8');
      const pick = re => { const m = s.match(re); return m ? m[1] : null; };
      const sum = s.match(/"summary":\{"workspaces":(\d+),"employees":(\d+),"rows":(\d+)\}/);
      return { device: pick(/"deviceName":"((?:[^"\\]|\\.)*)"/), encrypted: pick(/"encrypted":(true|false)/) === 'true', createdAt: pick(/"createdAt":"([^"]+)"/), summary: sum ? { workspaces: +sum[1], employees: +sum[2], rows: +sum[3] } : null, envelope: /"format":"timeledger-backup"/.test(s) };
    } catch (_) { return {}; }
  }

  // ---------- run ----------
  async function runBackup(reason) {
    if (running) return running;
    running = (async () => {
      const results = {};
      let content;
      try { content = fs.readFileSync(dataFile(), 'utf8'); } catch (_) { return { error: 'Nothing to back up yet' }; }
      const pass = cfg.encrypt ? unseal(cfg.passphrase) : null;
      if (cfg.encrypt && !pass) return { error: 'Backup passphrase is missing — set it again in Backup & sync' };
      const env = core.makeEnvelope(content, meta(reason), pass);
      const name = core.backupFileName(new Date(), cfg.deviceName, reason);
      const sum = core.summarize(JSON.parse(content));
      if (cfg.folder) {
        try { fs.mkdirSync(cfg.folder.path, { recursive: true }); writeAtomic(path.join(cfg.folder.path, name), env); pruneFolder(cfg.folder.path); cfg.folder.last = { at: new Date().toISOString(), ok: true, name }; }
        catch (e) { cfg.folder.last = { at: new Date().toISOString(), ok: false, error: String(e.message || e) }; }
        results.folder = cfg.folder.last;
      }
      if (cfg.gdrive) {
        try {
          const d = drive();
          cfg.gdrive.folderId = await d.ensureFolder(cfg.gdrive.folderId);
          await d.upload(cfg.gdrive.folderId, name, env, { app: 'timeledger', formatVersion: String(core.FORMAT_VERSION), device: cfg.deviceName.slice(0, 60), deviceId: cfg.deviceId, reason, encrypted: String(!!pass), workspaces: String(sum.workspaces), employees: String(sum.employees), rows: String(sum.rows) });
          // one week of backups in Drive; older ones are removed after each successful upload
          const files = (await d.list(cfg.gdrive.folderId)).map(f => ({ id: f.id, name: f.name, time: Date.parse(f.createdTime) }));
          for (const f of core.pruneByAge(files, core.KEEP_DAYS)) { try { await d.remove(f.id); } catch (_) { /* next time */ } }
          cfg.gdrive.last = { at: new Date().toISOString(), ok: true, name };
        } catch (e) { cfg.gdrive.last = { at: new Date().toISOString(), ok: false, error: String(e.message || e), auth: e.code === 'AUTH' }; }
        results.gdrive = cfg.gdrive.last;
      }
      if (Object.values(results).some(r => r.ok)) { dirty = false; cfg.lastAutoAt = new Date().toISOString(); }
      saveCfg();
      return results;
    })();
    try { return await running; } finally { running = null; notify(); }
  }
  function onDataSaved() {
    dirty = true;
    if (!cfg.onChange || !hasDest()) return;
    clearTimeout(timer);
    // waits for a quiet moment, so a burst of edits makes one backup
    timer = setTimeout(() => runBackup('auto'), Math.max(0.5, cfg.delayMin) * 60 * 1000);
  }

  // ---------- list / fetch ----------
  async function list() {
    const items = [], errors = {};
    const addDir = (dir, source, allowDaily) => {
      let names = []; try { names = fs.readdirSync(dir); } catch (_) { return; }
      for (const name of names) {
        if (!safeName(name, allowDaily)) continue;
        let st; try { st = fs.statSync(path.join(dir, name)); } catch (_) { continue; }
        const h = headMeta(path.join(dir, name));
        items.push({ source, id: name, name, time: core.timeFromName(name) || st.mtimeMs, size: st.size, device: h.device || (LOCAL_DAILY_RE.test(name) ? cfg.deviceName : ''), encrypted: !!h.encrypted, summary: h.summary, reason: /_before-restore/.test(name) ? 'before-restore' : LOCAL_DAILY_RE.test(name) ? 'daily' : '' });
      }
    };
    addDir(localDir(), 'local', true);
    if (cfg.folder) addDir(cfg.folder.path, 'folder', false);
    if (cfg.gdrive) {
      try {
        const d = drive(); cfg.gdrive.folderId = await d.ensureFolder(cfg.gdrive.folderId);
        for (const f of await d.list(cfg.gdrive.folderId)) {
          const a = f.appProperties || {};
          items.push({ source: 'gdrive', id: f.id, name: f.name, time: Date.parse(f.createdTime), size: +f.size || 0, device: a.device || '', encrypted: a.encrypted === 'true', summary: a.employees ? { workspaces: +a.workspaces || 1, employees: +a.employees, rows: +a.rows } : null, reason: a.reason || '' });
        }
      } catch (e) { errors.gdrive = String(e.message || e); }
    }
    items.sort((a, b) => b.time - a.time);
    return { items, errors };
  }
  function decode(text, passphrase) {
    try {
      const r = core.openEnvelope(text, passphrase || (cfg.encrypt ? unseal(cfg.passphrase) : null));
      return { ok: true, data: r.data, meta: r.meta };
    } catch (e) {
      if (e.code === 'NEEDS_PASSPHRASE' || e.code === 'BAD_PASSPHRASE') {
        // keep the text so the renderer can retry with a passphrase without picking the file again
        const token = crypto.randomUUID(); pendingFiles.set(token, text); setTimeout(() => pendingFiles.delete(token), 10 * 60 * 1000);
        // without a typed passphrase the user hasn't got anything wrong yet — just ask (even if our stored one didn't fit)
        return { ok: false, code: passphrase ? 'BAD_PASSPHRASE' : 'NEEDS_PASSPHRASE', token, message: passphrase ? e.message : 'This backup is encrypted with a passphrase' };
      }
      return { ok: false, code: e.code || 'ERROR', message: e.message };
    }
  }
  async function fetchBackup(source, id) {
    let text;
    if (source === 'local' && safeName(id, true)) text = fs.readFileSync(path.join(localDir(), id), 'utf8');
    else if (source === 'folder' && cfg.folder && safeName(id, false)) text = fs.readFileSync(path.join(cfg.folder.path, id), 'utf8');
    else if (source === 'gdrive' && cfg.gdrive && /^[\w-]+$/.test(id)) text = await drive().download(id);
    else return { ok: false, code: 'NOT_FOUND', message: 'Backup not found' };
    return decode(text);
  }
  /** A copy of the current data, taken just before a restore replaces it. */
  function safetyCopy() {
    try {
      const content = fs.readFileSync(dataFile(), 'utf8');
      fs.mkdirSync(localDir(), { recursive: true });
      writeAtomic(path.join(localDir(), core.backupFileName(new Date(), cfg.deviceName, 'before-restore')), core.makeEnvelope(content, meta('before-restore')));
      pruneFolder(localDir());
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  }

  // ---------- status / IPC ----------
  function status() {
    const lasts = [cfg.folder && cfg.folder.last, cfg.gdrive && cfg.gdrive.last].filter(Boolean);
    const okAt = lasts.filter(l => l.ok).map(l => l.at).sort().pop() || null;
    return {
      deviceName: cfg.deviceName, onChange: cfg.onChange, delayMin: cfg.delayMin, onClose: cfg.onClose, schedule: cfg.schedule,
      nextScheduledAt: hasDest() && core.scheduleState(cfg.schedule, cfg.lastScheduledAt).next ? core.scheduleState(cfg.schedule, cfg.lastScheduledAt).next.toISOString() : null,
      keepDays: core.KEEP_DAYS, encrypt: cfg.encrypt, keychain: safeStorage.isEncryptionAvailable(),
      google: { configured: !!googleConfig(), connected: !!cfg.gdrive, email: cfg.gdrive ? cfg.gdrive.email : '', last: cfg.gdrive ? cfg.gdrive.last : null, needsReconnect: !!(cfg.gdrive && cfg.gdrive.needsReconnect) },
      folder: cfg.folder ? { path: cfg.folder.path, last: cfg.folder.last } : null,
      local: { path: localDir() }, lastOkAt: okAt, failing: lasts.some(l => !l.ok), destinations: hasDest(), dirty, running: !!running,
    };
  }
  function notify() { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('backup:status', status()); }
  const wrap = fn => async (_e, ...a) => { try { const r = await fn(...a); return Object.assign({ ok: true }, r && typeof r === 'object' && !Array.isArray(r) ? r : { value: r }); } catch (e) { return { ok: false, code: e.code || 'ERROR', error: String(e.message || e) }; } };

  ipcMain.handle('backup:status', wrap(() => status()));
  ipcMain.handle('backup:set', wrap(p => {
    if (p.onChange != null) cfg.onChange = !!p.onChange;
    if (p.onClose != null) cfg.onClose = !!p.onClose;
    if (p.delayMin != null) cfg.delayMin = Math.min(120, Math.max(0.5, +p.delayMin || 5));
    if (p.schedule) {
      const sc = Object.assign({}, cfg.schedule);
      if (['off', 'daily', 'every'].includes(p.schedule.mode)) sc.mode = p.schedule.mode;
      if (/^\d{2}:\d{2}$/.test(p.schedule.time || '')) sc.time = p.schedule.time;
      if (p.schedule.everyHours != null) sc.everyHours = Math.min(24, Math.max(1, Math.round(+p.schedule.everyHours) || 4));
      cfg.schedule = sc;
      cfg.lastScheduledAt = new Date().toISOString(); // a new time counts from now, not from a slot already passed today
    }
    if (p.deviceName != null) cfg.deviceName = String(p.deviceName).trim().slice(0, 60) || os.hostname();
    saveCfg(); notify(); return status();
  }));
  ipcMain.handle('backup:passphrase', wrap(pass => {
    if (pass) { if (String(pass).length < 8) throw new core.BackupError('WEAK', 'Use at least 8 characters'); cfg.passphrase = seal(String(pass)); cfg.encrypt = true; }
    else { cfg.passphrase = null; cfg.encrypt = false; }
    saveCfg(); notify(); return status();
  }));
  ipcMain.handle('backup:suggest-folders', wrap(() => ({ folders: suggestFolders() })));
  ipcMain.handle('backup:choose-folder', wrap(async () => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Choose where to keep backups', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    const p = useFolder(r.filePaths[0]); notify(); return { path: p };
  }));
  ipcMain.handle('backup:use-folder', wrap(dir => {
    if (!suggestFolders().some(f => f.path === dir)) throw new core.BackupError('NOT_FOUND', 'Folder not available');
    const p = useFolder(dir); notify(); return { path: p };
  }));
  ipcMain.handle('backup:remove-folder', wrap(() => { cfg.folder = null; saveCfg(); notify(); }));
  ipcMain.handle('backup:open-folder', wrap(which => shell.openPath(which === 'folder' && cfg.folder ? cfg.folder.path : localDir())));
  ipcMain.handle('backup:google-connect', wrap(async () => { const r = await connectGoogle(); notify(); runBackup('first'); return r; }));
  ipcMain.handle('backup:google-disconnect', wrap(async () => { await disconnectGoogle(); notify(); }));
  ipcMain.handle('backup:run', wrap(async () => {
    if (!hasDest()) throw new core.BackupError('NO_DEST', 'Choose Google Drive or a folder first');
    return { results: await runBackup('manual') };
  }));
  ipcMain.handle('backup:list', wrap(list));
  ipcMain.handle('backup:fetch', wrap((source, id) => fetchBackup(source, id)));
  ipcMain.handle('backup:decode', wrap((token, passphrase) => {
    const text = pendingFiles.get(token);
    if (!text) throw new core.BackupError('EXPIRED', 'Open the backup again');
    const r = decode(text, passphrase);
    if (r.ok) pendingFiles.delete(token);
    return r;
  }));
  ipcMain.handle('backup:safety', wrap(() => safetyCopy()));
  ipcMain.handle('backup:export-file', wrap(async () => {
    let content; try { content = fs.readFileSync(dataFile(), 'utf8'); } catch (_) { throw new core.BackupError('EMPTY', 'Nothing to back up yet'); }
    const pass = cfg.encrypt ? unseal(cfg.passphrase) : null;
    const r = await dialog.showSaveDialog(getWin(), { defaultPath: core.backupFileName(new Date(), cfg.deviceName, 'manual'), filters: [{ name: 'TimeLedger backup', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    fs.writeFileSync(r.filePath, core.makeEnvelope(content, meta('manual'), pass), 'utf8');
    return { path: r.filePath, encrypted: !!pass };
  }));
  ipcMain.handle('backup:import-file', wrap(async () => {
    const r = await dialog.showOpenDialog(getWin(), { properties: ['openFile'], filters: [{ name: 'TimeLedger backup', extensions: ['json'] }, { name: 'All files', extensions: ['*'] }] });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    return Object.assign({ fileName: path.basename(r.filePaths[0]) }, decode(fs.readFileSync(r.filePaths[0], 'utf8')));
  }));

  // scheduled backups: checked every minute, so sleep, clock changes and missed slots (app closed) are all caught
  function checkSchedule() {
    if (!hasDest()) return;
    if (!core.scheduleState(cfg.schedule, cfg.lastScheduledAt).due) return;
    cfg.lastScheduledAt = new Date().toISOString(); saveCfg();
    runBackup('scheduled');
  }
  setTimeout(() => {
    // tidy backups older than a week on this computer and in the folder (Drive is tidied after its next upload)
    pruneFolder(localDir());
    if (cfg.folder) pruneFolder(cfg.folder.path);
    checkSchedule();
  }, 20 * 1000);
  setInterval(checkSchedule, 60 * 1000);
  // last chance: back up unsent changes when the app closes (bounded so quitting never hangs)
  app.on('before-quit', e => {
    if (quitting || !dirty || !cfg.onClose || !hasDest()) return;
    e.preventDefault(); quitting = true; clearTimeout(timer);
    Promise.race([runBackup('on-close'), new Promise(r => setTimeout(r, 15000))]).finally(() => app.quit());
  });

  return { onDataSaved, status, runBackup };
}

module.exports = { createBackupService };
