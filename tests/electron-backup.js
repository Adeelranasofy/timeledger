// End-to-end check of backups in the real app: folder destination, listing, encryption, restore fetch, safety copy.
// Run: npx electron tests/electron-backup.js   (headless: xvfb-run -a npx electron …)
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'timeledger-backup-'));
const dest = path.join(tmp, 'Cloud', 'TimeLedger Backups');
fs.mkdirSync(path.join(tmp, 'Cloud'), { recursive: true });
app.setPath('userData', tmp);
// pre-configure a folder destination (normally chosen in the UI)
fs.writeFileSync(path.join(tmp, 'backup-config.json'), JSON.stringify({ deviceName: 'Test PC', auto: true, delayMin: 5, keep: 2 /* old setting, migrated away */, folder: { path: dest, last: null } }));
require('../src/main/main.js');
const core = require('../src/main/backup-core.js');

const wait = ms => new Promise(r => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); };
app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    try {
      const js = s => win.webContents.executeJavaScript(s);
      await wait(400);
      await js('__TL.commands["load-sample"]()');
      await wait(1000);
      const st = await js('api.backup.status()');
      check('status sees the folder', st.ok && st.folder && st.folder.path === dest, st);
      check('defaults: after change, before close, daily 18:00 with a next time', st.onChange && st.onClose && st.schedule.mode === 'daily' && st.schedule.time === '18:00' && !!st.nextScheduledAt, st);
      const set1 = await js('api.backup.set({ onClose: false, delayMin: 0.5, schedule: { mode: "every", everyHours: 6 } })');
      const nextH = (Date.parse(set1.nextScheduledAt) - Date.now()) / 3600e3;
      check('settings saved: no close backup, 30 s delay, every 6 h', !set1.onClose && set1.delayMin === 0.5 && set1.schedule.mode === 'every' && nextH > 5.9 && nextH <= 6.01, set1);
      const set2 = await js('api.backup.set({ onClose: true, delayMin: 5, schedule: { mode: "daily", time: "07:30" } })');
      check('daily time saved', set2.schedule.time === '07:30' && new Date(set2.nextScheduledAt).getHours() === 7 && new Date(set2.nextScheduledAt).getMinutes() === 30, set2);
      const cfgFile = JSON.parse(fs.readFileSync(path.join(tmp, 'backup-config.json'), 'utf8'));
      check('old "auto" switch migrated away', !('auto' in cfgFile) && cfgFile.onChange === true, cfgFile);
      const run1 = await js('api.backup.run()');
      check('manual backup to folder', run1.ok && run1.results.folder.ok, run1);
      const files = fs.readdirSync(dest).filter(n => core.NAME_RE.test(n));
      check('backup file written with TimeLedger name', files.length === 1, files);
      const opened = core.openEnvelope(fs.readFileSync(path.join(dest, files[0]), 'utf8'));
      check('file is a valid plain envelope with all data', opened.meta.deviceName === 'Test PC' && opened.data.employees.length === 3 && opened.data.workspaces.length === 2, opened.meta);
      // encryption
      const pw = await js('api.backup.setPassphrase("correct horse battery")');
      check('passphrase accepted', pw.ok && pw.encrypt, pw);
      const weak = await js('api.backup.setPassphrase("short")');
      check('short passphrase refused', !weak.ok, weak);
      await wait(1100); // distinct timestamp in the file name
      const run2 = await js('api.backup.run()');
      const files2 = fs.readdirSync(dest).filter(n => core.NAME_RE.test(n)).sort();
      const encText = fs.readFileSync(path.join(dest, files2[files2.length - 1]), 'utf8');
      check('encrypted backup hides names', run2.ok && JSON.parse(encText).encrypted === true && !encText.includes('Ayesha'), files2);
      // retention: one week. Plant two old backups and a file that isn't ours
      const day = 24 * 3600 * 1000;
      const oldNames = [8, 30].map(n => core.backupFileName(new Date(Date.now() - n * day), 'Old PC', 'auto'));
      for (const n of oldNames) fs.writeFileSync(path.join(dest, n), core.makeEnvelope(opened.data, { deviceName: 'Old PC' }));
      fs.writeFileSync(path.join(dest, 'notes.json'), '{}');
      const sixDays = core.backupFileName(new Date(Date.now() - 6 * day), 'Old PC', 'auto');
      fs.writeFileSync(path.join(dest, sixDays), core.makeEnvelope(opened.data, { deviceName: 'Old PC' }));
      await wait(1100); await js('api.backup.run()');
      const left = fs.readdirSync(dest);
      check('retention: older than a week deleted, this week kept, other files untouched',
        oldNames.every(n => !left.includes(n)) && left.includes(sixDays) && left.includes('notes.json') && left.filter(n => core.NAME_RE.test(n)).length === 4, left);
      fs.unlinkSync(path.join(dest, sixDays));
      const st3 = await js('api.backup.status()');
      check('status reports the 7-day rule', st3.keepDays === 7 && !('keep' in st3), st3.keepDays);
      // listing + fetching (uses the stored passphrase)
      const list = await js('api.backup.list()');
      const inFolder = list.items.filter(i => i.source === 'folder');
      const daily = list.items.filter(i => i.source === 'local');
      check('list shows folder and daily local copies', list.ok && inFolder.length === 3 && daily.length >= 1 && inFolder[0].encrypted, list.items.map(i => [i.source, i.name, i.encrypted]));
      const got = await js(`api.backup.fetch('folder', ${JSON.stringify(inFolder[0].id)})`);
      check('fetch decrypts with stored passphrase', got.ok && got.data.employees.length === 3, got.code);
      const badPath = await js(`api.backup.fetch('folder', '..\\\\backup-config.json')`);
      check('path tricks are refused', !badPath.ok, badPath);
      // file with a different passphrase -> asks, then decodes
      fs.writeFileSync(path.join(dest, core.backupFileName(new Date(2020, 0, 1), 'Other', 'manual')), core.makeEnvelope(opened.data, { deviceName: 'Other' }, 'another secret'));
      const other = await js(`api.backup.fetch('folder', ${JSON.stringify(core.backupFileName(new Date(2020, 0, 1), 'Other', 'manual'))})`);
      check('different passphrase -> asks for it', !other.ok && other.code === 'NEEDS_PASSPHRASE' && other.token, other);
      const wrong = await js(`api.backup.decode(${JSON.stringify(other.token)}, 'nope')`);
      check('wrong typed passphrase is reported', !wrong.ok && wrong.code === 'BAD_PASSPHRASE', wrong);
      const decoded = await js(`api.backup.decode(${JSON.stringify(other.token)}, 'another secret')`);
      check('decode with the right passphrase', decoded.ok && decoded.data.employees.length === 3);
      // safety copy before restore
      const safe = await js('api.backup.safety()');
      const safeFiles = fs.readdirSync(path.join(tmp, 'backups')).filter(n => /_before-restore\.json$/.test(n));
      check('safety copy written', safe.ok && safeFiles.length === 1, safeFiles);
      // auto backup timer is armed by saves
      const st2 = await js('api.backup.status()');
      check('status reports last good backup', st2.lastOkAt && !st2.failing, st2);
      const ok = checks.every(c => c.ok);
      for (const c of checks) console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.ok ? '' : ' ' + JSON.stringify(c.detail)));
      console.log(ok ? 'ALL BACKUP CHECKS PASSED' : 'SOME CHECKS FAILED');
      app.exit(ok ? 0 : 1);
    } catch (e) { console.error('BACKUP TEST FAIL', e); app.exit(1); }
  });
});
