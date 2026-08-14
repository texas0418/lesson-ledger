// src/screens/InvoiceScreen.tsx
// One invoice: the professional PDF one tap from the share sheet, the polite
// reminder ladder pointed at the payer, the lessons it bills, its facts, and
// status. Invoices are born on the student page (from unbilled lessons);
// this screen sends and settles them.

import { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  InvoiceWithAmount,
  addReminder,
  deleteInvoice,
  deleteReminder,
  getInvoice,
  getStudent,
  listLessonsByInvoice,
  listReminders,
  setInvoiceStatus,
  updateInvoice,
} from '../db';
import {
  STEPS,
  StepKey,
  Student,
  addDays,
  daysOverdue,
  dueShorthand,
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatMoney,
  formatYmd,
  nextStep,
  parseYmd,
  payerDisplayName,
  stepIndex,
} from '../models';
import { MessageContext, mailtoUrl, renderInvoiceCover, renderReminder } from '../messages';
import { shareInvoicePdf } from '../pdf';
import { maybeAskForReview } from '../review';
import { useSettings } from '../SettingsContext';
import { Palette, useTheme } from '../theme';

interface Props {
  invoiceId: number;
  onBack: (studentId: number | null) => void;
}

const TERM_CHIPS = [7, 14, 30] as const;

// eslint-disable-next-line max-lines-per-function, complexity -- flat screen render in the house style (Dundue precedent)
export default function InvoiceScreen({ invoiceId, onBack }: Props) {
  const { settings } = useSettings();
  const { colors: c, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [invoice, setInvoice] = useState<InvoiceWithAmount | null>(() =>
    getInvoice(invoiceId),
  );
  const [student] = useState<Student | null>(() =>
    invoice ? getStudent(invoice.studentId) : null,
  );
  const [lessons] = useState(() => listLessonsByInvoice(invoiceId));
  const [reminders, setReminders] = useState(() => listReminders(invoiceId));
  const [busy, setBusy] = useState(false);

  const now = Date.now();
  const [numberText, setNumberText] = useState(invoice?.number ?? '');
  const [issuedText, setIssuedText] = useState(
    formatYmd(invoice?.issuedMs ?? now),
  );
  const [dueText, setDueText] = useState(formatYmd(invoice?.dueMs ?? now));
  const [notes, setNotes] = useState(invoice?.notes ?? '');

  if (!invoice || !student) {
    onBack(null);
    return null;
  }

  const sym = settings.currencySymbol;
  const amountText = formatMoney(invoice.amountCents, sym);

  const msgCtx: MessageContext = {
    payerName: payerDisplayName(student),
    studentName: student.name,
    businessName: settings.businessName,
    yourName: settings.yourName,
    invoiceNumber: invoice.number,
    amountText,
    dueDateText: formatDayLong(invoice.dueMs),
    daysOverdue: daysOverdue(invoice.dueMs, now),
  };

  // ---- send the invoice itself ----
  const sharePdf = async () => {
    setBusy(true);
    try {
      await shareInvoicePdf({
        invoiceNumber: invoice.number,
        issuedMs: invoice.issuedMs,
        dueMs: invoice.dueMs,
        studentName: student.name,
        payerName: student.payerName,
        yourName: settings.yourName,
        businessName: settings.businessName,
        currencySymbol: sym,
        lines: lessons.map((l) => ({
          startMs: l.startMs,
          durationMin: l.durationMin,
          amountCents: l.amountCents,
          notes: l.notes,
        })),
        notes: invoice.notes,
        paymentInstructions: settings.paymentInstructions,
      });
    } catch (e: any) {
      Alert.alert('Could not make the PDF', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const emailCover = async () => {
    const cover = renderInvoiceCover(msgCtx, settings.paymentInstructions);
    try {
      await Linking.openURL(mailtoUrl(student.email, cover.subject, cover.body));
    } catch {
      Alert.alert('No mail app', 'Could not open an email app. Use the PDF share instead.');
    }
  };

  // ---- the reminder composer ----
  const sentSteps = reminders.map((r) => r.step);
  const step =
    invoice.status === 'open' ? nextStep(invoice.dueMs, sentSteps, now) : null;
  const message = step ? renderReminder(step.key, msgCtx) : null;

  const markSent = (key: StepKey) => {
    addReminder({ invoiceId: invoice.id!, step: key, sentMs: Date.now() });
    setReminders(listReminders(invoice.id!));
  };

  const offerMarkSent = (key: StepKey) => {
    Alert.alert('Log this reminder?', 'Marking it sent moves the ladder along.', [
      { text: 'Mark sent', onPress: () => markSent(key) },
      { text: 'Not yet', style: 'cancel' },
    ]);
  };

  const openEmail = async () => {
    if (!message || !step) return;
    try {
      await Linking.openURL(mailtoUrl(student.email, message.subject, message.body));
      offerMarkSent(step.key);
    } catch {
      Alert.alert('No mail app', 'Could not open an email app. Try Share instead.');
    }
  };

  const shareReminder = async () => {
    if (!message || !step) return;
    const res = await Share.share({ message: `${message.subject}\n\n${message.body}` });
    if (res.action !== Share.dismissedAction) offerMarkSent(step.key);
  };

  const removeReminder = (id: number, label: string) => {
    Alert.alert('Remove from history?', `"${label}" will become sendable again.`, [
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deleteReminder(id);
          setReminders(listReminders(invoice.id!));
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ---- facts + status ----
  const saveDetails = () => {
    const issued = parseYmd(issuedText);
    const due = parseYmd(dueText);
    if (issued == null || due == null) {
      Alert.alert('Check the dates', 'Dates need to look like 2026-08-14.');
      return;
    }
    const next = {
      ...invoice,
      number: numberText.trim(),
      issuedMs: issued,
      dueMs: due,
      notes: notes.trim(),
    };
    updateInvoice(next);
    setInvoice(next);
    Alert.alert('Saved', 'Invoice updated.');
  };

  const setTerms = (days: number) => {
    const issued = parseYmd(issuedText);
    if (issued != null) setDueText(formatYmd(addDays(issued, days)));
  };

  const setStatus = (status: InvoiceWithAmount['status']) => {
    const paidMs = status === 'paid' ? Date.now() : null;
    setInvoiceStatus(invoice.id!, status, paidMs);
    setInvoice({ ...invoice, status, paidMs });
    // The win moment: an invoice got paid. One-time review ask lives here
    // and nowhere else.
    if (status === 'paid') maybeAskForReview();
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete invoice?',
      'Its lessons go back to unbilled; the reminder history is deleted. There is no undo.',
      [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteInvoice(invoice.id!);
            onBack(student.id!);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const overdueDays = daysOverdue(invoice.dueMs, now);
  const ladderDone =
    invoice.status === 'open' &&
    !step &&
    sentSteps.some((k) => stepIndex(k) === STEPS.length - 1);

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
        <Pressable onPress={() => onBack(student.id!)} hitSlop={8}>
          <Text style={styles.topLink}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Invoice</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.headClient} numberOfLines={1}>
            {student.name}
          </Text>
          <Text style={styles.headAmount}>{amountText}</Text>
        </View>
        <Text style={styles.headSub}>
          {invoice.status === 'open'
            ? dueShorthand(invoice.dueMs, now)
            : invoice.status === 'paid'
              ? `paid ${invoice.paidMs ? formatDayLong(invoice.paidMs) : ''}`
              : 'written off'}
          {invoice.status === 'open' && overdueDays > 0
            ? ` · due ${formatDayLong(invoice.dueMs)}`
            : ''}
          {student.payerName.trim() ? ` · bills to ${student.payerName.trim()}` : ''}
        </Text>
      </View>

      {invoice.status === 'open' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Send it</Text>
          <View style={styles.btnRow}>
            <Pressable style={styles.primaryBtnTight} onPress={sharePdf} disabled={busy}>
              <Text style={styles.primaryBtnText}>Invoice PDF…</Text>
            </Pressable>
            {student.email.trim() !== '' && (
              <Pressable style={styles.btn} onPress={emailCover}>
                <Text style={styles.btnText}>Email text</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.hint}>
            The PDF opens the share sheet — pick Mail or Messages there.
            {student.email.trim() ? '' : ` No email on file for ${student.name} — add one on their page.`}
          </Text>
        </View>
      )}

      {message && step && (
        <View style={styles.composerCard}>
          <Text style={styles.composerKicker}>Ready to send</Text>
          <Text style={styles.composerStep}>{step.label}</Text>
          <View style={styles.preview}>
            <Text style={styles.previewSubject}>{message.subject}</Text>
            <Text style={styles.previewBody}>{message.body}</Text>
          </View>
          {!settings.yourName.trim() && !settings.businessName.trim() && (
            <Text style={styles.warn}>
              This reminder is unsigned. Add your name in Settings so it goes
              out looking professional.
            </Text>
          )}
          <View style={styles.btnRow}>
            <Pressable style={styles.primaryBtnTight} onPress={shareReminder}>
              <Text style={styles.primaryBtnText}>Share…</Text>
            </Pressable>
            {student.email.trim() !== '' && (
              <Pressable style={styles.btn} onPress={openEmail}>
                <Text style={styles.btnText}>Open in Email</Text>
              </Pressable>
            )}
            <Pressable style={styles.btn} onPress={() => markSent(step.key)}>
              <Text style={styles.btnText}>Mark sent</Text>
            </Pressable>
          </View>
        </View>
      )}

      {invoice.status === 'open' && !step && (
        <View style={styles.card}>
          <Text style={styles.hint}>
            {ladderDone
              ? 'The reminder ladder is done. Consider a conversation at the next lesson — or write it off below.'
              : 'Nothing to send right now. Lesson Ledger queues the next polite reminder when its day comes.'}
          </Text>
        </View>
      )}

      {lessons.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Lessons on this invoice</Text>
          {lessons.map((l) => (
            <View key={l.id} style={styles.lessonRow}>
              <Text style={styles.lessonDate}>{formatDayShort(l.startMs)}</Text>
              <Text style={styles.lessonDur}>{formatDuration(l.durationMin)}</Text>
              <Text style={styles.lessonAmount}>
                {formatMoney(l.amountCents, sym)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Invoice #</Text>
          <TextInput
            style={styles.numInput}
            placeholder="optional"
            placeholderTextColor={c.textMuted}
            value={numberText}
            onChangeText={setNumberText}
          />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Issued</Text>
          <TextInput
            style={styles.numInput}
            value={issuedText}
            onChangeText={setIssuedText}
          />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Due</Text>
          <TextInput style={styles.numInput} value={dueText} onChangeText={setDueText} />
        </View>
        <View style={styles.chipRow}>
          {TERM_CHIPS.map((d) => (
            <Pressable key={d} style={styles.chip} onPress={() => setTerms(d)}>
              <Text style={styles.chipText}>net {d}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Notes (appear on the PDF)"
          placeholderTextColor={c.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
        <Pressable style={styles.primaryBtn} onPress={saveDetails}>
          <Text style={styles.primaryBtnText}>Save changes</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Status</Text>
        <View style={styles.btnRow}>
          {invoice.status !== 'paid' && (
            <Pressable
              style={[styles.primaryBtnTight, { backgroundColor: c.success }]}
              onPress={() => setStatus('paid')}
            >
              <Text style={styles.primaryBtnText}>Mark paid</Text>
            </Pressable>
          )}
          {invoice.status !== 'open' && (
            <Pressable style={styles.btn} onPress={() => setStatus('open')}>
              <Text style={styles.btnText}>Reopen</Text>
            </Pressable>
          )}
          {invoice.status === 'open' && (
            <Pressable style={styles.btn} onPress={() => setStatus('written_off')}>
              <Text style={styles.btnText}>Write off</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Reminder history</Text>
        {reminders.length === 0 && <Text style={styles.hint}>Nothing sent yet.</Text>}
        {reminders.map((r) => {
          const label = STEPS[stepIndex(r.step)].label;
          return (
            <Pressable
              key={r.id}
              style={styles.historyRow}
              onLongPress={() => removeReminder(r.id!, label)}
            >
              <Text style={styles.historyStep}>{label}</Text>
              <Text style={styles.historyDate}>{formatDayLong(r.sentMs)}</Text>
            </Pressable>
          );
        })}
        {reminders.length > 0 && (
          <Text style={styles.hint}>Long-press an entry to remove it.</Text>
        )}
      </View>

      <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
        <Text style={styles.deleteText}>Delete invoice</Text>
      </Pressable>
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
    title: { fontSize: 17, fontWeight: '600', color: c.textPrimary },
    topLink: { color: c.textMuted, fontSize: 14, width: 44 },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.cardBorder,
      padding: 14,
      marginBottom: 14,
    },
    headRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    headClient: { fontSize: 18, fontWeight: '700', color: c.textPrimary, flexShrink: 1 },
    headAmount: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
    headSub: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    composerCard: {
      backgroundColor: c.dueBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.dueBorder,
      padding: 14,
      marginBottom: 14,
    },
    composerKicker: {
      fontSize: 11,
      color: c.dueText,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    composerStep: { fontSize: 17, fontWeight: '700', color: c.textPrimary, marginTop: 2 },
    preview: {
      backgroundColor: c.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      padding: 12,
      marginTop: 10,
    },
    previewSubject: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    previewBody: { fontSize: 13, color: c.textBody, marginTop: 8, lineHeight: 19 },
    warn: { color: c.danger, fontSize: 12, marginTop: 8 },
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
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    primaryBtnText: { color: c.accentText, fontSize: 15, fontWeight: '600' },
    btn: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      backgroundColor: c.card,
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    btnText: { color: c.textBody, fontSize: 15, fontWeight: '500' },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: c.textPrimary, marginBottom: 4 },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    label: { fontSize: 15, color: c.textPrimary },
    numInput: {
      backgroundColor: c.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingHorizontal: 12,
      paddingVertical: 7,
      fontSize: 15,
      color: c.textPrimary,
      minWidth: 140,
      textAlign: 'right',
    },
    input: {
      backgroundColor: c.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 15,
      color: c.textPrimary,
      marginTop: 10,
    },
    notesInput: { minHeight: 60, textAlignVertical: 'top' },
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
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipText: { fontSize: 13, color: c.textBody },
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
    historyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.hairline,
    },
    historyStep: { fontSize: 14, color: c.textPrimary, fontWeight: '500' },
    historyDate: { fontSize: 13, color: c.textMuted },
    deleteBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: 8 },
    deleteText: { color: c.danger, fontSize: 14, fontWeight: '500' },
    hint: { color: c.textMuted, fontSize: 12, marginTop: 4 },
  });
