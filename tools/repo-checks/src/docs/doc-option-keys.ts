import { basename } from 'node:path';

import ts from 'typescript';

import {
  callablesOf,
  exportsOf,
  isErrorClass,
  isForeignDeclaration,
  type Callable,
  type SurfaceExport,
  type SurfacePackage,
} from './api-surface';
import { headingName, hiddenLines, referencePageOf } from './reference-site';
import { stripFences, type DocsPage } from './site';

/**
 * Every key of an options type is named on its package's reference page,
 * under the heading of the export that takes it.
 *
 * G10 (`doc-export-coverage`) catches a new export with no entry. It does
 * not catch a new key on an options type that already has one, so a key such
 * as `imports` on `load()`'s options passes it undocumented.
 *
 * An options type is an object type a caller writes and hands to a callable:
 *
 * - a type literal written in a library's own declarations, alone or as a
 *   member of an intersection, such as `{ readonly request?: NexusRequest }`
 *   or `Omit<ModuleConfig, 'providers'> & { providers?: … }`;
 * - an interface or type alias whose name ends in `Options`, `Props`,
 *   `Config` or `Definition`, unless an exported callable of any library
 *   returns it. `defineModule()` returns a `ModuleDefinition`, so a
 *   `ModuleDefinition` is a value the library builds, and `load()` and
 *   devtools' `inspect()` take it as a module, never as options.
 *
 * Arrays, tuples, functions, class instances and types declared in a
 * TypeScript lib or under `node_modules` are no options type. A parameter
 * typed by a type parameter is read through its constraint, a rest
 * parameter through its tuple's elements, and a union through each member.
 *
 * A key is every property of the type the package itself declares, the
 * inherited ones included, except a property typed `undefined` or `never`,
 * which a union member declares only to rule a sibling's key out.
 *
 * Each key is owed under one or more `##` headings:
 *
 * - each callable that takes the type owes it under its export's heading.
 *   A callable is an exported function, an exported class's constructor, or
 *   a public static or instance method the class declares, which the page
 *   documents under the class's heading (`Nexus#load` under `## Nexus`);
 * - an exported options type owes its own keys under its own heading.
 *
 * Named is the key spelled as a whole word in that section's code: inside a
 * code span of the prose, or on a line a reader sees of any fence in the
 * section (`hiddenLines`), after regions and reference directives expand.
 * The section runs from the heading to the next `##`. A bare word in prose
 * does not count, since `imports` and `deps` are also English. The caller
 * drops each entry's signature block, which names every key of an options
 * type and explains none.
 *
 * G10 owns a missing page and a missing heading, so a key whose heading is
 * absent is skipped here. Error classes of an exempt package are skipped as
 * G10 skips them.
 *
 * The allowance is the ratchet: it records each key the pages do not name
 * yet as `"<heading>: <type>.<key>"`, per package, and an entry no longer
 * needed fails. An anonymous type is written as the callable and parameter
 * that take it: `"Nexus: Nexus#createScope(options).request"`.
 */

/** One key a reference page owes under one heading. */
export interface OptionKey {
  /** The export whose `##` section owes the key. */
  heading: string;
  /** The options type: its name, or `<callable>(<parameter>)` for a literal. */
  type: string;
  key: string;
  /** What owes it, for the finding: a callable's label, or the type itself. */
  via: string;
}

/** The allowance entry, and the identity of a key, as the file spells it. */
export const optionKeyId = (each: OptionKey): string =>
  `${each.heading}: ${each.type}.${each.key}`;

const SUFFIX = /(Options|Props|Config|Definition)$/;

/** The symbol that names a type: its alias, else its own symbol. */
const nameOf = (type: ts.Type): ts.Symbol | undefined =>
  type.aliasSymbol ?? type.getSymbol();

function isLiteral(program: ts.Program, type: ts.Type): boolean {
  const declarations = type.getSymbol()?.declarations ?? [];
  return (
    declarations.length > 0 &&
    declarations.every(
      (declaration) =>
        ts.isTypeLiteralNode(declaration) &&
        !isForeignDeclaration(program, declaration),
    )
  );
}

/** The parts of a parameter's type to read: union members, constraints, tuple elements. */
function partsOf(
  checker: ts.TypeChecker,
  type: ts.Type,
  rest: boolean,
): ts.Type[] {
  let current = checker.getNonNullableType(type);
  if (current.flags & (ts.TypeFlags.TypeParameter | ts.TypeFlags.Conditional))
    current = checker.getBaseConstraintOfType(current) ?? current;
  const members = current.isUnion() ? current.types : [current];
  if (!rest) return members.map((member) => checker.getNonNullableType(member));
  return members.flatMap((member) =>
    checker.isTupleType(member)
      ? checker
          .getTypeArguments(member as ts.TypeReference)
          .flatMap((element) => partsOf(checker, element, false))
      : [],
  );
}

interface Reader {
  program: ts.Program;
  checker: ts.TypeChecker;
  /** The named types an exported callable of any library returns. */
  returned: ReadonlySet<ts.Symbol>;
}

/**
 * The name an options type goes by, `'literal'` for one with no name of its
 * own, or null when the type is no options type.
 */
function optionsName(reader: Reader, type: ts.Type): string | null {
  const { program, checker, returned } = reader;
  if (type.isIntersection())
    return type.types.some((part) => optionsName(reader, part) !== null)
      ? (named(type) ?? 'literal')
      : null;
  if (!(type.flags & ts.TypeFlags.Object)) return null;
  if (type.getCallSignatures().length > 0) return null;
  if (type.getConstructSignatures().length > 0) return null;
  if (checker.isArrayType(type) || checker.isTupleType(type)) return null;
  const symbol = type.getSymbol();
  if (symbol && symbol.flags & ts.SymbolFlags.Class) return null;
  if (isLiteral(program, type)) return named(type) ?? 'literal';
  return named(type);

  function named(each: ts.Type): string | null {
    const name = nameOf(each);
    if (!name || !SUFFIX.test(name.getName()) || returned.has(name))
      return null;
    const declarations = name.declarations ?? [];
    if (
      declarations.some((declaration) =>
        isForeignDeclaration(program, declaration),
      )
    )
      return null;
    return name.getName();
  }
}

/** The keys of an options type the package declares. */
function keysOf({ program, checker }: Reader, type: ts.Type): string[] {
  return checker
    .getPropertiesOfType(type)
    .filter((property) => {
      const name = property.getName();
      if (name.startsWith('__') || name.startsWith('#')) return false;
      const declarations = property.declarations ?? [];
      if (
        declarations.length === 0 ||
        declarations.every((declaration) =>
          isForeignDeclaration(program, declaration),
        )
      )
        return false;
      const own = checker.getNonNullableType(checker.getTypeOfSymbol(property));
      return !(own.flags & ts.TypeFlags.Never);
    })
    .map((property) => property.getName());
}

/** The named types every callable returns, awaited and split into union members. */
function returnedBy(
  checker: ts.TypeChecker,
  callables: readonly Callable[],
): Set<ts.Symbol> {
  const found = new Set<ts.Symbol>();
  for (const { signatures } of callables)
    for (const signature of signatures) {
      const type = checker.getAwaitedType(signature.getReturnType());
      if (!type) continue;
      for (const member of type.isUnion() ? type.types : [type]) {
        const name = nameOf(member);
        if (name) found.add(name);
      }
    }
  return found;
}

/** The callables of a package, its exempt error classes left out. */
function surfaceOf(
  program: ts.Program,
  pkg: SurfacePackage,
  exempt: boolean,
): { exports: SurfaceExport[]; callables: Callable[] } {
  const checker = program.getTypeChecker();
  const exports = exportsOf(program, pkg).filter(
    (each) => !(exempt && isErrorClass(each)),
  );
  return {
    exports,
    callables: exports.flatMap((each) => callablesOf(checker, each)),
  };
}

/**
 * Every key each package's reference page owes, sorted by its id. A type
 * any package's callable returns is no options type in any package, so
 * `@nexusdi/devtools` taking core's `ModuleDefinition` owes none of its keys.
 */
export function readOptionKeys(
  program: ts.Program,
  packages: readonly SurfacePackage[],
  exempt: ReadonlyMap<string, string>,
): { name: string; keys: OptionKey[] }[] {
  const checker = program.getTypeChecker();
  const surfaces = packages.map((pkg) => ({
    name: pkg.name,
    ...surfaceOf(program, pkg, exempt.has(pkg.name)),
  }));
  const reader: Reader = {
    program,
    checker,
    returned: returnedBy(
      checker,
      surfaces.flatMap(({ callables }) => callables),
    ),
  };

  return surfaces.map(({ name, exports, callables }) => ({
    name,
    keys: owedBy(reader, exports, callables),
  }));
}

function owedBy(
  reader: Reader,
  exports: readonly SurfaceExport[],
  callables: readonly Callable[],
): OptionKey[] {
  const { checker } = reader;
  const owed = new Map<string, OptionKey>();
  const owe = (each: OptionKey): void => {
    const id = optionKeyId(each);
    if (!owed.has(id)) owed.set(id, each);
  };

  for (const callable of callables)
    for (const signature of callable.signatures)
      for (const parameter of signature.getParameters()) {
        const declaration = parameter.valueDeclaration;
        const rest =
          declaration !== undefined &&
          ts.isParameter(declaration) &&
          declaration.dotDotDotToken !== undefined;
        for (const part of partsOf(
          checker,
          checker.getTypeOfSymbol(parameter),
          rest,
        )) {
          const name = optionsName(reader, part);
          if (name === null) continue;
          const type =
            name === 'literal'
              ? `${callable.label}(${parameter.getName()})`
              : name;
          for (const key of keysOf(reader, part))
            owe({ heading: callable.heading, type, key, via: callable.label });
        }
      }

  for (const each of exports) {
    if (
      !(
        each.symbol.flags &
        (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)
      ) ||
      !SUFFIX.test(each.name) ||
      reader.returned.has(each.symbol)
    )
      continue;
    const type = checker.getDeclaredTypeOfSymbol(each.symbol);
    for (const part of partsOf(checker, type, false))
      for (const key of keysOf(reader, part))
        owe({ heading: each.name, type: each.name, key, via: each.name });
  }

  return [...owed.values()].sort((left, right) =>
    optionKeyId(left).localeCompare(optionKeyId(right)),
  );
}

/** The code a section shows a reader: its code spans and its fences' seen lines. */
function sectionCode(body: string, fences: DocsPage['fences']): string {
  const spans = [...stripFences(body).matchAll(/`([^`\n]+)`/g)].map(
    (match) => match[1] as string,
  );
  const lines = fences.flatMap((fence) => {
    const hidden = hiddenLines(fence.body);
    return fence.body.split('\n').filter((_, at) => !hidden.has(at));
  });
  return [...spans, ...lines].join('\n');
}

const names = (code: string, key: string): boolean =>
  new RegExp(
    `(^|[^\\w$])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w$])`,
  ).test(code);

export interface OptionKeysInput {
  pages: DocsPage[];
  packages: { name: string; keys: OptionKey[] }[];
  allowance: Record<string, { unnamed: string[] }>;
}

export function checkOptionKeys(input: OptionKeysInput): string[] {
  const findings: string[] = [];
  const unnamedBy = new Map<string, Set<string>>();

  for (const { name, keys } of input.packages) {
    const page = referencePageOf(input.pages, name);
    if (!page) continue;
    const file = basename(page.file);
    const sections = new Map(
      page.sections.map((section) => [
        headingName(section.heading.text),
        sectionCode(section.body, section.fences),
      ]),
    );
    const unnamed = new Set<string>();
    const allowed = new Set(input.allowance[name]?.unnamed ?? []);

    for (const each of keys) {
      const code = sections.get(each.heading);
      if (code === undefined || names(code, each.key)) continue;
      const id = optionKeyId(each);
      unnamed.add(id);
      if (allowed.has(id)) continue;
      const taker = each.via === each.type ? '' : ` that ${each.via} takes`;
      findings.push(
        `${name}: '${each.key}', a key of ${each.type}${taker}, is not named under '## \`${each.heading}\`' in ${file}. Name it in a code span or an example of that entry, or record "${id}" in doc-option-keys-allowance.json.`,
      );
    }
    unnamedBy.set(name, unnamed);
  }

  for (const [name, entry] of Object.entries(input.allowance)) {
    const unnamed = unnamedBy.get(name);
    if (!unnamed) {
      findings.push(
        `doc-option-keys-allowance.json names ${name}, which is no library with a reference page; remove the entry`,
      );
      continue;
    }
    for (const id of entry.unnamed)
      if (!unnamed.has(id))
        findings.push(
          `${name}: "${id}" is named now, or no key by that name is owed; remove it from doc-option-keys-allowance.json`,
        );
  }

  return findings;
}
