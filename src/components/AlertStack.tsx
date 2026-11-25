// Top of the home screen: the server alerts (`src/lib/alerts.ts`) and the app update banner, sorted
// most important first: major, blockade, maintenance, app update, normal, test. Several of them are
// stacked: the first one is shown with the next ones peeking out below it and a "+N" badge; tapping
// it expands the whole list ("Réduire" folds it back). Renders nothing when there is nothing to show.
import { useState, type ReactNode } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import { Banner, BannerText, type BannerColors } from './Banner';
import { Icon, type IconName } from './Icon';
import { UpdateBanner } from './UpdateBanner';
import { dismissAlert, localized, refreshAlerts, useVisibleAlerts, type Alert, type AlertStyle } from '../lib/alerts';
import { refreshUpdate, useUpdateBanner } from '../lib/appUpdate';
import { t } from '../lib/i18n';
import { useOnRefresh } from '../lib/refresh';
import { makeStyles, useAppTheme } from '../lib/theme';

const ICONS: Record<AlertStyle, IconName> = {
  major: 'alert-line',
  blockade: 'barricade-line',
  maintenance: 'hammer-line',
  normal: 'information-line',
  test: 'flask-line',
};

/** Cards drawn under the collapsed stack. */
const MAX_PEEKS = 2;

type Item = { key: string; colors: BannerColors; render: (badge?: string) => ReactNode };

function ServerAlert({ alert, colors, badge }: { alert: Alert; colors: BannerColors; badge?: string }) {
  const styles = useStyles();
  return (
    <Banner
      colors={colors}
      icon={ICONS[alert.style]}
      title={localized(alert.title)}
      badge={badge}
      onDismiss={alert.dismissible ? () => dismissAlert(alert.key) : undefined}
    >
      <BannerText color={colors.text}>{localized(alert.content)}</BannerText>
      {alert.unverified && <Text style={styles.unverified}>{t('alerts.unverified')}</Text>}
    </Banner>
  );
}

export function AlertStack() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const alerts = useVisibleAlerts();
  const update = useUpdateBanner();
  const [expanded, setExpanded] = useState(false);
  useOnRefresh(() => Promise.all([refreshAlerts(), refreshUpdate()]));

  const serverItem = (a: Alert): Item => ({
    key: a.key,
    colors: colors.alerts[a.style],
    render: (badge) => <ServerAlert key={a.key} alert={a} colors={colors.alerts[a.style]} badge={badge} />,
  });
  // Alerts come sorted by importance; the app update goes after the maintenance ones.
  const urgent = alerts.filter((a) => a.style === 'major' || a.style === 'blockade' || a.style === 'maintenance');
  const items: Item[] = [
    ...urgent.map(serverItem),
    ...(update
      ? [
          {
            key: 'app-update',
            colors: { bg: colors.infoBg, border: colors.infoBorder, text: colors.infoText },
            render: (badge?: string) => <UpdateBanner key="app-update" badge={badge} />,
          },
        ]
      : []),
    ...alerts.filter((a) => !urgent.includes(a)).map(serverItem),
  ];

  if (items.length === 0) return null;

  const toggle = (next: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(next);
  };

  if (items.length === 1) return <>{items[0].render()}</>;

  if (expanded) {
    return (
      <View style={styles.list}>
        {items.map((item) => item.render())}
        <Pressable
          onPress={() => toggle(false)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.collapse, pressed && styles.pressed]}
        >
          <Icon name="arrow-up-s-line" size={18} color={colors.textSecondary} />
          <Text style={styles.collapseText}>{t('alerts.collapse')}</Text>
        </Pressable>
      </View>
    );
  }

  const [top, ...others] = items;
  return (
    <Pressable
      onPress={() => toggle(true)}
      accessibilityRole="button"
      accessibilityHint={t('alerts.expandHint', { count: items.length })}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {top.render(`+${others.length}`)}
      {others.slice(0, MAX_PEEKS).map((item, i) => (
        <View
          key={item.key}
          style={[
            styles.peek,
            { marginHorizontal: 10 * (i + 1), backgroundColor: item.colors.bg, borderColor: item.colors.border },
          ]}
        />
      ))}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  list: { gap: 10 },
  unverified: { fontSize: 12, fontStyle: 'italic', color: c.textMuted },
  peek: {
    height: 8,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  pressed: { opacity: 0.85 },
  collapse: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
  },
  collapseText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
}));
