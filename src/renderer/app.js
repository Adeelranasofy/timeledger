/* TimeLedger — renderer application */
(function () {
  'use strict';
  const C = window.Calc;
  const api = window.api || null; // null when opened in a plain browser (dev / preview)

  // =====================================================================
  // Utilities
  // =====================================================================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = p => (p || 'r') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const todayISO = () => C.toISO(new Date());
  const nowHM = () => { const d = new Date(); return C.toTimeStr(d.getHours() * 60 + d.getMinutes()); };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dowOf = iso => C.parseISO(iso).getDay();
  function fmtDate(iso, withYear) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return d + ' ' + MONTHS[+m - 1] + (withYear === false ? '' : ' ' + y);
  }
  function fmtRange(a, b) {
    if (!a && !b) return 'All time';
    if (!a) return 'Up to ' + fmtDate(b);
    if (!b) return 'From ' + fmtDate(a);
    if (a.slice(0, 4) === b.slice(0, 4)) return fmtDate(a, false) + ' – ' + fmtDate(b);
    return fmtDate(a) + ' – ' + fmtDate(b);
  }

  const CURRENCIES = [
    { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee', decimals: 0 },
    { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
    { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
    { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
    { code: 'AED', symbol: 'AED', name: 'UAE Dirham', decimals: 2 },
    { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal', decimals: 2 },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
    { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', decimals: 2 },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  ];
  const NUMBER_LOCALES = { 'en-US': '1,234.56', 'de-DE': '1.234,56', 'fr-FR': '1 234,56', 'en-IN': '1,23,456.78' };
  const AVATAR_COLORS = ['#4b50d6', '#0f8a68', '#c2410c', '#0e7490', '#9333ea', '#be185d', '#4d7c0f', '#b45309', '#2563eb', '#475569'];
  const METHODS = ['Cash', 'Bank transfer', 'Mobile wallet', 'Cheque', 'Other'];

  function avatarColor(name) { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
  function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
  function avatar(emp) { return `<span class="avatar" style="background:${avatarColor(emp.name)}">${esc(initials(emp.name))}</span>`; }

  const I = {
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    grip: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    dots: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    cash: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    note: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12h16M4 6h10M4 18h7"/></svg>',
    sort: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M4 17l3 3 3-3M14 6h7M14 12h5M14 18h3"/></svg>',
    shield: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    expand: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
    shrink: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    mail: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    wa: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 9.5c.3 2 2.5 4.2 4.5 4.6l1.1-1.1 1.9.9c-.2 1-1 1.7-2 1.7-3.4-.3-6.2-3.1-6.5-6.5 0-1 .7-1.8 1.7-2l.9 1.9z"/></svg>',
    share: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7 9l5-5 5 5M5 20h14"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    print: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>',
    arrowIn: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>',
    arrowOut: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    coffee: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7v4a4 4 0 0 0 4 4h12M16 11l4 4-4 4"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    leave: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    group: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M8 9h8M8 15h5"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10l4 4 4-4"/></svg>',  };

  // =====================================================================
  // Data & persistence
  // =====================================================================
  const DEFAULT_SETTINGS = {
    currencyCode: 'PKR', currencySymbol: 'Rs', decimals: 0, symbolAfter: false, numberLocale: 'en-US',
    weekStart: 1, workDays: [1, 2, 3, 4, 5], defaultIn: '09:00', defaultOut: '17:00', defaultBreak: 60,
    hoursDisplay: 'both', theme: 'system', showRate: true, timeFormat: '24',
  };
  const ROW_TYPES = ['day', 'payment', 'note', 'leave'];
  /*
   * data (version 2):
   *   workspaces[]  { id, name, details, createdAt }
   *   employees[]   { id, name, createdAt, workspaces: { [wsId]: { role, hourlyRate, openingBalance, openingNote } } }
   *   rows          { [wsId]: { [empId]: row[] } }   — each employee has a separate ledger per workspace
   *   groups        { [wsId]: { [empId]: group[] } } — pay groups: { id, from, to, label, add[], remove[], collapsed }
   */
  let data = null;
  let dataPath = '';
  const ui = { view: 'employee', filter: 'all', search: '', ovScope: 'ws' };

  const newWorkspace = (name, details) => ({ id: uid('w'), name: name || 'My workspace', details: details || '', createdAt: new Date().toISOString() });
  function blankData() {
    const ws = newWorkspace('My workspace');
    return { version: 2, settings: { ...DEFAULT_SETTINGS }, workspaces: [ws], employees: [], rows: { [ws.id]: {} }, groups: { [ws.id]: {} }, ui: { periodMode: 'week', anchor: todayISO(), subtotals: true, activeEmployeeId: null, activeWorkspaceId: ws.id, custom: { start: '', end: '' } } };
  }
  function normalize(d) {
    const b = blankData();
    d = d && typeof d === 'object' ? d : b;
    d.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
    delete d.settings.hoursFormat; // replaced by hoursDisplay ('both' | 'hm' | 'decimal')
    d.employees = Array.isArray(d.employees) ? d.employees : [];
    d.rows = d.rows && typeof d.rows === 'object' ? d.rows : {};
    d.ui = Object.assign({}, b.ui, d.ui || {});
    if (!(d.version >= 2) || !Array.isArray(d.workspaces)) {
      // v1 → v2: everything moves into one workspace; rate & opening balance become that workspace's values
      const ws = newWorkspace('Main workspace');
      const old = d.rows;
      d.workspaces = [ws]; d.rows = { [ws.id]: {} };
      for (const e of d.employees) {
        e.workspaces = { [ws.id]: { role: e.role || '', hourlyRate: C.num(e.hourlyRate), openingBalance: e.openingBalance || 0, openingNote: e.openingNote || '' } };
        d.rows[ws.id][e.id] = Array.isArray(old[e.id]) ? old[e.id] : [];
        delete e.role; delete e.hourlyRate; delete e.openingBalance; delete e.openingNote;
      }
      d.ui.activeWorkspaceId = ws.id;
    }
    d.version = 2;
    d.workspaces = d.workspaces.filter(w => w && w.id);
    if (!d.workspaces.length) d.workspaces.push(newWorkspace('My workspace'));
    const wsIds = new Set(d.workspaces.map(w => w.id));
    for (const k of Object.keys(d.rows)) if (!wsIds.has(k) || !d.rows[k] || typeof d.rows[k] !== 'object') delete d.rows[k];
    for (const w of d.workspaces) { w.name = w.name || 'Workspace'; w.details = w.details || ''; d.rows[w.id] = d.rows[w.id] || {}; }
    for (const e of d.employees) {
      e.workspaces = e.workspaces && typeof e.workspaces === 'object' ? e.workspaces : {};
      for (const k of Object.keys(e.workspaces)) {
        if (!wsIds.has(k)) { delete e.workspaces[k]; continue; }
        e.workspaces[k].hourlyRate = C.num(e.workspaces[k].hourlyRate);
        if (!Array.isArray(d.rows[k][e.id])) d.rows[k][e.id] = [];
      }
    }
    for (const w of Object.values(d.rows)) for (const k of Object.keys(w)) w[k] = (Array.isArray(w[k]) ? w[k] : []).filter(r => r && r.id && ROW_TYPES.includes(r.type));
    d.groups = d.groups && typeof d.groups === 'object' ? d.groups : {};
    for (const k of Object.keys(d.groups)) if (!wsIds.has(k) || !d.groups[k] || typeof d.groups[k] !== 'object') delete d.groups[k];
    for (const w of d.workspaces) d.groups[w.id] = d.groups[w.id] || {};
    const isISO = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
    for (const w of Object.values(d.groups)) for (const k of Object.keys(w)) {
      w[k] = (Array.isArray(w[k]) ? w[k] : []).filter(g => g && g.id && isISO(g.from) && isISO(g.to) && g.from <= g.to);
      for (const g of w[k]) { g.add = Array.isArray(g.add) ? g.add : []; g.remove = Array.isArray(g.remove) ? g.remove : []; g.label = g.label || ''; }
    }
    if (!wsIds.has(d.ui.activeWorkspaceId)) d.ui.activeWorkspaceId = d.workspaces[0].id;
    return d;
  }

  const S = () => data.settings;
  const dec = () => S().decimals;

  let saveTimer = null;
  function setSaveStatus(state, txt) {
    const el = $('#save-status');
    el.className = 'save-status ' + state;
    $('.txt', el).textContent = txt;
  }
  function scheduleSave() {
    setSaveStatus('saving', 'Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 350);
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    const json = JSON.stringify(data);
    try {
      if (api) {
        const r = await api.save(json);
        if (!r.ok) throw new Error(r.error);
      } else {
        localStorage.setItem('timeledger-data', json);
      }
      const d = new Date();
      setSaveStatus('', 'Saved ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
    } catch (e) {
      setSaveStatus('error', 'Not saved — ' + (e.message || e));
      toast('Could not save: ' + (e.message || e), { error: true });
    }
  }
  async function loadData() {
    if (api) {
      const r = await api.load();
      if (!r.ok) { toast('Could not read data file: ' + r.error, { error: true }); return blankData(); }
      dataPath = r.path || '';
      if (r.recovered) setTimeout(() => toast('Data file was damaged — restored from backup ' + r.recovered), 400);
      return r.data ? normalize(r.data) : null;
    }
    try { const raw = localStorage.getItem('timeledger-data'); return raw ? normalize(JSON.parse(raw)) : null; }
    catch (_) { return null; }
  }

  // ---------- undo / redo ----------
  const undoStack = [], redoStack = [];
  const snapshot = () => JSON.stringify({ settings: data.settings, workspaces: data.workspaces, employees: data.employees, rows: data.rows, groups: data.groups });
  function restoreSnap(s) { const o = JSON.parse(s); data.settings = o.settings; data.workspaces = o.workspaces; data.employees = o.employees; data.rows = o.rows; data.groups = o.groups || {}; nfCache = {}; }
  /** Every change to records goes through here: snapshot → change → save → render */
  function mutate(fn, opts) {
    const before = snapshot();
    const result = fn();
    if (result === false) return false;
    undoStack.push(before); if (undoStack.length > 150) undoStack.shift();
    redoStack.length = 0;
    scheduleSave();
    if (!opts || opts.render !== false) { if (deferRender) requestRender(); else render(); }
    return result;
  }
  // Cell edits commit during blur; re-render once focus has settled on the next field
  let deferRender = false, renderQueued = false;
  function requestRender() { if (renderQueued) return; renderQueued = true; setTimeout(() => { renderQueued = false; render(); }, 0); }
  function undo() {
    if (!undoStack.length) return toast('Nothing to undo');
    redoStack.push(snapshot()); restoreSnap(undoStack.pop()); fixActive(); scheduleSave(); render(); toast('Undone');
  }
  function redo() {
    if (!redoStack.length) return toast('Nothing to redo');
    undoStack.push(snapshot()); restoreSnap(redoStack.pop()); fixActive(); scheduleSave(); render(); toast('Redone');
  }
  function fixActive() {
    if (!data.workspaces.find(w => w.id === data.ui.activeWorkspaceId)) data.ui.activeWorkspaceId = data.workspaces[0].id;
    const list = members();
    if (!list.find(e => e.id === data.ui.activeEmployeeId)) data.ui.activeEmployeeId = list[0] ? list[0].id : null;
  }
  function saveUI() { scheduleSave(); } // UI prefs aren't undoable

  // =====================================================================
  // Formatting
  // =====================================================================
  let nfCache = {};
  function nf(d) {
    const key = S().numberLocale + d;
    return nfCache[key] || (nfCache[key] = new Intl.NumberFormat(S().numberLocale, { minimumFractionDigits: d, maximumFractionDigits: d }));
  }
  function money(v, opts) {
    const d = dec();
    v = C.roundMoney(v || 0, d);
    const neg = v < 0;
    const s = nf(d).format(Math.abs(v));
    const sym = S().currencySymbol || S().currencyCode;
    const body = S().symbolAfter ? s + ' ' + sym : sym + ' ' + s;
    if (opts && opts.plus && v > 0) return '+' + body;
    return (neg ? '−' : '') + body;
  }
  const payComment = (amt, from, to) => from && to ? 'Paid ' + money(amt) + ' for ' + fmtRange(from, to) : C.paymentComment(money(amt), from, to, d => fmtDate(d));
  const plainNum = v => (v === '' || v == null) ? '' : String(C.roundMoney(C.num(v), dec()));
  /** Worked hours in the chosen display: "7.53 (7h 32m)", "7h 32m" or "7.53" */
  const hours = min => C.formatHours(min, S().hoursDisplay);
  const breakStr = v => { const m = C.parseDuration(v); return m == null ? String(v) : m === 0 ? '' : C.formatHM(m); };
  const is12h = () => S().timeFormat === '12';
  /** Stored "HH:MM" (24-hour) -> display string in the chosen check-in/out format */
  const fmtTime = v => C.formatClock(v, S().timeFormat);

  // =====================================================================
  // Derived data
  // =====================================================================
  const activeWs = () => data.workspaces.find(w => w.id === data.ui.activeWorkspaceId) || data.workspaces[0];
  const wsById = id => data.workspaces.find(w => w.id === id);
  /** Work defaults for a workspace (check-in/out, break, work days, hourly rate), falling back to the app-wide settings. */
  function wsDef(ws) {
    ws = ws || activeWs(); const s = S();
    return {
      defaultIn: ws.defaultIn || s.defaultIn, defaultOut: ws.defaultOut || s.defaultOut,
      defaultBreak: ws.defaultBreak != null && ws.defaultBreak !== '' ? ws.defaultBreak : s.defaultBreak,
      workDays: Array.isArray(ws.workDays) && ws.workDays.length ? ws.workDays : s.workDays,
      defaultRate: C.num(ws.defaultRate) > 0 ? C.num(ws.defaultRate) : null,
    };
  }
  const person = id => data.employees.find(e => e.id === id) || null;
  /** An employee as seen inside one workspace: global name + that workspace's role, rate and opening balance. */
  function asMember(e, wsId) {
    const m = e && e.workspaces && e.workspaces[wsId];
    if (!m) return null;
    return Object.assign({}, e, { role: m.role || '', hourlyRate: C.num(m.hourlyRate), openingBalance: m.openingBalance || 0, openingNote: m.openingNote || '', wsId });
  }
  const members = wsId => { wsId = wsId || activeWs().id; return data.employees.map(e => asMember(e, wsId)).filter(Boolean); };
  const workspacesOf = e => data.workspaces.filter(w => e.workspaces && e.workspaces[w.id]);
  const activeEmp = () => asMember(person(data.ui.activeEmployeeId), activeWs().id);
  function rowsOf(id, wsId) {
    wsId = wsId || activeWs().id;
    const w = data.rows[wsId] || (data.rows[wsId] = {});
    return w[id] || (w[id] = []);
  }
  /** Pay groups of one employee in one workspace. */
  function groupsOf(id, wsId) {
    wsId = wsId || activeWs().id;
    const w = data.groups[wsId] || (data.groups[wsId] = {});
    return w[id] || (w[id] = []);
  }
  const range = () => C.periodRange(data.ui.periodMode, data.ui.anchor, S().weekStart, data.ui.custom);
  function ledgerOf(emp) { return C.computeLedger(rowsOf(emp.id, emp.wsId), emp, { decimals: dec() }); }
  function openShift(emp) {
    const t = todayISO();
    const rows = rowsOf(emp.id, emp.wsId);
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.type === 'day' && r.in && !r.out && (r.date === t || r.date === C.addDays(t, -1))) return r;
    }
    return null;
  }

  // =====================================================================
  // Rendering — shell
  // =====================================================================
  function applyTheme() {
    const t = S().theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  function render() {
    // preserve focus + scroll across re-renders
    const a = document.activeElement;
    let focusKey = null;
    if (a && a.dataset && a.dataset.f) {
      const tr = a.closest('tr[data-id]');
      if (tr) focusKey = { id: tr.dataset.id, f: a.dataset.f, text: a.type === 'text' };
    }
    const tw = $('.table-wrap'), sv = $('#view');
    const scroll = { t: tw ? tw.scrollTop : 0, l: tw ? tw.scrollLeft : 0, v: sv.scrollTop };

    applyTheme();
    applyTableView();
    const hasMembers = members().length > 0;
    sv.classList.toggle('fill', hasMembers && ui.view !== 'overview' && !!activeEmp());
    renderSidebar();
    renderTopbar();
    if (!data.employees.length) renderWelcome();
    else if (ui.view === 'overview') renderOverview();
    else if (!hasMembers) renderEmptyWorkspace();
    else renderEmployee();

    const tw2 = $('.table-wrap');
    if (tw2) { tw2.scrollTop = scroll.t; tw2.scrollLeft = scroll.l; }
    sv.scrollTop = scroll.v;
    if (focusKey) {
      const el = $(`tr[data-id="${CSS.escape(focusKey.id)}"] [data-f="${focusKey.f}"]`);
      if (el) { el.focus({ preventScroll: true }); if (focusKey.text && el.select) el.select(); }
    }
  }

  function renderSidebar() {
    const ws = activeWs();
    $('#ws-name').textContent = ws.name;
    $('#ws-mark').textContent = initials(ws.name);
    $('#ws-mark').style.background = avatarColor(ws.name);
    $('#ws-btn').title = ws.details ? ws.name + '\n' + ws.details : ws.name;
    $('#nav-overview').classList.toggle('active', ui.view === 'overview' && data.employees.length > 0);
    const q = ui.search.trim().toLowerCase();
    const all = members();
    const list = all.filter(e => !e.archived && (!q || e.name.toLowerCase().includes(q) || String(e.role || '').toLowerCase().includes(q)));
    if (!all.length) { $('#emp-list').innerHTML = `<div class="emp-empty">No employees in this workspace yet.<br><button class="linkish" data-action="new-employee">+ Add employee</button></div>`; return; }
    if (!list.length) { $('#emp-list').innerHTML = '<div class="emp-empty">No matches.</div>'; return; }
    $('#emp-list').innerHTML = list.map(e => {
      const L = ledgerOf(e);
      const live = openShift(e);
      const active = ui.view === 'employee' && e.id === data.ui.activeEmployeeId;
      return `<button class="emp-item ${active ? 'active' : ''}" data-action="open-emp" data-emp="${e.id}">
        ${avatar(e)}
        <span style="min-width:0"><div class="nm">${esc(e.name)}</div><div class="sub">${live ? '<span class="live"></span>Checked in ' + esc(fmtTime(live.in)) : esc(e.role || money(e.hourlyRate) + '/h')}</div></span>
        <span class="bal num" title="Balance owed">${money(L.totals.balance)}</span>
      </button>`;
    }).join('');
  }

  function renderTopbar() {
    const emp = activeEmp();
    const pc = $('#period-controls');
    pc.hidden = !data.employees.length;
    if (!data.employees.length) { $('#topbar-title').innerHTML = '<h1>Welcome</h1>'; return; }
    const ws = activeWs();
    const n = members().length;
    if (ui.view === 'overview' || !emp) {
      const all = ui.view === 'overview' && ui.ovScope === 'all';
      $('#topbar-title').innerHTML = `<div style="min-width:0"><h1>HR overview</h1><div class="meta">${all
        ? `<span>All workspaces</span><span>·</span><span>${data.employees.length} employee${data.employees.length === 1 ? '' : 's'}</span>`
        : `<span>${esc(ws.name)}</span><span>·</span><span>${n} employee${n === 1 ? '' : 's'}</span>`}<span>·</span><span>${esc(S().currencyCode)}</span></div></div>`;
    } else {
      const others = workspacesOf(emp).filter(w => w.id !== ws.id);
      $('#topbar-title').innerHTML = `${avatar(emp)}<div style="min-width:0"><h1>${esc(emp.name)}</h1>
        <div class="meta"><span>${esc(emp.role || 'Employee')}</span><span>·</span><span class="num">${money(emp.hourlyRate)} / hour in ${esc(ws.name)}</span>
        ${others.length ? `<span>·</span><span title="${esc(others.map(w => w.name + ': ' + money(asMember(person(emp.id), w.id).hourlyRate) + '/h').join('\n'))}">Also in ${others.length} other workspace${others.length === 1 ? '' : 's'}</span>` : ''}
        <button class="btn ghost sm" data-action="edit-employee">${I.edit} Edit</button></div></div>`;
    }
    $$('.seg button[data-period]').forEach(b => b.classList.toggle('on', b.dataset.period === data.ui.periodMode));
    const r = range();
    const mode = data.ui.periodMode;
    let label;
    if (mode === 'month') { const [y, m] = data.ui.anchor.split('-'); label = MONTHS_LONG[+m - 1] + ' ' + y; }
    else if (mode === 'all') label = 'All time';
    else label = fmtRange(r.start, r.end);
    $('#period-label').textContent = label;
    const nav = mode !== 'all' && mode !== 'custom';
    $$('[data-action="prev"],[data-action="next"]').forEach(b => b.hidden = !nav);
    $('#custom-range').hidden = mode !== 'custom';
    $('#period-label').hidden = mode === 'custom';
    if (mode === 'custom') { $('#custom-start').value = data.ui.custom.start || ''; $('#custom-end').value = data.ui.custom.end || ''; }
  }

  function renderWelcome() {
    $('#view').innerHTML = `<div class="welcome">
      <div class="big-mark"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
      <h2>Track hours and pay in one place</h2>
      <p>Log check-in and check-out times, breaks and payments. TimeLedger works out hours, amounts owed and running balances for you, week to week.</p>
      <div class="btns">
        <button class="btn primary" data-action="setup">${I.plus} Set up my first employee</button>
        <button class="btn" data-action="load-sample">Explore with sample data</button>
      </div>
    </div>`;
  }

  function renderEmptyWorkspace() {
    const ws = activeWs();
    const others = data.employees.filter(e => !(e.workspaces || {})[ws.id]).length;
    $('#view').innerHTML = `<div class="welcome">
      <div class="big-mark" style="background:${avatarColor(ws.name)}">${esc(initials(ws.name))}</div>
      <h2>${esc(ws.name)} has no employees yet</h2>
      <p>${ws.details ? esc(ws.details) + '<br>' : ''}Add a new person, or add someone who already works in another workspace. Each workspace keeps its own hourly rate and ledger for that person.</p>
      <div class="btns">
        <button class="btn primary" data-action="new-employee">${I.plus} ${others ? 'Add employee' : 'Add first employee'}</button>
        <button class="btn" data-action="edit-workspace">${I.edit} Edit workspace</button>
      </div>
    </div>`;
  }

  // =====================================================================
  // Rendering — employee ledger
  // =====================================================================
  function renderEmployee() {
    const emp = activeEmp();
    if (!emp) { ui.view = 'overview'; return renderOverview(); }
    const L = ledgerOf(emp);
    const r = range();
    const V = C.periodView(L, r);
    const t = V.totals;
    const shift = openShift(emp);

    const paidPct = t.earned > 0 ? Math.min(100, Math.round((t.paid / t.earned) * 100)) : 0;
    const off = [t.leave ? t.leave + ' leave' : '', t.holidays ? t.holidays + ' holiday' + (t.holidays === 1 ? '' : 's') : ''].filter(Boolean).join(' · ');
    const kpis = `<div class="kpis">
      <div class="kpi"><div class="lbl">Brought forward</div><div class="val num">${money(V.carryIn)}</div><div class="sub">${r.start ? 'Before ' + fmtDate(r.start) : 'Opening balance'}</div></div>
      <div class="kpi"><div class="lbl">Hours worked</div><div class="val num">${hours(t.minutes)}</div><div class="sub" title="${esc(off)}">${t.days} day${t.days === 1 ? '' : 's'}${off ? ' · ' + off : ''}</div></div>
      <div class="kpi"><div class="lbl">Earned this period</div><div class="val num">${money(t.earned)}</div><div class="sub">at ${money(emp.hourlyRate)}/h default</div></div>
      <div class="kpi ${t.paid > 0 ? 'good' : ''}"><div class="lbl">Paid this period</div><div class="val num">${money(t.paid)}</div><div class="sub">${t.earned > 0 ? paidPct + '% of earned' : '—'}</div></div>
      <div class="kpi balance"><div class="lbl">Balance to carry forward</div><div class="val num">${money(V.carryOut)}</div><div class="sub">${V.carryOut > 0 ? 'Owed to employee' : V.carryOut < 0 ? 'Paid in advance' : 'All settled'}</div></div>
    </div>`;

    const clock = renderClock(emp, shift);

    const counts = { all: V.rows.length, unpaid: 0, issues: 0 };
    for (const x of V.rows) {
      if (x.row.type === 'day' && (x.c.state === 'unpaid' || x.c.state === 'partial')) counts.unpaid++;
      if (x.c.issues && x.c.issues.some(i => i.level !== 'info')) counts.issues++;
    }
    const toolbar = `<div class="toolbar">
      <div class="btn-group">
        <button class="btn primary" data-action="add-day" title="Add a day (Ctrl+N)">${I.plus} Add day</button>
        <button class="btn primary" data-action="add-week" title="Add a row for each work day of a week">${I.cal} Add week</button>
      </div>
      <button class="btn" data-action="add-payment" title="Record a payment (Ctrl+Shift+P)">${I.cash} Record payment</button>
      <button class="btn" data-action="add-group" title="Wrap days and their payments in a pay group with totals and the pending balance">${I.group} Pay group</button>
      <button class="btn" data-action="add-leave" title="Mark a date or date range as leave or holiday (Ctrl+L)">${I.leave} Leave / Holiday</button>
      <button class="btn" data-action="add-note" title="Insert a separator row with a comment">${I.note} Separator</button>
      <span class="spacer"></span>
      <button class="btn ghost" data-action="sort" title="Sort rows by date (totals never change)">${I.sort} Sort</button>
      <button class="btn ghost" data-action="verify" title="Re-check every calculation (Ctrl+Shift+V)">${I.shield} Verify</button>
      <button class="btn ghost" data-action="share" title="Send a payment receipt or pay summary to the employee">${I.share} Share</button>
      <button class="btn ghost" data-action="export-menu" title="Export or print this period">${I.down} Export</button>
      ${tableViewButton()}
    </div>
    <div class="toolbar filters">
      <div class="chips">
        <button class="chip ${ui.filter === 'all' ? 'on' : ''}" data-action="filter" data-v="all">All<span class="count">${counts.all}</span></button>
        <button class="chip ${ui.filter === 'unpaid' ? 'on' : ''}" data-action="filter" data-v="unpaid">Unpaid<span class="count">${counts.unpaid}</span></button>
        <button class="chip ${ui.filter === 'issues' ? 'on' : ''}" data-action="filter" data-v="issues">Needs attention<span class="count">${counts.issues}</span></button>
      </div>
      <label class="toggle"><input type="checkbox" data-action="toggle-subtotals" ${data.ui.subtotals ? 'checked' : ''}> Week subtotals</label>
      <span class="spacer"></span>
      <span class="mini-kpis num" title="Shown in large and full-screen view, where the summary cards are hidden">
        ${shift ? `<span class="mk live"><i></i>${shift.breakStart ? 'On break' : 'Checked in ' + esc(fmtTime(shift.in))}</span>` : ''}
        <span class="mk">Hours <b>${hours(t.minutes)}</b></span><span class="mk">Earned <b>${money(t.earned)}</b></span>
        <span class="mk">Paid <b>${money(t.paid)}</b></span><span class="mk bal">Balance <b>${money(V.carryOut)}</b></span>
      </span>
    </div>`;

    const printHead = `<div class="print-head"><div><h1>${esc(emp.name)} — Attendance &amp; payments</h1><div>${esc(activeWs().name)} · ${esc(emp.role || '')} · ${money(emp.hourlyRate)}/h</div></div><div>${esc($('#period-label').textContent || fmtRange(r.start, r.end))} · printed ${fmtDate(todayISO())}</div></div>`;

    $('#view').innerHTML = printHead + kpis + clock + toolbar + renderTable(emp, V, r, L) + legend();
  }

  // ---------- table view: normal / large (no summary cards) / full screen (no sidebar either) ----------
  const tableView = () => data.ui.tableView || 'normal';
  function tableViewButton() {
    const v = tableView();
    return v === 'normal'
      ? `<button class="btn ghost" data-action="view-menu" title="Show the table larger or full screen">${I.expand} Expand</button>`
      : `<button class="btn" data-action="view-menu" title="Change the table view (Esc goes back)">${I.shrink} ${v === 'full' ? 'Full screen' : 'Large view'}</button>`;
  }
  function viewMenu(btn) {
    const v = tableView();
    const item = (k, label, sub, key) => `<button data-tv="${k}" class="${v === k ? 'on' : ''}"><span class="tv-t">${label}<small>${sub}</small></span>${key ? `<span class="kbd">${key}</span>` : ''}${v === k ? `<span class="ok">${I.check}</span>` : ''}</button>`;
    const mod = (api && api.platform === 'darwin') ? '⌘' : 'Ctrl';
    const p = popAt(btn, item('normal', 'Normal view', 'Summary cards and clock above the table', '')
      + item('large', 'Large view', 'Hide the cards; the table gets the space', mod + '⇧L')
      + item('full', 'Full screen', 'Also hide the sidebar and fill the screen', mod + '⇧F'), 'menu tv-menu');
    p.addEventListener('click', e => { const b = e.target.closest('[data-tv]'); if (!b) return; closePop(); setTableView(b.dataset.tv); });
  }
  function setTableView(v) {
    data.ui.tableView = v; saveUI();
    // real full screen needs the click that asked for it, so it is requested right here
    if (v === 'full' && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    if (v !== 'full' && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    render();
    if (v !== 'normal') toast((v === 'full' ? 'Full screen' : 'Large view') + ' — press Esc to go back');
  }
  function applyTableView() {
    const on = ui.view === 'employee' && !!activeEmp() && members().length > 0;
    const v = on ? tableView() : 'normal';
    document.body.classList.toggle('tv-large', v !== 'normal');
    document.body.classList.toggle('tv-full', v === 'full');
  }

  // ---------- insert a day / week between two rows ----------
  /**
   * Where new days would go when inserted after row `afterId` ('' = top of the period):
   * free dates after that row and up to the next row's date, so the table stays in date order.
   */
  function planInsert(afterId, kind) {
    const emp = activeEmp(); if (!emp) return null;
    const rows = rowsOf(emp.id), r = range();
    const taken = new Set(rows.filter(x => x.type === 'day' || x.type === 'leave').map(x => x.date));
    const offDates = new Set(rows.filter(x => x.type === 'leave').map(x => x.date));
    let idx, lo, hi;
    if (afterId) {
      const i = rows.findIndex(x => x.id === afterId); if (i < 0) return null;
      idx = i + 1; lo = rows[i].date;
      const next = rows.slice(i + 1).find(x => x.date && C.inRange(x.date, r));
      hi = next ? next.date : r.end;
    } else {
      const i = rows.findIndex(x => x.date && C.inRange(x.date, r));
      idx = i < 0 ? rows.length : i;
      hi = i < 0 ? r.end : rows[i].date;
      lo = r.start ? C.addDays(r.start, -1) : C.addDays(hi || todayISO(), kind === 'week' ? -8 : -2);
    }
    const cand = [];
    for (let k = 1; k <= (kind === 'week' ? 7 : 31); k++) { const d = C.addDays(lo, k); if (hi && d > hi) break; cand.push(d); }
    const free = cand.filter(d => !taken.has(d));
    if (kind === 'week') return { idx, dates: free.filter(isWorkDay), lo, hi };
    const pick = free.find(isWorkDay) || free[0];
    if (pick) return { idx, dates: [pick], lo, hi };
    // no free date in between: a second shift on the row's own date (split shift), unless it's a day off
    if (afterId && lo && !offDates.has(lo)) return { idx, dates: [lo], second: true, lo, hi };
    return { idx, dates: [], lo, hi };
  }
  function insertMenu(btn) {
    const afterId = btn.dataset.after || '';
    const d = planInsert(afterId, 'day'), w = planInsert(afterId, 'week');
    if (!d) return;
    const dl = d.dates.length ? DOW[dowOf(d.dates[0])] + ' ' + fmtDate(d.dates[0], false) + (d.second ? ' (2nd shift)' : '') : 'no free date';
    const wl = w.dates.length ? w.dates.length + ' work day' + (w.dates.length === 1 ? '' : 's') + ' · ' + (w.dates.length === 1 ? fmtDate(w.dates[0], false) : fmtDate(w.dates[0], false) + ' – ' + fmtDate(w.dates[w.dates.length - 1], false)) : 'no free work days here';
    const p = popAt(btn, `<div class="ins-h">${afterId ? 'Insert below this row' : 'Insert at the top'}</div>
      <button data-ins="day" ${d.dates.length ? '' : 'disabled'}>${I.plus}<span class="tv-t">Add day<small>${esc(dl)}</small></span></button>
      <button data-ins="week" ${w.dates.length ? '' : 'disabled'}>${I.cal}<span class="tv-t">Add week<small>${esc(wl)}</small></span></button>`, 'menu ins-menu center');
    p.addEventListener('click', e => { const b = e.target.closest('[data-ins]'); if (!b || b.disabled) return; closePop(); insertRows(afterId, b.dataset.ins); });
  }
  function insertRows(afterId, kind) {
    const emp = activeEmp();
    const p = planInsert(afterId, kind);
    if (!p || !p.dates.length) return toast(kind === 'week' ? 'No free work days between these rows' : 'No free date between these rows');
    let first = null;
    mutate(() => {
      const rows = rowsOf(emp.id);
      p.dates.forEach((d, k) => { const row = newDay(emp, d); rows.splice(p.idx + k, 0, row); if (!first) first = row; });
    }, { render: false });
    if (!C.inRange(p.dates[0], range())) data.ui.anchor = p.dates[0];
    render(); flashRow(first.id, 'in');
    if (p.second) toast('No free date between these rows — added a second shift on ' + fmtDate(p.dates[0]));
    else if (kind === 'week') toast(`Added ${p.dates.length} day${p.dates.length === 1 ? '' : 's'} (${fmtRange(p.dates[0], p.dates[p.dates.length - 1])}) with default times`, { undo: true });
  }

  function renderClock(emp, shift) {
    if (!shift) {
      const done = rowsOf(emp.id).filter(x => x.type === 'day' && x.date === todayISO() && x.in && x.out);
      const offToday = rowsOf(emp.id).find(x => x.type === 'leave' && x.date === todayISO());
      const sub = done.length ? 'Last shift today ended at ' + esc(fmtTime(done[done.length - 1].out)) : offToday ? (offToday.kind === 'holiday' ? 'Holiday today' : 'On leave today') + (offToday.note ? ' · ' + esc(offToday.note) : '') : 'Not checked in today';
      return `<div class="clock" id="clock"><div class="clock-state"><span class="clock-dot"></span><div><div class="clock-title">${fmtDate(todayISO())}, ${DOW[new Date().getDay()]}</div><div class="clock-sub">${sub}</div></div></div>
        <div class="clock-actions"><button class="btn success" data-action="clock">${I.arrowIn} Check in now</button></div></div>`;
    }
    const tin = C.parseTime(shift.in);
    const now = new Date(); let nowMin = now.getHours() * 60 + now.getMinutes();
    if (shift.date !== todayISO()) nowMin += 1440;
    let onBreak = 0;
    if (shift.breakStart) onBreak = Math.max(0, Math.round((Date.now() - shift.breakStart) / 60000));
    const worked = Math.max(0, nowMin - tin - (C.parseDuration(shift.breakMin) || 0) - onBreak);
    return `<div class="clock ${shift.breakStart ? 'break' : 'in'}" id="clock"><div class="clock-state"><span class="clock-dot"></span>
        <span class="clock-time">${hours(worked)}</span>
        <div><div class="clock-title">${shift.breakStart ? 'On break · ' + C.formatHM(onBreak) : 'Checked in at ' + esc(fmtTime(shift.in))}</div>
        <div class="clock-sub">${shift.date !== todayISO() ? 'Shift started yesterday · ' : ''}Break so far ${C.formatHM((C.parseDuration(shift.breakMin) || 0) + onBreak)} · ≈ ${money(C.amountFor(worked, shift.rate != null && shift.rate !== '' ? C.num(shift.rate) : emp.hourlyRate, dec()))} earned</div></div></div>
      <div class="clock-actions">
        <button class="btn" data-action="break">${I.coffee} ${shift.breakStart ? 'End break' : 'Start break'}</button>
        <button class="btn primary" data-action="clock">${I.arrowOut} Check out now</button>
      </div></div>`;
  }

  function legend() {
    return `<div class="legend">
      <span><i style="background:var(--green-line)"></i>Paid on the day</span>
      <span><i style="background:var(--teal-line)"></i>Covered by a payment row</span>
      <span><i style="background:var(--amber-line)"></i>Partly paid</span>
      <span><i style="background:var(--blue-line)"></i>Shift in progress / incomplete</span>
      <span><i style="background:var(--violet)"></i>Leave / holiday</span>
      <span><i style="background:var(--red-line)"></i>Needs fixing</span>
      <span>Click any calculated figure to see how it was worked out.</span>
    </div>`;
  }

  const COLS = 13;
  function renderTable(emp, V, r, L) {
    const showRate = S().showRate;
    const head = `<thead><tr>
      <th></th>
      <th>Date</th>
      <th>Check&#8209;in</th>
      <th>Check&#8209;out</th>
      <th title="Rest break. Type 30, 0:30, 1h or 1h 15m">Rest<br>break</th>
      <th class="r">Working<br>hours <span class="f" title="Check-out − Check-in − Rest break">ƒ</span></th>
      <th class="r" ${showRate ? '' : 'hidden'}>Rate / h</th>
      <th class="r">Amount <span class="f" title="Working hours × Hourly rate">ƒ</span></th>
      <th class="r">Paid<br>amount</th>
      <th class="c" title="Tick when this day has been paid in full">Paid</th>
      <th class="r">Balance <span class="f" title="Amount − Paid (including payment rows that cover this day)">ƒ</span></th>
      <th class="r">Running<br>balance <span class="f" title="Brought forward + Σ(Amount − Paid) − Σ(Payments)">ƒ</span></th>
      <th>Notes</th>
    </tr></thead>`;

    let rows = V.rows;
    if (ui.filter === 'unpaid') rows = rows.filter(x => x.row.type === 'day' && (x.c.state === 'unpaid' || x.c.state === 'partial'));
    if (ui.filter === 'issues') rows = rows.filter(x => x.c.issues && x.c.issues.some(i => i.level !== 'info'));

    if (!V.rows.length) {
      return `<div class="table-wrap"><table class="ledger">${head}<tbody>${carryRow('in', V, r)}</tbody></table>
        <div class="empty-table"><h3>No entries in this period</h3><div>Add days one at a time, fill a whole week, or check in now.</div>
        <div class="btns"><button class="btn primary" data-action="add-day">${I.plus} Add day</button><button class="btn" data-action="add-week">${I.cal} Add week</button></div></div></div>`;
    }

    const body = [];
    body.push(carryRow('in', V, r));
    if (ui.filter !== 'all') for (const x of rows) body.push(rowHTML(x, emp));
    else {
      // pay groups become blocks; week subtotals cover the rows outside them
      const subtotals = data.ui.subtotals && data.ui.periodMode !== 'week';
      let grp = null;
      const flush = () => { if (grp && grp.n) body.push(subtotalRow(grp)); grp = null; };
      for (const e of tableLayout(emp, V, L).entries) {
        if (e.kind === 'head') { if (subtotals) flush(); body.push(groupHeadRow(e, r)); continue; }
        if (e.kind === 'total') { body.push(groupTotalRows(e)); continue; }
        const x = e.x;
        if (subtotals && !e.gid) {
          const wk = C.weekStartOf(x.row.date, S().weekStart);
          if (!grp || grp.key !== wk) { flush(); grp = { key: wk, n: 0, minutes: 0, earned: 0, paid: 0, running: 0 }; }
          grp.n++;
          if (x.row.type === 'day') { grp.minutes += x.c.minutes; grp.earned += x.c.amount; grp.paid += x.c.directPaid; }
          if (x.row.type === 'payment') grp.paid += x.c.amount;
          grp.running = x.running;
        }
        if (e.hidden) continue;
        body.push(e.gid ? rowHTML(x, emp).replace(/^<tr class="/, '<tr class="in-grp ') : rowHTML(x, emp));
      }
      if (subtotals) flush();
    }
    if (!rows.length) body.push(`<tr><td colspan="${COLS}"><div class="empty-table" style="padding:24px">No rows match this filter.</div></td></tr>`);
    body.push(carryRow('out', V, r));

    const t = V.totals;
    const foot = `<tfoot><tr>
      <td></td><td>Period total</td><td colspan="3" style="color:var(--muted);font-weight:500">${t.days} day${t.days === 1 ? '' : 's'} worked</td>
      <td class="r num">${hours(t.minutes)}</td><td ${showRate ? '' : 'hidden'}></td>
      <td class="r num">${money(t.earned)}</td><td class="r num">${money(t.paid)}</td><td></td>
      <td class="r num" title="Earned − Paid in this period">${money(t.periodBalance)}</td>
      <td class="r num">${money(V.carryOut)}</td><td></td></tr></tfoot>`;

    return `<div class="table-wrap"><table class="ledger" id="ledger">${head}<tbody>${body.join('')}</tbody>${foot}</table></div>`;
  }

  function carryRow(kind, V, r) {
    const showRate = S().showRate;
    const span = showRate ? 10 : 9;
    if (kind === 'in') {
      const lbl = r.start ? `Brought forward <small>balance before ${fmtDate(r.start)}${activeEmp().openingBalance ? ', including opening balance' : ''}</small>` : `Opening balance <small>carried in before the first entry</small>`;
      return `<tr class="carry"><td class="handle">${insBtn('')}</td><td colspan="${span}"><div class="ttl">${I.fwd} ${lbl}</div></td><td class="r run-cell"><span class="calc num" data-explain="carry-in">${money(V.carryIn)}</span></td><td></td></tr>`;
    }
    const lbl = r.end ? `Carried forward <small>to the period starting ${fmtDate(C.addDays(r.end, 1))}</small>` : `Current balance <small>${V.carryOut > 0 ? 'owed to employee' : V.carryOut < 0 ? 'employee paid in advance' : 'settled'}</small>`;
    return `<tr class="carry"><td></td><td colspan="${span}"><div class="ttl">${I.fwd} ${lbl}</div></td><td class="r run-cell"><span class="calc num" data-explain="carry-out">${money(V.carryOut)}</span></td><td></td></tr>`;
  }

  function subtotalRow(g) {
    const showRate = S().showRate;
    return `<tr class="subtotal"><td></td><td colspan="4"><span class="lbl">Week of ${fmtDate(g.key, false)} – ${fmtDate(C.addDays(g.key, 6))}</span></td>
      <td class="r num">${hours(g.minutes)}</td><td ${showRate ? '' : 'hidden'}></td><td class="r num">${money(g.earned)}</td><td class="r num">${money(g.paid)}</td><td></td>
      <td class="r num">${money(g.earned - g.paid)}</td><td class="r num">${money(g.running)}</td><td></td></tr>`;
  }

  // ---------- pay groups ----------
  /** An employee's pay groups with their payments and whole-range totals. */
  function groupInfo(emp, L) {
    const groups = groupsOf(emp.id, emp.wsId);
    const assigned = C.assignPayments(rowsOf(emp.id, emp.wsId), groups);
    const sums = new Map(groups.map(g => [g.id, C.groupSummary(L, g, assigned)]));
    const of = row => row.type === 'payment' ? assigned.get(row.id) || null
      : (groups.find(g => row.date && row.date >= g.from && row.date <= g.to) || {}).id || null;
    return { groups, assigned, sums, of, byId: id => groups.find(g => g.id === id) };
  }

  /**
   * Display order of the period's rows. Each pay group is one block (its days, then its payments
   * in date order) placed where its first row is, and the running balance follows this order.
   * Entries: { kind: 'row', x, gid, hidden } | { kind: 'head' | 'total', g, s, running }
   */
  function tableLayout(emp, V, L) {
    const G = groupInfo(emp, L);
    const blocks = new Map();
    for (const x of V.rows) {
      const gid = G.groups.length ? G.of(x.row) : null; if (!gid) continue;
      let b = blocks.get(gid); if (!b) blocks.set(gid, b = { rest: [], pays: [] });
      (x.row.type === 'payment' ? b.pays : b.rest).push(x);
    }
    let running = V.carryIn;
    const entries = [];
    const push = (x, gid, hidden) => { running = C.roundMoney(running + x.c.contribution, dec()); entries.push({ kind: 'row', x: Object.assign({}, x, { running }), gid, hidden }); };
    for (const x of V.rows) {
      const gid = G.groups.length ? G.of(x.row) : null;
      if (!gid) { push(x, null, false); continue; }
      const b = blocks.get(gid);
      if (x !== (b.rest[0] || b.pays[0])) continue;
      const g = G.byId(gid), s = G.sums.get(gid);
      entries.push({ kind: 'head', g, s });
      const pays = b.pays.slice().sort((p, q) => (p.row.date < q.row.date ? -1 : p.row.date > q.row.date ? 1 : 0));
      for (const m of b.rest.concat(pays)) push(m, gid, !!g.collapsed);
      entries.push({ kind: 'total', g, s, running });
    }
    return { entries, G };
  }

  function groupHeadRow(e, r) {
    const { g, s } = e;
    const status = s.pending > 0 ? `<span class="pill amber">${money(s.pending)} pending</span>`
      : s.pending < 0 ? `<span class="pill teal">${money(-s.pending)} paid in advance</span>`
        : s.earned > 0 ? `<span class="pill teal">${I.check} Paid in full</span>` : '';
    const partly = (r.start && s.from < r.start) || (r.end && s.to > r.end);
    return `<tr class="grp-head ${g.collapsed ? 'closed' : ''}" data-gid="${g.id}"><td class="handle"><button class="icon-btn grp-tog" data-action="group-toggle" title="${g.collapsed ? 'Show the rows in this group' : 'Fold this group to its totals'}" aria-expanded="${!g.collapsed}">${I.chev}</button></td>
      <td colspan="${S().showRate ? COLS - 1 : COLS - 2}"><div class="grp-line"><span class="pill grp">${I.group} Pay group</span><span class="grp-range">${esc(fmtRange(g.from, g.to))}</span>${g.label ? `<span class="grp-label">${esc(g.label)}</span>` : ''}
        <span class="grp-meta">${s.days} day${s.days === 1 ? '' : 's'} · ${s.payments.length} payment${s.payments.length === 1 ? '' : 's'}${g.collapsed ? ' · folded' : ''}</span>${status}
        ${partly ? '<span class="grp-meta" title="The group continues outside this period. Its totals always cover all of its dates.">· totals cover the whole group</span>' : ''}
        <span class="spacer"></span><button class="range-btn" data-action="group-edit" title="Change the dates, label or payments of this group">${I.edit} Edit group</button></div></td></tr>`;
  }

  /** The group's total row, then the payment line: "Paid $300 + $300 = $600 · $94 Pending balance". */
  function groupTotalRows(e) {
    const { g, s, running } = e;
    const showRate = S().showRate;
    const parts = [];
    if (s.paidOnDay > 0) parts.push(`<span class="gp"><b>${money(s.paidOnDay)}</b><small>paid on the day</small></span>`);
    for (const p of s.payments) parts.push(`<span class="gp"><b>${money(p.amount)}</b><small>${fmtDate(p.date, false)}${p.method ? ' · ' + esc(p.method) : ''}</small></span>`);
    const formula = !parts.length ? '<span class="gp"><small>No payments yet</small></span>'
      : parts.join('<span class="op">+</span>') + (parts.length > 1 ? `<span class="op">=</span><span class="gp tot"><b>${money(s.paid)}</b></span>` : '');
    const pend = s.pending > 0 ? `<span class="grp-pend owed"><b>${money(s.pending)}</b> Pending balance</span>`
      : s.pending < 0 ? `<span class="grp-pend over"><b>${money(-s.pending)}</b> Paid in advance</span>`
        : `<span class="grp-pend ok">${I.check} Paid in full</span>`;
    return `<tr class="grp-total" data-gid="${g.id}"><td></td><td colspan="4"><span class="lbl">Group total · ${s.days} day${s.days === 1 ? '' : 's'}</span></td>
      <td class="r num">${hours(s.minutes)}</td><td ${showRate ? '' : 'hidden'}></td><td class="r num">${money(s.earned)}</td><td class="r num">${money(s.paid)}</td><td></td>
      <td class="r num" title="Pending balance: Amount − Paid">${money(s.pending)}</td><td class="r num">${money(running)}</td><td></td></tr>
      <tr class="grp-settle" data-gid="${g.id}"><td></td><td colspan="${showRate ? COLS - 1 : COLS - 2}"><div class="grp-sum"><span class="k">Paid</span>${formula}<span class="spacer"></span>${pend}</div></td></tr>`;
  }

  function issueIcon(issues) {
    const list = (issues || []).filter(i => i.level !== 'info');
    if (!list.length) return '';
    const lvl = list.some(i => i.level === 'error') ? 'error' : 'warn';
    return `<span class="issue-ico ${lvl}" title="${esc(list.map(i => i.msg).join('\n'))}">!</span>`;
  }

  function dateCell(row) {
    const d = row.date ? dowOf(row.date) : null;
    const we = d === 0 || d === 6 || (d != null && !wsDef().workDays.includes(d));
    const today = row.date === todayISO();
    return `<td><div class="date-cell"><span class="dow ${we ? 'we' : ''} ${today ? 'today' : ''}" ${today ? 'title="Today"' : ''}>${d == null ? '' : DOW[d]}</span><input type="date" class="cell-in w-date" data-f="date" value="${esc(row.date)}"></div></td>`;
  }

  /** Check-in / check-out cell. In 12-hour mode the typed time sits next to a small AM/PM dropdown. */
  function timeCell(row, f) {
    const v = row[f] || '';
    const bad = v && C.parseTime(v) == null;
    if (!is12h()) {
      return `<td><input class="cell-in w-time num ${bad ? 'invalid' : ''}" data-f="${f}" value="${esc(v)}" placeholder="--:--" title="Type ${f === 'in' ? '9, 930, 09:30' : '17, 1745, 17:45'}, 0600PM or n for now"></td>`;
    }
    const p = C.split12(C.parseTime(v));
    const mer = p.mer || (f === 'out' ? 'PM' : 'AM');
    return `<td><div class="time12"><input class="cell-in w-time num ${bad ? 'invalid' : ''}" data-f="${f}" value="${esc(bad ? v : p.text)}" placeholder="--:--" title="Type 6, 0600, 6:30, 0600PM or n for now. Without AM/PM the dropdown is used.">`
      + `<select class="cell-in ampm" data-f="${f}Mer" title="AM / PM">${['AM', 'PM'].map(x => `<option ${x === mer ? 'selected' : ''}>${x}</option>`).join('')}</select></div></td>`;
  }

  const insBtn = afterId => `<button class="ins-btn" data-action="insert-menu" data-after="${afterId}" title="Add a day or week here" aria-label="Insert a day or week here">${I.plus}</button>`;
  function handleCell(row) {
    return `<td class="handle"><span class="grip" data-grip title="Drag to move">${I.grip}</span><button class="icon-btn" data-action="row-menu" title="Row options">${I.dots}</button>${insBtn(row.id)}</td>`;
  }

  function rowHTML(x, emp) {
    const { row, c, running } = x;
    const showRate = S().showRate;
    const run = `<td class="r run-cell"><span class="calc num ${running < 0 ? 'neg' : ''}" data-explain="running">${money(running)}</span></td>`;

    if (row.type === 'payment') {
      const rng = row.from || row.to ? fmtRange(row.from, row.to) : 'Oldest unpaid first';
      const cover = c.covers.length ? ` · ${c.covers.length} day${c.covers.length === 1 ? '' : 's'}` : '';
      const credit = c.unapplied > 0 ? `<span class="pill amber" title="Part of this payment is not matched to worked days yet">${money(c.unapplied)} credit</span>` : '';
      return `<tr class="payment" data-id="${row.id}" data-type="payment">${handleCell(row)}${dateCell(row)}
        <td colspan="${showRate ? 6 : 5}"><div class="pay-desc"><span class="pill pay">${I.check} Payment</span>
          <input class="cell-in" data-f="comment" value="${esc(row.comment)}" placeholder="Payment comment">
          <button class="range-btn" data-action="edit-payment" title="Dates this payment covers — click to edit">${esc(rng)}${cover}</button>${credit}${row.shared && row.shared.length ? `<span class="pill teal" title="${esc(row.shared.map(x => 'Shared by ' + VIA[x.via] + ' on ' + new Date(x.at).toLocaleString()).join('\n'))}">${I.check} Shared</span>` : `<button class="range-btn share-btn" data-action="share-payment" title="Send this receipt to the employee">${I.share} Share</button>`}${issueIcon(c.issues)}</div></td>
        <td class="r"><input class="cell-in r w-money num" data-f="amount" value="${esc(plainNum(row.amount))}" inputmode="decimal"></td>
        <td class="c"><span class="paid-box covered" title="Payment received"><span>${I.check}</span></span></td>
        <td class="r bal-cell"><span class="calc num neg" data-explain="pay-balance">−${money(c.amount)}</span></td>
        ${run}
        <td><select class="cell-in" data-f="method">${METHODS.map(m => `<option ${m === (row.method || 'Cash') ? 'selected' : ''}>${m}</option>`).join('')}</select></td></tr>`;
    }

    if (row.type === 'note') {
      return `<tr class="note tone-${esc(row.tone || 'grey')}" data-id="${row.id}" data-type="note">${handleCell(row)}${dateCell(row)}
        <td colspan="${showRate ? 9 : 8}"><div class="note-line"><input class="cell-in" data-f="text" value="${esc(row.text)}" placeholder="Separator comment, e.g. Paid 460 from 01 Sep to 07 Sep"></div></td>
        ${run}<td></td></tr>`;
    }

    if (row.type === 'leave') {
      const hol = row.kind === 'holiday';
      return `<tr class="leave ${hol ? 'holiday' : ''}" data-id="${row.id}" data-type="leave">${handleCell(row)}${dateCell(row)}
        <td colspan="${showRate ? 9 : 8}"><div class="leave-line"><span class="leave-ico">${I.leave}</span>
          <select class="cell-in leave-kind" data-f="kind" title="Leave (this employee) or holiday"><option value="leave" ${hol ? '' : 'selected'}>Leave</option><option value="holiday" ${hol ? 'selected' : ''}>Holiday</option></select>
          <input class="cell-in" data-f="note" value="${esc(row.note)}" placeholder="${hol ? 'Holiday name, e.g. Independence Day' : 'Reason, e.g. Sick leave'}">
          <span class="leave-sub">No hours · no pay</span></div></td>
        ${run}<td></td></tr>`;
    }

    // day row
    const hasErr = c.issues.some(i => i.level === 'error');
    const st = hasErr ? 'error' : c.state;
    const pb = c.state === 'covered' ? 'covered' : c.state === 'partial' ? 'partial' : '';
    const coveredTitle = c.allocations.length ? 'Covered by payment' + (c.allocations.length > 1 ? 's' : '') + ' on ' + c.allocations.map(a => fmtDate(a.date, false) + ' (' + money(a.amount) + ')').join(', ') : '';
    const paidVal = row.paid ? plainNum(c.amount) : plainNum(row.paidAmount);
    const rateVal = row.rate != null && row.rate !== '' ? plainNum(row.rate) : '';
    const brBad = C.parseDuration(row.breakMin) == null;

    return `<tr class="day st-${st}" data-id="${row.id}" data-type="day">${handleCell(row)}${dateCell(row)}
      ${timeCell(row, 'in')}
      ${timeCell(row, 'out')}
      <td><input class="cell-in w-break num ${brBad ? 'invalid' : ''}" data-f="breakMin" value="${esc(breakStr(row.breakMin))}" placeholder="0:00" title="Minutes (30), H:MM (0:30) or 1h 15m"></td>
      <td class="r"><span class="calc num ${c.minutes ? '' : 'zero'}" data-explain="hours" title="${C.formatHours(c.minutes, 'both')}">${c.status === 'open' ? '<span style="color:var(--blue)" title="Shift in progress — waiting for check-out">open</span>' : hours(c.minutes)}</span>${issueIcon(c.issues)}</td>
      <td class="r" ${showRate ? '' : 'hidden'}><input class="cell-in r w-rate num" data-f="rate" value="${esc(rateVal)}" placeholder="${esc(plainNum(emp.hourlyRate))}" inputmode="decimal" title="Leave blank to use the employee's rate"></td>
      <td class="r cell-amt"><span class="calc num ${c.amount ? '' : 'zero'}" data-explain="amount">${money(c.amount)}</span></td>
      <td class="r">${c.allocated > 0 && c.directPaid === 0
        ? `<span class="alloc num" data-explain="balance" title="${esc(coveredTitle)}">${money(c.allocated)}<small>pmt</small></span>`
        : `<div class="paid-cell"><input class="cell-in r w-money num" data-f="paidAmount" value="${esc(paidVal)}" placeholder="0" inputmode="decimal" title="Amount paid for this day. Tick the box to mark it paid in full.">${c.allocated > 0 ? `<span class="plus" title="${esc(coveredTitle)}">+${esc(plainNum(c.allocated))}</span>` : ''}</div>`}</td>
      <td class="c"><label class="paid-box ${pb} ${c.amount <= 0 ? 'disabled' : ''}" title="${esc(c.state === 'covered' ? coveredTitle : c.amount <= 0 ? 'Nothing to pay yet' : row.paid ? 'Paid in full — click to undo' : 'Mark this day as paid in full')}">
        <input type="checkbox" data-f="paid" ${row.paid ? 'checked' : ''} ${c.amount <= 0 || c.state === 'covered' ? 'disabled' : ''}><span>${I.check}</span></label></td>
      <td class="r bal-cell"><span class="calc num ${c.balance > 0 ? 'owed' : 'zero'}" data-explain="balance">${money(c.balance)}</span></td>
      ${run}
      <td><input class="cell-in w-note" data-f="note" value="${esc(row.note)}" placeholder="Add a note"></td></tr>`;
  }

  // =====================================================================
  // Rendering — HR overview
  // =====================================================================
  /** One employee's figures inside one workspace for the selected period. */
  function memberStats(e, r) {
    const L = ledgerOf(e); const V = C.periodView(L, r);
    const lastDay = rowsOf(e.id, e.wsId).filter(x => x.type === 'day' && x.date).map(x => x.date).sort().pop();
    const t = V.totals;
    return { e, L, V, ws: wsById(e.wsId), live: openShift(e), lastDay, days: t.days, leave: t.leave, holidays: t.holidays, minutes: t.minutes, earned: t.earned, paid: t.paid, pbal: t.periodBalance, bal: L.totals.balance };
  }
  function sumStats(list) {
    const t = { days: 0, leave: 0, holidays: 0, minutes: 0, earned: 0, paid: 0, pbal: 0, bal: 0 };
    for (const s of list) {
      for (const k of ['days', 'leave', 'holidays', 'minutes']) t[k] += s[k];
      for (const k of ['earned', 'paid', 'pbal', 'bal']) t[k] = C.roundMoney(t[k] + s[k], dec());
    }
    return t;
  }
  /** Days · Leave · Hours · Amount · Paid · Paid % · Outstanding (period) · Total outstanding */
  function figureCells(s) {
    const pct = s.earned > 0 ? Math.min(100, Math.round(s.paid / s.earned * 100)) : 0;
    const off = s.leave + s.holidays;
    return `<td class="r">${s.days}</td><td class="r" title="${s.leave} leave · ${s.holidays} holiday${s.holidays === 1 ? '' : 's'}">${off || '<span style="color:var(--faint)">—</span>'}</td>
      <td class="r">${hours(s.minutes)}</td><td class="r">${money(s.earned)}</td><td class="r">${money(s.paid)}</td>
      <td><span class="bar"><i style="width:${pct}%"></i></span> <span style="color:var(--muted);font-size:12px">${s.earned > 0 ? pct + '%' : '—'}</span></td>
      <td class="r">${money(s.pbal)}</td><td class="r" style="font-weight:650">${money(s.bal)}</td>`;
  }
  const liveDot = '<span class="live" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green-line);margin-right:5px"></span>';
  function whoSub(s) { return s.live ? liveDot + 'Checked in ' + esc(fmtTime(s.live.in)) : s.lastDay ? 'Last worked ' + fmtDate(s.lastDay) : 'No entries yet'; }

  function renderOverview() {
    const r = range();
    const multi = data.workspaces.length > 1;
    const all = multi && ui.ovScope === 'all';
    const ws = activeWs();
    // flat list of (employee × workspace) stats in scope
    const flat = all
      ? data.workspaces.flatMap(w => members(w.id).filter(e => !e.archived).map(e => memberStats(e, r)))
      : members().filter(e => !e.archived).map(e => memberStats(e, r));
    const T = sumStats(flat);
    const liveCount = flat.filter(s => s.live).length;
    const people = all ? data.employees.filter(p => workspacesOf(p).length) : flat.map(s => s.e);

    // attention list
    const attn = [];
    const old = C.addDays(todayISO(), -14);
    for (const s of flat) {
      const where = all ? ' · ' + s.ws.name : '';
      for (const { row, c } of s.L.rows) {
        if (row.type === 'day' && c.status === 'open' && !(s.live && s.live.id === row.id)) attn.push({ lvl: 'warn', s, t: 'Missing check-out' + where, d: fmtDate(row.date) + ' — checked in at ' + fmtTime(row.in), date: row.date });
        if (c.issues && c.issues.some(i => i.level === 'error')) attn.push({ lvl: 'error', s, t: c.issues.find(i => i.level === 'error').msg + where, d: fmtDate(row.date), date: row.date });
      }
      const oldUnpaid = s.L.rows.filter(x => x.row.type === 'day' && x.c.balance > 0 && x.row.date < old);
      if (oldUnpaid.length) attn.push({ lvl: 'info', s, t: oldUnpaid.length + ' day' + (oldUnpaid.length === 1 ? '' : 's') + ' unpaid for over 2 weeks' + where, d: money(oldUnpaid.reduce((a, x) => a + x.c.balance, 0)) + ' outstanding since ' + fmtDate(oldUnpaid[0].row.date), date: oldUnpaid[0].row.date });
      if (s.L.totals.credit > 0) attn.push({ lvl: 'info', s, t: 'Unmatched payment credit' + where, d: money(s.L.totals.credit) + ' paid ahead of worked days', date: null });
    }
    const icoStyle = { error: 'background:var(--red-bg);color:var(--red)', warn: 'background:var(--amber-bg);color:var(--amber)', info: 'background:var(--blue-bg);color:var(--blue)' };

    let body;
    if (!all) {
      body = flat.map(s => `<tr class="link" data-action="open-emp" data-emp="${s.e.id}">
          <td><div class="who">${avatar(s.e)}<div><div style="font-weight:600">${esc(s.e.name)}</div><div class="sub">${esc(s.e.role ? s.e.role + ' · ' : '')}${whoSub(s)}</div></div></div></td>
          <td class="r">${money(s.e.hourlyRate)}</td>${figureCells(s)}</tr>`).join('');
      if (!flat.length) body = `<tr><td colspan="10" style="color:var(--muted);text-align:center;padding:28px">No employees in ${esc(ws.name)} yet. <button class="linkish" data-action="new-employee">Add employee</button></td></tr>`;
    } else {
      body = people.map(p => {
        const subs = flat.filter(s => s.e.id === p.id);
        const agg = sumStats(subs);
        const live = subs.find(s => s.live);
        const last = subs.map(s => s.lastDay).filter(Boolean).sort().pop();
        const head = `<tr class="link person" data-action="open-emp" data-emp="${p.id}" data-ws="${(subs.find(s => s.ws.id === ws.id) || subs[0]).ws.id}">
          <td><div class="who">${avatar(p)}<div><div style="font-weight:600">${esc(p.name)}</div><div class="sub">${live ? liveDot + 'Checked in at ' + esc(live.ws.name) : last ? 'Last worked ' + fmtDate(last) : 'No entries yet'}</div></div></div></td>
          <td><div class="ws-chips">${subs.map(s => `<span class="ws-chip" title="${esc(s.ws.name)}: ${money(s.e.hourlyRate)}/h"><i style="background:${avatarColor(s.ws.name)}"></i>${esc(s.ws.name)}</span>`).join('')}</div></td>
          ${figureCells(agg)}</tr>`;
        if (subs.length < 2) return head;
        return head + subs.map(s => `<tr class="link sub-row" data-action="open-emp" data-emp="${p.id}" data-ws="${s.ws.id}" title="Open ${esc(p.name)}'s ledger in ${esc(s.ws.name)}">
          <td><div class="sub-who"><i style="background:${avatarColor(s.ws.name)}"></i>${esc(s.ws.name)}${s.e.role ? ' <span>· ' + esc(s.e.role) + '</span>' : ''}</div></td>
          <td class="r">${money(s.e.hourlyRate)}/h</td>${figureCells(s)}</tr>`).join('');
      }).join('');
    }

    $('#view').innerHTML = `
      <div class="print-head"><h1>HR overview — ${esc(all ? 'All workspaces' : ws.name)} — ${esc($('#period-label').textContent)}</h1><div>printed ${fmtDate(todayISO())}</div></div>
      <div class="kpis">
        <div class="kpi"><div class="lbl">Employees</div><div class="val num">${people.length}</div><div class="sub">${liveCount ? liveCount + ' checked in now' : 'None checked in now'}</div></div>
        <div class="kpi"><div class="lbl">Hours this period</div><div class="val num">${hours(T.minutes)}</div><div class="sub">${T.days} shift-days${T.leave + T.holidays ? ' · ' + (T.leave + T.holidays) + ' days off' : ''}</div></div>
        <div class="kpi"><div class="lbl">Amount this period</div><div class="val num">${money(T.earned)}</div><div class="sub">${all ? 'All workspaces' : esc(ws.name)}</div></div>
        <div class="kpi good"><div class="lbl">Paid this period</div><div class="val num">${money(T.paid)}</div><div class="sub">${T.earned > 0 ? Math.round(T.paid / T.earned * 100) + '% of amount' : '—'}</div></div>
        <div class="kpi balance"><div class="lbl">Total outstanding</div><div class="val num">${money(T.bal)}</div><div class="sub">All-time balance owed</div></div>
      </div>
      <div class="toolbar">
        ${multi ? `<div class="seg"><button class="${all ? '' : 'on'}" data-action="ov-scope" data-v="ws">${esc(ws.name)}</button><button class="${all ? 'on' : ''}" data-action="ov-scope" data-v="all">All workspaces</button></div>` : ''}
        <span class="spacer"></span>
        <button class="btn ghost" data-action="export-summary">${I.down} Export summary CSV</button>
        <button class="btn ghost" data-action="print">${I.print} PDF</button>
        <button class="btn" data-action="new-employee">${I.plus} Add employee</button></div>
      <div class="ov-grid">
        <div class="card" style="overflow:auto">
          <table class="simple"><thead><tr>
            <th>Employee</th><th class="${all ? '' : 'r'}">${all ? 'Workspaces' : 'Rate / h'}</th><th class="r">Days</th><th class="r" title="Leave + holiday days">Leave</th><th class="r">Hours</th><th class="r">Amount</th><th class="r">Paid</th><th>Paid %</th><th class="r" title="Amount − Paid in this period">Outstanding<br>this period</th><th class="r" title="All-time balance still owed">Total<br>outstanding</th></tr></thead>
            <tbody>${body}</tbody>
            <tfoot><tr><td>Total</td><td></td><td class="r">${T.days}</td><td class="r">${T.leave + T.holidays || ''}</td><td class="r">${hours(T.minutes)}</td><td class="r">${money(T.earned)}</td><td class="r">${money(T.paid)}</td><td></td><td class="r">${money(T.pbal)}</td><td class="r">${money(T.bal)}</td></tr></tfoot>
          </table>
        </div>
        <div class="card">
          <div class="card-h"><h2>Needs attention</h2><span style="color:var(--muted);font-size:12px">${attn.length} item${attn.length === 1 ? '' : 's'}</span></div>
          <div class="card-b">${attn.length ? `<ul class="attn">${attn.slice(0, 30).map(a => `<li><span class="ico" style="${icoStyle[a.lvl]}">${a.lvl === 'info' ? 'i' : '!'}</span><div style="min-width:0"><div class="t">${esc(a.s.e.name)} · ${esc(a.t)}</div><div class="d">${esc(a.d)}</div>
              <button class="linkish" data-action="open-emp" data-emp="${a.s.e.id}" data-ws="${a.s.ws.id}" ${a.date ? `data-date="${a.date}"` : ''}>Open ledger →</button></div></li>`).join('')}</ul>`
              : '<div style="color:var(--muted);padding:12px 0">Everything looks in order.</div>'}</div>
        </div>
      </div>`;
  }

  // =====================================================================
  // Row operations
  // =====================================================================
  function insertChronological(list, row) {
    let idx = -1;
    for (let i = 0; i < list.length; i++) if (list[i].date && list[i].date <= row.date) idx = i;
    list.splice(idx + 1, 0, row);
    return row;
  }
  function newDay(emp, date, times) {
    const s = wsDef();
    return { id: uid('d'), type: 'day', date, in: times ? times.in : s.defaultIn, out: times ? times.out : s.defaultOut, breakMin: times ? times.breakMin : s.defaultBreak, rate: emp.hourlyRate, paid: false, paidAmount: '', note: '' };
  }
  const isWorkDay = iso => wsDef().workDays.includes(dowOf(iso));
  function nextWorkDay(iso) { let d = C.addDays(iso, 1); for (let i = 0; i < 7 && !isWorkDay(d); i++) d = C.addDays(d, 1); return d; }

  function addDay() {
    const emp = activeEmp(); if (!emp) return;
    const rows = rowsOf(emp.id); const r = range(); const t = todayISO();
    const inR = rows.filter(x => (x.type === 'day' || x.type === 'leave') && C.inRange(x.date, r)).map(x => x.date).sort();
    let date;
    if (C.inRange(t, r) && !inR.includes(t) && (!inR.length || inR[inR.length - 1] < t)) date = t;
    else if (inR.length) date = nextWorkDay(inR[inR.length - 1]);
    else if (r.start) date = isWorkDay(r.start) ? r.start : nextWorkDay(r.start);
    else { const all = rows.filter(x => x.type === 'day').map(x => x.date).sort(); date = all.length ? nextWorkDay(all[all.length - 1]) : t; }
    const row = mutate(() => insertChronological(rows, newDay(emp, date)), { render: false });
    if (!C.inRange(date, range())) data.ui.anchor = date;
    render(); flashRow(row.id, 'in');
  }

  function addWeek() {
    const emp = activeEmp(); if (!emp) return;
    const rows = rowsOf(emp.id);
    // leave / holiday dates count as "filled" so a week never adds work rows on top of them
    const have = new Set(rows.filter(x => x.type === 'day' || x.type === 'leave').map(x => x.date));
    let start;
    const mode = data.ui.periodMode;
    const r = range();
    if ((mode === 'week' || mode === 'fortnight')) {
      start = r.start;
      // if the displayed week is already full, move to the next empty one
      const need = d => [...Array(mode === 'week' ? 7 : 14).keys()].map(i => C.addDays(d, i)).filter(x => isWorkDay(x) && !have.has(x));
      if (!need(start).length) { const all = [...have].sort(); start = C.weekStartOf(C.addDays(all[all.length - 1], 7), S().weekStart); }
    } else {
      const all = [...have].sort();
      start = all.length ? C.weekStartOf(C.addDays(all[all.length - 1], 1), S().weekStart) : C.weekStartOf(todayISO(), S().weekStart);
      // if last row is mid-week, fill remainder of that week first
      if (all.length) { const ws = C.weekStartOf(all[all.length - 1], S().weekStart); if ([...Array(7).keys()].some(i => { const d = C.addDays(ws, i); return isWorkDay(d) && !have.has(d) && d > all[all.length - 1]; })) start = ws; }
    }
    const span = mode === 'fortnight' ? 14 : 7;
    const dates = [...Array(span).keys()].map(i => C.addDays(start, i)).filter(d => isWorkDay(d) && !have.has(d));
    if (!dates.length) return toast('Every work day in that week already has a row');
    mutate(() => { for (const d of dates) insertChronological(rows, newDay(emp, d)); }, { render: false });
    if (!C.inRange(dates[0], range())) data.ui.anchor = dates[0];
    render();
    toast(`Added ${dates.length} day${dates.length === 1 ? '' : 's'} (${fmtRange(dates[0], dates[dates.length - 1])}) with default times`);
  }

  function addNote(afterId) {
    const emp = activeEmp(); if (!emp) return;
    const rows = rowsOf(emp.id); const r = range();
    let row;
    mutate(() => {
      if (afterId) {
        const i = rows.findIndex(x => x.id === afterId);
        row = { id: uid('n'), type: 'note', date: rows[i].date, text: '', tone: 'grey' };
        rows.splice(i + 1, 0, row);
      } else {
        const inR = rows.filter(x => C.inRange(x.date, r));
        const last = inR[inR.length - 1];
        const date = last ? last.date : (r.start || todayISO());
        const ws = C.weekStartOf(date, S().weekStart);
        row = { id: uid('n'), type: 'note', date, text: 'End of week ' + fmtRange(ws, C.addDays(ws, 6)), tone: 'grey' };
        if (last) rows.splice(rows.indexOf(last) + 1, 0, row); else insertChronological(rows, row);
      }
    });
    focusField(row.id, 'text');
  }

  function focusField(id, f) {
    const el = $(`tr[data-id="${CSS.escape(id)}"] [data-f="${f}"]`);
    if (el) { el.focus(); if (el.select) el.select(); el.scrollIntoView({ block: 'nearest' }); }
  }
  function flashRow(id, f) {
    const tr = $(`tr[data-id="${CSS.escape(id)}"]`); if (!tr) return;
    tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1500); tr.scrollIntoView({ block: 'nearest' });
    if (f) focusField(id, f);
  }

  function findRow(id) {
    const emp = activeEmp(); if (!emp) return {};
    const rows = rowsOf(emp.id); const i = rows.findIndex(r => r.id === id);
    return { emp, rows, i, row: rows[i] };
  }

  function deleteRow(id) {
    const { rows, i, row } = findRow(id); if (!row) return;
    mutate(() => { rows.splice(i, 1); });
    toast(`${row.type === 'day' ? 'Day ' + fmtDate(row.date) : row.type === 'payment' ? 'Payment' : row.type === 'leave' ? (row.kind === 'holiday' ? 'Holiday ' : 'Leave ') + fmtDate(row.date) : 'Separator'} deleted`, { undo: true });
  }
  function duplicateRow(id) {
    const { emp, rows, i, row } = findRow(id); if (!row) return;
    const copy = Object.assign({}, row, { id: uid(row.type[0]) });
    if (row.type === 'day') { copy.date = nextWorkDay(row.date); copy.paid = false; copy.paidAmount = ''; delete copy.breakStart; }
    if (row.type === 'leave') copy.date = nextWorkDay(row.date);
    mutate(() => { if (row.type === 'day' || row.type === 'leave') insertChronological(rows, copy); else rows.splice(i + 1, 0, copy); }, { render: false });
    if (!C.inRange(copy.date, range())) data.ui.anchor = copy.date;
    render(); flashRow(copy.id);
  }
  function moveRow(id, dir) {
    const { rows, i, row } = findRow(id); if (!row) return;
    // move relative to the neighbour that is visible in this period
    const r = range();
    let j = i + dir;
    while (j >= 0 && j < rows.length && !C.inRange(rows[j].date, r)) j += dir;
    if (j < 0 || j >= rows.length) return;
    mutate(() => { rows.splice(i, 1); rows.splice(j, 0, row); adoptNeighbourDate(rows, row); });
    flashRow(id);
  }
  /** Separator notes take the date of the row above them so they stay in the right period. */
  function adoptNeighbourDate(rows, row) {
    if (row.type !== 'note') return;
    const i = rows.indexOf(row);
    const prev = rows.slice(0, i).reverse().find(x => x.date);
    const next = rows.slice(i + 1).find(x => x.date);
    if (prev) row.date = prev.date; else if (next) row.date = next.date;
  }
  function sortByDate() {
    const emp = activeEmp(); if (!emp) return;
    const rows = rowsOf(emp.id);
    const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => (a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : 0) || a.i - b.i).map(x => x.r);
    if (sorted.every((r, i) => r === rows[i])) return toast('Rows are already in date order');
    mutate(() => { data.rows[activeWs().id][emp.id] = sorted; });
    toast('Sorted by date — totals are unchanged, running balance re-ordered');
  }

  // ---------- field edits ----------
  function commitField(el) {
    const tr = el.closest('tr[data-id]'); if (!tr) return;
    const { emp, row } = findRow(tr.dataset.id); if (!row) return;
    const f = el.dataset.f;
    let v = el.type === 'checkbox' ? el.checked : el.value;

    if (f === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('Please pick a valid date', { error: true }); el.value = row.date; return; }
      if (v === row.date) return;
      mutate(() => { row.date = v; }, { render: false });
      if (!C.inRange(v, range())) toast('Moved to ' + fmtDate(v) + ' — outside this period', { action: 'Show', fn: () => { data.ui.anchor = v; render(); } });
      return 'deferred';
    }

    if (row.type === 'day') {
      if (f === 'in' || f === 'out') {
        const s = String(v).trim().toLowerCase();
        // 12-hour mode: "0600" takes AM/PM from the row's dropdown; "0600PM" / "6:30 am" override it
        const merSel = is12h() ? tr.querySelector(`[data-f="${f}Mer"]`) : null;
        let val;
        if (!s) val = '';
        else if (s === 'n' || s === 'now') val = nowHM();
        else {
          const m = C.parseTime(s, merSel ? merSel.value : null);
          if (m == null) { el.classList.add('invalid'); toast('Could not read "' + v + '" as a time. Try ' + (is12h() ? '0600, 6:30 or 0600PM.' : '9:30, 930, 17:45 or 0600PM.'), { error: true }); return; }
          val = C.toTimeStr(m);
        }
        if (val === row[f]) { el.value = is12h() ? C.split12(C.parseTime(val)).text : val; if (merSel && val) merSel.value = C.split12(C.parseTime(val)).mer; return; }
        return mutate(() => { row[f] = val; });
      }
      if (f === 'inMer' || f === 'outMer') {
        const base = f.slice(0, -3);
        const m = C.parseTime(row[base]);
        if (m == null) return; // no time yet: the choice is used when one is typed
        const pm = m >= 720;
        if (pm === (v === 'PM')) return;
        return mutate(() => { row[base] = C.toTimeStr(pm ? m - 720 : m + 720); });
      }
      if (f === 'breakMin') {
        const m = C.parseDuration(v);
        if (m == null) { el.classList.add('invalid'); toast('Could not read "' + v + '" as a break. Try 30, 0:30 or 1h 15m.', { error: true }); return; }
        if (m === C.parseDuration(row.breakMin)) { el.value = breakStr(m); return; }
        return mutate(() => { row.breakMin = m; });
      }
      if (f === 'rate') {
        const val = String(v).trim() === '' ? null : C.num(v);
        if (val != null && val < 0) return toast('Rate cannot be negative', { error: true });
        return mutate(() => { row.rate = val; });
      }
      if (f === 'paidAmount') {
        const s = String(v).trim();
        const amount = C.computeLedger([row], emp, { decimals: dec() }).rows[0].c.amount;
        if (s === '') return mutate(() => { row.paid = false; row.paidAmount = ''; });
        const n = C.num(s);
        if (n < 0) return toast('Paid amount cannot be negative', { error: true });
        return mutate(() => {
          if (amount > 0 && Math.abs(n - amount) < Math.pow(10, -dec()) / 2) { row.paid = true; row.paidAmount = ''; }
          else { row.paid = false; row.paidAmount = n; }
        });
      }
      if (f === 'paid') {
        return mutate(() => { row.paid = !!v; row.paidAmount = ''; });
      }
      if (f === 'note') return mutate(() => { row.note = v; }, { render: false });
    }

    if (row.type === 'payment') {
      if (f === 'amount') {
        const n = C.num(v);
        if (n <= 0) { toast('Payment amount must be more than zero', { error: true }); el.value = plainNum(row.amount); return; }
        return mutate(() => { row.amount = n; if (row.autoComment) row.comment = payComment(n, row.from, row.to); });
      }
      if (f === 'comment') return mutate(() => { row.comment = v; row.autoComment = false; }, { render: false });
      if (f === 'method') return mutate(() => { row.method = v; }, { render: false });
    }
    if (row.type === 'note' && f === 'text') return mutate(() => { row.text = v; }, { render: false });
    if (row.type === 'leave') {
      if (f === 'kind') return mutate(() => { row.kind = v === 'holiday' ? 'holiday' : 'leave'; });
      if (f === 'note') return mutate(() => { row.note = v; }, { render: false });
    }
  }

  // ---------- leave / holiday ----------
  const leaveRow = (date, kind, note) => ({ id: uid('l'), type: 'leave', date, kind: kind === 'holiday' ? 'holiday' : 'leave', note: note || '' });
  /** A day row can be replaced by leave only if nothing has been paid against it. */
  const replaceableDay = r => r.type === 'day' && !r.paid && !C.num(r.paidAmount);

  /**
   * Mark dates as leave/holiday for a list of employees (ids) in the active workspace.
   * Existing unpaid day rows on those dates are replaced; paid ones are kept.
   */
  function applyLeave(empIds, dates, kind, note) {
    const res = { added: 0, replaced: 0, keptPaid: 0, already: 0 };
    mutate(() => {
      for (const id of empIds) {
        const rows = rowsOf(id);
        for (const d of dates) {
          if (rows.some(x => x.type === 'leave' && x.date === d)) { res.already++; continue; }
          const sameDay = rows.filter(x => x.type === 'day' && x.date === d);
          const paidDays = sameDay.filter(x => !replaceableDay(x));
          res.keptPaid += paidDays.length;
          for (const x of sameDay.filter(replaceableDay)) { rows.splice(rows.indexOf(x), 1); res.replaced++; }
          insertChronological(rows, leaveRow(d, kind, note));
          res.added++;
        }
      }
    }, { render: false });
    return res;
  }

  function convertToLeave(row, kind) {
    const { rows, i } = findRow(row.id); if (i < 0) return;
    const hasPay = !replaceableDay(row);
    mutate(() => { rows.splice(i, 1, Object.assign(leaveRow(row.date, kind, row.note), { id: row.id })); });
    toast(`${fmtDate(row.date)} marked as ${kind}${hasPay ? ' — the pay recorded on that day was removed' : ''}`, { undo: true });
  }
  function convertToDay(row) {
    const { emp, rows, i } = findRow(row.id); if (i < 0) return;
    mutate(() => { rows.splice(i, 1, Object.assign(newDay(emp, row.date), { id: row.id, note: row.note || '' })); });
    flashRow(row.id, 'in');
  }

  // =====================================================================
  // Clock in / out / break
  // =====================================================================
  function clockToggle() {
    const emp = activeEmp(); if (!emp) return toast('Choose an employee first');
    const shift = openShift(emp);
    const rows = rowsOf(emp.id);
    if (shift) {
      mutate(() => {
        if (shift.breakStart) { shift.breakMin = (C.parseDuration(shift.breakMin) || 0) + Math.round((Date.now() - shift.breakStart) / 60000); delete shift.breakStart; }
        shift.out = nowHM();
      });
      const x = ledgerOf(emp).byId[shift.id];
      toast(`Checked out at ${fmtTime(shift.out)} · ${hours(x.c.minutes)} worked · ${money(x.c.amount)}`);
    } else {
      const t = todayISO();
      const blank = rows.find(r => r.type === 'day' && r.date === t && !r.in);
      let row;
      mutate(() => {
        if (blank) { blank.in = nowHM(); blank.out = ''; blank.breakMin = 0; row = blank; }
        else { row = insertChronological(rows, newDay(emp, t, { in: nowHM(), out: '', breakMin: 0 })); }
      }, { render: false });
      if (!C.inRange(t, range())) data.ui.anchor = t;
      render(); flashRow(row.id);
      toast('Checked in at ' + fmtTime(row.in));
    }
  }
  function breakToggle() {
    const emp = activeEmp(); if (!emp) return;
    const shift = openShift(emp);
    if (!shift) return toast('Check in first to start a break');
    if (shift.breakStart) {
      const mins = Math.max(0, Math.round((Date.now() - shift.breakStart) / 60000));
      mutate(() => { shift.breakMin = (C.parseDuration(shift.breakMin) || 0) + mins; delete shift.breakStart; });
      toast('Break ended · ' + C.formatHM(mins) + ' added');
    } else {
      mutate(() => { shift.breakStart = Date.now(); });
      toast('Break started');
    }
  }
  setInterval(() => {
    if (ui.view !== 'employee' || !activeEmp()) return;
    const el = $('#clock'); if (!el || el.contains(document.activeElement)) return;
    const tmp = document.createElement('div'); tmp.innerHTML = renderClock(activeEmp(), openShift(activeEmp()));
    el.replaceWith(tmp.firstElementChild);
  }, 20000);

  // =====================================================================
  // Modals
  // =====================================================================
  let modalStack = [];
  function modal({ title, sub, body, foot, wide, onMount, onClose }) {
    const root = $('#modal-root');
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    bd.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-h"><div><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
      <div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
    root.appendChild(bd);
    const m = { el: bd, close: () => { bd.remove(); modalStack = modalStack.filter(x => x !== m); if (onClose) onClose(); } };
    modalStack.push(m);
    bd.addEventListener('mousedown', e => { if (e.target === bd) m.close(); });
    $$('[data-close]', bd).forEach(b => b.addEventListener('click', m.close));
    if (onMount) onMount(bd, m);
    const first = $('input:not([type=hidden]):not([disabled]), select, textarea', $('.modal-b', bd));
    if (first) setTimeout(() => { first.focus(); if (first.select && first.type !== 'date') first.select(); }, 30);
    return m;
  }
  function confirmModal({ title, message, okText, danger, onOk }) {
    modal({
      title, body: `<div style="color:var(--text-2)">${message}</div>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger-solid' : 'primary'}" data-ok>${esc(okText || 'OK')}</button>`,
      onMount: (el, m) => $('[data-ok]', el).addEventListener('click', () => { m.close(); onOk(); }),
    });
  }

  // ---------- employee ----------
  // Name is global to the person; role, hourly rate and opening balance belong to the active workspace.
  function employeeModal(emp, opts) {
    const editing = !!emp;
    const ws = activeWs();
    const setup = opts && opts.setup;
    const cur = CURRENCIES.find(c => c.code === S().currencyCode);
    const sym = esc((cur || {}).symbol || S().currencySymbol);
    const e = emp || { name: '', role: '', hourlyRate: wsDef(ws).defaultRate || '', openingBalance: '', openingNote: '' };
    const candidates = editing || setup ? [] : data.employees.filter(p => !(p.workspaces || {})[ws.id]);
    const others = editing ? workspacesOf(person(emp.id)).filter(w => w.id !== ws.id) : [];
    const lastWs = editing && !others.length;
    const opt = '<span style="color:var(--muted);font-weight:400">(optional)</span>';
    modal({
      title: setup ? 'Set up TimeLedger' : editing ? 'Edit employee' : 'Add employee to ' + ws.name,
      sub: setup ? 'Name your workspace, choose your currency and add the first person to track. You can change everything later.'
        : editing ? `Role, rate and opening balance apply to <b>${esc(ws.name)}</b> only.`
          : candidates.length ? 'Add a new person, or someone who already works in another workspace.' : null,
      body: `
        ${setup ? `<div class="field"><label>Workspace name</label><input name="wsName" value="${esc(ws.name)}" placeholder="e.g. Head office" maxlength="60"><div class="hint">A site, shop, client or project. Add more later from the workspace menu in the sidebar.</div></div>
          <div class="row2"><div class="field"><label>Currency</label><select name="currency">${CURRENCIES.map(c => `<option value="${c.code}" ${c.code === S().currencyCode ? 'selected' : ''}>${c.code} — ${esc(c.name)} (${esc(c.symbol)})</option>`).join('')}</select></div>
          <div class="field"><label>Week starts on</label><select name="weekStart">${[1, 0, 6].map(d => `<option value="${d}" ${d === S().weekStart ? 'selected' : ''}>${['Sunday', 'Monday', '', '', '', '', 'Saturday'][d]}</option>`).join('')}</select></div></div>` : ''}
        ${candidates.length ? `<div class="field"><label>Employee</label><select name="who"><option value="">+ New person</option><optgroup label="Already in another workspace">${candidates.map(p => `<option value="${p.id}">${esc(p.name)} — ${esc(workspacesOf(p).map(w => w.name).join(', ') || 'no workspace')}</option>`).join('')}</optgroup></select></div>` : ''}
        <div class="field"><label>Full name</label><input name="name" value="${esc(e.name)}" placeholder="e.g. Ayesha Khan" autocomplete="off">${others.length ? '<div class="hint">The name is shared by every workspace this person works in.</div>' : ''}</div>
        <div class="row2">
          <div class="field"><label>Role or employee ID ${opt}</label><input name="role" value="${esc(e.role || '')}" placeholder="e.g. Receptionist"></div>
          <div class="field"><label>Hourly rate in ${esc(ws.name)}</label><div class="input-affix"><span class="affix" data-sym>${sym}</span><input name="hourlyRate" type="number" min="0" step="any" value="${esc(e.hourlyRate)}" placeholder="0"></div><div class="hint" id="rate-hint" hidden></div></div>
        </div>
        <div id="rate-apply" hidden class="field"><span class="label">Apply the new rate to…</span>
          <div class="radio-cards">
            <label><input type="radio" name="applyRate" value="new" checked><div><div class="t">New days only</div><div class="d">Past days keep the rate they were logged with. Recommended.</div></div></label>
            <label><input type="radio" name="applyRate" value="unpaid"><div><div class="t">New days and unpaid days</div><div class="d">Re-prices days that have no payment recorded against them yet.</div></div></label>
            <label><input type="radio" name="applyRate" value="all"><div><div class="t">All days</div><div class="d">Re-prices every day, including paid ones. Balances may change.</div></div></label>
          </div></div>
        <div class="row2">
          <div class="field"><label>Opening balance</label><div class="input-affix"><span class="affix" data-sym>${sym}</span><input name="openingBalance" type="number" step="any" value="${esc(e.openingBalance)}" placeholder="0"></div><div class="hint">Amount already owed in this workspace before using TimeLedger. Use a negative number for an advance.</div></div>
          <div class="field"><label>Opening balance note</label><input name="openingNote" value="${esc(e.openingNote || '')}" placeholder="e.g. From old spreadsheet"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Email ${opt}</label><input name="email" type="email" value="${esc(emp ? (person(emp.id).email || '') : '')}" placeholder="name@example.com" autocomplete="off"></div>
          <div class="field"><label>WhatsApp number ${opt}</label><input name="phone" value="${esc(emp ? (person(emp.id).phone || '') : '')}" placeholder="+92 300 1234567" autocomplete="off"><div class="hint">With country code. Used to share pay updates.</div></div>
        </div>
        <div class="field"><span class="label">Old attendance ${opt}</span><div class="import-box" id="imp-box"></div></div>
        ${others.length ? `<div class="callout">Also works in ${others.map(w => `<b>${esc(w.name)}</b> at ${money(asMember(person(emp.id), w.id).hourlyRate)}/h`).join(', ')}. Each workspace keeps its own rate and ledger.</div>` : ''}`,
      foot: `${editing ? `<button class="btn danger left" data-del>${lastWs ? 'Delete employee' : 'Remove from ' + esc(ws.name)}</button>` : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${setup ? 'Start tracking' : editing ? 'Save changes' : 'Add employee'}</button>`,
      onMount: (el, m) => {
        const F = n => $(`[name=${n}]`, el);
        const rateIn = F('hourlyRate');
        const hasDays = editing && rowsOf(emp.id).some(r => r.type === 'day');
        rateIn.addEventListener('input', () => { $('#rate-apply', el).hidden = !(hasDays && C.num(rateIn.value) !== C.num(emp.hourlyRate)); });
        if (setup) F('currency').addEventListener('change', ev => { const c = CURRENCIES.find(x => x.code === ev.target.value); $$('[data-sym]', el).forEach(s => s.textContent = c.symbol); });
        if (F('who')) F('who').addEventListener('change', () => {
          const p = person(F('who').value);
          const nm = F('name');
          nm.readOnly = !!p;
          if (!p) { nm.value = ''; F('role').value = ''; rateIn.value = wsDef(ws).defaultRate || ''; $('#rate-hint', el).hidden = true; nm.focus(); return; }
          // suggest the role and rate from their most recent workspace
          const src = workspacesOf(p).map(w => asMember(p, w.id)).pop();
          nm.value = p.name;
          F('email').value = p.email || ''; F('phone').value = p.phone || '';
          F('role').value = src ? src.role : '';
          // the workspace default rate wins; otherwise suggest what they earn elsewhere
          rateIn.value = wsDef(ws).defaultRate || (src ? src.hourlyRate : '');
          $('#rate-hint', el).hidden = !src;
          if (src) $('#rate-hint', el).textContent = 'Earns ' + money(src.hourlyRate) + '/h in ' + wsById(src.wsId).name + (wsDef(ws).defaultRate ? '. ' + ws.name + ' default is ' + money(wsDef(ws).defaultRate) + '/h.' : '. Set the rate for ' + ws.name + '.');
          rateIn.focus(); rateIn.select();
        });
        // old attendance waits here until the employee is saved, so Cancel imports nothing
        let pending = null;
        const renderImp = () => {
          $('#imp-box', el).innerHTML = pending
            ? `<div class="imp-ready"><span class="imp-ok">${I.check}</span><div style="min-width:0"><div><b>${pending.rows.length} row${pending.rows.length === 1 ? '' : 's'} ready to import</b> <span style="color:var(--muted)">from ${esc(pending.source)}</span></div><div class="hint">${esc(importSummary(pending))}</div></div>
               <button class="btn sm" type="button" data-imp>Change…</button><button class="btn ghost sm" type="button" data-imp-clear>Remove</button></div>`
            : `<button class="btn" type="button" data-imp>${I.up} Import old attendance…</button><span class="hint">Past days, payments and leave from Excel, Google Sheets or a CSV file. If you import the full history, leave the opening balance at 0.</span>`;
          $('[data-imp]', el).addEventListener('click', () => importModal({ empName: F('name').value.trim(), rate: () => C.num(rateIn.value), existing: editing ? rowsOf(emp.id) : null }, p => { pending = p; renderImp(); }));
          if (pending) $('[data-imp-clear]', el).addEventListener('click', () => { pending = null; renderImp(); });
        };
        renderImp();
        const submit = () => {
          const who = F('who') ? F('who').value : '';
          const name = F('name').value.trim();
          if (!name) { F('name').focus(); return toast('Please enter a name', { error: true }); }
          const rate = C.num(rateIn.value);
          if (rate < 0) return toast('Rate cannot be negative', { error: true });
          const mv = { role: F('role').value.trim(), hourlyRate: rate, openingBalance: C.num(F('openingBalance').value), openingNote: F('openingNote').value.trim() };
          const apply = ($('[name=applyRate]:checked', el) || {}).value || 'new';
          const contact = { email: F('email').value.trim(), phone: F('phone').value.trim() };
          if (contact.email && !/^[^s@]+@[^s@]+.[^s@]+$/.test(contact.email)) { F('email').focus(); return toast('That email address doesn\x27t look right', { error: true }); }
          let imported = null;
          mutate(() => {
            if (setup) {
              const c = CURRENCIES.find(x => x.code === F('currency').value);
              Object.assign(data.settings, { currencyCode: c.code, currencySymbol: c.symbol, decimals: c.decimals, weekStart: +F('weekStart').value });
              ws.name = F('wsName').value.trim() || ws.name;
              nfCache = {};
            }
            if (editing) {
              const p = person(emp.id);
              const L = ledgerOf(emp);
              if (rate !== C.num(emp.hourlyRate) && apply !== 'new') {
                for (const r of rowsOf(emp.id)) {
                  if (r.type !== 'day') continue;
                  const c = L.byId[r.id].c;
                  if (apply === 'all' || (c.directPaid === 0 && c.allocated === 0)) r.rate = rate;
                }
              }
              p.name = name; Object.assign(p, contact);
              Object.assign(p.workspaces[ws.id], mv);
              if (pending) imported = insertImported(p.id, pending.rows, rate, pending.skipExisting);
            } else {
              let p = person(who);
              if (!p) { p = { id: uid('e'), name, createdAt: new Date().toISOString(), workspaces: {} }; data.employees.push(p); }
              Object.assign(p, contact);
              p.workspaces[ws.id] = mv;
              rowsOf(p.id);
              if (pending) imported = insertImported(p.id, pending.rows, rate, false);
              data.ui.activeEmployeeId = p.id; ui.view = 'employee';
            }
          });
          m.close();
          if (imported) showImported(Object.assign({}, imported, { prefix: editing ? 'Employee updated' : name + ' added to ' + ws.name }));
          else toast(editing ? 'Employee updated' : name + ' added to ' + ws.name);
        };
        $('[data-ok]', el).addEventListener('click', submit);
        el.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') submit(); });
        if (editing) $('[data-del]', el).addEventListener('click', () => {
          const n = rowsOf(emp.id).length;
          const rowsTxt = `<b>${n} row${n === 1 ? '' : 's'}</b> of attendance and payment history`;
          confirmModal({
            title: lastWs ? 'Delete ' + emp.name + '?' : 'Remove ' + emp.name + ' from ' + ws.name + '?', danger: true, okText: lastWs ? 'Delete employee' : 'Remove from workspace',
            message: (lastWs ? `This removes the employee and ${rowsTxt}.` : `This removes their ${rowsTxt} in ${esc(ws.name)}. Their records in ${others.map(w => '<b>' + esc(w.name) + '</b>').join(', ')} are kept.`)
              + ' You can undo straight afterwards with Ctrl+Z, and daily backups are kept in the data folder.',
            onOk: () => {
              m.close();
              mutate(() => {
                const p = person(emp.id);
                delete p.workspaces[ws.id]; delete data.rows[ws.id][emp.id]; if (data.groups[ws.id]) delete data.groups[ws.id][emp.id];
                if (!Object.keys(p.workspaces).length) data.employees = data.employees.filter(x => x.id !== emp.id);
                fixActive();
              });
              toast(lastWs ? 'Employee deleted' : emp.name + ' removed from ' + ws.name, { undo: true });
            },
          });
        });
      },
    });
  }

  // ---------- import old attendance ----------
  const IMPORT_FIELDS = [['date', 'Date', true], ['in', 'Check-in'], ['out', 'Check-out'], ['break', 'Rest break'], ['hours', 'Hours (no times)'], ['rate', 'Rate / h'], ['paid', 'Paid'], ['payment', 'Payment amount'], ['type', 'Type (Day, Leave…)'], ['note', 'Notes']];
  const colLetter = k => (k >= 26 ? String.fromCharCode(64 + Math.floor(k / 26)) : '') + String.fromCharCode(65 + (k % 26));

  /**
   * Import dialog: a CSV file or cells pasted from Excel / Google Sheets -> preview -> onUse({ rows, stats, source, skipExisting }).
   * ctx: { empName, rate() -> number, existing: rows[] | null }
   */
  function importModal(ctx, onUse, onCancel) {
    let used = false;
    const st = { text: '', source: '', table: null, header: false, map: {}, order: 'dmy', sure: true, paidAll: false, skip: true, res: null };
    const year = new Date().getFullYear();
    modal({
      title: 'Import old attendance', wide: true,
      sub: `Bring past days, payments and leave for <b>${esc(ctx.empName || 'this employee')}</b> into ${esc(activeWs().name)} from a spreadsheet.`,
      body: `
        <div class="imp-src"><button class="btn" type="button" data-file>${I.up} Choose CSV file…</button>
          <span class="hint">or copy the cells in Excel / Google Sheets and paste them below. Excel files: copy &amp; paste, or save as <b>CSV UTF-8</b>.</span></div>
        <div class="field"><textarea name="paste" rows="5" class="imp-paste" spellcheck="false" placeholder="Paste here, e.g.&#10;Date&#9;Check-in&#9;Check-out&#9;Break&#9;Notes&#10;01/09/2026&#9;09:00&#9;17:30&#9;0:30&#10;02/09/2026&#9;0600PM&#9;1130PM&#9;30&#9;Late shift&#10;03/09/2026&#9;Leave&#9;&#9;&#9;Sick"></textarea></div>
        <div id="imp-cfg"></div>
        <div id="imp-prev"><div class="callout">Accepts dates like 01/09/2026, 2026-09-01 or 1 Sep 2026; times like 9:00, 0600, 6:30 PM; breaks like 30 or 0:30. Write <b>Leave</b> or <b>Holiday</b> in a time or type column to mark a day off. A CSV exported from TimeLedger also works, including its payments.</div></div>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok disabled>Import rows</button>`,
      onClose: () => { if (!used && onCancel) onCancel(); },
      onMount: (el, m) => {
        const ta = $('[name=paste]', el), ok = $('[data-ok]', el);
        const load = (text, source) => {
          st.text = text; st.source = source;
          if (/^PK\u0003\u0004/.test(text)) { st.table = null; $('#imp-cfg', el).innerHTML = ''; $('#imp-prev', el).innerHTML = '<div class="callout red">That is an Excel workbook (.xlsx). In Excel choose <b>File → Save As → CSV UTF-8</b>, or select the cells, copy and paste them here.</div>'; ok.disabled = true; return; }
          if (/\u0000/.test(text.slice(0, 2000))) { st.table = null; $('#imp-cfg', el).innerHTML = ''; $('#imp-prev', el).innerHTML = '<div class="callout red">This file is saved as UTF-16 text. Save it again as <b>CSV UTF-8</b>, or copy and paste the cells here.</div>'; ok.disabled = true; return; }
          st.table = Importer.parseTable(text);
          if (!st.table.rows.length) { st.table = null; $('#imp-cfg', el).innerHTML = ''; $('#imp-prev', el).innerHTML = '<div class="callout amber">Nothing to import yet.</div>'; ok.disabled = true; return; }
          const g = Importer.guessMapping(st.table);
          st.header = g.header; st.map = g.map;
          const d = Importer.detectDateOrder(st.table.rows.slice(st.header ? 1 : 0).map(r => r[st.map.date]));
          st.order = d.order; st.sure = d.sure;
          renderCfg(); preview();
        };
        const colLabel = k => {
          if (st.header) return colLetter(k) + ' · ' + (st.table.rows[0][k] || '(blank)');
          const ex = st.table.rows.map(r => r[k]).find(v => v);
          return colLetter(k) + (ex ? ' · e.g. ' + String(ex).slice(0, 24) : ' · (empty)');
        };
        const renderCfg = () => {
          const width = st.table.rows[0].length;
          $('#imp-cfg', el).innerHTML = `<div class="section-t">Match the columns</div>
            <div class="imp-map">${IMPORT_FIELDS.map(([f, label, req]) => `<label class="imp-f"><span>${esc(label)}${req ? ' <b style="color:var(--red)">*</b>' : ''}</span>
              <select data-map="${f}"><option value="-1">— not in file —</option>${[...Array(width).keys()].map(k => `<option value="${k}" ${st.map[f] === k ? 'selected' : ''}>${esc(colLabel(k))}</option>`).join('')}</select></label>`).join('')}</div>
            <div class="imp-opts">
              <label class="toggle"><input type="checkbox" data-opt="header" ${st.header ? 'checked' : ''}> First row has column names</label>
              <label class="toggle">Dates are <select class="imp-order" data-opt="order"><option value="dmy" ${st.order === 'dmy' ? 'selected' : ''}>day / month / year</option><option value="mdy" ${st.order === 'mdy' ? 'selected' : ''}>month / day / year</option></select>${st.sure ? '' : '<span class="imp-warn">check this — the file doesn\'t say</span>'}</label>
              <label class="toggle"><input type="checkbox" data-opt="paidAll" ${st.paidAll ? 'checked' : ''}> Days with nothing in "Paid" were already paid</label>
              ${ctx.existing && ctx.existing.length ? `<label class="toggle"><input type="checkbox" data-opt="skip" ${st.skip ? 'checked' : ''}> Skip dates that already have an entry</label>` : ''}
            </div>`;
          $$('[data-map]', el).forEach(s => s.addEventListener('change', () => { st.map[s.dataset.map] = +s.value; preview(); }));
          $$('[data-opt]', el).forEach(x => x.addEventListener('change', () => {
            const o = x.dataset.opt;
            if (o === 'order') st.order = x.value; else st[o] = x.checked;
            if (o === 'header') renderCfg();
            preview();
          }));
        };
        const preview = () => {
          if (!st.table) return;
          const body = st.table.rows.slice(st.header ? 1 : 0);
          const res = Importer.buildRows(body, st.map, { order: st.order, year, defaultIn: wsDef().defaultIn, paidAll: st.paidAll, firstLine: st.header ? 2 : 1 });
          const taken = new Set(st.skip && ctx.existing ? ctx.existing.filter(r => r.type === 'day' || r.type === 'leave').map(r => r.date) : []);
          const good = res.items.filter(x => x.row);
          const dupes = good.filter(x => (x.row.type === 'day' || x.row.type === 'leave') && taken.has(x.row.date));
          const use = good.filter(x => !dupes.includes(x));
          st.res = { use: use.map(x => x.row), stats: res.stats, dupes: dupes.length };
          const errs = res.items.filter(x => x.error);
          const rate = ctx.rate();
          const days = use.filter(x => x.row.type === 'day').map(x => x.row);
          const mins = days.reduce((a, r) => a + C.dayHours(r).minutes, 0);
          const amt = days.reduce((a, r) => a + C.amountFor(C.dayHours(r).minutes, r.rate != null ? r.rate : rate, dec()), 0);
          const pays = use.filter(x => x.row.type === 'payment').map(x => x.row);
          const offs = use.filter(x => x.row.type === 'leave').length;
          const dates = use.map(x => x.row.date).sort();
          let html = `<div class="section-t">Preview</div><div class="callout"><div class="kv">
            <span class="k">Rows found</span><span class="v">${body.length}${res.stats.skipped ? ` <span style="color:var(--muted);font-weight:400">· ${res.stats.skipped} total/summary row${res.stats.skipped === 1 ? '' : 's'} ignored</span>` : ''}</span>
            <span class="k">Work days</span><span class="v">${days.length} · ${hours(mins)}${days.length ? ' · ≈ ' + money(amt) : ''}</span>
            ${pays.length ? `<span class="k">Payments</span><span class="v">${pays.length} · ${money(pays.reduce((a, p) => a + p.amount, 0))}</span>` : ''}
            ${offs ? `<span class="k">Leave / holidays</span><span class="v">${offs}</span>` : ''}
            <span class="k tot">Will be imported</span><span class="v tot">${use.length} row${use.length === 1 ? '' : 's'}${dates.length ? ' · ' + esc(dates[0] === dates[dates.length - 1] ? fmtDate(dates[0]) : fmtRange(dates[0], dates[dates.length - 1])) : ''}</span></div></div>`;
          if (dupes.length) html += `<div class="callout amber" style="margin-top:8px">${dupes.length} row${dupes.length === 1 ? '' : 's'} skipped because ${dupes.length === 1 ? 'that date already has' : 'those dates already have'} an entry.</div>`;
          if (errs.length) html += `<div class="callout red" style="margin-top:8px"><b>${errs.length} row${errs.length === 1 ? '' : 's'} can't be read and will be left out:</b><br>${errs.slice(0, 6).map(x => 'Line ' + x.line + ': ' + esc(x.error)).join('<br>')}${errs.length > 6 ? '<br>…and ' + (errs.length - 6) + ' more' : ''}</div>`;
          if (days.some(r => /times estimated/.test(r.note))) html += `<div class="callout" style="margin-top:8px">Rows with only a number of hours start at the workspace's default check-in (${esc(fmtTime(wsDef().defaultIn))}); the check-out is worked out from the hours. The note on each says so.</div>`;
          if (use.length) {
            const show = use.slice(0, 8);
            html += `<div class="imp-table"><table class="simple"><thead><tr><th>Line</th><th>Date</th><th>Type</th><th>Check-in</th><th>Check-out</th><th>Break</th><th class="r">Hours</th><th class="r">Rate</th><th>Paid</th><th>Note</th></tr></thead><tbody>${show.map(x => {
              const r = x.row;
              if (r.type === 'day') { const h = C.dayHours(r); return `<tr><td>${x.line}</td><td>${fmtDate(r.date)}</td><td>Day</td><td>${esc(fmtTime(r.in))}</td><td>${esc(fmtTime(r.out))}</td><td>${C.formatHM(h.breakMin)}</td><td class="r">${hours(h.minutes)}</td><td class="r">${r.rate != null ? esc(plainNum(r.rate)) : '<span style="color:var(--faint)">' + esc(plainNum(rate)) + '</span>'}</td><td>${r.paid ? 'Paid' : r.paidAmount ? money(r.paidAmount) : '—'}</td><td class="imp-note">${esc(r.note)}</td></tr>`; }
              if (r.type === 'payment') return `<tr><td>${x.line}</td><td>${fmtDate(r.date)}</td><td>Payment</td><td colspan="5"></td><td>${money(r.amount)}</td><td class="imp-note">${esc(r.comment)}</td></tr>`;
              if (r.type === 'leave') return `<tr><td>${x.line}</td><td>${fmtDate(r.date)}</td><td>${r.kind === 'holiday' ? 'Holiday' : 'Leave'}</td><td colspan="6"></td><td class="imp-note">${esc(r.note)}</td></tr>`;
              return `<tr><td>${x.line}</td><td>${fmtDate(r.date)}</td><td>Separator</td><td colspan="6"></td><td class="imp-note">${esc(r.text)}</td></tr>`;
            }).join('')}</tbody></table>${use.length > 8 ? `<div class="hint" style="padding:6px 12px;color:var(--muted)">…and ${use.length - 8} more</div>` : ''}</div>`;
          }
          $('#imp-prev', el).innerHTML = html;
          ok.disabled = !use.length;
          ok.textContent = use.length ? 'Import ' + use.length + ' row' + (use.length === 1 ? '' : 's') : 'Import rows';
        };
        let t = null;
        ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => load(ta.value, 'pasted cells'), 200); });
        $('[data-file]', el).addEventListener('click', async () => {
          const f = await pickTextFile('Spreadsheet (CSV)', ['csv', 'tsv', 'txt']);
          if (!f) return;
          ta.value = f.content.length > 200000 ? f.content.slice(0, 200000) : f.content;
          load(f.content, f.name);
        });
        ok.addEventListener('click', () => {
          if (!st.res || !st.res.use.length) return;
          used = true;
          m.close();
          onUse({ rows: st.res.use.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)), stats: st.res.stats, source: st.source, skipExisting: st.skip });
        });
      },
    });
  }

  /** Put imported rows into an employee's ledger in the active workspace (call inside mutate). */
  function insertImported(empId, list, rate, skipExisting, wsId) {
    const rows = rowsOf(empId, wsId);
    const taken = new Set(skipExisting ? rows.filter(r => r.type === 'day' || r.type === 'leave').map(r => r.date) : []);
    let added = 0, skipped = 0;
    for (const r of list) {
      if ((r.type === 'day' || r.type === 'leave') && taken.has(r.date)) { skipped++; continue; }
      const row = Object.assign({ id: uid(r.type[0]) }, r);
      if (row.type === 'day' && (row.rate == null || row.rate === '')) row.rate = rate;
      insertChronological(rows, row);
      added++;
    }
    return { added, skipped };
  }
  const importSummary = p => {
    const s = p.rows.reduce((a, r) => { a[r.type === 'leave' ? 'leave' : r.type] = (a[r.type === 'leave' ? 'leave' : r.type] || 0) + 1; return a; }, {});
    const dates = p.rows.map(r => r.date);
    return [s.day ? s.day + ' day' + (s.day === 1 ? '' : 's') : '', s.payment ? s.payment + ' payment' + (s.payment === 1 ? '' : 's') : '', s.leave ? s.leave + ' leave/holiday' : '', s.note ? s.note + ' separator' + (s.note === 1 ? '' : 's') : ''].filter(Boolean).join(' · ')
      + ' · ' + (dates[0] === dates[dates.length - 1] ? fmtDate(dates[0]) : fmtRange(dates[0], dates[dates.length - 1]));
  };
  function showImported(res) {
    toast(`${res.prefix ? res.prefix + ' · i' : 'I'}mported ${res.added} row${res.added === 1 ? '' : 's'}${res.skipped ? ' (' + res.skipped + ' already there, skipped)' : ''}`, { action: 'Show all dates', fn: () => { data.ui.periodMode = 'all'; saveUI(); render(); } });
  }
  /** Import straight into the active employee's ledger (toolbar / menu). */
  function importForActive() {
    const emp = activeEmp(); if (!emp) return;
    importModal({ empName: emp.name, rate: () => emp.hourlyRate, existing: rowsOf(emp.id) }, p => {
      let res;
      mutate(() => { res = insertImported(emp.id, p.rows, emp.hourlyRate, p.skipExisting); });
      showImported(res);
    });
  }

  // ---------- share updates with the employee ----------
  const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'there';
  /** "+92 300-1234567" -> "923001234567" (wa.me wants digits with the country code, no +) */
  const waDigits = s => String(s || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  function openExternal(url) { if (api && api.openExternal) return api.openExternal(url); window.open(url, '_blank', 'noopener'); }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (_) { /* fall through */ }
    if (api && api.copyText) { await api.copyText(t); return true; }
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
  const VIA = { copy: 'copied', email: 'email', whatsapp: 'WhatsApp' };

  /**
   * Plain-text update an employee can read anywhere (WhatsApp, email, SMS).
   * o: { payment, range, rangeLabel, days, balance }
   */
  function shareText(emp, o) {
    const ws = activeWs();
    const L = ledgerOf(emp);
    const V = C.periodView(L, o.range);
    const t = V.totals;
    const out = [`Hi ${firstName(emp.name)},`, ''];
    if (o.payment) {
      const p = o.payment, pc = L.byId[p.id] ? L.byId[p.id].c : null;
      out.push(`Payment received from ${ws.name}:`);
      out.push(`✅ ${money(p.amount)} paid on ${fmtDate(p.date)}${p.method ? ' by ' + p.method.toLowerCase() : ''}`);
      if (p.from || p.to) out.push(`For work: ${fmtRange(p.from, p.to)}${pc && pc.covers.length ? ' (' + pc.covers.length + ' day' + (pc.covers.length === 1 ? '' : 's') + ')' : ''}`);
      out.push('');
    } else out.push(`Here is your attendance and pay update from ${ws.name}.`, '');
    // what the employee cares about: what these days earned and how much of that has been paid
    // (by day ticks or by any payment matched to them), not which payments happen to be dated in the range
    const days = V.rows.filter(x => x.row.type === 'day').map(x => x.c);
    const paidFor = C.roundMoney(days.reduce((a, c) => a + Math.min(c.amount, c.paidTotal), 0), dec());
    const dueFor = C.roundMoney(days.reduce((a, c) => a + Math.max(0, c.balance), 0), dec());
    out.push(`${o.rangeLabel}:`);
    const off = t.leave + t.holidays;
    out.push(`• Days worked: ${t.days}${off ? ' (+ ' + [t.leave ? t.leave + ' leave' : '', t.holidays ? t.holidays + ' holiday' + (t.holidays === 1 ? '' : 's') : ''].filter(Boolean).join(', ') + ')' : ''}`);
    out.push(`• Hours: ${hours(t.minutes)}`);
    out.push(`• Earned: ${money(t.earned)}`);
    out.push(`• Paid for these days: ${money(paidFor)}`);
    if (dueFor > 0) out.push(`• Still due for these days: ${money(dueFor)}`);
    if (o.days) {
      const lines = V.rows.filter(x => x.row.type !== 'note').map(({ row, c }) => {
        const d = DOW[dowOf(row.date)] + ' ' + fmtDate(row.date, false);
        if (row.type === 'day') return `${d} · ${c.status === 'ok' ? fmtTime(row.in) + '–' + fmtTime(row.out) + ' · ' + hours(c.minutes) + ' · ' + money(c.amount) : 'incomplete'}${c.state === 'paid' || c.state === 'covered' ? ' · paid' : c.state === 'partial' ? ' · part paid' : ''}`;
        if (row.type === 'leave') return `${d} · ${row.kind === 'holiday' ? 'Holiday' : 'Leave'}${row.note ? ' (' + row.note + ')' : ''}`;
        return `${d} · Payment ${money(c.amount)}`;
      });
      if (lines.length) out.push('', ...lines);
    }
    if (o.balance) {
      const bal = L.totals.balance;
      out.push('', bal > 0 ? `Balance still due to you: ${money(bal)}` : bal < 0 ? `Paid in advance: ${money(-bal)}` : 'You are fully paid up to date. ✔');
    }
    out.push('', `— ${ws.name}`);
    return out.join('\n');
  }

  /** opts: { paymentId } to start from a payment receipt. */
  function shareModal(opts) {
    const emp = activeEmp(); if (!emp) return;
    const p0 = person(emp.id);
    const ws = activeWs();
    const rows = rowsOf(emp.id);
    const payments = rows.filter(r => r.type === 'payment' && C.num(r.amount) > 0).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const start = (opts && opts.paymentId && payments.find(p => p.id === opts.paymentId)) || null;
    const viewLabel = data.ui.periodMode === 'all' ? 'All time' : $('#period-label').textContent || fmtRange(range().start, range().end);
    const sharedNote = p => p.shared && p.shared.length ? ' · shared ' + VIA[p.shared[p.shared.length - 1].via] : '';
    modal({
      title: 'Share update with ' + emp.name, wide: true,
      sub: 'Send a payment receipt or a pay summary so ' + esc(firstName(emp.name)) + ' knows what was recorded and paid.',
      body: `
        <div class="row2">
          <div class="field"><label>What to share</label><select name="what">
            ${payments.length ? `<optgroup label="Payment receipt">${payments.slice(0, 15).map(p => `<option value="${p.id}" ${start && start.id === p.id ? 'selected' : ''}>${esc(money(p.amount) + ' · paid ' + fmtDate(p.date) + sharedNote(p))}</option>`).join('')}</optgroup>` : ''}
            <option value="">Attendance &amp; pay summary only</option></select></div>
          <div class="field"><label>Covering</label><select name="period"></select></div>
        </div>
        <div class="share-opts">
          <label class="toggle"><input type="checkbox" name="days"> List each day</label>
          <label class="toggle"><input type="checkbox" name="balance" checked> Include balance still due</label>
        </div>
        <div class="field" style="margin-top:10px"><label>Message</label><textarea name="msg" rows="13" class="share-msg"></textarea><div class="hint">Edit freely before sending. Changing the options above rewrites it.</div></div>
        <div class="row2">
          <div class="field"><label>Email</label><input name="email" type="email" value="${esc(p0.email || '')}" placeholder="name@example.com"></div>
          <div class="field"><label>WhatsApp number</label><input name="phone" value="${esc(p0.phone || '')}" placeholder="+92 300 1234567"><div class="hint" id="wa-hint">With country code. Leave blank to choose the contact in WhatsApp.</div></div>
        </div>
        <label class="toggle" id="save-contact" hidden><input type="checkbox" name="saveContact" checked> Save email and number for ${esc(emp.name)}</label>`,
      foot: `<button class="btn left" data-send="copy">${I.copy} Copy text</button><button class="btn" data-send="email">${I.mail} Email</button><button class="btn success" data-send="whatsapp">${I.wa} WhatsApp</button>`,
      onMount: (el, m) => {
        const F = n => $(`[name=${n}]`, el);
        if (!start && payments.length && !(opts && opts.summary)) F('what').value = payments[0].id;
        if (opts && opts.summary) F('what').value = '';
        const pay = () => payments.find(p => p.id === F('what').value) || null;
        const periods = () => {
          const p = pay();
          const list = [];
          if (p && (p.from || p.to)) list.push(['pay', 'Days this payment covers (' + fmtRange(p.from, p.to) + ')']);
          list.push(['view', 'Period on screen (' + viewLabel + ')'], ['month', 'This month (' + MONTHS_LONG[new Date().getMonth()] + ')'], ['all', 'All time']);
          const keep = F('period').value;
          F('period').innerHTML = list.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
          F('period').value = list.some(x => x[0] === keep) && keep !== 'pay' ? keep : list[0][0];
        };
        const rangeFor = v => {
          const p = pay();
          if (v === 'pay' && p) return { range: { start: p.from || null, end: p.to || null }, label: 'Work covered (' + fmtRange(p.from, p.to) + ')' };
          if (v === 'month') { const r = C.periodRange('month', todayISO()); return { range: r, label: MONTHS_LONG[+r.start.slice(5, 7) - 1] + ' ' + r.start.slice(0, 4) }; }
          if (v === 'all') return { range: { start: null, end: null }, label: 'All time' };
          return { range: range(), label: viewLabel };
        };
        const subject = () => { const p = pay(); return p ? `Payment received: ${money(p.amount)} — ${ws.name}` : `Your attendance and pay update — ${ws.name}`; };
        const build = () => { const rf = rangeFor(F('period').value); F('msg').value = shareText(emp, { payment: pay(), range: rf.range, rangeLabel: rf.label, days: F('days').checked, balance: F('balance').checked }); };
        const contactChanged = () => { $('#save-contact', el).hidden = F('email').value.trim() === (p0.email || '') && F('phone').value.trim() === (p0.phone || ''); };
        F('what').addEventListener('change', () => { periods(); build(); });
        ['period', 'days', 'balance'].forEach(n => F(n).addEventListener('change', build));
        ['email', 'phone'].forEach(n => F(n).addEventListener('input', contactChanged));
        F('phone').addEventListener('input', () => {
          const raw = F('phone').value.trim();
          $('#wa-hint', el).textContent = raw && /^0/.test(raw) ? 'Add the country code (e.g. +92 instead of the leading 0) so WhatsApp finds the right number.' : 'With country code. Leave blank to choose the contact in WhatsApp.';
          $('#wa-hint', el).style.color = raw && /^0/.test(raw) ? 'var(--amber)' : '';
        });
        periods(); build();
        const markShared = via => {
          const p = pay();
          const c = { email: F('email').value.trim(), phone: F('phone').value.trim() };
          const save = !$('#save-contact', el).hidden && F('saveContact').checked;
          if (!p && !save) return;
          // recording who was told is bookkeeping, not an edit to undo
          if (p) (p.shared = p.shared || []).push({ via, at: new Date().toISOString() });
          if (save) Object.assign(p0, c);
          scheduleSave(); requestRender();
        };
        $$('[data-send]', el).forEach(b => b.addEventListener('click', async () => {
          const via = b.dataset.send, msg = F('msg').value;
          if (!msg.trim()) return toast('The message is empty', { error: true });
          if (via === 'copy') {
            if (!(await copyText(msg))) return toast('Could not copy — select the text and press Ctrl+C', { error: true });
            toast('Copied — paste it into any chat or email');
          } else if (via === 'email') {
            const to = F('email').value.trim();
            if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { F('email').focus(); return toast('That email address doesn\'t look right', { error: true }); }
            let url = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject()) + '&body=' + encodeURIComponent(msg);
            // mail apps cut very long mailto links; hand the full text over via the clipboard instead
            if (url.length > 1900) { await copyText(msg); url = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject()) + '&body=' + encodeURIComponent('(The full update is on your clipboard — paste it here.)'); toast('Message is long: it is on your clipboard — paste it into the email'); }
            openExternal(url);
          } else {
            const d = waDigits(F('phone').value);
            if (F('phone').value.trim() && d.length < 8) { F('phone').focus(); return toast('Enter the WhatsApp number with country code, e.g. +92 300 1234567', { error: true }); }
            openExternal('https://wa.me/' + d + '?text=' + encodeURIComponent(msg));
          }
          markShared(via);
          m.close();
        }));
      },
    });
  }

  // ---------- workspaces ----------
  function switchWorkspace(id) {
    if (!wsById(id) || id === activeWs().id) return;
    data.ui.activeWorkspaceId = id;
    ui.search = ''; $('#emp-search').value = ''; ui.filter = 'all';
    if (ui.view === 'overview') ui.ovScope = 'ws';
    fixActive(); saveUI(); render();
  }

  function workspaceMenu(btn) {
    const cur = activeWs();
    const html = `<div class="ws-menu-h">Workspaces</div>` + data.workspaces.map(w => {
      const n = members(w.id).length;
      return `<button data-ws="${w.id}" class="ws-opt ${w.id === cur.id ? 'on' : ''}"><span class="ws-mark" style="background:${avatarColor(w.name)}">${esc(initials(w.name))}</span>
        <span class="ws-opt-t"><span class="nm">${esc(w.name)}</span><span class="sub">${n} employee${n === 1 ? '' : 's'}${w.details ? ' · ' + esc(w.details) : ''}</span></span>${w.id === cur.id ? `<span class="ok">${I.check}</span>` : ''}</button>`;
    }).join('') + `<hr><button data-wa="new">${I.plus} New workspace…</button><button data-wa="edit">${I.edit} Edit “${esc(cur.name)}”…</button>`;
    const p = popAt(btn, html, 'menu ws-menu');
    p.addEventListener('click', e => {
      const b = e.target.closest('[data-ws],[data-wa]'); if (!b) return;
      closePop();
      if (b.dataset.ws) switchWorkspace(b.dataset.ws);
      else if (b.dataset.wa === 'new') workspaceModal(null);
      else workspaceModal(activeWs());
    });
  }

  /**
   * Create / edit a workspace: name, details, work defaults (check-in/out, break, work days, hourly rate)
   * and which employees work here — each with their rate in this workspace and optional old attendance.
   * Nothing is written until Save; everything lands in one undo step.
   */
  function workspaceModal(ws) {
    const editing = !!ws;
    const w = ws || { name: '', details: '' };
    const def = editing ? wsDef(ws) : { defaultIn: S().defaultIn, defaultOut: S().defaultOut, defaultBreak: S().defaultBreak, workDays: S().workDays, defaultRate: null };
    const n = editing ? members(ws.id).length : 0;
    const rowsN = editing ? Object.values(data.rows[ws.id] || {}).reduce((a, x) => a + x.length, 0) : 0;
    const src = activeWs();
    const sym = esc(S().currencySymbol);
    const opt = '<span style="color:var(--muted);font-weight:400">(optional)</span>';
    // people who can be assigned: everyone not already in this workspace
    const pool = data.employees.filter(p => !(editing && p.workspaces[ws.id]));
    const rateOf = p => { const m = asMember(p, src.id) || workspacesOf(p).map(x => asMember(p, x.id))[0]; return m ? m.hourlyRate : 0; };
    const roleOf = p => { const m = asMember(p, src.id) || workspacesOf(p).map(x => asMember(p, x.id))[0]; return m ? m.role : ''; };
    const pending = {};          // key -> import payload
    let newCount = 0;
    const assignRow = (key, p) => `<tr data-key="${key}" class="${p ? '' : 'new-person'}">
        <td class="c"><input type="checkbox" data-pick ${p ? '' : 'checked'}></td>
        <td>${p ? `<div class="who">${avatar(p)}<div><div style="font-weight:600">${esc(p.name)}</div><div class="sub">${esc(workspacesOf(p).map(x => x.name).join(', ') || 'No workspace yet')}</div></div></div>`
          : `<input class="cell-in as-name" data-name placeholder="New employee's full name" autocomplete="off">`}</td>
        <td><div class="input-affix sm"><span class="affix">${sym}</span><input type="number" min="0" step="any" data-rate value="${p ? esc(def.defaultRate || rateOf(p) || '') : esc(def.defaultRate || '')}" data-own="${p ? esc(rateOf(p)) : ''}" placeholder="0" ${p ? 'disabled' : ''}></div>${p && rateOf(p) ? `<div class="as-hint">${money(rateOf(p))}/h elsewhere</div>` : ''}</td>
        <td><label class="toggle"><input type="checkbox" data-imp ${p ? 'disabled' : ''}> Import old attendance</label><div class="as-imp" data-imp-status></div></td>
      </tr>`;
    modal({
      title: editing ? 'Edit workspace' : 'New workspace', wide: true,
      sub: editing ? `${n} employee${n === 1 ? '' : 's'} · ${rowsN} row${rowsN === 1 ? '' : 's'}` : 'A workspace is a separate site, shop, client or project. One person can work in several, with a different hourly rate in each.',
      body: `
        <div class="row2">
          <div class="field"><label>Workspace name</label><input name="name" value="${esc(w.name)}" placeholder="e.g. Downtown branch" maxlength="60" autocomplete="off"></div>
          <div class="field"><label>Details ${opt}</label><input name="details" value="${esc(w.details)}" placeholder="Address, client, contact person…" maxlength="200"></div>
        </div>
        <div class="section-t">Work defaults for this workspace</div>
        <div class="row4">
          <div class="field"><label>Default check-in</label><input name="defaultIn" value="${esc(fmtTime(def.defaultIn))}" placeholder="${is12h() ? '09:00 AM' : '09:00'}"></div>
          <div class="field"><label>Default check-out</label><input name="defaultOut" value="${esc(fmtTime(def.defaultOut))}" placeholder="${is12h() ? '05:00 PM' : '17:00'}"></div>
          <div class="field"><label>Default rest break</label><input name="defaultBreak" value="${esc(C.formatHM(C.parseDuration(def.defaultBreak) || 0))}" placeholder="1:00"></div>
          <div class="field"><label>Default hourly rate</label><div class="input-affix"><span class="affix">${sym}</span><input name="defaultRate" type="number" min="0" step="any" value="${esc(def.defaultRate || '')}" placeholder="—"></div></div>
        </div>
        <div class="field"><span class="label">Work days <span style="color:var(--muted);font-weight:400">(used by "Add week" and leave ranges)</span></span><div class="checks">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" name="wd" value="${d}" ${def.workDays.includes(d) ? 'checked' : ''}>${DOW[d]}</label>`).join('')}</div>
          <div class="hint">New rows in this workspace use these times. The default rate is filled in for employees you add here; each person can still have their own rate.</div></div>
        <div class="section-t">${editing ? 'Add employees to this workspace' : 'Employees'}</div>
        <div class="assign-wrap"><table class="simple assign"><thead><tr><th class="c"></th><th>Employee</th><th>Rate here / h</th><th>Old attendance</th></tr></thead>
          <tbody id="as-body">${pool.map(p => assignRow(p.id, p)).join('')}</tbody></table>
          <div class="as-foot"><button class="btn sm" type="button" data-new>${I.plus} New employee</button>
            <span class="hint" id="as-count"></span></div></div>`,
      foot: `${editing ? `<button class="btn danger left" data-del ${data.workspaces.length < 2 ? 'disabled title="You need at least one workspace"' : ''}>Delete workspace</button>` : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${editing ? 'Save workspace' : 'Create workspace'}</button>`,
      onMount: (el, m) => {
        const F = n => $(`[name=${n}]`, el);
        const body = $('#as-body', el);
        const nameOf = tr => tr.dataset.key.startsWith('new') ? $('[data-name]', tr).value.trim() : person(tr.dataset.key).name;
        const refresh = () => {
          const picked = $$('tr[data-key]', body).filter(tr => $('[data-pick]', tr).checked);
          $('#as-count', el).textContent = picked.length ? picked.length + ' employee' + (picked.length === 1 ? '' : 's') + ' will be added' + (editing ? '' : ' to this workspace') : (editing ? '' : 'You can also add employees later.');
          if (!pool.length && !$$('tr[data-key]', body).length) body.innerHTML = `<tr class="as-empty"><td colspan="4">${data.employees.length ? 'Everyone already works in this workspace.' : 'No employees yet. Add the first one here.'}</td></tr>`;
        };
        const status = tr => {
          const p = pending[tr.dataset.key];
          $('[data-imp-status]', tr).innerHTML = p ? `<span class="as-ok">${I.check} ${p.rows.length} row${p.rows.length === 1 ? '' : 's'}</span> <button class="linkish" type="button" data-imp-edit>Change</button>` : '';
          if (p) $('[data-imp-edit]', tr).addEventListener('click', () => openImport(tr));
        };
        const openImport = tr => {
          const box = $('[data-imp]', tr);
          importModal({ empName: nameOf(tr) || 'new employee', rate: () => C.num($('[data-rate]', tr).value) }, p => { pending[tr.dataset.key] = p; box.checked = true; status(tr); },
            () => { if (!pending[tr.dataset.key]) box.checked = false; });
        };
        const wire = tr => {
          const pick = $('[data-pick]', tr), rate = $('[data-rate]', tr), imp = $('[data-imp]', tr);
          const sync = () => { rate.disabled = imp.disabled = !pick.checked; tr.classList.toggle('on', pick.checked); refresh(); };
          pick.addEventListener('change', sync);
          rate.addEventListener('input', () => { rate.dataset.touched = '1'; });
          imp.addEventListener('change', () => {
            if (imp.checked) openImport(tr);
            else { delete pending[tr.dataset.key]; status(tr); }
          });
          sync();
        };
        $$('tr[data-key]', body).forEach(wire);
        // a new default rate flows into rates the user hasn't typed over
        F('defaultRate').addEventListener('input', () => {
          const v = F('defaultRate').value;
          $$('tr[data-key] [data-rate]', body).forEach(r => { if (!r.dataset.touched) r.value = v || r.dataset.own || ''; });
        });
        $('[data-new]', el).addEventListener('click', () => {
          const empty = $('.as-empty', body); if (empty) empty.remove();
          const key = 'new' + (++newCount);
          body.insertAdjacentHTML('beforeend', assignRow(key, null));
          const tr = $(`tr[data-key="${key}"]`, body);
          $('[data-rate]', tr).value = F('defaultRate').value;
          wire(tr); $('[data-name]', tr).focus();
        });
        refresh();
        const submit = () => {
          const name = F('name').value.trim();
          if (!name) { F('name').focus(); return toast('Please enter a workspace name', { error: true }); }
          if (data.workspaces.some(x => x.id !== (ws && ws.id) && x.name.toLowerCase() === name.toLowerCase())) { F('name').focus(); return toast('A workspace called "' + name + '" already exists', { error: true }); }
          const din = C.parseTime(F('defaultIn').value), dout = C.parseTime(F('defaultOut').value), dbr = C.parseDuration(F('defaultBreak').value);
          if (din == null || dout == null) return toast('Default times must look like 09:00 or 09:00 AM', { error: true });
          if (dbr == null) return toast('Default break must look like 1:00 or 60', { error: true });
          const wd = $$('[name=wd]:checked', el).map(x => +x.value);
          if (!wd.length) return toast('Pick at least one work day', { error: true });
          const defRate = C.num(F('defaultRate').value);
          if (defRate < 0) return toast('Rate cannot be negative', { error: true });
          const picks = $$('tr[data-key]', body).filter(tr => $('[data-pick]', tr).checked).map(tr => ({ key: tr.dataset.key, name: nameOf(tr), rate: C.num($('[data-rate]', tr).value) }));
          const unnamed = picks.find(p => p.key.startsWith('new') && !p.name);
          if (unnamed) { $(`tr[data-key="${unnamed.key}"] [data-name]`, body).focus(); return toast('Enter a name for the new employee, or untick the row', { error: true }); }
          if (picks.some(p => p.rate < 0)) return toast('Rate cannot be negative', { error: true });
          const vals = { name, details: F('details').value.trim(), defaultIn: C.toTimeStr(din), defaultOut: C.toTimeStr(dout), defaultBreak: dbr, workDays: wd, defaultRate: defRate > 0 ? defRate : null };
          const target = editing ? ws : newWorkspace(name, vals.details);
          let imported = 0;
          mutate(() => {
            Object.assign(target, vals);
            if (!editing) { data.workspaces.push(target); data.rows[target.id] = {}; }
            for (const pk of picks) {
              let p = pk.key.startsWith('new') ? null : person(pk.key);
              if (!p) { p = { id: uid('e'), name: pk.name, createdAt: new Date().toISOString(), workspaces: {} }; data.employees.push(p); }
              p.workspaces[target.id] = { role: pk.key.startsWith('new') ? '' : roleOf(p), hourlyRate: pk.rate, openingBalance: 0, openingNote: '' };
              rowsOf(p.id, target.id);
              if (pending[pk.key]) imported += insertImported(p.id, pending[pk.key].rows, pk.rate, false, target.id).added;
            }
            if (!editing) {
              data.ui.activeWorkspaceId = target.id; ui.search = ''; ui.filter = 'all'; ui.ovScope = 'ws';
              if (ui.view !== 'overview') ui.view = 'employee';
            }
            fixActive();
          });
          $('#emp-search').value = '';
          m.close();
          const parts = [picks.length ? picks.length + ' employee' + (picks.length === 1 ? '' : 's') + ' added' : '', imported ? imported + ' old row' + (imported === 1 ? '' : 's') + ' imported' : ''].filter(Boolean).join(', ');
          toast((editing ? 'Workspace updated' : 'Workspace "' + name + '" created') + (parts ? ' · ' + parts : ''));
        };
        $('[data-ok]', el).addEventListener('click', submit);
        F('name').addEventListener('keydown', ev => { if (ev.key === 'Enter') submit(); });
        if (editing) $('[data-del]', el).addEventListener('click', () => {
          if (data.workspaces.length < 2) return;
          const only = members(ws.id).filter(e => workspacesOf(person(e.id)).length === 1);
          confirmModal({
            title: 'Delete ' + ws.name + '?', danger: true, okText: 'Delete workspace',
            message: `This removes the workspace and <b>${rowsN} row${rowsN === 1 ? '' : 's'}</b> of attendance and payment history for ${n} employee${n === 1 ? '' : 's'}.`
              + (only.length ? ` <b>${only.map(e => esc(e.name)).join(', ')}</b> ${only.length === 1 ? 'works' : 'work'} only here and will be deleted.` : '')
              + ' Their records in other workspaces are kept. You can undo straight afterwards with Ctrl+Z.',
            onOk: () => {
              m.close();
              mutate(() => {
                for (const p of data.employees) if (p.workspaces[ws.id]) { delete p.workspaces[ws.id]; p._drop = !Object.keys(p.workspaces).length; }
                data.employees = data.employees.filter(p => { const d = p._drop; delete p._drop; return !d; });
                delete data.rows[ws.id]; delete data.groups[ws.id];
                data.workspaces = data.workspaces.filter(x => x.id !== ws.id);
                fixActive();
              });
              toast('Workspace deleted', { undo: true });
            },
          });
        });
      },
    });
  }

  // ---------- leave / holiday ----------
  function leaveModal(date) {
    const emp = activeEmp(); if (!emp) return;
    const ws = activeWs();
    const team = members();
    const t = todayISO(), r = range();
    const d0 = date || (C.inRange(t, r) ? t : r.start || t);
    const wdNames = wsDef().workDays.slice().sort((a, b) => ((a - S().weekStart + 7) % 7) - ((b - S().weekStart + 7) % 7)).map(d => DOW[d]).join(', ');
    const opt = '<span style="color:var(--muted);font-weight:400">(optional)</span>';
    modal({
      title: 'Mark leave or holiday',
      sub: 'Leave and holiday days have no hours and no pay. "Add week" skips them and they are counted in the HR overview.',
      body: `
        <div class="radio-cards two">
          <label><input type="radio" name="kind" value="leave" checked><div><div class="t">Leave</div><div class="d">Time off for one person: sick, annual, personal.</div></div></label>
          <label><input type="radio" name="kind" value="holiday"><div><div class="t">Holiday</div><div class="d">A day off for the workspace: public or company holiday.</div></div></label>
        </div>
        <div class="row2" style="margin-top:13px">
          <div class="field"><label>From</label><input type="date" name="from" value="${d0}"></div>
          <div class="field"><label>To</label><input type="date" name="to" value="${d0}"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Apply to</label><select name="who"><option value="one">${esc(emp.name)} only</option>${team.length > 1 ? `<option value="all">Everyone in ${esc(ws.name)} (${team.length})</option>` : ''}</select></div>
          <div class="field"><label>Reason ${opt}</label><input name="note" placeholder="e.g. Sick leave" maxlength="80"></div>
        </div>
        <label class="toggle"><input type="checkbox" name="workOnly" checked> Only work days (${esc(wdNames)})</label>
        <div id="leave-preview" style="margin-top:12px"></div>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${I.leave} <span data-oklbl>Mark as leave</span></button>`,
      onMount: (el, m) => {
        const F = n => $(`[name=${n}]`, el);
        let whoTouched = false;
        F('who').addEventListener('change', () => { whoTouched = true; update(); });
        const kind = () => $('[name=kind]:checked', el).value;
        const read = () => {
          const from = F('from').value, to = F('to').value || from;
          const dates = [];
          if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) {
            for (let d = from; d <= to && dates.length <= 366; d = C.addDays(d, 1)) if (!F('workOnly').checked || isWorkDay(d)) dates.push(d);
          }
          const ids = F('who').value === 'all' ? team.map(x => x.id) : [emp.id];
          return { from, to, dates, ids, kind: kind(), note: F('note').value.trim() };
        };
        const update = () => {
          const v = read();
          $('[data-oklbl]', el).textContent = v.kind === 'holiday' ? 'Mark as holiday' : 'Mark as leave';
          F('note').placeholder = v.kind === 'holiday' ? 'e.g. Independence Day' : 'e.g. Sick leave';
          let add = 0, repl = 0, paid = 0, already = 0;
          for (const id of v.ids) {
            const rows = rowsOf(id);
            for (const d of v.dates) {
              if (rows.some(x => x.type === 'leave' && x.date === d)) { already++; continue; }
              add++;
              for (const x of rows) if (x.type === 'day' && x.date === d) { if (replaceableDay(x)) repl++; else paid++; }
            }
          }
          let html;
          if (v.from && v.to && v.from > v.to) html = '<div class="callout red">"From" is after "To".</div>';
          else if (v.dates.length > 366) html = '<div class="callout red">Choose a range of one year or less.</div>';
          else if (!v.dates.length) html = '<div class="callout amber">No dates in this range' + (F('workOnly').checked ? ' fall on a work day.' : '.') + '</div>';
          else {
            const who = v.ids.length > 1 ? v.ids.length + ' employees' : esc(emp.name);
            html = `<div class="callout"><div class="kv">
              <span class="k">Dates</span><span class="v">${esc(v.dates.length === 1 ? fmtDate(v.dates[0]) : fmtRange(v.from, v.to))} · ${v.dates.length} day${v.dates.length === 1 ? '' : 's'}</span>
              <span class="k">Applies to</span><span class="v">${who}</span>
              <span class="k tot">${v.kind === 'holiday' ? 'Holiday' : 'Leave'} rows to add</span><span class="v tot">${add}</span></div></div>`;
            if (repl) html += `<div class="callout amber" style="margin-top:8px"><b>${repl}</b> unpaid work row${repl === 1 ? '' : 's'} on these dates will be replaced.</div>`;
            if (paid) html += `<div class="callout amber" style="margin-top:8px"><b>${paid}</b> work row${paid === 1 ? ' has' : 's have'} pay recorded and will be kept. Their hours still count.</div>`;
            if (already) html += `<div class="callout" style="margin-top:8px">${already} date${already === 1 ? ' is' : 's are'} already marked and will be skipped.</div>`;
          }
          $('#leave-preview', el).innerHTML = html;
        };
        $$('[name=kind]', el).forEach(x => x.addEventListener('change', () => {
          if (!whoTouched && team.length > 1) F('who').value = kind() === 'holiday' ? 'all' : 'one';
          update();
        }));
        ['from', 'to', 'workOnly'].forEach(n => F(n).addEventListener('change', update));
        F('from').addEventListener('change', () => { if (!F('to').value || F('to').value < F('from').value) { F('to').value = F('from').value; update(); } });
        update();
        const submit = () => {
          const v = read();
          if (!v.dates.length || v.dates.length > 366) return toast('Choose a valid date range', { error: true });
          const res = applyLeave(v.ids, v.dates, v.kind, v.note);
          m.close();
          if (!C.inRange(v.dates[0], range())) data.ui.anchor = v.dates[0];
          render();
          const label = v.kind === 'holiday' ? 'Holiday' : 'Leave';
          toast(res.added ? `${label} marked: ${res.added} day${res.added === 1 ? '' : 's'}${v.ids.length > 1 ? ' across ' + v.ids.length + ' employees' : ''}${res.replaced ? ', ' + res.replaced + ' work row' + (res.replaced === 1 ? '' : 's') + ' replaced' : ''}` : 'Those dates are already marked', { undo: res.added > 0 });
        };
        $('[data-ok]', el).addEventListener('click', submit);
      },
    });
  }

  // ---------- payment ----------
  function paymentModal(existing) {
    const emp = activeEmp(); if (!emp) return;
    const rows = rowsOf(emp.id);
    const L = ledgerOf(emp);
    const r = range();
    const t = todayISO();
    let p;
    if (existing) p = Object.assign({}, existing);
    else {
      // default: settle the outstanding days in the current period
      const out = L.rows.filter(x => x.row.type === 'day' && x.c.balance > 0 && C.inRange(x.row.date, r)).map(x => x.row.date).sort();
      const date = r.end && r.end < t ? r.end : t;
      p = { id: uid('p'), type: 'payment', date, amount: '', from: out[0] || r.start || '', to: out.length ? out[out.length - 1] : (r.end && r.end < t ? r.end : t), method: 'Cash', comment: '', autoComment: true };
    }
    let autoComment = existing ? !!existing.autoComment : true;

    modal({
      title: existing ? 'Edit payment' : 'Record a payment',
      sub: 'Payments reduce the running balance on their date and are matched to unpaid days in the range you choose.',
      body: `
        <div class="row2">
          <div class="field"><label>Amount paid</label><div class="input-affix"><span class="affix">${esc(S().currencySymbol)}</span><input name="amount" type="number" min="0" step="any" value="${esc(plainNum(p.amount))}" placeholder="0"></div></div>
          <div class="field"><label>Date paid</label><input name="date" type="date" value="${esc(p.date)}"></div>
        </div>
        <div class="row3">
          <div class="field"><label>Covers from</label><input name="from" type="date" value="${esc(p.from || '')}"></div>
          <div class="field"><label>Covers to</label><input name="to" type="date" value="${esc(p.to || '')}"></div>
          <div class="field"><label>Method</label><select name="method">${METHODS.map(m => `<option ${m === (p.method || 'Cash') ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Comment</label><input name="comment" value="${esc(p.comment)}" placeholder="Paid … from … to …"><div class="hint">Written for you from the amount and dates. Edit freely.</div></div>
        <div id="pay-preview"></div>`,
      foot: `${existing ? '<button class="btn danger left" data-del>Delete payment</button>' : '<button class="btn left" data-full>Pay full outstanding</button>'}<button class="btn" data-close>Cancel</button><button class="btn success" data-ok>${I.check} ${existing ? 'Save payment' : 'Record payment'}</button>`,
      onMount: (el, m) => {
        const F = n => $(`[name=${n}]`, el);
        const read = () => ({ amount: C.num(F('amount').value), date: F('date').value, from: F('from').value, to: F('to').value, method: F('method').value, comment: F('comment').value });
        const outstandingIn = (from, to) => {
          const others = rows.filter(x => x.id !== p.id);
          const LL = C.computeLedger(others, emp, { decimals: dec() });
          return LL.rows.filter(x => x.row.type === 'day' && x.c.balance > 0 && C.inRange(x.row.date, { start: from || null, end: to || null })).reduce((a, x) => ({ sum: C.roundMoney(a.sum + x.c.balance, dec()), n: a.n + 1 }), { sum: 0, n: 0 });
        };
        const update = () => {
          const v = read();
          if (autoComment) F('comment').value = v.amount > 0 ? payComment(v.amount, v.from, v.to) : '';
          const o = outstandingIn(v.from, v.to);
          const sim = rows.filter(x => x.id !== p.id).concat([Object.assign({}, p, v)]);
          const LL = C.computeLedger(sim, emp, { decimals: dec() });
          const pc = LL.byId[p.id].c;
          let html = `<div class="callout"><div class="kv">
            <span class="k">Outstanding ${v.from || v.to ? 'in ' + esc(fmtRange(v.from, v.to)) : '(all dates)'}</span><span class="v">${money(o.sum)} <span style="color:var(--muted);font-weight:400">· ${o.n} day${o.n === 1 ? '' : 's'}</span></span>
            <span class="k">This payment</span><span class="v">−${money(v.amount)}</span>
            <span class="k tot">Left to pay in range</span><span class="v tot">${money(Math.max(0, o.sum - pc.applied))}</span>
            <span class="k">Balance after payment (all-time)</span><span class="v">${money(LL.totals.balance)}</span></div></div>`;
          if (v.amount > 0 && pc.covers.length) {
            const full = pc.covers.filter(id => LL.byId[id].c.balance <= 0).length;
            html += `<div class="callout green" style="margin-top:8px">Applied to <b>${pc.covers.length} day${pc.covers.length === 1 ? '' : 's'}</b>, oldest first — ${full} fully settled${pc.covers.length - full ? ', 1 part-paid' : ''}. Settled days show a teal tick.</div>`;
          }
          if (pc.unapplied > 0 && v.amount > 0) html += `<div class="callout amber" style="margin-top:8px"><b>${money(pc.unapplied)}</b> is more than what's owed in this range. It will be kept as credit (an advance) and still reduces the balance.</div>`;
          if (v.from && v.to && v.from > v.to) html += `<div class="callout red" style="margin-top:8px">"Covers from" is after "Covers to".</div>`;
          $('#pay-preview', el).innerHTML = html;
        };
        ['amount', 'date', 'from', 'to'].forEach(n => F(n).addEventListener('input', update));
        F('comment').addEventListener('input', () => { autoComment = F('comment').value.trim() === ''; });
        update();
        if ($('[data-full]', el)) $('[data-full]', el).addEventListener('click', () => { const v = read(); F('amount').value = outstandingIn(v.from, v.to).sum || ''; update(); F('amount').focus(); });
        const submit = () => {
          const v = read();
          if (!(v.amount > 0)) { F('amount').focus(); return toast('Enter an amount greater than zero', { error: true }); }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return toast('Choose the date the payment was made', { error: true });
          if (v.from && v.to && v.from > v.to) return toast('"Covers from" must be on or before "Covers to"', { error: true });
          if (!v.comment.trim()) v.comment = payComment(v.amount, v.from, v.to);
          mutate(() => {
            const rec = Object.assign(existing || p, v, { autoComment });
            if (!existing) {
              // place it right after the last row it covers (or chronologically)
              const anchorDate = v.to && v.to <= v.date ? v.date : v.date;
              insertChronological(rows, Object.assign(rec, { date: v.date }));
              void anchorDate;
            }
          }, { render: false });
          m.close();
          if (!C.inRange(v.date, range())) data.ui.anchor = v.date;
          render(); flashRow(p.id);
          toast('Payment of ' + money(v.amount) + ' recorded', existing ? {} : { action: 'Share with ' + firstName(emp.name), fn: () => shareModal({ paymentId: p.id }) });
        };
        $('[data-ok]', el).addEventListener('click', submit);
        el.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') submit(); });
        if (existing) $('[data-del]', el).addEventListener('click', () => { m.close(); deleteRow(existing.id); });
      },
    });
  }

  // ---------- pay groups ----------
  /**
   * Create or edit a pay group: a date range whose days and payments are shown as one block with
   * total hours, amount, paid and pending balance. preset { from, to, payment } fills a new group.
   */
  function groupModal(existing, preset) {
    const emp = activeEmp(); if (!emp) return;
    const rows = rowsOf(emp.id);
    const groups = groupsOf(emp.id);
    const L = ledgerOf(emp);
    const others = groups.filter(g => !existing || g.id !== existing.id);
    const inOther = d => others.some(o => d >= o.from && d <= o.to);
    const takenBy = C.assignPayments(rows, others);
    const pays = rows.filter(x => x.type === 'payment').slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const fits = (p, from, to) => !!(p.from && p.to && from && to && p.from >= from && p.to <= to);

    let g;
    if (existing) g = existing;
    else {
      // default: from the first day not in a group, to the last date that the free payments after it cover
      const p = preset || {};
      const free = rows.filter(x => x.type === 'day' && x.date && !inOther(x.date)).map(x => x.date).sort();
      const from = p.from || free[0] || range().start || todayISO();
      const payTo = pays.filter(x => !takenBy.has(x.id) && x.from && x.to && x.from >= from).map(x => x.to).sort().pop();
      const to = p.to || payTo || free.filter(d => d >= from).pop() || from;
      g = { id: uid('g'), from, to: to < from ? from : to, label: '', add: [], remove: [], collapsed: false };
    }
    // hand-picked choices: id -> true (in) / false (out); everything else follows the dates
    const picked = new Map();
    for (const id of g.add || []) picked.set(id, true);
    for (const id of g.remove || []) picked.set(id, false);
    if (preset && preset.payment) picked.set(preset.payment, true);

    modal({
      title: existing ? 'Edit pay group' : 'Wrap days in a pay group',
      sub: 'Shows a stretch of days with their payments as one block: total hours, amount, paid and the pending balance. Balances are not changed.',
      wide: true,
      body: `
        <div class="row3">
          <div class="field"><label>From</label><input name="from" type="date" value="${esc(g.from)}"></div>
          <div class="field"><label>To</label><input name="to" type="date" value="${esc(g.to)}"></div>
          <div class="field"><label>Label <span style="color:var(--muted);font-weight:400">(optional)</span></label><input name="label" value="${esc(g.label)}" placeholder="e.g. Paid in two instalments"></div>
        </div>
        <div class="field"><div class="label">Payments in this group</div>
          <div class="hint">Payments that cover dates inside the group are ticked for you. Tick any other payment for these days, such as one recorded without dates.</div>
          <div class="grp-pick" id="grp-pick"></div></div>
        <div id="grp-preview"></div>`,
      foot: `${existing ? '<button class="btn danger left" data-del title="Remove the group. Its days and payments are kept.">Ungroup</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${I.group} ${existing ? 'Save group' : 'Create group'}</button>`,
      onMount: (el, m) => {
        const F = n => $(`[name=${n}]`, el);
        const read = () => ({ from: F('from').value, to: F('to').value, label: F('label').value.trim() });
        const isIn = (p, v) => picked.has(p.id) ? picked.get(p.id) : fits(p, v.from, v.to);
        const draft = v => {
          const add = [], remove = [];
          for (const p of pays) {
            if (takenBy.has(p.id)) continue;
            const auto = fits(p, v.from, v.to), on = isIn(p, v);
            if (on && !auto) add.push(p.id);
            if (!on && auto) remove.push(p.id);
          }
          return { id: g.id, from: v.from, to: v.to, label: v.label, add, remove };
        };
        const problem = v => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v.from) || !/^\d{4}-\d{2}-\d{2}$/.test(v.to)) return 'Choose the first and last date of the group.';
          if (v.from > v.to) return '"From" is after "To".';
          const o = others.find(o => v.from <= o.to && v.to >= o.from);
          if (o) return 'These dates overlap the pay group ' + fmtRange(o.from, o.to) + '. A day can be in one group only.';
          return '';
        };
        const drawPick = () => {
          const v = read();
          $('#grp-pick', el).innerHTML = pays.length ? pays.map(p => {
            const other = takenBy.get(p.id); const og = other && others.find(o => o.id === other);
            const auto = fits(p, v.from, v.to);
            return `<label class="${og ? 'off' : ''}"><input type="checkbox" data-pid="${p.id}" ${og ? 'disabled' : isIn(p, v) ? 'checked' : ''}>
              <span class="d">${fmtDate(p.date)}</span><b class="num">${money(C.num(p.amount))}</b><span class="m">${esc(p.method || '')}</span>
              <span class="c">${p.from || p.to ? 'covers ' + esc(fmtRange(p.from, p.to)) : 'no dates'}${og ? ' · in group ' + esc(fmtRange(og.from, og.to)) : auto ? ' · inside the group' : ''}</span></label>`;
          }).join('') : '<div class="hint" style="padding:8px 10px">No payments recorded yet. Use Record payment, and payments for these dates join the group.</div>';
        };
        const update = () => {
          const v = read(); const err = problem(v);
          if (err) { $('#grp-preview', el).innerHTML = `<div class="callout red">${esc(err)}</div>`; return; }
          const d = draft(v);
          const s = C.groupSummary(L, d, C.assignPayments(rows, others.concat([d])));
          const parts = (s.paidOnDay > 0 ? [money(s.paidOnDay) + ' on the day'] : []).concat(s.payments.map(p => money(p.amount)));
          $('#grp-preview', el).innerHTML = `<div class="callout"><div class="kv">
            <span class="k">Days worked</span><span class="v">${s.days}${s.leave + s.holidays ? ' <span style="color:var(--muted);font-weight:400">· ' + (s.leave + s.holidays) + ' off</span>' : ''}</span>
            <span class="k">Total hours</span><span class="v">${hours(s.minutes)}</span>
            <span class="k">Total amount</span><span class="v">${money(s.earned)}</span>
            <span class="k">Total paid</span><span class="v">${parts.length > 1 ? esc(parts.join(' + ')) + ' = ' : ''}${money(s.paid)}</span>
            <span class="k tot">${s.pending < 0 ? 'Paid in advance' : 'Pending balance'}</span><span class="v tot">${money(Math.abs(s.pending))}</span></div></div>
            ${s.earned > 0 && s.pending === 0 ? `<div class="callout green" style="margin-top:8px">${I.check} These days are paid in full.</div>` : ''}`;
        };
        ['from', 'to'].forEach(n => F(n).addEventListener('input', () => { drawPick(); update(); }));
        $('#grp-pick', el).addEventListener('change', ev => { const c = ev.target.closest('[data-pid]'); if (!c) return; picked.set(c.dataset.pid, c.checked); update(); });
        drawPick(); update();
        const submit = () => {
          const v = read(); const err = problem(v);
          if (err) return toast(err, { error: true });
          const d = draft(v);
          mutate(() => {
            if (existing) Object.assign(existing, { from: d.from, to: d.to, label: d.label, add: d.add, remove: d.remove });
            else groups.push(Object.assign(g, d));
            groups.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
          }, { render: false });
          m.close();
          const r = range();
          if ((r.start && d.to < r.start) || (r.end && d.from > r.end)) data.ui.anchor = d.from;
          render();
          const tr = $(`tr.grp-head[data-gid="${CSS.escape(g.id)}"]`);
          if (tr) tr.scrollIntoView({ block: 'nearest' });
          toast(existing ? 'Pay group saved' : 'Pay group created for ' + fmtRange(d.from, d.to), { undo: true });
        };
        $('[data-ok]', el).addEventListener('click', submit);
        el.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && ev.target.type !== 'checkbox') submit(); });
        if (existing) $('[data-del]', el).addEventListener('click', () => {
          m.close();
          mutate(() => { groups.splice(groups.indexOf(existing), 1); });
          toast('Ungrouped ' + fmtRange(existing.from, existing.to) + '. Days and payments are kept', { undo: true });
        });
      },
    });
  }
  function takeOutOfGroup(g, row) {
    mutate(() => {
      g.add = g.add.filter(id => id !== row.id);
      if (row.from && row.to && row.from >= g.from && row.to <= g.to && !g.remove.includes(row.id)) g.remove.push(row.id);
    });
    toast('Payment taken out of the pay group', { undo: true });
  }

  // ---------- settings ----------
  function settingsModal() {
    const s = S();
    const isPreset = CURRENCIES.some(c => c.code === s.currencyCode && c.symbol === s.currencySymbol);
    modal({
      title: 'Settings', wide: true,
      body: `
        <div class="section-t">Currency &amp; numbers</div>
        <div class="row3">
          <div class="field"><label>Currency</label><select name="preset">${CURRENCIES.map(c => `<option value="${c.code}" ${isPreset && c.code === s.currencyCode ? 'selected' : ''}>${c.code} — ${esc(c.name)}</option>`).join('')}<option value="__custom" ${!isPreset ? 'selected' : ''}>Custom…</option></select></div>
          <div class="field"><label>Code</label><input name="currencyCode" value="${esc(s.currencyCode)}" maxlength="6"></div>
          <div class="field"><label>Symbol shown</label><input name="currencySymbol" value="${esc(s.currencySymbol)}" maxlength="6"></div>
        </div>
        <div class="row3">
          <div class="field"><label>Decimal places</label><select name="decimals">${[0, 1, 2, 3].map(d => `<option ${d === s.decimals ? 'selected' : ''}>${d}</option>`).join('')}</select><div class="hint">Amounts are rounded per row, like a spreadsheet cell.</div></div>
          <div class="field"><label>Number format</label><select name="numberLocale">${Object.entries(NUMBER_LOCALES).map(([k, v]) => `<option value="${k}" ${k === s.numberLocale ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label>Symbol position</label><select name="symbolAfter"><option value="0" ${!s.symbolAfter ? 'selected' : ''}>Before (Rs 1,000)</option><option value="1" ${s.symbolAfter ? 'selected' : ''}>After (1,000 Rs)</option></select></div>
        </div>
        <div class="callout" id="money-preview"></div>

        <div class="section-t">Work defaults <span style="text-transform:none;letter-spacing:0;font-weight:500">· starting values for new workspaces (each workspace can set its own)</span></div>
        <div class="row3">
          <div class="field"><label>Default check-in</label><input name="defaultIn" value="${esc(fmtTime(s.defaultIn))}" placeholder="${is12h() ? '09:00 AM' : '09:00'}"></div>
          <div class="field"><label>Default check-out</label><input name="defaultOut" value="${esc(fmtTime(s.defaultOut))}" placeholder="${is12h() ? '05:00 PM' : '17:00'}"></div>
          <div class="field"><label>Default rest break</label><input name="defaultBreak" value="${esc(C.formatHM(C.parseDuration(s.defaultBreak) || 0))}" placeholder="1:00"></div>
        </div>
        <div class="row2">
          <div class="field"><span class="label">Work days <span style="color:var(--muted);font-weight:400">(used by "Add week")</span></span><div class="checks">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" name="wd" value="${d}" ${s.workDays.includes(d) ? 'checked' : ''}>${DOW[d]}</label>`).join('')}</div></div>
          <div class="field"><label>Week starts on</label><select name="weekStart">${[1, 0, 6].map(d => `<option value="${d}" ${d === s.weekStart ? 'selected' : ''}>${['Sunday', 'Monday', '', '', '', '', 'Saturday'][d]}</option>`).join('')}</select></div>
        </div>

        <div class="section-t">Display</div>
        <div class="row2">
          <div class="field"><label>Check-in / check-out time format</label><select name="timeFormat"><option value="24" ${s.timeFormat !== '12' ? 'selected' : ''}>24-hour (18:30)</option><option value="12" ${s.timeFormat === '12' ? 'selected' : ''}>12-hour with AM / PM (06:30 PM)</option></select>
            <div class="hint">Either way, type <span class="kbd">0600</span> for 06:00 or <span class="kbd">0600PM</span> for 06:00 PM. In 12-hour mode each time has an AM/PM dropdown.</div></div>
          <div class="field"><label>Hours shown as</label><select name="hoursDisplay">${[['both', 'Both: 7.53 (7h 32m)'], ['hm', 'Hours and minutes only: 7h 32m'], ['decimal', 'Calculated only: 7.53']].map(([v, l]) => `<option value="${v}" ${(s.hoursDisplay || 'both') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <div class="hint">Applies to working hours, week and period totals, the HR overview and shared messages. The calculated figure (hours as a decimal) is what pay is worked out from.</div></div>
        </div>
        <div class="row2">
          <div class="field"><label>Theme</label><select name="theme"><option value="system" ${s.theme === 'system' ? 'selected' : ''}>Match system</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option></select></div>
          <div class="field"><label>Rate column</label><select name="showRate"><option value="1" ${s.showRate ? 'selected' : ''}>Show (per-day rates)</option><option value="0" ${!s.showRate ? 'selected' : ''}>Hide</option></select></div>
        </div>

        <div class="section-t">Data</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" data-a="backup-center">${I.cloud} Backup &amp; sync…</button>
          <button class="btn" data-a="backup">${I.down} Save a backup file</button>
          <button class="btn" data-a="restore">Restore from backup…</button>
          ${api ? '<button class="btn" data-a="reveal">Show data file</button>' : ''}
          <button class="btn" data-a="sample">Add sample employees</button>
        </div>
        <div class="hint" style="color:var(--muted);font-size:12px;margin-top:8px">${api ? 'Saved automatically to ' + esc(dataPath) + '. A daily backup is kept for 1 week.' : 'Running in a browser preview — data is kept in this browser only.'}</div>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save settings</button>`,
      onMount: (el, m) => {
        const F = n => $(`[name=${n}]`, el);
        const preview = () => {
          const tmp = Object.assign({}, s, { currencySymbol: F('currencySymbol').value || F('currencyCode').value, decimals: +F('decimals').value, numberLocale: F('numberLocale').value, symbolAfter: F('symbolAfter').value === '1' });
          const saved = data.settings; data.settings = tmp; nfCache = {};
          $('#money-preview', el).innerHTML = 'Preview: <b>' + money(12345.678) + '</b> · <b>' + money(-460) + '</b>';
          data.settings = saved; nfCache = {};
        };
        F('preset').addEventListener('change', () => {
          const c = CURRENCIES.find(x => x.code === F('preset').value);
          if (c) { F('currencyCode').value = c.code; F('currencySymbol').value = c.symbol; F('decimals').value = c.decimals; }
          else F('currencyCode').focus();
          preview();
        });
        ['currencyCode', 'currencySymbol'].forEach(n => F(n).addEventListener('input', () => { F('preset').value = '__custom'; preview(); }));
        ['decimals', 'numberLocale', 'symbolAfter'].forEach(n => F(n).addEventListener('change', preview));
        preview();
        F('timeFormat').addEventListener('change', () => {
          const fmt = F('timeFormat').value;
          for (const n of ['defaultIn', 'defaultOut']) { const mm = C.parseTime(F(n).value); if (mm != null) F(n).value = C.formatClock(mm, fmt); }
        });
        $$('[data-a]', el).forEach(b => b.addEventListener('click', () => {
          const a = b.dataset.a;
          if (a === 'backup') backup();
          if (a === 'backup-center') { m.close(); backupCenter(); }
          if (a === 'restore') { m.close(); restore(); }
          if (a === 'reveal') api.reveal(dataPath);
          if (a === 'sample') { m.close(); loadSample(); }
        }));
        $('[data-ok]', el).addEventListener('click', () => {
          const din = C.parseTime(F('defaultIn').value), dout = C.parseTime(F('defaultOut').value), dbr = C.parseDuration(F('defaultBreak').value);
          if (din == null || dout == null) return toast('Default times must look like 09:00 or 09:00 AM', { error: true });
          if (dbr == null) return toast('Default break must look like 1:00 or 60', { error: true });
          const wd = $$('[name=wd]:checked', el).map(x => +x.value);
          if (!wd.length) return toast('Pick at least one work day', { error: true });
          const code = F('currencyCode').value.trim().toUpperCase() || 'CUR';
          mutate(() => {
            Object.assign(data.settings, {
              currencyCode: code, currencySymbol: F('currencySymbol').value.trim() || code, decimals: +F('decimals').value,
              numberLocale: F('numberLocale').value, symbolAfter: F('symbolAfter').value === '1',
              defaultIn: C.toTimeStr(din), defaultOut: C.toTimeStr(dout), defaultBreak: dbr, workDays: wd, weekStart: +F('weekStart').value,
              hoursDisplay: F('hoursDisplay').value, theme: F('theme').value, showRate: F('showRate').value === '1', timeFormat: F('timeFormat').value,
            });
            nfCache = {};
          });
          m.close(); toast('Settings saved');
        });
      },
    });
  }

  // ---------- verify (self-review checkpoint) ----------
  function verifyModal() {
    const emp = activeEmp(); if (!emp) return;
    const res = C.verify(rowsOf(emp.id), emp, { decimals: dec(), groups: groupsOf(emp.id) });
    const checks = res.checks.slice();
    // Period chain: this period's brought-forward must equal last period's carried-forward
    const r = range();
    const V = C.periodView(res.ledger, r);
    const okPeriod = C.roundMoney(V.carryIn + V.totals.earned - V.totals.paid, dec()) === V.carryOut;
    let chainOk = true, chainDetail = 'Brought forward + Earned − Paid = Carried forward for this period';
    if (data.ui.periodMode !== 'all' && data.ui.periodMode !== 'custom') {
      const prevR = C.periodRange(data.ui.periodMode, C.shiftPeriod(data.ui.periodMode, data.ui.anchor, -1, S().weekStart), S().weekStart);
      const PV = C.periodView(res.ledger, prevR);
      chainOk = PV.carryOut === V.carryIn;
      chainDetail += chainOk ? '; matches the previous period\'s carried-forward (' + money(PV.carryOut) + ')' : '; previous period carried ' + money(PV.carryOut) + ' but this period brought ' + money(V.carryIn);
    }
    checks.splice(3, 0, { level: okPeriod && chainOk ? 'pass' : 'fail', title: 'Carry-forward chains between periods', detail: chainDetail });
    // Table structure
    const badRows = rowsOf(emp.id).filter(x => !x.id || !/^\d{4}-\d{2}-\d{2}$/.test(x.date || '')).length;
    checks.push({ level: badRows ? 'fail' : 'pass', title: 'Table is correctly structured', detail: badRows ? badRows + ' row(s) missing an ID or a valid date' : rowsOf(emp.id).length + ' rows, each with a valid date and type' });

    const fails = checks.filter(c => c.level === 'fail').length, warns = checks.filter(c => c.level === 'warn').length;
    const verdict = fails ? 'fail' : warns ? 'warn' : 'pass';
    const vt = { pass: ['All checks passed', 'Every hour, amount and balance was recalculated independently and matches.'], warn: ['Calculations are correct', warns + ' thing' + (warns === 1 ? '' : 's') + ' worth a look below — totals are not affected.'], fail: [fails + ' check' + (fails === 1 ? '' : 's') + ' failed', 'Fix the rows listed below. Use the "Needs attention" filter to find them.'] }[verdict];
    modal({
      title: 'Verify calculations', sub: esc(emp.name) + ' · all ' + rowsOf(emp.id).length + ' rows', wide: true,
      body: `<div class="verdict ${verdict}"><div class="st" style="font-size:22px;font-weight:800">${verdict === 'pass' ? '✓' : '!'}</div><div><div class="big">${vt[0]}</div><div>${vt[1]}</div></div></div>
        <ul class="checklist">${checks.map(c => `<li class="${c.level}"><span class="st">${c.level === 'pass' ? '✓' : '!'}</span><div style="min-width:0"><div class="t">${esc(c.title)}</div><div class="d">${esc(c.detail)}</div></div></li>`).join('')}</ul>
        <div class="section-t">Summary</div>
        <div class="callout"><div class="kv">
          <span class="k">Opening balance</span><span class="v">${money(res.ledger.opening)}</span>
          <span class="k">Total hours</span><span class="v">${hours(res.ledger.totals.minutes)}</span>
          <span class="k">Total earned</span><span class="v">${money(res.ledger.totals.earned)}</span>
          <span class="k">Paid on days</span><span class="v">−${money(res.ledger.totals.paidDirect)}</span>
          <span class="k">Payment rows</span><span class="v">−${money(res.ledger.totals.payments)}</span>
          <span class="k tot">Balance owed</span><span class="v tot">${money(res.ledger.totals.balance)}</span></div></div>`,
      foot: `${warns || fails ? '<button class="btn left" data-issues>Show rows needing attention</button>' : ''}<button class="btn primary" data-close>Done</button>`,
      onMount: (el, m) => { const b = $('[data-issues]', el); if (b) b.addEventListener('click', () => { m.close(); ui.filter = 'issues'; data.ui.periodMode = 'all'; saveUI(); render(); }); },
    });
  }

  // ---------- help ----------
  function helpModal() {
    const sym = S().currencySymbol;
    modal({
      title: 'How calculations work', wide: true,
      body: `<div class="help">
        <p>Every figure is recalculated from the values you type each time anything changes. Formulas never point at a cell position, so adding, deleting, dragging or sorting rows can't break them.</p>
        <div class="section-t">Working hours</div>
        <div class="formula"><b>Working hours</b> = Check-out − Check-in − Rest break<br>09:00 → 17:30 with a 0:30 break = 8:30 − 0:30 = <b>8:00</b> (8.00 h)</div>
        <p>If check-out is earlier than check-in, the shift is treated as overnight (22:00 → 06:00 = 8:00). Type times as <span class="kbd">9</span>, <span class="kbd">930</span>, <span class="kbd">0600</span>, <span class="kbd">09:30</span>, <span class="kbd">0600PM</span> or <span class="kbd">n</span> for now. With the 12-hour format (Settings → Display), a time typed without AM/PM uses the dropdown next to it. Breaks accept <span class="kbd">30</span>, <span class="kbd">0:30</span>, <span class="kbd">1h 15m</span>.</p>
        <div class="section-t">Amount</div>
        <div class="formula"><b>Amount</b> = Working hours × Hourly rate<br>8.00 h × ${esc(sym)} 500 = <b>${esc(sym)} 4,000</b></div>
        <p>Each day stores the rate it was logged at, so changing an employee's rate later won't silently re-price old days. Amounts are rounded per row to the decimal places set in Settings.</p>
        <div class="section-t">Paid, balance and payments</div>
        <div class="formula"><b>Balance</b> (per day) = Amount − Paid on the day − Share of payment rows</div>
        <p>There are two ways to record pay: tick <b>Paid</b> on a day (or type a partial amount), or use <b>Record payment</b> for a lump sum covering a date range — for example "Paid ${esc(sym)} 460 for 01 Sep – 07 Sep". Payment rows are matched to the oldest unpaid days in their range, and those days get a teal tick. Anything left over is kept as credit.</p>
        <div class="section-t">Pay groups</div>
        <div class="formula"><b>Total paid</b> = Paid on the day + Σ(Payments in the group)<br><b>Pending balance</b> = Total amount − Total paid</div>
        <p>When someone is paid for a stretch of days in instalments, use <b>Pay group</b> to wrap those days with their payments. The group shows its days, then its payments, then a total row with hours, amount, paid and pending balance, for example "Paid ${esc(sym)} 300 + ${esc(sym)} 300 = ${esc(sym)} 600 · ${esc(sym)} 94 Pending balance". Payments that cover dates inside the group join it automatically. Click the arrow to fold a group to its totals. Grouping never changes a balance.</p>
        <div class="section-t">Running balance &amp; carry-forward</div>
        <div class="formula"><b>Running balance</b> = Brought forward + Σ(Amount − Paid on the day) − Σ(Payment rows)<br><b>Carried forward</b> = Brought forward + Earned this period − Paid this period</div>
        <p>When you move to the next week or month, its <b>Brought forward</b> row is exactly the previous period's <b>Carried forward</b>. Totals don't depend on row order; only the running-balance column follows the order rows are shown in.</p>
        <div class="section-t">Workspaces, leave &amp; holidays</div>
        <p>Each workspace has its own ledger for every employee in it. The same person can work in several workspaces at a different hourly rate in each, and their balances are kept apart. The HR overview can show one workspace or all of them, with a breakdown per person.</p>
        <p><b>Leave</b> and <b>holiday</b> rows mark a day off. They add no hours and no pay, and "Add week" skips them.</p>
        <div class="section-t">Self-review</div>
        <p><b>Verify</b> recalculates every hour, amount and balance a second, independent way and checks that the carry-forward chains between periods. It also flags missing check-outs, breaks longer than the shift, overpayments and duplicate dates.</p>
        <p>Click any calculated figure in the table to see its working.</p></div>`,
      foot: `<button class="btn primary" data-close>Got it</button>`,
    });
  }
  function shortcutsModal() {
    const mod = (api && api.platform === 'darwin') ? '⌘' : 'Ctrl';
    const k = [[mod + ' K', 'Check in / check out'], [mod + ' B', 'Start / end break'], [mod + ' N', 'Add day'], [mod + ' Shift P', 'Record payment'], [mod + ' L', 'Mark leave / holiday'], [mod + ' Z', 'Undo'], [mod + ' Shift Z', 'Redo'], [mod + ' [ / ]', 'Previous / next period'], [mod + ' T', 'Jump to today'], [mod + ' Shift V', 'Verify calculations'], [mod + ' E', 'Export CSV'], [mod + ' P', 'Save as PDF'], ['Enter', 'Save cell and move down'], ['Tab', 'Next cell'], ['Esc', 'Close dialog']];
    modal({ title: 'Keyboard shortcuts', body: `<div class="shortcuts">${k.map(([a, b]) => `<span>${a.split(' ').map(x => `<span class="kbd">${esc(x)}</span>`).join(' ')}</span><span>${esc(b)}</span>`).join('')}</div>`, foot: '<button class="btn primary" data-close>Close</button>' });
  }

  // =====================================================================
  // Popovers: row menu & formula explainer
  // =====================================================================
  function closePop() { $('#pop-root').innerHTML = ''; }
  function popAt(anchor, html, cls) {
    closePop();
    const p = document.createElement('div');
    p.className = 'pop ' + cls; p.innerHTML = html;
    $('#pop-root').appendChild(p);
    const r = anchor.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    // "center": centred under the anchor; other menus start at its left edge; explainers end at its right edge
    const kind = /\bcenter\b/.test(cls) ? 'center' : /\bmenu\b/.test(cls) ? 'left' : 'right';
    let x = kind === 'center' ? r.left + r.width / 2 - pw / 2 : kind === 'left' ? r.left : r.right - pw, y = r.bottom + 6;
    if (x + pw > innerWidth - 8) x = innerWidth - pw - 8; if (x < 8) x = 8;
    if (y + ph > innerHeight - 8) y = r.top - ph - 6;
    p.style.left = x + 'px'; p.style.top = Math.max(8, y) + 'px';
    return p;
  }

  function rowMenu(btn) {
    const tr = btn.closest('tr[data-id]'); const { row } = findRow(tr.dataset.id); if (!row) return;
    const items = [];
    if (row.type === 'day') items.push(['dup', 'Duplicate to next work day'], ['note-below', 'Insert separator below'], ['clear-times', 'Clear times'], ['-'], ['to-leave', 'Mark this day as leave'], ['to-holiday', 'Mark this day as holiday'], ['leave-range', 'Leave / holiday for several days…'], ['-']);
    if (row.type === 'leave') items.push(['to-day', 'Change to a work day'], ['dup', 'Duplicate to next work day'], ['-']);
    if (row.type === 'payment') items.push(['edit-payment', 'Edit payment…'], ['share-payment', 'Share receipt with employee…'], ['-']);
    if (row.type === 'note') items.push(['tone:grey', 'Style: grey'], ['tone:green', 'Style: green (paid)'], ['tone:amber', 'Style: amber (pending)'], ['tone:blue', 'Style: blue (info)'], ['-']);
    const emp = activeEmp(); const G = groupInfo(emp, ledgerOf(emp)); const gid = G.of(row);
    if (gid) items.push(['group-edit', 'Edit pay group…']);
    if (gid && row.type === 'payment') items.push(['group-out', 'Take out of the pay group']);
    if (!gid && row.type !== 'note') items.push(['group-new', 'Wrap in a pay group…']);
    if (row.type !== 'note' || gid) items.push(['-']);
    items.push(['up', 'Move up'], ['down', 'Move down'], ['-'], ['delete', 'Delete row', 'danger']);
    const p = popAt(btn, items.map(i => i[0] === '-' ? '<hr>' : `<button data-m="${i[0]}" class="${i[2] || ''}">${esc(i[1])}</button>`).join(''), 'menu');
    p.addEventListener('click', e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const a = b.dataset.m; closePop();
      if (a === 'dup') duplicateRow(row.id);
      else if (a === 'note-below') addNote(row.id);
      else if (a === 'clear-times') mutate(() => { row.in = ''; row.out = ''; row.breakMin = 0; delete row.breakStart; });
      else if (a === 'edit-payment') paymentModal(row);
      else if (a === 'share-payment') shareModal({ paymentId: row.id });
      else if (a === 'to-leave') convertToLeave(row, 'leave');
      else if (a === 'to-holiday') convertToLeave(row, 'holiday');
      else if (a === 'leave-range') leaveModal(row.date);
      else if (a === 'to-day') convertToDay(row);
      else if (a.startsWith('tone:')) mutate(() => { row.tone = a.slice(5); });
      else if (a === 'group-edit') groupModal(G.byId(gid));
      else if (a === 'group-out') takeOutOfGroup(G.byId(gid), row);
      else if (a === 'group-new') groupModal(null, row.type === 'payment' ? { from: row.from, to: row.to, payment: row.id } : { from: row.date });
      else if (a === 'up') moveRow(row.id, -1);
      else if (a === 'down') moveRow(row.id, 1);
      else if (a === 'delete') deleteRow(row.id);
    });
  }

  function explain(el) {
    const kind = el.dataset.explain;
    const emp = activeEmp(); if (!emp) return;
    const L = ledgerOf(emp); const r = range(); const V = C.periodView(L, r);
    const tr = el.closest('tr[data-id]');
    let title = '', steps = [], note = '', issues = [];
    const res = s => `<span class="res">${s}</span>`;
    if (kind === 'carry-in' || kind === 'carry-out') {
      const before = L.rows.filter(x => r.start && x.row.date < r.start);
      const earned = before.reduce((a, x) => a + (x.row.type === 'day' ? x.c.amount : 0), 0);
      const paid = before.reduce((a, x) => a + (x.row.type === 'day' ? x.c.directPaid : x.row.type === 'payment' ? x.c.amount : 0), 0);
      if (kind === 'carry-in') {
        title = 'Brought forward';
        steps = [`Opening balance &nbsp;${money(L.opening)}`, `+ Earned before period &nbsp;${money(earned)}`, `− Paid before period &nbsp;${money(paid)}`, `= ${res(money(V.carryIn))}`];
        note = r.start ? 'Everything dated before ' + fmtDate(r.start) + '.' : 'No earlier period — this is the opening balance.';
      } else {
        title = 'Carried forward';
        steps = [`Brought forward &nbsp;${money(V.carryIn)}`, `+ Earned this period &nbsp;${money(V.totals.earned)}`, `− Paid this period &nbsp;${money(V.totals.paid)}`, `= ${res(money(V.carryOut))}`];
        note = r.end ? 'This becomes the brought-forward amount for the period starting ' + fmtDate(C.addDays(r.end, 1)) + '.' : 'Current all-time balance.';
      }
    } else if (tr) {
      // the running balance follows the table's order, where pay groups gather their payments
      const seq = ui.filter === 'all' ? tableLayout(emp, V, L).entries.filter(e => e.kind === 'row').map(e => e.x) : V.rows;
      const x = seq.find(v => v.row.id === tr.dataset.id); if (!x) return;
      const { row, c } = x;
      const idx = seq.indexOf(x); const prevRun = idx > 0 ? seq[idx - 1].running : V.carryIn;
      issues = (c.issues || []);
      if (kind === 'hours') {
        title = 'Working hours';
        if (c.status === 'ok') {
          steps = [`Check-out ${esc(fmtTime(row.out))} − Check-in ${esc(fmtTime(row.in))} = ${C.formatHM(c.spanMin)}${c.overnight ? ' (overnight)' : ''}`, `− Rest break ${C.formatHM(c.breakMin)}`, `= ${res(hours(c.minutes))}`];
        } else steps = [c.status === 'open' ? 'Waiting for check-out' : 'No times entered', `= ${res(hours(0))}`];
      } else if (kind === 'amount') {
        title = 'Amount';
        steps = [`${C.formatDecimalHours(c.minutes)} h × ${money(c.rate)}/h`, `= ${res(money(c.amount))}`];
        note = 'Rounded to ' + dec() + ' decimal place' + (dec() === 1 ? '' : 's') + '.' + (row.rate != null && row.rate !== '' && C.num(row.rate) !== C.num(emp.hourlyRate) ? ' This day uses its own rate (employee default is ' + money(emp.hourlyRate) + ').' : '');
      } else if (kind === 'balance') {
        title = 'Day balance';
        steps = [`Amount &nbsp;${money(c.amount)}`, `− Paid on the day &nbsp;${money(c.directPaid)}`];
        for (const a of c.allocations) steps.push(`− From payment on ${fmtDate(a.date, false)} &nbsp;${money(a.amount)}`);
        steps.push(`= ${res(money(c.balance))}`);
      } else if (kind === 'pay-balance') {
        title = 'Payment';
        steps = [`Payment reduces the balance by ${money(c.amount)}`, `Matched to ${c.covers.length} day${c.covers.length === 1 ? '' : 's'}: ${money(c.applied)}`, `Unmatched credit: ${money(c.unapplied)}`];
      } else if (kind === 'running') {
        title = 'Running balance';
        if (row.type === 'day') steps = [`Previous &nbsp;${money(prevRun)}`, `+ Amount &nbsp;${money(c.amount)}`, `− Paid on the day &nbsp;${money(c.directPaid)}`, `= ${res(money(x.running))}`];
        else if (row.type === 'payment') steps = [`Previous &nbsp;${money(prevRun)}`, `− Payment &nbsp;${money(c.amount)}`, `= ${res(money(x.running))}`];
        else steps = [`${row.type === 'leave' ? 'Leave / holiday' : 'Separator'} rows don't change the balance`, `= ${res(money(x.running))}`];
        note = 'Payments that cover this day are subtracted on the payment row, so nothing is counted twice.';
      }
    }
    const lvlStyle = { error: 'background:var(--red-bg);color:var(--red)', warn: 'background:var(--amber-bg);color:var(--amber)', info: 'background:var(--blue-bg);color:var(--blue)' };
    popAt(el, `<div class="h">${title}<small>ƒ formula</small></div><div class="steps">${steps.join('<br>')}</div>${note ? `<div class="note">${note}</div>` : ''}${issues.length ? `<div class="issues">${issues.map(i => `<div style="${lvlStyle[i.level]}">${esc(i.msg)}</div>`).join('')}</div>` : ''}`, 'explain');
  }

  // =====================================================================
  // Export / import
  // =====================================================================
  const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const numOut = v => C.roundMoney(v || 0, dec()).toFixed(dec());
  async function saveText(name, content, ext, label) {
    if (api) {
      const r = await api.saveFile({ defaultName: name, content, filters: [{ name: label, extensions: [ext] }] });
      if (r.ok) toast('Saved ' + r.path.split(/[\\/]/).pop()); else if (!r.canceled) toast('Could not save: ' + r.error, { error: true });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  }
  const safeName = s => String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');

  function exportCSV() {
    const emp = activeEmp(); if (!emp || ui.view !== 'employee') return exportSummary();
    const r = range(); const V = C.periodView(ledgerOf(emp), r);
    const H = ['Date', 'Day', 'Type', 'Check-in', 'Check-out', 'Rest break (h:mm)', 'Working hours (h:mm)', 'Working hours (decimal)', 'Rate', 'Amount', 'Paid on day', 'Paid via payments', 'Payment amount', 'Balance', 'Running balance', 'Status', 'Comment / notes'];
    const out = [H];
    out.push([r.start || '', '', 'Brought forward', '', '', '', '', '', '', '', '', '', '', '', numOut(V.carryIn), '', '']);
    for (const { row, c, running } of V.rows) {
      const dw = row.date ? DOW[dowOf(row.date)] : '';
      if (row.type === 'day') out.push([row.date, dw, 'Day', fmtTime(row.in), fmtTime(row.out), C.formatHM(c.breakMin), C.formatHM(c.minutes), C.formatDecimalHours(c.minutes), numOut(c.rate), numOut(c.amount), numOut(c.directPaid), numOut(c.allocated), '', numOut(c.balance), numOut(running), c.state, row.note || '']);
      else if (row.type === 'payment') out.push([row.date, dw, 'Payment', '', '', '', '', '', '', '', '', '', numOut(c.amount), '', numOut(running), row.method || '', (row.comment || '') + (row.from || row.to ? ' [covers ' + (row.from || '…') + ' to ' + (row.to || '…') + ']' : '')]);
      else if (row.type === 'leave') out.push([row.date, dw, row.kind === 'holiday' ? 'Holiday' : 'Leave', '', '', '', '', '', '', '', '', '', '', '', numOut(running), '', row.note || '']);
      else out.push([row.date, dw, 'Separator', '', '', '', '', '', '', '', '', '', '', '', numOut(running), '', row.text || '']);
    }
    out.push([r.end || '', '', 'Carried forward', '', '', '', C.formatHM(V.totals.minutes), C.formatDecimalHours(V.totals.minutes), '', numOut(V.totals.earned), numOut(V.totals.paidDirect), '', numOut(V.totals.payments), numOut(V.totals.periodBalance), numOut(V.carryOut), '', 'Workspace: ' + activeWs().name + ' · Currency: ' + S().currencyCode]);
    const csv = '﻿' + out.map(r => r.map(csvCell).join(',')).join('\r\n');
    saveText(`TimeLedger_${safeName(activeWs().name)}_${safeName(emp.name)}_${r.start || 'all'}_${r.end || todayISO()}.csv`, csv, 'csv', 'CSV');
  }
  /** One line per employee per workspace. From the overview it follows the chosen scope; elsewhere it is the active workspace. */
  function exportSummary() {
    const r = range();
    const all = ui.view === 'overview' && ui.ovScope === 'all' && data.workspaces.length > 1;
    const out = [['Workspace', 'Employee', 'Role', 'Hourly rate', 'Days worked', 'Leave days', 'Holidays', 'Hours (h:mm)', 'Hours (decimal)', 'Brought forward', 'Amount', 'Paid', 'Outstanding this period', 'Carried forward', 'Total outstanding (all-time)', 'Currency']];
    for (const w of all ? data.workspaces : [activeWs()]) {
      for (const e of members(w.id)) {
        const L = ledgerOf(e); const V = C.periodView(L, r); const t = V.totals;
        out.push([w.name, e.name, e.role || '', numOut(e.hourlyRate), t.days, t.leave, t.holidays, C.formatHM(t.minutes), C.formatDecimalHours(t.minutes), numOut(V.carryIn), numOut(t.earned), numOut(t.paid), numOut(t.periodBalance), numOut(V.carryOut), numOut(L.totals.balance), S().currencyCode]);
      }
    }
    const csv = '﻿' + out.map(r => r.map(csvCell).join(',')).join('\r\n');
    saveText(`TimeLedger_HR_summary_${all ? 'all_workspaces' : safeName(activeWs().name)}_${r.start || 'all'}_${r.end || todayISO()}.csv`, csv, 'csv', 'CSV');
  }
  const hasBackupApi = () => !!(api && api.backup);
  /** Save one backup file the user picks a place for (portable TimeLedger backup format). */
  async function backup() {
    if (hasBackupApi()) {
      const r = await api.backup.exportFile();
      if (r.ok && !r.canceled) toast('Backup saved' + (r.encrypted ? ' (encrypted)' : '') + ' — ' + r.path.split(/[\\/]/).pop());
      else if (!r.ok) toast('Could not save the backup: ' + r.error, { error: true });
      return;
    }
    const content = JSON.stringify({ format: 'timeledger-backup', formatVersion: 1, schemaVersion: data.version, app: 'TimeLedger', platform: 'web', createdAt: new Date().toISOString(), reason: 'manual', encrypted: false, data }, null, 2);
    saveText('TimeLedger-backup_' + todayISO() + '.json', content, 'json', 'TimeLedger backup');
  }
  /** Ask for a text file. Returns { content, name } or null. */
  async function pickTextFile(label, exts) {
    if (api) {
      const r = await api.openFile({ filters: [{ name: label, extensions: exts }, { name: 'All files', extensions: ['*'] }] });
      if (!r.ok) { if (!r.canceled) toast('Could not open: ' + r.error, { error: true }); return null; }
      return { content: r.content, name: r.path.split(/[\\/]/).pop() };
    }
    return new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = exts.map(e => '.' + e).join(',');
      i.onchange = () => { const f = i.files[0]; if (!f) return res(null); f.text().then(content => res({ content, name: f.name })); };
      i.click();
    });
  }
  async function restore() {
    if (hasBackupApi()) {
      const r = await api.backup.importFile();
      if (r.canceled) return;
      return handleDecoded(r, r.fileName);
    }
    const f = await pickTextFile('TimeLedger backup', ['json']);
    if (!f) return;
    let parsed;
    try { parsed = JSON.parse(f.content); } catch (_) { return toast('That file isn\'t a valid TimeLedger backup', { error: true }); }
    if (parsed && parsed.format === 'timeledger-backup') {
      if (parsed.encrypted) return toast('Encrypted backups can be opened in the TimeLedger desktop app', { error: true });
      return confirmRestore(parsed.data, parsed, f.name);
    }
    confirmRestore(parsed, { createdAt: parsed && parsed.exportedAt }, f.name);
  }
  /** Result of a backup read in the main process: data, or a request for the passphrase. */
  function handleDecoded(r, label) {
    if (r.ok && r.data) return confirmRestore(r.data, r.meta || {}, label);
    if (r.code === 'NEEDS_PASSPHRASE' || r.code === 'BAD_PASSPHRASE') {
      return passphrasePrompt({ wrong: r.code === 'BAD_PASSPHRASE', label }, async pass => handleDecoded(await api.backup.decode(r.token, pass), label));
    }
    toast(r.message || r.error || 'Could not open that backup', { error: true });
  }
  function passphrasePrompt({ wrong, label }, onPass) {
    modal({
      title: 'Encrypted backup', sub: esc(label || 'This backup') + ' is protected with a passphrase.',
      body: `<div class="field"><label>Backup passphrase</label><input name="pass" type="password" autocomplete="off">${wrong ? '<div class="hint" style="color:var(--red)">That passphrase didn\'t open the backup. Try again.</div>' : ''}</div>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Open backup</button>',
      onMount: (el, m) => {
        const go = () => { const v = $('[name=pass]', el).value; if (!v) return; m.close(); onPass(v); };
        $('[data-ok]', el).addEventListener('click', go);
        $('[name=pass]', el).addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      },
    });
  }
  function confirmRestore(parsed, meta, label) {
    if (!parsed || !Array.isArray(parsed.employees) || typeof parsed.rows !== 'object') return toast('That file isn\'t a valid TimeLedger backup', { error: true });
    const n = parsed.employees.length;
    // v1 backups: rows{empId: []} · v2: rows{wsId: {empId: []}}
    const countRows = x => Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.values(x).reduce((a, y) => a + countRows(y), 0) : 0;
    const rows = countRows(parsed.rows);
    const wsN = Array.isArray(parsed.workspaces) ? parsed.workspaces.length : 1;
    const when = meta && meta.createdAt ? new Date(meta.createdAt).toLocaleString() : '';
    confirmModal({
      title: 'Restore this backup?', danger: true, okText: 'Replace current data',
      message: `<b>${esc(label || 'Backup')}</b>${when ? ' · made ' + esc(when) : ''}${meta && meta.deviceName ? ' on ' + esc(meta.deviceName) : ''}<br><br>It contains <b>${wsN} workspace${wsN === 1 ? '' : 's'}</b>, <b>${n} employee${n === 1 ? '' : 's'}</b> and <b>${rows} rows</b>, and will replace everything currently in TimeLedger.`
        + (hasBackupApi() ? ' A safety copy of your current data is saved first, and you can undo with Ctrl+Z straight afterwards.' : ' You can undo with Ctrl+Z straight afterwards.'),
      onOk: async () => {
        if (hasBackupApi()) { saveNow(); const s = await api.backup.safety(); if (!s.ok) return toast('Could not save a safety copy first, so nothing was changed: ' + (s.error || ''), { error: true }); }
        mutate(() => { const d = normalize(parsed); data.settings = d.settings; data.workspaces = d.workspaces; data.employees = d.employees; data.rows = d.rows; data.ui.activeWorkspaceId = d.ui.activeWorkspaceId; nfCache = {}; fixActive(); ui.view = 'employee'; });
        modalStack.slice().forEach(x => x.close());
        toast('Backup restored');
      },
    });
  }

  // ---------- backup & sync centre ----------
  let backupState = null;
  function ago(iso) {
    if (!iso) return 'never';
    const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    const d = new Date(iso); return fmtDate(C.toISO(d)) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function renderBackupStatus() {
    const el = $('#backup-status'); if (!el) return;
    const s = backupState;
    if (!hasBackupApi()) { el.hidden = true; return; }
    el.hidden = false;
    let cls = 'warn', txt = 'Backup: not set up';
    if (s && s.running) { cls = 'saving'; txt = 'Backing up…'; }
    else if (s && s.destinations && s.failing) { cls = 'error'; txt = 'Backup failed — check'; }
    else if (s && s.destinations) { cls = ''; txt = s.lastOkAt ? 'Backed up ' + ago(s.lastOkAt) : 'Backup pending'; }
    el.className = 'backup-status ' + cls;
    $('.txt', el).textContent = txt;
    el.title = s && s.destinations ? [s.google.connected ? 'Google Drive: ' + s.google.email : '', s.folder ? 'Folder: ' + s.folder.path : ''].filter(Boolean).join('\n') : 'Set up automatic backups';
  }
  setInterval(renderBackupStatus, 60000);

  const BK_SRC = { gdrive: 'Google Drive', folder: 'Folder', local: 'This computer' };
  /** "Today 18:00" / "Tomorrow 06:00 PM" / "05 Oct 18:00" in the chosen time format */
  function fmtWhen(iso) {
    const d = new Date(iso), day = C.toISO(d);
    const t = fmtTime(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
    return (day === todayISO() ? 'today' : day === C.addDays(todayISO(), 1) ? 'tomorrow' : fmtDate(day, false)) + ' ' + t;
  }
  /** One line saying when backups happen, e.g. "After changes (5 min) · before closing · daily at 18:00". */
  function backupRules(st) {
    const sc = st.schedule || {};
    const parts = [
      st.onChange ? 'after changes (' + (st.delayMin < 1 ? '30 s' : st.delayMin + ' min') + ')' : '',
      st.onClose ? 'before closing' : '',
      sc.mode === 'daily' ? 'daily at ' + fmtTime(sc.time) : sc.mode === 'every' ? 'every ' + sc.everyHours + ' h' : '',
    ].filter(Boolean);
    if (!parts.length) return 'Automatic backups are off — use Back up now.';
    const s = parts.join(' · ');
    return 'Backs up ' + s + '.';
  }
  async function backupCenter() {
    if (!hasBackupApi()) {
      return modal({
        title: 'Backup & sync', body: '<div class="callout">Automatic backups to Google Drive or a folder are available in the TimeLedger desktop app. In this preview you can download a backup file and restore one.</div>',
        foot: `<button class="btn" data-a="restore">Restore from file…</button><button class="btn primary" data-a="backup">${I.down} Download backup</button>`,
        onMount: (el, m) => $$('[data-a]', el).forEach(b => b.addEventListener('click', () => { m.close(); b.dataset.a === 'backup' ? backup() : restore(); })),
      });
    }
    let st = (await api.backup.status());
    let suggestions = [];
    let listing = null, listErr = null;
    modal({
      title: 'Backup & sync', wide: true,
      sub: 'Keep a copy of every workspace, employee and payment somewhere safe, and bring it back on this or another device.',
      body: '<div id="bk"></div>',
      foot: '<button class="btn primary" data-close>Done</button>',
      onMount: (el) => {
        const root = $('#bk', el);
        const act = async (fn, okMsg) => {
          root.classList.add('busy');
          try { const r = await fn(); if (r && r.ok === false && !r.canceled) toast(r.error || r.message || 'Something went wrong', { error: true }); else if (okMsg && !(r && r.canceled)) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); }
          finally { root.classList.remove('busy'); st = await api.backup.status(); backupState = st; renderBackupStatus(); draw(); }
        };
        const loadList = async () => { listing = null; listErr = null; draw(); const r = await api.backup.list(); listing = r.ok ? r.items : []; listErr = r.ok ? r.errors : { all: r.error }; draw(); };
        const lastLine = l => !l ? '<span class="bk-muted">No backup yet</span>' : l.ok ? `<span class="bk-ok">${I.check} Backed up ${esc(ago(l.at))}</span>` : `<span class="bk-err">Last try failed ${esc(ago(l.at))}: ${esc(l.error)}</span>`;
        const draw = () => {
          const g = st.google, f = st.folder;
          const head = !st.destinations
            ? `<div class="bk-head warn"><div><b>Backups are only on this computer.</b><div>Choose Google Drive or a folder below so your records survive a broken or lost computer.</div></div></div>`
            : st.failing ? `<div class="bk-head error"><div><b>The last backup didn't finish.</b><div>See the details below.${st.lastOkAt ? ' Last good backup ' + esc(ago(st.lastOkAt)) + '.' : ''}</div></div><button class="btn" data-x="run">${I.cloud} Back up now</button></div>`
              : `<div class="bk-head ok"><div><b>${st.lastOkAt ? 'Backed up ' + esc(ago(st.lastOkAt)) : 'Ready to back up'}</b><div>${esc(backupRules(st))}</div></div><button class="btn" data-x="run">${I.cloud} Back up now</button></div>`;
          const gCard = `<div class="bk-card ${g.connected ? 'on' : ''}"><div class="bk-ico g">G</div><div class="bk-body"><div class="bk-t">Google Drive</div>
              <div class="bk-d">${g.connected ? `Signed in as <b>${esc(g.email || 'your Google account')}</b>. Backups go to the “TimeLedger Backups” folder in your Drive.` : 'Sign in with your Google account. Backups go to a “TimeLedger Backups” folder in your Drive. TimeLedger can only see the files it creates.'}</div>
              ${g.connected ? `<div class="bk-l">${g.needsReconnect ? '<span class="bk-err">Google needs you to sign in again.</span>' : lastLine(g.last)}</div>` : ''}
              ${!g.configured && !g.connected ? '<div class="bk-l bk-muted">Google sign-in isn\'t set up in this copy of TimeLedger yet (see README → Google Drive backup).</div>' : ''}</div>
              <div class="bk-a">${g.connected ? `${g.needsReconnect ? '<button class="btn primary sm" data-x="g-connect">Sign in again</button>' : ''}<button class="btn ghost sm" data-x="g-off">Disconnect</button>` : `<button class="btn primary sm" data-x="g-connect" ${g.configured ? '' : 'disabled'}>Sign in with Google</button>`}</div></div>`;
          const fCard = `<div class="bk-card ${f ? 'on' : ''}"><div class="bk-ico">${I.cloud}</div><div class="bk-body"><div class="bk-t">Folder on this computer or a synced cloud folder</div>
              <div class="bk-d">${f ? `<span class="bk-path">${esc(f.path)}</span>` : 'Pick OneDrive, Dropbox, iCloud Drive or Google Drive for desktop and their app uploads every backup to the cloud. A USB drive or network folder works too.'}</div>
              ${f ? `<div class="bk-l">${lastLine(f.last)}</div>` : suggestions.length ? `<div class="bk-sugg">${suggestions.map(s => `<button class="chip" data-x="use-folder" data-path="${esc(s.path)}">Use ${esc(s.label)}</button>`).join('')}</div>` : ''}</div>
              <div class="bk-a">${f ? '<button class="btn ghost sm" data-x="f-open">Open</button><button class="btn ghost sm" data-x="f-choose">Change…</button><button class="btn ghost sm" data-x="f-off">Stop using</button>' : '<button class="btn sm" data-x="f-choose">Choose folder…</button>'}</div></div>`;
          const lCard = `<div class="bk-card on"><div class="bk-ico">${I.shield}</div><div class="bk-body"><div class="bk-t">This computer <span class="bk-muted">· always on</span></div>
              <div class="bk-d">A daily copy is kept for 1 week in the app's data folder, plus a safety copy before every restore. It won't help if the computer is lost, so add one of the options above.</div></div>
              <div class="bk-a"><button class="btn ghost sm" data-x="l-open">Open</button></div></div>`;
          const sc = st.schedule || { mode: 'off', time: '18:00', everyHours: 4 };
          const nextTxt = st.nextScheduledAt ? 'Next: ' + esc(fmtWhen(st.nextScheduledAt)) : st.destinations ? '' : 'Starts once Google Drive or a folder is set up.';
          const opts = `<div class="bk-rules">
              <div class="bk-rule"><label class="toggle"><input type="checkbox" data-x="onChange" ${st.onChange ? 'checked' : ''}> <b>Back up after every change</b></label>
                <span class="bk-inline ${st.onChange ? '' : 'off'}">wait <select data-x="delay" ${st.onChange ? '' : 'disabled'}>${[[0.5, '30 seconds'], [1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes']].map(([v, l]) => `<option value="${v}" ${st.delayMin === v ? 'selected' : ''}>${l}</option>`).join('')}</select> after the last edit</span>
                <div class="bk-muted">A burst of edits makes one backup once you stop typing.</div></div>
              <div class="bk-rule"><label class="toggle"><input type="checkbox" data-x="onClose" ${st.onClose ? 'checked' : ''}> <b>Back up before closing the app</b></label>
                <div class="bk-muted">Only when something changed since the last backup. Closing waits at most 15 seconds.</div></div>
              <div class="bk-rule"><label class="toggle"><input type="checkbox" data-x="schedOn" ${sc.mode !== 'off' ? 'checked' : ''}> <b>Scheduled backup</b></label>
                <span class="bk-inline ${sc.mode !== 'off' ? '' : 'off'}">
                  <select data-x="schedMode" ${sc.mode !== 'off' ? '' : 'disabled'}><option value="daily" ${sc.mode !== 'every' ? 'selected' : ''}>every day at</option><option value="every" ${sc.mode === 'every' ? 'selected' : ''}>every</option></select>
                  ${sc.mode === 'every'
                    ? `<select data-x="everyHours">${[1, 2, 3, 4, 6, 8, 12].map(h => `<option value="${h}" ${+sc.everyHours === h ? 'selected' : ''}>${h} hour${h === 1 ? '' : 's'}</option>`).join('')}</select>`
                    : `<input type="time" data-x="schedTime" value="${esc(sc.time)}" ${sc.mode !== 'off' ? '' : 'disabled'}>`}
                </span>
                <div class="bk-muted">${sc.mode !== 'off' ? nextTxt + (nextTxt ? ' · ' : '') + 'If the computer is off at that time, it runs the next time TimeLedger opens.' : 'Runs even on days nothing changed.'}</div></div>
            </div>
            <div class="bk-opts" style="margin-top:12px">
              <span class="bk-muted" title="Applies to Google Drive, the folder and this computer">Keeps <b>1 week</b> of backups. Older ones are deleted automatically; the newest is always kept.</span>
              <label class="toggle">this device is called <input class="bk-dev" data-x="device" value="${esc(st.deviceName)}" maxlength="60"></label>
            </div>
            <div class="bk-enc"><label class="toggle"><input type="checkbox" data-x="encrypt" ${st.encrypt ? 'checked' : ''}> Encrypt backups with a passphrase</label>
              <span class="bk-muted">${st.encrypt ? 'On. New backups need the passphrase to open, on any device.' + (st.keychain ? '' : ' (This computer has no keychain, so the passphrase is stored unprotected in the app data folder.)') : 'Recommended for cloud backups: pay records stay private even if the cloud account is breached.'}</span>
              ${st.encrypt ? '<button class="linkish" data-x="encrypt-change">Change passphrase</button>' : ''}</div>`;
          const rows = listing == null ? '<div class="bk-muted" style="padding:12px">Looking for backups…</div>'
            : !listing.length ? '<div class="bk-muted" style="padding:12px">No backups found yet.</div>'
              : `<table class="simple bk-list"><thead><tr><th>Made</th><th>Where</th><th>Device</th><th>Contents</th><th></th></tr></thead><tbody>${listing.slice(0, 40).map((b, i) => `<tr>
                  <td>${esc(new Date(b.time).toLocaleString())}${b.reason === 'before-restore' ? ' <span class="pill soft">before restore</span>' : ''}</td>
                  <td><span class="bk-src ${b.source}">${esc(BK_SRC[b.source])}</span></td><td>${esc(b.device || '—')}</td>
                  <td>${b.summary ? `${b.summary.employees} employees · ${b.summary.rows} rows` : `${Math.max(1, Math.round(b.size / 1024))} KB`}${b.encrypted ? ' · 🔒' : ''}</td>
                  <td class="r"><button class="btn sm" data-x="restore" data-i="${i}">Restore…</button></td></tr>`).join('')}</tbody></table>`;
          root.innerHTML = head
            + `<div class="section-t">Where to keep backups</div><div class="bk-cards">${gCard}${fCard}${lCard}</div>`
            + `<div class="section-t">Options</div>${opts}`
            + `<div class="section-t">Restore <button class="linkish" data-x="refresh" style="margin-left:8px;text-transform:none;letter-spacing:0">Refresh</button></div>`
            + (listErr && listErr.gdrive ? `<div class="callout amber" style="margin-bottom:8px">Couldn't list Google Drive backups: ${esc(listErr.gdrive)}</div>` : '')
            + `<div class="bk-listwrap">${rows}</div>
              <div class="bk-files"><button class="btn sm" data-x="file-restore">Restore from a file…</button><button class="btn sm" data-x="file-export">${I.down} Save a backup file…</button></div>
              <div class="callout" style="margin-top:12px">Every backup is a single file in the portable <b>TimeLedger backup format</b>. You can restore it in TimeLedger on any computer, and in the planned mobile and web versions: sign in with the same Google account and your Drive backups will be there.</div>`;
        };
        root.addEventListener('click', async e => {
          const b = e.target.closest('[data-x]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
          const x = b.dataset.x;
          if (x === 'run') return act(async () => { const r = await api.backup.run(); if (r.ok) { const res = Object.values(r.results || {}); if (res.length && res.every(v => v.ok)) toast('Backed up'); else if (r.results && r.results.error) toast(r.results.error, { error: true }); } loadList(); return r.ok ? null : r; });
          if (x === 'g-connect') { toast('Finish signing in in your browser…'); return act(async () => { const r = await api.backup.connectGoogle(); if (r.ok) setTimeout(loadList, 2500); return r; }, r => 'Connected to Google Drive as ' + (r.email || 'your account')); }
          if (x === 'g-off') return confirmModal({ title: 'Disconnect Google Drive?', message: 'TimeLedger will stop backing up to Google Drive on this computer. Backups already in your Drive are kept.', okText: 'Disconnect', onOk: () => act(() => api.backup.disconnectGoogle(), 'Google Drive disconnected') });
          if (x === 'f-choose') return act(() => api.backup.chooseFolder(), r => 'Backups will be saved in ' + r.path);
          if (x === 'use-folder') return act(() => api.backup.useFolder(b.dataset.path), r => 'Backups will be saved in ' + r.path);
          if (x === 'f-off') return act(() => api.backup.removeFolder(), 'Stopped backing up to that folder. Files already there are kept.');
          if (x === 'f-open') return api.backup.openFolder('folder');
          if (x === 'l-open') return api.backup.openFolder('local');
          if (x === 'refresh') return loadList();
          if (x === 'file-export') return backup();
          if (x === 'file-restore') return restore();
          if (x === 'encrypt-change') return setPassphraseModal(st.encrypt, () => act(async () => null));
          if (x === 'restore') {
            const item = listing[+b.dataset.i];
            root.classList.add('busy');
            const r = await api.backup.fetch(item.source, item.id);
            root.classList.remove('busy');
            return handleDecoded(r, BK_SRC[item.source] + ' · ' + new Date(item.time).toLocaleString());
          }
        });
        root.addEventListener('change', e => {
          const x = e.target.dataset.x;
          if (x === 'onChange') act(() => api.backup.set({ onChange: e.target.checked }));
          if (x === 'onClose') act(() => api.backup.set({ onClose: e.target.checked }));
          if (x === 'delay') act(() => api.backup.set({ delayMin: +e.target.value }));
          if (x === 'schedOn') act(() => api.backup.set({ schedule: { mode: e.target.checked ? (st.schedule && st.schedule.mode !== 'off' ? st.schedule.mode : 'daily') : 'off' } }));
          if (x === 'schedMode') act(() => api.backup.set({ schedule: { mode: e.target.value } }));
          if (x === 'everyHours') act(() => api.backup.set({ schedule: { everyHours: +e.target.value } }));
          if (x === 'device') act(() => api.backup.set({ deviceName: e.target.value }));
          if (x === 'encrypt') {
            if (e.target.checked) { e.target.checked = false; setPassphraseModal(false, () => act(async () => null)); }
            else confirmModal({ title: 'Turn off encryption?', message: 'New backups will be readable by anyone who can open the file. Existing encrypted backups still need the passphrase.', okText: 'Turn off', onOk: () => act(() => api.backup.setPassphrase(null), 'Encryption turned off') });
          }
        });
        // a time input changes once per part (hours, then minutes); save when the user leaves it
        root.addEventListener('focusout', e => {
          if (e.target.dataset.x !== 'schedTime') return;
          const v = e.target.value;
          if (/^\d{2}:\d{2}$/.test(v) && v !== (st.schedule && st.schedule.time)) act(() => api.backup.set({ schedule: { time: v } }), 'Scheduled backup set for ' + fmtTime(v) + ' every day');
        });
        root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.x === 'schedTime') e.target.blur(); });
        draw();
        api.backup.suggestFolders().then(r => { suggestions = r.ok ? r.folders : []; draw(); });
        loadList();
      },
    });
  }
  function setPassphraseModal(changing, after) {
    modal({
      title: changing ? 'Change backup passphrase' : 'Encrypt backups',
      sub: 'Backups are encrypted with AES-256 before they leave this computer.',
      body: `<div class="field"><label>Passphrase</label><input name="p1" type="password" autocomplete="new-password" placeholder="At least 8 characters"></div>
        <div class="field"><label>Type it again</label><input name="p2" type="password" autocomplete="new-password"></div>
        <div class="callout amber"><b>Write it down somewhere safe.</b> If it is forgotten, encrypted backups cannot be opened by anyone, including us. You'll need it to restore on another device.</div>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Use this passphrase</button>',
      onMount: (el, m) => {
        $('[data-ok]', el).addEventListener('click', async () => {
          const a = $('[name=p1]', el).value, b = $('[name=p2]', el).value;
          if (a.length < 8) return toast('Use at least 8 characters', { error: true });
          if (a !== b) return toast('The two passphrases are different', { error: true });
          const r = await api.backup.setPassphrase(a);
          if (!r.ok) return toast(r.error, { error: true });
          m.close(); toast('Backups will be encrypted'); after();
        });
      },
    });
  }
  async function printPDF() {
    closePop();
    if (api) {
      const emp = activeEmp(); const r = range();
      const name = ui.view === 'overview' || !emp ? 'HR_overview' : safeName(emp.name);
      const res = await api.savePDF({ defaultName: `TimeLedger_${name}_${r.start || 'all'}_${r.end || todayISO()}.pdf` });
      if (res.ok) toast('PDF saved'); else if (!res.canceled) toast('Could not create PDF: ' + res.error, { error: true });
    } else window.print();
  }

  // =====================================================================
  // Sample data
  // =====================================================================
  function loadSample() {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pick = a => a[Math.floor(rnd() * a.length)];
    const today = todayISO();
    const start = C.weekStartOf(C.addDays(today, -35), S().weekStart);
    // a public holiday for the whole main workspace, on the first work day of the third week
    let holiday = C.addDays(start, 14); while (!S().workDays.includes(dowOf(holiday))) holiday = C.addDays(holiday, 1);
    /** Rows for one person in one workspace. style.days overrides the work days (e.g. weekends only). */
    const gen = (rate, style) => {
      const rows = [];
      const days = style.days || S().workDays;
      let d = start;
      let weekFrom = null, weekTotal = 0;
      while (d < today) {
        const dw = dowOf(d);
        if (days.includes(dw) && style.holiday === d) rows.push(leaveRow(d, 'holiday', 'Public holiday'));
        else if (days.includes(dw) && rnd() > 0.06) {
          const inM = style.in + pick([-10, -5, 0, 0, 5, 12, 20]);
          const outM = style.out + pick([-15, 0, 0, 10, 25, 40]);
          const br = pick(style.breaks);
          const row = { id: uid('d'), type: 'day', date: d, in: C.toTimeStr(inM), out: C.toTimeStr(outM), breakMin: br, rate, paid: false, paidAmount: '', note: '' };
          if (rnd() < 0.07) row.note = pick(['Stayed late for stock count', 'Doctor appointment, left early', 'Covered front desk', 'Training session']);
          rows.push(row);
          weekFrom = weekFrom || d;
          weekTotal += C.amountFor(C.dayHours(row).minutes, rate, S().decimals);
        } else if (days.includes(dw)) rows.push(leaveRow(d, 'leave', pick(['Sick leave', 'Annual leave', 'Family event'])));
        const next = C.addDays(d, 1);
        if (next === C.weekStartOf(next, S().weekStart) && weekFrom) {
          // weekly payment on the next Monday (except the most recent week — left outstanding)
          if (next < C.addDays(today, -6)) {
            const lastDay = rows.filter(r => r.type === 'day').slice(-1)[0].date;
            let amt = style.round ? Math.floor(weekTotal / 100) * 100 : weekTotal;
            if (rnd() < 0.3) amt = Math.round(amt * 0.8 / 10) * 10; // partial payment sometimes
            rows.push({ id: uid('p'), type: 'payment', date: next, amount: amt, from: weekFrom, to: lastDay, method: pick(['Cash', 'Bank transfer']), comment: payComment(amt, weekFrom, lastDay), autoComment: true });
            rows.push({ id: uid('n'), type: 'note', date: next, text: 'Week closed — ' + fmtRange(weekFrom, lastDay), tone: 'green' });
          }
          weekFrom = null; weekTotal = 0;
        }
        d = next;
      }
      return rows;
    };
    const main = activeWs();
    let cafeName = 'Weekend Café', k = 2;
    while (data.workspaces.some(w => w.name === cafeName)) cafeName = 'Weekend Café ' + k++;
    const cafe = newWorkspace(cafeName, 'Saturday & Sunday shifts · Mall food court');
    const people = [];
    const mk = (name, role, rate, opening, openingNote, style) => {
      const p = { id: uid('e'), name, createdAt: new Date().toISOString(), workspaces: {} };
      people.push({ p, ws: main, member: { role, hourlyRate: rate, openingBalance: opening, openingNote }, rows: gen(rate, Object.assign({ holiday }, style)) });
      return p;
    };
    const also = (p, ws, role, rate, style) => people.push({ p, ws, member: { role, hourlyRate: rate, openingBalance: 0, openingNote: '' }, rows: gen(rate, style) });
    const a = mk('Ayesha Khan', 'Front desk', 650, 0, '', { in: 9 * 60, out: 17 * 60 + 30, breaks: [30, 45, 60], round: true });
    const b = mk('Bilal Ahmed', 'Warehouse', 500, 1200, 'Owed from August (old sheet)', { in: 8 * 60, out: 16 * 60 + 30, breaks: [30, 30, 45], round: false });
    const c = mk('Sara Malik', 'Part-time receptionist', 550, 0, '', { in: 13 * 60, out: 18 * 60, breaks: [0, 15, 15], round: true });
    // the same people also work weekends at the café, at a different rate
    also(a, cafe, 'Barista', 800, { days: [6, 0], in: 10 * 60, out: 16 * 60, breaks: [30], round: true });
    also(c, cafe, 'Cashier', 600, { days: [6], in: 12 * 60, out: 20 * 60, breaks: [30, 45], round: false });
    // mark a couple of days as paid in cash on the day
    const bDays = people.find(x => x.p === b).rows.filter(r => r.type === 'day');
    if (bDays.length > 3) { bDays[bDays.length - 2].paid = true; bDays[bDays.length - 3].paidAmount = 1000; }
    // someone is checked in right now
    const nowM = new Date().getHours() * 60 + new Date().getMinutes();
    if (S().workDays.includes(dowOf(today))) people[0].rows.push({ id: uid('d'), type: 'day', date: today, in: C.toTimeStr(Math.max(0, Math.min(nowM - 30, 9 * 60 + 2))), out: '', breakMin: 0, rate: 650, paid: false, paidAmount: '', note: '' });
    mutate(() => {
      data.workspaces.push(cafe);
      for (const x of [a, b, c]) data.employees.push(x);
      for (const x of people) { x.p.workspaces[x.ws.id] = x.member; (data.rows[x.ws.id] = data.rows[x.ws.id] || {})[x.p.id] = x.rows; }
      data.ui.activeEmployeeId = a.id; ui.view = 'employee';
      data.ui.periodMode = 'month'; data.ui.anchor = today;
    });
    toast('Sample employees added in ' + main.name + ' and ' + cafe.name + ' — delete them any time');
  }

  // =====================================================================
  // Toasts
  // =====================================================================
  function toast(msg, opts) {
    opts = opts || {};
    const t = document.createElement('div');
    t.className = 'toast' + (opts.error ? ' error' : '');
    t.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? '<button data-undo>Undo</button>' : ''}${opts.action ? `<button data-act>${esc(opts.action)}</button>` : ''}`;
    $('#toast-root').appendChild(t);
    if (opts.undo) $('[data-undo]', t).addEventListener('click', () => { t.remove(); undo(); });
    if (opts.action) $('[data-act]', t).addEventListener('click', () => { t.remove(); opts.fn(); });
    while ($('#toast-root').children.length > 2) $('#toast-root').firstChild.remove();
    setTimeout(() => t.remove(), opts.undo || opts.action ? 6000 : opts.error ? 5000 : 2600);
  }

  // =====================================================================
  // Navigation & commands
  // =====================================================================
  function setPeriod(mode) {
    data.ui.periodMode = mode;
    if (mode === 'custom' && !data.ui.custom.start) { const r = C.periodRange('month', data.ui.anchor); data.ui.custom = { start: r.start, end: r.end }; }
    saveUI(); render();
  }
  function shift(dir) { if (['week', 'fortnight', 'month'].includes(data.ui.periodMode)) { data.ui.anchor = C.shiftPeriod(data.ui.periodMode, data.ui.anchor, dir, S().weekStart); saveUI(); render(); } }
  function goToday() { data.ui.anchor = todayISO(); if (data.ui.periodMode === 'custom' || data.ui.periodMode === 'all') data.ui.periodMode = 'week'; saveUI(); render(); }

  const commands = {
    'new-employee': () => employeeModal(null),
    'edit-employee': () => activeEmp() && employeeModal(activeEmp()),
    'setup': () => employeeModal(null, { setup: true }),
    'load-sample': loadSample,
    'settings': settingsModal,
    'help': helpModal,
    'shortcuts': shortcutsModal,
    'go-overview': () => { if (!data.employees.length) return; ui.view = 'overview'; render(); },
    'new-workspace': () => workspaceModal(null),
    'edit-workspace': () => workspaceModal(activeWs()),
    'add-leave': () => ensureEmp() && leaveModal(),
    'import-attendance': () => ensureEmp() && importForActive(),
    'share': () => ensureEmp() && shareModal({}),
    'backup-center': backupCenter,
    'view-large': () => ensureEmp() && setTableView(tableView() === 'large' ? 'normal' : 'large'),
    'view-full': () => ensureEmp() && setTableView(tableView() === 'full' ? 'normal' : 'full'),
    'overview': () => commands['go-overview'](),
    'prev': () => shift(-1), 'next': () => shift(1), 'today': goToday,
    'add-day': () => ensureEmp() && addDay(),
    'add-week': () => ensureEmp() && addWeek(),
    'add-payment': () => ensureEmp() && paymentModal(null),
    'add-group': () => ensureEmp() && groupModal(null),
    'add-note': () => ensureEmp() && addNote(),
    'sort': () => ensureEmp() && sortByDate(),
    'verify': () => ensureEmp() && verifyModal(),
    'clock': () => ensureEmp() && clockToggle(),
    'break': () => ensureEmp() && breakToggle(),
    'export-csv': exportCSV,
    'export-summary': exportSummary,
    'print': printPDF,
    'backup': backup,
    'restore': restore,
    'undo': () => { const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'checkbox') document.execCommand('undo'); else undo(); },
    'redo': () => { const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'checkbox') document.execCommand('redo'); else redo(); },
  };
  function ensureEmp() {
    const list = members();
    if (!list.length) { toast(data.employees.length ? 'Add an employee to ' + activeWs().name + ' first' : 'Add an employee first'); return false; }
    if (ui.view !== 'employee' || !activeEmp()) { if (!activeEmp()) data.ui.activeEmployeeId = list[0].id; ui.view = 'employee'; render(); }
    return true;
  }

  // =====================================================================
  // Events
  // =====================================================================
  function bind() {
    document.addEventListener('click', e => {
      if (!e.target.closest('.pop') && !e.target.closest('[data-action="row-menu"]') && !e.target.closest('[data-action="export-menu"]') && !e.target.closest('[data-action="ws-menu"]') && !e.target.closest('[data-action="insert-menu"]') && !e.target.closest('[data-action="view-menu"]') && !e.target.closest('[data-explain]')) closePop();
      const per = e.target.closest('[data-period]');
      if (per) return setPeriod(per.dataset.period);
      const ex = e.target.closest('[data-explain]');
      if (ex) { e.stopPropagation(); return explain(ex); }
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const act = a.dataset.action;
      if (act === 'open-emp') {
        if (a.dataset.ws && wsById(a.dataset.ws)) { if (a.dataset.ws !== activeWs().id) { ui.search = ''; $('#emp-search').value = ''; } data.ui.activeWorkspaceId = a.dataset.ws; }
        data.ui.activeEmployeeId = a.dataset.emp; ui.view = 'employee'; ui.filter = 'all';
        if (a.dataset.date) { data.ui.anchor = a.dataset.date; if (data.ui.periodMode === 'custom') data.ui.periodMode = 'week'; }
        saveUI(); return render();
      }
      if (act === 'row-menu') { e.stopPropagation(); return rowMenu(a); }
      if (act === 'insert-menu') { e.stopPropagation(); if ($('#pop-root .ins-menu')) return closePop(); return insertMenu(a); }
      if (act === 'view-menu') { e.stopPropagation(); if ($('#pop-root .tv-menu')) return closePop(); return viewMenu(a); }
      if (act === 'ws-menu') {
        e.stopPropagation();
        if ($('#pop-root .ws-menu')) return closePop(); // second click closes
        return workspaceMenu(a);
      }
      if (act === 'ov-scope') { ui.ovScope = a.dataset.v; return render(); }
      if (act === 'export-menu') {
        e.stopPropagation();
        const p = popAt(a, `<button data-c="export-csv">${I.down} This period as CSV</button><button data-c="print">${I.print} This period as PDF</button><hr><button data-c="export-summary">HR summary (all employees) CSV</button><button data-c="backup">Back up all data (JSON)</button><hr><button data-c="import-attendance">${I.up} Import old attendance…</button>`, 'menu');
        p.addEventListener('click', ev => { const b = ev.target.closest('[data-c]'); if (b) { closePop(); commands[b.dataset.c](); } });
        return;
      }
      if (act === 'share-payment') { const tr = a.closest('tr[data-id]'); return shareModal({ paymentId: tr.dataset.id }); }
      if (act === 'edit-payment') { const tr = a.closest('tr[data-id]'); const { row } = findRow(tr.dataset.id); return paymentModal(row); }
      if (act === 'group-toggle' || act === 'group-edit') {
        const emp = activeEmp(); const tr = a.closest('tr[data-gid]');
        const g = emp && tr && groupsOf(emp.id).find(x => x.id === tr.dataset.gid); if (!g) return;
        if (act === 'group-edit') return groupModal(g);
        g.collapsed = !g.collapsed; saveUI(); return render(); // folding isn't undoable, like other view choices
      }
      if (act === 'filter') { ui.filter = a.dataset.v; return render(); }
      if (act === 'toggle-subtotals') { data.ui.subtotals = a.checked; saveUI(); return render(); }
      if (commands[act]) commands[act]();
    });

    $('#emp-search').addEventListener('input', e => { ui.search = e.target.value; renderSidebar(); });
    $('#custom-start').addEventListener('change', e => { data.ui.custom.start = e.target.value; saveUI(); render(); });
    $('#custom-end').addEventListener('change', e => { data.ui.custom.end = e.target.value; saveUI(); render(); });

    // Cell edits: commit on change; date pickers defer the re-render until the field loses focus
    let deferred = null;
    const view = $('#view');
    view.addEventListener('change', e => {
      const el = e.target;
      if (!el.dataset || !el.dataset.f) return;
      deferRender = true;
      let r;
      try { r = commitField(el); } finally { deferRender = false; }
      if (r === 'deferred') { if (document.activeElement === el) deferred = el; else requestRender(); }
    });
    view.addEventListener('focusout', e => { if (deferred && e.target === deferred) { deferred = null; setTimeout(render, 0); } });
    view.addEventListener('dblclick', e => { const d = e.target.closest('input.w-date'); if (d && d.showPicker) { try { d.showPicker(); } catch (_) {} } });
    view.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('invalid')) e.target.classList.remove('invalid'); });
    view.addEventListener('keydown', e => {
      const el = e.target;
      if (!el.classList || !el.classList.contains('cell-in')) return;
      if (e.key === 'Enter' || (e.key === 'ArrowDown' && el.type !== 'date' && el.tagName !== 'SELECT') || (e.key === 'ArrowUp' && el.type !== 'date' && el.tagName !== 'SELECT')) {
        e.preventDefault();
        const tr = el.closest('tr[data-id]');
        const dir = e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? 'previousElementSibling' : 'nextElementSibling';
        let n = tr[dir];
        while (n && !$(`[data-f="${el.dataset.f}"]`, n)) n = n[dir];
        if (n) { const t = $(`[data-f="${el.dataset.f}"]`, n); t.focus(); if (t.select) t.select(); }
        else el.blur();
      }
      if (e.key === 'Escape') { const tr = el.closest('tr[data-id]'); const { row } = findRow(tr.dataset.id); if (row && el.dataset.f in row && el.type !== 'checkbox') el.value = el.dataset.f === 'breakMin' ? breakStr(row.breakMin) : (row[el.dataset.f] == null ? '' : row[el.dataset.f]); el.blur(); }
    });

    // Drag & drop rows (grab the ⋮⋮ handle)
    let dragId = null;
    view.addEventListener('mousedown', e => { const g = e.target.closest('[data-grip]'); if (g) g.closest('tr').setAttribute('draggable', 'true'); });
    view.addEventListener('mouseup', () => $$('tr[draggable]').forEach(t => t.removeAttribute('draggable')));
    view.addEventListener('dragstart', e => {
      const tr = e.target.closest && e.target.closest('tr[data-id]'); if (!tr) return;
      dragId = tr.dataset.id; tr.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
    });
    view.addEventListener('dragover', e => {
      if (!dragId) return;
      const tr = e.target.closest('tr[data-id]'); if (!tr || tr.dataset.id === dragId) return;
      e.preventDefault();
      $$('.drag-over-top,.drag-over-bottom').forEach(x => x.classList.remove('drag-over-top', 'drag-over-bottom'));
      const r = tr.getBoundingClientRect();
      tr.classList.add(e.clientY < r.top + r.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
    });
    view.addEventListener('drop', e => {
      if (!dragId) return;
      const tr = e.target.closest('tr[data-id]');
      if (tr && tr.dataset.id !== dragId) {
        e.preventDefault();
        const before = tr.classList.contains('drag-over-top');
        const { rows, i, row } = findRow(dragId);
        const id = dragId;
        mutate(() => {
          rows.splice(i, 1);
          let j = rows.findIndex(x => x.id === tr.dataset.id);
          rows.splice(before ? j : j + 1, 0, row);
          adoptNeighbourDate(rows, row);
        });
        flashRow(id);
        if (row.type === 'day') {
          const k = rows.indexOf(row); const p = rows[k - 1], n = rows[k + 1];
          if ((p && p.date > row.date) || (n && n.date && n.date < row.date)) toast('Moved out of date order — totals unchanged. The running balance follows row order.', { action: 'Sort by date', fn: sortByDate });
        }
      }
    });
    view.addEventListener('dragend', () => { dragId = null; $$('.dragging,.drag-over-top,.drag-over-bottom').forEach(x => x.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom')); $$('tr[draggable]').forEach(t => t.removeAttribute('draggable')); });

    // Global keys
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if ($('#pop-root').children.length) return closePop();
        if (modalStack.length) return modalStack[modalStack.length - 1].close();
        if (tableView() !== 'normal' && !(e.target.closest && e.target.closest('.cell-in'))) return setTableView('normal');
      }
      if (api) return; // in the desktop app the menu accelerators handle shortcuts
      const mod = e.ctrlKey || e.metaKey; if (!mod) return;
      const k = e.key.toLowerCase();
      const map = { k: 'clock', b: 'break', n: 'add-day', l: 'add-leave', e: 'export-csv', t: 'today', '[': 'prev', ']': 'next', ',': 'settings', '0': 'overview' };
      let cmd = null;
      if (k === 'z') { if ((document.activeElement || {}).tagName === 'INPUT') return; cmd = e.shiftKey ? 'redo' : 'undo'; }
      else if (k === 'p' && e.shiftKey) cmd = 'add-payment';
      else if (k === 'v' && e.shiftKey) cmd = 'verify';
      else if (k === 'l' && e.shiftKey) cmd = 'view-large';
      else if (k === 'f' && e.shiftKey) cmd = 'view-full';
      else if (k === 'p') cmd = 'print';
      else cmd = map[k];
      if (cmd) { e.preventDefault(); commands[cmd](); }
    });
    if (api) api.onMenu(cmd => { if (commands[cmd]) commands[cmd](); });
    if (hasBackupApi()) { api.backup.onStatus(s => { backupState = s; renderBackupStatus(); }); api.backup.status().then(s => { if (s.ok) { backupState = s; renderBackupStatus(); } }); } else renderBackupStatus();
    window.addEventListener('resize', closePop);
    // leaving real full screen (Esc, F11, window controls) also leaves the full-screen table
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && tableView() === 'full') { data.ui.tableView = 'normal'; saveUI(); render(); } });
    $('#view').addEventListener('scroll', closePop, true);
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
    window.addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });
  }

  // =====================================================================
  // Boot
  // =====================================================================
  async function init() {
    data = (await loadData()) || blankData();
    fixActive();
    if (data.ui.tableView === 'full') data.ui.tableView = 'large';
    if (!data.employees.length) ui.view = 'employee';
    bind();
    render();
    // Expose for automated UI tests
    window.__TL = { get data() { return data; }, render, commands, C };
  }
  init();
})();
