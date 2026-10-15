/**
 * Runs a fence marked `ts @import.meta.vitest @module` at module level.
 *
 * vite-plugin-doctest wraps every doctest fence in a test(), and Vitest
 * refuses a test() inside a running test. A README that shows Vitest
 * fixtures has to declare its own test() calls, so its fence runs where
 * Vitest collects tests: at module level.
 *
 * Two transforms do it, one on each side of doctest. markModuleFences, in
 * the pre transform, renames the marker to `ts @module`, which doctest does
 * not run, so doctest comments the fence out with the prose. moduleFences,
 * after doctest, puts the fence's code back where it was, inside the
 * `if (import.meta.vitest)` block and after the line that destructures
 * `expect`. Each fence becomes a block of its own, so two fences may declare
 * the same name.
 *
 * ts-blank-space strips the fence's types by overwriting them with spaces,
 * and the `//` doctest put before each line becomes two spaces, so every
 * line and column stays where the README has it. A failure in a module
 * fence, or in a doctest fence after one, reports its README line.
 *
 * A module fence runs inside a block, inside the `if (import.meta.vitest)`
 * block, so it cannot `export`, and Vitest does not hoist a `vi.mock` call
 * in it. ts-blank-space refuses TypeScript that emits code (an enum, a
 * namespace, a parameter property), and markModuleFences reports that line.
 */
import type { Plugin } from 'vite';
import tsBlankSpace from 'ts-blank-space';

import { readValueClaim } from './expect-comments.ts';

/** The fence info word that runs a doctest at module level. */
export const MODULE_MARKER = '@module';

/** Whether a fence info string marks the block as a module doctest. */
export const isModuleFence = (info: string): boolean =>
  info.split(/\s+/).includes(MODULE_MARKER);

const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;
/** The callees whose callback is a test body. */
const TEST_CALLS = /^(test|it)(\.(fails|only|skip|concurrent|sequential))?$/;

/** A module fence that cannot run as one. */
export class ModuleFenceError extends Error {
  // Explicit fields: Nx loads a vite.config.ts importing this module under
  // Node's strip-only TypeScript mode, which rejects parameter properties.
  readonly file: string;
  readonly line: number;

  constructor(file: string, line: number, reason: string) {
    super(`${file}:${line}: ${reason}`);
    this.name = 'ModuleFenceError';
    this.file = file;
    this.line = line;
  }
}

/** The 0-based line ranges of each test callback's body in `source`. */
async function testBodies(
  source: string,
): Promise<readonly (readonly [number, number])[]> {
  // Loaded on first use: a vite config that never meets a module fence never
  // pays for the TypeScript parser.
  const ts = (await import('typescript')).default;
  const file = ts.createSourceFile(
    'fence.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const lineOf = (pos: number) => file.getLineAndCharacterOfPosition(pos).line;
  const bodies: [number, number][] = [];
  const visit = (node: import('typescript').Node): void => {
    if (
      ts.isCallExpression(node) &&
      TEST_CALLS.test(node.expression.getText(file))
    ) {
      const callback = node.arguments.find(
        (arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg),
      );
      if (callback !== undefined)
        bodies.push([
          lineOf(callback.getStart(file)),
          lineOf(callback.getEnd()),
        ]);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return bodies;
}

/** Checks one fence body: a test() call, and every claim inside a test callback. */
async function check(
  body: readonly string[],
  first: number,
  file: string,
): Promise<void> {
  const source = body.join('\n');
  tsBlankSpace(source, (node) => {
    const at = node.getSourceFile().getLineAndCharacterOfPosition(node.pos);
    throw new ModuleFenceError(
      file,
      first + at.line,
      `a @module fence holds TypeScript that emits code (${node.getText()}), which the type strip cannot keep in place`,
    );
  });
  const bodies = await testBodies(source);
  if (bodies.length === 0)
    throw new ModuleFenceError(
      file,
      first,
      'a @module fence holds no test() call, so nothing in it runs as a test',
    );
  body.forEach((line, index) => {
    if (readValueClaim(line) === null) return;
    if (!bodies.some(([from, to]) => index >= from && index <= to))
      throw new ModuleFenceError(
        file,
        first + index,
        'a // -> claim in a @module fence must sit inside a test callback, where expect reports to that test',
      );
  });
}

/**
 * Renames each module fence's marker to `ts @module`, after checking it.
 * Returns the markdown unchanged when it holds no module fence.
 */
export async function markModuleFences(
  code: string,
  file: string,
): Promise<string> {
  const lines = code.split('\n');
  let fence: { marker: string; open: number } | null = null;
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const match = (lines[i] as string).match(FENCE);
    if (match === null) continue;
    const [, indent, marker, info] = match as unknown as [
      string,
      string,
      string,
      string,
    ];
    if (fence === null) {
      if (!isModuleFence(info)) {
        fence = { marker, open: -1 };
        continue;
      }
      const words = info
        .trim()
        .split(/\s+/)
        .filter((w) => w !== '@import.meta.vitest' && w !== MODULE_MARKER);
      lines[i] = `${indent}${marker}${[...words, MODULE_MARKER].join(' ')}`;
      fence = { marker, open: i };
      found = true;
    } else if (marker.startsWith(fence.marker)) {
      if (fence.open >= 0)
        await check(lines.slice(fence.open + 1, i), fence.open + 2, file);
      fence = null;
    }
  }
  return found ? lines.join('\n') : code;
}

/**
 * After doctest: puts each `ts @module` fence's code back in place, as a
 * block of its own, with its types blanked. doctest writes every line it
 * does not run as `//` and the line, and the `//` becomes two spaces.
 */
export function restoreModuleFences(code: string): string {
  const lines = code.split('\n');
  let open = -1;
  let marker = '';
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const match = line.startsWith('//') ? line.slice(2).match(FENCE) : null;
    if (open < 0) {
      if (match !== null && isModuleFence(match[3] as string)) {
        marker = match[2] as string;
        open = i;
      }
    } else if (match !== null && (match[2] as string).startsWith(marker)) {
      const body = lines
        .slice(open + 1, i)
        .map((l) => (l.startsWith('//') ? `  ${l.slice(2)}` : l));
      const stripped = tsBlankSpace(body.join('\n')).split('\n');
      lines.splice(open, i - open + 1, '{', ...stripped, '}');
      open = -1;
      changed = true;
    }
  }
  return changed ? lines.join('\n') : code;
}

/**
 * The transform after vite-plugin-doctest that runs each module fence at
 * module level. It must come after doctest in the plugin list.
 */
export function moduleFences(): Plugin {
  return {
    name: 'nexusdi:module-fences',
    enforce: 'pre',
    transform(code, id) {
      if (!(id.split('?')[0] as string).endsWith('.md')) return null;
      const restored = restoreModuleFences(code);
      // No line or column moves, so `map: null` keeps doctest's source map.
      return restored === code ? null : { code: restored, map: null };
    },
  };
}
