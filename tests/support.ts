import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, open, readFile, readdir, rm, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockServer } from '../mobile-engineer-kit/mock-server.mjs';
import { ImportsApi } from '../src/core/api';
import { ImportController, type ImportView } from '../src/core/controller';
import type { FileFormat, Http, ImportOp, LocalFiles, OpStorage } from '../src/core/types';

export const FIXTURES = new URL('../mobile-engineer-kit/fixtures/', import.meta.url).pathname;

export type MockStats = {
  createRequests: number;
  newJobs: number;
  duplicateHits: number;
  acceptedBytes: number;
  deleteRequests: number;
};

export type Mock = {
  baseUrl: string;
  dir: string;
  scenario(mode: 'happy' | 'lost_ack' | 'stale_status' | 'delete_failure'): Promise<void>;
  stats(): Promise<MockStats>;
  close(): Promise<void>;
};

export async function startMock(): Promise<Mock> {
  const dir = await mkdtemp(join(tmpdir(), 'statement-import-'));
  const server = createMockServer({ statePath: join(dir, 'mock-state.json') });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    baseUrl,
    dir,
    async scenario(mode) {
      const res = await fetch(`${baseUrl}/__test/scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (res.status !== 200) throw new Error(`scenario ${mode}: ${res.status}`);
    },
    async stats() {
      const res = await fetch(`${baseUrl}/__test/state`);
      return (await res.json()).stats;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export class NodeHttp implements Http {
  uploads: Array<Record<string, string>> = [];
  deletes: Array<Record<string, string>> = [];
  onUpload?: () => Promise<void>;

  constructor(private readonly baseUrl: string) {}

  async request(method: 'GET' | 'DELETE', path: string, headers: Record<string, string> = {}) {
    if (method === 'DELETE') this.deletes.push(headers);
    const res = await fetch(this.baseUrl + path, { method, headers });
    return { status: res.status, body: await res.text() };
  }

  async upload(path: string, fileUri: string, headers: Record<string, string>) {
    this.uploads.push(headers);
    await this.onUpload?.();
    const body = await readFile(fileUri);
    const res = await fetch(this.baseUrl + path, { method: 'POST', headers, body });
    return { status: res.status, body: await res.text() };
  }
}

export class NodeFiles implements LocalFiles {
  readonly privateDir: string;
  released: string[] = [];

  constructor(root: string) {
    this.privateDir = join(root, 'imports');
  }

  async size(uri: string) {
    try {
      return (await stat(uri)).size;
    } catch {
      return null;
    }
  }

  async read(uri: string, offset: number, length: number) {
    const handle = await open(uri, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }

  async makePrivateCopy(uri: string, id: string, format: FileFormat) {
    await mkdir(this.privateDir, { recursive: true });
    const target = join(this.privateDir, `${id}.${format}`);
    await copyFile(uri, target);
    return target;
  }

  async remove(uri: string) {
    await rm(uri, { force: true });
  }

  async releasePicked(uri: string) {
    this.released.push(uri);
  }

  async removeLeftovers(keep: string | null) {
    const names = await readdir(this.privateDir).catch(() => [] as string[]);
    await Promise.all(
      names.map((name) => join(this.privateDir, name)).filter((path) => path !== keep).map((path) => rm(path, { force: true })),
    );
  }

  async list() {
    return readdir(this.privateDir).catch(() => [] as string[]);
  }
}

export class MemoryStorage implements OpStorage {
  value: ImportOp | null = null;

  async load() {
    return this.value ? structuredClone(this.value) : null;
  }

  async save(op: ImportOp) {
    this.value = structuredClone(op);
  }

  async clear() {
    this.value = null;
  }
}

export type Harness = {
  controller: ImportController;
  http: NodeHttp;
  files: NodeFiles;
  storage: MemoryStorage;
  views: ImportView[];
  events: string[];
};

export function createHarness(mock: Mock, shared?: { files?: NodeFiles; storage?: MemoryStorage }): Harness {
  const http = new NodeHttp(mock.baseUrl);
  const files = shared?.files ?? new NodeFiles(mock.dir);
  const storage = shared?.storage ?? new MemoryStorage();
  const events: string[] = [];
  const controller = new ImportController({
    api: new ImportsApi(http),
    files,
    storage,
    newId: randomUUID,
    pollMs: 50,
    log: (event) => events.push(event),
  });
  const views: ImportView[] = [];
  controller.subscribe((view) => views.push(view));
  return { controller, http, files, storage, views, events };
}

export function fixture(name: string) {
  return { uri: join(FIXTURES, name), name, size: null };
}

export async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export function stepOf(view: ImportView) {
  return view.step === 'job' ? `job:${view.job.status}` : view.step;
}
