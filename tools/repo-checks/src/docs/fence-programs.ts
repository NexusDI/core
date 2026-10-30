import { basename, dirname, join } from 'node:path';

import ts from 'typescript';

import {
  surfaceProgram,
  type ExtraFile,
  type SurfacePackage,
} from './api-surface';
import { executable, headingName, hiddenLines } from './reference-site';
import type { DocsPage } from './site';

/**
 * The executable fences of the reference pages, compiled beside the
 * libraries' sources, for the guards that ask the type checker what a fence
 * does: `doc-option-keys` and `doc-overloads`.
 *
 * An executable fence is a `twoslash` fence or one marked `executed`, as G10
 * defines them, in `ts` or `tsx`. Each compiles as its own module under the
 * site's compiler options with the `dom` lib (`surfaceProgram`), in a
 * directory of its own beside its page, so a relative import resolves from
 * the page. A fence's `// @filename:` lines split it into files the way
 * Twoslash splits one.
 *
 * A fence that augments a module or the global scope changes the types every
 * other fence in its program sees, so it compiles in a program of its own,
 * the way Twoslash compiles every fence. The rest share one program.
 */

/** One file of a fence, with the line of the fence body each of its lines is. */
export interface FenceFile extends ExtraFile {
  lines: number[];
}

/** One executable fence of a package's reference page, split into its files. */
export interface Fence {
  package: string;
  /** The name of the `##` heading the fence sits under, or null above the first. */
  section: string | null;
  files: FenceFile[];
  /** The lines of the fence body a reader does not see. */
  hidden: ReadonlySet<number>;
}

/** One program, and the fences it compiles. */
export interface FenceProgram {
  program: ts.Program;
  fences: Fence[];
}

const AUGMENTS = /^\s*declare\s+(module\s+['"]|global\b)/m;

const FILENAME = /^\s*\/\/\s*@filename:\s*(\S+)\s*$/;

function fencesOf(root: string, pkg: string, page: DocsPage): Fence[] {
  const fences: Fence[] = [];
  page.fences.forEach((fence) => {
    if (!['ts', 'tsx'].includes(fence.lang)) return;
    if (!executable(fence.meta, fence.lang)) return;
    const dir = join(
      root,
      dirname(page.file),
      `.fence-${basename(page.file)}-${fence.line}`,
    );
    let current: { name: string; text: string[]; lines: number[] } = {
      name: `example.${fence.lang}`,
      text: [],
      lines: [],
    };
    const parts = [current];
    fence.body.split('\n').forEach((line, at) => {
      const named = FILENAME.exec(line);
      if (named) {
        current = { name: named[1] as string, text: [], lines: [] };
        parts.push(current);
        return;
      }
      current.text.push(line);
      current.lines.push(at);
    });
    fences.push({
      package: pkg,
      section: fence.section === null ? null : headingName(fence.section),
      hidden: hiddenLines(fence.body),
      files: parts
        .filter((part) => part.text.some((line) => line.trim() !== ''))
        .map((part) => ({
          path: join(dir, part.name),
          text: part.text.join('\n'),
          lines: part.lines,
        })),
    });
  });
  return fences;
}

/**
 * The programs compiling every executable fence of each package's page.
 * The first program always exists, so a guard can read the libraries from
 * it when no page has a fence. `root` is the workspace root the pages' paths
 * are relative to.
 */
export function fencePrograms(
  root: string,
  pages: ReadonlyMap<string, DocsPage | undefined>,
  packages: readonly SurfacePackage[],
): [FenceProgram, ...FenceProgram[]] {
  const fences = packages.flatMap((pkg) => {
    const page = pages.get(pkg.name);
    return page ? fencesOf(root, pkg.name, page) : [];
  });
  const alone = fences.filter((fence) =>
    fence.files.some(({ text }) => AUGMENTS.test(text)),
  );
  const shared = fences.filter((fence) => !alone.includes(fence));
  const [first, ...rest] = [shared, ...alone.map((fence) => [fence])].map(
    (group) => ({
      program: surfaceProgram(
        packages,
        group.flatMap((fence) => fence.files),
      ),
      fences: group,
    }),
  );
  return [first as FenceProgram, ...rest];
}

/**
 * Calls `visit` for every node of a fence file that starts on a line a
 * reader sees, with whether the compiler reports a diagnostic inside it.
 */
export function forEachShownNode(
  program: ts.Program,
  fence: Fence,
  file: FenceFile,
  visit: (node: ts.Node, failed: boolean) => void,
): void {
  const source = program.getSourceFile(file.path);
  if (!source) return;
  const diagnostics = [
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
  ];
  const walk = (node: ts.Node): void => {
    const start = node.getStart(source);
    const line = source.getLineAndCharacterOfPosition(start).line;
    if (!fence.hidden.has(file.lines[line] ?? -1))
      visit(
        node,
        diagnostics.some(
          ({ start: at }) =>
            at !== undefined && at >= start && at < node.getEnd(),
        ),
      );
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(source, walk);
}
