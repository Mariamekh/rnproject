export type FileFormat = 'pdf' | 'csv';

export type JobStatus = 'queued' | 'processing' | 'ready' | 'deleting' | 'deleted';

export type RecurringCharge = {
  id: string;
  merchant: string;
  amountMinor: number;
  cadence: string;
  lastSeen: string;
};

export type JobSnapshot = {
  jobId: string;
  status: JobStatus;
  revision: number;
  currency?: string;
  items?: RecurringCharge[];
};

export type ImportPhase = 'sending' | 'uncertain' | 'tracking' | 'deleting' | 'deleted' | 'failed';

export type ImportOp = {
  id: string;
  key: string;
  uploadName: string | null;
  localCopy: string | null;
  phase: ImportPhase;
  job: Pick<JobSnapshot, 'jobId' | 'status' | 'revision'> | null;
  deleteKey: string | null;
  failure: FailureReason | null;
};

export type Rejection = 'too_large' | 'empty' | 'unreadable' | 'unsupported_content' | 'type_mismatch';

export type FailureReason = 'conflict' | 'server_rejected' | 'job_missing' | 'copy_failed' | 'storage_failed';

export type PickedFile = {
  uri: string;
  name: string;
  size: number | null;
};

export type CheckedFile = {
  uri: string;
  name: string;
  size: number;
  format: FileFormat;
};

export interface LocalFiles {
  size(uri: string): Promise<number | null>;
  read(uri: string, offset: number, length: number): Promise<Uint8Array>;
  makePrivateCopy(uri: string, id: string, format: FileFormat): Promise<string>;
  remove(uri: string): Promise<void>;
  releasePicked(uri: string): Promise<void>;
  removeLeftovers(keep: string | null): Promise<void>;
}

export interface OpStorage {
  load(): Promise<ImportOp | null>;
  save(op: ImportOp): Promise<void>;
  clear(): Promise<void>;
}

export type HttpResponse = { status: number; body: string };

export interface Http {
  request(method: 'GET' | 'DELETE', path: string, headers?: Record<string, string>): Promise<HttpResponse>;
  upload(path: string, fileUri: string, headers: Record<string, string>): Promise<HttpResponse>;
}
