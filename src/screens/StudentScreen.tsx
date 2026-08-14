// src/screens/StudentScreen.tsx
// One student: profile (name, payer, email, hourly rate), the weekly
// schedule, the unbilled lesson pile (log one-offs here; bundle the pile into
// an invoice), and invoice history. Broken into cards, each its own
// component, sharing one style sheet.

import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ChromeText, DayPicker, Text, TextInput } from '../ui';
import {
  createInvoiceFromLessons,
  createLesson,
  createSlot,
  deleteLesson,
  deleteSlot,
  deleteStudent,
  getStudent,
  listInvoicesByStudent,
  listLessonsBetween,
  listLessonsByStudent,
  listSlotsByStudent,
  listUnbilledByStudent,
  updateStudent,
} from '../db';
import {
  Lesson,
  STATUS_LABELS,
  Slot,
  Student,
  WEEKDAYS,
  addDays,
  dueShorthand,
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatMoney,
  formatMonth,
  formatYmd,
  lessonAmountCents,
  monthBounds,
  parseClock,
  parseMoneyToCents,
  slotLabel,
  summarizeLessons,
  todayNoonMs,
} from '../models';
import { useSettings } from '../SettingsContext';
import { Palette, useTheme } from '../theme';

interface Props {
  studentId: number;
  onBack: () => void;
  onOpenInvoice: (invoiceId: number) => void;
}

type Styles = ReturnType<typeof makeStyles>;

// ------------------------------------------------------------------ profile

function ProfileCard(props: {
  student: Student;
  styles: Styles;
  muted: string;
  danger: string;
  success: string;
  sym: string;
  onSaved: (s: Student) => void;
  onDeleted: () => void;
}) {
  const { student, styles, sym } = props;
  const [name, setName] = useState(student.name);
  const [payer, setPayer] = useState(student.payerName);
  const [email, setEmail] = useState(student.email);
  const [rateText, setRateText] = useState((student.rateCents / 100).toFixed(2));
  const [notes, setNotes] = useState(student.notes);
  const [savedFlash, setSavedFlash] = useState(false);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'A student needs a name.');
      return;
    }
    const rate = parseMoneyToCents(rateText);
    if (rate == null) {
      Alert.alert('Check the rate', `Enter the hourly rate, e.g. 50 or 47.50`);
      return;
    }
    const next: Student = {
      ...student,
      name: trimmed,
      payerName: payer.trim(),
      email: email.trim(),
      rateCents: rate,
      notes: notes.trim(),
    };
    updateStudent(next);
    props.onSaved(next);
    // Popup-free confirmation: the button itself flashes "Saved".
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  };

  const toggleArchived = () => {
    const next = { ...student, archived: !student.archived };
    updateStudent(next);
    props.onSaved(next);
  };

  const confirmDelete = () => {
    Alert.alert(
      `Delete ${student.name}?`,
      'This deletes their schedule, lessons, invoices, and reminder history too. There is no undo. (Archiving keeps everything.)',
      [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteStudent(student.id!);
            props.onDeleted();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Student</Text>
      <TextInput
        style={styles.input}
        placeholder="Student name"
        placeholderTextColor={props.muted}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Who pays (parent name, optional)"
        placeholderTextColor={props.muted}
        value={payer}
        onChangeText={setPayer}
      />
      <TextInput
        style={styles.input}
        placeholder="Email (where invoices go)"
        placeholderTextColor={props.muted}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <View style={styles.rowBetween}>
        <Text style={styles.label}>Hourly rate ({sym})</Text>
        <TextInput
          style={styles.numInput}
          value={rateText}
          onChangeText={setRateText}
          keyboardType="decimal-pad"
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Notes"
        placeholderTextColor={props.muted}
        value={notes}
        onChangeText={setNotes}
      />
      <Pressable
        style={[styles.primaryBtn, savedFlash && { backgroundColor: props.success }]}
        onPress={save}
      >
        <Text style={styles.primaryBtnText}>{savedFlash ? 'Saved ✓' : 'Save'}</Text>
      </Pressable>
      <View style={styles.btnRow}>
        <Pressable style={styles.btn} onPress={toggleArchived}>
          <Text style={styles.btnText}>
            {student.archived ? 'Unarchive' : 'Archive'}
          </Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={confirmDelete}>
          <Text style={[styles.btnText, { color: props.danger }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------- schedule

function ScheduleCard(props: {
  studentId: number;
  styles: Styles;
  muted: string;
  danger: string;
  accent: string;
  accentText: string;
}) {
  const { styles } = props;
  const [slots, setSlots] = useState<Slot[]>(() =>
    listSlotsByStudent(props.studentId),
  );
  const [weekday, setWeekday] = useState<number | null>(null);
  const [timeText, setTimeText] = useState('');
  const [durText, setDurText] = useState('60');

  const addSlot = () => {
    const startMin = parseClock(timeText);
    const durationMin = Number(durText.replace(/[^0-9]/g, ''));
    if (weekday == null) {
      Alert.alert('Pick a day', 'Tap the weekday this lesson repeats on.');
      return;
    }
    if (startMin == null) {
      Alert.alert('Check the time', 'Times look like 3:30 pm or 15:30.');
      return;
    }
    if (!(durationMin > 0 && durationMin <= 12 * 60)) {
      Alert.alert('Check the duration', 'Duration is in minutes, e.g. 60.');
      return;
    }
    createSlot({ studentId: props.studentId, weekday, startMin, durationMin });
    setSlots(listSlotsByStudent(props.studentId));
    setTimeText('');
  };

  const removeSlot = (slot: Slot) => {
    Alert.alert('Remove this time?', `${slotLabel(slot)} — logged lessons keep their history.`, [
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deleteSlot(slot.id!);
          setSlots(listSlotsByStudent(props.studentId));
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Weekly schedule</Text>
      {slots.length === 0 && (
        <Text style={styles.hint}>
          Add the regular lesson time(s). They appear on Home each day, one tap
          to log.
        </Text>
      )}
      {slots.map((slot) => (
        <View key={slot.id} style={styles.slotRow}>
          <Text style={styles.slotText}>{slotLabel(slot)}</Text>
          <Pressable onPress={() => removeSlot(slot)} hitSlop={8}>
            <Text style={[styles.slotRemove, { color: props.danger }]}>✕</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.chipRow}>
        {WEEKDAYS.map((label, i) => {
          const on = weekday === i;
          return (
            <Pressable
              key={label}
              style={[styles.chip, on && { backgroundColor: props.accent, borderColor: props.accent }]}
              onPress={() => setWeekday(on ? null : i)}
            >
              <ChromeText style={[styles.chipText, on && { color: props.accentText, fontWeight: '500' }]}>
                {label}
              </ChromeText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.btnRow}>
        <View style={styles.col}>
          <Text style={styles.fieldLabel}>Start time</Text>
          <TextInput
            style={[styles.numInput, styles.fullWidth]}
            placeholder="3:30 pm"
            placeholderTextColor={props.muted}
            value={timeText}
            onChangeText={setTimeText}
          />
        </View>
        <View style={styles.col}>
          <Text style={styles.fieldLabel}>Minutes</Text>
          <TextInput
            style={[styles.numInput, styles.fullWidth]}
            placeholder="60"
            placeholderTextColor={props.muted}
            value={durText}
            onChangeText={setDurText}
            keyboardType="number-pad"
          />
        </View>
        <Pressable style={[styles.primaryBtnTight, styles.rowEnd]} onPress={addSlot}>
          <Text style={styles.primaryBtnText}>Add</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Pick the day above, then start time and length.</Text>
    </View>
  );
}

// ----------------------------------------------------------------- unbilled

function UnbilledCard(props: {
  student: Student;
  styles: Styles;
  muted: string;
  palette: Palette;
  sym: string;
  termsDays: number;
  onOpenInvoice: (invoiceId: number) => void;
}) {
  const { student, styles, sym } = props;
  const [lessons, setLessons] = useState<Lesson[]>(() =>
    listUnbilledByStudent(student.id!),
  );
  const [showLog, setShowLog] = useState(false);
  const [dateMs, setDateMs] = useState(() => todayNoonMs(Date.now()));
  const [showCal, setShowCal] = useState(false);
  const [durText, setDurText] = useState('60');
  const [amountText, setAmountText] = useState('');
  const [noteText, setNoteText] = useState('');

  const reload = () => setLessons(listUnbilledByStudent(student.id!));

  const durationMin = Number(durText.replace(/[^0-9]/g, '')) || 0;
  const autoAmount = lessonAmountCents(student.rateCents, durationMin);

  const logLesson = () => {
    const startMs = dateMs;
    if (!(durationMin > 0 && durationMin <= 12 * 60)) {
      Alert.alert('Check the duration', 'Duration is in minutes, e.g. 60.');
      return;
    }
    const amount = amountText.trim()
      ? parseMoneyToCents(amountText)
      : autoAmount;
    if (amount == null) {
      Alert.alert('Check the amount', 'Enter a plain amount, e.g. 50 or 47.50.');
      return;
    }
    createLesson({
      studentId: student.id!,
      slotId: null,
      startMs,
      durationMin,
      amountCents: amount,
      status: 'completed',
      invoiceId: null,
      notes: noteText.trim(),
    });
    setShowLog(false);
    setAmountText('');
    setNoteText('');
    reload();
  };

  const removeLesson = (l: Lesson) => {
    Alert.alert(
      'Delete this lesson?',
      `${formatDayShort(l.startMs)} · ${formatMoney(l.amountCents, sym)} — there is no undo.`,
      [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteLesson(l.id!);
            reload();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const makeInvoice = () => {
    const now = Date.now();
    const issued = todayNoonMs(now);
    const number = `${formatYmd(now).replace(/-/g, '')}-${student.id}`;
    const id = createInvoiceFromLessons(
      {
        studentId: student.id!,
        number,
        issuedMs: issued,
        dueMs: addDays(issued, props.termsDays),
        status: 'open',
        paidMs: null,
        notes: '',
      },
      lessons.map((l) => l.id!),
    );
    props.onOpenInvoice(id);
  };

  const total = lessons.reduce((sum, l) => sum + l.amountCents, 0);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Unbilled lessons</Text>
      {lessons.length === 0 && (
        <Text style={styles.hint}>
          Nothing waiting to be billed. Lessons land here when you log them.
        </Text>
      )}
      {lessons.map((l) => (
        <Pressable key={l.id} style={styles.lessonRow} onLongPress={() => removeLesson(l)}>
          <Text style={styles.lessonDate} numberOfLines={1}>
            {formatDayShort(l.startMs)}
            {l.notes ? ` · ${l.notes}` : ''}
          </Text>
          <Text style={styles.lessonDur}>{formatDuration(l.durationMin)}</Text>
          <Text style={styles.lessonAmount}>{formatMoney(l.amountCents, sym)}</Text>
        </Pressable>
      ))}
      {lessons.length > 0 && (
        <Text style={styles.unbilledTotal}>
          {lessons.length} lesson(s) · {formatMoney(total, sym)}
        </Text>
      )}

      {showLog ? (
        <>
          <Text style={styles.fieldLabel}>Date</Text>
          <Pressable
            style={styles.dateField}
            onPress={() => setShowCal((s) => !s)}
          >
            <Text style={styles.dateFieldText}>{formatDayLong(dateMs)}</Text>
            <Text style={styles.caretSmall}>{showCal ? '▴' : '▾'}</Text>
          </Pressable>
          {showCal && (
            <DayPicker
              valueMs={dateMs}
              onChange={(ms) => {
                setDateMs(ms);
                setShowCal(false);
              }}
              palette={props.palette}
            />
          )}
          <View style={styles.btnRow}>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Minutes</Text>
              <TextInput
                style={[styles.numInput, styles.fullWidth]}
                placeholder="60"
                placeholderTextColor={props.muted}
                value={durText}
                onChangeText={setDurText}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Charge ({sym})</Text>
              <TextInput
                style={[styles.numInput, styles.fullWidth]}
                placeholder={(autoAmount / 100).toFixed(2)}
                placeholderTextColor={props.muted}
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <Text style={styles.hint}>
            Charge left blank = hourly rate × minutes.
          </Text>
          <Text style={styles.fieldLabel}>Note (prints on the invoice)</Text>
          <TextInput
            style={styles.input}
            placeholder="Optional — e.g. exam prep"
            placeholderTextColor={props.muted}
            value={noteText}
            onChangeText={setNoteText}
          />
          <View style={styles.btnRow}>
            <Pressable style={styles.primaryBtnTight} onPress={logLesson}>
              <Text style={styles.primaryBtnText}>Log lesson</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => setShowLog(false)}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.btnRow}>
          <Pressable style={styles.btn} onPress={() => setShowLog(true)}>
            <Text style={styles.btnText}>+ Log a lesson</Text>
          </Pressable>
          {lessons.length > 0 && (
            <Pressable style={styles.primaryBtnTight} onPress={makeInvoice}>
              <Text style={styles.primaryBtnText}>
                Invoice {formatMoney(total, sym)}
              </Text>
            </Pressable>
          )}
        </View>
      )}
      {lessons.length > 0 && !showLog && (
        <Text style={styles.hint}>Long-press a lesson to delete it.</Text>
      )}
    </View>
  );
}

// ------------------------------------------------------------------ history

function HistoryCard(props: {
  studentId: number;
  styles: Styles;
  muted: string;
  success: string;
  sym: string;
}) {
  const { styles, sym } = props;
  const [recent] = useState<Lesson[]>(() =>
    listLessonsByStudent(props.studentId, 8),
  );
  const now = Date.now();
  // Month rollup from the full month, not just the rows shown below.
  const [month] = useState(() => {
    const [mStart, mEnd] = monthBounds(now);
    return summarizeLessons(
      listLessonsBetween(mStart, mEnd).filter(
        (l) => l.studentId === props.studentId,
      ),
    );
  });

  if (recent.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Lesson history</Text>
      {month.n > 0 && (
        <Text style={styles.hint}>
          {formatMonth(now)}: {month.n} lesson{month.n === 1 ? '' : 's'} ·{' '}
          {formatDuration(month.minutes)} · {formatMoney(month.cents, sym)}
        </Text>
      )}
      {recent.map((l) => (
        <View key={l.id} style={styles.lessonRow}>
          <Text style={styles.lessonDate}>{formatDayShort(l.startMs)}</Text>
          <Text
            style={[
              styles.lessonDur,
              l.status === 'completed' && l.invoiceId != null && { color: props.success },
            ]}
          >
            {l.status === 'cancelled'
              ? 'skipped'
              : l.invoiceId != null
                ? 'billed'
                : 'unbilled'}
          </Text>
          <Text style={styles.lessonDur}>{formatDuration(l.durationMin)}</Text>
          <Text style={styles.lessonAmount}>
            {l.status === 'cancelled' ? '—' : formatMoney(l.amountCents, sym)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ----------------------------------------------------------------- invoices

function InvoicesCard(props: {
  studentId: number;
  styles: Styles;
  sym: string;
  success: string;
  muted: string;
  onOpenInvoice: (invoiceId: number) => void;
}) {
  const { styles } = props;
  const [invoices] = useState(() => listInvoicesByStudent(props.studentId));
  const now = Date.now();

  if (invoices.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Invoices</Text>
      {invoices.map((inv) => (
        <Pressable
          key={inv.id}
          style={styles.lessonRow}
          onPress={() => props.onOpenInvoice(inv.id!)}
        >
          <Text style={styles.lessonDate} numberOfLines={1}>
            issued {formatDayShort(inv.issuedMs)}
          </Text>
          <Text
            style={[
              styles.lessonDur,
              inv.status === 'paid' && { color: props.success },
            ]}
          >
            {inv.status === 'open'
              ? dueShorthand(inv.dueMs, now)
              : STATUS_LABELS[inv.status].toLowerCase()}
          </Text>
          <Text style={styles.lessonAmount}>
            {formatMoney(
              inv.status === 'open' ? inv.balanceCents : inv.amountCents,
              props.sym,
            )}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ screen

export default function StudentScreen({ studentId, onBack, onOpenInvoice }: Props) {
  const { settings } = useSettings();
  const { colors: c, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [student, setStudent] = useState<Student | null>(() => getStudent(studentId));

  if (!student) {
    onBack();
    return null;
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
    >
      <StatusBar style={statusBarStyle} />
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={8}>
          <ChromeText style={styles.topLink}>‹ Back</ChromeText>
        </Pressable>
        <ChromeText style={styles.title} numberOfLines={1}>
          {student.name}
        </ChromeText>
        <View style={{ width: 44 }} />
      </View>

      <UnbilledCard
        student={student}
        styles={styles}
        muted={c.textMuted}
        palette={c}
        sym={settings.currencySymbol}
        termsDays={settings.defaultTermsDays}
        onOpenInvoice={onOpenInvoice}
      />
      <ScheduleCard
        studentId={studentId}
        styles={styles}
        muted={c.textMuted}
        danger={c.danger}
        accent={c.accent}
        accentText={c.accentText}
      />
      <InvoicesCard
        studentId={studentId}
        styles={styles}
        sym={settings.currencySymbol}
        success={c.success}
        muted={c.textMuted}
        onOpenInvoice={onOpenInvoice}
      />
      <HistoryCard
        studentId={studentId}
        styles={styles}
        muted={c.textMuted}
        success={c.success}
        sym={settings.currencySymbol}
      />
      <ProfileCard
        student={student}
        styles={styles}
        muted={c.textMuted}
        danger={c.danger}
        success={c.success}
        sym={settings.currencySymbol}
        onSaved={setStudent}
        onDeleted={onBack}
      />
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
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: c.textPrimary,
      flexShrink: 1,
      paddingHorizontal: 8,
    },
    topLink: { color: c.textMuted, fontSize: 14, minWidth: 44 },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.cardBorder,
      padding: 14,
      marginBottom: 14,
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: c.textPrimary, marginBottom: 4 },
    input: {
      backgroundColor: c.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 15,
      color: c.textPrimary,
      marginTop: 8,
    },
    numInput: {
      backgroundColor: c.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingHorizontal: 12,
      paddingVertical: 7,
      fontSize: 15,
      color: c.textPrimary,
      minWidth: 76,
      textAlign: 'right',
    },
    grow: { flex: 1, textAlign: 'left' },
    col: { flex: 1 },
    rowEnd: { alignSelf: 'flex-end' },
    fullWidth: { width: '100%', textAlign: 'left' },
    fieldLabel: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 10,
      marginBottom: 4,
    },
    dateField: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    dateFieldText: { fontSize: 15, color: c.textPrimary },
    caretSmall: { fontSize: 12, color: c.textMuted },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    label: { fontSize: 15, color: c.textPrimary },
    btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' },
    primaryBtn: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 10,
    },
    primaryBtnTight: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingVertical: 9,
      paddingHorizontal: 16,
    },
    primaryBtnText: { color: c.accentText, fontSize: 14, fontWeight: '600' },
    btn: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingVertical: 9,
      paddingHorizontal: 16,
    },
    btnText: { color: c.textBody, fontSize: 14, fontWeight: '500' },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 10,
      alignItems: 'center',
    },
    chip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    chipText: { fontSize: 13, color: c.textBody },
    slotRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.hairline,
    },
    slotText: { fontSize: 14, color: c.textPrimary, fontWeight: '500' },
    slotRemove: { fontSize: 14, paddingHorizontal: 4 },
    lessonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.hairline,
      gap: 8,
    },
    lessonDate: { fontSize: 14, color: c.textPrimary, fontWeight: '500', flex: 1 },
    lessonDur: { fontSize: 13, color: c.textMuted },
    lessonAmount: { fontSize: 14, color: c.textPrimary, fontWeight: '500', minWidth: 70, textAlign: 'right' },
    unbilledTotal: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textPrimary,
      marginTop: 8,
      textAlign: 'right',
    },
    hint: { color: c.textMuted, fontSize: 12, marginTop: 6 },
  });
