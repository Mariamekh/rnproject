import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { FileFormat, LocalFiles } from '../core/types';

// Caches is excluded from iCloud backup; Android backup is disabled in app.json.
const importsDir = () => new Directory(Paths.cache, 'imports');

// On iOS the picker hands over a copy inside the app container (tmp/<bundle id>-Inbox).
// On Android it hands over a content:// URI, so only files in our cache are ours.
function ownRoot(): string {
  return Platform.OS === 'ios' ? Paths.cache.uri.replace(/Library\/Caches\/?$/, '') : Paths.cache.uri;
}

function isOwnFile(uri: string): boolean {
  return uri.startsWith('file://') && uri.startsWith(ownRoot());
}

function pickerLeftovers(): Directory[] {
  const leftovers = [new Directory(Paths.cache, 'DocumentPicker')];
  if (Platform.OS !== 'ios') return leftovers;
  const tmp = new Directory(ownRoot(), 'tmp');
  if (tmp.exists) {
    for (const entry of tmp.list()) {
      if (entry instanceof Directory && entry.uri.replace(/\/$/, '').endsWith('-Inbox')) leftovers.push(entry);
    }
  }
  return leftovers;
}

function deleteQuietly(target: File | Directory) {
  try {
    if (target.exists) target.delete();
  } catch {}
}

export const localFiles: LocalFiles = {
  async size(uri) {
    try {
      const file = new File(uri);
      return file.exists ? file.size : null;
    } catch {
      return null;
    }
  },

  async read(uri, offset, length) {
    const handle = new File(uri).open();
    try {
      handle.offset = offset;
      return await handle.readBytes(length);
    } finally {
      handle.close();
    }
  },

  async makePrivateCopy(uri, id, format: FileFormat) {
    const dir = importsDir();
    if (!dir.exists) dir.create({ intermediates: true });
    const source = new File(uri);
    const target = new File(dir, `${id}.${format}`);
    if (isOwnFile(uri)) await source.move(target);
    else await source.copy(target);
    return target.uri;
  },

  async remove(uri) {
    deleteQuietly(new File(uri));
  },

  async releasePicked(uri) {
    if (isOwnFile(uri)) deleteQuietly(new File(uri));
  },

  async removeLeftovers(keep) {
    try {
      const dir = importsDir();
      if (dir.exists) {
        for (const entry of dir.list()) {
          if (entry.uri !== keep) deleteQuietly(entry);
        }
      }
      pickerLeftovers().forEach(deleteQuietly);
    } catch {}
  },
};
