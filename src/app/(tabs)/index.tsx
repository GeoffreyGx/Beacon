// "Accueil": contextual header (now bar), the alerts (server alerts + Android update), the student card,
// widgets, and at the bottom the widget editor and the settings button. The now bar stays pinned at the
// top; the rest scrolls, and pulling it down refreshes everything on the screen (`src/lib/refresh.ts`).
// In development builds a debug panel can be shown at the top to fake now-bar scenarios.
import { useState, type ComponentType } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { AlertStack } from '../../components/AlertStack';
import { NowBar } from '../../components/NowBar';
import { useDebug } from '../../lib/debugOverride';
import { refreshAll } from '../../lib/refresh';
import { makeStyles, useAppTheme } from '../../lib/theme';
import { WIDGETS, widgetById } from '../../widgets/registry';
import { useWidgetLayout } from '../../widgets/useWidgetLayout';
import { t } from '../../lib/i18n';

// Development only: `__DEV__` is false in release bundles, where Metro drops
// this branch (and so the debug module) before resolving dependencies.
const DebugPanel: ComponentType | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../debug/DebugPanel').DebugPanel
  : null;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useAppTheme();
  const { ids, add, remove, move } = useWidgetLayout();
  const [editing, setEditing] = useState(false);
  const focused = useIsFocused();
  const { panel: debugPanel } = useDebug();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    refreshAll().finally(() => setRefreshing(false));
  };

  const available = WIDGETS.filter((w) => !ids.includes(w.id));
  const side = { paddingLeft: insets.left + 16, paddingRight: insets.right + 16 };

  return (
    <View style={styles.flex}>
      {/* Every header background is dark: light status bar text, only while this tab is shown. */}
      {focused && <StatusBar style="light" />}
      <NowBar focused={focused} insets={insets} />
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
            colors={[colors.primary]}
            progressBackgroundColor={colors.bg}
          />
        }
      >
        <View style={[styles.content, side]}>
          {DebugPanel && debugPanel && <DebugPanel />}
          <AlertStack />

          <Pressable
            onPress={() => router.push('/card')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.card, styles.addRow, pressed && styles.pressed]}
          >
            <Icon name="id-card-line" size={22} color={colors.primary} />
            <View style={styles.flexShrink}>
              <Text style={styles.addTitle}>{t('home.card.title')}</Text>
              <Text style={styles.hint}>{t('home.card.hint')}</Text>
            </View>
            <Icon name="arrow-right-s-line" size={22} color={colors.textMuted} />
          </Pressable>

          {/* Widgets */}
          {ids.map((id, index) => {
            const w = widgetById(id);
            if (!w) return null;
            return (
              <View key={id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name={w.icon} size={18} color={colors.primary} />
                  <Text style={styles.cardTitle}>{w.title()}</Text>
                  {editing && (
                    <View style={styles.cardActions}>
                      <SmallButton icon="arrow-up-s-line" label={t('home.widget.up')} disabled={index === 0} onPress={() => move(id, -1)} />
                      <SmallButton
                        icon="arrow-down-s-line"
                        label={t('home.widget.down')}
                        disabled={index === ids.length - 1}
                        onPress={() => move(id, 1)}
                      />
                      <SmallButton icon="close-line" label={t('home.widget.remove', { title: w.title() })} danger onPress={() => remove(id)} />
                    </View>
                  )}
                </View>
                <w.Component />
              </View>
            );
          })}

          {ids.length === 0 && !editing && (
            <Text style={styles.hint}>{t('home.widget.empty')}</Text>
          )}

          {editing && (
            <View style={styles.card}>
              <Text style={[styles.cardTitle, styles.sectionPad]}>{t('home.widget.addTitle')}</Text>
              {available.length === 0 ? (
                <Text style={[styles.hint, styles.sectionPad]}>{t('home.widget.allShown')}</Text>
              ) : (
                available.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => add(w.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.widget.add', { title: w.title() })}
                    style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
                  >
                    <Icon name={w.icon} size={20} color={colors.primary} />
                    <View style={styles.flexShrink}>
                      <Text style={styles.addTitle}>{w.title()}</Text>
                      <Text style={styles.hint}>{w.description()}</Text>
                    </View>
                    <Icon name="add-line" size={22} color={colors.primary} />
                  </Pressable>
                ))
              )}
            </View>
          )}

          <View style={styles.footer}>
            <Pressable
              onPress={() => setEditing((e) => !e)}
              accessibilityRole="button"
              accessibilityLabel={editing ? t('home.doneA11y') : t('home.editA11y')}
              style={[styles.footerButton, editing && styles.footerButtonActive]}
            >
              <Icon name={editing ? 'check-line' : 'pencil-line'} size={18} color={editing ? colors.inverseText : colors.textSecondary} />
              <Text style={[styles.footerText, editing && styles.footerTextActive]}>{editing ? t('home.done') : t('home.edit')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.footerButton, pressed && styles.pressed]}
            >
              <Icon name="settings-3-line" size={18} color={colors.textSecondary} />
              <Text style={styles.footerText}>{t('home.settings')}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SmallButton({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: 'arrow-up-s-line' | 'arrow-down-s-line' | 'close-line';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.smallButton, disabled && styles.disabled]}
    >
      <Icon name={icon} size={18} color={danger ? colors.danger : colors.textSecondary} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  flexShrink: { flexShrink: 1, flex: 1 },
  content: { gap: 14, paddingTop: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    borderRadius: 14,
    backgroundColor: c.bg,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: c.surfaceAlt,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: c.text, flexShrink: 1 },
  cardActions: { flexDirection: 'row', gap: 4, marginLeft: 'auto' },
  smallButton: { padding: 4, borderRadius: 6 },
  disabled: { opacity: 0.3 },
  sectionPad: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  addTitle: { fontSize: 14, fontWeight: '600', color: c.text },
  pressed: { backgroundColor: c.pressed },
  hint: { fontSize: 13, color: c.textMuted },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 4 },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
  },
  footerButtonActive: { backgroundColor: c.inverseBg, borderColor: c.inverseBg },
  footerText: { fontSize: 14, color: c.textSecondary },
  footerTextActive: { color: c.inverseText, fontWeight: '600' },
}));
