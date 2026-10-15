import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { globSync } from 'tinyglobby';

/**
 * The adapters' shared files (integrations spec 3.7). The owner kept them as
 * copies, P4's named exception, so each copy must stay byte-identical to the
 * first one in path order. A change to one is a change to all, in one commit.
 */
const SHARED = ['request-scope.ts', 'dispose-with-body.ts'] as const;

export interface SharedCopies {
  readonly violations: readonly string[];
  /** Each shared file's copies, as paths relative to the root, sorted. */
  readonly copies: Readonly<Record<string, readonly string[]>>;
}

export function sharedCopies(root: string): SharedCopies {
  const violations: string[] = [];
  const copies: Record<string, string[]> = {};
  for (const name of SHARED) {
    const paths = globSync(`libs/*/src/internal/${name}`, { cwd: root }).sort();
    copies[name] = paths;
    const [first, ...rest] = paths;
    if (first === undefined) continue;
    const reference = readFileSync(join(root, first), 'utf8');
    for (const path of rest)
      if (readFileSync(join(root, path), 'utf8') !== reference)
        violations.push(
          `${path} differs from ${first}; edit every copy of ${name} in one commit`,
        );
  }
  return { violations, copies };
}
