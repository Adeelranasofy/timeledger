const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/renderer/calc.js');

const emp = { hourlyRate: 500, openingBalance: 0 };
const day = (date, i, o, b, extra) => Object.assign({ id: 'd' + date + i, type: 'day', date, in: i, out: o, breakMin: b }, extra);
const pay = (date, amount, extra) => Object.assign({ id: 'p' + date + amount, type: 'payment', date, amount }, extra);

test('parseTime', () => {
  assert.equal(C.parseTime('09:30'), 570);
  assert.equal(C.parseTime('9:05'), 545);
  assert.equal(C.parseTime('1745'), 1065);
  assert.equal(C.parseTime('830'), 510);
  assert.equal(C.parseTime('9'), 540);
  assert.equal(C.parseTime('17.45'), 1065);
  assert.equal(C.parseTime('24:00'), null);
  assert.equal(C.parseTime(''), null);
});

test('parseDuration accepts friendly formats', () => {
  assert.equal(C.parseDuration('45'), 45);
  assert.equal(C.parseDuration('0:45'), 45);
  assert.equal(C.parseDuration('1:15'), 75);
  assert.equal(C.parseDuration('1h'), 60);
  assert.equal(C.parseDuration('1.5h'), 90);
  assert.equal(C.parseDuration('1h 15m'), 75);
  assert.equal(C.parseDuration('90m'), 90);
  assert.equal(C.parseDuration(''), 0);
  assert.equal(C.parseDuration('abc'), null);
});

test('hours = out - in - break', () => {
  const h = C.dayHours(day('2026-09-01', '09:00', '17:30', '30'));
  assert.equal(h.minutes, 480);
  assert.equal(h.status, 'ok');
});

test('overnight shift wraps midnight', () => {
  const h = C.dayHours(day('2026-09-01', '22:00', '06:00', '60'));
  assert.equal(h.minutes, 420);
  assert.equal(h.overnight, true);
});

test('break longer than shift is an error and clamps to 0', () => {
  const h = C.dayHours(day('2026-09-01', '09:00', '09:30', '45'));
  assert.equal(h.minutes, 0);
  assert.ok(h.issues.some(i => i.level === 'error'));
});

test('missing check-out -> open, 0 hours', () => {
  const h = C.dayHours(day('2026-09-01', '09:00', '', '0'));
  assert.equal(h.status, 'open');
  assert.equal(h.minutes, 0);
});

test('amount rounding per row', () => {
  // 7h 20m at 333 = 2442.00; 1 minute at 100 = 1.666.. -> 1.67
  assert.equal(C.amountFor(440, 333, 2), 2442);
  assert.equal(C.amountFor(1, 100, 2), 1.67);
  assert.equal(C.amountFor(1, 100, 0), 2);
  assert.equal(C.roundMoney(1.005, 2), 1.01);
  assert.equal(C.amountFor(399, 6.1, 2), 40.57); // 40.565 exactly -> half-up, despite float noise
  assert.equal(C.roundMoney(-2.5, 0), -3);
});

test('ledger: balance = earned - paid, running balance, paid checkbox', () => {
  const rows = [
    day('2026-09-01', '09:00', '17:00', '60'),              // 7h -> 3500
    day('2026-09-02', '09:00', '13:00', '0', { paid: true }), // 4h -> 2000 paid
    day('2026-09-03', '09:00', '12:00', '0', { paidAmount: 500 }), // 3h -> 1500, 500 paid
  ];
  const L = C.computeLedger(rows, emp, { decimals: 2 });
  assert.equal(L.totals.earned, 7000);
  assert.equal(L.totals.paid, 2500);
  assert.equal(L.totals.balance, 4500);
  assert.deepEqual(L.rows.map(r => r.c.running), [3500, 3500, 4500]);
  assert.deepEqual(L.rows.map(r => r.c.state), ['unpaid', 'paid', 'partial']);
});

test('lump-sum payment with range covers days, no double counting', () => {
  const rows = [
    day('2026-09-01', '09:00', '10:00', '0'),  // 500
    day('2026-09-02', '09:00', '10:00', '0'),  // 500
    day('2026-09-03', '09:00', '10:00', '0'),  // 500
    pay('2026-09-04', 800, { from: '2026-09-01', to: '2026-09-03' }),
  ];
  const L = C.computeLedger(rows, emp, { decimals: 2 });
  assert.equal(L.totals.balance, 700);
  assert.equal(L.totals.running, 700);
  assert.deepEqual(L.rows.slice(0, 3).map(r => r.c.balance), [0, 200, 500]);
  assert.deepEqual(L.rows.slice(0, 3).map(r => r.c.state), ['covered', 'partial', 'unpaid']);
  assert.equal(L.rows[3].c.unapplied, 0);
});

test('advance payment settles later days', () => {
  const rows = [
    pay('2026-09-01', 1000),
    day('2026-09-02', '09:00', '10:00', '0'),
    day('2026-09-03', '09:00', '10:00', '0'),
  ];
  const L = C.computeLedger(rows, emp, { decimals: 2 });
  assert.equal(L.totals.balance, 0);
  assert.equal(L.totals.credit, 0);
  assert.deepEqual(L.rows.map(r => r.c.running), [-1000, -500, 0]);
});

test('totals are independent of row order (move / sort safe)', () => {
  const rows = [
    day('2026-09-01', '08:15', '17:40', '45'),
    pay('2026-09-05', 1234.5),
    day('2026-09-03', '10:00', '18:10', '1:05', { rate: 612.25 }),
    day('2026-09-02', '22:00', '05:30', '30', { paidAmount: 100 }),
    { id: 'n1', type: 'note', date: '2026-09-04', text: 'Week 1' },
  ];
  const a = C.computeLedger(rows, emp, { decimals: 2 }).totals;
  const shuffled = [rows[3], rows[4], rows[0], rows[2], rows[1]];
  const b = C.computeLedger(shuffled, emp, { decimals: 2 }).totals;
  for (const k of ['earned', 'paid', 'balance', 'minutes', 'running', 'credit']) assert.equal(a[k], b[k], k);
});

test('period view carry-forward in/out chains across periods', () => {
  const rows = [
    day('2026-08-31', '09:00', '17:00', '0'), // 4000 (week of Aug 31)
    day('2026-09-07', '09:00', '13:00', '0'), // 2000 (next week)
    pay('2026-09-08', 3000),
    day('2026-09-14', '09:00', '11:00', '0'), // 1000
  ];
  const L = C.computeLedger(rows, { hourlyRate: 500, openingBalance: 250 }, { decimals: 2 });
  const w1 = C.periodView(L, C.periodRange('week', '2026-09-01', 1));
  const w2 = C.periodView(L, C.periodRange('week', '2026-09-08', 1));
  const w3 = C.periodView(L, C.periodRange('week', '2026-09-15', 1));
  assert.equal(w1.carryIn, 250);
  assert.equal(w1.carryOut, 4250);
  assert.equal(w2.carryIn, w1.carryOut);
  assert.equal(w2.carryOut, 3250);
  assert.equal(w3.carryIn, w2.carryOut);
  assert.equal(w3.carryOut, L.totals.balance);
});

test('verify passes on clean data and flags bad data', () => {
  const clean = [day('2026-09-01', '09:00', '17:00', '30'), pay('2026-09-02', 100)];
  const r1 = C.verify(clean, emp, { decimals: 2 });
  assert.ok(r1.checks.every(c => c.level !== 'fail'), JSON.stringify(r1.checks));
  const bad = [day('2026-09-01', '09:00', '09:10', '30'), pay('2026-09-02', 0)];
  const r2 = C.verify(bad, emp, { decimals: 2 });
  assert.ok(r2.checks.some(c => c.level === 'fail'));
});

test('randomized: ledger identity always holds', () => {
  let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 300; n++) {
    const rows = [];
    for (let i = 0; i < 25; i++) {
      const date = C.addDays('2026-01-01', Math.floor(rnd() * 60));
      if (rnd() < 0.2) rows.push({ id: 'p' + i, type: 'payment', date, amount: Math.round(rnd() * 5000) / 100 * 10, from: rnd() < 0.5 ? C.addDays(date, -7) : '', to: rnd() < 0.5 ? date : '' });
      else rows.push({ id: 'd' + i, type: 'day', date, in: C.toTimeStr(Math.floor(rnd() * 1440)), out: C.toTimeStr(Math.floor(rnd() * 1440)), breakMin: String(Math.floor(rnd() * 90)), rate: rnd() < 0.3 ? (rnd() * 900).toFixed(2) : '', paid: rnd() < 0.2, paidAmount: rnd() < 0.2 ? (rnd() * 300).toFixed(2) : '' });
    }
    const dec = n % 3;
    const v = C.verify(rows, { hourlyRate: 437.5, openingBalance: (rnd() * 1000).toFixed(2) }, { decimals: dec });
    const fails = v.checks.filter(c => c.level === 'fail' && !/invalid entries/.test(c.title));
    assert.equal(fails.length, 0, JSON.stringify(fails));
  }
});

test('parseTime: 12-hour input with and without AM/PM', () => {
  assert.equal(C.parseTime('0600'), 360);
  assert.equal(C.parseTime('0600AM'), 360);
  assert.equal(C.parseTime('0600PM'), 1080);
  assert.equal(C.parseTime('6:30 pm'), 1110);
  assert.equal(C.parseTime('6p'), 1080);
  assert.equal(C.parseTime('12:15am'), 15);
  assert.equal(C.parseTime('12pm'), 720);
  assert.equal(C.parseTime('9.30 a.m.'), 570);
  assert.equal(C.parseTime('13:00PM'), null);
  assert.equal(C.parseTime('0:30am'), null);
  // dropdown fallback applies only to 1–12 without a suffix
  assert.equal(C.parseTime('0600', 'PM'), 1080);
  assert.equal(C.parseTime('1200', 'AM'), 0);
  assert.equal(C.parseTime('0600AM', 'PM'), 360);
  assert.equal(C.parseTime('1830', 'AM'), 1110);
  assert.equal(C.parseTime('0030', 'PM'), 30);
});

test('split12 / formatClock', () => {
  assert.deepEqual(C.split12(0), { text: '12:00', mer: 'AM' });
  assert.deepEqual(C.split12(360), { text: '06:00', mer: 'AM' });
  assert.deepEqual(C.split12(1110), { text: '06:30', mer: 'PM' });
  assert.equal(C.formatClock('18:05', '12'), '06:05 PM');
  assert.equal(C.formatClock('18:05', '24'), '18:05');
  assert.equal(C.formatClock('', '12'), '');
});

test('leave and holiday rows count days off but never change money', () => {
  const lv = (date, kind) => ({ id: 'l' + date, type: 'leave', date, kind });
  const rows = [day('2026-09-01', '09:00', '17:00', '0'), lv('2026-09-02', 'leave'), lv('2026-09-03', 'holiday'), day('2026-09-04', '09:00', '13:00', '0')];
  const L = C.computeLedger(rows, emp, { decimals: 2 });
  assert.equal(L.totals.days, 2);
  assert.equal(L.totals.leave, 1);
  assert.equal(L.totals.holidays, 1);
  assert.equal(L.totals.earned, 6000);
  assert.equal(L.totals.balance, 6000);
  const V = C.periodView(L, { start: '2026-09-02', end: '2026-09-03' });
  assert.equal(V.totals.leave + V.totals.holidays, 2);
  assert.equal(V.carryIn, V.carryOut);
  const clash = C.verify(rows.concat([day('2026-09-02', '09:00', '10:00', '0')]), emp, { decimals: 2 });
  assert.equal(clash.checks.find(c => /leave or holiday/.test(c.title)).level, 'warn');
  assert.ok(C.verify(rows, emp, { decimals: 2 }).checks.every(c => c.level !== 'fail'));
});

test('pay group: 08–17 Sep earned 694, paid 300 + 300 = 600, 94 pending', () => {
  const e = { hourlyRate: 10, openingBalance: 0 };
  const dates = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-15', '2026-09-16'];
  const rows = dates.map(d => day(d, '08:00', '17:00', '0'))
    .concat([day('2026-09-17', '09:00', '15:24', '0'), day('2026-09-22', '09:00', '17:00', '0')])
    .concat([pay('2026-09-30', 300, { from: '2026-09-08', to: '2026-09-17' }), pay('2026-10-02', 300, { from: '2026-09-08', to: '2026-09-17' })]);
  const g = { id: 'g1', from: '2026-09-08', to: '2026-09-17', add: [], remove: [] };
  const L = C.computeLedger(rows, e, { decimals: 2 });
  const s = C.groupSummary(L, g, C.assignPayments(rows, [g]));
  assert.equal(s.days, 8);
  assert.equal(s.minutes, 7 * 540 + 384);
  assert.equal(s.earned, 694);
  assert.deepEqual(s.payments.map(p => [p.date, p.amount]), [['2026-09-30', 300], ['2026-10-02', 300]]);
  assert.equal(s.paid, 600);
  assert.equal(s.pending, 94);
  assert.ok(!s.rowIds.includes('d2026-09-2209:00'), 'a day after the group is not in it');
  // grouping is a report only: the ledger balance is the same with or without it
  assert.equal(L.totals.balance, 694 + 80 - 600);
  const v = C.verify(rows, e, { decimals: 2, groups: [g] });
  assert.equal(v.checks.find(c => /Pay group/.test(c.title)).level, 'pass');
});

test('pay group payments: auto by covered dates, hand-picked in or out, one group each', () => {
  const rows = [
    day('2026-09-01', '09:00', '17:00', '0'), day('2026-09-08', '09:00', '17:00', '0'),
    pay('2026-09-05', 1000, { from: '2026-09-01', to: '2026-09-03' }),  // inside A
    pay('2026-09-06', 500),                                              // no dates: only by hand
    pay('2026-09-12', 700, { from: '2026-09-01', to: '2026-09-10' }),    // spans both: fits neither
    pay('2026-09-13', 900, { from: '2026-09-08', to: '2026-09-09' }),    // inside B
  ];
  const A = { id: 'A', from: '2026-09-01', to: '2026-09-07', add: ['p2026-09-06500'], remove: [] };
  const B = { id: 'B', from: '2026-09-08', to: '2026-09-14', add: ['p2026-09-06500'], remove: ['p2026-09-13900'] };
  const m = C.assignPayments(rows, [B, A]);
  assert.equal(m.get('p2026-09-051000'), 'A');
  assert.equal(m.get('p2026-09-06500'), 'A', 'hand-picked by two groups: the earlier group keeps it');
  assert.equal(m.has('p2026-09-12700'), false);
  assert.equal(m.has('p2026-09-13900'), false, 'removed by hand');
  const L = C.computeLedger(rows, emp, { decimals: 2 });
  const a = C.groupSummary(L, A, m);
  assert.equal(a.paid, 1500);
  assert.equal(a.pending, 4000 - 1500);
  const b = C.groupSummary(L, B, m);
  assert.equal(b.payments.length, 0);
  assert.equal(b.pending, 4000);
});

test('pay group counts paid-on-the-day amounts and overpayment', () => {
  const rows = [day('2026-09-01', '09:00', '17:00', '0', { paid: true }), day('2026-09-02', '09:00', '13:00', '0', { paidAmount: '500' }),
    pay('2026-09-03', 2000, { from: '2026-09-01', to: '2026-09-02' })];
  const g = { id: 'g', from: '2026-09-01', to: '2026-09-02', add: [], remove: [] };
  const L = C.computeLedger(rows, emp, { decimals: 2 });
  const s = C.groupSummary(L, g, C.assignPayments(rows, [g]));
  assert.equal(s.earned, 6000);
  assert.equal(s.paidOnDay, 4500);
  assert.equal(s.paid, 6500);
  assert.equal(s.pending, -500);
});

test('verify flags overlapping pay groups', () => {
  const rows = [day('2026-09-01', '09:00', '17:00', '0')];
  const groups = [{ id: 'a', from: '2026-09-01', to: '2026-09-07' }, { id: 'b', from: '2026-09-07', to: '2026-09-10' }];
  const v = C.verify(rows, emp, { decimals: 2, groups });
  assert.equal(v.checks.find(c => /Pay group/.test(c.title)).level, 'fail');
});
