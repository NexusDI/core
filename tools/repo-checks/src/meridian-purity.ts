/**
 * The purity rules for the Meridian ship library.
 *
 * The physics files and the `*-model.ts` files stay free of DI, so none of
 * them imports `@nexusdi/`. A physics file holds laws that two systems
 * share, so it imports nothing from `systems/`. A `*.module.ts` file holds
 * tokens and providers and stays short enough to read at a glance. The
 * replay rules (no wall clock or unseeded random source under `src`) live in
 * the library's ESLint config, which reads the syntax tree, and the test
 * beside this file pins them.
 */

export interface SourceText {
  /** The path, relative to the library's `src` or any parent of it. */
  readonly path: string;
  readonly text: string;
}

/** The longest a `*.module.ts` file may be. */
export const MODULE_LINE_LIMIT = 120;

const NEXUSDI_IMPORT =
  /\bfrom\s+['"]@nexusdi\/|\bimport\s*\(?\s*['"]@nexusdi\/|\brequire\s*\(\s*['"]@nexusdi\//;

const SYSTEMS_IMPORT =
  /\bfrom\s+['"][^'"]*\/systems\/|\bimport\s*\(?\s*['"][^'"]*\/systems\/|\brequire\s*\(\s*['"][^'"]*\/systems\//;

/** One line per hit, as `path:line message`. */
export function impurities(files: readonly SourceText[]): string[] {
  const hits: string[] = [];

  for (const { path, text } of files) {
    const lines = text.split('\n');
    const inPhysics = /(^|\/)physics\//.test(path);
    const isModel = path.endsWith('-model.ts');

    lines.forEach((line, index) => {
      const at = `${path}:${index + 1}`;

      if (inPhysics && NEXUSDI_IMPORT.test(line)) {
        hits.push(`${at} imports @nexusdi/; physics files stay free of DI`);
      }

      if (isModel && NEXUSDI_IMPORT.test(line)) {
        hits.push(`${at} imports @nexusdi/; model files stay free of DI`);
      }

      if (inPhysics && SYSTEMS_IMPORT.test(line)) {
        hits.push(
          `${at} imports from systems/; physics files hold laws no system owns`,
        );
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
