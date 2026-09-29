/** Spec 4.7 item 6: no container resolves in under 2 ns, so a median below it means an engine dropped the work. */
export function checkFloor(
  rows: ReadonlyArray<{
    library: string;
    variant: string;
    scenario: string;
    stats: { median: number };
  }>,
): void {
  for (const r of rows)
    if (r.stats.median < 2)
      throw new Error(
        `below the 2 ns floor: ${r.library}/${r.variant} ${r.scenario} median ${r.stats.median} ns`,
      );
}
