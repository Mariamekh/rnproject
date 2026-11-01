import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LocalFiles } from '../src/core/types';
import { MAX_FILE_BYTES, checkPickedFile, headerSafeName, sniffFormat } from '../src/core/validate';
import { NodeFiles, fixture } from './support';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('sniffFormat', () => {
  it('accepts a PDF only with header and trailer', () => {
    expect(sniffFormat(bytes('%PDF-1.7\n...'), bytes('...\n%%EOF\n'))).toBe('pdf');
    expect(sniffFormat(bytes('%PDF-1.7\n...'), bytes('truncated'))).toBeNull();
  });

  it('accepts the statement CSV header the same way the server does', () => {
    const csv = bytes('date,description,amount\n2026-09-01,x,-1.00\n');
    expect(sniffFormat(csv, csv)).toBe('csv');
    const crlf = bytes('date,description,amount\r\n2026-09-01,x,-1.00\r\n');
    expect(sniffFormat(crlf, crlf)).toBeNull();
  });

  it('rejects text that only claims to be a PDF', () => {
    const text = bytes('This is plain text, not a PDF.');
    expect(sniffFormat(text, text)).toBeNull();
  });
});

describe('checkPickedFile', () => {
  let dir: string;
  let files: NodeFiles;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'validate-'));
    files = new NodeFiles(dir);
  });

  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('accepts both statement fixtures', async () => {
    for (const name of ['statement.pdf', 'statement.csv']) {
      const result = await checkPickedFile(fixture(name), files);
      expect(result).toMatchObject({ ok: true, file: { format: name.split('.')[1] } });
    }
  });

  it('rejects spoofed.pdf by content', async () => {
    expect(await checkPickedFile(fixture('spoofed.pdf'), files)).toEqual({ ok: false, reason: 'unsupported_content' });
  });

  it('rejects a file over 10 MiB without reading it', async () => {
    const unreadable: LocalFiles = {
      size: async () => MAX_FILE_BYTES + 1,
      read: async () => {
        throw new Error('must not read');
      },
      makePrivateCopy: async () => {
        throw new Error('must not copy');
      },
      remove: async () => {},
      releasePicked: async () => {},
      removeLeftovers: async () => {},
    };
    const tooLarge = { ok: false, reason: 'too_large' };
    expect(await checkPickedFile({ uri: 'content://big', name: 'big.csv', size: null }, unreadable)).toEqual(tooLarge);
    expect(await checkPickedFile({ uri: 'content://big', name: 'big.csv', size: MAX_FILE_BYTES + 1 }, unreadable)).toEqual(
      tooLarge,
    );
  });

  it('accepts exactly 10 MiB', async () => {
    const path = join(dir, 'limit.csv');
    const header = 'date,description,amount\n';
    await writeFile(path, header + 'x'.repeat(MAX_FILE_BYTES - header.length));
    const result = await checkPickedFile({ uri: path, name: 'limit.csv', size: null }, files);
    expect(result).toMatchObject({ ok: true, file: { size: MAX_FILE_BYTES } });
  });

  it('rejects content that contradicts the extension', async () => {
    const path = join(dir, 'renamed.pdf');
    await writeFile(path, 'date,description,amount\n2026-09-01,x,-1.00\n');
    expect(await checkPickedFile({ uri: path, name: 'renamed.pdf', size: null }, files)).toEqual({
      ok: false,
      reason: 'type_mismatch',
    });
  });

  it('rejects an empty file', async () => {
    const path = join(dir, 'empty.csv');
    await writeFile(path, '');
    expect(await checkPickedFile({ uri: path, name: 'empty.csv', size: null }, files)).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('headerSafeName', () => {
  it('keeps ASCII names and encodes the rest', () => {
    expect(headerSafeName('statement.csv', 'csv')).toBe('statement.csv');
    expect(headerSafeName('выписка.pdf', 'pdf')).toBe(encodeURIComponent('выписка.pdf'));
    expect(headerSafeName('  ', 'pdf')).toBe('statement.pdf');
    expect(headerSafeName('a'.repeat(400), 'csv')).toHaveLength(255);
  });
});
