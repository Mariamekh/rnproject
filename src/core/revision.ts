import type { JobSnapshot } from './types';

export function shouldApply(current: JobSnapshot | null, incoming: JobSnapshot): boolean {
  if (!current) return true;
  if (incoming.jobId !== current.jobId) return false;
  if (current.status === 'deleted') return false;
  if (incoming.revision > current.revision) return true;
  // After a relaunch we know the revision but not the result (it isn't persisted).
  return (
    incoming.revision === current.revision &&
    incoming.status === 'ready' &&
    current.items === undefined &&
    incoming.items !== undefined
  );
}
