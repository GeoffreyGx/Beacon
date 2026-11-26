// "Trajet": the full trip opened from a summary of the Bus widget: departure and
// arrival, then every step — the vehicles (line, direction, boarding and alighting
// stops and times, number of stops), the walks and the transfers with their wait.
import { Fragment, type ReactNode } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { LineBadge } from '../components/LineBadge';
import { intlLocale, t, tn } from '../lib/i18n';
import type { RideLeg } from '../lib/journey';
import { BRAND, makeStyles, useAppTheme } from '../lib/theme';
import { formatDuration, formatTime } from '../lib/time';
import { useOpenedTrip } from '../lib/tripStore';

/** "450 m" / "1,2 km". */
const formatDistance = (m: number) =>
  m < 1000 ? `${m} m` : `${new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 }).format(m / 1000)} km`;

export default function TripScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const trip = useOpenedTrip();

  if (!trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('trip.missing')}</Text>
      </View>
    );
  }
  const { journey, from, to } = trip;
  const rides = journey.legs.filter((l): l is RideLeg => l.kind === 'ride');

  return (
    <ScrollView
      style={styles.flex}
      // The native header is translucent on iOS: inset the content below it.
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === 'ios' ? 0 : insets.bottom) + 24 }]}
    >
      <View style={styles.header}>
        <Text style={styles.times}>
          {formatTime(journey.departure)} → {formatTime(journey.arrival)}
        </Text>
        <Text style={styles.duration}>{formatDuration(journey.arrival - journey.departure)}</Text>
      </View>
      <Text style={styles.muted}>
        {rides.length === 0
          ? t('bus.trip.walk')
          : rides.length === 1
            ? t('bus.trip.direct')
            : tn('bus.trip.transfers', rides.length - 1)}
      </Text>

      <View style={styles.steps}>
        <Step time={formatTime(journey.departure)} icon="map-pin-2-line" strong>
          {t('trip.leave', { place: from })}
        </Step>
        {journey.legs.map((leg, i) => {
          if (leg.kind === 'walk') {
            const place = leg.to?.name ?? to;
            return (
              <Step key={i} icon="walk-line" muted>
                {t('trip.walkTo', { distance: formatDistance(leg.distance), duration: formatDuration(leg.end - leg.start), place })}
              </Step>
            );
          }
          const previousRide = journey.legs.slice(0, i).some((l) => l.kind === 'ride');
          return (
            <Fragment key={i}>
              {previousRide && (
                <Step icon="time-line" accent>
                  {t('trip.transfer', { stop: leg.from.name, duration: formatDuration(leg.start - journey.legs[i - 1].end) })}
                </Step>
              )}
              <Ride ride={leg} />
            </Fragment>
          );
        })}
        <Step time={formatTime(journey.arrival)} icon="graduation-cap-line" strong>
          {t('trip.arrive', { place: to })}
        </Step>
      </View>

      <Text style={styles.note}>{t('bus.trip.footer')}</Text>
    </ScrollView>
  );
}

function Step({ time, icon, strong, muted, accent, children }: { time?: string; icon: IconName; strong?: boolean; muted?: boolean; accent?: boolean; children: ReactNode }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const color = muted ? colors.textMuted : accent ? colors.primary : colors.text;
  return (
    <View style={styles.step}>
      <Text style={styles.stepTime}>{time ?? ''}</Text>
      <Icon name={icon} size={18} color={color} />
      <Text style={[styles.stepText, { color }, strong && styles.strong]}>{children}</Text>
    </View>
  );
}

function Ride({ ride }: { ride: RideLeg }) {
  const styles = useStyles();
  const zou = ride.network === 'zou';
  return (
    <View style={[styles.ride, { borderLeftColor: zou ? BRAND.zou : ride.color.bg }]}>
      <View style={styles.rideHeader}>
        <LineBadge line={ride.line} color={ride.color} zou={zou} train={ride.mode === 'train'} />
        <Text style={styles.direction}>{t('trip.direction', { headsign: ride.headsign })}</Text>
      </View>
      <View style={styles.call}>
        <Text style={styles.callTime}>{formatTime(ride.start)}</Text>
        <Text style={styles.callText}>{t('trip.board', { stop: ride.from.name })}</Text>
      </View>
      <Text style={styles.small}>{tn('trip.stops', ride.stops)}</Text>
      <View style={styles.call}>
        <Text style={styles.callTime}>{formatTime(ride.end)}</Text>
        <Text style={styles.callText}>{t('trip.alight', { stop: ride.to.name })}</Text>
      </View>
      {ride.booking && <Text style={styles.booking}>{t('trip.booking')}</Text>}
    </View>
  );
}

const TIME_WIDTH = 48;

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.bg },
  content: { padding: 16, gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  times: { fontSize: 26, fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'] },
  duration: { fontSize: 17, fontWeight: '700', color: c.textSecondary },
  muted: { fontSize: 14, color: c.textMuted },
  steps: { gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  stepTime: { width: TIME_WIDTH, fontSize: 14, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  stepText: { flex: 1, fontSize: 15, lineHeight: 21 },
  strong: { fontWeight: '700' },
  ride: { marginLeft: TIME_WIDTH + 8, paddingLeft: 12, paddingVertical: 4, borderLeftWidth: 4, gap: 6 },
  rideHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  direction: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: c.text },
  call: { flexDirection: 'row', gap: 8 },
  callTime: { fontSize: 15, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  callText: { flex: 1, fontSize: 15, color: c.text },
  small: { fontSize: 13, color: c.textMuted },
  booking: { fontSize: 13, fontWeight: '600', color: c.danger },
  note: { fontSize: 12, color: c.textMuted },
}));
