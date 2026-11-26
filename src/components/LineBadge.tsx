// Line badge in the line's colours ("C3", "707"); ZOU! lines get the network's
// tag in front, trains a train icon.
import { Text, View } from 'react-native';
import { BRAND, makeStyles } from '../lib/theme';
import { Icon } from './Icon';

type Props = { line: string; color: { bg: string; text: string }; zou?: boolean; train?: boolean };

export function LineBadge({ line, color, zou, train }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.group}>
      {zou && (
        <View style={styles.zouTag}>
          <Text style={styles.zouTagText}>ZOU!</Text>
        </View>
      )}
      <View style={[styles.badge, { backgroundColor: color.bg }]}>
        {train && <Icon name="train-line" size={12} color={color.text} />}
        <Text style={[styles.badgeText, { color: color.text }]}>{line}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  group: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  zouTag: { paddingHorizontal: 4, paddingVertical: 3, borderRadius: 4, backgroundColor: BRAND.zou },
  zouTagText: { fontSize: 10, fontWeight: '800', color: '#ffffff' },
  badge: {
    minWidth: 34,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  badgeText: { fontSize: 13, fontWeight: '800' },
}));
