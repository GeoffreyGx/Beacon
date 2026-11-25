// "Salles favorites": whether each pinned room is free now and in 1 h 30, with
// the time its state changes. Rooms are pinned with the star on the "Salles"
// tab; tapping the widget opens it.
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { Icon } from '../components/Icon';
import type { RoomEvent } from '../lib/edt';
import { t } from '../lib/i18n';
import { usePinnedRooms, type PinnedRoom } from '../lib/pinnedRooms';
import { useSession } from '../lib/sessionContext';
import { makeStyles, useAppTheme } from '../lib/theme';
import { formatMinutes, parisParts } from '../lib/time';
import { useNow } from '../lib/useLive';
import { useOnRefresh } from '../lib/refresh';
import { useRoomEvents, type RoomEventsState } from '../lib/useRoomEvents';

/** How far ahead the second column looks. */
const LATER_MS = 90 * 60_000;

const hhmm = (ms: number) => formatMinutes(parisParts(new Date(ms)).minutes);

type Slot = { busy: boolean; /** When the room's state changes, if the same day. */ until: number | null };

/** Busy / free at `at`, and until when (classes only; cancelled ones don't count). */
function slotAt(events: RoomEvent[], at: number): Slot {
  const spans = events
    .filter((e) => e.type !== 'Annulation')
    .map((e) => [Date.parse(e.start), Date.parse(e.end)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const day = parisParts(new Date(at)).day;
  const sameDay = (ms: number) => parisParts(new Date(ms)).day === day;

  const current = spans.find(([s, e]) => s <= at && at < e);
  if (current) {
    // Back-to-back classes: busy until the last one ends.
    let end = current[1];
    for (const [s, e] of spans) if (s <= end && e > end) end = e;
    return { busy: true, until: sameDay(end) ? end : null };
  }
  const next = spans.find(([s]) => s > at);
  return { busy: false, until: next && sameDay(next[0]) ? next[0] : null };
}

export function RoomsWidget() {
  const { token, expire } = useSession();
  const pinned = usePinnedRooms();
  const styles = useStyles();
  if (!token) return null;
  if (pinned.length === 0) {
    return (
      <Pressable onPress={() => router.navigate('/salles')} accessibilityRole="button" style={styles.empty}>
        <Text style={styles.emptyText}>{t('roomsWidget.empty')}</Text>
      </Pressable>
    );
  }
  return <PinnedRooms token={token} rooms={pinned} onUnauthorized={expire} />;
}

function PinnedRooms({ token, rooms, onUnauthorized }: { token: string; rooms: PinnedRoom[]; onUnauthorized: () => void }) {
  const styles = useStyles();
  const focused = useIsFocused();
  const now = useNow(30_000, focused);
  const codes = useMemo(() => rooms.map((r) => r.code), [rooms]);
  const { get, revalidate } = useRoomEvents(token, codes, onUnauthorized);
  useOnRefresh(revalidate);
  const later = now + LATER_MS;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.nameCol} />
        <Text style={styles.colTitle} accessibilityLabel={t('roomsWidget.now')}>
          {t('roomsWidget.colNow')}
        </Text>
        <Text style={styles.colTitle} accessibilityLabel={t('roomsWidget.at', { time: hhmm(later) })}>
          {t('roomsWidget.colNext')}
        </Text>
        <View style={styles.changeCol} />
      </View>
      {rooms.map((r, i) => (
        <RoomRow key={r.code} room={r} state={get(r.code)} now={now} later={later} divider={i > 0} />
      ))}
    </View>
  );
}

function RoomRow({
  room,
  state,
  now,
  later,
  divider,
}: {
  room: PinnedRoom;
  state: RoomEventsState;
  now: number;
  later: number;
  divider: boolean;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const slots = Array.isArray(state) ? [slotAt(state, now), slotAt(state, later)] : null;
  const describe = (s: Slot) =>
    `${s.busy ? t('rooms.busy') : t('rooms.free')}${s.until ? `, ${t(s.busy ? 'roomsWidget.freeAt' : 'roomsWidget.busyAt', { time: hhmm(s.until) })}` : ''}`;

  return (
    <Pressable
      onPress={() => router.navigate('/salles')}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}
      accessibilityLabel={
        slots
          ? `${room.name}: ${t('roomsWidget.now')} ${describe(slots[0])}; ${t('roomsWidget.at', { time: hhmm(later) })} ${describe(slots[1])}`
          : `${room.name}, ${state === 'error' ? t('rooms.loadError') : t('common.loading')}`
      }
    >
      <View style={[styles.nameCol, styles.nameRow]}>
        <Icon name="star-fill" size={12} color={colors.star} />
        <Text style={styles.name} numberOfLines={2}>
          {room.name}
        </Text>
      </View>
      {slots ? (
        <>
          <SlotCell slot={slots[0]} />
          <SlotCell slot={slots[1]} />
          <Text style={[styles.change, styles.changeCol]} numberOfLines={2}>
            {slots[1].until != null
              ? t(slots[1].busy ? 'roomsWidget.untilFree' : 'roomsWidget.untilBusy', { time: hhmm(slots[1].until) })
              : ''}
          </Text>
        </>
      ) : state === 'error' ? (
        <Text style={[styles.muted, styles.span]}>{t('rooms.loadError')}</Text>
      ) : (
        <View style={styles.span}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      )}
    </Pressable>
  );
}

/** ✓ free / ✕ busy (the row's accessibility label says it in words). */
function SlotCell({ slot }: { slot: Slot }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <View style={styles.cell}>
      <View style={[styles.badge, slot.busy ? styles.busy : styles.free]}>
        <Icon name={slot.busy ? 'close-line' : 'check-line'} size={14} color={slot.busy ? colors.busyText : colors.freeText} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { paddingHorizontal: 12, paddingVertical: 8 },
  empty: { padding: 12 },
  emptyText: { fontSize: 13, color: c.textMuted },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4 },
  colTitle: { width: 52, fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 0.3, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7 },
  divider: { borderTopWidth: 1, borderColor: c.border },
  pressed: { opacity: 0.6 },
  nameCol: { flex: 1.3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: c.text },
  cell: { width: 52, alignItems: 'center' },
  changeCol: { flex: 1 },
  change: { fontSize: 12, color: c.textMuted, fontVariant: ['tabular-nums'] },
  /** Loading / error message over both icon columns (2 × 52 + gap). */
  span: { width: 110, alignItems: 'center' },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  free: { backgroundColor: c.free },
  busy: { backgroundColor: c.busy },
  muted: { fontSize: 12, color: c.textMuted, textAlign: 'center' },
}));
