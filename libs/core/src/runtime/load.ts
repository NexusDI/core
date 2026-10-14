import { isForeign } from '../definitions/brand.js';
import { resolveModuleRef } from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { HOOK_SITES } from '../definitions/hook-sites.js';
import { InvalidModuleError } from '../errors/index.js';
import { compileTraced } from './compile-traced.js';
import { startBlueprint, type StartupPlan } from './startup.js';
import { assertOpen, track, type RootState } from './state.js';
import { emitRun } from './trace.js';

const ignore = (): void => undefined;

/**
 * Compiles the module against the live graph as a new root import, builds
 * the new singletons, and then publishes the new blueprint. A compile error
 * leaves the container unchanged; a build error disposes what this load built.
 */
async function loadNow(root: RootState, module: unknown): Promise<void> {
  const tracer = root.tracer;
  const id = root.nextRun++;
  const start = tracer.now();
  let plan: StartupPlan;
  try {
    assertOpen(root);
    const definition = resolveModuleRef(module);
    if (definition === undefined)
      throw new InvalidModuleError({
        received: describeValue(module),
        path: [],
        otherCopy: isForeign(module),
      });

    const current = root.blueprint;
    // A compile.module hook may have replaced `module` at the last compile.
    // moduleByReplaced finds the module that stands in for it, so a loaded
    // original is not added again under its own identity.
    const existing =
      current.moduleByDefinition.get(definition) ??
      current.moduleByReplaced.get(definition);
    if (
      existing !== undefined &&
      current.modules.get(current.root)?.imports.includes(existing)
    ) {
      emitRun(tracer, id, 'load', null, start, true);
      return;
    }

    // With `previous`, compile() rejects a global module the graph lacks.
    const next = compileTraced(
      tracer,
      {
        root: root.rootRef,
        extraImports: [...current.extraImports, module],
        pluginImports: root.plugins.modules,
        hooks: root.plugins.compile,
        canon: root.canon,
        phase: 'load',
        wantsView: HOOK_SITES && root.plugins.formatError.length > 0,
        previous: current,
      },
      'load',
      id,
    );
    plan = {
      bp: next,
      isNew: (pid) => !current.providers.has(pid),
      run: id,
      kind: 'load',
      start,
    };
  } catch (error) {
    // No list holds an observer's throw here (spec 3.5).
    emitRun(tracer, id, 'load', null, start, false);
    throw error;
  }
  // A failed build emits the run's closing event in its rollback.
  await startBlueprint(root, plan);
  root.blueprint = plan.bp;
  emitRun(tracer, id, 'load', null, start, true);
}

export function loadModule(root: RootState, module: unknown): Promise<void> {
  const run = root.loadQueue.then(() => loadNow(root, module));
  root.loadQueue = run.then(ignore, ignore);
  track(root.inflight, run);
  return run;
}
