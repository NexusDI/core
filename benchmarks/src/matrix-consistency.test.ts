import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const toolchainRows: Array<{
  toolchain: string;
  variant: string;
  result: string;
}> = JSON.parse(
  readFileSync(
    require.resolve('@nexusdi/toolchain-matrix/toolchain-matrix.json'),
    'utf8',
  ),
);
const matrixPath = join(import.meta.dirname, '..', 'results', 'matrix.json');

describe('the NexusDI cells', () => {
  it('agree with the toolchain matrix on pass or fail', () => {
    const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
    for (const cell of matrix.cells.filter(
      (c: { library: string }) => c.library === 'nexusdi',
    )) {
      const row = toolchainRows.find(
        (r) => r.toolchain === cell.toolchain && r.variant === cell.variant,
      );
      expect(row, `${cell.variant} on ${cell.toolchain}`).toBeDefined();
      expect(
        cell.outcome === 'pass',
        `${cell.variant} on ${cell.toolchain}`,
      ).toBe(row?.result === 'pass');
    }
  });
});
