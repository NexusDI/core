import { basename } from 'node:path';

import ts from 'typescript';

import {
  callablesOf,
  exportsOf,
  isErrorClass,
  type SurfacePackage,
} from './api-surface';
import { fencePrograms, forEachShownNode } from './fence-programs';
import { referencePageOf } from './reference-site';
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
 * resolves to, by the type checker. The call sits in an executable fence,
 * compiled as `fence-programs.ts` compiles one. A call counts when it sits
 * on a line a reader sees (`hiddenLines`), the compiler reports no
 * diagnostic inside the statement or class member that holds it, and
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
  const pageOf = new Map(
    packages.map((pkg) => [pkg.name, referencePageOf(pages, pkg.name)]),
  );
  const programs = fencePrograms(root, pageOf, packages);

  return packages.map((pkg) => {
    const exemptHere = exempt.has(pkg.name);
    const overloads = overloadsOf(programs[0].program, pkg, exemptHere);
    const called = new Set<string>();
    for (const [at, { program, fences }] of programs.entries()) {
      const keys = at === 0 ? overloads : overloadsOf(program, pkg, exemptHere);
      const checker = program.getTypeChecker();
      for (const fence of fences)
        if (fence.package === pkg.name)
          for (const file of fence.files)
            forEachShownNode(program, fence, file, (node, failed) => {
              if (failed || !isCallLike(node)) return;
              const declaration = checker
                .getResolvedSignature(node)
                ?.getDeclaration();
              const key = declaration && keys.get(declaration);
              if (key !== undefined) called.add(key);
            });
    }
    return {
      name: pkg.name,
      page: pageOf.get(pkg.name)?.file ?? null,
      overloads: [...overloads.values()]
        .map((key) => ({ key, exercised: called.has(key) }))
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
