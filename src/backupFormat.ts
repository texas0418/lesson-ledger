// src/backupFormat.ts
// Pure module (Node-testable): versioned JSON backup format.
// Version 1: students, slots, invoices, lessons, reminders, ids included
// (restore is replace-all, so original ids are safe to keep and cross-table
// references survive the round-trip). Version 2 adds payments. Forward rule:
// parse must tolerate missing fields by defaulting (a v1 file simply has no
// payments), never throw on well-formed older backups.

import type { Invoice, Lesson, Payment, Reminder, Slot, Student } from './models';
import { isInvoiceStatus, isLessonStatus, isStepKey } from './models';

export const BACKUP_FORMAT = 'lessonledger-backup';
export const BACKUP_VERSION = 2;

export interface BackupV1 {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAtMs: number;
  students: Student[];
  slots: Slot[];
  invoices: Invoice[];
  lessons: Lesson[];
  reminders: Reminder[];
  payments: Payment[];
}

export function serializeBackup(
  data: Omit<BackupV1, 'format' | 'version' | 'exportedAtMs'>,
  nowMs: number,
): string {
  const b: BackupV1 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAtMs: nowMs,
    ...data,
  };
  return JSON.stringify(b, null, 1);
}

const num = (v: unknown, d: number): number => (typeof v === 'number' ? v : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;

function parseStudents(raw: unknown): Student[] {
  const out: Student[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const s = asRecord(r);
    if (!s || typeof s.id !== 'number' || typeof s.createdMs !== 'number') continue;
    out.push({
      id: s.id,
      name: str(s.name, ''),
      payerName: str(s.payerName, ''),
      email: str(s.email, ''),
      rateCents: num(s.rateCents, 0),
      notes: str(s.notes, ''),
      archived: s.archived === true,
      createdMs: s.createdMs,
    });
  }
  return out;
}

function parseSlots(raw: unknown, studentIds: Set<number>): Slot[] {
  const out: Slot[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const s = asRecord(r);
    if (!s || typeof s.id !== 'number' || !studentIds.has(s.studentId as number)) continue;
    const weekday = num(s.weekday, -1);
    if (weekday < 0 || weekday > 6) continue;
    out.push({
      id: s.id,
      studentId: s.studentId as number,
      weekday,
      startMin: num(s.startMin, 0),
      durationMin: num(s.durationMin, 60),
    });
  }
  return out;
}

function parseInvoices(raw: unknown, studentIds: Set<number>): Invoice[] {
  const out: Invoice[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const i = asRecord(r);
    if (!i || typeof i.id !== 'number' || !studentIds.has(i.studentId as number)) continue;
    if (typeof i.dueMs !== 'number') continue;
    out.push({
      id: i.id,
      studentId: i.studentId as number,
      number: str(i.number, ''),
      issuedMs: num(i.issuedMs, i.dueMs),
      dueMs: i.dueMs,
      status: isInvoiceStatus(i.status) ? i.status : 'open',
      paidMs: typeof i.paidMs === 'number' ? i.paidMs : null,
      notes: str(i.notes, ''),
    });
  }
  return out;
}

function parseLessons(
  raw: unknown,
  studentIds: Set<number>,
  slotIds: Set<number>,
  invoiceIds: Set<number>,
): Lesson[] {
  const out: Lesson[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const l = asRecord(r);
    if (!l || typeof l.id !== 'number' || !studentIds.has(l.studentId as number)) continue;
    if (typeof l.startMs !== 'number') continue;
    // Dangling slot/invoice references degrade to null, not a dropped lesson.
    const slotId =
      typeof l.slotId === 'number' && slotIds.has(l.slotId) ? l.slotId : null;
    const invoiceId =
      typeof l.invoiceId === 'number' && invoiceIds.has(l.invoiceId)
        ? l.invoiceId
        : null;
    out.push({
      id: l.id,
      studentId: l.studentId as number,
      slotId,
      startMs: l.startMs,
      durationMin: num(l.durationMin, 60),
      amountCents: num(l.amountCents, 0),
      status: isLessonStatus(l.status) ? l.status : 'completed',
      invoiceId,
      notes: str(l.notes, ''),
    });
  }
  return out;
}

function parsePayments(raw: unknown, invoiceIds: Set<number>): Payment[] {
  const out: Payment[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const p = asRecord(r);
    if (!p || typeof p.id !== 'number' || !invoiceIds.has(p.invoiceId as number)) continue;
    if (typeof p.paidMs !== 'number' || typeof p.amountCents !== 'number') continue;
    out.push({
      id: p.id,
      invoiceId: p.invoiceId as number,
      amountCents: p.amountCents,
      paidMs: p.paidMs,
      notes: str(p.notes, ''),
    });
  }
  return out;
}

function parseReminders(raw: unknown, invoiceIds: Set<number>): Reminder[] {
  const out: Reminder[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const m = asRecord(r);
    if (!m || typeof m.id !== 'number' || !invoiceIds.has(m.invoiceId as number)) continue;
    if (typeof m.sentMs !== 'number' || !isStepKey(m.step)) continue;
    out.push({
      id: m.id,
      invoiceId: m.invoiceId as number,
      step: m.step,
      sentMs: m.sentMs,
    });
  }
  return out;
}

/** Returns a validated backup or throws Error with a human-readable reason. */
export function parseBackup(json: string): BackupV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Not a valid backup file (not JSON).');
  }
  const o = asRecord(raw);
  if (!o) throw new Error('Not a valid backup file.');
  if (o.format !== BACKUP_FORMAT) {
    throw new Error('Not a Lesson Ledger backup file.');
  }
  if (typeof o.version !== 'number' || o.version > BACKUP_VERSION) {
    throw new Error('Backup was made by a newer version of Lesson Ledger.');
  }

  const students = parseStudents(o.students);
  const studentIds = new Set(students.map((s) => s.id!));
  const slots = parseSlots(o.slots, studentIds);
  const slotIds = new Set(slots.map((s) => s.id!));
  const invoices = parseInvoices(o.invoices, studentIds);
  const invoiceIds = new Set(invoices.map((i) => i.id!));
  const lessons = parseLessons(o.lessons, studentIds, slotIds, invoiceIds);
  const reminders = parseReminders(o.reminders, invoiceIds);
  const payments = parsePayments(o.payments, invoiceIds);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAtMs: num(o.exportedAtMs, 0),
    students,
    slots,
    invoices,
    lessons,
    reminders,
    payments,
  };
}
