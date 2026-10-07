// Smoke test for the packaged app: boots the real main process, exercises the
// preload bridge (load/save), and captures a screenshot.
// Run: npx electron tests/electron-smoke.js   (headless: xvfb-run -a npx electron …)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'timeledger-smoke-'));
app.setPath('userData', tmp);
require('../src/main/main.js');

const wait = ms => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    try {
      const js = s => win.webContents.executeJavaScript(s);
      await wait(400);
      const hasApi = await js('!!window.api && typeof window.api.save === "function"');
      await js('__TL.commands["load-sample"]()');
      await wait(1200); // debounce save
      const file = path.join(tmp, 'timeledger-data.json');
      const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
      const backups = fs.existsSync(path.join(tmp, 'backups')) ? fs.readdirSync(path.join(tmp, 'backups')) : [];
      const img = await win.webContents.capturePage();
      const out = process.env.SMOKE_SHOT || path.join(tmp, 'smoke.png');
      fs.writeFileSync(out, img.toPNG());
      const ok = hasApi && saved && saved.employees.length === 3;
      console.log(JSON.stringify({ ok, hasApi, employees: saved && saved.employees.length, backups, screenshot: out }));
      app.exit(ok ? 0 : 1);
    } catch (e) { console.error('SMOKE FAIL', e); app.exit(1); }
  });
});
