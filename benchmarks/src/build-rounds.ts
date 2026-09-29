/** The round plan and the headline rule of the build-time driver (spec 4.7, Build time). */
import { orderFor } from '@nexusdi/bench-kit';

/** Every cell once per round, in that round's row of the balanced square. */
export function planRounds<T>(
  cells: readonly T[],
  rounds: number,
  seed: number,
): T[][] {
  return Array.from({ length: rounds }, (_, r) =>
    orderFor(r, cells.length, seed).map((i) => cells[i]),
  );
}

/**
 * A library's headline cell: its fastest median among cells that pass the
 * matrix and use a toolchain its docs name.
 */
export function headlineOf(
  lib: { documentedToolchains: 'any' | readonly string[] },
  cells: ReadonlyArray<{
    variant: string;
    toolchain: string;
    median: number;
    outcome: string;
  }>,
) {
  const ok = cells.filter(
    (c) =>
      c.outcome === 'pass' &&
      (lib.documentedToolchains === 'any' ||
        lib.documentedToolchains.includes(c.toolchain)),
  );
  if (ok.length === 0) return null;
  const best = ok.reduce((a, b) => (b.median < a.median ? b : a));
  return { variant: best.variant, toolchain: best.toolchain };
}
