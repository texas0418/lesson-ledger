// src/models.ts
// Pure module (no expo imports): Lesson Ledger's domain model. A tutor has
// students; each student has weekly schedule slots and a per-hour rate.
// Taught lessons are LOGGED rows (future occurrences are computed from slots,
// never materialized). Logged, uninvoiced lessons are the student's unbilled
// balance; invoices bundle them, and Dundue's polite reminder ladder chases
// what's due. Money is integer cents; times are epoch ms. Due dates pin to
// local noon so day math never straddles DST.

export const INVOICE_STATUSES = ['open', 'paid', 'written_off'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: 'Open',
  paid: 'Paid',
  written_off: 'Written off',
};

export const isInvoiceStatus = (v: unknown): v is InvoiceStatus =>
  typeof v === 'string' && (INVOICE_STATUSES as readonly string[]).includes(v);

export interface Student {
  id?: number;
  name: string; // the student
  payerName: string; // who pays (a parent, usually); '' = the student pays
  email: string; // where invoices and reminders go
  rateCents: number; // per HOUR
  notes: string;
  archived: boolean; // hidden from schedule + new lessons; history kept
  createdMs: number;
}

/** Who reminder emails greet: the payer if one is named, else the student. */
export const payerDisplayName = (s: Pick<Student, 'name' | 'payerName'>): string =>
  s.payerName.trim() || s.name.trim();

/** A weekly recurring lesson time. Occurrences are computed, never stored. */
export interface Slot {
  id?: number;
  studentId: number;
  weekday: number; // 0 = Sunday … 6 = Saturday (JS Date.getDay())
  startMin: number; // minutes from local midnight, 0..1439
  durationMin: number;
}

export const LESSON_STATUSES = ['completed', 'cancelled'] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const isLessonStatus = (v: unknown): v is LessonStatus =>
  typeof v === 'string' && (LESSON_STATUSES as readonly string[]).includes(v);

/** A lesson that actually happened (or was explicitly cancelled that day).
 *  amountCents is frozen at log time from rate x duration so a later rate
 *  change never rewrites history. invoiceId links it to the invoice billing
 *  it; null = unbilled. Cancelled lessons carry amount 0 and are never billed. */
export interface Lesson {
  id?: number;
  studentId: number;
  slotId: number | null; // which weekly slot it came from; null = one-off
  startMs: number;
  durationMin: number;
  amountCents: number;
  status: LessonStatus;
  invoiceId: number | null;
  notes: string;
}

export interface Invoice {
  id?: number;
  studentId: number;
  number: string; // free text: "2026-014" or blank
  issuedMs: number;
  dueMs: number;
  status: InvoiceStatus;
  paidMs: number | null;
  notes: string;
}

/** One reminder actually sent (or logged as sent) for an invoice. */
export interface Reminder {
  id?: number;
  invoiceId: number;
  step: StepKey;
  sentMs: number;
}

// --------------------------------------------------------------- the ladder
//
// Dundue's reminder ladder, unchanged: one courtesy note before the due date,
// then an escalation that stays polite but stops being ignorable. Offsets are
// days relative to the due date. Ordered; a sent step never repeats, and an
// invoice entered already-late skips the steps it blew past.

export const STEPS = [
  { key: 'before', offsetDays: -3, label: 'Courtesy heads-up' },
  { key: 'due', offsetDays: 0, label: 'Due today' },
  { key: 'overdue3', offsetDays: 3, label: 'Gentle nudge' },
  { key: 'overdue7', offsetDays: 7, label: 'Follow-up' },
  { key: 'overdue14', offsetDays: 14, label: 'Second follow-up' },
  { key: 'overdue30', offsetDays: 30, label: 'Final notice' },
] as const;

export type Step = (typeof STEPS)[number];
export type StepKey = Step['key'];

export const isStepKey = (v: unknown): v is StepKey =>
  typeof v === 'string' && STEPS.some((s) => s.key === v);

export const stepIndex = (key: StepKey): number =>
  STEPS.findIndex((s) => s.key === key);

export const stepDateMs = (dueMs: number, step: Step): number =>
  addDays(dueMs, step.offsetDays);

/** The reminder an open invoice needs now, or null if it's caught up.
 *  Rule: the LATEST step whose date has arrived (local calendar day), unless
 *  a step that far or further down the ladder was already sent. */
export function nextStep(
  dueMs: number,
  sentSteps: StepKey[],
  nowMs: number,
): Step | null {
  const todayKey = dayKey(nowMs);
  let eligible = -1;
  STEPS.forEach((s, i) => {
    if (dayKey(stepDateMs(dueMs, s)) <= todayKey) eligible = i;
  });
  const maxSent = sentSteps.reduce((m, k) => Math.max(m, stepIndex(k)), -1);
  if (eligible < 0 || eligible <= maxSent) return null;
  return STEPS[eligible];
}

// ------------------------------------------------------------------- dates

/** Local-calendar day key, e.g. 20260719. Comparable with < and >. */
export const dayKey = (ms: number): number => {
  const d = new Date(ms);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};

/** Calendar-day add via setDate so DST transitions can't shift the day. */
export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Whole local calendar days from a to b (positive when b is later). */
export function diffDays(aMs: number, bMs: number): number {
  const mid = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  return Math.round((mid(bMs) - mid(aMs)) / 86400000);
}

/** Days past due; negative while the due date is still ahead. */
export const daysOverdue = (dueMs: number, nowMs: number): number =>
  diffDays(dueMs, nowMs);

/** "2026-07-19" (or 2026-7-19) -> local-noon epoch ms; null if not a real date. */
export function parseYmd(text: string): number | null {
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(text);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d, 12);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  )
    return null; // 2026-02-30 etc.
  return date.getTime();
}

export function formatYmd(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** "Jul 19, 2026" — the form used inside reminder emails and the PDF. */
export function formatDayLong(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Jul 19" — list-row shorthand for lesson dates. */
export function formatDayShort(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAYS_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

/** Local noon today — the anchor for new issued dates. */
export function todayNoonMs(nowMs: number): number {
  const d = new Date(nowMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
}

// ----------------------------------------------------------- times of day

/** 810 -> "1:30 PM". Slot times render in the tutor's local clock. */
export function formatClock(startMin: number): string {
  const h24 = Math.floor(startMin / 60);
  const m = startMin % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${m.toString().padStart(2, '0')} ${suffix}`;
}

/** "3:30 pm", "15:30", "3pm", "930" -> minutes from midnight; null if junk. */
export function parseClock(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return h * 60 + min;
}

/** "1h", "45m", "1h 30m" — durations in list rows and the PDF. */
export function formatDuration(durationMin: number): string {
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** The lesson charge: hourly rate x duration, rounded to the cent. */
export const lessonAmountCents = (
  rateCents: number,
  durationMin: number,
): number => Math.round((rateCents * durationMin) / 60);

// ------------------------------------------------------------- occurrences

/** A slot's occurrence on one concrete day, matched (or not) to a logged
 *  lesson. The Home screen's "today" list is a row of these. */
export interface Occurrence {
  slot: Slot;
  startMs: number; // slot time on that day, local
  lesson: Lesson | null; // the logged row for (slotId, that day), if any
}

/** All slot occurrences for the local day containing dayMs, sorted by time.
 *  Logged lessons (completed or cancelled) attach by slotId + calendar day. */
export function occurrencesOn(
  slots: Slot[],
  lessons: Lesson[],
  dayMs: number,
): Occurrence[] {
  const d = new Date(dayMs);
  const weekday = d.getDay();
  const key = dayKey(dayMs);
  const out: Occurrence[] = [];
  for (const slot of slots) {
    if (slot.weekday !== weekday) continue;
    const startMs = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      Math.floor(slot.startMin / 60),
      slot.startMin % 60,
    ).getTime();
    const lesson =
      lessons.find(
        (l) => l.slotId === slot.id && dayKey(l.startMs) === key,
      ) ?? null;
    out.push({ slot, startMs, lesson });
  }
  out.sort((a, b) => a.startMs - b.startMs);
  return out;
}

/** "Mon 3:30 PM · 1h" — how a slot reads in the student editor. */
export const slotLabel = (s: Slot): string =>
  `${WEEKDAYS[s.weekday]} ${formatClock(s.startMin)} · ${formatDuration(s.durationMin)}`;

// ------------------------------------------------------------------- money

/** 125050 -> "$1,250.50". Symbol comes from Settings. */
export function formatMoney(cents: number, symbol = '$'): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${symbol}${whole}.${(abs % 100).toString().padStart(2, '0')}`;
}

/** "$1,250.50" -> 125050. Returns null for anything that isn't a plain
 *  non-negative dollar amount with at most two decimals. */
export function parseMoneyToCents(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, frac = ''] = clean.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

// ----------------------------------------------------------------- buckets

export interface InvoiceBuckets<T> {
  overdue: T[]; // most overdue first — the top of the list is the oldest debt
  dueSoon: T[]; // due today through +soonDays, soonest first
  later: T[]; // soonest first
}

export function bucketInvoices<T extends { dueMs: number }>(
  items: T[],
  nowMs: number,
  soonDays = 7,
): InvoiceBuckets<T> {
  const out: InvoiceBuckets<T> = { overdue: [], dueSoon: [], later: [] };
  for (const it of items) {
    const over = daysOverdue(it.dueMs, nowMs);
    if (over > 0) out.overdue.push(it);
    else if (over >= -soonDays) out.dueSoon.push(it);
    else out.later.push(it);
  }
  const byDue = (a: T, b: T) => a.dueMs - b.dueMs;
  out.overdue.sort(byDue);
  out.dueSoon.sort(byDue);
  out.later.sort(byDue);
  return out;
}

// ------------------------------------------------------------------ totals

/** Sum of logged, completed, not-yet-invoiced lessons. */
export const unbilledCents = (
  lessons: Pick<Lesson, 'status' | 'invoiceId' | 'amountCents'>[],
): number =>
  lessons
    .filter((l) => l.status === 'completed' && l.invoiceId == null)
    .reduce((sum, l) => sum + l.amountCents, 0);

export const outstandingCents = (
  invoices: { status: InvoiceStatus; amountCents: number }[],
): number =>
  invoices
    .filter((i) => i.status === 'open')
    .reduce((sum, i) => sum + i.amountCents, 0);

export const overdueCents = (
  invoices: { status: InvoiceStatus; amountCents: number; dueMs: number }[],
  nowMs: number,
): number =>
  invoices
    .filter((i) => i.status === 'open' && daysOverdue(i.dueMs, nowMs) > 0)
    .reduce((sum, i) => sum + i.amountCents, 0);

/** "due today" / "due in 3d" / "5d overdue" — list-row shorthand. */
export function dueShorthand(dueMs: number, nowMs: number): string {
  const over = daysOverdue(dueMs, nowMs);
  if (over > 0) return `${over}d overdue`;
  if (over === 0) return 'due today';
  return `due in ${-over}d`;
}
