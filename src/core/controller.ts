import { ImportsApi } from './api';
import { shouldApply } from './revision';
import { checkPickedFile, headerSafeName } from './validate';
import type {
  CheckedFile,
  FailureReason,
  ImportOp,
  JobSnapshot,
  JobStatus,
  LocalFiles,
  OpStorage,
  PickedFile,
  Rejection,
} from './types';

export type Deletion = 'none' | 'sending' | 'failed';

export type ImportView =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'rejected'; reason: Rejection }
  | { step: 'confirm'; file: CheckedFile }
  | { step: 'sending' }
  | { step: 'uncertain'; checking: boolean; canRetry: boolean; offline: boolean }
  | { step: 'failed'; reason: FailureReason }
  | { step: 'job'; job: JobSnapshot; offline: boolean; deletion: Deletion }
  | { step: 'deleted' };

export type LogEvent =
  | 'file_rejected'
  | 'upload_sent'
  | 'upload_unknown'
  | 'job_recovered'
  | 'job_updated'
  | 'stale_ignored'
  | 'delete_sent'
  | 'delete_failed'
  | 'failed';

export type LogFields = {
  status?: JobStatus;
  revision?: number;
  reason?: Rejection | FailureReason;
};

export type ControllerDeps = {
  api: ImportsApi;
  files: LocalFiles;
  storage: OpStorage;
  newId: () => string;
  pollMs?: number;
  log?: (event: LogEvent, fields?: LogFields) => void;
};

const DEFAULT_POLL_MS = 800;
const MAX_BACKOFF_MS = 8000;

export class ImportController {
  private view: ImportView = { step: 'idle' };
  private listeners = new Set<(view: ImportView) => void>();
  private op: ImportOp | null = null;
  private job: JobSnapshot | null = null;
  private pickedFile: CheckedFile | null = null;
  private deletion: Deletion = 'none';
  private offline = false;
  private pollFailures = 0;
  private refreshing = false;
  private appActive = true;
  private disposed = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pollMs: number;

  constructor(private readonly deps: ControllerDeps) {
    this.pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
  }

  getView(): ImportView {
    return this.view;
  }

  subscribe(listener: (view: ImportView) => void): () => void {
    this.listeners.add(listener);
    listener(this.view);
    return () => this.listeners.delete(listener);
  }

  async restore(): Promise<void> {
    let op: ImportOp | null;
    try {
      op = await this.deps.storage.load();
    } catch {
      this.log('failed', { reason: 'storage_failed' });
      return this.setView({ step: 'idle' });
    }
    await this.deps.files.removeLeftovers(op?.localCopy ?? null);
    if (!op) return this.setView({ step: 'idle' });

    this.op = op;
    this.job = op.job ? { ...op.job } : null;
    switch (op.phase) {
      case 'sending':
      case 'uncertain':
        return this.recoverUpload();
      case 'failed':
        return this.setView({ step: 'failed', reason: op.failure ?? 'server_rejected' });
      case 'deleted':
        return this.setView({ step: 'deleted' });
      case 'deleting':
        if (op.job?.status !== 'deleting') this.deletion = 'failed';
        this.showJob();
        return this.refreshJob();
      case 'tracking':
        this.showJob();
        return this.refreshJob();
    }
  }

  async selectFile(picked: PickedFile): Promise<void> {
    if (this.op) return;
    this.setView({ step: 'checking' });
    const result = await checkPickedFile(picked, this.deps.files);
    if (!result.ok) {
      await this.deps.files.releasePicked(picked.uri);
      this.log('file_rejected', { reason: result.reason });
      return this.setView({ step: 'rejected', reason: result.reason });
    }
    this.pickedFile = result.file;
    this.setView({ step: 'confirm', file: result.file });
  }

  async cancelSelection(): Promise<void> {
    const picked = this.pickedFile;
    this.pickedFile = null;
    if (picked) await this.deps.files.releasePicked(picked.uri);
    if (!this.op) this.setView({ step: 'idle' });
  }

  async confirmUpload(): Promise<void> {
    const file = this.pickedFile;
    if (!file || this.op) return;
    this.pickedFile = null;
    this.setView({ step: 'sending' });

    const id = this.deps.newId();
    let localCopy: string;
    try {
      localCopy = await this.deps.files.makePrivateCopy(file.uri, id, file.format);
    } catch {
      await this.deps.files.releasePicked(file.uri);
      return this.setView({ step: 'failed', reason: 'copy_failed' });
    }

    const recheck = await checkPickedFile({ uri: localCopy, name: file.name, size: null }, this.deps.files);
    if (!recheck.ok || recheck.file.size !== file.size || recheck.file.format !== file.format) {
      await this.deps.files.remove(localCopy);
      const reason = recheck.ok ? 'unreadable' : recheck.reason;
      this.log('file_rejected', { reason });
      return this.setView({ step: 'rejected', reason });
    }

    this.op = {
      id,
      key: this.deps.newId(),
      uploadName: headerSafeName(file.name, file.format),
      localCopy,
      phase: 'sending',
      job: null,
      deleteKey: null,
      failure: null,
    };
    if (!(await this.saveOp())) return this.failImport('storage_failed');
    await this.uploadFile();
  }

  async retryUpload(): Promise<void> {
    if (this.op?.phase !== 'uncertain' || this.view.step !== 'uncertain' || this.view.checking) return;
    await this.updateOp({ phase: 'sending' });
    await this.uploadFile();
  }

  async checkUploadAgain(): Promise<void> {
    if (this.op?.phase !== 'uncertain' || this.view.step !== 'uncertain' || this.view.checking) return;
    await this.recoverUpload();
  }

  async refreshJob(): Promise<void> {
    const op = this.op;
    if (!op?.job || this.refreshing || this.disposed) return;
    this.cancelPoll();
    this.refreshing = true;
    const result = await this.deps.api.getJob(op.job.jobId);
    this.refreshing = false;
    if (!this.isCurrentOp(op.id)) return;

    if (result.kind === 'not_found') return this.failImport('job_missing');
    if (result.kind === 'found') {
      this.offline = false;
      this.pollFailures = 0;
      await this.applyJob(result.job);
    } else {
      this.offline = true;
      this.pollFailures += 1;
    }
    this.showJob();
    this.schedulePoll();
  }

  async deleteImport(): Promise<void> {
    const op = this.op;
    const status = this.job?.status;
    if (!op?.job || this.deletion === 'sending' || status === 'deleting' || status === 'deleted') return;

    this.deletion = 'sending';
    const key = op.deleteKey ?? this.deps.newId();
    if (!(await this.updateOp({ deleteKey: key, phase: 'deleting' }))) {
      this.deletion = 'failed';
      this.log('delete_failed');
      return this.showJob();
    }
    this.showJob();

    this.log('delete_sent');
    const result = await this.deps.api.deleteJob(op.job.jobId, key);
    if (!this.isCurrentOp(op.id)) return;

    if (result.kind === 'not_found') return this.failImport('job_missing');
    if (result.kind === 'accepted') {
      this.deletion = 'none';
      await this.applyJob(result.job);
    } else {
      this.deletion = 'failed';
      this.log('delete_failed');
    }
    this.showJob();
    this.schedulePoll();
    // Without a 202 the server may still have started deleting, so ask it instead of guessing.
    if (this.deletion === 'failed') await this.refreshJob();
  }

  async clearImport(): Promise<void> {
    const phase = this.op?.phase;
    if (phase === 'tracking' || phase === 'deleting' || phase === 'sending') return;
    if (this.view.step === 'uncertain' && this.view.checking) return;
    if (this.op?.localCopy) await this.deps.files.remove(this.op.localCopy);
    try {
      await this.deps.storage.clear();
    } catch {}
    this.cancelPoll();
    this.op = null;
    this.job = null;
    this.deletion = 'none';
    this.offline = false;
    this.pollFailures = 0;
    this.setView({ step: 'idle' });
  }

  setAppActive(active: boolean): void {
    this.appActive = active;
    if (!active) return this.cancelPoll();
    if (this.op?.job && this.op.phase !== 'deleted' && this.op.phase !== 'failed') void this.refreshJob();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelPoll();
    this.listeners.clear();
  }

  private async uploadFile(): Promise<void> {
    const op = this.op;
    if (!op?.localCopy || !op.uploadName) return;
    this.setView({ step: 'sending' });
    this.log('upload_sent');
    const result = await this.deps.api.createImport(op.localCopy, op.key, op.uploadName);
    if (!this.isCurrentOp(op.id)) return;

    switch (result.kind) {
      case 'accepted':
        return this.trackJob(result.job);
      case 'conflict':
        return this.failImport('conflict');
      case 'rejected':
        return this.failImport('server_rejected');
      case 'unknown':
        this.log('upload_unknown');
        await this.updateOp({ phase: 'uncertain' });
        return this.recoverUpload();
    }
  }

  private async recoverUpload(): Promise<void> {
    const op = this.op;
    if (!op) return;
    if (op.phase === 'sending') await this.updateOp({ phase: 'uncertain' });
    const canRetry = await this.hasLocalCopy();
    this.setView({ step: 'uncertain', checking: true, canRetry, offline: false });

    const result = await this.deps.api.findJobByKey(op.key);
    if (!this.isCurrentOp(op.id)) return;
    if (result.kind === 'found') {
      this.log('job_recovered', { status: result.job.status, revision: result.job.revision });
      return this.trackJob(result.job);
    }
    this.setView({ step: 'uncertain', checking: false, canRetry, offline: result.kind === 'unavailable' });
  }

  private async trackJob(job: JobSnapshot): Promise<void> {
    const op = this.op;
    if (!op) return;
    if (op.localCopy) await this.deps.files.remove(op.localCopy);
    await this.updateOp({ phase: 'tracking', localCopy: null, uploadName: null });
    await this.applyJob(job);
    this.showJob();
    this.schedulePoll();
  }

  private async applyJob(incoming: JobSnapshot): Promise<void> {
    if (!this.op) return;
    if (!shouldApply(this.job, incoming)) {
      if (this.job && incoming.revision < this.job.revision) {
        this.log('stale_ignored', { status: incoming.status, revision: incoming.revision });
      }
      return;
    }
    this.job = incoming;
    if (incoming.status === 'deleting' || incoming.status === 'deleted') this.deletion = 'none';
    this.log('job_updated', { status: incoming.status, revision: incoming.revision });
    await this.updateOp({
      job: { jobId: incoming.jobId, status: incoming.status, revision: incoming.revision },
      phase: incoming.status === 'deleted' ? 'deleted' : this.op.phase,
    });
  }

  private showJob(): void {
    if (!this.job) return;
    if (this.job.status === 'deleted') return this.setView({ step: 'deleted' });
    this.setView({ step: 'job', job: this.job, offline: this.offline, deletion: this.deletion });
  }

  private needsPolling(): boolean {
    const job = this.job;
    if (!job) return false;
    if (job.status === 'queued' || job.status === 'processing' || job.status === 'deleting') return true;
    return job.status === 'ready' && job.items === undefined;
  }

  private schedulePoll(): void {
    this.cancelPoll();
    if (!this.appActive || this.disposed || !(this.needsPolling() || this.offline)) return;
    const delay = this.offline ? Math.min(this.pollMs * 2 ** this.pollFailures, MAX_BACKOFF_MS) : this.pollMs;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.refreshJob();
    }, delay);
  }

  private cancelPoll(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private async failImport(reason: FailureReason): Promise<void> {
    this.cancelPoll();
    if (this.op?.localCopy) await this.deps.files.remove(this.op.localCopy);
    await this.updateOp({ phase: 'failed', failure: reason, localCopy: null, uploadName: null });
    this.log('failed', { reason });
    this.setView({ step: 'failed', reason });
  }

  private async hasLocalCopy(): Promise<boolean> {
    const uri = this.op?.localCopy;
    return uri ? (await this.deps.files.size(uri)) !== null : false;
  }

  private async updateOp(patch: Partial<ImportOp>): Promise<boolean> {
    if (!this.op) return false;
    this.op = { ...this.op, ...patch };
    return this.saveOp();
  }

  private async saveOp(): Promise<boolean> {
    if (!this.op) return false;
    try {
      await this.deps.storage.save(this.op);
      return true;
    } catch {
      return false;
    }
  }

  private isCurrentOp(id: string): boolean {
    return !this.disposed && this.op?.id === id;
  }

  private setView(view: ImportView): void {
    if (this.disposed) return;
    this.view = view;
    this.listeners.forEach((listener) => listener(view));
  }

  private log(event: LogEvent, fields?: LogFields): void {
    this.deps.log?.(event, fields);
  }
}
