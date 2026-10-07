const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/main/backup-core.js');

const data = {
  version: 2, settings: { currencyCode: 'PKR' },
  workspaces: [{ id: 'w1', name: 'Main' }, { id: 'w2', name: 'Café' }],
  employees: [{ id: 'e1', name: 'Ayesha', workspaces: { w1: { hourlyRate: 650 }, w2: { hourlyRate: 800 } } }],
  rows: { w1: { e1: [{ id: 'd1', type: 'day', date: '2026-09-01', in: '09:00', out: '17:00' }] }, w2: { e1: [{ id: 'd2', type: 'day', date: '2026-09-05' }, { id: 'p1', type: 'payment', date: '2026-09-07', amount: 100 }] } },
  ui: {},
};
const meta = { appVersion: '1.1.0', platform: 'desktop-win32', deviceId: 'dev1', deviceName: 'Office PC', reason: 'auto' };

test('plain envelope round-trips and describes itself', () => {
  const text = B.makeEnvelope(data, meta);
  const o = JSON.parse(text);
  assert.equal(o.format, 'timeledger-backup');
  assert.equal(o.formatVersion, 1);
  assert.equal(o.schemaVersion, 2);
  assert.deepEqual(o.summary, { workspaces: 2, employees: 1, rows: 3 });
  assert.match(o.checksum, /^sha256:[0-9a-f]{64}$/);
  const r = B.openEnvelope(text);
  assert.deepEqual(r.data, data);
  assert.equal(r.meta.deviceName, 'Office PC');
  assert.equal(r.meta.data, undefined);
  // pretty-printed or string input gives the same checksum
  assert.equal(JSON.parse(B.makeEnvelope(JSON.stringify(data, null, 2), meta)).checksum, o.checksum);
});

test('encrypted envelope needs the right passphrase and hides the data', () => {
  const text = B.makeEnvelope(data, meta, 'correct horse');
  assert.ok(!text.includes('Ayesha'), 'names are not readable in an encrypted backup');
  const o = JSON.parse(text);
  assert.equal(o.encrypted, true);
  assert.equal(o.encryption.cipher, 'AES-256-GCM');
  assert.deepEqual(o.summary, { workspaces: 2, employees: 1, rows: 3 });
  assert.throws(() => B.openEnvelope(text), e => e.code === 'NEEDS_PASSPHRASE');
  assert.throws(() => B.openEnvelope(text, 'wrong'), e => e.code === 'BAD_PASSPHRASE');
  assert.deepEqual(B.openEnvelope(text, 'correct horse').data, data);
});

test('tampering is detected', () => {
  const o = JSON.parse(B.makeEnvelope(data, meta));
  o.data.employees[0].name = 'Someone else';
  assert.throws(() => B.openEnvelope(JSON.stringify(o)), e => e.code === 'CORRUPT');
  const enc = JSON.parse(B.makeEnvelope(data, meta, 'pw'));
  enc.ciphertext = Buffer.from('x'.repeat(40)).toString('base64');
  assert.throws(() => B.openEnvelope(JSON.stringify(enc), 'pw'), e => e.code === 'BAD_PASSPHRASE');
});

test('older exports and raw data files still open; junk does not', () => {
  const legacy = JSON.stringify(Object.assign({ exportedAt: '2026-09-01T10:00:00Z', app: 'TimeLedger' }, data));
  const r = B.openEnvelope(legacy);
  assert.equal(r.meta.legacy, true);
  assert.equal(r.data.exportedAt, undefined);
  assert.deepEqual(r.data.employees, data.employees);
  assert.equal(B.openEnvelope(JSON.stringify({ version: 1, employees: [], rows: {} })).meta.legacy, true);
  assert.throws(() => B.openEnvelope('not json'), e => e.code === 'NOT_BACKUP');
  assert.throws(() => B.openEnvelope('{"hello":1}'), e => e.code === 'NOT_BACKUP');
  assert.throws(() => B.openEnvelope(JSON.stringify({ format: 'timeledger-backup', formatVersion: 99 })), e => e.code === 'TOO_NEW');
});

test('peekMeta reads the header without the passphrase', () => {
  const m = B.peekMeta(B.makeEnvelope(data, meta, 'pw'));
  assert.equal(m.encrypted, true);
  assert.equal(m.ciphertext, undefined);
  assert.equal(B.peekMeta('nope'), null);
});

test('file names and retention only touch TimeLedger backups', () => {
  const name = B.backupFileName(new Date(2026, 9, 1, 14, 5, 9), 'Office PC #2', 'auto');
  assert.equal(name, 'TimeLedger-backup_2026-10-01_140509_Office-PC-2.json');
  assert.ok(B.NAME_RE.test(name));
  assert.equal(B.backupFileName(new Date(2026, 9, 1, 14, 5, 9), '', 'before-restore'), 'TimeLedger-backup_2026-10-01_140509_before-restore.json');
  assert.equal(B.timeFromName(name), new Date(2026, 9, 1, 14, 5, 9).getTime());
  const files = [3, 1, 4, 2, 5].map(d => ({ name: B.backupFileName(new Date(2026, 8, d, 9), 'pc') })).concat([{ name: 'my-taxes.json' }, { name: 'notes.txt' }]);
  const del = B.pruneList(files, 2).map(f => f.name);
  assert.equal(del.length, 3);
  assert.ok(del.every(n => /^TimeLedger-backup_2026-09-0[123]_/.test(n)), JSON.stringify(del));
  assert.deepEqual(B.pruneList(files, 0), []);
});

test('Drive client: folder, upload, list, download, delete against a fake API', async () => {
  const calls = [];
  const store = { folders: [], files: [] };
  const fakeFetch = async (url, opts) => {
    calls.push({ url, method: opts.method, auth: opts.headers.Authorization });
    const u = new URL(url);
    const reply = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)) });
    if (u.pathname === '/drive/v3/files' && opts.method === 'GET' && /mimeType='application\/vnd.google-apps.folder'/.test(u.searchParams.get('q'))) return reply(200, { files: store.folders });
    if (u.pathname === '/drive/v3/files' && opts.method === 'POST') { const f = { id: 'fold1' }; store.folders.push(f); return reply(200, f); }
    if (u.pathname === '/upload/drive/v3/files') {
      const body = opts.body; const metaJson = JSON.parse(body.split('\r\n\r\n')[1].split('\r\n')[0]);
      const content = body.split('\r\n\r\n')[2].split('\r\n--')[0];
      const f = { id: 'f' + (store.files.length + 1), name: metaJson.name, parents: metaJson.parents, appProperties: metaJson.appProperties, content, createdTime: new Date().toISOString(), size: String(content.length) };
      store.files.push(f); return reply(200, { id: f.id, name: f.name });
    }
    if (u.pathname === '/drive/v3/files' && opts.method === 'GET') return reply(200, { files: store.files.map(({ content, ...f }) => f) });
    const m = u.pathname.match(/^\/drive\/v3\/files\/([\w-]+)$/);
    if (m && opts.method === 'GET' && u.searchParams.get('alt') === 'media') return { ok: true, status: 200, text: async () => store.files.find(f => f.id === m[1]).content };
    if (m && opts.method === 'DELETE') { store.files = store.files.filter(f => f.id !== m[1]); return { ok: true, status: 204, text: async () => '' }; }
    if (m && opts.method === 'GET') return reply(404, { error: { message: 'File not found' } });
    return reply(400, { error: { message: 'unexpected ' + url } });
  };
  const drive = B.createDrive({ getToken: async () => 'tok', fetchImpl: fakeFetch, api: 'https://fake.test' });
  const folder = await drive.ensureFolder('stale-id');
  assert.equal(folder, 'fold1');
  assert.equal(await drive.ensureFolder(), 'fold1', 'reuses the existing folder');
  const env = B.makeEnvelope(data, meta);
  await drive.upload(folder, 'TimeLedger-backup_2026-10-01_090000.json', env, { device: 'Office PC' });
  const list = await drive.list(folder);
  assert.equal(list.length, 1);
  assert.equal(list[0].appProperties.device, 'Office PC');
  assert.deepEqual(B.openEnvelope(await drive.download(list[0].id)).data, data);
  await drive.remove(list[0].id);
  assert.equal((await drive.list(folder)).length, 0);
  assert.ok(calls.every(c => c.auth === 'Bearer tok'));
});

test('Drive errors surface Google\'s message; 401 is an auth error', async () => {
  const drive = B.createDrive({ getToken: async () => 't', fetchImpl: async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: 'Invalid Credentials' } }) }) });
  await assert.rejects(drive.list('x'), e => e.code === 'AUTH' && /Invalid Credentials/.test(e.message));
});

test('OAuth helpers: PKCE challenge and auth URL', () => {
  const p = B.pkce();
  const crypto = require('crypto');
  assert.equal(p.challenge, crypto.createHash('sha256').update(p.verifier).digest('base64url'));
  const u = new URL(B.authUrl('cid.apps.googleusercontent.com', 'http://127.0.0.1:5555', p));
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:5555');
  assert.match(u.searchParams.get('scope'), /drive\.file/);
  assert.ok(!/auth\/drive(\s|$)/.test(u.searchParams.get('scope')), 'never asks for full Drive access');
  const idt = 'x.' + Buffer.from(JSON.stringify({ email: 'hr@example.com' })).toString('base64url') + '.y';
  assert.equal(B.emailFromIdToken(idt), 'hr@example.com');
});

test('schedule: daily at a time, catch-up after the computer was off, every N hours', () => {
  const at = (d, h, m) => new Date(2026, 9, d, h, m || 0);
  const daily = { mode: 'daily', time: '18:00' };
  // ran yesterday 18:00; now today 10:00 -> not due, next today 18:00
  let s = B.scheduleState(daily, at(1, 18).toISOString(), at(2, 10));
  assert.equal(s.due, false);
  assert.equal(s.next.getTime(), at(2, 18).getTime());
  // now today 18:05 -> due
  assert.equal(B.scheduleState(daily, at(1, 18).toISOString(), at(2, 18, 5)).due, true);
  // computer off for two days -> due once on start
  assert.equal(B.scheduleState(daily, at(1, 18).toISOString(), at(4, 9)).due, true);
  // never ran -> not due (the service sets a baseline instead of firing at once)
  assert.equal(B.scheduleState(daily, null, at(2, 19)).due, false);
  const every = { mode: 'every', everyHours: 4 };
  assert.equal(B.scheduleState(every, at(2, 8).toISOString(), at(2, 11, 59)).due, false);
  assert.equal(B.scheduleState(every, at(2, 8).toISOString(), at(2, 12)).due, true);
  assert.equal(B.scheduleState(every, at(2, 8).toISOString(), at(2, 9)).next.getTime(), at(2, 12).getTime());
  assert.deepEqual(B.scheduleState({ mode: 'off' }, null, at(2, 9)), { due: false, next: null });
});

test('retention: one week, newest always kept, only TimeLedger files', () => {
  const now = new Date(2026, 9, 10, 12).getTime();
  const files = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => ({ name: B.backupFileName(new Date(2026, 9, d, 9), 'pc') })).concat([{ name: 'my-taxes.json' }]);
  const del = B.pruneByAge(files, 7, now).map(f => f.name);
  // cutoff is 03 Oct 12:00: files from 01, 02 and 03 (09:00) go, 04–10 stay
  assert.deepEqual(del.sort(), [1, 2, 3].map(d => B.backupFileName(new Date(2026, 9, d, 9), 'pc')));
  assert.equal(B.KEEP_DAYS, 7);
  // after a long break every file is old: the newest one is still kept
  const old = [1, 2].map(d => ({ name: B.backupFileName(new Date(2026, 5, d, 9), 'pc') }));
  assert.deepEqual(B.pruneByAge(old, 7, now).map(f => f.name), [old[0].name]);
  assert.deepEqual(B.pruneByAge([{ name: 'notes.json' }], 7, now), []);
});
