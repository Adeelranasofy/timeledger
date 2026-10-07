/*
 * TimeLedger calculation engine.
 * Pure functions only — no DOM, no storage. Shared by the UI and the test suite.
 *
 * Core formulas
 *   Working minutes = (Check-out − Check-in) − Rest break         (overnight shifts wrap past midnight)
 *   Amount          = round(Working hours × Hourly rate, currency decimals)
 *   Row balance     = Amount − Paid on the day − Share of lump-sum payments
 *   Running balance = Carry-forward + Σ(Amount − Paid on the day) − Σ(Lump-sum payments)
 *
 * Every number is recomputed from row data on every change, never from cell positions,
 * so adding, removing, moving or sorting rows can never break a formula.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_MIN = 24 * 60;
  const MAX_SHIFT_WARN_MIN = 16 * 60;

  // ---------- parsing ----------

  /**
   * "09:30" / "9:30" / "0930" / "9.30" / "0600AM" / "6:30 pm" -> minutes since midnight, or null.
   * meridiem ('AM' | 'PM') is a fallback for 12-hour input typed without a suffix, e.g. "0600"
   * with the row's AM/PM dropdown on PM. Hours 0 and 13–23 are always read as 24-hour.
   */
  function parseTime(str, meridiem) {
    if (str == null) return null;
    let s = String(str).trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return null;
    let mer = null;
    const sx = s.match(/^(.*\d)([ap])\.?(?:m\.?)?$/);
    if (sx) { s = sx[1]; mer = sx[2]; }
    const m = s.match(/^(\d{1,2})[:.](\d{2})$/) || s.match(/^(\d{1,2})(\d{2})$/) || s.match(/^(\d{1,2})$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] != null ? parseInt(m[2], 10) : 0;
    if (!mer && meridiem && h >= 1 && h <= 12) mer = String(meridiem).toLowerCase()[0];
    if (mer) {
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (mer === 'p' ? 12 : 0);
    }
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /** 1080 -> { text: "06:00", mer: "PM" } (12-hour clock parts) */
  function split12(min) {
    if (min == null) return { text: '', mer: '' };
    const h = Math.floor(min / 60) % 24, m = min % 60;
    return { text: String(h % 12 || 12).padStart(2, '0') + ':' + String(m).padStart(2, '0'), mer: h < 12 ? 'AM' : 'PM' };
  }

  /** Clock time for display. fmt '12' -> "06:00 PM", otherwise "18:00". Accepts minutes or an "HH:MM" string. */
  function formatClock(t, fmt) {
    const min = typeof t === 'number' ? t : parseTime(t);
    if (min == null) return t == null ? '' : String(t);
    if (fmt === '12') { const p = split12(min); return p.text + ' ' + p.mer; }
    return toTimeStr(min);
  }

  /**
   * Break / duration input -> minutes, or null if unreadable.
   * Accepts "45" (minutes), "0:45", "1:15", "1h", "1h 15m", "1.5h", "90m", "" (0).
   */
  function parseDuration(str) {
    if (str == null) return 0;
    if (typeof str === 'number') return isFinite(str) && str >= 0 ? Math.round(str) : null;
    const s = String(str).trim().toLowerCase();
    if (!s) return 0;
    let m;
    if ((m = s.match(/^(\d+)$/))) return parseInt(m[1], 10);
    if ((m = s.match(/^(\d+):(\d{1,2})$/))) {
      const mm = parseInt(m[2], 10);
      return mm > 59 ? null : parseInt(m[1], 10) * 60 + mm;
    }
    if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h$/))) return Math.round(parseFloat(m[1]) * 60);
    if ((m = s.match(/^(\d+)\s*m(?:in)?$/))) return parseInt(m[1], 10);
    if ((m = s.match(/^(\d+)\s*h\s*(\d+)\s*m(?:in)?$/))) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    return null;
  }

  function toTimeStr(min) {
    if (min == null) return '';
    const h = Math.floor(min / 60) % 24, m = min % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /** 510 -> "8:30" */
  function formatHM(min) {
    if (min == null || !isFinite(min)) return '—';
    const neg = min < 0; min = Math.abs(Math.round(min));
    return (neg ? '−' : '') + Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
  }

  /** 510 -> "8.50" */
  function formatDecimalHours(min) {
    if (min == null || !isFinite(min)) return '—';
    return (min / 60).toFixed(2);
  }

  // ---------- money ----------

  function roundMoney(v, decimals) {
    const f = Math.pow(10, decimals == null ? 2 : decimals);
    // Trim binary float noise first (e.g. 40.5649999… -> 40.565) so half-up rounding is exact
    const scaled = parseFloat((v * f).toFixed(6));
    return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / f;
  }

  /** Amount for worked minutes at an hourly rate, rounded once at row level (like a spreadsheet cell). */
  function amountFor(minutes, rate, decimals) {
    if (!minutes || !rate) return 0;
    return roundMoney((minutes * rate) / 60, decimals);
  }

  function num(v) {
    const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/,/g, ''));
    return isFinite(n) ? n : 0;
  }

  // ---------- dates ----------

  function parseISO(d) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  function toISO(dt) {
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }
  function addDays(iso, n) {
    const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d);
  }
  /** First day of the week containing iso. weekStart: 0=Sun, 1=Mon … */
  function weekStartOf(iso, weekStart) {
    const d = parseISO(iso);
    const diff = (d.getDay() - (weekStart == null ? 1 : weekStart) + 7) % 7;
    d.setDate(d.getDate() - diff);
    return toISO(d);
  }
  function monthStartOf(iso) { return iso.slice(0, 8) + '01'; }
  function monthEndOf(iso) {
    const d = parseISO(monthStartOf(iso)); d.setMonth(d.getMonth() + 1); d.setDate(0); return toISO(d);
  }

  /** { start, end } (inclusive ISO dates) for a period mode around an anchor date. end/start null = open. */
  function periodRange(mode, anchor, weekStart, custom) {
    switch (mode) {
      case 'week': { const s = weekStartOf(anchor, weekStart); return { start: s, end: addDays(s, 6) }; }
      case 'fortnight': { const s = weekStartOf(anchor, weekStart); return { start: s, end: addDays(s, 13) }; }
      case 'month': return { start: monthStartOf(anchor), end: monthEndOf(anchor) };
      case 'custom': return { start: (custom && custom.start) || null, end: (custom && custom.end) || null };
      default: return { start: null, end: null };
    }
  }
  function shiftPeriod(mode, anchor, dir, weekStart) {
    if (mode === 'week') return addDays(anchor, 7 * dir);
    if (mode === 'fortnight') return addDays(anchor, 14 * dir);
    if (mode === 'month') {
      const d = parseISO(monthStartOf(anchor)); d.setMonth(d.getMonth() + dir); return toISO(d);
    }
    return anchor;
  }
  function inRange(date, range) {
    if (!date) return true;
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    return true;
  }

  // ---------- per-row ----------

  /** Hours for one day row. Returns { minutes, spanMin, breakMin, overnight, status, issues[] } */
  function dayHours(row) {
    const issues = [];
    const tin = parseTime(row.in), tout = parseTime(row.out);
    const brk = parseDuration(row.breakMin);
    if (brk == null) issues.push({ level: 'error', msg: 'Break duration is not readable' });
    const breakMin = brk == null ? 0 : brk;

    if (tin == null && tout == null) {
      return { minutes: 0, spanMin: 0, breakMin, overnight: false, status: 'empty', issues };
    }
    if (tin == null || tout == null) {
      issues.push({ level: 'warn', msg: tin == null ? 'Check-in time missing' : 'Check-out time missing' });
      return { minutes: 0, spanMin: 0, breakMin, overnight: false, status: 'open', issues };
    }
    let span = tout - tin;
    let overnight = false;
    if (span < 0) { span += DAY_MIN; overnight = true; }
    if (span === 0) issues.push({ level: 'warn', msg: 'Check-in and check-out are the same time' });
    let minutes = span - breakMin;
    if (minutes < 0) {
      issues.push({ level: 'error', msg: 'Break is longer than the shift' });
      minutes = 0;
    }
    if (span > MAX_SHIFT_WARN_MIN) issues.push({ level: 'warn', msg: 'Shift is longer than 16 hours' });
    if (overnight) issues.push({ level: 'info', msg: 'Overnight shift — check-out counted on the next day' });
    return { minutes, spanMin: span, breakMin, overnight, status: 'ok', issues };
  }

  /** Paid directly on the day row (checkbox = paid in full, otherwise the typed partial amount). */
  function directPaid(row, amount) {
    if (row.paid) return amount;
    return Math.max(0, num(row.paidAmount));
  }

  // ---------- ledger ----------

  /**
   * Computes every derived figure for one employee.
   * @param rows      array of rows in display order (day | payment | note)
   * @param employee  { hourlyRate, openingBalance }
   * @param opts      { decimals }
   * @returns { rows: [{row, c}], byId, totals, opening }
   */
  function computeLedger(rows, employee, opts) {
    const decimals = opts && opts.decimals != null ? opts.decimals : 2;
    const opening = roundMoney(num(employee && employee.openingBalance), decimals);
    const out = [];
    const byId = {};

    // Pass 1: per-row values
    for (const row of rows) {
      const c = { contribution: 0 };
      if (row.type === 'day') {
        const h = dayHours(row);
        const rate = row.rate != null && row.rate !== '' ? num(row.rate) : num(employee && employee.hourlyRate);
        const amount = amountFor(h.minutes, rate, decimals);
        let dp = roundMoney(directPaid(row, amount), decimals);
        const issues = h.issues.slice();
        if (dp > amount && amount >= 0) issues.push({ level: 'warn', msg: 'Paid more than the amount earned for this day' });
        Object.assign(c, h, { rate, amount, directPaid: dp, allocated: 0, allocations: [], issues });
        c.contribution = roundMoney(amount - dp, decimals);
      } else if (row.type === 'payment') {
        const amount = roundMoney(num(row.amount), decimals);
        const issues = [];
        if (amount <= 0) issues.push({ level: 'error', msg: 'Payment amount must be greater than zero' });
        if (row.from && row.to && row.from > row.to) issues.push({ level: 'error', msg: 'Payment "from" date is after "to" date' });
        Object.assign(c, { amount, applied: 0, unapplied: amount, covers: [], issues });
        c.contribution = -amount;
      } else {
        Object.assign(c, { issues: [] });
      }
      const item = { row, c };
      out.push(item);
      byId[row.id] = item;
    }

    // Pass 2: allocate lump-sum payments to outstanding days (for "covered" status + row balances).
    // This never changes the running balance — it only says which days a payment settled.
    const days = out.filter(x => x.row.type === 'day' && x.c.amount > 0)
      .slice().sort((a, b) => (a.row.date < b.row.date ? -1 : a.row.date > b.row.date ? 1 : 0));
    const outstanding = new Map(days.map(d => [d.row.id, Math.max(0, roundMoney(d.c.amount - d.c.directPaid, decimals))]));
    const payments = out.filter(x => x.row.type === 'payment' && x.c.amount > 0)
      .slice().sort((a, b) => (a.row.date < b.row.date ? -1 : a.row.date > b.row.date ? 1 : 0));

    const allocate = (p, filter) => {
      for (const d of days) {
        if (p.c.unapplied <= 0) break;
        const owed = outstanding.get(d.row.id);
        if (owed <= 0 || !filter(d)) continue;
        const take = roundMoney(Math.min(owed, p.c.unapplied), decimals);
        outstanding.set(d.row.id, roundMoney(owed - take, decimals));
        p.c.unapplied = roundMoney(p.c.unapplied - take, decimals);
        p.c.applied = roundMoney(p.c.applied + take, decimals);
        d.c.allocated = roundMoney(d.c.allocated + take, decimals);
        d.c.allocations.push({ paymentId: p.row.id, date: p.row.date, amount: take });
        p.c.covers.push(d.row.id);
      }
    };
    // (a) payments with an explicit range settle days inside that range
    for (const p of payments) if (p.row.from || p.row.to) allocate(p, d => inRange(d.row.date, { start: p.row.from || null, end: p.row.to || null }));
    // (b) payments without a range settle the oldest unpaid days up to the payment date
    for (const p of payments) if (!p.row.from && !p.row.to) allocate(p, d => d.row.date <= p.row.date);
    // (c) anything left over is an advance and settles later days
    for (const p of payments) if (!p.row.from && !p.row.to) allocate(p, () => true);

    // Pass 3: row balances, running balance, status, totals
    let running = opening;
    const t = { days: 0, minutes: 0, earned: 0, paidDirect: 0, payments: 0, paid: 0, balance: 0, credit: 0, issues: 0, errors: 0, leave: 0, holidays: 0 };
    for (const item of out) {
      const { row, c } = item;
      running = roundMoney(running + c.contribution, decimals);
      c.running = running;
      if (row.type === 'day') {
        c.paidTotal = roundMoney(c.directPaid + c.allocated, decimals);
        c.balance = roundMoney(c.amount - c.paidTotal, decimals);
        c.state = c.amount <= 0 ? (c.status === 'open' ? 'open' : 'none')
          : c.balance <= 0 ? (c.allocated > 0 && c.directPaid < c.amount ? 'covered' : 'paid')
            : c.paidTotal > 0 ? 'partial' : 'unpaid';
        if (c.status === 'ok' || c.minutes > 0) t.days++;
        t.minutes += c.minutes;
        t.earned = roundMoney(t.earned + c.amount, decimals);
        t.paidDirect = roundMoney(t.paidDirect + c.directPaid, decimals);
      } else if (row.type === 'payment') {
        t.payments = roundMoney(t.payments + c.amount, decimals);
        t.credit = roundMoney(t.credit + c.unapplied, decimals);
        if (c.amount > 0 && c.unapplied > 0) c.issues.push({ level: 'info', msg: 'Not fully matched to worked days (advance / credit)' });
      } else if (row.type === 'leave') {
        if (row.kind === 'holiday') t.holidays++; else t.leave++;
      }
      for (const i of c.issues) { if (i.level !== 'info') t.issues++; if (i.level === 'error') t.errors++; }
    }
    t.paid = roundMoney(t.paidDirect + t.payments, decimals);
    t.balance = roundMoney(opening + t.earned - t.paid, decimals);
    t.running = running;
    return { rows: out, byId, totals: t, opening, decimals };
  }

  /**
   * Slice a computed ledger to a period and compute brought/carried-forward amounts.
   * Carry-forward in = opening balance + contributions of every row dated before the period.
   */
  function periodView(ledger, range) {
    const d = ledger.decimals;
    let carryIn = ledger.opening;
    const inPeriod = [];
    for (const item of ledger.rows) {
      const date = item.row.date;
      if (range.start && date && date < range.start) { carryIn = roundMoney(carryIn + item.c.contribution, d); continue; }
      if (range.end && date && date > range.end) continue;
      inPeriod.push(item);
    }
    let running = carryIn;
    const t = { days: 0, minutes: 0, earned: 0, paidDirect: 0, payments: 0, paid: 0, credit: 0, leave: 0, holidays: 0 };
    const view = inPeriod.map(item => {
      running = roundMoney(running + item.c.contribution, d);
      const c = item.c;
      if (item.row.type === 'day') {
        if (c.minutes > 0) t.days++;
        t.minutes += c.minutes;
        t.earned = roundMoney(t.earned + c.amount, d);
        t.paidDirect = roundMoney(t.paidDirect + c.directPaid, d);
      } else if (item.row.type === 'payment') {
        t.payments = roundMoney(t.payments + c.amount, d);
      } else if (item.row.type === 'leave') {
        if (item.row.kind === 'holiday') t.holidays++; else t.leave++;
      }
      return { row: item.row, c, running };
    });
    t.paid = roundMoney(t.paidDirect + t.payments, d);
    t.periodBalance = roundMoney(t.earned - t.paid, d);
    const carryOut = roundMoney(carryIn + t.periodBalance, d);
    return { rows: view, totals: t, carryIn, carryOut };
  }

  // ---------- pay groups ----------

  /**
   * Which pay group each payment row belongs to. A group is { id, from, to, add[], remove[] }.
   * A payment joins a group automatically when the dates it covers lie inside the group's dates;
   * `add` pulls a payment in by hand and `remove` leaves one out. A payment belongs to one group
   * at most: hand-picked first, then the earliest group that fits.
   * @returns Map paymentId -> groupId
   */
  function assignPayments(rows, groups) {
    const out = new Map();
    const list = (groups || []).slice().sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    const pays = rows.filter(r => r.type === 'payment');
    const ids = new Set(pays.map(p => p.id));
    for (const g of list) for (const id of g.add || []) if (ids.has(id) && !out.has(id)) out.set(id, g.id);
    for (const p of pays) {
      if (out.has(p.id) || !p.from || !p.to) continue;
      const g = list.find(g => p.from >= g.from && p.to <= g.to && !(g.remove || []).includes(p.id));
      if (g) out.set(p.id, g.id);
    }
    return out;
  }

  /**
   * Totals for one pay group over its whole date range (not just the visible period).
   *   Paid    = Paid on the day (days in the group) + Σ(payments in the group)
   *   Pending = Earned − Paid       (negative = paid more than earned)
   * Grouping never changes the running balance; it only reports on a stretch of days.
   */
  function groupSummary(ledger, group, assigned) {
    const d = ledger.decimals;
    const s = { id: group.id, from: group.from, to: group.to, days: 0, minutes: 0, earned: 0, paidOnDay: 0, payments: [], paymentsTotal: 0, paid: 0, pending: 0, leave: 0, holidays: 0, rowIds: [] };
    for (const { row, c } of ledger.rows) {
      if (row.type === 'payment') {
        if (!assigned || assigned.get(row.id) !== group.id) continue;
        s.payments.push({ id: row.id, date: row.date, amount: c.amount, method: row.method || '' });
        s.paymentsTotal = roundMoney(s.paymentsTotal + c.amount, d);
      } else {
        if (!row.date || row.date < group.from || row.date > group.to) continue;
        if (row.type === 'day') {
          if (c.minutes > 0) s.days++;
          s.minutes += c.minutes;
          s.earned = roundMoney(s.earned + c.amount, d);
          s.paidOnDay = roundMoney(s.paidOnDay + c.directPaid, d);
        } else if (row.type === 'leave') {
          if (row.kind === 'holiday') s.holidays++; else s.leave++;
        }
      }
      s.rowIds.push(row.id);
    }
    s.payments.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    s.paid = roundMoney(s.paidOnDay + s.paymentsTotal, d);
    s.pending = roundMoney(s.earned - s.paid, d);
    return s;
  }

  // ---------- self-review ----------

  /**
   * Independent re-check of the ledger. Recomputes every figure a second way and
   * compares. Returns [{ level: 'pass'|'warn'|'fail', title, detail }].
   */
  function verify(rows, employee, opts) {
    const decimals = opts && opts.decimals != null ? opts.decimals : 2;
    const L = computeLedger(rows, employee, opts);
    const res = [];
    const add = (level, title, detail) => res.push({ level, title, detail });

    // 1. Hours: recompute from raw strings with a different method (Date objects)
    let hourMismatch = 0;
    for (const { row, c } of L.rows) {
      if (row.type !== 'day' || c.status !== 'ok') continue;
      const [ih, im] = String(row.in).split(/[:.]/).map(Number);
      const [oh, om] = String(row.out).split(/[:.]/).map(Number);
      const a = new Date(2000, 0, 1, ih, im || 0), b = new Date(2000, 0, 1, oh, om || 0);
      const same = a.getTime() === b.getTime();
      if (b < a) b.setDate(b.getDate() + 1);
      const expected = same ? 0 : Math.max(0, Math.round((b - a) / 60000) - (parseDuration(row.breakMin) || 0));
      if (expected !== c.minutes) hourMismatch++;
    }
    add(hourMismatch ? 'fail' : 'pass', 'Working hours = Check-out − Check-in − Break',
      hourMismatch ? hourMismatch + ' row(s) disagree with an independent recalculation' : 'All day rows recalculated independently and match');

    // 2. Amounts
    let amtMismatch = 0;
    for (const { row, c } of L.rows) {
      if (row.type !== 'day') continue;
      const exp = Math.round(parseFloat((c.minutes / 60 * c.rate * Math.pow(10, decimals)).toFixed(6))) / Math.pow(10, decimals);
      if (Math.abs(exp - c.amount) > Math.pow(10, -decimals) / 2) amtMismatch++;
    }
    add(amtMismatch ? 'fail' : 'pass', 'Amount = Hours × Hourly rate',
      amtMismatch ? amtMismatch + ' row(s) have an amount that does not match hours × rate' : 'Every amount matches hours × rate (rounded per row)');

    // 3. Ledger identity: two independent routes to the balance
    const sumEarned = L.rows.reduce((s, x) => s + (x.row.type === 'day' ? x.c.amount : 0), 0);
    const sumPaid = L.rows.reduce((s, x) => s + (x.row.type === 'day' ? x.c.directPaid : x.row.type === 'payment' ? x.c.amount : 0), 0);
    const identity = roundMoney(L.opening + sumEarned - sumPaid, decimals);
    const ok3 = Math.abs(identity - L.totals.running) < 1e-6 && Math.abs(identity - L.totals.balance) < 1e-6;
    add(ok3 ? 'pass' : 'fail', 'Balance = Carry-forward + Earned − Paid',
      ok3 ? 'Running balance and totals agree (' + identity.toFixed(decimals) + ')' : 'Running balance ' + L.totals.running + ' vs totals ' + identity);

    // 4. Allocations never exceed payments or day amounts
    let overAlloc = 0;
    for (const { row, c } of L.rows) {
      if (row.type === 'payment' && roundMoney(c.applied + c.unapplied, decimals) !== c.amount) overAlloc++;
      if (row.type === 'day' && c.allocated > roundMoney(c.amount - Math.min(c.amount, c.directPaid), decimals) + 1e-9) overAlloc++;
    }
    add(overAlloc ? 'fail' : 'pass', 'Payments are matched to days without double-counting',
      overAlloc ? overAlloc + ' allocation inconsistency(ies) found' : 'Each payment is fully accounted for (applied + credit = amount)');

    // 5. Data-entry issues
    const errs = [], warns = [];
    for (const { row, c } of L.rows) for (const i of c.issues) {
      const line = (row.date || '') + ' — ' + i.msg;
      if (i.level === 'error') errs.push(line); else if (i.level === 'warn') warns.push(line);
    }
    add(errs.length ? 'fail' : 'pass', 'No invalid entries', errs.length ? errs.join('\n') : 'No rows with invalid times, breaks or amounts');
    add(warns.length ? 'warn' : 'pass', 'No incomplete or unusual entries', warns.length ? warns.join('\n') : 'No missing check-outs, overpayments or very long shifts');

    // 6. Duplicate dates
    const seen = {}, dup = [];
    for (const r of rows) if (r.type === 'day' && r.date) { if (seen[r.date]) dup.push(r.date); seen[r.date] = 1; }
    add(dup.length ? 'warn' : 'pass', 'One day row per date',
      dup.length ? 'Multiple rows on: ' + [...new Set(dup)].join(', ') + ' (fine for split shifts)' : 'No duplicate dates');

    // 6b. Work logged on a leave / holiday date
    const offDates = new Set(rows.filter(r => r.type === 'leave' && r.date).map(r => r.date));
    const clash = [...new Set(L.rows.filter(x => x.row.type === 'day' && x.c.minutes > 0 && offDates.has(x.row.date)).map(x => x.row.date))];
    add(clash.length ? 'warn' : 'pass', 'No hours logged on leave or holiday dates',
      clash.length ? 'Hours are logged on a day marked as leave/holiday: ' + clash.join(', ') + ' (the hours are still paid)' : 'Leave and holiday days have no hours logged');

    // 7. Order
    let unsorted = 0;
    for (let i = 1; i < rows.length; i++) if (rows[i].date && rows[i - 1].date && rows[i].date < rows[i - 1].date) unsorted++;
    add(unsorted ? 'warn' : 'pass', 'Rows are in date order',
      unsorted ? unsorted + ' row(s) out of date order. Totals are unaffected; only the running-balance column follows row order. Use "Sort by date" to tidy.' : 'Rows are chronological');

    // 8. Credit
    add(L.totals.credit > 0 ? 'warn' : 'pass', 'Payments match worked days',
      L.totals.credit > 0 ? 'Unmatched payment credit of ' + L.totals.credit.toFixed(decimals) + ' (advance, or payment range with no unpaid days)' : 'All payments are matched to worked days');

    // 9. Pay groups: no overlaps, and pending = earned − paid recomputed straight from the rows
    const groups = (opts && opts.groups) || [];
    if (groups.length) {
      const sorted = groups.slice().sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
      const overlaps = [];
      for (let i = 1; i < sorted.length; i++) if (sorted[i].from <= sorted[i - 1].to) overlaps.push(sorted[i - 1].from + '…' + sorted[i - 1].to + ' and ' + sorted[i].from + '…' + sorted[i].to);
      const assigned = assignPayments(rows, groups);
      let bad = 0;
      for (const g of groups) {
        const s = groupSummary(L, g, assigned);
        let earned = 0, paid = 0;
        for (const r of rows) {
          if (r.type === 'day' && r.date >= g.from && r.date <= g.to) {
            const rate = r.rate != null && r.rate !== '' ? num(r.rate) : num(employee && employee.hourlyRate);
            const a = amountFor(dayHours(r).minutes, rate, decimals);
            earned += a; paid += roundMoney(directPaid(r, a), decimals);
          } else if (r.type === 'payment' && assigned.get(r.id) === g.id) paid += roundMoney(num(r.amount), decimals);
        }
        if (Math.abs(roundMoney(earned - paid, decimals) - s.pending) > 1e-6) bad++;
      }
      const lvl = bad || overlaps.length ? 'fail' : 'pass';
      add(lvl, 'Pay group totals: Pending = Earned − Paid',
        overlaps.length ? 'Pay groups overlap: ' + overlaps.join('; ') : bad ? bad + ' pay group(s) disagree with an independent recalculation' : groups.length + ' pay group(s) recalculated independently and match');
    }

    return { checks: res, ledger: L };
  }

  /** Default payment comment, e.g. "Paid Rs 460 for 01 Sep – 07 Sep 2026" */
  function paymentComment(amountStr, from, to, fmtDate) {
    if (from && to) return 'Paid ' + amountStr + ' for ' + fmtDate(from) + ' – ' + fmtDate(to);
    if (from) return 'Paid ' + amountStr + ' from ' + fmtDate(from);
    if (to) return 'Paid ' + amountStr + ' up to ' + fmtDate(to);
    return 'Paid ' + amountStr;
  }

  return {
    parseTime, split12, formatClock, parseDuration, toTimeStr, formatHM, formatDecimalHours,
    roundMoney, amountFor, num,
    parseISO, toISO, addDays, weekStartOf, monthStartOf, monthEndOf, periodRange, shiftPeriod, inRange,
    dayHours, directPaid, computeLedger, periodView, assignPayments, groupSummary, verify, paymentComment,
  };
});
