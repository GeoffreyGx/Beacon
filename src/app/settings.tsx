// "Réglages": theme and language, bus stops, Izly account, anonymous statistics (only in builds with a
// Beacon server), updates (Android), university account. The "Développement" section only
// exists in development builds (`__DEV__` is false and dropped in release).
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { reloadAppAsync } from 'expo';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OutlineButton, PrimaryButton, ThemePicker } from '../components/Buttons';
import { BusSettings } from '../components/BusSettings';
import { Icon } from '../components/Icon';
import { LanguagePicker } from '../components/LanguagePicker';
import { OptionSheet } from '../components/OptionSheet';
import { UpdateSettings } from '../components/UpdateSettings';
import { setDebugPanel, setTestAlerts, useDebug } from '../lib/debugOverride';
import { wipeAllData } from '../debug/wipe';
import { useSession } from '../lib/sessionContext';
import { BRAND, makeStyles, useAppTheme } from '../lib/theme';
import { LANGUAGE_NAMES, setForcedLang, t, useForcedLang, type Lang } from '../lib/i18n';
import { clearIzly, useIzlyLinked } from '../lib/izly';
import { setPayLockEnabled, usePayLockEnabled } from '../lib/payLock';
import { analyticsAvailable, setAnalyticsEnabled, useAnalyticsEnabled } from '../lib/analytics';
import { debugShowUpdatePrompt, updatesSupported } from '../lib/appUpdate';

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();
  const { panel, testAlerts } = useDebug();
  const forcedLang = useForcedLang();
  const izlyLinked = useIzlyLinked();
  const payLock = usePayLockEnabled();
  const analyticsEnabled = useAnalyticsEnabled();
  const [debugLangOpen, setDebugLangOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

  return (
    <ScrollView
      style={styles.flex}
      // The native header is translucent on iOS: inset the content below it.
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === 'ios' ? 0 : insets.bottom) + 24 }]}
    >
      <Section title={t('settings.appearance')}>
        <ThemePicker />
        <Text style={styles.label}>{t('settings.language')}</Text>
        <LanguagePicker />
      </Section>

      <Section>
        <BusSettings />
      </Section>

      <Section title={t('settings.izly')}>
        <View style={styles.row}>
          <Icon name="wallet-3-line" size={18} color={BRAND.izly} />
          <Text style={[styles.label, styles.flex1]}>{izlyLinked ? t('settings.izlyLinked') : t('settings.izlyNotLinked')}</Text>
        </View>
        {izlyLinked && (
          <View style={styles.row}>
            <Icon name="lock-line" size={18} color={colors.primary} />
            <View style={styles.flex1}>
              <Text style={styles.label}>{t('settings.payLock')}</Text>
              <Text style={styles.hint}>{t('settings.payLockHint')}</Text>
            </View>
            <Switch
              value={payLock ?? true}
              disabled={payLock === undefined}
              onValueChange={setPayLockEnabled}
              accessibilityLabel={t('settings.payLock')}
            />
          </View>
        )}
        {izlyLinked ? (
          <OutlineButton icon="logout-box-r-line" label={t('pay.signOut')} danger onPress={() => clearIzly()} />
        ) : (
          <PrimaryButton
            icon="login-box-line"
            label={t('pay.signIn')}
            color={BRAND.izly}
            onPress={() => router.push('/izly-login')}
          />
        )}
      </Section>

      {analyticsAvailable && (
        <Section title={t('settings.privacy')}>
          <View style={styles.row}>
            <Icon name="lock-line" size={18} color={colors.primary} />
            <View style={styles.flex1}>
              <Text style={styles.label}>{t('settings.analytics')}</Text>
              <Text style={styles.hint}>{t('settings.analyticsHint')}</Text>
            </View>
            <Switch
              value={analyticsEnabled ?? true}
              disabled={analyticsEnabled === undefined}
              onValueChange={setAnalyticsEnabled}
              accessibilityLabel={t('settings.analytics')}
            />
          </View>
        </Section>
      )}

      {updatesSupported && (
        <Section title={t('settings.updates')}>
          <UpdateSettings />
        </Section>
      )}

      <Section title={t('settings.account')}>
        <OutlineButton
          icon="logout-box-r-line"
          label={t('settings.signOut')}
          danger
          onPress={async () => {
            await signOut();
            router.dismissAll();
          }}
        />
      </Section>

      {__DEV__ && (
        <Section title={t('settings.dev')}>
          <View style={styles.row}>
            <Icon name="bug-line" size={18} color={colors.primary} />
            <View style={styles.flex1}>
              <Text style={styles.label}>{t('settings.debugPanel')}</Text>
              <Text style={styles.hint}>{t('settings.debugHint')}</Text>
            </View>
            <Switch value={panel} onValueChange={setDebugPanel} />
          </View>
          <View style={styles.row}>
            <Icon name="flask-line" size={18} color={colors.primary} />
            {/* Debug-only labels, not translated. */}
            <View style={styles.flex1}>
              <Text style={styles.label}>Afficher les alertes de test</Text>
              <Text style={styles.hint}>Alertes du serveur avec le style « test », masquées sinon.</Text>
            </View>
            <Switch value={testAlerts} onValueChange={setTestAlerts} />
          </View>
          <Pressable
            onPress={() => setDebugLangOpen(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Icon name="global-line" size={18} color={colors.primary} />
            <View style={styles.flex1}>
              <Text style={styles.label}>{t('settings.language')}</Text>
              <Text style={styles.hint}>{t('settings.debugLangHint')}</Text>
            </View>
            <Text style={styles.value} numberOfLines={1}>
              {forcedLang ? LANGUAGE_NAMES[forcedLang] : t('settings.languageSystem')}
            </Text>
            <Icon name="arrow-right-s-line" size={20} color={colors.textMuted} />
          </Pressable>
          <OptionSheet
            visible={debugLangOpen}
            title={t('settings.language')}
            options={[
              { value: 'system', label: t('settings.languageSystem') },
              ...(Object.keys(LANGUAGE_NAMES) as Lang[]).map((l) => ({ value: l, label: LANGUAGE_NAMES[l], detail: l })),
            ]}
            value={forcedLang ?? 'system'}
            onSelect={(v) => {
              setForcedLang(v === 'system' ? null : (v as Lang));
              setDebugLangOpen(false);
            }}
            onClose={() => setDebugLangOpen(false)}
          />
          {updatesSupported && (
            // Debug-only label, not translated.
            <OutlineButton icon="refresh-line" label="Afficher la popup de mise à jour" onPress={debugShowUpdatePrompt} />
          )}
          <Text style={styles.hint}>{t('settings.wipeHint')}</Text>
          {wiping ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <OutlineButton
              icon="delete-bin-line"
              label={t('settings.wipeData')}
              danger
              onPress={() =>
                Alert.alert(t('settings.wipeData'), t('settings.wipeConfirm'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('settings.wipeAction'),
                    style: 'destructive',
                    onPress: async () => {
                      setWiping(true);
                      const pending = await wipeAllData();
                      // Fresh start: in-memory state is dropped and the onboarding shows again.
                      const reload = () => reloadAppAsync('Dev: all data erased');
                      if (pending) Alert.alert(t('settings.wipeData'), t('settings.wipePending'), [{ text: 'OK', onPress: reload }]);
                      else reload();
                    },
                  },
                ])
              }
            />
          )}
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      {title && <Text style={styles.cardTitle}>{title}</Text>}
      {children}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  flex1: { flex: 1 },
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    borderRadius: 14,
    padding: 12,
    gap: 12,
    backgroundColor: c.bg,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: c.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontSize: 14, fontWeight: '600', color: c.text },
  hint: { fontSize: 12, color: c.textMuted },
  value: { fontSize: 14, color: c.textSecondary, maxWidth: 120 },
  pressed: { opacity: 0.6 },
}));
