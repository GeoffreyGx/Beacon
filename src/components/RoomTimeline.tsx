// Roadmap-style grid: one row per room, one column per 30 minutes.
//
// Layout:
//   vertical ScrollView (time header is sticky at the top)
//   ├─ header row:  [corner] [time labels, translated to follow the grid's horizontal scroll]
//   └─ body row:    [room names column, fixed] [horizontal ScrollView → grid]
//
// Time cursor: shows "now" (red) until moved (blue). It is moved by dragging
// in the hours row, tapping the grid, or (web) clicking, with a hover preview.
// Room name cells are green/red depending on availability at the cursor.
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import type { RoomEvent, Salle } from '../lib/edt';
import { placeEvents, type PlacedEvent } from '../lib/events';
import { formatMinutes, parisParts, todayKey } from '../lib/time';
import { eventColors, makeStyles, useAppTheme } from '../lib/theme';
import type { RoomEventsState } from '../lib/useRoomEvents';

export const DAY_START = 8 * 60;
export const DAY_END = 20 * 60;
const SLOT_MIN = 30;
const SLOTS = (DAY_END - DAY_START) / SLOT_MIN;
const SNAP_MIN = 5;
const MIN_SLOT_W = 36;
const LANE_H = 38;
const ROW_PAD = 4;
const HEADER_H = 28;
const IS_WEB = Platform.OS === 'web';

type Props = {
  rooms: Salle[];
  day: string;
  getEvents: (code: string) => RoomEventsState;
  version: number; // changes whenever new room data arrives
  /** Minutes since midnight chosen by the user, or null to follow the current time. */
  cursor: number | null;
  onCursorChange: (minutes: number) => void;
  /** Change this value to scroll the cursor back to the centre (animated). */
  recenter: number;
};

type RowLayout = { room: Salle; state: RoomEventsState; placed: PlacedEvent[]; height: number };

// Per-room, per-day layout cache keyed on the events array (a refetch yields a new array).
const layoutCache = new WeakMap<RoomEvent[], Map<string, { placed: PlacedEvent[]; lanes: number }>>();

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function useNowMinutes() {
  const [now, setNow] = useState(() => parisParts(new Date()).minutes);
  useEffect(() => {
    const id = setInterval(() => setNow(parisParts(new Date()).minutes), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** True if a (non-cancelled) class occupies the room at `minute`. */
const isOccupied = (placed: PlacedEvent[], minute: number) =>
  placed.some((p) => p.event.type !== 'Annulation' && p.startMin <= minute && minute < p.endMin);

/** Web pointer events expose clientX (same space as measureInWindow); native responder events expose pageX. */
const eventX = (e: { nativeEvent: object }) => {
  const n = e.nativeEvent as { clientX?: number; pageX?: number };
  return n.clientX ?? n.pageX ?? 0;
};

export function RoomTimeline({ rooms, day, getEvents, version, cursor, onCursorChange, recenter }: Props) {
  const { width } = useWindowDimensions();
  const nameW = width < 600 ? 112 : 170;
  const slotW = Math.max(MIN_SLOT_W, Math.floor((width - nameW - 2) / SLOTS));
  const gridW = slotW * SLOTS;
  const toX = (min: number) => ((min - DAY_START) / SLOT_MIN) * slotW;
  const { colors } = useAppTheme();
  const styles = useStyles();

  // Effective cursor: the user's choice, else the current time (clamped to the grid).
  const now = useNowMinutes();
  const isLive = cursor === null && day === todayKey() && now >= DAY_START && now < DAY_END;
  const at = cursor ?? clamp(now, DAY_START, DAY_END - 1);
  const cursorColor = isLive ? colors.live : colors.moved;
  const [preview, setPreview] = useState<number | null>(null); // web hover only

  // Window-x of the timeline viewport and the grid's horizontal scroll offset,
  // used to convert a touch/pointer position into minutes.
  const viewportRef = useRef<ComponentRef<typeof View>>(null);
  const viewportX = useRef(0);
  const scrollOffset = useRef(0);
  const measureViewport = () =>
    viewportRef.current?.measureInWindow((x) => {
      viewportX.current = x;
    });
  const minutesAt = (windowX: number) => {
    const raw = DAY_START + ((windowX - viewportX.current + scrollOffset.current) / slotW) * SLOT_MIN;
    return clamp(Math.round(raw / SNAP_MIN) * SNAP_MIN, DAY_START, DAY_END - SNAP_MIN);
  };

  // Horizontal scroll offset of the grid, mirrored onto the time header.
  const [scrollX] = useState(() => new Animated.Value(0));
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: !IS_WEB }),
    [scrollX],
  );
  // Mirror the (natively driven) offset into JS for touch → minutes conversion.
  useEffect(() => {
    const id = scrollX.addListener(({ value }) => {
      scrollOffset.current = value;
    });
    return () => scrollX.removeListener(id);
  }, [scrollX]);

  const rows: RowLayout[] = useMemo(
    () =>
      rooms.map((room) => {
        const state = getEvents(room.code);
        let placed: PlacedEvent[] = [];
        let lanes = 1;
        if (Array.isArray(state)) {
          let byDay = layoutCache.get(state);
          if (!byDay) layoutCache.set(state, (byDay = new Map()));
          let layout = byDay.get(day);
          if (!layout) byDay.set(day, (layout = placeEvents(state, day, DAY_START, DAY_END)));
          ({ placed, lanes } = layout);
        }
        return { room, state, placed, height: lanes * LANE_H + ROW_PAD * 2 };
      }),
    // `version` signals that getEvents() has new data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rooms, day, version, getEvents],
  );

  // Centre the cursor horizontally when the grid first appears (and whenever
  // `recenter` changes). Clamped so we never scroll past either edge, which
  // gives "as close to centred as possible" near 08:00 / 20:00.
  const gridScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [viewportW, setViewportW] = useState(0);
  const hasRooms = rooms.length > 0;
  useEffect(() => {
    if (!viewportW || !hasRooms) return;
    const x = clamp(toX(at) - viewportW / 2, 0, Math.max(0, gridW - viewportW));
    gridScrollRef.current?.scrollTo({ x, animated: recenter > 0 });
    // Only on mount / explicit recenter / viewport resize, not while the cursor moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenter, viewportW, gridW, hasRooms]);

  if (rooms.length === 0) return <Text style={styles.empty}>Aucune salle ne correspond aux filtres.</Text>;

  // Web: hover preview.
  const hoverProps = IS_WEB
    ? {
        onPointerMove: (e: { nativeEvent: object }) => setPreview(minutesAt(eventX(e))),
        onPointerLeave: () => setPreview(null),
      }
    : {};

  // Hours row: drag (any platform) to move the cursor.
  const dragProps = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => onCursorChange(minutesAt(eventX(e))),
    onResponderMove: (e: GestureResponderEvent) => onCursorChange(minutesAt(eventX(e))),
  };

  const cursorLine = (min: number, color: string, key: string) => (
    <View key={key} pointerEvents="none" style={[styles.cursorLine, { left: toX(min) - 1, backgroundColor: color }]} />
  );

  return (
    <ScrollView stickyHeaderIndices={[0]} style={styles.flex}>
      {/* Sticky time header. The extra wrapper matters: on native, ScrollView
          replaces a sticky child's own style with {flex: 1}, which would drop
          flexDirection: 'row' and stack the corner above the hour labels. */}
      <View>
        <View style={[styles.flexRow, styles.header]}>
          <View style={[styles.nameCell, { width: nameW, height: HEADER_H }]}>
            <Text style={styles.headerText} maxFontSizeMultiplier={1.2}>
              Salle
            </Text>
          </View>
          <View
            ref={viewportRef}
            onLayout={measureViewport}
            style={styles.headerClip}
            accessibilityLabel="Glisser pour déplacer le curseur horaire"
            {...dragProps}
            {...hoverProps}
          >
            <Animated.View
              pointerEvents="none"
              style={{ width: gridW, height: HEADER_H, transform: [{ translateX: Animated.multiply(scrollX, -1) }] }}
            >
              {Array.from({ length: SLOTS / 2 }, (_, h) => (
                <View key={h} style={[styles.hourLabel, { left: h * 2 * slotW, width: 2 * slotW }]}>
                  <Text style={styles.headerText} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                    {formatMinutes(DAY_START + h * 60)}
                  </Text>
                </View>
              ))}
              {preview !== null && cursorLine(preview, colors.preview, 'preview')}
              {/* Time pill on the cursor, acting as the drag handle. */}
              <View style={[styles.cursorPill, { left: toX(at) - 24, backgroundColor: cursorColor }]}>
                <Text style={styles.cursorPillText} maxFontSizeMultiplier={1.1}>
                  {formatMinutes(at)}
                </Text>
              </View>
            </Animated.View>
          </View>
        </View>
      </View>

      <View style={styles.flexRow}>
        {/* Fixed room names column, coloured by availability at the cursor */}
        <View style={[styles.namesColumn, { width: nameW }]}>
          {rows.map(({ room, state, placed, height }) => {
            const status = Array.isArray(state) ? (isOccupied(placed, at) ? 'busy' : 'free') : null;
            return (
              <View
                key={room.code}
                style={[
                  styles.nameCell,
                  styles.rowBorder,
                  { width: nameW, height },
                  status === 'busy' && styles.busy,
                  status === 'free' && styles.free,
                ]}
                accessibilityLabel={`${room.name}, ${status === 'busy' ? 'occupée' : status === 'free' ? 'libre' : 'chargement'}`}
              >
                <Text style={styles.roomName} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                  {room.name}
                </Text>
                <Text style={styles.roomCode} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {state === 'error' ? 'Erreur de chargement' : room.code}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Horizontally scrollable grid. Tap/click anywhere to place the cursor. */}
        <Animated.ScrollView
          ref={gridScrollRef}
          onLayout={(e) => setViewportW(e.nativeEvent.layout.width)}
          horizontal
          style={styles.flex}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          bounces={false}
        >
          <Pressable
            style={[{ width: gridW }, IS_WEB && styles.pointer]}
            onPress={(e) => onCursorChange(minutesAt(eventX(e)))}
            accessibilityLabel="Placer le curseur horaire"
            {...hoverProps}
          >
            {/* Grid lines drawn once for the whole grid */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {Array.from({ length: SLOTS }, (_, i) => (
                <View key={i} style={[styles.gridLine, { left: i * slotW }, i % 2 === 0 && styles.hourLine]} />
              ))}
            </View>
            {rows.map(({ room, state, placed, height }) => (
              <View key={room.code} style={[styles.rowBorder, { height }]} pointerEvents="none">
                {state === undefined && <ActivityIndicator size="small" color={colors.textMuted} style={styles.rowSpinner} />}
                {placed.map((p, i) => (
                  <EventBar key={i} p={p} slotW={slotW} />
                ))}
              </View>
            ))}
            {preview !== null && cursorLine(preview, colors.preview, 'preview')}
            {cursorLine(at, cursorColor, 'cursor')}
          </Pressable>
        </Animated.ScrollView>
      </View>
    </ScrollView>
  );
}

function EventBar({ p, slotW }: { p: PlacedEvent; slotW: number }) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const c = eventColors(colors, p.event.type);
  const cancelled = p.event.type === 'Annulation';
  const left = ((p.startMin - DAY_START) / SLOT_MIN) * slotW;
  const w = ((p.endMin - p.startMin) / SLOT_MIN) * slotW;
  return (
    <View
      style={[
        styles.bar,
        { left: left + 1, width: w - 2, top: ROW_PAD + p.lane * LANE_H, backgroundColor: c.bg, borderLeftColor: c.border },
      ]}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        style={[styles.barTitle, { color: c.text }, cancelled && styles.cancelled]}
      >
        {p.event.type ? `${p.event.type} · ` : ''}
        {p.label}
      </Text>
      {!!p.sublabel && (
        <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.barSub, { color: c.text }]}>
          {p.sublabel}
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1 },
  flexRow: { flexDirection: 'row', backgroundColor: c.bg },
  header: { backgroundColor: c.surfaceAlt, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong },
  headerClip: { flex: 1, overflow: 'hidden' },
  pointer: { cursor: 'pointer' },
  hourLabel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingLeft: 4,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderColor: c.borderStrong,
  },
  headerText: { fontSize: 11, fontWeight: '600', color: c.textSecondary },
  namesColumn: { borderRightWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.bg, zIndex: 1 },
  nameCell: { paddingHorizontal: 8, justifyContent: 'center' },
  free: { backgroundColor: c.free },
  busy: { backgroundColor: c.busy },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  roomName: { fontSize: 12, fontWeight: '600', color: c.text },
  roomCode: { fontSize: 10, color: c.textMuted },
  gridLine: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: c.gridLine },
  hourLine: { backgroundColor: c.hourLine },
  cursorLine: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  cursorPill: {
    position: 'absolute',
    top: 4,
    width: 48,
    height: HEADER_H - 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cursorPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rowSpinner: { position: 'absolute', left: 8, top: 0, bottom: 0 },
  bar: {
    position: 'absolute',
    height: LANE_H - 4,
    borderRadius: 4,
    borderLeftWidth: 3,
    paddingHorizontal: 5,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  barTitle: { fontSize: 11, fontWeight: '600' },
  barSub: { fontSize: 10, opacity: 0.85 },
  cancelled: { textDecorationLine: 'line-through' },
  empty: { padding: 24, color: c.textMuted },
}));
