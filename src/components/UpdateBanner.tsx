// Home screen, above the widgets: "Beacon X is available" with Later / Update, then the download
// progress, then a retry button if it failed. Shown by the automatic check (`src/lib/appUpdate.ts`);
// renders nothing otherwise. Part of the home alert stack (`AlertStack`), in the info colours.
import { Pressable, Text, View } from 'react-native';
import { Banner, BannerText } from './Banner';
import { dismissUpdateBanner, installUpdate, useUpdateBanner } from '../lib/appUpdate';
import { t } from '../lib/i18n';
import { makeStyles, useAppTheme } from '../lib/theme';

export function UpdateBanner({ badge }: { badge?: string }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const banner = useUpdateBanner();
  if (!banner) return null;
  const { status, release } = banner;
  const downloading = status.kind === 'downloading';
  const percent = downloading ? Math.round(status.progress * 100) : 0;
  const tint = { bg: colors.infoBg, border: colors.infoBorder, text: colors.infoText };

  return (
    <Banner colors={tint} icon="refresh-line" title={t('update.title')} badge={badge}>
      <BannerText color={tint.text}>
        {status.kind === 'error'
          ? t('update.failed')
          : t('update.message', { version: release.version, size: Math.max(1, Math.round(release.size / 1e6)) })}
      </BannerText>
      {downloading ? (
        <View style={styles.progressBlock} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
          <BannerText color={tint.text}>{t('settings.updateDownloading', { percent })}</BannerText>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${status.progress * 100}%` }]} />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable
            onPress={dismissUpdateBanner}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>{t('update.later')}</Text>
          </Pressable>
          <Pressable
            onPress={() => installUpdate(release)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>{t('update.install')}</Text>
          </Pressable>
        </View>
      )}
    </Banner>
  );
}

const useStyles = makeStyles((c) => ({
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  button: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  secondary: { borderWidth: 1, borderColor: c.infoBorder },
  secondaryText: { fontSize: 14, fontWeight: '600', color: c.infoText },
  primary: { backgroundColor: c.infoButton },
  primaryText: { fontSize: 14, fontWeight: '700', color: c.onInfoButton },
  pressed: { opacity: 0.7 },
  progressBlock: { gap: 6 },
  track: { height: 6, borderRadius: 3, backgroundColor: c.infoBorder, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: c.infoButton },
}));
