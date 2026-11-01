import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../theme';

const tones = {
  error: { backgroundColor: colors.dangerBg, color: colors.danger },
  warning: { backgroundColor: colors.warningBg, color: colors.warningText },
  success: { backgroundColor: colors.successBg, color: colors.successText },
};

export function Notice({ tone, text }: { tone: keyof typeof tones; text: string }) {
  const { backgroundColor, color } = tones[tone];
  return (
    <View style={[styles.notice, { backgroundColor }]} accessibilityRole="alert">
      <Text style={[typography.text, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { padding: 12, borderRadius: 8 },
});
