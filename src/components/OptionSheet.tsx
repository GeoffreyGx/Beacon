import { Pressable, ScrollView, Text } from 'react-native';
import { makeStyles, useAppTheme } from '../lib/theme';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

export type Option = { value: string; label: string; detail?: string };

type Props = {
  visible: boolean;
  title: string;
  options: Option[];
  value: string;
  onSelect: (value: string) => void;
  onClose: () => void;
};

export function OptionSheet({ visible, title, options, value, onSelect, onClose }: Props) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView style={styles.list}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onSelect(o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={[styles.label, selected && styles.selectedLabel]}>{o.label}</Text>
              {o.detail && <Text style={styles.detail}>{o.detail}</Text>}
              {selected && <Icon name="check-line" size={20} color={colors.primary} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  title: { fontSize: 16, fontWeight: '700', color: c.text, paddingHorizontal: 8, paddingBottom: 8 },
  list: { maxHeight: 420 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8 },
  pressed: { backgroundColor: c.pressed },
  label: { flex: 1, fontSize: 15, color: c.text },
  selectedLabel: { fontWeight: '700', color: c.primary },
  detail: { fontSize: 13, color: c.textMuted },
}));
