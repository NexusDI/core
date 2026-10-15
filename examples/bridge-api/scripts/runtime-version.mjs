/**
 * Whether `reported`, the output of `<leg> --version`, names exactly the
 * `pinned` version. Deno prints `deno <version> (...)` on its first line,
 * then the V8 and TypeScript versions; Bun prints the bare version.
 *
 * @param {'deno' | 'bun'} leg
 * @param {string} reported
 * @param {string} pinned
 */
export function reportsPin(leg, reported, pinned) {
  if (leg === 'deno') return /^deno (\S+)/m.exec(reported)?.[1] === pinned;
  return reported.trim() === pinned;
}
