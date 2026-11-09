import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarSheet } from '../components/CalendarSheet';
import { Icon, type IconName } from '../components/Icon';
import { OptionSheet } from '../components/OptionSheet';
import { RoomTimeline } from '../components/RoomTimeline';
import { edt, UnauthorizedError, type Campus } from '../lib/edt';
import { normalizeSearch } from '../lib/events';
import { clearToken, getToken } from '../lib/session';
import { makeStyles, useAppTheme, type ThemeMode } from '../lib/theme';
import { addDays, dayLabel, shortDayLabel, todayKey } from '../lib/time';
import { useRoomEvents } from '../lib/useRoomEvents';

const ALL = '__all__';
const DEFAULT_CAMPUS = 'CERI';
const WIDE_BREAKPOINT = 768;

export default function Home() {
  const [token, setTokenState] = useState<string | null | undefined>(undefined);
  const [message, setMessage] = useState<string>();
  const styles = useStyles();

  // Re-read the token whenever the screen regains focus, e.g. after /login.
  useFocusEffect(
    useCallback(() => {
      getToken().then(setTokenState);
    }, []),
  );

  const logout = useCallback(async (msg?: string) => {
    await clearToken();
    setMessage(msg);
    setTokenState(null);
  }, []);

  if (token === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!token) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Beacon', headerShown: true, headerRight: () => <ThemeToggle /> }} />
        {message && <Text style={styles.muted}>{message}</Text>}
        <Pressable onPress={() => router.push('/login')} accessibilityRole="button" style={styles.primaryButton}>
          <Icon name="login-box-line" color="#fff" size={18} />
          <Text style={styles.primaryButtonText}>Se connecter</Text>
        </Pressable>
      </View>
    );
  }

  return <RoomsView token={token} onLogout={logout} />;
}

function RoomsView({ token, onLogout }: { token: string; onLogout: (msg?: string) => void }) {
  const [campuses, setCampuses] = useState<Campus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [campus, setCampus] = useState<string>(DEFAULT_CAMPUS);
  const [query, setQuery] = useState('');
  const [day, setDay] = useState(todayKey);
  // Time cursor in minutes since midnight; null = follow the current time.
  const [cursor, setCursor] = useState<number | null>(null);
  // Bumped to ask the timeline to scroll the cursor back into the centre.
  const [recenter, setRecenter] = useState(0);
  const [sheet, setSheet] = useState<'calendar' | 'campus' | null>(null);

  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors, scheme } = useAppTheme();

  const onUnauthorized = useCallback(() => onLogout('Session expirée, reconnectez-vous.'), [onLogout]);

  useEffect(() => {
    edt
      .getSalles(token)
      .then((list) => {
        setCampuses(list);
        if (!list.some((c) => c.letter === DEFAULT_CAMPUS)) setCampus(ALL);
      })
      .catch((e) => (e instanceof UnauthorizedError ? onUnauthorized() : setError(String(e))));
  }, [token, onUnauthorized]);

  const rooms = useMemo(() => {
    if (!campuses) return [];
    const q = normalizeSearch(query);
    return campuses
      .filter((c) => campus === ALL || c.letter === campus)
      .flatMap((c) => c.names)
      .filter((r) => !q || normalizeSearch(r.searchString).includes(q));
  }, [campuses, campus, query]);

  const codes = useMemo(() => rooms.map((r) => r.code), [rooms]);
  const { get, version, refresh } = useRoomEvents(token, codes, onUnauthorized);
  const loaded = codes.filter((c) => get(c) !== undefined).length;

  // LIVE = cursor follows the current time on today's timetable.
  const isLive = cursor === null && day === todayKey();
  const goLive = () => {
    setCursor(null);
    setDay(todayKey());
    setRecenter((n) => n + 1);
  };

  const campusOptions = [
    { value: ALL, label: 'Tous les campus', detail: String(campuses?.reduce((n, c) => n + c.names.length, 0) ?? '') },
    ...(campuses ?? []).map((c) => ({ value: c.letter, label: c.letter, detail: String(c.names.length) })),
  ];
  const campusLabel = campus === ALL ? 'Tous' : campus;

  const filterBar = (
    <View style={[styles.filterBar, wide ? styles.filterBarTop : styles.filterBarBottom]}>
      <View style={styles.search}>
        <Icon name="search-line" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={wide ? 'Rechercher une salle (ex. stat 6, amphi, C 129)…' : 'Rechercher une salle…'}
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          keyboardAppearance={scheme}
        />
        {!!query && (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Effacer la recherche"
          >
            <Icon name="close-circle-fill" size={18} color={colors.textFaint} />
          </Pressable>
        )}
      </View>
      <Pressable
        onPress={() => setSheet('campus')}
        accessibilityRole="button"
        accessibilityLabel={`Campus : ${campusLabel}`}
        style={styles.campusButton}
      >
        <Icon name="map-pin-2-line" size={16} color={colors.textSecondary} />
        <Text style={styles.campusText} numberOfLines={1}>
          {campusLabel}
        </Text>
        <Icon name="arrow-down-s-line" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* The native header overlapped the content on iOS; draw our own bar inside the safe area. */}
      <Stack.Screen options={{ headerShown: false, title: 'Salles' }} />

      {/* Top bar: day navigation (date opens a calendar), LIVE, actions */}
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + 8, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 },
        ]}
      >
        {wide && <Text style={styles.screenTitle}>Salles</Text>}
        <View style={styles.dayNav}>
          <Pressable
            onPress={() => setDay((d) => addDays(d, -1))}
            accessibilityRole="button"
            accessibilityLabel="Jour précédent"
            style={[styles.navButton, styles.navLeft]}
          >
            <Icon name="arrow-left-s-line" size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => setSheet('calendar')}
            accessibilityRole="button"
            accessibilityLabel={`${dayLabel(day)}, choisir une date`}
            style={styles.dateButton}
          >
            <Text style={styles.dateText} numberOfLines={1}>
              {wide ? dayLabel(day) : shortDayLabel(day)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setDay((d) => addDays(d, 1))}
            accessibilityRole="button"
            accessibilityLabel="Jour suivant"
            style={[styles.navButton, styles.navRight]}
          >
            <Icon name="arrow-right-s-line" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        <LiveButton live={isLive} onPress={goLive} />
        <View style={styles.actions}>
          <ThemeToggle />
          <IconButton icon="refresh-line" label="Recharger" onPress={refresh} />
          <IconButton icon="logout-box-r-line" label="Déconnexion" onPress={() => onLogout()} color={colors.danger} />
        </View>
      </View>

      {wide && filterBar}

      <View style={styles.flex}>
        {error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : !campuses ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : (
          <RoomTimeline
            rooms={rooms}
            day={day}
            getEvents={get}
            version={version}
            cursor={cursor}
            onCursorChange={setCursor}
            recenter={recenter}
          />
        )}
      </View>

      {!wide && filterBar}

      {/* Status line, always at the bottom */}
      <View
        style={[
          styles.statusBar,
          { paddingBottom: insets.bottom + 6, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 },
        ]}
      >
        <Text style={styles.muted}>
          {rooms.length} salle{rooms.length > 1 ? 's' : ''}
          {loaded < codes.length ? ` · chargement ${loaded}/${codes.length}…` : ''}
        </Text>
      </View>

      <CalendarSheet
        visible={sheet === 'calendar'}
        value={day}
        onClose={() => setSheet(null)}
        onSelect={(d) => {
          setDay(d);
          setSheet(null);
        }}
      />
      <OptionSheet
        visible={sheet === 'campus'}
        title="Campus"
        options={campusOptions}
        value={campus}
        onClose={() => setSheet(null)}
        onSelect={(c) => {
          setCampus(c);
          setSheet(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const THEME_CYCLE: Record<ThemeMode, { next: ThemeMode; icon: IconName; label: string }> = {
  auto: { next: 'light', icon: 'contrast-2-line', label: 'Thème : automatique' },
  light: { next: 'dark', icon: 'sun-line', label: 'Thème : clair' },
  dark: { next: 'auto', icon: 'moon-line', label: 'Thème : sombre' },
};

/** Cycles auto → light → dark. The icon shows the current mode. */
function ThemeToggle() {
  const { mode, setMode, colors } = useAppTheme();
  const t = THEME_CYCLE[mode];
  return (
    <IconButton
      icon={t.icon}
      label={`${t.label} (changer)`}
      onPress={() => setMode(t.next)}
      color={colors.textSecondary}
    />
  );
}

/** Bright red and inert while live; faded red (clickable) once the cursor or day has moved. */
function LiveButton({ live, onPress }: { live: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={live}
      accessibilityRole="button"
      accessibilityLabel={live ? 'En direct' : "Revenir à l'heure actuelle"}
      accessibilityState={{ disabled: live, selected: live }}
      style={({ pressed }) => [styles.live, !live && styles.liveIdle, pressed && styles.livePressed]}
    >
      <Icon name="record-circle-fill" size={14} color="#fff" />
      <Text style={styles.liveText}>LIVE</Text>
    </Pressable>
  );
}

function IconButton({ icon, label, onPress, color }: { icon: IconName; label: string; onPress: () => void; color?: string }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.iconButton}
    >
      <Icon name={icon} size={22} color={color ?? colors.primary} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16, backgroundColor: c.bg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.bg,
  },
  screenTitle: { fontSize: 20, fontWeight: '700', color: c.text, marginRight: 6 },
  dayNav: { flexDirection: 'row', alignItems: 'stretch', flexShrink: 1 },
  navButton: {
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bg,
  },
  navLeft: { borderTopLeftRadius: 999, borderBottomLeftRadius: 999, borderRightWidth: 0 },
  navRight: { borderTopRightRadius: 999, borderBottomRightRadius: 999, borderLeftWidth: 0 },
  dateButton: {
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
    flexShrink: 1,
  },
  dateText: { fontSize: 14, fontWeight: '600', color: c.text },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: c.live,
  },
  liveIdle: { opacity: 0.45 },
  livePressed: { opacity: 0.8 },
  liveText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  actions: { flexDirection: 'row', gap: 10, marginLeft: 'auto' },
  iconButton: { padding: 4 },

  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: c.bg,
  },
  filterBarTop: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  filterBarBottom: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 15, color: c.text },
  campusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 160,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
  },
  campusText: { fontSize: 14, color: c.text, flexShrink: 1 },

  statusBar: {
    paddingTop: 6,
    backgroundColor: c.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  muted: { color: c.textMuted, fontSize: 12 },
  error: { color: c.danger },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.moved,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
}));
