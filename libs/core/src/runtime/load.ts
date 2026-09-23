import type { Blueprint } from '../blueprint/blueprint.js';
import { compile } from '../blueprint/compile.js';
import {
  resolveModuleRef,
  type ModuleDefinition,
} from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { InvalidModuleError, LoadError } from '../errors/index.js';
import { startBlueprint } from './startup.js';
import { assertOpen, track, type RootState } from './state.js';

const ignore = (): void => undefined;

/**
 * The first global module load() would newly add to current, reached from
 * definition itself or through any import, direct or transitive. A module
 * current already has is reused as is and never inspected for globalness
 * (spec §3.5 only bars a global module load() would add; an existing global
 * module's bindings are already computed either way).
 */
function newGlobalImport(
  current: Blueprint,
  definition: ModuleDefinition,
): ModuleDefinition | undefined {
  const seen = new Set<ModuleDefinition>();
  const stack = [definition];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    if (seen.has(next) || current.moduleByDefinition.has(next)) continue;
    seen.add(next);
    if (next.global) return next;
    for (const child of next.imports) {
      const childDefinition = resolveModuleRef(child);
      if (childDefinition !== undefined) stack.push(childDefinition);
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
  const existing = current.moduleByDefinition.get(definition);
  if (
    existing !== undefined &&
    current.modules.get(current.root)?.imports.includes(existing)
  )
    return;

  // Every existing module's bindings are computed; a newly added global
  // module would change them all.
  const newGlobal = newGlobalImport(current, definition);
  if (newGlobal !== undefined) throw new LoadError({ module: newGlobal.name });

  const next = compile({
    root: root.rootRef,
    extraImports: [...current.extraImports, module],
  });
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
