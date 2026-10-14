import type { Blueprint } from '../blueprint/blueprint.js';
import { isForeign } from '../definitions/brand.js';
import { resolveModuleRef } from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { HOOK_SITES } from '../definitions/hook-sites.js';
import { InvalidModuleError } from '../errors/index.js';
import { compileTraced, observerFailed } from './compile-traced.js';
import { startBlueprint, type StartupPlan } from './startup.js';
import { assertOpen, track, type RootState } from './state.js';
import { emitRun, type RunTrace, type Tracer } from './trace.js';

const ignore = (): void => undefined;

/**
 * Ends a load's run with ok: true. The load succeeded, so an observer's
 * throw here rejects with the same shape as a throw on its compile event.
 */
function closeLoad(tracer: Tracer, trace: RunTrace, bp: Blueprint): void {
  try {
    emitRun(tracer, trace);
  } catch (error) {
    throw observerFailed(error, bp.modules.get(bp.root)?.name ?? '');
  }
}

/**
 * Compiles the module against the live graph as a new root import, builds
 * the new singletons, and then publishes the new blueprint. A compile error
 * leaves the container unchanged; a build error disposes what this load built.
 */
async function loadNow(
  root: RootState,
  module: unknown,
  trace: RunTrace,
): Promise<void> {
  const tracer = root.tracer;
  let plan: StartupPlan | undefined;
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
      existing === undefined ||
      !current.modules.get(current.root)?.imports.includes(existing)
    ) {
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
        trace.id,
      );
      plan = {
        bp: next,
        isNew: (pid) => !current.providers.has(pid),
        run: trace,
      };
    }
  } catch (error) {
    // No list holds an observer's throw here (spec 3.5).
    emitRun(tracer, trace, []);
    throw error;
  }
  if (plan !== undefined) {
    // A failed build emits the run's closing event in its rollback.
    await startBlueprint(root, plan);
    root.blueprint = plan.bp;
  }
  closeLoad(tracer, trace, root.blueprint);
}

export function loadModule(root: RootState, module: unknown): Promise<void> {
  // The run spans from the call, so a load queued behind another counts
  // its wait.
  const trace: RunTrace = {
    id: root.nextRun++,
    kind: 'load',
    scope: null,
    start: root.tracer.now(),
    errors: undefined,
  };
  const run = root.loadQueue.then(() => loadNow(root, module, trace));
  root.loadQueue = run.then(ignore, ignore);
  track(root.inflight, run);
  return run;
}
