import ts from 'typescript';

import { modulesOf, resolve } from '@nexusdi/doc-examples/package-exports';

/**
 * Core's plugin api promises that every type a contribution point names
 * in a member, a parameter or a return is exported from `@nexusdi/core` or
 * `@nexusdi/core/text`. A third party that writes a plugin or an adapter can
 * then name each type it receives or returns with no structural workaround.
 *
 * The check builds a TypeScript program over the entries, walks each
 * contribution point's declarations one level (members, parameters, returns
 * and type arguments; private and `#` members are skipped), and reports each
 * referenced type that is declared in the program's own sources and that no
 * entry exports.
 */

/** Every name the plugin and adapter api of core offers. */
export const CONTRIBUTION_POINTS: readonly string[] = [
  'NexusPlugin',
  'CompilePluginHooks',
  'PluginContext',
  'BlueprintView',
  'ModuleView',
  'ProviderView',
  'EdgeView',
  'CompileContext',
  'ProviderRewrite',
  'ErrorTextPack',
  'ErrorTextKit',
  'ErrorText',
  'NearMiss',
  'TraceEvent',
  'TraceEventByType',
  'NexusRequest',
  'REQUEST',
  'loadOnce',
  'splitLoadEntry',
  'layoutText',
  'displayName',
  'describeValue',
  'isForeign',
  'errorBase',
  'ErrorFields',
  'NEXUS_PLUGIN_API',
  'SUPPORTED_PLUGIN_APIS',
];

/** Unexported types a contribution point may name, each with its reason. */
export const CONTRIBUTION_ALLOWANCE: Readonly<Record<string, string>> = {
  BuildEventFields:
    "A reader names the fields as TraceEventByType['construct'], an exported type.",
  Reserved:
    "The mapped key set inside ErrorFields; a reader never names it, it reads the fields' keys.",
};

const DECLARES_TYPE =
  ts.SymbolFlags.Interface |
  ts.SymbolFlags.TypeAlias |
  ts.SymbolFlags.Class |
  ts.SymbolFlags.Enum;

/** True for a member that a third party cannot see: `private`, `protected` or `#name`. */
function isHidden(node: ts.Node): boolean {
  const name = (node as { name?: ts.Node }).name;
  if (name !== undefined && ts.isPrivateIdentifier(name)) return true;
  const flags = ts.getCombinedModifierFlags(node as ts.Declaration);
  return (
    (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) !== 0
  );
}

/** Every type name that `node` writes, without descending into hidden members. */
function typeNames(node: ts.Node, found: ts.Node[]): void {
  if (isHidden(node)) return;
  if (ts.isTypeReferenceNode(node)) found.push(node.typeName);
  else if (ts.isExpressionWithTypeArguments(node)) found.push(node.expression);
  else if (ts.isTypeQueryNode(node)) return;
  node.forEachChild((child) => typeNames(child, found));
}

/**
 * The violations for `points` over `entries`, one line per point and
 * unexported type. `allowance` names the types a point may name without an
 * export.
 */
export function contributionTypeViolations(
  entries: readonly string[],
  points: readonly string[],
  allowance: Readonly<Record<string, string>>,
): string[] {
  const exported = new Set<ts.Symbol>();
  const byName = new Map<string, ts.Symbol>();
  const { checker, symbols } = modulesOf(entries);

  for (const symbol of symbols) {
    for (const each of checker.getExportsOfModule(symbol)) {
      const resolved = resolve(each, checker) as ts.Symbol;
      exported.add(resolved);
      if (!byName.has(each.getName())) byName.set(each.getName(), resolved);
    }
  }

  const violations: string[] = [];
  const used = new Set<string>();
  for (const point of points) {
    const symbol = byName.get(point);
    if (symbol === undefined) {
      violations.push(`${point} is not exported by any entry`);
      continue;
    }
    const names: ts.Node[] = [];
    for (const declaration of symbol.declarations ?? []) {
      typeNames(declaration, names);
    }
    const reported = new Set<string>();
    for (const name of names) {
      const target = checker.getSymbolAtLocation(name);
      if (target === undefined) continue;
      const resolved = resolve(target, checker) as ts.Symbol;
      if (!(resolved.flags & DECLARES_TYPE) || exported.has(resolved)) continue;
      const own = resolved.declarations?.some((declaration) => {
        const file = declaration.getSourceFile();
        return (
          !file.hasNoDefaultLib &&
          !file.fileName.includes('/node_modules/') &&
          !/\/typescript\/lib\//.test(file.fileName)
        );
      });
      const label = resolved.getName();
      if (!own) continue;
      if (label in allowance) {
        used.add(label);
        continue;
      }
      if (reported.has(label)) continue;
      reported.add(label);
      violations.push(`${point} names ${label}, which no entry exports`);
    }
  }
  for (const name of Object.keys(allowance))
    if (!used.has(name))
      violations.push(`the allowance for ${name} is stale; no point names it`);
  return violations;
}
