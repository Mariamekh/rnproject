import { describe, expect, it } from 'vitest';
import { shouldApply } from '../src/core/revision';
import type { JobSnapshot } from '../src/core/types';

const ready: JobSnapshot = {
  jobId: 'job-demo-001',
  status: 'ready',
  revision: 3,
  currency: 'AUD',
  items: [],
};

describe('shouldApply', () => {
  it('ignores an older revision after ready', () => {
    expect(shouldApply(ready, { jobId: 'job-demo-001', status: 'processing', revision: 2 })).toBe(false);
  });

  it('ignores a repeated revision', () => {
    expect(shouldApply(ready, { ...ready })).toBe(false);
  });

  it('accepts newer revisions', () => {
    expect(shouldApply(ready, { jobId: 'job-demo-001', status: 'deleting', revision: 4 })).toBe(true);
  });

  it('never resurrects a deleted job', () => {
    const deleted: JobSnapshot = { jobId: 'job-demo-001', status: 'deleted', revision: 5 };
    expect(shouldApply(deleted, { jobId: 'job-demo-001', status: 'queued', revision: 1 })).toBe(false);
    expect(shouldApply(deleted, { ...ready, revision: 6 })).toBe(false);
  });

  it('ignores responses for another job', () => {
    expect(shouldApply(ready, { jobId: 'job-demo-002', status: 'deleting', revision: 4 })).toBe(false);
  });

  it('fills in the result after a relaunch at the same revision', () => {
    const restored: JobSnapshot = { jobId: 'job-demo-001', status: 'ready', revision: 3 };
    expect(shouldApply(restored, ready)).toBe(true);
  });
});
