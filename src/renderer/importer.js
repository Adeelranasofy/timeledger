/*
 * TimeLedger attendance importer.
 * Pure functions only — turns a CSV file or cells pasted from Excel / Google Sheets into ledger rows.
 * Shared by the UI and the test suite.
 *
 *   parseTable(text)            -> { rows: string[][], delimiter }
 *   guessMapping(table)         -> { header: bool, map: { date, in, out, break, hours, rate, paid, payment, type, note } }  (column index or -1)
 *   detectDateOrder(values)     -> { order: 'dmy' | 'mdy', sure: bool }
 *   parseDate(str, order, year) -> 'YYYY-MM-DD' or null
 *   buildRows(dataRows, map, opts) -> { items: [{ line, row, error, skip }], stats }
 *
 * Rows come back without ids; day rows have rate null unless the file gives one.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./calc.js'));
  else root.Importer = factory(root.Calc);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  const FIELDS = ['date', 'in', 'out', 'break', 'hours', 'rate', 'paid', 'payment', 'type', 'note'];

  // ---------- table ----------

  function splitLine(text, delim) {
    // RFC-4180-ish: quoted cells may contain the delimiter, newlines and "" escapes
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell.trim() === '') { q = true; cell = ''; }
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    row.push(cell); rows.push(row);
    return rows;
  }

  function parseTable(text) {
    text = String(text || '').replace(/^﻿/, '');
    // ignore quoted content (it may hold delimiters or line breaks) when sniffing the delimiter
    const sample = text.slice(0, 20000).replace(/"(?:[^"]|"")*"/g, '""').split(/\r?\n/).filter(l => l.trim()).slice(0, 8);
    let delimiter = ',', best = 0;
    for (const d of ['\t', ',', ';', '|']) {
      const counts = sample.map(l => l.split(d).length - 1);
      const min = counts.length ? Math.min(...counts) : 0;
      // prefer a delimiter that appears on every line; tabs win ties (pasted spreadsheet cells)
      const score = min > 0 ? min * 10 + (d === '\t' ? 5 : 0) : 0;
      if (score > best) { best = score; delimiter = d; }
    }
    const rows = splitLine(text, delimiter).map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
    const width = rows.reduce((a, r) => Math.max(a, r.length), 0);
    for (const r of rows) while (r.length < width) r.push('');
    return { rows, delimiter };
  }

  // ---------- values ----------

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const WEEKDAY = /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|sday|nesday|urday|rsday)?$/i;
  const MONTH_NAMES = 'january february march april may june july august september october november december'.split(' ');
  const monthOf = t => { const k = t.toLowerCase(); if (MONTHS[k]) return MONTHS[k]; const i = MONTH_NAMES.indexOf(k); return i >= 0 ? i + 1 : null; };

  function validDate(y, m, d) {
    if (y < 100) y += 2000;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100)) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return C.toISO(dt);
  }

  /** Many spreadsheet date spellings -> ISO. order 'dmy' | 'mdy' decides 03/04/2026. year fills "01 Sep". */
  function parseDate(str, order, year) {
    let s = String(str == null ? '' : str).trim();
    if (!s) return null;
    if (/^\d{5}(\.\d+)?$/.test(s)) { // Excel serial day number
      const n = Math.floor(parseFloat(s));
      if (n < 25000 || n > 80000) return null;
      const dt = new Date(1899, 11, 30); dt.setDate(dt.getDate() + n); return C.toISO(dt);
    }
    s = s.replace(/[T\s]+\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*([ap]\.?m\.?)?(z|[+-]\d{2}:?\d{2})?$/i, ''); // drop a time part
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return validDate(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (m) return order === 'mdy' ? validDate(+m[3], +m[1], +m[2]) : validDate(+m[3], +m[2], +m[1]);
    // text months: "01 Sep 2026", "Tue 1-Sep-26", "September 1, 2026", "01 Sep"
    const tok = s.split(/[\s,\-/.]+/).filter(t => t && !WEEKDAY.test(t));
    const mi = tok.findIndex(t => /^[a-z]+$/i.test(t) && monthOf(t));
    if (mi < 0) return null;
    const mon = monthOf(tok[mi]);
    const nums = tok.filter((t, i) => i !== mi && /^\d{1,4}$/.test(t)).map(Number);
    if (tok.length !== nums.length + 1) return null;
    let d, y;
    if (nums.length === 2) { d = nums[0] <= 31 && String(nums[0]).length <= 2 ? nums[0] : nums[1]; y = d === nums[0] ? nums[1] : nums[0]; }
    else if (nums.length === 1 && year) { d = nums[0]; y = year; }
    else return null;
    return validDate(y, mon, d);
  }

  /** Looks at a column of dates like 03/04/2026 and decides day-first or month-first. */
  function detectDateOrder(values) {
    let dmy = 0, mdy = 0;
    for (const v of values) {
      const m = String(v || '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
      if (!m) continue;
      if (+m[1] > 12 && +m[2] <= 12) dmy++;
      if (+m[2] > 12 && +m[1] <= 12) mdy++;
    }
    return { order: mdy > dmy ? 'mdy' : 'dmy', sure: dmy + mdy > 0 };
  }

  const isBlank = s => /^[\s\-–—:.]*$/.test(String(s == null ? '' : s));
  /** "9:00:00 AM" -> "9:00 AM" (spreadsheets add seconds) */
  const dropSeconds = s => String(s).trim().replace(/^(\d{1,2}:\d{2}):\d{2}(?=\s*([ap]\.?m?\.?)?$)/i, '$1');
  function parseClock(s) { return isBlank(s) ? '' : C.parseTime(dropSeconds(s)); }

  /** Worked hours: "8:30" / "8:30:00" -> 510, "8.5" / "8" -> hours, "8h 30m" -> 510 */
  function parseHours(s) {
    s = String(s == null ? '' : s).trim().toLowerCase().replace(/\s*(hours?|hrs?)$/, '');
    if (isBlank(s)) return null;
    let m = s.match(/^(\d+):(\d{2})(:\d{2})?$/);
    if (m) return +m[1] * 60 + +m[2];
    if (/^\d+([.,]\d+)?$/.test(s)) return Math.round(parseFloat(s.replace(',', '.')) * 60);
    if (/[hm]/.test(s)) return C.parseDuration(s);
    return null;
  }

  /** Breaks: blank -> 0, "30" -> 30 min, "0:30" / "0:30:00" -> 30, "1h 15m" -> 75, "0.5h" -> 30 */
  function parseBreak(s) {
    if (isBlank(s)) return 0;
    const t = String(s).trim().replace(/^(\d+:\d{2}):\d{2}$/, '$1');
    return C.parseDuration(t);
  }

  function parseMoney(s) {
    const t = String(s == null ? '' : s).replace(/[^\d.,\-]/g, '');
    if (!t) return null;
    // "1,234.50" or "1.234,50"
    const norm = /,\d{1,2}$/.test(t) && t.indexOf('.') < t.lastIndexOf(',') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    const n = parseFloat(norm);
    return isFinite(n) ? n : null;
  }

  const LEAVE_RE = /\b(leave|holiday|off|absent|vacation|sick|pto|eid)\b/i;
  const SUMMARY_RE = /brought forward|carried forward|opening balance|^total|period total|subtotal|week of/i;

  // ---------- mapping ----------

  const PATTERNS = {
    date: [/^date$/, /date/],
    type: [/^type$/, /^kind$/, /^entry( type)?$/],
    in: [/check.?in/, /clock.?in/, /time.?in\b|\bin.?time/, /^in$/, /^start|start time|arriv/],
    out: [/check.?out/, /clock.?out/, /time.?out\b|\bout.?time/, /^out$/, /^end$|end time|finish|depart/],
    break: [/break|rest|lunch/],
    rate: [/rate/],
    payment: [/payment amount/, /^payments?$/, /lump/],
    paid: [/paid on (the )?day/, /paid amount|amount paid/, /^paid(?!.*via)/],
    hours: [/hours?\s*\(decimal\)/, /working hours|^hours?$|hrs|duration|worked|total time/],
    note: [/note|comment|remark|reason|description|detail/],
  };
  const ORDER = ['date', 'type', 'in', 'out', 'break', 'rate', 'payment', 'paid', 'hours', 'note'];

  function guessMapping(table) {
    const map = {}; for (const f of FIELDS) map[f] = -1;
    const rows = table.rows || table;
    if (!rows.length) return { header: false, map };
    const first = rows[0].map(c => c.toLowerCase());
    const matchesHeader = first.some(c => ORDER.some(f => PATTERNS[f].some(p => p.test(c))));
    const header = matchesHeader && !first.some(c => parseDate(c, 'dmy', 2026));
    if (header) {
      const used = new Set();
      for (const f of ORDER) {
        for (const p of PATTERNS[f]) {
          const i = first.findIndex((c, k) => !used.has(k) && c && p.test(c));
          if (i >= 0) { map[f] = i; used.add(i); break; }
        }
      }
      if (map.date >= 0) return { header, map };
    }
    // no usable header: guess from the values
    const body = header ? rows.slice(1) : rows;
    const width = rows[0].length;
    const share = test => [...Array(width).keys()].map(k => { const vals = body.map(r => r[k]).filter(v => !isBlank(v)); return vals.length ? vals.filter(test).length / vals.length : 0; });
    const dateShare = share(v => !!parseDate(v, 'dmy', 2026) || !!parseDate(v, 'mdy', 2026));
    const bestDate = dateShare.indexOf(Math.max(...dateShare));
    if (dateShare[bestDate] >= 0.5) map.date = bestDate;
    const timeShare = share(v => /[:.]|[ap]\.?m/i.test(v) && parseClock(v) != null && parseClock(v) !== '');
    const times = timeShare.map((s, k) => [s, k]).filter(([s, k]) => s >= 0.6 && k !== map.date).map(([, k]) => k);
    if (times[0] != null) map.in = times[0];
    if (times[1] != null) map.out = times[1];
    return { header, map };
  }

  // ---------- rows ----------

  /**
   * @param dataRows  string[][] without the header
   * @param map       column index per field (-1 = not in the file)
   * @param opts      { order, year, defaultIn, paidAll, firstLine }
   */
  function buildRows(dataRows, map, opts) {
    opts = opts || {};
    const cell = (r, f) => (map[f] >= 0 ? String(r[map[f]] == null ? '' : r[map[f]]).trim() : '');
    const items = [];
    const stats = { day: 0, payment: 0, leave: 0, holiday: 0, note: 0, errors: 0, skipped: 0, minutes: 0, from: null, to: null };
    const firstLine = opts.firstLine || 1;
    dataRows.forEach((r, i) => {
      const line = firstLine + i;
      const raw = r;
      const type = cell(r, 'type').toLowerCase();
      const note = cell(r, 'note');
      const fail = error => { stats.errors++; items.push({ line, raw, row: null, error }); };
      if (SUMMARY_RE.test(type) || SUMMARY_RE.test(cell(r, 'date'))) { stats.skipped++; items.push({ line, raw, row: null, skip: 'Summary row' }); return; }
      if (map.date < 0) return fail('No date column chosen');
      const dateStr = cell(r, 'date');
      const date = parseDate(dateStr, opts.order, opts.year);
      if (!date) return fail(dateStr ? 'Unreadable date "' + dateStr + '"' : 'No date');
      let row;
      if (/payment/.test(type)) {
        const amount = parseMoney(cell(r, 'payment')) || parseMoney(cell(r, 'paid'));
        if (!(amount > 0)) return fail('Payment has no amount');
        let comment = note, from = '', to = '';
        const cov = note.match(/\s*\[covers (\S+) to (\S+)\]\s*$/); // TimeLedger's own CSV export
        if (cov) { comment = note.slice(0, cov.index); from = /^\d{4}-\d{2}-\d{2}$/.test(cov[1]) ? cov[1] : ''; to = /^\d{4}-\d{2}-\d{2}$/.test(cov[2]) ? cov[2] : ''; }
        row = { type: 'payment', date, amount, from, to, method: 'Cash', comment: comment || 'Imported payment', autoComment: false };
      } else if (/separator|^note$/.test(type)) {
        row = { type: 'note', date, text: note, tone: 'grey' };
      } else {
        const inRaw = cell(r, 'in'), outRaw = cell(r, 'out');
        const tin = parseClock(inRaw), tout = parseClock(outRaw);
        const noTimes = (tin == null || tin === '') && (tout == null || tout === '');
        // "Leave" typed in the time cells, a Type column, or a note like "Sick leave" on a day with no times or hours
        const offWord = [type, inRaw, outRaw].find(v => v && LEAVE_RE.test(v) && parseClock(v) == null)
          || (tin === '' && tout === '' && parseHours(cell(r, 'hours')) == null && LEAVE_RE.test(note) ? note : '');
        if (/leave|holiday|absent|off/.test(type) || (offWord && noTimes)) {
          const src = (type + ' ' + (offWord || '') + ' ' + note).toLowerCase();
          const kind = /holiday|eid|public/.test(src) ? 'holiday' : 'leave';
          const label = offWord && !/^(leave|holiday|off)$/i.test(offWord) ? offWord : '';
          row = { type: 'leave', date, kind, note: note || label };
        } else {
          if (tin == null) return fail('Unreadable check-in "' + inRaw + '"');
          if (tout == null) return fail('Unreadable check-out "' + outRaw + '"');
          const br = parseBreak(cell(r, 'break'));
          if (br == null) return fail('Unreadable break "' + cell(r, 'break') + '"');
          let tIn = tin, tOut = tout, rowNote = note;
          if (tIn === '' && tOut === '') {
            const h = parseHours(cell(r, 'hours'));
            if (h == null || h <= 0) return fail('No check-in / check-out or hours');
            // only a number of hours is known: start at the default check-in and derive the end
            tIn = C.parseTime(opts.defaultIn || '09:00');
            tOut = (tIn + h + br) % 1440;
            rowNote = (note ? note + ' · ' : '') + 'Imported as ' + C.formatHM(h) + ' h (times estimated)';
          }
          const rate = parseMoney(cell(r, 'rate'));
          const paidRaw = cell(r, 'paid');
          let paid = false, paidAmount = '';
          if (/^(yes|y|paid|true|✓|✔|x|done|full)$/i.test(paidRaw)) paid = true;
          else if (!isBlank(paidRaw) && !/^(no|n|unpaid|false|pending)$/i.test(paidRaw)) { const n = parseMoney(paidRaw); if (n > 0) paidAmount = n; }
          else if (isBlank(paidRaw) && opts.paidAll) paid = true;
          row = { type: 'day', date, in: tIn === '' ? '' : C.toTimeStr(tIn), out: tOut === '' ? '' : C.toTimeStr(tOut), breakMin: br, rate: rate > 0 ? rate : null, paid, paidAmount, note: rowNote };
        }
      }
      if (row.type === 'day') { stats.day++; stats.minutes += C.dayHours(row).minutes; }
      else if (row.type === 'leave') stats[row.kind === 'holiday' ? 'holiday' : 'leave']++;
      else stats[row.type]++;
      if (!stats.from || date < stats.from) stats.from = date;
      if (!stats.to || date > stats.to) stats.to = date;
      items.push({ line, raw, row });
    });
    return { items, stats };
  }

  return { FIELDS, parseTable, guessMapping, detectDateOrder, parseDate, parseHours, parseBreak, parseMoney, buildRows };
});
