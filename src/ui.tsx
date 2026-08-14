// src/ui.tsx — Dynamic Type ceilings and the built-in day picker.
//
// `Text.defaultProps = { maxFontSizeMultiplier }` is silently DEAD under
// React 19 (fleet-wide finding, bindery 2026-08-02): accessibility text sizes
// scale unbounded and shatter layouts — confirmed on Simon's phone at max
// type 2026-08-14. Fix per the house pattern: capped wrapper components,
// swapped in for every react-native Text/TextInput import. Chrome that must
// share a row (headers, chips, the week strip) passes a tighter cap.

import { useState } from 'react';
import {
  Pressable,
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  TextInputProps,
  TextProps,
  View,
} from 'react-native';
import { WEEKDAYS, dayKey } from './models';
import type { Palette } from './theme';

/** Body copy can grow this far before it starts wrecking rows. */
export const TYPE_CAP_BODY = 1.4;
/** Single-row chrome (top bars, chips, the strip) gets less headroom. */
export const TYPE_CAP_CHROME = 1.15;

export function Text(props: TextProps) {
  return <RNText maxFontSizeMultiplier={TYPE_CAP_BODY} {...props} />;
}

/** Text for one-line chrome that must never push its neighbors off-screen. */
export function ChromeText(props: TextProps) {
  return <RNText maxFontSizeMultiplier={TYPE_CAP_CHROME} {...props} />;
}

export function TextInput(props: TextInputProps) {
  return <RNTextInput maxFontSizeMultiplier={TYPE_CAP_BODY} {...props} />;
}

// ------------------------------------------------------------- day picker

interface DayPickerProps {
  valueMs: number; // local-noon ms of the selected day
  onChange: (ms: number) => void;
  palette: Palette;
}

const noonOf = (y: number, m: number, d: number): number =>
  new Date(y, m, d, 12).getTime();

/** Inline month-grid day picker — pure JS, no native module, themed. */
export function DayPicker({ valueMs, onChange, palette: c }: DayPickerProps) {
  const sel = new Date(valueMs);
  const [view, setView] = useState<{ y: number; m: number }>({
    y: sel.getFullYear(),
    m: sel.getMonth(),
  });
  const styles = pickerStyles(c);

  const first = new Date(view.y, view.m, 1);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const leading = first.getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = first.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const todayKey = dayKey(Date.now());
  const selKey = dayKey(valueMs);

  const shift = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => shift(-1)} hitSlop={10}>
          <ChromeText style={styles.arrow}>‹</ChromeText>
        </Pressable>
        <ChromeText style={styles.month}>{monthLabel}</ChromeText>
        <Pressable onPress={() => shift(1)} hitSlop={10}>
          <ChromeText style={styles.arrow}>›</ChromeText>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={styles.cell}>
            <ChromeText style={styles.weekday}>{w[0]}</ChromeText>
          </View>
        ))}
        {cells.map((day, i) => {
          if (day == null) return <View key={`b${i}`} style={styles.cell} />;
          const ms = noonOf(view.y, view.m, day);
          const k = dayKey(ms);
          const isSel = k === selKey;
          const isToday = k === todayKey;
          return (
            <View key={`d${i}`} style={styles.cell}>
              <Pressable
                style={[
                  styles.day,
                  isToday && !isSel && styles.dayToday,
                  isSel && { backgroundColor: c.accent, borderColor: c.accent },
                ]}
                onPress={() => onChange(ms)}
              >
                <ChromeText
                  style={[styles.dayText, isSel && { color: c.accentText }]}
                >
                  {day}
                </ChromeText>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const pickerStyles = (c: Palette) =>
  StyleSheet.create({
    root: {
      backgroundColor: c.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
      padding: 8,
      marginTop: 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
      marginBottom: 4,
    },
    arrow: { fontSize: 20, color: c.accent, paddingHorizontal: 8 },
    month: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: {
      width: `${100 / 7}%`,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 2,
    },
    weekday: { fontSize: 11, color: c.textMuted },
    day: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    dayToday: { borderColor: c.accent },
    dayText: { fontSize: 14, color: c.textPrimary },
  });
