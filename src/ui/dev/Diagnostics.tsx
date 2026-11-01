import { useCallback, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { API_URL } from '../../platform/http';
import { Button } from '../components/Button';
import { colors } from '../theme';
import { type DevEvent, getDevEvents, subscribeDevEvents } from './devEvents';

const MODES = ['happy', 'lost_ack', 'stale_status', 'delete_failure'] as const;

type MockState = {
  mode: string;
  stats: Record<string, number>;
};

async function call(path: string, body?: object): Promise<void> {
  await fetch(API_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function Diagnostics() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<MockState | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/__test/state`);
      setState(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  const run = (action: () => Promise<void>) => async () => {
    try {
      await action();
    } catch {
      setError(true);
    }
    await load();
  };

  const events = useSyncExternalStore(subscribeDevEvents, getDevEvents);

  if (!open) {
    return (
      <Button
        title="Mock diagnostics"
        variant="secondary"
        onPress={() => {
          setOpen(true);
          void load();
        }}
      />
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Mock diagnostics</Text>
      <Text style={styles.text}>{API_URL}</Text>
      {error && <Text style={styles.error}>Mock server unreachable</Text>}
      {state && (
        <>
          <Text style={styles.text}>Scenario: {state.mode}</Text>
          {Object.entries(state.stats).map(([name, value]) => (
            <Text key={name} style={styles.text}>
              {name}: {value}
            </Text>
          ))}
        </>
      )}
      {events.length > 0 && (
        <>
          <Text style={styles.title}>App events, newest first</Text>
          {events.map((item) => (
            <Text key={item.id} style={styles.text}>
              {describe(item)}
            </Text>
          ))}
        </>
      )}
      <View style={styles.modes}>
        {MODES.map((mode) => (
          <View key={mode} style={styles.mode}>
            <Button
              title={mode}
              variant={state?.mode === mode ? 'primary' : 'secondary'}
              onPress={run(() => call('/__test/scenario', { mode }))}
            />
          </View>
        ))}
      </View>
      <Button title="Refresh counters" variant="secondary" onPress={run(async () => {})} />
      <Button title="Reset mock" variant="danger" onPress={run(() => call('/__test/reset'))} />
      <Button title="Hide" variant="secondary" onPress={() => setOpen(false)} />
    </View>
  );
}

function describe({ event, fields }: DevEvent) {
  const revision = fields?.revision === undefined ? undefined : `r${fields.revision}`;
  return [event, fields?.status, revision, fields?.reason].filter(Boolean).join(' · ');
}

const styles = StyleSheet.create({
  panel: { gap: 8, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  text: { fontSize: 14, color: colors.muted, fontVariant: ['tabular-nums'] },
  error: { fontSize: 14, color: colors.danger },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mode: { flexGrow: 1, minWidth: 140 },
});
