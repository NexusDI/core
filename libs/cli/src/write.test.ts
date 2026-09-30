import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { tempDir } from '../test-support/temp.js';
import { emit, writeTo, type Output } from './write.js';

function slowStream(): Output & { chunks: unknown[]; done: boolean } {
  const stream = {
    chunks: [] as unknown[],
    done: false,
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

function failingStream(code: string): Output {
  return {
    write(_chunk, callback) {
      setTimeout(() =>
        callback(Object.assign(new Error(`write ${code}`), { code })),
      );
      return false;
    },
  };
}

describe('writeTo', () => {
  it('resolves after the stream calls back', async () => {
    const stream = slowStream();
    await writeTo(stream, 'digraph {}\n');
    expect(stream.done).toBe(true);
  });

  it('resolves when the reader has closed the pipe', async () => {
    await expect(writeTo(failingStream('EPIPE'), 'x')).resolves.toBeUndefined();
  });

  it('rejects for any other write error', async () => {
    await expect(writeTo(failingStream('EIO'), 'x')).rejects.toMatchObject({
      code: 'EIO',
    });
  });
});

describe('emit', () => {
  it('writes to --out when given', async () => {
    const dir = tempDir();
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

  it('exits 2 when stdout cannot be written', async () => {
    await expect(emit('x', null, failingStream('EIO'))).rejects.toMatchObject({
      exitCode: 2,
      message: 'cannot write to stdout: write EIO',
    });
  });

  it('writes to stdout when --out is absent', async () => {
    const stream = slowStream();
    await emit('graph\n', null, stream);
    expect(stream.chunks).toEqual(['graph\n']);
  });
});
