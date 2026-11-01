import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16, borderRadius: 12, backgroundColor: colors.surface },
});
