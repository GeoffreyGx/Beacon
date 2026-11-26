// Shared controls: icon button, filled / outlined buttons, theme toggle (cycling) and theme picker (segmented).
import { Pressable, Text, View } from 'react-native';
import { makeStyles, useAppTheme, type ThemeMode } from '../lib/theme';
import { Icon, type IconName } from './Icon';
import { t } from '../lib/i18n';

export function IconButton({
  icon,
  label,
  onPress,
  color,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={styles.iconButton}>
      <Icon name={icon} size={22} color={color ?? colors.primary} />
    </Pressable>
  );
}

/** Filled button (white text), `color` defaults to the app blue. */
export function PrimaryButton({
  label,
  onPress,
  icon,
  color,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  color?: string;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: color ?? colors.moved },
        (pressed || disabled) && styles.dim,
      ]}
    >
      {icon && <Icon name={icon} size={18} color="#fff" />}
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

/** Full-width outlined button; `danger` for destructive actions (log out…). */
export function OutlineButton({
  label,
  onPress,
  icon,
  danger,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  danger?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const color = danger ? colors.danger : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.outline, { borderColor: danger ? colors.danger : colors.border }, pressed && styles.pressed]}
    >
      {icon && <Icon name={icon} size={18} color={color} />}
      <Text style={[styles.outlineText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const THEMES: { mode: ThemeMode; icon: IconName; label: () => string; next: ThemeMode }[] = [
  { mode: 'auto', icon: 'contrast-2-line', label: () => t('theme.auto'), next: 'light' },
  { mode: 'light', icon: 'sun-line', label: () => t('theme.light'), next: 'dark' },
  { mode: 'dark', icon: 'moon-line', label: () => t('theme.dark'), next: 'auto' },
];

/** Compact toggle cycling auto → light → dark (used where space is tight). */
export function ThemeToggle() {
  const { mode, setMode, colors } = useAppTheme();
  const theme = THEMES.find((x) => x.mode === mode)!;
  return (
    <IconButton
      icon={theme.icon}
      label={t('theme.toggleA11y', { label: theme.label() })}
      onPress={() => setMode(theme.next)}
      color={colors.textSecondary}
    />
  );
}

/** Segmented Auto / Light / Dark picker. */
export function ThemePicker() {
  const { mode, setMode } = useAppTheme();
  return (
    <Segmented
      options={THEMES.map((theme) => ({ value: theme.mode, label: theme.label(), icon: theme.icon }))}
      value={mode}
      onChange={setMode}
    />
  );
}

/** Segmented single choice (radio group); `label` names the group for screen readers. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            {o.icon && <Icon name={o.icon} size={16} color={selected ? colors.inverseText : colors.textSecondary} />}
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  iconButton: { padding: 4 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  dim: { opacity: 0.8 },
  outline: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  outlineText: { fontSize: 15, fontWeight: '600' },
  pressed: { backgroundColor: c.pressed },
  segmented: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentSelected: { backgroundColor: c.inverseBg },
  segmentText: { fontSize: 14, color: c.textSecondary },
  segmentTextSelected: { color: c.inverseText, fontWeight: '600' },
}));
