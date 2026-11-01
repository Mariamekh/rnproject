import { getDocumentAsync } from 'expo-document-picker';
import type { PickedFile } from '../core/types';

const TYPES = ['application/pdf', 'text/csv', 'text/comma-separated-values', 'application/csv'];

export async function pickStatement(): Promise<PickedFile | null> {
  const result = await getDocumentAsync({ type: TYPES, copyToCacheDirectory: false, multiple: false });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name, size: typeof asset.size === 'number' ? asset.size : null };
}
