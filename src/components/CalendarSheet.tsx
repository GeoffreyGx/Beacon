import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { makeStyles, useAppTheme } from '../lib/theme';
import { addMonths, monthGrid, monthLabel, todayKey } from '../lib/time';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { t } from '../lib/i18n';

type Props = { visible: boolean; value: string; onSelect: (day: string) => void; onClose: () => void };

/** Most weeks a month grid can span. */
const WEEKS = 6;

export function CalendarSheet({ visible, value, onSelect, onClose }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      {/* Remount on open so the month resets to the selected day. */}
      {visible && <MonthView value={value} onSelect={onSelect} />}
    </Sheet>
  );
}

function MonthView({ value, onSelect }: { value: string; onSelect: (day: string) => void }) {
  const [month, setMonth] = useState(value.slice(0, 7));
  const today = todayKey();
  const onCurrentMonth = month === today.slice(0, 7);
  // Always 6 weeks, so the sheet keeps its height (and the arrows their place) from month to month.
  const grid = monthGrid(month);
  const cells = [...grid, ...Array<null>(WEEKS * 7 - grid.length).fill(null)];
  const weekdays = t('calendar.weekdays').split(',');
  const styles = useStyles();
  const { colors } = useAppTheme();

  return (
    <View>
      <View style={styles.head}>
        <Pressable onPress={() => setMonth((m) => addMonths(m, -1))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('calendar.prevMonth')} style={styles.navBtn}>
          <Icon name="arrow-left-s-line" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.month}>{monthLabel(month)}</Text>
        <Pressable onPress={() => setMonth((m) => addMonths(m, 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('calendar.nextMonth')} style={styles.navBtn}>
          <Icon name="arrow-right-s-line" size={22} color={colors.text} />
        </Pressable>
      </View>

      {/* Explicit rows of 7: percentage widths with flexWrap round past 100% and wrap after 6 cells. */}
      <View style={styles.row}>
        {weekdays.map((d, i) => (
          <Text key={`h${i}`} style={[styles.cell, styles.weekday]}>
            {d}
          </Text>
        ))}
      </View>
      {Array.from({ length: WEEKS }, (_, w) => (
        <View key={`w${w}`} style={styles.row}>
          {cells.slice(w * 7, w * 7 + 7).map((day, i) =>
            day ? (
              <Pressable
                key={day}
                onPress={() => onSelect(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: day === value }}
                style={styles.cell}
              >
                <View style={[styles.dayCircle, day === today && styles.today, day === value && styles.selected]}>
                  <Text style={[styles.dayText, day === value && styles.selectedText, i >= 5 && day !== value && styles.weekend]}>
                    {Number(day.slice(8))}
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View key={`e${i}`} style={styles.cell} />
            ),
          )}
        </View>
      ))}

      {/* Shows the current month without picking a day. Always rendered (dimmed when already there) so the sheet keeps its height. */}
      <Pressable
        onPress={() => setMonth(today.slice(0, 7))}
        disabled={onCurrentMonth}
        accessibilityRole="button"
        accessibilityState={{ disabled: onCurrentMonth }}
        style={({ pressed }) => [styles.todayBtn, (pressed || onCurrentMonth) && styles.todayBtnDim]}
      >
        <Text style={styles.todayBtnText}>{t('common.today')}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { padding: 6 },
  month: { fontSize: 16, fontWeight: '700', color: c.text },
  row: { flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  weekday: { fontSize: 12, fontWeight: '600', color: c.textMuted, aspectRatio: undefined, paddingVertical: 4 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: c.live },
  selected: { backgroundColor: c.inverseBg, borderColor: c.inverseBg },
  dayText: { fontSize: 14, color: c.text },
  weekend: { color: c.textFaint },
  selectedText: { color: c.inverseText, fontWeight: '700' },
  todayBtn: { alignSelf: 'center', marginTop: 8, paddingVertical: 8, paddingHorizontal: 16 },
  todayBtnDim: { opacity: 0.4 },
  todayBtnText: { color: c.primary, fontWeight: '600', fontSize: 14 },
}));
