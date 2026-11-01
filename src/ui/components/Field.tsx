import { Text, View } from 'react-native';
import { typography } from '../theme';

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={typography.muted}>{label}</Text>
      <Text style={typography.text}>{value}</Text>
    </View>
  );
}
