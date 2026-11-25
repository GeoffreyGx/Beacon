// Light/dark theming. Mode is 'auto' (follow the device), 'light' or 'dark',
// persisted per device. Works the same on web and native via useColorScheme().
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform, StyleSheet, useColorScheme } from 'react-native';
import { getPref, setPref } from './prefs';

/** Partner brand colours, same in light and dark mode. */
export const BRAND = { izly: '#E6007E' } as const;

export type ThemeMode = 'auto' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

type EventColors = { bg: string; border: string; text: string };

const light = {
  bg: '#ffffff',
  surfaceAlt: '#f9fafb',
  pressed: '#f3f4f6',
  border: '#d1d5db',
  borderStrong: '#9ca3af',
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  textFaint: '#9ca3af',
  primary: '#2563eb',
  danger: '#c0392b',
  inverseBg: '#111827',
  inverseText: '#ffffff',
  gridLine: '#eeeeee',
  hourLine: '#d1d5db',
  free: '#dcfce7',
  busy: '#fee2e2',
  /** Text on free / busy backgrounds. */
  freeText: '#166534',
  busyText: '#991b1b',
  live: '#ef4444',
  moved: '#2563eb',
  /** Pinned (favourite) star. */
  star: '#f59e0b',
  preview: 'rgba(37, 99, 235, 0.35)',
  backdrop: 'rgba(17, 24, 39, 0.35)',
  /** Home "now bar" background, and text on it. */
  accent: '#2563eb',
  onAccent: '#ffffff',
  /** Informational banner (app update): tinted surface, its text, and its main button. */
  infoBg: '#eff6ff',
  infoBorder: '#bfdbfe',
  infoText: '#1e3a8a',
  infoButton: '#2563eb',
  onInfoButton: '#ffffff',
  /** Server alerts on the home screen (`src/lib/alerts.ts`), one tint per style. */
  alerts: {
    major: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
    blockade: { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' },
    maintenance: { bg: '#fefce8', border: '#fde68a', text: '#854d0e' },
    normal: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
    test: { bg: '#f3f4f6', border: '#d1d5db', text: '#374151' },
  } satisfies Record<string, EventColors>,
  events: {
    CM: { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
    TD: { bg: '#dcfce7', border: '#22c55e', text: '#14532d' },
    TP: { bg: '#ede9fe', border: '#8b5cf6', text: '#4c1d95' },
    Evaluation: { bg: '#ffedd5', border: '#f97316', text: '#7c2d12' },
    Annulation: { bg: '#f3f4f6', border: '#9ca3af', text: '#6b7280' },
    default: { bg: '#e0f2fe', border: '#0ea5e9', text: '#0c4a6e' },
  } as Record<string, EventColors>,
};

export type Palette = typeof light;

// OLED dark: pure black background, neutral greys for surfaces and lines.
const dark: Palette = {
  bg: '#000000',
  surfaceAlt: '#0f0f0f',
  pressed: '#1a1a1a',
  border: '#2a2a2a',
  borderStrong: '#404040',
  text: '#f5f5f5',
  textSecondary: '#d4d4d4',
  textMuted: '#a3a3a3',
  textFaint: '#737373',
  primary: '#60a5fa',
  danger: '#f87171',
  inverseBg: '#f5f5f5',
  inverseText: '#000000',
  gridLine: '#161616',
  hourLine: '#2a2a2a',
  free: '#14532d',
  busy: '#7f1d1d',
  freeText: '#bbf7d0',
  busyText: '#fecaca',
  live: '#ef4444',
  moved: '#3b82f6',
  star: '#fbbf24',
  preview: 'rgba(96, 165, 250, 0.4)',
  backdrop: 'rgba(0, 0, 0, 0.7)',
  accent: '#1d4ed8',
  onAccent: '#ffffff',
  infoBg: '#0b1626',
  infoBorder: '#1e3a5f',
  infoText: '#cfe1f7',
  infoButton: '#93c5fd',
  onInfoButton: '#0b1626',
  alerts: {
    major: { bg: '#1f0a0a', border: '#5f1e1e', text: '#fecaca' },
    blockade: { bg: '#1f1007', border: '#6b3410', text: '#fed7aa' },
    maintenance: { bg: '#1c1605', border: '#5c4710', text: '#fde68a' },
    normal: { bg: '#07170d', border: '#14532d', text: '#bbf7d0' },
    test: { bg: '#111111', border: '#333333', text: '#d4d4d4' },
  },
  events: {
    CM: { bg: '#1e3a8a', border: '#60a5fa', text: '#dbeafe' },
    TD: { bg: '#14532d', border: '#4ade80', text: '#dcfce7' },
    TP: { bg: '#4c1d95', border: '#a78bfa', text: '#ede9fe' },
    Evaluation: { bg: '#7c2d12', border: '#fb923c', text: '#ffedd5' },
    Annulation: { bg: '#171717', border: '#525252', text: '#a3a3a3' },
    default: { bg: '#0c4a6e', border: '#38bdf8', text: '#e0f2fe' },
  },
};

/** Occupancy gauges (libraries, restaurants): green below half capacity, orange up to 80 %, red above. */
export const occupancyColor = (c: Palette, percent: number) => (percent < 50 ? c.freeText : percent < 80 ? '#f59e0b' : c.live);

export const eventColors = (c: Palette, type: string): EventColors => c.events[type] ?? c.events.default;

type ThemeValue = { mode: ThemeMode; setMode: (m: ThemeMode) => void; scheme: Scheme; colors: Palette };

const ThemeContext = createContext<ThemeValue>({ mode: 'auto', setMode: () => {}, scheme: 'light', colors: light });

const PREF_KEY = 'theme_mode';

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('auto');
  const system = useColorScheme();

  useEffect(() => {
    getPref(PREF_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'auto') setModeState(v);
    });
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    setPref(PREF_KEY, m);
  }, []);

  // On native, also override the OS appearance for this app so system UI
  // (keyboard, alerts, status bar) matches. 'auto' removes the override.
  // Note: useColorScheme() then reports the override, so `system` follows it.
  useEffect(() => {
    if (Platform.OS !== 'web') Appearance.setColorScheme(mode);
  }, [mode]);

  const scheme: Scheme = mode === 'auto' ? (system === 'dark' ? 'dark' : 'light') : mode;

  // Web: native form controls and scrollbars follow the theme.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.colorScheme = scheme;
      document.body.style.backgroundColor = scheme === 'dark' ? dark.bg : light.bg;
    }
  }, [scheme]);

  const value = useMemo(() => ({ mode, setMode, scheme, colors: scheme === 'dark' ? dark : light }), [mode, setMode, scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useAppTheme = () => useContext(ThemeContext);

/** The style-map type StyleSheet.create accepts (RN 0.88 exposes no public alias for it). */
type StyleMap = Parameters<typeof StyleSheet.create>[0];

/**
 * Themed StyleSheet: `const useStyles = makeStyles((c) => ({ ... }))`, then
 * `const styles = useStyles()` inside a component. Cached per palette.
 * `S & StyleMap` mirrors StyleSheet.create so literals ('center', 'row'…) stay narrow.
 */
export function makeStyles<S extends StyleMap>(factory: (c: Palette) => S & StyleMap) {
  const cache = new Map<Palette, Readonly<S>>();
  return function useStyles(): Readonly<S> {
    const { colors } = useAppTheme();
    let styles = cache.get(colors);
    if (!styles) {
      styles = StyleSheet.create(factory(colors));
      cache.set(colors, styles);
    }
    return styles;
  };
}
