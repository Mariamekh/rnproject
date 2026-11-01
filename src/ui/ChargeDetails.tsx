import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RecurringCharge } from '../core/types';
import { Button } from './components/Button';
import { formatAmount } from './format';
import { colors } from './theme';

type Props = {
  charge: RecurringCharge | null;
  currency: string;
  onClose: () => void;
};

export function ChargeDetails({ charge, currency, onClose }: Props) {
  return (
    <Modal visible={charge !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {charge && (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.5}>
              {charge.merchant}
            </Text>
            <Row label="Amount" value={formatAmount(charge.amountMinor, currency)} />
            <Row label="Repeats" value={charge.cadence} />
            <Row label="Last charged" value={charge.lastSeen} />
            <Row label="Reference" value={charge.id} />
            <Text style={styles.note}>
              This is a recurring charge found in the statement. Cancelling it isn't available in this app.
            </Text>
            <Button title="Close" variant="secondary" onPress={onClose} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  row: { gap: 2, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { fontSize: 14, color: colors.muted },
  value: { fontSize: 17, color: colors.text },
  note: { fontSize: 14, color: colors.muted },
});
