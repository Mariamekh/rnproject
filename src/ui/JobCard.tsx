import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import type { Deletion, ImportController } from '../core/controller';
import type { JobSnapshot, RecurringCharge } from '../core/types';
import { ChargeDetails } from './ChargeDetails';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { Notice } from './components/Notice';
import { Progress } from './components/Progress';
import { formatAmount, statusText } from './format';
import { colors, typography } from './theme';

type Props = {
  controller: ImportController;
  job: JobSnapshot;
  offline: boolean;
  deletion: Deletion;
};

export function JobCard({ controller, job, offline, deletion }: Props) {
  const [selected, setSelected] = useState<RecurringCharge | null>(null);
  const items = job.status === 'ready' ? job.items : undefined;
  const currency = job.currency ?? '';
  const monthly = items?.filter((item) => item.cadence === 'monthly').reduce((sum, item) => sum + item.amountMinor, 0);
  const busy = job.status === 'queued' || job.status === 'processing' || job.status === 'deleting' || deletion === 'sending';

  return (
    <>
      <Card>
        <View style={styles.statusRow} accessibilityLiveRegion="polite">
          {busy && <ActivityIndicator />}
          <Text style={typography.subtitle}>
            {deletion === 'sending' ? 'Requesting deletion...' : statusText[job.status]}
          </Text>
        </View>
        {offline && <Notice tone="warning" text="Can't reach the server. Retrying..." />}
        {deletion === 'failed' && (
          <Notice tone="error" text="Deletion wasn't confirmed. Your data may still be on the server." />
        )}
        {job.status === 'ready' && !items && <Progress text="Loading the result..." />}
      </Card>

      {items && (
        <Card>
          <Text style={typography.subtitle}>Recurring charges</Text>
          {items.map((item) => (
            <View key={item.id} style={styles.charge}>
              <View style={styles.chargeText}>
                <Text style={typography.text}>{item.merchant}</Text>
                <Text style={typography.muted}>
                  {formatAmount(item.amountMinor, currency)} · {item.cadence} · last {item.lastSeen}
                </Text>
              </View>
              <Button title="Details" variant="secondary" onPress={() => setSelected(item)} />
            </View>
          ))}
          {monthly !== undefined && (
            <Text style={styles.total}>Total {formatAmount(monthly, currency)} / month</Text>
          )}
        </Card>
      )}

      {(job.status === 'ready' || deletion === 'failed') && (
        <Button
          title={deletion === 'failed' ? 'Try deleting again' : 'Delete import'}
          variant="danger"
          disabled={deletion === 'sending'}
          onPress={() => (deletion === 'failed' ? controller.deleteImport() : confirmDelete(controller))}
        />
      )}

      <ChargeDetails charge={selected} currency={currency} onClose={() => setSelected(null)} />
    </>
  );
}

function confirmDelete(controller: ImportController) {
  Alert.alert('Delete this import?', 'The statement and its result will be deleted from the server.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void controller.deleteImport() },
  ]);
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  total: { fontSize: 17, fontWeight: '600', color: colors.text },
  charge: { gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chargeText: { gap: 2 },
});
