// src/theme.ts — Lesson Ledger palettes: the house's clean minimal UI with a
// scholarly indigo accent on warm paper (a tutoring ledger should feel like a
// well-kept notebook, not accounting software). Urgency color coding rides on
// the due buckets (overdue / due soon / later / paid) — chip, section header,
// and invoice card edge. Light and dark are both first-class; the switch
// lives in Settings (system / light / dark) and resolves through useTheme().
// Screens build their StyleSheets from the palette via makeStyles(c) so
// nothing hardcodes a mode.

import { useColorScheme } from 'react-native';
import { useSettings } from './SettingsContext';

export type ThemeScheme = 'light' | 'dark';

export interface Palette {
  bg: string;
  card: string;
  cardBorder: string;
  hairline: string;
  textPrimary: string;
  textBody: string;
  textMuted: string;
  accent: string; // filled buttons, selected chips, links
  accentText: string; // text on accent fills
  danger: string;
  success: string;
  dueBg: string; // reminders-to-send banner
  dueBorder: string;
  dueText: string;
}

export const lightColors: Palette = {
  bg: '#f7f6f2',
  card: '#ffffff',
  cardBorder: '#e6e4dd',
  hairline: '#efeee8',
  textPrimary: '#191a20',
  textBody: '#41434e',
  textMuted: '#888a95',
  accent: '#2e3a8c',
  accentText: '#ffffff',
  danger: '#c93b3b',
  success: '#1d9e75',
  dueBg: '#fdf6ec',
  dueBorder: '#f0dfc2',
  dueText: '#633806',
};

export const darkColors: Palette = {
  bg: '#10131f',
  card: '#191d2c',
  cardBorder: '#2a2f42',
  hairline: '#222638',
  textPrimary: '#eef0f6',
  textBody: '#c4c8d6',
  textMuted: '#7e8394',
  accent: '#93a3f5', // deep indigo reads as mud on dark; lift it
  accentText: '#10131f',
  danger: '#e06c6c',
  success: '#4cc39a',
  dueBg: '#2b2210',
  dueBorder: '#48391a',
  dueText: '#e3b46b',
};

/** Urgency buckets an invoice can sit in, for color coding. */
export type Urgency = 'overdue' | 'dueSoon' | 'later' | 'paid' | 'writtenOff';

export interface UrgencyColor {
  main: string; // dots, card edge
  bg: string; // chip background
  text: string; // text on bg
}

const urgencyLight: Record<Urgency, UrgencyColor> = {
  overdue: { main: '#c93b3b', bg: '#faeaea', text: '#6e1c1c' },
  dueSoon: { main: '#ba7517', bg: '#faeeda', text: '#633806' },
  later: { main: '#378add', bg: '#e6f1fb', text: '#0c447c' },
  paid: { main: '#1d9e75', bg: '#e1f5ee', text: '#085041' },
  writtenOff: { main: '#868d95', bg: '#eef0f2', text: '#4a5058' },
};

const urgencyDark: Record<Urgency, UrgencyColor> = {
  overdue: { main: '#d65454', bg: '#351717', text: '#e39a9a' },
  dueSoon: { main: '#cf8b2b', bg: '#33270f', text: '#e3b46b' },
  later: { main: '#4f97e3', bg: '#16293e', text: '#9cc4ef' },
  paid: { main: '#2cb185', bg: '#103028', text: '#6fd3ae' },
  writtenOff: { main: '#8b939c', bg: '#262c33', text: '#aeb6bf' },
};

export interface Theme {
  scheme: ThemeScheme;
  colors: Palette;
  urgency: (u: Urgency) => UrgencyColor;
  /** For expo StatusBar: the text color, i.e. the opposite of the scheme. */
  statusBarStyle: 'light' | 'dark';
}

export function useTheme(): Theme {
  const system = useColorScheme();
  const { settings } = useSettings();
  const scheme: ThemeScheme =
    settings.themeMode === 'system'
      ? system === 'dark'
        ? 'dark'
        : 'light'
      : settings.themeMode;
  const urgencies = scheme === 'dark' ? urgencyDark : urgencyLight;
  return {
    scheme,
    colors: scheme === 'dark' ? darkColors : lightColors,
    urgency: (u) => urgencies[u],
    statusBarStyle: scheme === 'dark' ? 'light' : 'dark',
  };
}
