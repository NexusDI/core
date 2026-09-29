import { describe, expect, it } from 'vitest';

import { main } from './main.js';
import type { Output } from './write.js';

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
});
