import { readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { tempDir } from '../test-support/temp.js';
import { parseEntryRef } from './entry.js';
import { checkOut, emit, writeTo, type Output } from './write.js';

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

describe('checkOut', () => {
  function project(): string {
    const dir = tempDir();
    writeFileSync(join(dir, 'app.module.js'), 'export default {};\n');
    writeFileSync(join(dir, 'plugins.js'), 'export const plugins = [];\n');
    symlinkSync(join(dir, 'app.module.js'), join(dir, 'link.js'));
    return dir;
  }

  it('exits 2 when --out is the entry, a --load file or the --plugins file', () => {
    const dir = project();
    const entry = parseEntryRef('app.module.js', dir);
    const plugins = parseEntryRef('plugins.js#plugins', dir);
    expect(() => checkOut(join(dir, 'app.module.js'), [entry])).toThrow(
      `--out ${join(dir, 'app.module.js')} is app.module.js, an input to this run.`,
    );
    expect(() => checkOut(join(dir, 'plugins.js'), [entry, plugins])).toThrow(
      /is plugins\.js, an input/,
    );
  });

  it('exits 2 when --out is a link to an input', () => {
    const dir = project();
    expect(() =>
      checkOut(join(dir, 'link.js'), [parseEntryRef('app.module.js', dir)]),
    ).toThrow(/is app\.module\.js, an input/);
  });

  it('allows a new file and a file that is no input', () => {
    const dir = project();
    const entry = parseEntryRef('app.module.js', dir);
    expect(() => checkOut(join(dir, 'graph.mmd'), [entry])).not.toThrow();
    expect(() => checkOut(join(dir, 'plugins.js'), [entry])).not.toThrow();
    expect(() => checkOut(null, [entry])).not.toThrow();
  });
});
