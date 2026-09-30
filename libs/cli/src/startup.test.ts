import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** True for `{ type A, type B }`, which TypeScript erases. */
function allTypes(clause: string): boolean {
  const named = /^\{([^}]*)\}$/.exec(clause.trim());
  return (
    named !== null &&
    (named[1] as string)
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .every((part) => part.startsWith('type '))
  );
}

/** The value imports of one source file: specifiers not under `import type`. */
function valueImports(file: string): string[] {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  return [
    ...source.matchAll(/^import\s+(?!type\s)([^;]*?)\s+from\s+'([^']+)';/gms),
  ]
    .filter(([, clause]) => !allTypes(clause as string))
    .map(([, , specifier]) => specifier as string);
}

/** Every file bin.ts loads before main runs, following relative value imports. */
function startupGraph(): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue = ['./bin.ts'];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (seen.has(file)) continue;
    const imports = valueImports(file);
    seen.set(file, imports);
    for (const specifier of imports)
      if (specifier.startsWith('./'))
        queue.push(specifier.replace(/\.js$/, '.ts'));
  }
  return seen;
}

describe('the startup import graph', () => {
  it('loads neither @nexusdi/core nor graph.ts, so --help runs without core', () => {
    const graph = startupGraph();
    expect([...graph.keys()]).toContain('./main.ts');
    expect([...graph.keys()]).not.toContain('./graph.ts');
    for (const [file, imports] of graph)
      expect(
        imports.filter((specifier) => specifier.startsWith('@nexusdi/')),
        file,
      ).toEqual([]);
  });
});
