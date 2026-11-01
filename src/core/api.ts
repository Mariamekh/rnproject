import type { Http, HttpResponse, JobSnapshot, JobStatus, RecurringCharge } from './types';

const STATUSES: readonly JobStatus[] = ['queued', 'processing', 'ready', 'deleting', 'deleted'];

export type CreateResult =
  | { kind: 'accepted'; job: JobSnapshot }
  | { kind: 'conflict' }
  | { kind: 'rejected'; status: number }
  | { kind: 'unknown' };

export type LookupResult =
  | { kind: 'found'; job: JobSnapshot }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

export type DeleteResult =
  | { kind: 'accepted'; job: JobSnapshot }
  | { kind: 'not_found' }
  | { kind: 'failed'; status: number }
  | { kind: 'unknown' };

function parseItem(raw: unknown): RecurringCharge | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (
    typeof item.id !== 'string' ||
    typeof item.merchant !== 'string' ||
    typeof item.amountMinor !== 'number' ||
    !Number.isInteger(item.amountMinor) ||
    typeof item.cadence !== 'string' ||
    typeof item.lastSeen !== 'string'
  ) {
    return null;
  }
  return {
    id: item.id,
    merchant: item.merchant,
    amountMinor: item.amountMinor,
    cadence: item.cadence,
    lastSeen: item.lastSeen,
  };
}

function parseJob(body: string): JobSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const data = parsed as Record<string, unknown>;
  const { jobId, status, revision } = data;
  if (typeof jobId !== 'string' || typeof revision !== 'number') return null;
  if (!STATUSES.includes(status as JobStatus)) return null;

  const job: JobSnapshot = { jobId, status: status as JobStatus, revision };
  if (status === 'ready') {
    if (typeof data.currency !== 'string' || !Array.isArray(data.items)) return null;
    const items = data.items.map(parseItem);
    if (items.some((item) => item === null)) return null;
    job.currency = data.currency;
    job.items = items as RecurringCharge[];
  }
  return job;
}

// A transport error (timeout, dropped connection) means the outcome is unknown, not that the request failed.
function settle(request: Promise<HttpResponse>): Promise<HttpResponse | null> {
  return request.catch(() => null);
}

export class ImportsApi {
  constructor(private readonly http: Http) {}

  async createImport(fileUri: string, key: string, fileName: string): Promise<CreateResult> {
    const res = await settle(
      this.http.upload('/imports', fileUri, {
        'Content-Type': 'application/octet-stream',
        'Idempotency-Key': key,
        'X-File-Name': fileName,
      }),
    );
    if (!res) return { kind: 'unknown' };
    if (res.status === 202) {
      const job = parseJob(res.body);
      return job ? { kind: 'accepted', job } : { kind: 'unknown' };
    }
    if (res.status === 409) return { kind: 'conflict' };
    if (res.status >= 400 && res.status < 500) return { kind: 'rejected', status: res.status };
    return { kind: 'unknown' };
  }

  async findJobByKey(key: string): Promise<LookupResult> {
    return this.fetchJob(`/imports/by-key/${encodeURIComponent(key)}`);
  }

  async getJob(jobId: string): Promise<LookupResult> {
    return this.fetchJob(`/imports/${encodeURIComponent(jobId)}`);
  }

  async deleteJob(jobId: string, key: string): Promise<DeleteResult> {
    const res = await settle(
      this.http.request('DELETE', `/imports/${encodeURIComponent(jobId)}`, { 'Idempotency-Key': key }),
    );
    if (!res) return { kind: 'unknown' };
    if (res.status === 202) {
      const job = parseJob(res.body);
      return job ? { kind: 'accepted', job } : { kind: 'unknown' };
    }
    if (res.status === 404) return { kind: 'not_found' };
    return { kind: 'failed', status: res.status };
  }

  private async fetchJob(path: string): Promise<LookupResult> {
    const res = await settle(this.http.request('GET', path));
    if (!res) return { kind: 'unavailable' };
    if (res.status === 404) return { kind: 'not_found' };
    if (res.status !== 200) return { kind: 'unavailable' };
    const job = parseJob(res.body);
    return job ? { kind: 'found', job } : { kind: 'unavailable' };
  }
}
