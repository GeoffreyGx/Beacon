// Bus stop picker: every stop of the catalog (ORIZO, and ZOU! once loaded:
// lib/stopCatalog), searchable by stop or commune name (accent-, case- and
// space-insensitive), each with its commune and the lines serving it. `pinned`
// stops (home, campuses) come first, with their icon.
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { normalizeSearch } from '../lib/events';
import { t } from '../lib/i18n';
import type { CatalogStop } from '../lib/stopCatalog';
import { makeStyles, useAppTheme } from '../lib/theme';
import { Icon, type IconName } from './Icon';
import { Sheet } from './Sheet';

type Props = {
  visible: boolean;
  title: string;
  /** Selected stop key. */
  value: string | null;
  /** The stops (null while the timetable loads). */
  stops: CatalogStop[] | null;
  /** Timetable loading error, shown instead of the list. */
  error?: string | null;
  /** Shown above the list (more stops loading…). */
  note?: string | null;
  /** Adds a "None" entry (onSelect(null)). */
  allowNone?: boolean;
  /** Stops listed first (and not again below), with an icon and a spoken label. */
  pinned?: PinnedStop[];
  onSelect: (key: string | null) => void;
  onClose: () => void;
};

/** `name`: the stop key. */
export type PinnedStop = { name: string; icon: IconName; a11y: string };

export function StopPicker({ visible, onClose, ...props }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} avoidKeyboard>
      {/* Remount on open: the search starts empty each time. */}
      {visible && <StopList {...props} />}
    </Sheet>
  );
}

type Row = { stop: CatalogStop | null; pin?: PinnedStop };

/** "C3 · 04 · ZOU! 905". */
const linesLabel = (stop: CatalogStop) => stop.lines.map((l) => (l.network === 'zou' ? `ZOU! ${l.line}` : l.line)).join(' · ');

function StopList({ title, value, stops, error, note, allowNone, pinned, onSelect }: Omit<Props, 'visible' | 'onClose'>) {
  const styles = useStyles();
  const { colors, scheme } = useAppTheme();
  const [query, setQuery] = useState('');
  const searchable = useMemo(() => (stops ?? []).map((s) => ({ stop: s, text: normalizeSearch(`${s.name}${s.town ?? ''}`) })), [stops]);
  const rows = useMemo<Row[]>(() => {
    const q = normalizeSearch(query);
    const found = q ? searchable.filter((s) => s.text.includes(q)).map((s) => s.stop) : (stops ?? []);
    // Pinned stops that exist (and match the search), each once, then the rest.
    const top: Row[] = [];
    for (const pin of pinned ?? []) {
      const stop = found.find((s) => s.key === pin.name);
      if (stop && !top.some((row) => row.stop?.key === pin.name)) top.push({ stop, pin });
    }
    const rest = found.filter((s) => !top.some((row) => row.stop?.key === s.key)).map((stop) => ({ stop }));
    return [...(allowNone && !q ? [{ stop: null }] : []), ...top, ...rest];
  }, [stops, searchable, query, allowNone, pinned]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.search}>
        <Icon name="search-line" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder={t('bus.searchStop')}
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          keyboardAppearance={scheme}
          clearButtonMode="while-editing"
        />
      </View>
      {!!note && stops && (
        <View style={styles.note}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={styles.noteText}>{note}</Text>
        </View>
      )}
      {!stops ? (
        error ? (
          <Text style={styles.empty}>{t('bus.unavailable', { error })}</Text>
        ) : (
          <ActivityIndicator color={colors.textMuted} style={styles.spinner} />
        )
      ) : (
        <FlatList
          style={styles.list}
          data={rows}
          keyExtractor={(r) => r.stop?.key ?? '__none__'}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          ListEmptyComponent={<Text style={styles.empty}>{t('bus.noStop')}</Text>}
          renderItem={({ item }) => {
            const stop = item.stop;
            const selected = (stop?.key ?? null) === value;
            return (
              <Pressable
                onPress={() => onSelect(stop?.key ?? null)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={item.pin?.a11y ?? (stop?.town ? `${stop.name}, ${stop.town}` : undefined)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                {item.pin && <Icon name={item.pin.icon} size={18} color={selected ? colors.primary : colors.textSecondary} />}
                <View style={styles.label}>
                  <Text style={[styles.name, selected && styles.selectedName]} numberOfLines={1}>
                    {stop?.name ?? t('common.none')}
                    {!!stop?.town && <Text style={styles.town}> · {stop.town}</Text>}
                  </Text>
                  {!!stop?.lines.length && (
                    <Text style={styles.detail} numberOfLines={1}>
                      {linesLabel(stop)}
                    </Text>
                  )}
                </View>
                {selected && <Icon name="check-line" size={20} color={colors.primary} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  title: { fontSize: 16, fontWeight: '700', color: c.text, paddingHorizontal: 8, paddingBottom: 8 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 4,
    marginBottom: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: c.surfaceAlt,
  },
  input: { flex: 1, fontSize: 15, color: c.text, paddingVertical: 9 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 6 },
  noteText: { flexShrink: 1, fontSize: 12, color: c.textMuted },
  // Shrinks with the sheet when the keyboard is open.
  wrap: { flexShrink: 1 },
  list: { maxHeight: 420, flexShrink: 1 },
  spinner: { marginVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  pressed: { backgroundColor: c.pressed },
  label: { flex: 1 },
  name: { fontSize: 15, color: c.text },
  selectedName: { fontWeight: '700', color: c.primary },
  town: { fontSize: 13, fontWeight: '400', color: c.textMuted },
  detail: { fontSize: 12, color: c.textMuted },
  empty: { fontSize: 14, color: c.textMuted, textAlign: 'center', paddingVertical: 24 },
}));
