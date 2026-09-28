import type { Blueprint } from '../blueprint/blueprint.js';
import { compileContext, moduleReplacerFor } from '../blueprint/hooks.js';
import { moduleReplacer } from '../blueprint/overrides.js';
import {
  resolveModuleRef,
  type ModuleDefinition,
} from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { InvalidModuleError, LoadError } from '../errors/index.js';
import { compileTraced } from './compile-traced.js';
import { startBlueprint } from './startup.js';
import { assertOpen, track, type RootState } from './state.js';

const ignore = (): void => undefined;
const identity = (definition: ModuleDefinition): ModuleDefinition => definition;

/**
 * The module compile()'s walk visits in place of `definition`: a testing
 * override's stub, then what the compile.module hooks return. With neither,
 * the definition itself. The hooks' errors are dropped here, since the
 * recompile reports them.
 */
function replacerOf(
  root: RootState,
): (definition: ModuleDefinition) => ModuleDefinition {
  const overrideReplace =
    root.overrides === undefined
      ? identity
      : moduleReplacer(root.overrides, new Set());
  const hooks = root.plugins.compile;
  if (hooks.module.length === 0) return overrideReplace;
  const pluginReplace = moduleReplacerFor(
    hooks,
    compileContext('load'),
    [],
    new Map(),
  );
  return (definition) => pluginReplace(overrideReplace(definition));
}

/**
 * The first global module load() would newly add to current, reached from
 * definition itself or through any import, direct or transitive. A module
 * current already has is reused as is and never inspected for globalness
 * (spec §3.5 only bars a global module load() would add; an existing global
 * module's bindings are already computed either way). `replace` applies the
 * testing overrides and compile.module hooks compile() applies, so a global
 * module a replacement removes is never met here, and one a replacement adds
 * is met in its place, matching what the recompile below builds.
 */
function newGlobalImport(
  current: Blueprint,
  definition: ModuleDefinition,
  replace: (definition: ModuleDefinition) => ModuleDefinition,
): ModuleDefinition | undefined {
  const seen = new Set<ModuleDefinition>();
  const stack = [replace(definition)];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    if (seen.has(next) || current.moduleByDefinition.has(next)) continue;
    seen.add(next);
    if (next.global) return next;
    for (const child of next.imports) {
      const childDefinition = resolveModuleRef(child);
      if (childDefinition !== undefined) stack.push(replace(childDefinition));
    }
  }
  return undefined;
}

/**
 * Compiles the module against the live graph as a new root import, builds
 * the new singletons, and then publishes the new blueprint. A compile error
 * leaves the container unchanged; a build error disposes what this load built.
 */
async function loadNow(root: RootState, module: unknown): Promise<void> {
  assertOpen(root);
  const definition = resolveModuleRef(module);
  if (definition === undefined)
    throw new InvalidModuleError({ received: describeValue(module), path: [] });

  const current = root.blueprint;
  // current.moduleByDefinition is keyed by the definitions compile()'s walk
  // actually visited, which is the replaced one under a testing container's
  // overrideModule (blueprint/overrides.ts moduleReplacer) or a
  // compile.module hook. Looking `module` up unreplaced would miss it and
  // load a definition already in the graph under its replacement's identity.
  const replace = replacerOf(root);
  const replaced = replace(definition);
  const existing = current.moduleByDefinition.get(replaced);
  if (
    existing !== undefined &&
    current.modules.get(current.root)?.imports.includes(existing)
  )
    return;

  // Every existing module's bindings are computed; a newly added global
  // module would change them all.
  const newGlobal = newGlobalImport(current, definition, replace);
  if (newGlobal !== undefined) throw new LoadError({ module: newGlobal.name });

  const next = compileTraced(
    root.tracer,
    {
      root: root.rootRef,
      extraImports: [...current.extraImports, module],
      overrides: root.overrides,
      hooks: root.plugins.compile,
      phase: 'load',
      wantsView: root.plugins.formatError.length > 0,
    },
    'load',
  );
  await startBlueprint(root, {
    bp: next,
    isNew: (id) => !current.providers.has(id),
  });
  root.blueprint = next;
}

export function loadModule(root: RootState, module: unknown): Promise<void> {
  const run = root.loadQueue.then(() => loadNow(root, module));
  root.loadQueue = run.then(ignore, ignore);
  track(root.inflight, run);
  return run;
}
