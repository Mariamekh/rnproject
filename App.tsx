import * as Crypto from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ImportsApi } from './src/core/api';
import { ImportController, type LogEvent, type LogFields } from './src/core/controller';
import { localFiles } from './src/platform/files';
import { http } from './src/platform/http';
import { opStorage } from './src/platform/storage';
import { recordDevEvent } from './src/ui/dev/devEvents';
import { ImportScreen } from './src/ui/ImportScreen';

function log(event: LogEvent, fields?: LogFields) {
  if (!__DEV__) return;
  console.log(`[import] ${event}`, fields ?? '');
  recordDevEvent(event, fields);
}

function createController() {
  return new ImportController({
    api: new ImportsApi(http),
    files: localFiles,
    storage: opStorage,
    newId: Crypto.randomUUID,
    log,
  });
}

export default function App() {
  const [controller] = useState(createController);
  const view = useSyncExternalStore(
    (onChange) => controller.subscribe(onChange),
    () => controller.getView(),
  );

  useEffect(() => {
    void controller.restore();
    const sub = AppState.addEventListener('change', (state) => controller.setAppActive(state === 'active'));
    return () => sub.remove();
  }, [controller]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ImportScreen controller={controller} view={view} />
    </SafeAreaProvider>
  );
}
