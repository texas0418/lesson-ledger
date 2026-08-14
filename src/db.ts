// src/db.ts
// expo-sqlite wrapper. All SQL and mapping live in dbCore.ts (pure, tested).
// Billowe pattern: lazy singleton, PRAGMA user_version migrations in a
// transaction, integer epoch-ms / integer cents everywhere.

import * as SQLite from 'expo-sqlite';
import type {
  Invoice,
  Lesson,
  Payment,
  Reminder,
  Slot,
  StepKey,
  Student,
} from './models';
import type { BackupV1 } from './backupFormat';
import {
  ALL_INVOICES_SQL,
  ALL_LESSONS_SQL,
  ALL_PAYMENTS_SQL,
  ALL_REMINDERS_SQL,
  ALL_SLOTS_SQL,
  ALL_STUDENTS_SQL,
  ATTACH_LESSON_SQL,
  COUNT_ACTIVE_STUDENTS_SQL,
  DELETE_ALL_STUDENTS_SQL,
  DELETE_INVOICE_SQL,
  DELETE_LESSON_SQL,
  DELETE_PAYMENT_SQL,
  DELETE_REMINDER_SQL,
  DELETE_SLOT_SQL,
  DELETE_STUDENT_SQL,
  DETACH_LESSON_SQL,
  DETACH_LESSONS_SQL,
  ENABLE_FK_SQL,
  GET_INVOICE_SQL,
  GET_LESSON_SQL,
  GET_STUDENT_SQL,
  INSERT_INVOICE_SQL,
  INSERT_LESSON_SQL,
  INSERT_PAYMENT_SQL,
  INSERT_REMINDER_SQL,
  INSERT_SLOT_SQL,
  INSERT_STUDENT_SQL,
  InvoiceAmountRow,
  InvoiceWithStudentRow,
  LIST_ACTIVE_SLOTS_SQL,
  LIST_INVOICES_BY_STUDENT_SQL,
  LIST_LESSONS_BETWEEN_SQL,
  LIST_LESSONS_BY_INVOICE_SQL,
  LIST_LESSONS_BY_STUDENT_SQL,
  LIST_OPEN_INVOICES_SQL,
  LIST_OPEN_REMINDERS_SQL,
  LIST_PAYMENTS_SQL,
  LIST_REMINDERS_SQL,
  LIST_SETTLED_INVOICES_SQL,
  LIST_SLOTS_BY_STUDENT_SQL,
  LIST_STUDENTS_SQL,
  LIST_UNBILLED_BY_STUDENT_SQL,
  LessonRow,
  MIGRATIONS,
  PaymentRow,
  ReminderRow,
  RESTORE_INVOICE_SQL,
  RESTORE_LESSON_SQL,
  RESTORE_PAYMENT_SQL,
  RESTORE_REMINDER_SQL,
  RESTORE_SLOT_SQL,
  RESTORE_STUDENT_SQL,
  SET_INVOICE_STATUS_SQL,
  SlotRow,
  StudentRow,
  UNBILLED_TOTALS_SQL,
  UPDATE_INVOICE_SQL,
  UPDATE_LESSON_SQL,
  UPDATE_STUDENT_SQL,
  UnbilledTotalRow,
  invoiceToParams,
  lessonToParams,
  paymentToParams,
  reminderToParams,
  rowToInvoice,
  rowToLesson,
  rowToPayment,
  rowToReminder,
  rowToSlot,
  rowToStudent,
  slotToParams,
  studentToParams,
} from './dbCore';

const DB_NAME = 'lessonledger.db';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
    db.execSync('PRAGMA journal_mode = WAL');
    db.execSync(ENABLE_FK_SQL);
    runMigrations(db);
  }
  return db;
}

function runMigrations(d: SQLite.SQLiteDatabase): void {
  const row = d.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const batch = MIGRATIONS[version];
    d.withTransactionSync(() => {
      for (const sql of batch) d.execSync(sql);
    });
    version++;
    d.execSync(`PRAGMA user_version = ${version}`);
  }
}

// ---------------------------------------------------------------- students

export function createStudent(s: Student): number {
  const res = getDb().runSync(INSERT_STUDENT_SQL, studentToParams(s));
  return Number(res.lastInsertRowId);
}

export function updateStudent(s: Student): void {
  if (s.id == null) throw new Error('updateStudent requires id');
  getDb().runSync(UPDATE_STUDENT_SQL, [...studentToParams(s), s.id]);
}

export function deleteStudent(id: number): void {
  getDb().runSync(DELETE_STUDENT_SQL, [id]);
}

export function getStudent(id: number): Student | null {
  const row = getDb().getFirstSync<StudentRow>(GET_STUDENT_SQL, [id]);
  return row ? rowToStudent(row) : null;
}

export function listStudents(): Student[] {
  return getDb().getAllSync<StudentRow>(LIST_STUDENTS_SQL).map(rowToStudent);
}

export function countActiveStudents(): number {
  return getDb().getFirstSync<{ n: number }>(COUNT_ACTIVE_STUDENTS_SQL)?.n ?? 0;
}

// ------------------------------------------------------------------- slots

export function createSlot(s: Slot): number {
  const res = getDb().runSync(INSERT_SLOT_SQL, slotToParams(s));
  return Number(res.lastInsertRowId);
}

export function deleteSlot(id: number): void {
  getDb().runSync(DELETE_SLOT_SQL, [id]);
}

export function listSlotsByStudent(studentId: number): Slot[] {
  return getDb()
    .getAllSync<SlotRow>(LIST_SLOTS_BY_STUDENT_SQL, [studentId])
    .map(rowToSlot);
}

export function listActiveSlots(): Slot[] {
  return getDb().getAllSync<SlotRow>(LIST_ACTIVE_SLOTS_SQL).map(rowToSlot);
}

// ---------------------------------------------------------------- invoices

export interface InvoiceWithAmount extends Invoice {
  amountCents: number; // sum of its lessons
  paidCents: number; // sum of its payments
  balanceCents: number; // amount - paid, floored at 0 for display math
}
export interface InvoiceWithStudent extends InvoiceWithAmount {
  studentName: string;
  studentPayerName: string;
  studentEmail: string;
}

const rowToInvoiceWithAmount = (r: InvoiceAmountRow): InvoiceWithAmount => ({
  ...rowToInvoice(r),
  amountCents: r.amount_cents,
  paidCents: r.paid_cents,
  balanceCents: Math.max(0, r.amount_cents - r.paid_cents),
});
const rowToInvoiceWithStudent = (
  r: InvoiceWithStudentRow,
): InvoiceWithStudent => ({
  ...rowToInvoiceWithAmount(r),
  studentName: r.student_name,
  studentPayerName: r.student_payer_name,
  studentEmail: r.student_email,
});

export function createInvoice(i: Invoice): number {
  const res = getDb().runSync(INSERT_INVOICE_SQL, invoiceToParams(i));
  return Number(res.lastInsertRowId);
}

export function updateInvoice(i: Invoice): void {
  if (i.id == null) throw new Error('updateInvoice requires id');
  getDb().runSync(UPDATE_INVOICE_SQL, [...invoiceToParams(i), i.id]);
}

export function setInvoiceStatus(
  id: number,
  status: Invoice['status'],
  paidMs: number | null,
): void {
  getDb().runSync(SET_INVOICE_STATUS_SQL, [status, paidMs, id]);
}

/** Deleting an invoice detaches its lessons back to unbilled (FK SET NULL)
 *  and cascades its reminder history away. */
export function deleteInvoice(id: number): void {
  getDb().runSync(DELETE_INVOICE_SQL, [id]);
}

export function getInvoice(id: number): InvoiceWithAmount | null {
  const row = getDb().getFirstSync<InvoiceAmountRow>(GET_INVOICE_SQL, [id]);
  return row ? rowToInvoiceWithAmount(row) : null;
}

export function listInvoicesByStudent(studentId: number): InvoiceWithAmount[] {
  return getDb()
    .getAllSync<InvoiceAmountRow>(LIST_INVOICES_BY_STUDENT_SQL, [studentId])
    .map(rowToInvoiceWithAmount);
}

export function listOpenInvoices(): InvoiceWithStudent[] {
  return getDb()
    .getAllSync<InvoiceWithStudentRow>(LIST_OPEN_INVOICES_SQL)
    .map(rowToInvoiceWithStudent);
}

export function listSettledInvoices(limit: number): InvoiceWithStudent[] {
  return getDb()
    .getAllSync<InvoiceWithStudentRow>(LIST_SETTLED_INVOICES_SQL, [limit])
    .map(rowToInvoiceWithStudent);
}

// ----------------------------------------------------------------- lessons

export function createLesson(l: Lesson): number {
  const res = getDb().runSync(INSERT_LESSON_SQL, lessonToParams(l));
  return Number(res.lastInsertRowId);
}

export function updateLesson(l: Lesson): void {
  if (l.id == null) throw new Error('updateLesson requires id');
  getDb().runSync(UPDATE_LESSON_SQL, [...lessonToParams(l), l.id]);
}

export function deleteLesson(id: number): void {
  getDb().runSync(DELETE_LESSON_SQL, [id]);
}

export function getLesson(id: number): Lesson | null {
  const row = getDb().getFirstSync<LessonRow>(GET_LESSON_SQL, [id]);
  return row ? rowToLesson(row) : null;
}

export function listUnbilledByStudent(studentId: number): Lesson[] {
  return getDb()
    .getAllSync<LessonRow>(LIST_UNBILLED_BY_STUDENT_SQL, [studentId])
    .map(rowToLesson);
}

/** studentId -> {totalCents, count} for every student with unbilled lessons. */
export function unbilledTotals(): Map<number, { totalCents: number; n: number }> {
  const out = new Map<number, { totalCents: number; n: number }>();
  for (const r of getDb().getAllSync<UnbilledTotalRow>(UNBILLED_TOTALS_SQL)) {
    out.set(r.student_id, { totalCents: r.total_cents, n: r.n });
  }
  return out;
}

export function listLessonsByInvoice(invoiceId: number): Lesson[] {
  return getDb()
    .getAllSync<LessonRow>(LIST_LESSONS_BY_INVOICE_SQL, [invoiceId])
    .map(rowToLesson);
}

export function listLessonsBetween(startMs: number, endMs: number): Lesson[] {
  return getDb()
    .getAllSync<LessonRow>(LIST_LESSONS_BETWEEN_SQL, [startMs, endMs])
    .map(rowToLesson);
}

export function listLessonsByStudent(studentId: number, limit: number): Lesson[] {
  return getDb()
    .getAllSync<LessonRow>(LIST_LESSONS_BY_STUDENT_SQL, [studentId, limit])
    .map(rowToLesson);
}

/** Bundle unbilled lessons into a fresh invoice, atomically. Returns the
 *  invoice id. Lessons that are not completed stay untouched. */
export function createInvoiceFromLessons(
  invoice: Invoice,
  lessonIds: number[],
): number {
  const d = getDb();
  let id = 0;
  d.withTransactionSync(() => {
    id = Number(d.runSync(INSERT_INVOICE_SQL, invoiceToParams(invoice)).lastInsertRowId);
    for (const lessonId of lessonIds) {
      d.runSync(ATTACH_LESSON_SQL, [id, lessonId]);
    }
  });
  return id;
}

/** Detach every lesson from an invoice (they return to unbilled). */
/** Attach one unbilled completed lesson to an existing invoice. */
export function attachLesson(invoiceId: number, lessonId: number): void {
  getDb().runSync(ATTACH_LESSON_SQL, [invoiceId, lessonId]);
}

/** Detach one lesson from its invoice (it returns to unbilled). */
export function detachLesson(lessonId: number): void {
  getDb().runSync(DETACH_LESSON_SQL, [lessonId]);
}

export function detachLessons(invoiceId: number): void {
  getDb().runSync(DETACH_LESSONS_SQL, [invoiceId]);
}

// ---------------------------------------------------------------- payments

export function addPayment(p: Payment): number {
  const res = getDb().runSync(INSERT_PAYMENT_SQL, paymentToParams(p));
  return Number(res.lastInsertRowId);
}

export function deletePayment(id: number): void {
  getDb().runSync(DELETE_PAYMENT_SQL, [id]);
}

export function listPayments(invoiceId: number): Payment[] {
  return getDb()
    .getAllSync<PaymentRow>(LIST_PAYMENTS_SQL, [invoiceId])
    .map(rowToPayment);
}

// --------------------------------------------------------------- reminders

export function addReminder(r: Reminder): number {
  const res = getDb().runSync(INSERT_REMINDER_SQL, reminderToParams(r));
  return Number(res.lastInsertRowId);
}

export function deleteReminder(id: number): void {
  getDb().runSync(DELETE_REMINDER_SQL, [id]);
}

export function listReminders(invoiceId: number): Reminder[] {
  return getDb()
    .getAllSync<ReminderRow>(LIST_REMINDERS_SQL, [invoiceId])
    .map(rowToReminder);
}

/** Sent steps per open invoice — feeds nextStep() for the whole queue at once. */
export function sentStepsByOpenInvoice(): Map<number, StepKey[]> {
  const out = new Map<number, StepKey[]>();
  for (const row of getDb().getAllSync<ReminderRow>(LIST_OPEN_REMINDERS_SQL)) {
    const r = rowToReminder(row);
    const list = out.get(r.invoiceId) ?? [];
    list.push(r.step);
    out.set(r.invoiceId, list);
  }
  return out;
}

// ------------------------------------------------------------------ backup

export function getAllForBackup(): Omit<
  BackupV1,
  'format' | 'version' | 'exportedAtMs'
> {
  const d = getDb();
  return {
    students: d.getAllSync<StudentRow>(ALL_STUDENTS_SQL).map(rowToStudent),
    slots: d.getAllSync<SlotRow>(ALL_SLOTS_SQL).map(rowToSlot),
    invoices: d.getAllSync<InvoiceAmountRow>(ALL_INVOICES_SQL).map(rowToInvoice),
    lessons: d.getAllSync<LessonRow>(ALL_LESSONS_SQL).map(rowToLesson),
    reminders: d.getAllSync<ReminderRow>(ALL_REMINDERS_SQL).map(rowToReminder),
    payments: d.getAllSync<PaymentRow>(ALL_PAYMENTS_SQL).map(rowToPayment),
  };
}

/** Restore: replace-all inside one transaction (Billowe backup semantics). */
export function replaceAll(backup: BackupV1): void {
  const d = getDb();
  d.withTransactionSync(() => {
    d.execSync(DELETE_ALL_STUDENTS_SQL); // cascades slots/invoices/lessons/reminders
    for (const s of backup.students)
      d.runSync(RESTORE_STUDENT_SQL, [
        s.id!, s.name, s.payerName, s.email, s.rateCents, s.notes,
        s.archived ? 1 : 0, s.createdMs,
      ]);
    for (const sl of backup.slots)
      d.runSync(RESTORE_SLOT_SQL, [
        sl.id!, sl.studentId, sl.weekday, sl.startMin, sl.durationMin,
      ]);
    for (const i of backup.invoices)
      d.runSync(RESTORE_INVOICE_SQL, [
        i.id!, i.studentId, i.number, i.issuedMs, i.dueMs, i.status,
        i.paidMs, i.notes,
      ]);
    for (const l of backup.lessons)
      d.runSync(RESTORE_LESSON_SQL, [
        l.id!, l.studentId, l.slotId, l.startMs, l.durationMin,
        l.amountCents, l.status, l.invoiceId, l.notes,
      ]);
    for (const r of backup.reminders)
      d.runSync(RESTORE_REMINDER_SQL, [r.id!, r.invoiceId, r.step, r.sentMs]);
    for (const p of backup.payments)
      d.runSync(RESTORE_PAYMENT_SQL, [
        p.id!, p.invoiceId, p.amountCents, p.paidMs, p.notes,
      ]);
  });
}
