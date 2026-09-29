import { resolveModuleRef } from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { InvalidModuleError } from '../errors/index.js';
import { compileTraced } from './compile-traced.js';
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

  const current = root.blueprint;
  // A compile.module hook may have replaced `module` at the last compile; moduleByReplaced finds the module that stands in
  // for it, so a loaded original is not added again under its own identity.
  const existing =
    current.moduleByDefinition.get(definition) ??
    current.moduleByReplaced.get(definition);
  if (
    existing !== undefined &&
    current.modules.get(current.root)?.imports.includes(existing)
  )
    return;

  // With `previous`, compile() rejects a global module the graph lacks.
  const next = compileTraced(
    root.tracer,
    {
      root: root.rootRef,
      extraImports: [...current.extraImports, module],
      pluginImports: root.plugins.modules,
      hooks: root.plugins.compile,
      phase: 'load',
      wantsView: root.plugins.formatError.length > 0,
      previous: current,
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
