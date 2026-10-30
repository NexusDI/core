import { basename, dirname, join } from 'node:path';

import ts from 'typescript';

import {
  callablesOf,
  exportsOf,
  isErrorClass,
  surfaceProgram,
  type ExtraFile,
  type SurfacePackage,
} from './api-surface';
import { executable, hiddenLines, referencePageOf } from './reference-site';
import type { DocsPage } from './site';

/**
 * Every overload of an exported callable is called, on its package's
 * reference page, by a fence the repository compiles or runs.
 *
 * G10 (`doc-export-coverage`) asks that a callable's name appear in an
 * executable fence. A second overload added to a callable that already has
 * an example passes it with no example of its own, so `lazy(all(TOKEN))`
 * passes it while the page shows only `lazy(TOKEN)`.
 *
 * An overloaded callable is a callable (see `callablesOf`: an exported
 * function, an exported class's constructor, or a public method the class
 * declares) with two or more call or construct signatures. A callable with
 * one signature is G10's.
 *
 * Exercised is an overload some call on the package's reference page
 * resolves to, by the type checker. The call sits in an executable fence:
 * a `twoslash` fence or one marked `executed`, as G10 defines them, in `ts`
 * or `tsx`. Every such fence on every reference page compiles as its own
 * module in one program beside the libraries' sources, under the site's
 * compiler options with the `dom` lib (`surfaceProgram`). A fence's
 * `// @filename:` lines split it into files the way Twoslash splits one. A
 * call counts when it sits on a line a reader sees (`hiddenLines`), the
 * compiler reports no diagnostic inside it, and
 * `checker.getResolvedSignature` returns a signature whose declaration is the
 * overload's. A call, a `new`, a decorator, a tagged template and a JSX
 * element are each a call.
 *
 * An overload is keyed by its label and its declaration as the source
 * writes it, whitespace collapsed: `lazy<T>(dep: All<T>): LazyAll<T>`. The
 * label is the callable's (`lazy`, `new Token`, `Nexus.create`,
 * `Nexus#get`), so a key reads in a diff and survives a reorder.
 *
 * The allowance is the ratchet: it records the overloads the pages do not
 * call yet, per package, and an entry that is no longer needed fails.
 */

/** One overload, and whether a page's fence calls it. */
export interface OverloadCoverage {
  key: string;
  exercised: boolean;
}

/** One package's overloads, and the reference page its fences come from. */
export interface PackageOverloads {
  name: string;
  /** The reference page, workspace relative, or null when it has none. */
  page: string | null;
  overloads: OverloadCoverage[];
}

const collapse = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .replace(/([(<[]) /g, '$1')
    .replace(/ ([)>\]])/g, '$1')
    .trim();

/** A signature as its declaration writes it, or as the checker prints it. */
function printed(checker: ts.TypeChecker, signature: ts.Signature): string {
  const declaration = signature.getDeclaration() as
    ts.SignatureDeclaration | undefined;
  if (!declaration || !ts.isFunctionLike(declaration))
    return checker.signatureToString(
      signature,
      undefined,
      ts.TypeFormatFlags.NoTruncation,
    );
  const typeParameters = declaration.typeParameters
    ? `<${declaration.typeParameters.map((each) => each.getText()).join(', ')}>`
    : '';
  const parameters = declaration.parameters
    .map((each) => each.getText())
    .join(', ');
  const returns = declaration.type
    ? declaration.type.getText()
    : checker.typeToString(
        signature.getReturnType(),
        undefined,
        ts.TypeFormatFlags.NoTruncation,
      );
  return collapse(`${typeParameters}(${parameters}): ${returns}`);
}

/** Each overload of a package's overloaded callables, by its declaration. */
function overloadsOf(
  program: ts.Program,
  pkg: SurfacePackage,
  exempt: boolean,
): Map<ts.Declaration, string> {
  const checker = program.getTypeChecker();
  const found = new Map<ts.Declaration, string>();
  for (const each of exportsOf(program, pkg)) {
    if (exempt && isErrorClass(each)) continue;
    for (const { label, signatures } of callablesOf(checker, each)) {
      if (signatures.length < 2) continue;
      for (const signature of signatures) {
        const declaration = signature.getDeclaration();
        if (declaration)
          found.set(declaration, `${label}${printed(checker, signature)}`);
      }
    }
  }
  return found;
}

/** One file of a fence, with the line of the fence body each of its lines is. */
interface FenceFile extends ExtraFile {
  lines: number[];
}

/** One executable fence, split into its files. */
interface Fence {
  package: string;
  files: FenceFile[];
  /** The lines of the fence body a reader does not see. */
  hidden: ReadonlySet<number>;
}

const AUGMENTS = /^\s*declare\s+(module\s+['"]|global\b)/m;

const FILENAME = /^\s*\/\/\s*@filename:\s*(\S+)\s*$/;

/**
 * The files of every executable `ts` and `tsx` fence on a package's page,
 * each under a directory of its own beside the page, so a relative import
 * resolves from the page and no two fences share a module.
 */
function fenceFiles(root: string, pkg: string, page: DocsPage): Fence[] {
  const fences: Fence[] = [];
  page.fences.forEach((fence) => {
    if (!['ts', 'tsx'].includes(fence.lang)) return;
    if (!executable(fence.meta, fence.lang)) return;
    const dir = join(
      root,
      dirname(page.file),
      `.fence-${basename(page.file)}-${fence.line}`,
    );
    const hidden = hiddenLines(fence.body);
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
      hidden,
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

type CallLike =
  | ts.CallExpression
  | ts.NewExpression
  | ts.Decorator
  | ts.TaggedTemplateExpression
  | ts.JsxOpeningElement
  | ts.JsxSelfClosingElement;

const isCallLike = (node: ts.Node): node is CallLike =>
  ts.isCallExpression(node) ||
  ts.isNewExpression(node) ||
  ts.isDecorator(node) ||
  ts.isTaggedTemplateExpression(node) ||
  ts.isJsxOpeningElement(node) ||
  ts.isJsxSelfClosingElement(node);

/** The declarations the visible, error-free calls of one file resolve to. */
function resolvedIn(
  program: ts.Program,
  fence: Fence,
  file: FenceFile,
): Set<ts.Declaration> {
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file.path);
  const resolved = new Set<ts.Declaration>();
  if (!source) return resolved;
  const diagnostics = [
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
  ];
  const visit = (node: ts.Node): void => {
    if (isCallLike(node)) {
      const start = node.getStart(source);
      const line = source.getLineAndCharacterOfPosition(start).line;
      const failed = diagnostics.some(
        ({ start: at }) =>
          at !== undefined && at >= start && at < node.getEnd(),
      );
      if (!fence.hidden.has(file.lines[line] ?? -1) && !failed) {
        const declaration = checker
          .getResolvedSignature(node)
          ?.getDeclaration();
        if (declaration) resolved.add(declaration);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return resolved;
}

/**
 * Each package's overloads and whether its reference page calls each one.
 * `root` is the workspace root the pages' paths are relative to.
 */
export function readOverloads(
  root: string,
  pages: readonly DocsPage[],
  packages: readonly SurfacePackage[],
  exempt: ReadonlyMap<string, string>,
): PackageOverloads[] {
  const owners = packages.map((pkg) => ({
    pkg,
    page: referencePageOf(pages, pkg.name),
  }));
  const fences = owners.flatMap(({ pkg, page }) =>
    page ? fenceFiles(root, pkg.name, page) : [],
  );
  // A fence that augments a module or the global scope changes the types
  // every other fence in its program sees, so it compiles alone, the way
  // Twoslash compiles every fence. The rest share one program.
  const alone = fences.filter((fence) =>
    fence.files.some(({ text }) => AUGMENTS.test(text)),
  );
  const shared = fences.filter((fence) => !alone.includes(fence));
  const programs = [shared, ...alone.map((fence) => [fence])].map((group) => ({
    program: surfaceProgram(
      packages,
      group.flatMap((fence) => fence.files),
    ),
    group,
  }));
  const [main] = programs as [(typeof programs)[number]];

  return owners.map(({ pkg, page }) => {
    const exemptHere = exempt.has(pkg.name);
    const overloads = overloadsOf(main.program, pkg, exemptHere);
    const called = new Set<string>();
    for (const { program, group } of programs) {
      const keys =
        program === main.program
          ? overloads
          : overloadsOf(program, pkg, exemptHere);
      for (const fence of group)
        if (fence.package === pkg.name)
          for (const file of fence.files)
            for (const declaration of resolvedIn(program, fence, file)) {
              const key = keys.get(declaration);
              if (key !== undefined) called.add(key);
            }
    }
    return {
      name: pkg.name,
      page: page?.file ?? null,
      overloads: [...overloads]
        .map(([, key]) => ({ key, exercised: called.has(key) }))
        .sort((left, right) => left.key.localeCompare(right.key)),
    };
  });
}

export interface OverloadsInput {
  packages: PackageOverloads[];
  allowance: Record<string, { unexercised: string[] }>;
}

export function checkOverloads(input: OverloadsInput): string[] {
  const findings: string[] = [];
  const unexercisedBy = new Map<string, Set<string>>();

  for (const { name, page, overloads } of input.packages) {
    // G10 reports a package with no reference page.
    if (page === null) continue;
    const unexercised = new Set(
      overloads.filter((each) => !each.exercised).map((each) => each.key),
    );
    unexercisedBy.set(name, unexercised);
    const allowed = new Set(input.allowance[name]?.unexercised ?? []);
    for (const key of unexercised)
      if (!allowed.has(key))
        findings.push(
          `${name}: no twoslash fence, file= fence or reference example= region on ${basename(page)} calls the overload ${key}. A reader of that entry sees no example of it; add a call the compiler resolves to it, or record it in doc-overloads-allowance.json.`,
        );
  }

  for (const [name, entry] of Object.entries(input.allowance)) {
    const unexercised = unexercisedBy.get(name);
    if (!unexercised) {
      findings.push(
        `doc-overloads-allowance.json names ${name}, which is no library with a reference page; remove the entry`,
      );
      continue;
    }
    for (const key of entry.unexercised)
      if (!unexercised.has(key))
        findings.push(
          `${name}: the overload ${key} is called now, or is no overload; remove it from doc-overloads-allowance.json`,
        );
  }

  return findings;
}
