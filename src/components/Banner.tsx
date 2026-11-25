// Home screen banner shell (above the widgets): tinted card with an icon, a title, an optional close
// button and any content. Used by the app update banner and the server alerts (`AlertStack`).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { t } from '../lib/i18n';
import { makeStyles } from '../lib/theme';

export type BannerColors = { bg: string; border: string; text: string };

export function Banner({
  colors,
  icon,
  title,
  badge,
  onDismiss,
  children,
}: {
  colors: BannerColors;
  icon: IconName;
  title: string;
  /** Small pill before the close button (the stack's "+2"). */
  badge?: string;
  onDismiss?: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.banner, { backgroundColor: colors.bg, borderColor: colors.border }]} accessibilityRole="summary">
      <View style={styles.header}>
        <Icon name={icon} size={20} color={colors.text} />
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {badge && (
          <View style={[styles.badge, { borderColor: colors.border }]}>
            <Text style={[styles.badgeText, { color: colors.text }]}>{badge}</Text>
          </View>
        )}
        {onDismiss && (
          <Pressable
            onPress={onDismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('alerts.dismiss')}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Icon name="close-line" size={20} color={colors.text} />
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

/** Banner body text, in the banner's colour. */
export function BannerText({ color, children }: { color: string; children: ReactNode }) {
  const styles = useStyles();
  return <Text style={[styles.text, { color }]}>{children}</Text>;
}

const useStyles = makeStyles(() => ({
  banner: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', flexShrink: 1, flex: 1 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  close: { padding: 2, borderRadius: 999, marginVertical: -2 },
  pressed: { opacity: 0.6 },
  text: { fontSize: 14, opacity: 0.85 },
}));
