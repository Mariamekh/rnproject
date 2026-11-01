import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImportOp, OpStorage } from '../core/types';

const KEY = 'statement-import/op';
// Bump only together with a migration: dropping a record loses the idempotency key of an unresolved upload.
const VERSION = 1;

type Stored = { version: number; op: ImportOp };

function isOp(value: unknown): value is ImportOp {
  if (typeof value !== 'object' || value === null) return false;
  const op = value as Record<string, unknown>;
  return typeof op.id === 'string' && typeof op.key === 'string' && typeof op.phase === 'string';
}

export const opStorage: OpStorage = {
  async load() {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const stored = JSON.parse(raw) as Partial<Stored>;
      if (stored.version === VERSION && isOp(stored.op)) return stored.op;
    } catch {}
    await AsyncStorage.removeItem(KEY);
    return null;
  },

  async save(op) {
    const stored: Stored = { version: VERSION, op };
    await AsyncStorage.setItem(KEY, JSON.stringify(stored));
  },

  async clear() {
    await AsyncStorage.removeItem(KEY);
  },
};
