import type { FailureReason, JobStatus, Rejection } from '../core/types';

export function formatAmount(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const rejectionText: Record<Rejection, string> = {
  too_large: 'This file is larger than 10 MB.',
  empty: 'This file is empty.',
  unreadable: "This file couldn't be read. Try choosing it again.",
  unsupported_content: "This isn't a statement PDF or CSV. We checked the file's contents, not just its name.",
  type_mismatch: "The file's contents don't match its extension.",
};

export const failureText: Record<FailureReason, string> = {
  conflict: 'The server already has a different file under this upload.',
  server_rejected: "The server didn't accept this file.",
  job_missing: 'The server no longer has this import.',
  copy_failed: "The file couldn't be prepared for upload.",
  storage_failed: "The upload couldn't be saved on this device, so the file wasn't sent.",
};

export const statusText: Record<JobStatus, string> = {
  queued: 'Waiting in the queue',
  processing: 'Processing the statement',
  ready: 'Ready',
  deleting: 'Deleting from the server',
  deleted: 'Deleted from the server',
};
