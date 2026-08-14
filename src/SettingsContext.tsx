// src/SettingsContext.tsx
// App settings: who the invoices come from (name + business, used in every
// signature and the PDF header), the currency symbol, the default hourly
// rate for new students, and default payment terms for new invoices.
// Persisted via expo-sqlite/kv-store (same API as AsyncStorage, but backed
// by SQLite we already ship).

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import Storage from 'expo-sqlite/kv-store';

const KEY = 'lessonledger.settings.v1';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Settings {
  yourName: string; // signs every reminder; PDF header
  businessName: string; // second signature line, optional
  currencySymbol: string; // '$', '€', 'kr ', …
  defaultRateCents: number; // per hour; prefills new students
  defaultTermsDays: number; // new invoices: due = issued + this
  themeMode: ThemeMode; // resolved by useTheme(); 'system' follows the OS
}

const DEFAULTS: Settings = {
  yourName: '',
  businessName: '',
  currencySymbol: '$',
  defaultRateCents: 5000,
  defaultTermsDays: 14,
  themeMode: 'system',
};

interface Ctx {
  settings: Settings;
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<Ctx>({
  settings: DEFAULTS,
  loaded: false,
  update: () => {},
});

export function SettingsProvider(props: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Storage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Settings>;
          setSettings({ ...DEFAULTS, ...parsed });
        }
      })
      .catch((e) => console.warn('settings load failed', e))
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      Storage.setItem(KEY, JSON.stringify(next)).catch((e) =>
        console.warn('settings save failed', e),
      );
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loaded, update }}>
      {props.children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
