/**
 * The snippets check of spec 4.3: each library's snippets.ts binds REACTOR
 * and COMPUTER interface-first and replaces REACTOR the way its docs show
 * for tests. The matrix compiles each with tsc under the library's
 * documented profile, and fails when COMPUTER does not resolve with the
 * real reactor and then with the fake.
 */
import { join } from 'node:path';

import { compile, runModule } from '@nexusdi/toolchain-matrix/recipes';

import { makeCell } from './consumer.ts';
import { FIXTURES, configsFor, type Library } from './libraries.ts';
import type { LibraryId, Profile } from './schema.ts';
import { firstLine, stripPaths } from './text.ts';

export interface SnippetResult {
  library: LibraryId;
  ok: boolean;
  message?: string;
}

/** Reads what snippets-check.mjs printed. */
export function parseSnippetOutput(line: string): {
  ok: boolean;
  message?: string;
} {
  let out: { real?: unknown; fake?: unknown };
  try {
    out = JSON.parse(line) as typeof out;
  } catch {
    return { ok: false, message: `no result: ${line}` };
  }
  if (out.real !== 'ReactorCore')
    return {
      ok: false,
      message: `the binding did not resolve: real is ${String(out.real)}`,
    };
  if (out.fake !== 'FakeReactor')
    return {
      ok: false,
      message: `the replacement did not take: fake is ${String(out.fake)}`,
    };
  return { ok: true };
}

/** The profile of the variant the library's docs use. */
function documentedProfile(lib: Library): Profile {
  const documented = Object.values(lib.variants).find((v) => v.documented);
  if (documented === undefined)
    throw new Error(`${lib.id} marks no documented variant`);
  return documented.profile;
}

export function checkSnippets(
  dir: string,
  libraries: readonly Library[],
): SnippetResult[] {
  return libraries.map((lib) => {
    const profile = documentedProfile(lib);
    const cellDir = makeCell(
      dir,
      `${lib.id}-snippets`,
      join(FIXTURES, lib.id, 'snippets.ts'),
      profile,
    );
    const configs = configsFor(profile, 'tsc');
    try {
      const modulePath = compile('tsc', cellDir, 'src/main.ts', configs);
      const stdout = runModule(
        'tsc',
        cellDir,
        join(dir, 'snippets-check.mjs'),
        configs,
        [modulePath],
      );
      return {
        library: lib.id,
        ...parseSnippetOutput(stdout.trim().split('\n').at(-1) ?? ''),
      };
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message: string };
      return {
        library: lib.id,
        ok: false,
        message: stripPaths(
          firstLine(err.stderr || err.stdout || err.message),
          cellDir,
        ),
      };
    }
  });
}
