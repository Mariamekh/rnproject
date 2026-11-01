import { stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ImportView } from '../src/core/controller';
import { FIXTURES, MemoryStorage, type Mock, createHarness, fixture, startMock, stepOf, waitFor } from './support';

let mock: Mock;

beforeEach(async () => {
  mock = await startMock();
});

afterEach(async () => {
  await mock.close();
});

function isReady(view: ImportView) {
  return view.step === 'job' && view.job.status === 'ready' && view.job.items !== undefined;
}

async function importToReady(name = 'statement.csv') {
  const h = createHarness(mock);
  await h.controller.restore();
  await h.controller.selectFile(fixture(name));
  expect(h.controller.getView().step).toBe('confirm');
  await h.controller.confirmUpload();
  await waitFor(() => isReady(h.controller.getView()));
  return h;
}

describe('happy', () => {
  it('uploads the real bytes and shows the server result only once ready', async () => {
    const h = await importToReady('statement.csv');
    const csv = await stat(join(FIXTURES, 'statement.csv'));

    const steps = h.views.map(stepOf);
    expect(steps.indexOf('job:queued')).toBeGreaterThan(steps.indexOf('sending'));
    expect(steps.indexOf('job:ready')).toBeGreaterThan(steps.indexOf('job:queued'));

    const view = h.controller.getView();
    if (view.step !== 'job') throw new Error(view.step);
    expect(view.job.currency).toBe('AUD');
    expect(view.job.items?.map((item) => item.merchant)).toEqual(['StreamBeam', 'BrightGrid']);
    expect(view.job.items?.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(15199);

    expect(await mock.stats()).toMatchObject({ createRequests: 1, newJobs: 1, acceptedBytes: csv.size });
    expect(h.http.uploads[0]['Content-Type']).toBe('application/octet-stream');
    expect(await h.files.list()).toEqual([]);
    h.controller.dispose();
  });

  it('accepts the PDF fixture', async () => {
    const h = await importToReady('statement.pdf');
    const pdf = await stat(join(FIXTURES, 'statement.pdf'));
    expect(await mock.stats()).toMatchObject({ newJobs: 1, acceptedBytes: pdf.size });
    h.controller.dispose();
  });

  it('persists the idempotency key before the first POST', async () => {
    const h = createHarness(mock);
    let persistedKey: string | undefined;
    h.http.onUpload = async () => {
      const op = await h.storage.load();
      expect(op?.phase).toBe('sending');
      persistedKey = op?.key;
    };
    await h.controller.selectFile(fixture('statement.csv'));
    await h.controller.confirmUpload();
    expect(persistedKey).toBeDefined();
    expect(h.http.uploads[0]['Idempotency-Key']).toBe(persistedKey);
    h.controller.dispose();
  });
});

describe('lost_ack', () => {
  it('recovers the job by key without creating a second one', async () => {
    await mock.scenario('lost_ack');
    const h = createHarness(mock);
    await h.controller.selectFile(fixture('statement.csv'));
    await h.controller.confirmUpload();
    await waitFor(() => isReady(h.controller.getView()));

    expect(h.views.map(stepOf)).toContain('uncertain');
    expect(h.events).toContain('job_recovered');
    expect(h.http.uploads).toHaveLength(1);
    expect(await mock.stats()).toMatchObject({ createRequests: 1, newJobs: 1 });
    h.controller.dispose();
  });

  it('finds the job after a relaunch and does not resend the file', async () => {
    await mock.scenario('lost_ack');
    const first = createHarness(mock);
    first.controller.subscribe((view) => {
      if (view.step === 'uncertain') first.controller.dispose();
    });
    await first.controller.selectFile(fixture('statement.csv'));
    await first.controller.confirmUpload();
    expect(first.storage.value?.phase).toBe('uncertain');

    const relaunched = createHarness(mock, { files: first.files, storage: first.storage });
    await relaunched.controller.restore();
    await waitFor(() => isReady(relaunched.controller.getView()));

    expect(relaunched.http.uploads).toHaveLength(0);
    expect(await mock.stats()).toMatchObject({ createRequests: 1, newJobs: 1 });
    expect(await relaunched.files.list()).toEqual([]);
    relaunched.controller.dispose();
  });

  it('offers a retry with the same key when the upload never arrived', async () => {
    const first = createHarness(mock);
    first.http.onUpload = async () => {
      throw new Error('connection reset');
    };
    await first.controller.selectFile(fixture('statement.csv'));
    await first.controller.confirmUpload();
    first.controller.dispose();
    const key = first.storage.value?.key;

    const relaunched = createHarness(mock, { files: first.files, storage: first.storage });
    await relaunched.controller.restore();
    expect(relaunched.controller.getView()).toEqual({ step: 'uncertain', checking: false, canRetry: true, offline: false });
    expect(relaunched.http.uploads).toHaveLength(0);
    expect((await mock.stats()).createRequests).toBe(0);

    await relaunched.controller.retryUpload();
    await waitFor(() => isReady(relaunched.controller.getView()));
    expect(relaunched.http.uploads[0]['Idempotency-Key']).toBe(key);
    expect(await mock.stats()).toMatchObject({ createRequests: 1, newJobs: 1 });
    relaunched.controller.dispose();
  });
});

describe('stale_status', () => {
  it('keeps showing ready when an older processing revision arrives', async () => {
    const h = await importToReady();
    const readyAt = h.views.length;
    await mock.scenario('stale_status');

    await h.controller.refreshJob();
    await h.controller.refreshJob();
    await h.controller.refreshJob();

    expect(h.events).toContain('stale_ignored');
    expect(h.views.slice(readyAt).every(isReady)).toBe(true);
    const view = h.controller.getView();
    expect(view.step === 'job' && view.job.revision).toBe(3);
    h.controller.dispose();
  });
});

describe('delete_failure', () => {
  it('does not claim deletion after a 503 and finishes with the same key', async () => {
    const h = await importToReady();
    await mock.scenario('delete_failure');

    await h.controller.deleteImport();
    expect(h.controller.getView()).toMatchObject({ step: 'job', deletion: 'failed', job: { status: 'ready' } });
    expect(h.views.map(stepOf)).not.toContain('deleted');
    expect(h.storage.value?.phase).toBe('deleting');

    const relaunched = createHarness(mock, { files: h.files, storage: h.storage });
    h.controller.dispose();
    await relaunched.controller.restore();
    expect(relaunched.controller.getView()).toMatchObject({ step: 'job', deletion: 'failed' });

    await mock.scenario('happy');
    await relaunched.controller.deleteImport();
    await waitFor(() => relaunched.controller.getView().step === 'deleted');

    const steps = relaunched.views.map(stepOf);
    expect(steps.indexOf('job:deleting')).toBeGreaterThan(-1);
    expect(steps.indexOf('deleted')).toBeGreaterThan(steps.indexOf('job:deleting'));
    expect(h.http.deletes[0]['Idempotency-Key']).toBe(relaunched.http.deletes[0]['Idempotency-Key']);
    expect((await mock.stats()).deleteRequests).toBe(2);
    relaunched.controller.dispose();
  });

  it('ignores a late status that arrives after deletion started', async () => {
    const h = await importToReady();
    const request = h.http.request.bind(h.http);
    let release = () => {};
    let hold = true;
    h.http.request = async (method, path, headers) => {
      const res = await request(method, path, headers);
      if (hold && method === 'GET') {
        hold = false;
        await new Promise<void>((resolve) => (release = resolve));
      }
      return res;
    };

    const lateRefresh = h.controller.refreshJob();
    await h.controller.deleteImport();
    expect(h.controller.getView()).toMatchObject({ job: { status: 'deleting' } });
    release();
    await lateRefresh;
    expect(h.controller.getView()).toMatchObject({ job: { status: 'deleting' } });

    await waitFor(() => h.controller.getView().step === 'deleted');
    await h.controller.refreshJob();
    expect(h.controller.getView().step).toBe('deleted');
    h.controller.dispose();
  });

  it('checks the job again when the DELETE response is lost', async () => {
    const h = await importToReady();
    const request = h.http.request.bind(h.http);
    h.http.request = async (method, path, headers) => {
      const res = await request(method, path, headers);
      if (method === 'DELETE') throw new Error('connection reset');
      return res;
    };

    await h.controller.deleteImport();
    await waitFor(() => h.controller.getView().step === 'deleted');
    expect(h.http.deletes).toHaveLength(1);
    expect((await mock.stats()).deleteRequests).toBe(1);
    h.controller.dispose();
  });

  it('sends one DELETE when delete is tapped twice', async () => {
    const h = await importToReady();
    await Promise.all([h.controller.deleteImport(), h.controller.deleteImport()]);
    await waitFor(() => h.controller.getView().step === 'deleted');
    expect(h.http.deletes).toHaveLength(1);
    expect((await mock.stats()).deleteRequests).toBe(1);
    h.controller.dispose();
  });
});

describe('storage errors', () => {
  it('does not POST when the key cannot be saved', async () => {
    const storage = new MemoryStorage();
    storage.save = async () => {
      throw new Error('disk full');
    };
    const h = createHarness(mock, { storage });
    await h.controller.selectFile(fixture('statement.csv'));
    await h.controller.confirmUpload();

    expect(h.controller.getView()).toEqual({ step: 'failed', reason: 'storage_failed' });
    expect(h.http.uploads).toHaveLength(0);
    expect((await mock.stats()).createRequests).toBe(0);
    expect(await h.files.list()).toEqual([]);
    h.controller.dispose();
  });

  it('does not send DELETE when the delete key cannot be saved', async () => {
    const h = await importToReady();
    h.storage.save = async () => {
      throw new Error('disk full');
    };
    await h.controller.deleteImport();

    expect(h.http.deletes).toHaveLength(0);
    expect(h.controller.getView()).toMatchObject({ step: 'job', deletion: 'failed' });
    h.controller.dispose();
  });
});

describe('spoofed + oversize', () => {
  it('rejects both files before any POST', async () => {
    const oversize = join(mock.dir, 'oversize.csv');
    const header = 'date,description,amount\n';
    const row = '2026-09-01,Synthetic,-1.00\n';
    const rows = Math.ceil((10 * 1024 * 1024 + 1 - header.length) / row.length);
    await writeFile(oversize, header + row.repeat(rows));

    const before = await mock.stats();
    const h = createHarness(mock);

    await h.controller.selectFile(fixture('spoofed.pdf'));
    expect(h.controller.getView()).toEqual({ step: 'rejected', reason: 'unsupported_content' });
    await h.controller.cancelSelection();

    await h.controller.selectFile({ uri: oversize, name: 'oversize.csv', size: null });
    expect(h.controller.getView()).toEqual({ step: 'rejected', reason: 'too_large' });

    expect(h.http.uploads).toHaveLength(0);
    expect(await mock.stats()).toEqual(before);
    h.controller.dispose();
  });
});
