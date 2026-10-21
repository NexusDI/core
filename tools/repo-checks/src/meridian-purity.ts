/**
 * The purity rules for the Meridian ship library.
 *
 * The simulation replays from a seed, so no file under its `src` may read
 * the wall clock, a timer or an unseeded random source. The physics files
 * stay free of DI, so no file under `physics/` imports `@nexusdi/`. A
 * `*.module.ts` file holds tokens and providers and stays short enough to
 * read at a glance. A comment that names a banned call counts as a hit,
 * which keeps the scan a plain text match.
 */

export interface SourceText {
  /** The path, relative to the library's `src` or any parent of it. */
  readonly path: string;
  readonly text: string;
}

/** The longest a `*.module.ts` file may be. */
export const MODULE_LINE_LIMIT = 120;

const BANNED: readonly (readonly [RegExp, string])[] = [
  [/\bMath\.random\b/, 'Math.random'],
  [/\bDate\.now\b/, 'Date.now'],
  [/\bnew\s+Date\b/, 'new Date'],
  // Date() without new returns the wall clock as a string.
  [/(?<!new\s+)\bDate\s*\(/, 'Date()'],
  [/\bperformance\.now\b/, 'performance.now'],
  [/\bprocess\.hrtime\b/, 'process.hrtime'],
  [/\bsetTimeout\b/, 'setTimeout'],
  [/\bsetInterval\b/, 'setInterval'],
  [/\bsetImmediate\b/, 'setImmediate'],
  [/\bcrypto\.getRandomValues\b/, 'crypto.getRandomValues'],
  [/\bcrypto\.randomUUID\b/, 'crypto.randomUUID'],
];

const NEXUSDI_IMPORT =
  /\bfrom\s+['"]@nexusdi\/|\bimport\s*\(?\s*['"]@nexusdi\/|\brequire\s*\(\s*['"]@nexusdi\//;

/** One line per hit, as `path:line message`. */
export function impurities(files: readonly SourceText[]): string[] {
  const hits: string[] = [];

  for (const { path, text } of files) {
    const lines = text.split('\n');
    const inPhysics = /(^|\/)physics\//.test(path);

    lines.forEach((line, index) => {
      const at = `${path}:${index + 1}`;

      for (const [pattern, name] of BANNED) {
        if (pattern.test(line)) {
          hits.push(
            `${at} names ${name}; the simulation must replay from a seed`,
          );
        }
      }

      if (inPhysics && NEXUSDI_IMPORT.test(line)) {
        hits.push(`${at} imports @nexusdi/; physics files stay free of DI`);
      }
    });

    const count = text.endsWith('\n') ? lines.length - 1 : lines.length;

    if (path.endsWith('.module.ts') && count > MODULE_LINE_LIMIT) {
      hits.push(
        `${path}:1 is ${count} lines; a module file stays within ${MODULE_LINE_LIMIT}`,
      );
    }
  }

  return hits;
}
