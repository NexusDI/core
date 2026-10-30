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
import { fencePrograms, forEachShownNode } from './fence-programs';
import { headingName, referencePageOf } from './reference-text';
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
 * A lib `Partial`, `Readonly`, `Required`, `Pick` or `Omit` of an options
 * type is that options type, by its name: `Partial<LaunchOptions>` owes
 * `LaunchOptions` keys, the ones `Pick` and `Omit` leave. Arrays, tuples,
 * functions, class instances and other types declared in a TypeScript lib
 * or under `node_modules` are no options type. Neither is a parameter typed
 * by a named alias without one of those suffixes and with no suffixed
 * member, even when its members are type literals: `observe(event:
 * TraceEvent)` receives data, and no caller writes a `TraceEvent`. A rest parameter's tuple alias is exempt, since it
 * only says how many arguments a call takes. A parameter
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
 *   A callable is an exported function, an exported class's constructor, a
 *   public static or instance method the class declares, or a method an
 *   exported interface declares. The page documents a method under its
 *   class's or interface's heading (`Nexus#load` under `## Nexus`);
 * - an exported options type owes its own keys under its own heading.
 *
 * Named is the key in that section, which runs from the heading to the next
 * `##` after regions and reference directives expand, in one of two forms:
 *
 * - an identifier inside a code span of the section's prose, such as
 *   `` `imports` `` or `` `load(m, { imports })` ``;
 * - a property the type checker binds to that key, on a line a reader sees
 *   of an executable fence in the section (compiled as `fence-programs.ts`
 *   compiles one), with no diagnostic in the statement or class member
 *   that holds it: a key written in an object
 *   literal or a JSX attribute checked against the type, or a property read.
 *
 * A bare word in prose does not count, since `imports` and `deps` are also
 * English. Neither does a key that is only spelled the same:
 * `defineModule({ imports })` in the `Nexus` example names
 * `ModuleConfig.imports`, never `LoadOptions.imports`. A code span is read
 * as text, with no type checker behind it, so a span spelling a key names
 * every key of that spelling the section owes. The caller drops each
 * entry's signature block, which names every key of an options type and
 * explains none.
 *
 * G10 owns a missing page and a missing heading, so a key whose heading is
 * absent is skipped here. Error classes of an exempt package are skipped as
 * G10 skips them, by `isErrorClass`: a class whose name ends in `Error`.
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

/** The lib utility types that keep their argument's keys an options type. */
const WRAPPERS = new Set(['Partial', 'Readonly', 'Required', 'Pick', 'Omit']);

/**
 * The type a lib utility type wraps, so `Partial<LaunchOptions>` reads as
 * `LaunchOptions`, and undefined for any other type.
 */
function wrappedBy(program: ts.Program, type: ts.Type): ts.Type | undefined {
  const alias = type.aliasSymbol;
  if (!alias || !WRAPPERS.has(alias.getName())) return undefined;
  const declarations = alias.declarations ?? [];
  if (
    declarations.length === 0 ||
    !declarations.every((declaration) =>
      isForeignDeclaration(program, declaration),
    )
  )
    return undefined;
  return type.aliasTypeArguments?.[0];
}

/**
 * Whether a parameter's type is a named alias that is no options type, such
 * as `TraceEvent`: a union of type literals a hook receives as data, which
 * no caller writes as options. An alias that names a suffixed member, such
 * as `RootRef` holding `RootConfig`, is read member by member, a generic
 * alias through its constraint, and a lib utility type through what it
 * wraps.
 */
function namesData(type: ts.Type): boolean {
  const alias = type.aliasSymbol;
  if (!alias || WRAPPERS.has(alias.getName()) || SUFFIX.test(alias.getName()))
    return false;
  // A generic alias such as `CheckedRoot<R>` resolves per call, so its
  // constraint is read like any type parameter's.
  if (type.flags & ts.TypeFlags.Instantiable) return false;
  const members = type.isUnion() ? type.types : [type];
  return !members.some((member) =>
    SUFFIX.test(nameOf(member)?.getName() ?? ''),
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
  const wrapped = wrappedBy(program, type);
  if (wrapped) return optionsName(reader, wrapped);
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
function keysOf({ program, checker }: Reader, type: ts.Type): ts.Symbol[] {
  return checker.getPropertiesOfType(type).filter((property) => {
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
  });
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

/** One key, the declarations that spell it, and whether the page names it. */
interface Owed extends OptionKey {
  declarations: ReadonlySet<ts.Declaration>;
}

/** The keys each package owes, read from one program. */
function owedIn(
  program: ts.Program,
  packages: readonly SurfacePackage[],
  exempt: ReadonlyMap<string, string>,
): Map<string, Owed[]> {
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
  return new Map(
    surfaces.map(({ name, exports, callables }) => [
      name,
      owedBy(reader, exports, callables),
    ]),
  );
}

function owedBy(
  reader: Reader,
  exports: readonly SurfaceExport[],
  callables: readonly Callable[],
): Owed[] {
  const { checker } = reader;
  const owed = new Map<string, Owed>();
  const owe = (each: OptionKey, property: ts.Symbol): void => {
    const id = optionKeyId(each);
    const found = owed.get(id) ?? { ...each, declarations: new Set() };
    for (const declaration of property.declarations ?? [])
      (found.declarations as Set<ts.Declaration>).add(declaration);
    owed.set(id, found);
  };

  for (const callable of callables)
    for (const signature of callable.signatures)
      for (const parameter of signature.getParameters()) {
        const declaration = parameter.valueDeclaration;
        const rest =
          declaration !== undefined &&
          ts.isParameter(declaration) &&
          declaration.dotDotDotToken !== undefined;
        // The type the parameter writes, before `?` adds `undefined` and
        // drops the alias.
        const written =
          declaration !== undefined &&
          ts.isParameter(declaration) &&
          declaration.type !== undefined
            ? checker.getTypeFromTypeNode(declaration.type)
            : checker.getTypeOfSymbol(parameter);
        if (!rest && namesData(written)) continue;
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
          for (const property of keysOf(reader, part))
            owe(
              {
                heading: callable.heading,
                type,
                key: property.getName(),
                via: callable.label,
              },
              property,
            );
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
      for (const property of keysOf(reader, part))
        owe(
          {
            heading: each.name,
            type: each.name,
            key: property.getName(),
            via: each.name,
          },
          property,
        );
  }

  return [...owed.values()].sort((left, right) =>
    optionKeyId(left).localeCompare(optionKeyId(right)),
  );
}

/** The object literal or JSX attributes a property name sits in, if any. */
function holderOf(node: ts.Identifier): ts.Expression | undefined {
  const { parent } = node;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isShorthandPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) &&
    parent.name === node &&
    ts.isObjectLiteralExpression(parent.parent)
  )
    return parent.parent;
  if (ts.isJsxAttribute(parent) && parent.name === node)
    return parent.parent as ts.JsxAttributes;
  return undefined;
}

/**
 * The declarations of the property a name in a fence spells, as the
 * checker binds it: a key written in an object literal or a JSX attribute
 * binds to the property of the type the literal is checked against, and a
 * property read (`options.imports`) to the property it reads.
 */
function boundBy(checker: ts.TypeChecker, node: ts.Node): ts.Declaration[] {
  if (!ts.isIdentifier(node)) return [];
  const holder = holderOf(node);
  if (holder) {
    const contextual = checker.getContextualType(holder);
    if (!contextual) return [];
    const type = checker.getNonNullableType(contextual);
    return (type.isUnion() ? type.types : [type]).flatMap(
      (member) =>
        checker.getPropertyOfType(member, node.text)?.declarations ?? [],
    );
  }
  if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
    return checker.getSymbolAtLocation(node)?.declarations ?? [];
  return [];
}

/** The keys a section names in a code span of its prose. */
function spannedIn(body: string): Set<string> {
  return new Set(
    [...stripFences(body).matchAll(/`([^`\n]+)`/g)].flatMap(
      (match) => (match[1] as string).match(/[A-Za-z_$][\w$]*/g) ?? [],
    ),
  );
}

/** One package's keys, and the reference page that owes them. */
export interface PackageOptionKeys {
  name: string;
  /** The reference page, workspace relative, or null when it has none. */
  page: string | null;
  keys: (OptionKey & { named: boolean })[];
}

/**
 * Every key each package's reference page owes, sorted by its id, and
 * whether the page names it. A type any package's callable returns is no
 * options type in any package, so `@nexusdi/devtools` taking core's
 * `ModuleDefinition` owes none of its keys. `root` is the workspace root
 * the pages' paths are relative to.
 */
export function readOptionKeys(
  root: string,
  pages: readonly DocsPage[],
  packages: readonly SurfacePackage[],
  exempt: ReadonlyMap<string, string>,
): PackageOptionKeys[] {
  const pageOf = new Map(
    packages.map((pkg) => [pkg.name, referencePageOf(pages, pkg.name)]),
  );
  const programs = fencePrograms(root, pageOf, packages);
  const owed = owedIn(programs[0].program, packages, exempt);
  const named = new Set<string>();

  for (const [at, { program, fences }] of programs.entries()) {
    const here = at === 0 ? owed : owedIn(program, packages, exempt);
    const checker = program.getTypeChecker();
    for (const fence of fences) {
      const candidates = (here.get(fence.package) ?? []).filter(
        (each) => each.heading === fence.section,
      );
      if (candidates.length === 0) continue;
      for (const file of fence.files)
        forEachShownNode(program, fence, file, (node, failed) => {
          if (failed) return;
          const bound = boundBy(checker, node);
          for (const each of candidates)
            if (bound.some((declaration) => each.declarations.has(declaration)))
              named.add(`${fence.package}\n${optionKeyId(each)}`);
        });
    }
  }

  return packages.map(({ name }) => {
    const page = pageOf.get(name);
    if (!page) return { name, page: null, keys: [] };
    const spans = new Map(
      page.sections.map((section) => [
        headingName(section.heading.text),
        spannedIn(section.body),
      ]),
    );
    return {
      name,
      page: page.file,
      keys: (owed.get(name) ?? [])
        .filter((each) => spans.has(each.heading))
        .map(({ heading, type, key, via }) => ({
          heading,
          type,
          key,
          via,
          named:
            (spans.get(heading)?.has(key) ?? false) ||
            named.has(`${name}\n${optionKeyId({ heading, type, key, via })}`),
        })),
    };
  });
}

export interface OptionKeysInput {
  packages: PackageOptionKeys[];
  allowance: Record<string, { unnamed: string[] }>;
}

export function checkOptionKeys(input: OptionKeysInput): string[] {
  const findings: string[] = [];
  const unnamedBy = new Map<string, Set<string>>();

  for (const { name, page, keys } of input.packages) {
    // G10 reports a package with no reference page.
    if (page === null) continue;
    const file = basename(page);
    const unnamed = new Set<string>();
    const allowed = new Set(input.allowance[name]?.unnamed ?? []);

    for (const each of keys) {
      if (each.named) continue;
      const id = optionKeyId(each);
      unnamed.add(id);
      if (allowed.has(id)) continue;
      const taker = each.via === each.type ? '' : ` that ${each.via} takes`;
      findings.push(
        `${name}: '${each.key}', a key of ${each.type}${taker}, is not named under '## \`${each.heading}\`' in ${file}. Name it in a code span of that entry, or write it in an example the compiler checks against ${each.type}, or record "${id}" in doc-option-keys-allowance.json.`,
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
