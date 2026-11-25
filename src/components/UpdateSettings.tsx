// Réglages → "Mises à jour" (Android only): automatic check switch, current version, manual check,
// download progress and install button. Logic in `src/lib/appUpdate.ts`.
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import { OutlineButton, PrimaryButton } from './Buttons';
import { Icon } from './Icon';
import {
  checkForUpdate,
  currentVersion,
  installUpdate,
  setAutoUpdateEnabled,
  useAutoUpdateEnabled,
  useUpdateStatus,
} from '../lib/appUpdate';
import { t } from '../lib/i18n';
import { makeStyles, useAppTheme } from '../lib/theme';

export function UpdateSettings() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const enabled = useAutoUpdateEnabled();
  const status = useUpdateStatus();

  const release = 'release' in status ? status.release : undefined;
  let line: string | null = null;
  if (status.kind === 'upToDate') line = t('settings.upToDate');
  else if (status.kind === 'error') line = release ? t('update.failed') : t('settings.updateFailed');
  else if (release) line = t('settings.updateAvailable', { version: release.version });

  return (
    <>
      <View style={styles.row}>
        <Icon name="refresh-line" size={18} color={colors.primary} />
        <View style={styles.flex1}>
          <Text style={styles.label}>{t('settings.autoUpdate')}</Text>
          <Text style={styles.hint}>{t('settings.autoUpdateHint')}</Text>
        </View>
        <Switch
          value={enabled ?? true}
          disabled={enabled === undefined}
          onValueChange={setAutoUpdateEnabled}
          accessibilityLabel={t('settings.autoUpdate')}
        />
      </View>
      <Text style={styles.hint}>
        {t('settings.currentVersion', { version: currentVersion })}
        {line ? ` · ${line}` : ''}
      </Text>
      {status.kind === 'checking' ? (
        <ActivityIndicator color={colors.primary} />
      ) : status.kind === 'downloading' ? (
        <View style={styles.progressBlock} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(status.progress * 100) }}>
          <Text style={styles.hint}>{t('settings.updateDownloading', { percent: Math.round(status.progress * 100) })}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${status.progress * 100}%`, backgroundColor: colors.primary }]} />
          </View>
        </View>
      ) : release ? (
        <PrimaryButton
          icon="check-line"
          label={t('settings.installUpdate', { version: release.version })}
          onPress={() => installUpdate(release)}
        />
      ) : (
        <OutlineButton icon="refresh-line" label={t('settings.checkUpdates')} onPress={() => checkForUpdate()} />
      )}
    </>
  );
}

const useStyles = makeStyles((c) => ({
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontSize: 14, fontWeight: '600', color: c.text },
  hint: { fontSize: 12, color: c.textMuted },
  progressBlock: { gap: 6 },
  track: { height: 6, borderRadius: 3, backgroundColor: c.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
}));
