// Light/dark theming. Mode is 'auto' (follow the device), 'light' or 'dark',
// persisted per device. Works the same on web and native via useColorScheme().
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform, StyleSheet, useColorScheme } from 'react-native';
import { getPref, setPref } from './prefs';

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
  live: '#ef4444',
  moved: '#2563eb',
  preview: 'rgba(37, 99, 235, 0.35)',
  backdrop: 'rgba(17, 24, 39, 0.35)',
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

const dark: Palette = {
  bg: '#0f172a',
  surfaceAlt: '#1e293b',
  pressed: '#1e293b',
  border: '#334155',
  borderStrong: '#475569',
  text: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textFaint: '#64748b',
  primary: '#60a5fa',
  danger: '#f87171',
  inverseBg: '#f1f5f9',
  inverseText: '#0f172a',
  gridLine: '#1e293b',
  hourLine: '#334155',
  free: '#14532d',
  busy: '#7f1d1d',
  live: '#ef4444',
  moved: '#3b82f6',
  preview: 'rgba(96, 165, 250, 0.4)',
  backdrop: 'rgba(0, 0, 0, 0.6)',
  events: {
    CM: { bg: '#1e3a8a', border: '#60a5fa', text: '#dbeafe' },
    TD: { bg: '#14532d', border: '#4ade80', text: '#dcfce7' },
    TP: { bg: '#4c1d95', border: '#a78bfa', text: '#ede9fe' },
    Evaluation: { bg: '#7c2d12', border: '#fb923c', text: '#ffedd5' },
    Annulation: { bg: '#1e293b', border: '#64748b', text: '#94a3b8' },
    default: { bg: '#0c4a6e', border: '#38bdf8', text: '#e0f2fe' },
  },
};

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
