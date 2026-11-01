import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImportController, ImportView } from '../core/controller';
import { pickStatement } from '../platform/picker';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { Field } from './components/Field';
import { Notice } from './components/Notice';
import { Progress } from './components/Progress';
import { Diagnostics } from './dev/Diagnostics';
import { failureText, formatSize, rejectionText } from './format';
import { JobCard } from './JobCard';
import { colors, typography } from './theme';

type Props = {
  controller: ImportController;
  view: ImportView;
};

export function ImportScreen({ controller, view }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const canRefresh = view.step === 'job';

  const onRefresh = async () => {
    if (!canRefresh) return;
    setRefreshing(true);
    try {
      await controller.refreshJob();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} enabled={canRefresh} />}
      >
        <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.5}>
          Statement import
        </Text>
        <StepContent controller={controller} view={view} />
        {__DEV__ && <Diagnostics />}
      </ScrollView>
    </SafeAreaView>
  );
}

function StepContent({ controller, view }: Props) {
  const chooseFile = async () => {
    const picked = await pickStatement();
    if (picked) await controller.selectFile(picked);
  };

  switch (view.step) {
    case 'idle':
      return (
        <Card>
          <Button title="Choose file" onPress={chooseFile} />
          <Text style={typography.text}>
            Choose a bank statement as a PDF or CSV, up to 10 MB. The file is checked on this device before anything is
            sent.
          </Text>
        </Card>
      );

    case 'checking':
      return <Progress text="Checking the file..." />;

    case 'rejected':
      return (
        <Card>
          <Notice tone="error" text={rejectionText[view.reason]} />
          <Button title="Choose another file" onPress={chooseFile} />
          <Text style={typography.muted}>Nothing was sent to the server.</Text>
        </Card>
      );

    case 'confirm':
      return (
        <Card>
          <Text style={typography.subtitle}>Send this file?</Text>
          <Field label="Name" value={view.file.name} />
          <Field label="Size" value={formatSize(view.file.size)} />
          <Field label="Format" value={view.file.format.toUpperCase()} />
          <Button title="Upload" onPress={() => controller.confirmUpload()} />
          <Button title="Cancel" variant="secondary" onPress={() => controller.cancelSelection()} />
        </Card>
      );

    case 'sending':
      return <Progress text="Uploading..." />;

    case 'uncertain':
      if (view.checking) return <Progress text="Checking whether the upload reached the server..." />;
      return (
        <Card>
          <Notice
            tone="warning"
            text={
              view.offline
                ? "Can't reach the server, so we don't know yet whether the upload arrived."
                : "The server hasn't seen this upload yet. It may not have arrived."
            }
          />
          <Button title="Check again" onPress={() => controller.checkUploadAgain()} />
          {view.canRetry && <Button title="Retry upload" variant="secondary" onPress={() => controller.retryUpload()} />}
          <Button title="Discard" variant="danger" onPress={() => confirmDiscard(controller)} />
        </Card>
      );

    case 'failed':
      return (
        <Card>
          <Notice tone="error" text={failureText[view.reason]} />
          <Button title="Start over" onPress={() => controller.clearImport()} />
        </Card>
      );

    case 'job':
      return <JobCard controller={controller} job={view.job} offline={view.offline} deletion={view.deletion} />;

    case 'deleted':
      return (
        <Card>
          <Notice tone="success" text="The server confirmed that this import was deleted." />
          <Button title="Import another statement" onPress={() => controller.clearImport()} />
        </Card>
      );
  }
}

function confirmDiscard(controller: ImportController) {
  Alert.alert('Discard this upload?', 'If the upload did reach the server, it will stay there.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: () => void controller.clearImport() },
  ]);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
});
