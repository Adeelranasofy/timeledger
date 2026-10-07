'use strict';
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme, safeStorage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { createBackupService } = require('./backup-service');

const DATA_DIR = () => app.getPath('userData');
const DATA_FILE = () => path.join(DATA_DIR(), 'timeledger-data.json');
const BACKUP_DIR = () => path.join(DATA_DIR(), 'backups');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'TimeLedger',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14161a' : '#f6f7f9',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // Links open in the user's browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
  buildMenu();
}

function send(cmd) { if (win) win.webContents.send('menu', cmd); }

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Employee…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('new-employee') },
        { label: 'New Workspace…', click: () => send('new-workspace') },
        { label: 'Edit Workspace…', click: () => send('edit-workspace') },
        { type: 'separator' },
        { label: 'Export Current View as CSV…', accelerator: 'CmdOrCtrl+E', click: () => send('export-csv') },
        { label: 'Export HR Summary as CSV…', click: () => send('export-summary') },
        { label: 'Save Period as PDF…', accelerator: 'CmdOrCtrl+P', click: () => send('print') },
        { type: 'separator' },
        { label: 'Backup & Sync…', click: () => send('backup-center') },
        { label: 'Back Up All Data…', click: () => send('backup') },
        { label: 'Restore From Backup…', click: () => send('restore') },
        { label: 'Open Data Folder', click: () => shell.openPath(DATA_DIR()) },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('redo') },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'Entries',
      submenu: [
        { label: 'Check In / Check Out', accelerator: 'CmdOrCtrl+K', click: () => send('clock') },
        { label: 'Start / End Break', accelerator: 'CmdOrCtrl+B', click: () => send('break') },
        { type: 'separator' },
        { label: 'Add Day', accelerator: 'CmdOrCtrl+N', click: () => send('add-day') },
        { label: 'Add Week of Days', click: () => send('add-week') },
        { label: 'Record Payment…', accelerator: 'CmdOrCtrl+Shift+P', click: () => send('add-payment') },
        { label: 'Mark Leave / Holiday…', accelerator: 'CmdOrCtrl+L', click: () => send('add-leave') },
        { label: 'Add Separator Note', click: () => send('add-note') },
        { label: 'Import Old Attendance…', click: () => send('import-attendance') },
        { type: 'separator' },
        { label: 'Sort by Date', click: () => send('sort') },
        { label: 'Verify Calculations', accelerator: 'CmdOrCtrl+Shift+V', click: () => send('verify') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Previous Period', accelerator: 'CmdOrCtrl+[', click: () => send('prev') },
        { label: 'Next Period', accelerator: 'CmdOrCtrl+]', click: () => send('next') },
        { label: 'Today', accelerator: 'CmdOrCtrl+T', click: () => send('today') },
        { label: 'HR Overview', accelerator: 'CmdOrCtrl+0', click: () => send('overview') },
        { type: 'separator' },
        { label: 'Large Table View', accelerator: 'CmdOrCtrl+Shift+L', click: () => send('view-large') },
        { label: 'Full-Screen Table', accelerator: 'CmdOrCtrl+Shift+F', click: () => send('view-full') },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'How Calculations Work', click: () => send('help') },
        { label: 'Keyboard Shortcuts', click: () => send('shortcuts') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- storage ----------

function writeAtomic(file, content) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

let lastDailyBackup = null;
function dailyBackup(content) {
  const today = new Date().toISOString().slice(0, 10);
  if (lastDailyBackup === today) return;
  try {
    fs.mkdirSync(BACKUP_DIR(), { recursive: true });
    const f = path.join(BACKUP_DIR(), 'timeledger-' + today + '.json');
    if (!fs.existsSync(f)) fs.writeFileSync(f, content, 'utf8');
    // keep one week of daily copies (the newest always stays)
    const cutoff = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const files = fs.readdirSync(BACKUP_DIR()).filter(n => /^timeledger-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
    for (const old of files.slice(0, -1)) if (old.slice(11, 21) < cutoff) fs.unlinkSync(path.join(BACKUP_DIR(), old));
    lastDailyBackup = today;
  } catch (e) { console.error('backup failed', e); }
}

ipcMain.handle('data:load', () => {
  try {
    if (!fs.existsSync(DATA_FILE())) return { ok: true, data: null, path: DATA_FILE() };
    const raw = fs.readFileSync(DATA_FILE(), 'utf8');
    return { ok: true, data: JSON.parse(raw), path: DATA_FILE() };
  } catch (e) {
    // Corrupt file: keep it aside and try the newest backup
    try {
      fs.copyFileSync(DATA_FILE(), DATA_FILE() + '.corrupt-' + Date.now());
      const files = fs.existsSync(BACKUP_DIR()) ? fs.readdirSync(BACKUP_DIR()).filter(n => /^timeledger-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort() : [];
      if (files.length) {
        const raw = fs.readFileSync(path.join(BACKUP_DIR(), files[files.length - 1]), 'utf8');
        return { ok: true, data: JSON.parse(raw), recovered: files[files.length - 1], path: DATA_FILE() };
      }
    } catch (_) { /* fall through */ }
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('data:save', (_e, json) => {
  try {
    fs.mkdirSync(DATA_DIR(), { recursive: true });
    writeAtomic(DATA_FILE(), json);
    dailyBackup(json);
    if (backups) backups.onDataSaved();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('file:save', async (_e, { defaultName, content, filters }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try { fs.writeFileSync(r.filePath, content, 'utf8'); return { ok: true, path: r.filePath }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('file:open', async (_e, { filters }) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
  try { return { ok: true, content: fs.readFileSync(r.filePaths[0], 'utf8'), path: r.filePaths[0] }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('file:pdf', async (_e, { defaultName }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try {
    const buf = await win.webContents.printToPDF({ landscape: true, printBackground: true, pageSize: 'A4', margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } });
    fs.writeFileSync(r.filePath, buf);
    shell.openPath(r.filePath);
    return { ok: true, path: r.filePath };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('app:reveal', (_e, p) => { shell.showItemInFolder(p); });
// only share links (WhatsApp, email) and web pages may leave the app
ipcMain.handle('app:open-external', (_e, url) => {
  if (typeof url !== 'string' || !/^(https:\/\/(wa\.me|api\.whatsapp\.com)\/|mailto:)/i.test(url)) return { ok: false };
  shell.openExternal(url); return { ok: true };
});
ipcMain.handle('app:copy', (_e, text) => { clipboard.writeText(String(text)); return { ok: true }; });

let backups = null;

app.whenReady().then(() => {
  backups = createBackupService({ app, ipcMain, dialog, shell, safeStorage, getWin: () => win, dataFile: DATA_FILE, localDir: BACKUP_DIR });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
