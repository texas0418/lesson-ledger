// src/screens/StudentsScreen.tsx
// Students: who owes what (unbilled + open invoices), quick add, tap through
// to the full student page. The Pro gate lives here: the first active student
// is free with everything included; the second prompts the subscription.

import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ChromeText, Text, TextInput } from '../ui';
import {
  countActiveStudents,
  createStudent,
  listOpenInvoices,
  listStudents,
  unbilledTotals,
} from '../db';
import { Student, formatMoney } from '../models';
import { useProAccess } from '../proAccess';
import { FREE_STUDENTS } from '../revenuecat';
import { useSettings } from '../SettingsContext';
import { Palette, useTheme } from '../theme';

interface Props {
  onBack: () => void;
  onOpenStudent: (studentId: number) => void;
}

export default function StudentsScreen({ onBack, onOpenStudent }: Props) {
  const { settings } = useSettings();
  const pro = useProAccess();
  const { colors: c, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [students, setStudents] = useState<Student[]>(() => listStudents());
  const [newName, setNewName] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute alongside the list
  const unbilled = useMemo(() => unbilledTotals(), [students]);
  const openByStudent = useMemo(() => {
    const m = new Map<number, number>();
    for (const inv of listOpenInvoices()) {
      m.set(inv.studentId, (m.get(inv.studentId) ?? 0) + inv.balanceCents);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute alongside the list
  }, [students]);

  const addStudent = () => {
    const name = newName.trim();
    if (!name) return;
    if (!pro && countActiveStudents() >= FREE_STUDENTS) {
      Alert.alert(
        'Your first student is free',
        `Lesson Ledger Pro unlocks unlimited students. Subscribe in Settings — everything about your ${FREE_STUDENTS === 1 ? 'first student' : `first ${FREE_STUDENTS} students`} stays free forever.`,
      );
      return;
    }
    const id = createStudent({
      name,
      payerName: '',
      email: '',
      rateCents: settings.defaultRateCents,
      notes: '',
      archived: false,
      createdMs: Date.now(),
    });
    setNewName('');
    setStudents(listStudents());
    onOpenStudent(id);
  };

  const sym = settings.currencySymbol;

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
        <ChromeText style={styles.title}>Students</ChromeText>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="New student…"
          placeholderTextColor={c.textMuted}
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={addStudent}
          returnKeyType="done"
        />
        <Pressable style={styles.addBtn} onPress={addStudent}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {students.length === 0 && (
        <Text style={styles.empty}>
          Add your first student — their weekly schedule, rate, and who to
          invoice all live on their page.
        </Text>
      )}

      {students.map((st) => {
        const ub = unbilled.get(st.id!);
        const openCents = openByStudent.get(st.id!) ?? 0;
        const owed = (ub?.totalCents ?? 0) + openCents;
        const subParts = [
          st.email || 'no email',
          ub?.n ? `${ub.n} unbilled lesson(s)` : null,
        ].filter(Boolean);
        return (
          <Pressable
            key={st.id}
            style={[styles.card, st.archived && styles.cardArchived]}
            onPress={() => onOpenStudent(st.id!)}
          >
            <View style={styles.cardRow}>
              <Text style={styles.name} numberOfLines={1}>
                {st.name}
                {st.archived ? '  (archived)' : ''}
              </Text>
              <Text style={owed > 0 ? styles.owed : styles.owedZero}>
                {owed > 0 ? formatMoney(owed, sym) : 'settled up'}
              </Text>
            </View>
            <Text style={styles.sub} numberOfLines={1}>
              {subParts.join(' · ')}
            </Text>
          </Pressable>
        );
      })}
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
    addRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    addInput: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: c.textPrimary,
    },
    addBtn: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingHorizontal: 18,
      justifyContent: 'center',
    },
    addBtnText: { color: c.accentText, fontSize: 15, fontWeight: '600' },
    empty: { color: c.textMuted, fontSize: 14, textAlign: 'center', marginTop: 24 },
    card: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.cardBorder,
      padding: 12,
      marginBottom: 8,
    },
    cardArchived: { opacity: 0.55 },
    cardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    name: { fontSize: 16, fontWeight: '600', color: c.textPrimary, flexShrink: 1 },
    owed: { fontSize: 15, fontWeight: '600', color: c.textPrimary },
    owedZero: { fontSize: 13, color: c.success },
    sub: { fontSize: 13, color: c.textMuted, marginTop: 2 },
  });
