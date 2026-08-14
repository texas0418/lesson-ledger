// src/screens/HomeScreen.tsx
// Home: today's lessons from the weekly schedule (tap "Taught" to log one —
// the charge lands on the student's unbilled balance), the "send these today"
// reminder queue, an owed-to-you headline (open invoices + unbilled), and
// every open invoice grouped by urgency. Recently settled sits at the bottom
// for reassurance.

import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  InvoiceWithStudent,
  createLesson,
  deleteLesson,
  listActiveSlots,
  listLessonsBetween,
  listOpenInvoices,
  listSettledInvoices,
  listStudents,
  sentStepsByOpenInvoice,
  unbilledTotals,
} from '../db';
import {
  Occurrence,
  Step,
  Student,
  WEEKDAYS,
  addDays,
  bucketInvoices,
  dueShorthand,
  formatClock,
  formatDuration,
  formatMoney,
  formatMonth,
  lessonAmountCents,
  monthBounds,
  nextStep,
  occurrencesOn,
  summarizeLessons,
  todayNoonMs,
} from '../models';
import { useSettings } from '../SettingsContext';
import { Palette, Urgency, useTheme } from '../theme';

interface Props {
  onOpenInvoice: (invoiceId: number) => void;
  onOpenStudent: (studentId: number) => void;
  onStudents: () => void;
  onSettings: () => void;
}

interface QueueItem {
  invoice: InvoiceWithStudent;
  step: Step;
}

const monthLineText = (
  m: { n: number; minutes: number; cents: number },
  nowMs: number,
  sym: string,
): string =>
  `${formatMonth(nowMs)}: ${m.n} lesson${m.n === 1 ? '' : 's'} · ` +
  `${formatDuration(m.minutes)} taught · ${formatMoney(m.cents, sym)} earned`;

const dayBounds = (nowMs: number): [number, number] => {
  const d = new Date(nowMs);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return [start, start + 86400000];
};

interface WeekDay {
  dayMs: number;
  occs: Occurrence[];
}

/** The week strip (today + six days) and the selected day's lesson list.
 *  Only today is loggable; future days are read-only plan. */
function WeekSection(props: {
  week: WeekDay[];
  selected: number;
  onSelect: (i: number) => void;
  byId: Map<number, Student>;
  sym: string;
  styles: ReturnType<typeof makeStyles>;
  accent: string;
  onOpenStudent: (studentId: number) => void;
  onTaught: (occ: Occurrence) => void;
  onLongPress: (occ: Occurrence) => void;
}) {
  const { week, selected, styles, sym } = props;
  const day = week[selected];
  const isToday = selected === 0;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.dot, { backgroundColor: props.accent }]} />
        <Text style={styles.sectionTitle}>{isToday ? 'Today' : 'This week'}</Text>
        <Text style={styles.sectionCount}>{day.occs.length}</Text>
      </View>
      <View style={styles.strip}>
        {week.map((d, i) => {
          const on = i === selected;
          const wd = new Date(d.dayMs);
          return (
            <Pressable
              key={d.dayMs}
              style={[styles.stripChip, on && styles.stripChipOn]}
              onPress={() => props.onSelect(i)}
            >
              <Text style={[styles.stripDay, on && styles.stripTextOn]}>
                {WEEKDAYS[wd.getDay()]}
              </Text>
              <Text style={[styles.stripDate, on && styles.stripTextOn]}>
                {wd.getDate()}
              </Text>
              <Text style={[styles.stripCount, on && styles.stripTextOn]}>
                {d.occs.length > 0 ? d.occs.length : '·'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {day.occs.length === 0 && (
        <Text style={styles.hint}>No lessons {isToday ? 'today' : 'this day'}.</Text>
      )}
      {day.occs.map((occ) => {
        const student = props.byId.get(occ.slot.studentId);
        const logged = occ.lesson;
        return (
          <Pressable
            key={occ.slot.id}
            style={styles.todayRow}
            onPress={() => props.onOpenStudent(occ.slot.studentId)}
            onLongPress={isToday ? () => props.onLongPress(occ) : undefined}
          >
            <View style={styles.todayLeft}>
              <Text style={styles.todayName} numberOfLines={1}>
                {student?.name ?? '?'}
              </Text>
              <Text style={styles.todaySub} numberOfLines={1}>
                {formatClock(occ.slot.startMin)} ·{' '}
                {formatDuration(occ.slot.durationMin)}
              </Text>
            </View>
            {logged ? (
              <Text
                style={
                  logged.status === 'completed'
                    ? styles.loggedText
                    : styles.skippedText
                }
              >
                {logged.status === 'completed'
                  ? `✓ ${formatMoney(logged.amountCents, sym)}`
                  : 'skipped'}
              </Text>
            ) : isToday ? (
              <Pressable style={styles.taughtBtn} onPress={() => props.onTaught(occ)}>
                <Text style={styles.taughtBtnText}>Taught</Text>
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}
      {isToday && day.occs.length > 0 && (
        <Text style={styles.hint}>Long-press a lesson to skip it or undo a log.</Text>
      )}
    </View>
  );
}

export default function HomeScreen({
  onOpenInvoice,
  onOpenStudent,
  onStudents,
  onSettings,
}: Props) {
  const { settings } = useSettings();
  const { colors: c, urgency, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const now = Date.now();
  // The schedule window: today through six days out (the week strip).
  const [bounds] = useState<[number, number]>(() => [
    dayBounds(now)[0],
    dayBounds(addDays(now, 6))[1],
  ]);
  const [students] = useState<Student[]>(() => listStudents());
  const [open, setOpen] = useState<InvoiceWithStudent[]>(() => listOpenInvoices());
  const [settled] = useState<InvoiceWithStudent[]>(() => listSettledInvoices(5));
  const [sentByInvoice] = useState(() => sentStepsByOpenInvoice());
  const [weekLessons, setWeekLessons] = useState(() =>
    listLessonsBetween(bounds[0], bounds[1]),
  );
  const [selectedDay, setSelectedDay] = useState(0); // 0 = today … 6
  const [monthLessons, setMonthLessons] = useState(() =>
    listLessonsBetween(...monthBounds(now)),
  );
  const [unbilled, setUnbilled] = useState(() => unbilledTotals());
  const [collapsed, setCollapsed] = useState<Set<Urgency>>(() => new Set(['later']));
  const [showSettled, setShowSettled] = useState(false);

  const byId = useMemo(() => {
    const m = new Map<number, Student>();
    for (const s of students) m.set(s.id!, s);
    return m;
  }, [students]);

  const reload = useCallback(() => {
    setOpen(listOpenInvoices());
    setWeekLessons(listLessonsBetween(bounds[0], bounds[1]));
    setMonthLessons(listLessonsBetween(...monthBounds(Date.now())));
    setUnbilled(unbilledTotals());
  }, [bounds]);

  const toggleSection = (key: Urgency) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // One entry per strip day: its noon anchor and computed occurrences.
  const week = useMemo(() => {
    const slots = listActiveSlots();
    const anchor = todayNoonMs(now);
    return Array.from({ length: 7 }, (_, i) => {
      const dayMs = addDays(anchor, i);
      return { dayMs, occs: occurrencesOn(slots, weekLessons, dayMs) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- now is the render instant
  }, [weekLessons]);

  const logOccurrence = (occ: Occurrence, status: 'completed' | 'cancelled') => {
    const student = byId.get(occ.slot.studentId);
    if (!student) return;
    createLesson({
      studentId: student.id!,
      slotId: occ.slot.id!,
      startMs: occ.startMs,
      durationMin: occ.slot.durationMin,
      amountCents:
        status === 'completed'
          ? lessonAmountCents(student.rateCents, occ.slot.durationMin)
          : 0,
      status,
      invoiceId: null,
      notes: '',
    });
    reload();
  };

  const offerSkip = (occ: Occurrence) => {
    const student = byId.get(occ.slot.studentId);
    Alert.alert(
      `${student?.name ?? 'This lesson'} today`,
      'Log it as taught, or mark it skipped (no charge)?',
      [
        { text: 'Taught', onPress: () => logOccurrence(occ, 'completed') },
        { text: 'Skipped', onPress: () => logOccurrence(occ, 'cancelled') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const offerUndo = (occ: Occurrence) => {
    if (!occ.lesson) return;
    Alert.alert('Remove this log?', 'The lesson goes back to unlogged.', [
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deleteLesson(occ.lesson!.id!);
          reload();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const queue: QueueItem[] = [];
  for (const inv of open) {
    const step = nextStep(inv.dueMs, sentByInvoice.get(inv.id!) ?? [], now);
    if (step) queue.push({ invoice: inv, step });
  }

  const month = summarizeLessons(monthLessons);
  const buckets = bucketInvoices(open, now);
  const invoicedCents = open.reduce((sum, i) => sum + i.balanceCents, 0);
  let unbilledSum = 0;
  for (const t of unbilled.values()) unbilledSum += t.totalCents;
  const owed = invoicedCents + unbilledSum;
  const sym = settings.currencySymbol;

  const sections: { key: Urgency; title: string; items: InvoiceWithStudent[] }[] = [
    { key: 'overdue', title: 'Overdue', items: buckets.overdue },
    { key: 'dueSoon', title: 'Due soon', items: buckets.dueSoon },
    { key: 'later', title: 'Upcoming', items: buckets.later },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <StatusBar style={statusBarStyle} />
      <View style={styles.topBar}>
        <Text style={styles.appName}>Lesson Ledger</Text>
        <View style={styles.topActions}>
          <Pressable onPress={onStudents} hitSlop={8}>
            <Text style={styles.topLink}>Students</Text>
          </Pressable>
          <Pressable onPress={onSettings} hitSlop={8}>
            <Text style={styles.topLink}>Settings</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Owed to you</Text>
        <Text style={styles.totalValue}>{formatMoney(owed, sym)}</Text>
        <Text style={styles.hint}>
          {formatMoney(invoicedCents, sym)} invoiced · {formatMoney(unbilledSum, sym)}{' '}
          unbilled lessons
        </Text>
        {month.n > 0 && (
          <Text style={styles.monthLine}>{monthLineText(month, now, sym)}</Text>
        )}
      </View>

      {week.some((d) => d.occs.length > 0) && (
        <WeekSection
          week={week}
          selected={selectedDay}
          onSelect={setSelectedDay}
          byId={byId}
          sym={sym}
          styles={styles}
          accent={c.accent}
          onOpenStudent={onOpenStudent}
          onTaught={(occ) => logOccurrence(occ, 'completed')}
          onLongPress={(occ) => (occ.lesson ? offerUndo(occ) : offerSkip(occ))}
        />
      )}

      {queue.length > 0 && (
        <View style={styles.queueCard}>
          <Text style={styles.queueTitle}>Reminders to send — {queue.length}</Text>
          {queue.map(({ invoice, step }) => (
            <Pressable
              key={invoice.id}
              style={styles.queueRow}
              onPress={() => onOpenInvoice(invoice.id!)}
            >
              <View style={styles.queueLeft}>
                <Text style={styles.queueClient} numberOfLines={1}>
                  {invoice.studentName}
                </Text>
                <Text style={styles.queueStep} numberOfLines={1}>
                  {step.label} · {dueShorthand(invoice.dueMs, now)}
                </Text>
              </View>
              <Text style={styles.queueAmount}>
                {formatMoney(invoice.balanceCents, sym)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {students.length === 0 && (
        <>
          <Pressable style={styles.addBtn} onPress={onStudents}>
            <Text style={styles.addBtnText}>+ Add your first student</Text>
          </Pressable>
          <Text style={styles.empty}>
            Add a student and their weekly lesson time. Lesson Ledger tracks
            what they owe — and writes the polite reminder for you.
          </Text>
        </>
      )}

      {sections.map(({ key, title, items }) => {
        if (items.length === 0) return null;
        const uc = urgency(key);
        const isCollapsed = collapsed.has(key);
        return (
          <View key={key} style={styles.section}>
            <Pressable style={styles.sectionHeader} onPress={() => toggleSection(key)}>
              <View style={[styles.dot, { backgroundColor: uc.main }]} />
              <Text style={styles.sectionTitle}>{title}</Text>
              <Text style={styles.sectionCount}>{items.length}</Text>
              <Text style={styles.caret}>{isCollapsed ? '▸' : '▾'}</Text>
            </Pressable>
            {!isCollapsed &&
              items.map((inv) => (
                <Pressable
                  key={inv.id}
                  style={[styles.invoiceCard, { borderLeftColor: uc.main }]}
                  onPress={() => onOpenInvoice(inv.id!)}
                >
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceClient} numberOfLines={1}>
                      {inv.studentName}
                    </Text>
                    <Text style={styles.invoiceAmount}>
                      {formatMoney(inv.balanceCents, sym)}
                    </Text>
                  </View>
                  <Text style={styles.invoiceSub} numberOfLines={1}>
                    {[inv.number, dueShorthand(inv.dueMs, now)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Pressable>
              ))}
          </View>
        );
      })}

      {settled.length > 0 && (
        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeader}
            onPress={() => setShowSettled((s) => !s)}
          >
            <View style={[styles.dot, { backgroundColor: urgency('paid').main }]} />
            <Text style={styles.sectionTitle}>Recently settled</Text>
            <Text style={styles.sectionCount}>{settled.length}</Text>
            <Text style={styles.caret}>{showSettled ? '▾' : '▸'}</Text>
          </Pressable>
          {showSettled &&
            settled.map((inv) => (
              <Pressable
                key={inv.id}
                style={styles.settledRow}
                onPress={() => onOpenInvoice(inv.id!)}
              >
                <Text style={styles.settledName} numberOfLines={1}>
                  {inv.studentName}
                  {inv.number ? ` · ${inv.number}` : ''}
                </Text>
                <Text
                  style={[
                    styles.settledStatus,
                    { color: inv.status === 'paid' ? c.success : c.textMuted },
                  ]}
                >
                  {inv.status === 'paid'
                    ? formatMoney(inv.amountCents, sym)
                    : 'written off'}
                </Text>
              </Pressable>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    scroll: { padding: 16, paddingTop: 0, paddingBottom: 48 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 64,
      paddingBottom: 12,
    },
    appName: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
    topActions: { flexDirection: 'row', gap: 16 },
    topLink: { color: c.accent, fontSize: 14, fontWeight: '500' },
    totalCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.cardBorder,
      padding: 14,
      marginBottom: 14,
    },
    totalLabel: { fontSize: 12, color: c.textMuted, textTransform: 'uppercase' },
    totalValue: { fontSize: 28, fontWeight: '700', color: c.textPrimary, marginTop: 2 },
    strip: { flexDirection: 'row', gap: 5, marginBottom: 10 },
    stripChip: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingVertical: 7,
    },
    stripChipOn: { backgroundColor: c.accent, borderColor: c.accent },
    stripDay: { fontSize: 11, color: c.textMuted },
    stripDate: { fontSize: 15, fontWeight: '600', color: c.textPrimary, marginTop: 1 },
    stripCount: { fontSize: 11, color: c.textMuted, marginTop: 1 },
    stripTextOn: { color: c.accentText },
    monthLine: {
      fontSize: 13,
      color: c.textBody,
      fontWeight: '500',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: c.hairline,
    },
    todayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.cardBorder,
      padding: 12,
      marginBottom: 8,
      gap: 8,
    },
    todayLeft: { flexShrink: 1 },
    todayName: { fontSize: 16, fontWeight: '600', color: c.textPrimary },
    todaySub: { fontSize: 13, color: c.textMuted, marginTop: 1 },
    taughtBtn: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    taughtBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
    loggedText: { color: c.success, fontSize: 14, fontWeight: '600' },
    skippedText: { color: c.textMuted, fontSize: 13 },
    queueCard: {
      backgroundColor: c.dueBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.dueBorder,
      padding: 14,
      marginBottom: 14,
    },
    queueTitle: { fontSize: 14, fontWeight: '600', color: c.dueText, marginBottom: 6 },
    queueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 7,
      borderTopWidth: 1,
      borderTopColor: c.dueBorder,
      gap: 8,
    },
    queueLeft: { flexShrink: 1 },
    queueClient: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    queueStep: { fontSize: 12, color: c.dueText, marginTop: 1 },
    queueAmount: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    addBtn: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 16,
    },
    addBtnText: { color: c.accentText, fontSize: 15, fontWeight: '600' },
    empty: { color: c.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8 },
    section: { marginBottom: 14 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: c.textPrimary, flex: 1 },
    sectionCount: { fontSize: 13, color: c.textMuted },
    caret: { fontSize: 12, color: c.textMuted, width: 16, textAlign: 'center' },
    invoiceCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.cardBorder,
      borderLeftWidth: 3,
      padding: 12,
      marginBottom: 8,
    },
    invoiceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    invoiceClient: { fontSize: 16, fontWeight: '600', color: c.textPrimary, flexShrink: 1 },
    invoiceAmount: { fontSize: 15, fontWeight: '600', color: c.textPrimary },
    invoiceSub: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    settledRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 2,
      borderBottomWidth: 1,
      borderBottomColor: c.hairline,
      gap: 8,
    },
    settledName: { fontSize: 14, color: c.textBody, flexShrink: 1 },
    settledStatus: { fontSize: 13, fontWeight: '500' },
    hint: { color: c.textMuted, fontSize: 12, marginTop: 4 },
  });
