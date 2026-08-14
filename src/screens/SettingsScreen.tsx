// src/screens/SettingsScreen.tsx
// Appearance (system/light/dark), the invoice signature (your name +
// business), currency symbol, default hourly rate and payment terms, backup
// export/import (never gated), and the Pro subscription section.

import { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ChromeText, Text, TextInput } from '../ui';
import { exportBackup, pickBackup } from '../backup';
import { replaceAll } from '../db';
import { formatMoney, parseMoneyToCents } from '../models';
import { ThemeMode, useSettings } from '../SettingsContext';
import {
  ProTerm,
  isFailOpen,
  purchasePro,
  restorePurchases,
  useProAccess,
} from '../proAccess';
import { Palette, useTheme } from '../theme';

interface Props {
  onBack: () => void;
}

const THEME_CHOICES: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

export default function SettingsScreen({ onBack }: Props) {
  const { settings, update } = useSettings();
  const pro = useProAccess();
  const { colors: c, statusBarStyle } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [busy, setBusy] = useState(false);
  const [termsText, setTermsText] = useState(settings.defaultTermsDays.toString());
  const [rateText, setRateText] = useState(
    (settings.defaultRateCents / 100).toFixed(2),
  );

  const saveTerms = () => {
    const n = Number(termsText.replace(/[^0-9]/g, ''));
    if (n > 0 && n <= 365) update({ defaultTermsDays: n });
    else setTermsText(settings.defaultTermsDays.toString());
  };

  const saveRate = () => {
    const cents = parseMoneyToCents(rateText);
    if (cents != null) update({ defaultRateCents: cents });
    else setRateText((settings.defaultRateCents / 100).toFixed(2));
  };

  const doExport = async () => {
    setBusy(true);
    try {
      await exportBackup();
    } catch (e: any) {
      Alert.alert('Export failed', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const backup = await pickBackup();
      if (!backup) return;
      Alert.alert(
        'Restore backup?',
        `This replaces everything in Lesson Ledger with ${backup.students.length} student(s), ${backup.lessons.length} lesson(s), and ${backup.invoices.length} invoice(s) from the file. There is no undo.`,
        [
          {
            text: 'Replace all',
            style: 'destructive',
            onPress: () => {
              replaceAll(backup);
              Alert.alert('Restored', 'Backup loaded.');
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    } catch (e: any) {
      Alert.alert('Import failed', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const buyPro = (term: ProTerm) =>
    purchasePro(term)
      .then((ok) => ok && Alert.alert('Thanks!', 'Unlimited students unlocked.'))
      .catch((e) => Alert.alert('Purchase failed', String(e?.message ?? e)));

  const restore = () =>
    restorePurchases()
      .then((ok) =>
        Alert.alert(ok ? 'Restored' : 'Nothing to restore', ok ? 'Pro is active.' : undefined),
      )
      .catch((e) => Alert.alert('Restore failed', String(e?.message ?? e)));

  const manageSub = () =>
    Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {});

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
        <ChromeText style={styles.title}>Settings</ChromeText>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your signature</Text>
        <Text style={styles.hint}>Invoices and reminders sign off with these.</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={c.textMuted}
          value={settings.yourName}
          onChangeText={(t) => update({ yourName: t })}
        />
        <TextInput
          style={styles.input}
          placeholder="Business name (optional)"
          placeholderTextColor={c.textMuted}
          value={settings.businessName}
          onChangeText={(t) => update({ businessName: t })}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Lessons & invoices</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Currency symbol</Text>
          <TextInput
            style={styles.numInput}
            value={settings.currencySymbol}
            onChangeText={(t) => update({ currencySymbol: t })}
          />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Default hourly rate</Text>
          <TextInput
            style={styles.numInput}
            value={rateText}
            onChangeText={setRateText}
            onEndEditing={saveRate}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Payment terms (days)</Text>
          <TextInput
            style={styles.numInput}
            value={termsText}
            onChangeText={setTermsText}
            onEndEditing={saveTerms}
            keyboardType="number-pad"
          />
        </View>
        <Text style={styles.hint}>
          New students start at {formatMoney(settings.defaultRateCents, settings.currencySymbol)}/hour;
          new invoices fall due {settings.defaultTermsDays} days after they&apos;re issued.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Getting paid</Text>
        <Text style={styles.hint}>
          Printed on every invoice PDF and invoice email — Zelle, Venmo, check,
          whatever works for you.
        </Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder={'Zelle: 555-123-4567\nVenmo: @yourname'}
          placeholderTextColor={c.textMuted}
          value={settings.paymentInstructions}
          onChangeText={(t) => update({ paymentInstructions: t })}
          multiline
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.chipRow}>
          {THEME_CHOICES.map(({ mode, label }) => {
            const on = settings.themeMode === mode;
            return (
              <Pressable
                key={mode}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => update({ themeMode: mode })}
              >
                <ChromeText style={[styles.chipText, on && styles.chipTextOn]}>{label}</ChromeText>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>System follows your phone&apos;s light/dark setting.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Backup</Text>
        <Text style={styles.hint}>
          Everything stays on this phone. Backups are plain JSON you keep wherever you like.
        </Text>
        <Pressable style={styles.btn} onPress={doExport} disabled={busy}>
          <Text style={styles.btnText}>Export backup</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={doImport} disabled={busy}>
          <Text style={styles.btnText}>Import backup</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Lesson Ledger Pro</Text>
        {pro ? (
          <>
            <Text style={styles.hint}>
              {isFailOpen()
                ? 'Pro is unlocked in this build.'
                : 'Unlimited students — thanks for the support.'}
            </Text>
            {!isFailOpen() && (
              <Pressable style={styles.btn} onPress={manageSub}>
                <Text style={styles.btnText}>Manage subscription</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              Your first student is free, every feature included. Pro unlocks
              unlimited students. Auto-renews; cancel anytime in your App Store
              settings.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => buyPro('yearly')}>
              <Text style={styles.primaryBtnText}>$49.99 / year (2 months free)</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => buyPro('monthly')}>
              <Text style={styles.btnText}>$4.99 / month</Text>
            </Pressable>
          </>
        )}
        <Pressable style={styles.btn} onPress={restore}>
          <Text style={styles.btnText}>Restore purchases</Text>
        </Pressable>
      </View>
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
    sectionTitle: { fontSize: 16, fontWeight: '600', color: c.textPrimary, marginBottom: 4 },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    label: { fontSize: 15, color: c.textPrimary },
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
    multiline: { minHeight: 64, textAlignVertical: 'top' },
    numInput: {
      backgroundColor: c.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingHorizontal: 12,
      paddingVertical: 7,
      fontSize: 15,
      color: c.textPrimary,
      minWidth: 90,
      textAlign: 'right',
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 8,
      alignItems: 'center',
    },
    chip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipOn: { backgroundColor: c.accent, borderColor: c.accent },
    chipText: { fontSize: 13, color: c.textBody },
    chipTextOn: { fontSize: 13, color: c.accentText, fontWeight: '500' },
    hint: { color: c.textMuted, fontSize: 12, marginTop: 4, marginBottom: 6 },
    primaryBtn: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryBtnText: { color: c.accentText, fontSize: 15, fontWeight: '600' },
    btn: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 8,
    },
    btnText: { color: c.textBody, fontSize: 15, fontWeight: '500' },
  });
