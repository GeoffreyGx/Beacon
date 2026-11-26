import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAlertsSync } from '../lib/alerts';
import { useAnalytics } from '../lib/analytics';
import { useAutoUpdate } from '../lib/appUpdate';
import { I18nProvider, t } from '../lib/i18n';
import { SessionProvider } from '../lib/sessionContext';
import { AppThemeProvider, useAppTheme } from '../lib/theme';

export default function RootLayout() {
  useAnalytics();
  useAutoUpdate();
  useAlertsSync();
  return (
    <I18nProvider>
      <AppThemeProvider>
        <SessionProvider>
          <ThemedStack />
        </SessionProvider>
      </AppThemeProvider>
    </I18nProvider>
  );
}

function ThemedStack() {
  const { scheme, colors } = useAppTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  // Navigation theme drives native headers, the tab bar and screen backgrounds.
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.bg,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Beacon' }} />
        <Stack.Screen name="login" options={{ title: t('nav.login') }} />
        <Stack.Screen name="izly-login" options={{ title: t('nav.izlyLogin') }} />
        <Stack.Screen name="card" options={{ title: t('nav.card') }} />
        <Stack.Screen name="trip" options={{ title: t('nav.trip') }} />
        <Stack.Screen name="settings" options={{ title: t('nav.settings') }} />
      </Stack>
    </ThemeProvider>
  );
}
