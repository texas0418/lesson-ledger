// test-db.ts — runs the real schema/SQL from dbCore.ts against node:sqlite.
// Requires Node 22+ (node:sqlite). Run with: npx tsx test-db.ts
// @ts-expect-error node:sqlite has no types under Expo's tsconfig; tsx runs it fine
import { DatabaseSync } from 'node:sqlite';
import {
  ALL_INVOICES_SQL, ALL_LESSONS_SQL, ALL_REMINDERS_SQL, ALL_SLOTS_SQL,
  ALL_STUDENTS_SQL, ATTACH_LESSON_SQL, COUNT_ACTIVE_STUDENTS_SQL,
  DELETE_ALL_STUDENTS_SQL, DELETE_INVOICE_SQL, DELETE_SLOT_SQL,
  DELETE_STUDENT_SQL, DETACH_LESSONS_SQL, ENABLE_FK_SQL, GET_INVOICE_SQL,
  GET_STUDENT_SQL, INSERT_INVOICE_SQL, INSERT_LESSON_SQL,
  INSERT_REMINDER_SQL, INSERT_SLOT_SQL, INSERT_STUDENT_SQL, InvoiceAmountRow,
  InvoiceWithStudentRow, LIST_ACTIVE_SLOTS_SQL, LIST_LESSONS_BETWEEN_SQL,
  LIST_LESSONS_BY_INVOICE_SQL, LIST_OPEN_INVOICES_SQL,
  LIST_OPEN_REMINDERS_SQL, LIST_SLOTS_BY_STUDENT_SQL, LIST_STUDENTS_SQL,
  LIST_UNBILLED_BY_STUDENT_SQL, LessonRow, MIGRATIONS, ReminderRow,
  RESTORE_INVOICE_SQL, RESTORE_LESSON_SQL, RESTORE_REMINDER_SQL,
  RESTORE_SLOT_SQL, RESTORE_STUDENT_SQL, SET_INVOICE_STATUS_SQL, SlotRow,
  StudentRow, TARGET_DB_VERSION, UNBILLED_TOTALS_SQL, UnbilledTotalRow,
  invoiceToParams, lessonToParams, reminderToParams, rowToInvoice,
  rowToLesson, rowToReminder, rowToSlot, rowToStudent, slotToParams,
  studentToParams,
} from './src/dbCore';
import { parseBackup, serializeBackup } from './src/backupFormat';
import type { Invoice, Lesson, Slot, Student } from './src/models';

let failures = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok   ${name}`);
};

const db = new DatabaseSync(':memory:');
db.exec(ENABLE_FK_SQL);

function migrate(): void {
  let v = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  while (v < MIGRATIONS.length) {
    for (const sql of MIGRATIONS[v]) db.exec(sql);
    v++;
    db.exec(`PRAGMA user_version = ${v}`);
  }
}

migrate();
eq('migrates to target version',
  (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
  TARGET_DB_VERSION);
migrate();
eq('re-migrate is a no-op', true, true);

const T0 = new Date(2026, 6, 1, 12, 0).getTime();
const DAY = 86400000;

// ---- student round-trip ----
const maya: Student = {
  name: 'Maya Reyes', payerName: 'Dana Reyes', email: 'dana@reyes.test',
  rateCents: 5000, notes: 'algebra', archived: false, createdMs: T0,
};
const mayaId = Number(db.prepare(INSERT_STUDENT_SQL).run(...studentToParams(maya)).lastInsertRowid);
eq('student round-trip',
  rowToStudent(db.prepare(GET_STUDENT_SQL).get(mayaId) as unknown as StudentRow),
  { id: mayaId, ...maya });

const zed: Student = {
  name: 'zeb', payerName: '', email: '', rateCents: 6000, notes: '',
  archived: false, createdMs: T0 + DAY,
};
const zedId = Number(db.prepare(INSERT_STUDENT_SQL).run(...studentToParams(zed)).lastInsertRowid);
eq('students sort by name',
  (db.prepare(LIST_STUDENTS_SQL).all() as unknown as StudentRow[]).map((s) => s.id),
  [mayaId, zedId]);
eq('active count', (db.prepare(COUNT_ACTIVE_STUDENTS_SQL).get() as { n: number }).n, 2);
db.prepare(`UPDATE students SET archived = 1 WHERE id = ?`).run(zedId);
eq('archived drops from active count',
  (db.prepare(COUNT_ACTIVE_STUDENTS_SQL).get() as { n: number }).n, 1);
eq('archived sorts last',
  (db.prepare(LIST_STUDENTS_SQL).all() as unknown as StudentRow[]).map((s) => s.id),
  [mayaId, zedId]);

// ---- slots ----
const slotA: Slot = { studentId: mayaId, weekday: 1, startMin: 930, durationMin: 60 };
const slotAId = Number(db.prepare(INSERT_SLOT_SQL).run(...slotToParams(slotA)).lastInsertRowid);
const slotB: Slot = { studentId: zedId, weekday: 3, startMin: 600, durationMin: 45 };
db.prepare(INSERT_SLOT_SQL).run(...slotToParams(slotB));
eq('slot round-trip',
  rowToSlot(db.prepare(LIST_SLOTS_BY_STUDENT_SQL).all(mayaId)[0] as unknown as SlotRow),
  { id: slotAId, ...slotA });
eq('active slots exclude archived students',
  (db.prepare(LIST_ACTIVE_SLOTS_SQL).all() as unknown as SlotRow[]).map((s) => s.id),
  [slotAId]);

// ---- lessons + unbilled ----
const lesson = (over: Partial<Lesson>): Lesson => ({
  studentId: mayaId, slotId: slotAId, startMs: T0, durationMin: 60,
  amountCents: 5000, status: 'completed', invoiceId: null, notes: '', ...over,
});
const l1 = Number(db.prepare(INSERT_LESSON_SQL).run(...lessonToParams(lesson({ startMs: T0 }))).lastInsertRowid);
const l2 = Number(db.prepare(INSERT_LESSON_SQL).run(...lessonToParams(lesson({ startMs: T0 + 7 * DAY }))).lastInsertRowid);
const l3 = Number(db.prepare(INSERT_LESSON_SQL).run(
  ...lessonToParams(lesson({ startMs: T0 + 8 * DAY, status: 'cancelled', amountCents: 0, slotId: null })),
).lastInsertRowid);
eq('unbilled lists completed uninvoiced oldest first',
  (db.prepare(LIST_UNBILLED_BY_STUDENT_SQL).all(mayaId) as unknown as LessonRow[]).map((l) => l.id),
  [l1, l2]);
const totals = db.prepare(UNBILLED_TOTALS_SQL).all() as unknown as UnbilledTotalRow[];
eq('unbilled totals', totals.map((t) => [t.student_id, t.total_cents, t.n]), [[mayaId, 10000, 2]]);
eq('lessons-between window',
  (db.prepare(LIST_LESSONS_BETWEEN_SQL).all(T0 + 6 * DAY, T0 + 9 * DAY) as unknown as LessonRow[]).map((l) => l.id),
  [l2, l3]);
eq('unknown lesson status maps to completed', (() => {
  db.exec(`UPDATE lessons SET status = 'wat' WHERE id = ${l3}`);
  const got = rowToLesson(db.prepare(`SELECT * FROM lessons WHERE id = ${l3}`).get() as unknown as LessonRow).status;
  db.exec(`UPDATE lessons SET status = 'cancelled' WHERE id = ${l3}`);
  return got;
})(), 'completed');

// ---- invoice from lessons, derived amount ----
const inv: Invoice = {
  studentId: mayaId, number: '20260709-1', issuedMs: T0 + 8 * DAY,
  dueMs: T0 + 22 * DAY, status: 'open', paidMs: null, notes: '',
};
const invId = Number(db.prepare(INSERT_INVOICE_SQL).run(...invoiceToParams(inv)).lastInsertRowid);
db.prepare(ATTACH_LESSON_SQL).run(invId, l1);
db.prepare(ATTACH_LESSON_SQL).run(invId, l2);
db.prepare(ATTACH_LESSON_SQL).run(invId, l3); // cancelled: must NOT attach
eq('cancelled lesson refuses attach',
  (db.prepare(LIST_LESSONS_BY_INVOICE_SQL).all(invId) as unknown as LessonRow[]).map((l) => l.id),
  [l1, l2]);
eq('invoice amount derives from lessons',
  (db.prepare(GET_INVOICE_SQL).get(invId) as unknown as InvoiceAmountRow).amount_cents,
  10000);
eq('attached lessons leave unbilled',
  (db.prepare(LIST_UNBILLED_BY_STUDENT_SQL).all(mayaId) as unknown as LessonRow[]).length, 0);

const open = db.prepare(LIST_OPEN_INVOICES_SQL).all() as unknown as InvoiceWithStudentRow[];
eq('open invoices carry student + amount',
  [open[0].student_name, open[0].student_payer_name, open[0].amount_cents],
  ['Maya Reyes', 'Dana Reyes', 10000]);
eq('open invoice maps',
  rowToInvoice(open[0]).status, 'open');

// ---- reminders ----
db.prepare(INSERT_REMINDER_SQL).run(...reminderToParams({ invoiceId: invId, step: 'before', sentMs: T0 + 19 * DAY }));
eq('open reminders follow invoice status',
  (db.prepare(LIST_OPEN_REMINDERS_SQL).all() as unknown as ReminderRow[]).length, 1);
db.prepare(SET_INVOICE_STATUS_SQL).run('paid', T0 + 23 * DAY, invId);
eq('paid invoice drops from open reminders',
  (db.prepare(LIST_OPEN_REMINDERS_SQL).all() as unknown as ReminderRow[]).length, 0);
eq('unknown step maps to due', (() => {
  db.exec(`UPDATE reminders SET step = 'overdue60'`);
  const got = rowToReminder(db.prepare(`SELECT * FROM reminders LIMIT 1`).get() as unknown as ReminderRow).step;
  db.exec(`UPDATE reminders SET step = 'before'`);
  return got;
})(), 'due');
db.prepare(SET_INVOICE_STATUS_SQL).run('open', null, invId);

// ---- invoice delete detaches lessons (SET NULL) and cascades reminders ----
db.prepare(DELETE_INVOICE_SQL).run(invId);
eq('deleted invoice returns lessons to unbilled',
  (db.prepare(LIST_UNBILLED_BY_STUDENT_SQL).all(mayaId) as unknown as LessonRow[]).map((l) => l.id),
  [l1, l2]);
eq('deleted invoice cascades reminders',
  (db.prepare(ALL_REMINDERS_SQL).all() as unknown as ReminderRow[]).length, 0);

// ---- detach-all (manual unbundle path) ----
const inv2Id = Number(db.prepare(INSERT_INVOICE_SQL).run(...invoiceToParams(inv)).lastInsertRowid);
db.prepare(ATTACH_LESSON_SQL).run(inv2Id, l1);
db.prepare(DETACH_LESSONS_SQL).run(inv2Id);
eq('detach empties the invoice',
  (db.prepare(LIST_LESSONS_BY_INVOICE_SQL).all(inv2Id) as unknown as LessonRow[]).length, 0);

// ---- slot delete keeps lesson history ----
db.prepare(DELETE_SLOT_SQL).run(slotAId);
eq('slot delete nulls lesson slot_id, keeps row',
  (db.prepare(`SELECT slot_id FROM lessons WHERE id = ${l1}`).get() as { slot_id: number | null }).slot_id,
  null);

// ---- student delete cascades everything ----
db.prepare(DELETE_STUDENT_SQL).run(mayaId);
eq('student delete cascades lessons',
  (db.prepare(ALL_LESSONS_SQL).all() as unknown as LessonRow[]).length, 0);
eq('student delete cascades invoices',
  (db.prepare(ALL_INVOICES_SQL).all() as unknown as InvoiceAmountRow[]).length, 0);

// ---- backup round-trip through the real SQL ----
const s2 = Number(db.prepare(INSERT_STUDENT_SQL).run('Ana', 'Pat', 'pat@x.test', 4500, '', 0, T0).lastInsertRowid);
const sl2 = Number(db.prepare(INSERT_SLOT_SQL).run(s2, 5, 840, 90).lastInsertRowid);
const i3 = Number(db.prepare(INSERT_INVOICE_SQL).run(s2, 'N-77', T0, T0 + 14 * DAY, 'open', null, '').lastInsertRowid);
db.prepare(INSERT_LESSON_SQL).run(s2, sl2, T0, 90, 6750, 'completed', i3, 'trig');
db.prepare(INSERT_LESSON_SQL).run(s2, null, T0 + DAY, 60, 4500, 'completed', null, '');
db.prepare(INSERT_REMINDER_SQL).run(i3, 'before', T0 + 11 * DAY);

const snapshot = () => ({
  students: (db.prepare(ALL_STUDENTS_SQL).all() as unknown as StudentRow[]).map(rowToStudent),
  slots: (db.prepare(ALL_SLOTS_SQL).all() as unknown as SlotRow[]).map(rowToSlot),
  invoices: (db.prepare(ALL_INVOICES_SQL).all() as unknown as InvoiceAmountRow[]).map(rowToInvoice),
  lessons: (db.prepare(ALL_LESSONS_SQL).all() as unknown as LessonRow[]).map(rowToLesson),
  reminders: (db.prepare(ALL_REMINDERS_SQL).all() as unknown as ReminderRow[]).map(rowToReminder),
});
const before = snapshot();
const json = serializeBackup(before, T0);
const parsed = parseBackup(json);

db.exec(DELETE_ALL_STUDENTS_SQL);
eq('delete-all leaves nothing', snapshot().students.length, 0);
for (const s of parsed.students)
  db.prepare(RESTORE_STUDENT_SQL).run(s.id!, s.name, s.payerName, s.email, s.rateCents, s.notes, s.archived ? 1 : 0, s.createdMs);
for (const sl of parsed.slots)
  db.prepare(RESTORE_SLOT_SQL).run(sl.id!, sl.studentId, sl.weekday, sl.startMin, sl.durationMin);
for (const i of parsed.invoices)
  db.prepare(RESTORE_INVOICE_SQL).run(i.id!, i.studentId, i.number, i.issuedMs, i.dueMs, i.status, i.paidMs, i.notes);
for (const l of parsed.lessons)
  db.prepare(RESTORE_LESSON_SQL).run(l.id!, l.studentId, l.slotId, l.startMs, l.durationMin, l.amountCents, l.status, l.invoiceId, l.notes);
for (const r of parsed.reminders)
  db.prepare(RESTORE_REMINDER_SQL).run(r.id!, r.invoiceId, r.step, r.sentMs);
eq('backup restore round-trips exactly', snapshot(), before);

// ---- backup format guards ----
let threw = '';
try { parseBackup('not json'); } catch (e: any) { threw = e.message; }
eq('parse rejects non-JSON', threw.includes('not JSON'), true);
try { parseBackup('{"format":"other"}'); } catch (e: any) { threw = e.message; }
eq('parse rejects foreign format', threw.includes('Not a Lesson Ledger backup'), true);
const degraded = parseBackup(JSON.stringify({
  format: 'lessonledger-backup', version: 1, exportedAtMs: 0,
  students: [{ id: 1, name: 'A', createdMs: 5 }],
  slots: [{ id: 2, studentId: 1, weekday: 9, startMin: 0, durationMin: 60 }],
  invoices: [{ id: 3, studentId: 99, dueMs: 5 }],
  lessons: [{ id: 4, studentId: 1, startMs: 7, slotId: 2, invoiceId: 3 }],
  reminders: [{ id: 5, invoiceId: 3, step: 'due', sentMs: 1 }],
}));
eq('bad weekday slot dropped', degraded.slots.length, 0);
eq('orphaned invoice dropped', degraded.invoices.length, 0);
eq('lesson survives with dangling refs nulled',
  [degraded.lessons[0].slotId, degraded.lessons[0].invoiceId], [null, null]);
eq('reminder of dropped invoice dropped too', degraded.reminders.length, 0);
eq('archived defaults false; status defaults completed',
  [degraded.students[0].archived, degraded.lessons[0].status], [false, 'completed']);

console.log(failures ? `\n${failures} FAILED` : '\nall db tests passed');
process.exit(failures ? 1 : 0);
