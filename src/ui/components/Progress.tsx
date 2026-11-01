import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { typography } from '../theme';

export function Progress({ text }: { text: string }) {
  return (
    <View style={styles.progress} accessibilityLiveRegion="polite">
      <ActivityIndicator />
      <Text style={typography.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, flexWrap: 'wrap' },
});
