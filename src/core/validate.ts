import type { CheckedFile, FileFormat, LocalFiles, PickedFile, Rejection } from './types';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PROBE_BYTES = 1024;

const PDF_MAGIC = ascii('%PDF-');
const PDF_EOF = ascii('%%EOF');
const CSV_HEADER = ascii('date,description,amount\n');

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, i) => bytes[i] === byte);
}

function contains(bytes: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function sniffFormat(head: Uint8Array, tail: Uint8Array): FileFormat | null {
  if (startsWith(head, PDF_MAGIC)) return contains(tail, PDF_EOF) ? 'pdf' : null;
  const withoutCr = head.subarray(0, CSV_HEADER.length).filter((byte) => byte !== 0x0d);
  if (startsWith(withoutCr, CSV_HEADER)) return 'csv';
  return null;
}

function extensionFormat(name: string): FileFormat | null {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'pdf' || ext === 'csv' ? ext : null;
}

type CheckResult = { ok: true; file: CheckedFile } | { ok: false; reason: Rejection };

export async function checkPickedFile(picked: PickedFile, files: LocalFiles): Promise<CheckResult> {
  const size = picked.size ?? (await files.size(picked.uri));
  if (size === null) return { ok: false, reason: 'unreadable' };
  if (size > MAX_FILE_BYTES) return { ok: false, reason: 'too_large' };
  if (size === 0) return { ok: false, reason: 'empty' };

  let head: Uint8Array;
  let tail: Uint8Array;
  try {
    head = await files.read(picked.uri, 0, Math.min(PROBE_BYTES, size));
    tail = await files.read(picked.uri, Math.max(0, size - PROBE_BYTES), Math.min(PROBE_BYTES, size));
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  const format = sniffFormat(head, tail);
  if (!format) return { ok: false, reason: 'unsupported_content' };
  const claimed = extensionFormat(picked.name);
  if (claimed && claimed !== format) return { ok: false, reason: 'type_mismatch' };

  return { ok: true, file: { uri: picked.uri, name: picked.name, size, format } };
}

export function headerSafeName(name: string, format: FileFormat): string {
  const trimmed = name.trim() || `statement.${format}`;
  const safe = /^[\x20-\x7e]+$/.test(trimmed) ? trimmed : encodeURIComponent(trimmed);
  return safe.slice(0, 255);
}
