import { File, UploadType } from 'expo-file-system';
import type { Http } from '../core/types';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8787';

const REQUEST_TIMEOUT_MS = 10_000;
// A stalled upload is cut natively after 60 s without data (URLSession, OkHttp). This cap only
// bounds a slow one: 30 s plus the file at 16 KB/s, so about 11 minutes for 10 MB.
const UPLOAD_BASE_MS = 30_000;
const UPLOAD_MIN_BYTES_PER_MS = 16;

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export const http: Http = {
  request(method, path, headers) {
    return withTimeout(REQUEST_TIMEOUT_MS, async (signal) => {
      const res = await fetch(API_URL + path, { method, headers, signal });
      return { status: res.status, body: await res.text() };
    });
  },

  async upload(path, fileUri, headers) {
    const file = new File(fileUri);
    return withTimeout(UPLOAD_BASE_MS + file.size / UPLOAD_MIN_BYTES_PER_MS, async (signal) => {
      const res = await file.upload(API_URL + path, {
        httpMethod: 'POST',
        uploadType: UploadType.BINARY_CONTENT,
        headers,
        sessionType: 'foreground',
        signal,
      });
      return { status: res.status, body: res.body };
    });
  },
};
