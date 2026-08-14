// src/dbCore.ts
// Pure module: SQL schema/migrations and row<->model mapping.
// No expo imports so it can be tested in Node against node:sqlite.
//
// Shape: students own weekly slots and logged lessons; invoices bundle
// completed lessons (lessons.invoice_id, SET NULL on invoice delete so the
// lessons fall back to unbilled instead of vanishing); reminders hang off
// invoices. An invoice's amount is always derived from its lessons — no
// denormalized total to drift.

import type { Invoice, Lesson, Payment, Reminder, Slot, Student } from './models';
import { isInvoiceStatus, isLessonStatus, isStepKey } from './models';

/** Each entry is the batch of statements that upgrades user_version N-1 -> N.
 *  MIGRATIONS[0] builds version 1. Append only; never edit shipped entries. */
export const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      payer_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      rate_cents INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0,
      created_ms INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      weekday INTEGER NOT NULL,
      start_min INTEGER NOT NULL,
      duration_min INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      number TEXT NOT NULL DEFAULT '',
      issued_ms INTEGER NOT NULL,
      due_ms INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      paid_ms INTEGER,
      notes TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      slot_id INTEGER REFERENCES slots(id) ON DELETE SET NULL,
      start_ms INTEGER NOT NULL,
      duration_min INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      step TEXT NOT NULL,
      sent_ms INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_slots_student ON slots(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`,
    `CREATE INDEX IF NOT EXISTS idx_lessons_student ON lessons(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_lessons_invoice ON lessons(invoice_id)`,
    `CREATE INDEX IF NOT EXISTS idx_lessons_start ON lessons(start_ms)`,
    `CREATE INDEX IF NOT EXISTS idx_reminders_invoice ON reminders(invoice_id)`,
  ],
  // v2: partial payments. An invoice's paid total derives from these rows.
  [
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      paid_ms INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id)`,
  ],
];

export const TARGET_DB_VERSION = MIGRATIONS.length;

export interface StudentRow {
  id: number;
  name: string;
  payer_name: string;
  email: string;
  rate_cents: number;
  notes: string;
  archived: number;
  created_ms: number;
}
export interface SlotRow {
  id: number;
  student_id: number;
  weekday: number;
  start_min: number;
  duration_min: number;
}
export interface InvoiceRow {
  id: number;
  student_id: number;
  number: string;
  issued_ms: number;
  due_ms: number;
  status: string;
  paid_ms: number | null;
  notes: string;
}
export interface LessonRow {
  id: number;
  student_id: number;
  slot_id: number | null;
  start_ms: number;
  duration_min: number;
  amount_cents: number;
  status: string;
  invoice_id: number | null;
  notes: string;
}
export interface ReminderRow {
  id: number;
  invoice_id: number;
  step: string;
  sent_ms: number;
}
export interface PaymentRow {
  id: number;
  invoice_id: number;
  amount_cents: number;
  paid_ms: number;
  notes: string;
}

export const rowToStudent = (r: StudentRow): Student => ({
  id: r.id,
  name: r.name,
  payerName: r.payer_name,
  email: r.email,
  rateCents: r.rate_cents,
  notes: r.notes,
  archived: r.archived !== 0,
  createdMs: r.created_ms,
});
export const rowToSlot = (r: SlotRow): Slot => ({
  id: r.id,
  studentId: r.student_id,
  weekday: r.weekday,
  startMin: r.start_min,
  durationMin: r.duration_min,
});
export const rowToInvoice = (r: InvoiceRow): Invoice => ({
  id: r.id,
  studentId: r.student_id,
  number: r.number,
  issuedMs: r.issued_ms,
  dueMs: r.due_ms,
  status: isInvoiceStatus(r.status) ? r.status : 'open',
  paidMs: r.paid_ms,
  notes: r.notes,
});
export const rowToLesson = (r: LessonRow): Lesson => ({
  id: r.id,
  studentId: r.student_id,
  slotId: r.slot_id,
  startMs: r.start_ms,
  durationMin: r.duration_min,
  amountCents: r.amount_cents,
  status: isLessonStatus(r.status) ? r.status : 'completed',
  invoiceId: r.invoice_id,
  notes: r.notes,
});
export const rowToPayment = (r: PaymentRow): Payment => ({
  id: r.id,
  invoiceId: r.invoice_id,
  amountCents: r.amount_cents,
  paidMs: r.paid_ms,
  notes: r.notes,
});
export const rowToReminder = (r: ReminderRow): Reminder => ({
  id: r.id,
  invoiceId: r.invoice_id,
  step: isStepKey(r.step) ? r.step : 'due',
  sentMs: r.sent_ms,
});

export const studentToParams = (
  s: Student,
): [string, string, string, number, string, number, number] => [
  s.name,
  s.payerName,
  s.email,
  s.rateCents,
  s.notes,
  s.archived ? 1 : 0,
  s.createdMs,
];
export const slotToParams = (s: Slot): [number, number, number, number] => [
  s.studentId,
  s.weekday,
  s.startMin,
  s.durationMin,
];
export const invoiceToParams = (
  i: Invoice,
): [number, string, number, number, string, number | null, string] => [
  i.studentId,
  i.number,
  i.issuedMs,
  i.dueMs,
  i.status,
  i.paidMs,
  i.notes,
];
export const lessonToParams = (
  l: Lesson,
): [number, number | null, number, number, number, string, number | null, string] => [
  l.studentId,
  l.slotId,
  l.startMs,
  l.durationMin,
  l.amountCents,
  l.status,
  l.invoiceId,
  l.notes,
];
export const reminderToParams = (r: Reminder): [number, string, number] => [
  r.invoiceId,
  r.step,
  r.sentMs,
];
export const paymentToParams = (
  p: Payment,
): [number, number, number, string] => [
  p.invoiceId,
  p.amountCents,
  p.paidMs,
  p.notes,
];

// ---------------------------------------------------------------- students
export const INSERT_STUDENT_SQL = `INSERT INTO students (name, payer_name, email, rate_cents, notes, archived, created_ms) VALUES (?, ?, ?, ?, ?, ?, ?)`;
export const UPDATE_STUDENT_SQL = `UPDATE students SET name = ?, payer_name = ?, email = ?, rate_cents = ?, notes = ?, archived = ?, created_ms = ? WHERE id = ?`;
export const DELETE_STUDENT_SQL = `DELETE FROM students WHERE id = ?`;
export const GET_STUDENT_SQL = `SELECT * FROM students WHERE id = ?`;
export const LIST_STUDENTS_SQL = `SELECT * FROM students ORDER BY archived, name COLLATE NOCASE, id`;
export const COUNT_ACTIVE_STUDENTS_SQL = `SELECT COUNT(*) AS n FROM students WHERE archived = 0`;

// ------------------------------------------------------------------- slots
export const INSERT_SLOT_SQL = `INSERT INTO slots (student_id, weekday, start_min, duration_min) VALUES (?, ?, ?, ?)`;
export const DELETE_SLOT_SQL = `DELETE FROM slots WHERE id = ?`;
export const LIST_SLOTS_BY_STUDENT_SQL = `SELECT * FROM slots WHERE student_id = ? ORDER BY weekday, start_min, id`;

/** Every slot belonging to an active student — the schedule in one query. */
export const LIST_ACTIVE_SLOTS_SQL = `SELECT s.* FROM slots s
  JOIN students st ON st.id = s.student_id
  WHERE st.archived = 0 ORDER BY s.weekday, s.start_min, s.id`;

// ---------------------------------------------------------------- invoices
/** Derived amount: the sum of this invoice's lessons. */
const AMOUNT_SUB = `(SELECT COALESCE(SUM(l.amount_cents), 0) FROM lessons l WHERE l.invoice_id = i.id)`;
/** Derived paid total: the sum of this invoice's payments. */
const PAID_SUB = `(SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p WHERE p.invoice_id = i.id)`;
const DERIVED = `${AMOUNT_SUB} AS amount_cents, ${PAID_SUB} AS paid_cents`;

export const INSERT_INVOICE_SQL = `INSERT INTO invoices (student_id, number, issued_ms, due_ms, status, paid_ms, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`;
export const UPDATE_INVOICE_SQL = `UPDATE invoices SET student_id = ?, number = ?, issued_ms = ?, due_ms = ?, status = ?, paid_ms = ?, notes = ? WHERE id = ?`;
export const SET_INVOICE_STATUS_SQL = `UPDATE invoices SET status = ?, paid_ms = ? WHERE id = ?`;
export const DELETE_INVOICE_SQL = `DELETE FROM invoices WHERE id = ?`;
export const GET_INVOICE_SQL = `SELECT i.*, ${DERIVED} FROM invoices i WHERE i.id = ?`;
export const LIST_INVOICES_BY_STUDENT_SQL = `SELECT i.*, ${DERIVED}
  FROM invoices i WHERE i.student_id = ? ORDER BY i.due_ms DESC, i.id DESC`;

/** Open invoices with student + derived amounts — the home screen in one query. */
export const LIST_OPEN_INVOICES_SQL = `SELECT i.*, ${DERIVED},
  st.name AS student_name, st.payer_name AS student_payer_name, st.email AS student_email
  FROM invoices i JOIN students st ON st.id = i.student_id
  WHERE i.status = 'open' ORDER BY i.due_ms, i.id`;

/** Recently settled invoices (paid or written off), newest settlement first. */
export const LIST_SETTLED_INVOICES_SQL = `SELECT i.*, ${DERIVED},
  st.name AS student_name, st.payer_name AS student_payer_name, st.email AS student_email
  FROM invoices i JOIN students st ON st.id = i.student_id
  WHERE i.status != 'open'
  ORDER BY COALESCE(i.paid_ms, i.due_ms) DESC, i.id DESC LIMIT ?`;

export interface InvoiceAmountRow extends InvoiceRow {
  amount_cents: number;
  paid_cents: number;
}
export interface InvoiceWithStudentRow extends InvoiceAmountRow {
  student_name: string;
  student_payer_name: string;
  student_email: string;
}

// ----------------------------------------------------------------- lessons
export const INSERT_LESSON_SQL = `INSERT INTO lessons (student_id, slot_id, start_ms, duration_min, amount_cents, status, invoice_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
export const UPDATE_LESSON_SQL = `UPDATE lessons SET student_id = ?, slot_id = ?, start_ms = ?, duration_min = ?, amount_cents = ?, status = ?, invoice_id = ?, notes = ? WHERE id = ?`;
export const DELETE_LESSON_SQL = `DELETE FROM lessons WHERE id = ?`;
export const GET_LESSON_SQL = `SELECT * FROM lessons WHERE id = ?`;

/** Uninvoiced completed lessons — the student's unbilled balance, oldest first. */
export const LIST_UNBILLED_BY_STUDENT_SQL = `SELECT * FROM lessons
  WHERE student_id = ? AND status = 'completed' AND invoice_id IS NULL
  ORDER BY start_ms, id`;

/** Unbilled totals for every student at once (home + students screens). */
export const UNBILLED_TOTALS_SQL = `SELECT student_id, COALESCE(SUM(amount_cents), 0) AS total_cents, COUNT(*) AS n
  FROM lessons WHERE status = 'completed' AND invoice_id IS NULL GROUP BY student_id`;

export const LIST_LESSONS_BY_INVOICE_SQL = `SELECT * FROM lessons
  WHERE invoice_id = ? ORDER BY start_ms, id`;

/** Logged lessons in a local-time window (the day being rendered). */
export const LIST_LESSONS_BETWEEN_SQL = `SELECT * FROM lessons
  WHERE start_ms >= ? AND start_ms < ? ORDER BY start_ms, id`;

/** Recent lesson history for one student, newest first. */
export const LIST_LESSONS_BY_STUDENT_SQL = `SELECT * FROM lessons
  WHERE student_id = ? ORDER BY start_ms DESC, id DESC LIMIT ?`;

export const ATTACH_LESSON_SQL = `UPDATE lessons SET invoice_id = ? WHERE id = ? AND status = 'completed'`;
export const DETACH_LESSON_SQL = `UPDATE lessons SET invoice_id = NULL WHERE id = ?`;
export const DETACH_LESSONS_SQL = `UPDATE lessons SET invoice_id = NULL WHERE invoice_id = ?`;

export interface UnbilledTotalRow {
  student_id: number;
  total_cents: number;
  n: number;
}

// ---------------------------------------------------------------- payments
export const INSERT_PAYMENT_SQL = `INSERT INTO payments (invoice_id, amount_cents, paid_ms, notes) VALUES (?, ?, ?, ?)`;
export const DELETE_PAYMENT_SQL = `DELETE FROM payments WHERE id = ?`;
export const LIST_PAYMENTS_SQL = `SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_ms, id`;

// --------------------------------------------------------------- reminders
export const INSERT_REMINDER_SQL = `INSERT INTO reminders (invoice_id, step, sent_ms) VALUES (?, ?, ?)`;
export const DELETE_REMINDER_SQL = `DELETE FROM reminders WHERE id = ?`;
export const LIST_REMINDERS_SQL = `SELECT * FROM reminders WHERE invoice_id = ? ORDER BY sent_ms, id`;

/** Every reminder belonging to a still-open invoice (for the send queue). */
export const LIST_OPEN_REMINDERS_SQL = `SELECT r.* FROM reminders r
  JOIN invoices i ON i.id = r.invoice_id WHERE i.status = 'open'`;

// FK cascades require this pragma per-connection in SQLite.
export const ENABLE_FK_SQL = `PRAGMA foreign_keys = ON`;

// ------------------------------------------------------------------ backup
export const ALL_STUDENTS_SQL = `SELECT * FROM students ORDER BY id`;
export const ALL_SLOTS_SQL = `SELECT * FROM slots ORDER BY id`;
export const ALL_INVOICES_SQL = `SELECT * FROM invoices ORDER BY id`;
export const ALL_LESSONS_SQL = `SELECT * FROM lessons ORDER BY id`;
export const ALL_REMINDERS_SQL = `SELECT * FROM reminders ORDER BY id`;
export const ALL_PAYMENTS_SQL = `SELECT * FROM payments ORDER BY id`;
export const DELETE_ALL_STUDENTS_SQL = `DELETE FROM students`; // cascades everything

// Restore keeps original ids so cross-table references survive round-trip.
// Order matters: students, slots, invoices, then lessons (which reference
// both), then reminders.
export const RESTORE_STUDENT_SQL = `INSERT INTO students (id, name, payer_name, email, rate_cents, notes, archived, created_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
export const RESTORE_SLOT_SQL = `INSERT INTO slots (id, student_id, weekday, start_min, duration_min) VALUES (?, ?, ?, ?, ?)`;
export const RESTORE_INVOICE_SQL = `INSERT INTO invoices (id, student_id, number, issued_ms, due_ms, status, paid_ms, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
export const RESTORE_LESSON_SQL = `INSERT INTO lessons (id, student_id, slot_id, start_ms, duration_min, amount_cents, status, invoice_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
export const RESTORE_REMINDER_SQL = `INSERT INTO reminders (id, invoice_id, step, sent_ms) VALUES (?, ?, ?, ?)`;
export const RESTORE_PAYMENT_SQL = `INSERT INTO payments (id, invoice_id, amount_cents, paid_ms, notes) VALUES (?, ?, ?, ?, ?)`;
