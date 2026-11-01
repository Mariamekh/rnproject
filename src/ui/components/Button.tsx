import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', disabled = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, labelStyles[variant]]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  danger: { borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  label: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.onAccent },
  secondary: { color: colors.accent },
  danger: { color: colors.danger },
});
