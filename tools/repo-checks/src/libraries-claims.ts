/**
 * What benchmarks/libraries.json and the competitor fixtures must agree on
 * (benchmarks spec 9, libraries-claims). Every claim cites a source and was
 * checked against the pinned version, and every competitor fixture's
 * header cites the library's docs and names the pin, so a version bump
 * that nobody re-read fails here.
 *
 * The IO is passed in, so the rule is tested against fixtures as well as
 * against this repository.
 */
export interface ClaimedLibrary {
  id: string;
  version: string;
  docs: string;
  claims: ReadonlyArray<{ source?: string; verifiedAgainst?: string }>;
}

/**
 * The faults, one line each. `headers` maps a fixture path relative to
 * benchmarks/fixtures (probes/ dropped) to its header comment.
 */
export function claimFaults(
  libs: readonly ClaimedLibrary[],
  headers: ReadonlyMap<string, string>,
): string[] {
  const faults: string[] = [];
  for (const lib of libs) {
    lib.claims.forEach((c, i) => {
      if (!c.source) faults.push(`${lib.id} claim ${i} has no source`);
      if (c.verifiedAgainst !== lib.version)
        faults.push(
          `${lib.id} claim ${i} verified against ${c.verifiedAgainst}, pinned ${lib.version}`,
        );
    });
    if (lib.id === 'nexusdi') continue;
    for (const [path, header] of headers) {
      if (!path.startsWith(`${lib.id}/`)) continue;
      if (!header.includes(lib.docs))
        faults.push(`${path} does not cite ${lib.docs}`);
      if (!header.includes(lib.version))
        faults.push(`${path} does not name version ${lib.version}`);
    }
  }
  return faults;
}

/** A fixture's header: everything before its first import. */
export function headerOf(text: string): string {
  const at = text.search(/^\s*import\s/m);
  return at === -1 ? text : text.slice(0, at);
}
