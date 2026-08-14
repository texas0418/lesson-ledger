// test-models.ts — pure-module tests for the domain math: money, dates,
// clock/duration parsing, slot occurrences, the reminder ladder, buckets,
// message templates, and the invoice HTML. No expo, no sqlite.
// Run with: npx tsx test-models.ts

import {
  STEPS,
  Slot,
  addDays,
  bucketInvoices,
  dayKey,
  daysOverdue,
  diffDays,
  dueShorthand,
  formatClock,
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatMoney,
  formatMonth,
  formatYmd,
  isInvoiceStatus,
  isLessonStatus,
  isStepKey,
  lessonAmountCents,
  monthBounds,
  nextStep,
  occurrencesOn,
  overdueCents,
  summarizeLessons,
  parseClock,
  parseMoneyToCents,
  parseYmd,
  payerDisplayName,
  slotLabel,
  stepDateMs,
  todayNoonMs,
  unbilledCents,
} from './src/models';
import { mailtoUrl, renderInvoiceCover, renderReminder } from './src/messages';
import { invoiceTotalCents, renderInvoiceHtml } from './src/invoiceHtml';

let failures = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok   ${name}`);
};

const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime();

// ---- money ----
eq('parse plain dollars', parseMoneyToCents('20'), 2000);
eq('parse cents', parseMoneyToCents('20.5'), 2050);
eq('parse full', parseMoneyToCents('1,250.50'), 125050);
eq('parse rejects junk', parseMoneyToCents('abc'), null);
eq('parse rejects 3 decimals', parseMoneyToCents('12.345'), null);
eq('format adds commas', formatMoney(125050), '$1,250.50');
eq('format other symbol', formatMoney(2000, '€'), '€20.00');

// ---- lesson amounts ----
eq('hour at $50', lessonAmountCents(5000, 60), 5000);
eq('90 min at $50', lessonAmountCents(5000, 90), 7500);
eq('45 min at $50', lessonAmountCents(5000, 45), 3750);
eq('20 min at $50 rounds to cent', lessonAmountCents(5000, 20), 1667);

// ---- dates ----
const DUE = noon(2026, 6, 19); // Jul 19, 2026
eq('parseYmd round-trip', formatYmd(parseYmd('2026-07-19')!), '2026-07-19');
eq('parseYmd rejects junk', parseYmd('next tuesday'), null);
eq('parseYmd rejects Feb 30', parseYmd('2026-02-30'), null);
eq('parseYmd pins to noon', new Date(parseYmd('2026-07-19')!).getHours(), 12);
eq('formatDayLong', formatDayLong(DUE), 'Jul 19, 2026');
eq('formatDayShort', formatDayShort(DUE), 'Jul 19');
eq('dayKey', dayKey(DUE), 20260719);
eq('addDays crosses month', formatYmd(addDays(DUE, 15)), '2026-08-03');
// DST: US spring-forward Mar 8 2026 — a calendar-day add must not slip a day
eq('addDays across DST', formatYmd(addDays(noon(2026, 2, 7), 1)), '2026-03-08');
eq('diffDays', diffDays(DUE, noon(2026, 6, 24)), 5);
eq('diffDays ignores clock time', diffDays(new Date(2026, 6, 19, 23).getTime(), new Date(2026, 6, 20, 1).getTime()), 1);
eq('daysOverdue before due', daysOverdue(DUE, noon(2026, 6, 10)), -9);
eq('todayNoonMs', new Date(todayNoonMs(new Date(2026, 6, 19, 3).getTime())).getHours(), 12);

// ---- clock + duration ----
eq('clock 3:30 pm', parseClock('3:30 pm'), 930);
eq('clock 15:30', parseClock('15:30'), 930);
eq('clock 3pm', parseClock('3pm'), 900);
eq('clock 930 as 9h30', parseClock('930'), 570);
eq('clock 12am is midnight', parseClock('12am'), 0);
eq('clock 12pm is noon', parseClock('12pm'), 720);
eq('clock rejects 25', parseClock('25:00'), null);
eq('clock rejects junk', parseClock('half past'), null);
eq('clock rejects 13pm', parseClock('13pm'), null);
eq('formatClock morning', formatClock(570), '9:30 AM');
eq('formatClock afternoon', formatClock(930), '3:30 PM');
eq('formatClock midnight', formatClock(0), '12:00 AM');
eq('formatClock noon', formatClock(720), '12:00 PM');
eq('duration 60', formatDuration(60), '1h');
eq('duration 45', formatDuration(45), '45m');
eq('duration 90', formatDuration(90), '1h 30m');

// ---- occurrences ----
// Jul 19 2026 is a Sunday (weekday 0); Jul 20 a Monday.
const slotSun: Slot = { id: 1, studentId: 7, weekday: 0, startMin: 930, durationMin: 60 };
const slotSun2: Slot = { id: 2, studentId: 8, weekday: 0, startMin: 570, durationMin: 45 };
const slotMon: Slot = { id: 3, studentId: 7, weekday: 1, startMin: 600, durationMin: 60 };
const slots = [slotSun, slotSun2, slotMon];

const sundayOcc = occurrencesOn(slots, [], noon(2026, 6, 19));
eq('sunday has two occurrences', sundayOcc.length, 2);
eq('occurrences sorted by time', sundayOcc.map((o) => o.slot.id), [2, 1]);
eq('occurrence start is slot time that day',
  new Date(sundayOcc[1].startMs).getHours() * 60 + new Date(sundayOcc[1].startMs).getMinutes(),
  930);
eq('monday has one occurrence', occurrencesOn(slots, [], noon(2026, 6, 20)).length, 1);

const loggedSunday = {
  id: 11, studentId: 7, slotId: 1, startMs: sundayOcc[1].startMs,
  durationMin: 60, amountCents: 5000, status: 'completed' as const,
  invoiceId: null, notes: '',
};
const withLog = occurrencesOn(slots, [loggedSunday], noon(2026, 6, 19));
eq('logged lesson attaches to its slot', withLog[1].lesson?.id, 11);
eq('other slot stays unlogged', withLog[0].lesson, null);
// same slot, different week: no attachment
eq('log does not leak across weeks',
  occurrencesOn(slots, [loggedSunday], noon(2026, 6, 26))[1].lesson, null);

eq('slotLabel', slotLabel(slotSun), 'Sun 3:30 PM · 1h');
eq('payer falls back to student', payerDisplayName({ name: 'Maya', payerName: '' }), 'Maya');
eq('payer preferred when set', payerDisplayName({ name: 'Maya', payerName: 'Dana' }), 'Dana');

// ---- the ladder (unchanged from Dundue; spot-check the contract) ----
eq('ladder shape', STEPS.map((s) => s.offsetDays), [-3, 0, 3, 7, 14, 30]);
eq('stepDateMs', formatYmd(stepDateMs(DUE, STEPS[0])), '2026-07-16');
eq('quiet before the window', nextStep(DUE, [], noon(2026, 6, 9)), null);
eq('courtesy at T-3', nextStep(DUE, [], noon(2026, 6, 16))?.key, 'before');
eq('quiet after courtesy sent', nextStep(DUE, ['before'], noon(2026, 6, 17)), null);
eq('due-today fires', nextStep(DUE, ['before'], noon(2026, 6, 19))?.key, 'due');
eq('late entry skips to latest', nextStep(DUE, [], noon(2026, 6, 27))?.key, 'overdue7');
eq('quiet between rungs', nextStep(DUE, ['overdue7'], noon(2026, 6, 29)), null);
eq('escalates at day 14', nextStep(DUE, ['overdue7'], noon(2026, 7, 2))?.key, 'overdue14');
eq('never repeats below history', nextStep(DUE, ['overdue14'], noon(2026, 7, 3)), null);
eq('final notice at day 30', nextStep(DUE, ['overdue14'], noon(2026, 7, 18))?.key, 'overdue30');
eq('ladder exhausted', nextStep(DUE, ['overdue30'], noon(2027, 0, 1)), null);

// ---- buckets + totals ----
const NOW = noon(2026, 6, 19);
const buckets = bucketInvoices(
  [
    { id: 'nextmonth', dueMs: noon(2026, 7, 12) },
    { id: 'lastweek', dueMs: noon(2026, 6, 12) },
    { id: 'today', dueMs: noon(2026, 6, 19) },
  ],
  NOW,
);
eq('overdue bucket', buckets.overdue.map((i) => i.id), ['lastweek']);
eq('due soon includes today', buckets.dueSoon.map((i) => i.id), ['today']);
eq('later bucket', buckets.later.map((i) => i.id), ['nextmonth']);

eq('unbilled sums completed uninvoiced only',
  unbilledCents([
    { status: 'completed', invoiceId: null, amountCents: 5000 },
    { status: 'completed', invoiceId: 4, amountCents: 7000 },
    { status: 'cancelled', invoiceId: null, amountCents: 0 },
  ]),
  5000);
eq('overdue sums past-due open only',
  overdueCents(
    [
      { status: 'open', amountCents: 10000, dueMs: noon(2026, 6, 12) },
      { status: 'open', amountCents: 5000, dueMs: noon(2026, 6, 25) },
      { status: 'paid', amountCents: 99900, dueMs: noon(2026, 6, 1) },
    ],
    NOW,
  ),
  10000);
eq('shorthand overdue', dueShorthand(noon(2026, 6, 12), NOW), '7d overdue');
eq('shorthand today', dueShorthand(noon(2026, 6, 19), NOW), 'due today');

// ---- month summary ----
const [mStart, mEnd] = monthBounds(noon(2026, 6, 19));
eq('month starts on the 1st', formatYmd(mStart), '2026-07-01');
eq('month end is next 1st', formatYmd(mEnd), '2026-08-01');
eq('bounds are half-open', mEnd > noon(2026, 6, 31) && mStart <= noon(2026, 6, 1), true);
eq('formatMonth', formatMonth(noon(2026, 6, 19)), 'Jul 2026');
eq('december rolls the year', formatYmd(monthBounds(noon(2026, 11, 15))[1]), '2027-01-01');

eq('summarize counts taught only',
  summarizeLessons([
    { status: 'completed', durationMin: 60, amountCents: 5000 },
    { status: 'completed', durationMin: 90, amountCents: 7500 },
    { status: 'cancelled', durationMin: 60, amountCents: 0 },
  ]),
  { n: 2, minutes: 150, cents: 12500 });
eq('summarize empty', summarizeLessons([]), { n: 0, minutes: 0, cents: 0 });

// ---- guards ----
eq('isInvoiceStatus accepts', isInvoiceStatus('written_off'), true);
eq('isInvoiceStatus rejects', isInvoiceStatus('overdue'), false);
eq('isLessonStatus accepts', isLessonStatus('cancelled'), true);
eq('isLessonStatus rejects', isLessonStatus('scheduled'), false);
eq('isStepKey accepts', isStepKey('overdue14'), true);
eq('isStepKey rejects', isStepKey('overdue60'), false);

// ---- messages ----
const ctx = {
  payerName: 'Dana Reyes',
  studentName: 'Maya',
  businessName: 'Shih Tutoring',
  yourName: 'Simon',
  invoiceNumber: '20260719-3',
  amountText: '$250.00',
  dueDateText: 'Jul 19, 2026',
  daysOverdue: 7,
};

const before = renderReminder('before', { ...ctx, daysOverdue: -3 });
eq('before subject', before.subject, 'Heads-up: invoice 20260719-3 due Jul 19, 2026');
eq('before greets the payer', before.body.startsWith('Hi Dana Reyes,'), true);
eq('before names the student', before.body.includes("Maya's lessons"), true);
eq('before signs off', before.body.endsWith('Simon\nShih Tutoring'), true);

const o7 = renderReminder('overdue7', ctx);
eq('overdue7 counts days', o7.body.includes('7 days past due'), true);
eq('overdue7 stays polite', o7.body.includes('Could you let me know'), true);

const final = renderReminder('overdue30', { ...ctx, daysOverdue: 34 });
eq('final subject', final.subject, 'Final notice: invoice 20260719-3');
eq('final pauses lessons not work', final.body.includes('pause lessons'), true);

// blank number, no payer, empty signature fall back gracefully
const bare = renderReminder('overdue3', {
  ...ctx, payerName: '', invoiceNumber: '', businessName: '', yourName: '',
});
eq('blank number body ref', bare.body.includes('my recent invoice'), true);
eq('no payer greets there', bare.body.startsWith('Hi there,'), true);
eq('empty signature omits sign-off name', bare.body.endsWith('Thanks for your help,'), true);

for (const s of STEPS) {
  const m = renderReminder(s.key, ctx);
  eq(`${s.key} renders`, m.subject.length > 0 && m.body.length > 40, true);
}

const cover = renderInvoiceCover(ctx);
eq('cover subject', cover.subject, "Invoice 20260719-3 — Maya's lessons");
eq('cover mentions amount and due', cover.body.includes('$250.00') && cover.body.includes('Jul 19, 2026'), true);
eq('cover omits how-to-pay when blank', cover.body.includes('How to pay'), false);
const coverPay = renderInvoiceCover(ctx, 'Zelle: 555-1234\nVenmo: @simon');
eq('cover carries how-to-pay', coverPay.body.includes('How to pay:\nZelle: 555-1234\nVenmo: @simon'), true);

// ---- invoice HTML ----
const lines = [
  { startMs: noon(2026, 6, 5), durationMin: 60, amountCents: 5000, notes: '' },
  { startMs: noon(2026, 6, 12), durationMin: 90, amountCents: 7500, notes: 'exam prep' },
];
eq('invoice total', invoiceTotalCents(lines), 12500);
const html = renderInvoiceHtml({
  invoiceNumber: '20260719-3',
  issuedMs: noon(2026, 6, 19),
  dueMs: noon(2026, 7, 2),
  studentName: 'Maya',
  payerName: 'Dana <Reyes>',
  yourName: 'Simon',
  businessName: 'Shih Tutoring',
  currencySymbol: '$',
  lines,
  notes: 'Thanks for a great month.',
  paymentInstructions: 'Zelle: 555-1234 <fast>',
});
eq('html has total', html.includes('$125.00'), true);
eq('html has both dates', html.includes('Jul 5, 2026') && html.includes('Aug 2, 2026'), true);
eq('html escapes payer', html.includes('Dana &lt;Reyes&gt;'), true);
eq('html carries line note', html.includes('exam prep'), true);
eq('html carries invoice notes', html.includes('Thanks for a great month.'), true);
eq('html carries how-to-pay, escaped', html.includes('How to pay') && html.includes('Zelle: 555-1234 &lt;fast&gt;'), true);
eq('html names the tutor', html.includes('Shih Tutoring'), true);
// no payer: bill-to collapses to the student, no orphan "for 's lessons"
const htmlNoPayer = renderInvoiceHtml({
  invoiceNumber: '', issuedMs: noon(2026, 6, 19), dueMs: noon(2026, 7, 2),
  studentName: 'Maya', payerName: '', yourName: '', businessName: '',
  currencySymbol: '$', lines, notes: '', paymentInstructions: '',
});
eq('blank how-to-pay hides the section', htmlNoPayer.includes('How to pay'), false);
eq('no payer bills the student', htmlNoPayer.includes('Maya'), true);
eq('no orphan possessive', htmlNoPayer.includes("for 's lessons"), false);
eq('no number hides No. line', htmlNoPayer.includes('No.'), false);

// ---- mailto ----
const url = mailtoUrl('dana@reyes.test', 'Invoice A & B', 'Hi,\nline two');
eq('mailto shape', url.startsWith('mailto:dana%40reyes.test?subject='), true);
eq('mailto encodes &', url.includes('Invoice%20A%20%26%20B'), true);
eq('mailto encodes newline', url.includes('Hi%2C%0Aline%20two'), true);

console.log(failures ? `\n${failures} FAILED` : '\nall model tests passed');
process.exit(failures ? 1 : 0);
