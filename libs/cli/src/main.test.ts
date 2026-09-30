import { describe, expect, it, vi } from 'vitest';

import { main } from './main.js';
import { cliVersion } from './version.js';
import type { Output } from './write.js';

const noCore = vi.hoisted(() => ({ on: false }));

vi.mock('./resolve.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./resolve.js')>();
  return {
    ...actual,
    resolveFrom: (specifier: string, fromFile: string) =>
      noCore.on && specifier === '@nexusdi/core'
        ? null
        : actual.resolveFrom(specifier, fromFile),
  };
});

function stream(isTTY: boolean): Output & { text: () => string } {
  const chunks: string[] = [];
  return {
    isTTY,
    write(chunk, callback) {
      chunks.push(
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
      );
      callback();
      return true;
    },
    text: () => chunks.join(''),
  };
}

describe('main', () => {
  it('exits 2 before loading anything when PNG would go to a terminal', async () => {
    const stdout = stream(true);
    const stderr = stream(false);
    const code = await main(['graph', 'missing.module.ts', '-f', 'png'], {
      stdout,
      stderr,
      cwd: '/nowhere',
    });
    expect(code).toBe(2);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toBe(
      'nexusdi: PNG is binary, and stdout is a terminal.\n  Pass --out graph.png, or pipe the output.\n',
    );
  });

  describe('without @nexusdi/core', () => {
    const run = async (argv: readonly string[]) => {
      const stdout = stream(false);
      const stderr = stream(false);
      noCore.on = true;
      try {
        const code = await main(argv, { stdout, stderr, cwd: '/nowhere' });
        return { code, stdout: stdout.text(), stderr: stderr.text() };
      } finally {
        noCore.on = false;
      }
    };

    it('exits 3 with the install line for a graph command', async () => {
      const version = cliVersion();
      expect(await run(['graph', 'meridian.module.js'])).toEqual({
        code: 3,
        stdout: '',
        stderr: `nexusdi: @nexusdi/core ${version} is required next to @nexusdi/cli ${version}; found none.\n  Install it: npm i -D @nexusdi/core@${version}\n`,
      });
    });

    it('still prints help and the version', async () => {
      expect((await run(['--help'])).code).toBe(0);
      expect(await run(['--version'])).toMatchObject({
        code: 0,
        stdout: `${cliVersion()}\n`,
      });
    });
  });
});
