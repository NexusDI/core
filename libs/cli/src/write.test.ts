import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { emit, writeTo, type Output } from './write.js';

function slowStream(
  isTTY = false,
): Output & { chunks: unknown[]; done: boolean } {
  const stream = {
    chunks: [] as unknown[],
    done: false,
    isTTY,
    write(
      chunk: string | Uint8Array,
      callback: (error?: Error | null) => void,
    ) {
      stream.chunks.push(chunk);
      setTimeout(() => {
        stream.done = true;
        callback();
      }, 10);
      return false;
    },
  };
  return stream;
}

describe('writeTo', () => {
  it('resolves after the stream calls back', async () => {
    const stream = slowStream();
    await writeTo(stream, 'digraph {}\n');
    expect(stream.done).toBe(true);
  });
});

describe('emit', () => {
  it('writes to --out when given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexusdi-cli-'));
    await emit('graph\n', join(dir, 'g.mmd'), slowStream());
    expect(readFileSync(join(dir, 'g.mmd'), 'utf8')).toBe('graph\n');
  });

  it('exits 2 when --out cannot be written', async () => {
    await expect(
      emit('x', '/no/such/dir/g.mmd', slowStream()),
    ).rejects.toMatchObject({
      exitCode: 2,
    });
  });

  it('writes to stdout when --out is absent', async () => {
    const stream = slowStream();
    await emit('graph\n', null, stream);
    expect(stream.chunks).toEqual(['graph\n']);
  });
});
