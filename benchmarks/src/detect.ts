/** When a probe's mistake surfaced (spec 4.6), from what the probe run saw. */
export function detectedAt(r: {
  typecheckFailed: boolean;
  buildOk: boolean;
  loadError: string | null;
  readyError: string | null;
  resolveError: string | null;
}) {
  if (r.typecheckFailed) return 'typecheck' as const;
  if (r.loadError !== null || r.readyError !== null) return 'create' as const;
  if (r.resolveError !== null) return 'first-resolve' as const;
  return 'never' as const;
}
/** How many of the two mistakes the first error names, ignoring case. */
export function countReported(
  message: string,
  names: readonly [string, string],
): 0 | 1 | 2 {
  const text = message.toLowerCase();
  return names.filter((n) => text.includes(n.toLowerCase())).length as
    0 | 1 | 2;
}
