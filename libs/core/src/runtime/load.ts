import { compile } from '../blueprint/compile.js';
import { resolveModuleRef } from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { InvalidModuleError, LoadError } from '../errors/index.js';
import { startBlueprint } from './startup.js';
import { assertOpen, track, type RootState } from './state.js';

const ignore = (): void => undefined;

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
  // Every existing module's bindings are computed; a new global export would change them.
  if (definition.global) throw new LoadError({ module: definition.name });

  const current = root.blueprint;
  const existing = current.moduleByDefinition.get(definition);
  if (
    existing !== undefined &&
    current.modules.get(current.root)?.imports.includes(existing)
  )
    return;

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
