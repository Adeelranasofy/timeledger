const test = require('node:test');
const assert = require('node:assert/strict');
const Imp = require('../src/renderer/importer.js');

const run = (text, opts) => {
  const t = Imp.parseTable(text);
  const g = Imp.guessMapping(t);
  const body = g.header ? t.rows.slice(1) : t.rows;
  const order = Imp.detectDateOrder(body.map(r => r[g.map.date])).order;
  return Object.assign({ t, g }, Imp.buildRows(body, g.map, Object.assign({ order, year: 2026, defaultIn: '09:00', firstLine: g.header ? 2 : 1 }, opts)));
};

test('parseDate handles common spreadsheet spellings', () => {
  assert.equal(Imp.parseDate('2026-09-01'), '2026-09-01');
  assert.equal(Imp.parseDate('01/09/2026', 'dmy'), '2026-09-01');
  assert.equal(Imp.parseDate('09/01/2026', 'mdy'), '2026-09-01');
  assert.equal(Imp.parseDate('1.9.26', 'dmy'), '2026-09-01');
  assert.equal(Imp.parseDate('01 Sep 2026'), '2026-09-01');
  assert.equal(Imp.parseDate('Tue 1-Sep-26'), '2026-09-01');
  assert.equal(Imp.parseDate('September 1, 2026'), '2026-09-01');
  assert.equal(Imp.parseDate('01 Sep', 'dmy', 2026), '2026-09-01');
  assert.equal(Imp.parseDate('2026-09-01 00:00:00'), '2026-09-01');
  assert.equal(Imp.parseDate('46266'), '2026-09-01'); // Excel serial
  assert.equal(Imp.parseDate('31/02/2026', 'dmy'), null);
  assert.equal(Imp.parseDate('hello'), null);
});

test('detectDateOrder', () => {
  assert.deepEqual(Imp.detectDateOrder(['01/09/2026', '25/09/2026']), { order: 'dmy', sure: true });
  assert.deepEqual(Imp.detectDateOrder(['09/01/2026', '09/25/2026']), { order: 'mdy', sure: true });
  assert.equal(Imp.detectDateOrder(['01/02/2026']).sure, false);
});

test('pasted Excel cells: tabs, 12-hour times with seconds, header guessing', () => {
  const r = run('Date\tTime In\tTime Out\tLunch\tRemarks\n01/09/2026\t9:00:00 AM\t5:30:00 PM\t0:30:00\t\n02/09/2026\t0900\t1730\t30\tStock count\n03/09/2026\tLeave\t\t\tSick\n25/09/2026\t8:15 am\t4:45 pm\t\t');
  assert.equal(r.t.delimiter, '\t');
  assert.equal(r.g.header, true);
  assert.deepEqual([r.g.map.date, r.g.map.in, r.g.map.out, r.g.map.break, r.g.map.note], [0, 1, 2, 3, 4]);
  assert.equal(r.stats.day, 3);
  assert.equal(r.stats.leave, 1);
  assert.equal(r.stats.errors, 0);
  const d = r.items[0].row;
  assert.deepEqual([d.date, d.in, d.out, d.breakMin], ['2026-09-01', '09:00', '17:30', 30]);
  assert.equal(r.items[2].row.type, 'leave');
  assert.equal(r.items[2].row.note, 'Sick');
  assert.equal(r.stats.minutes, 480 + 480 + 510);
  assert.deepEqual([r.stats.from, r.stats.to], ['2026-09-01', '2026-09-25']);
});

test('TimeLedger CSV export round-trips days, payments, leave and skips summary rows', () => {
  const csv = [
    'Date,Day,Type,Check-in,Check-out,Rest break (h:mm),Working hours (h:mm),Working hours (decimal),Rate,Amount,Paid on day,Paid via payments,Payment amount,Balance,Running balance,Status,Comment / notes',
    '2026-09-01,,Brought forward,,,,,,,,,,,,0,,',
    '2026-09-01,Tue,Day,09:00,17:00,1:00,7:00,7.00,650,4550,0,4550,,0,4550,covered,',
    '2026-09-02,Wed,Day,06:00 PM,11:30 PM,0:30,5:00,5.00,700,3500,3500,0,,0,4550,paid,Late shift',
    '2026-09-03,Thu,Holiday,,,,,,,,,,,,4550,,Public holiday',
    '2026-09-07,Mon,Payment,,,,,,,,,,4550,,0,Cash,"Paid Rs 4,550 for 01 Sep – 01 Sep 2026 [covers 2026-09-01 to 2026-09-01]"',
    '2026-09-07,,Carried forward,,,,12:00,12.00,,8050,3500,,4550,0,0,,Currency: PKR',
  ].join('\r\n');
  const r = run(csv);
  assert.equal(r.g.map.paid, 10, 'uses "Paid on day", not "Paid via payments"');
  assert.equal(r.g.map.payment, 12);
  assert.equal(r.g.map.hours, 7);
  assert.equal(r.stats.skipped, 2);
  assert.deepEqual([r.stats.day, r.stats.holiday, r.stats.payment, r.stats.errors], [2, 1, 1, 0]);
  const rows = r.items.filter(x => x.row).map(x => x.row);
  assert.deepEqual([rows[0].rate, rows[0].paid, rows[0].paidAmount], [650, false, '']);
  assert.deepEqual([rows[1].in, rows[1].out, rows[1].paidAmount, rows[1].note], ['18:00', '23:30', 3500, 'Late shift']);
  const p = rows[3];
  assert.deepEqual([p.type, p.amount, p.from, p.to, p.comment], ['payment', 4550, '2026-09-01', '2026-09-01', 'Paid Rs 4,550 for 01 Sep – 01 Sep 2026']);
});

test('hours-only sheets, paid flags, "already paid" option and errors', () => {
  const r = run('date;hours;paid\n1 Sep 2026;8.5;yes\n2 Sep 2026;7:45;\n3 Sep 2026;;\nsomeday;8;\n4 Sep 2026;6;1200', { paidAll: true });
  assert.equal(r.t.delimiter, ';');
  const [a, b, c, bad, e] = r.items;
  assert.deepEqual([a.row.in, a.row.out, a.row.paid], ['09:00', '17:30', true]);
  assert.match(a.row.note, /times estimated/);
  assert.equal(b.row.paid, true, 'blank paid + "already paid" option');
  assert.equal(c.error, 'No check-in / check-out or hours');
  assert.match(bad.error, /Unreadable date/);
  assert.deepEqual([e.row.paid, e.row.paidAmount], [false, 1200]);
  assert.equal(r.stats.errors, 2);
});

test('no header: columns guessed from the values', () => {
  const r = run('2026-09-01,09:00,17:00\n2026-09-02,08:30,16:30');
  assert.equal(r.g.header, false);
  assert.deepEqual([r.g.map.date, r.g.map.in, r.g.map.out], [0, 1, 2]);
  assert.equal(r.stats.day, 2);
  assert.equal(r.items[0].line, 1);
});

test('quoted CSV cells with commas and line breaks', () => {
  const t = Imp.parseTable('Date,Note\n2026-09-01,"Hello, world"\n2026-09-02,"two\nlines ""quoted"""');
  assert.deepEqual(t.rows[1], ['2026-09-01', 'Hello, world']);
  assert.deepEqual(t.rows[2], ['2026-09-02', 'two\nlines "quoted"']);
});

test('money parsing', () => {
  assert.equal(Imp.parseMoney('Rs 1,234.50'), 1234.5);
  assert.equal(Imp.parseMoney('1.234,50'), 1234.5);
  assert.equal(Imp.parseMoney(''), null);
});
