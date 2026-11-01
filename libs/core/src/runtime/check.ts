import type { Blueprint } from '../blueprint/blueprint.js';
import { canonicalizer } from '../blueprint/hooks.js';
import { viewOfBlueprint } from '../blueprint/views.js';
import { HOOK_SITES } from '../definitions/hook-sites.js';
import { BlueprintError, isLoadError } from '../errors/index.js';
import { checkSchemas } from './check-schemas.js';
import { compileTraced } from './compile-traced.js';
import { formatThrown } from './format.js';
import { traceSinks } from './nexus.js';
import type { CheckOptions, CheckReport } from './options.js';
import { registerPlugins } from './plugins.js';
import { rootModuleOf, type CheckedRoot, type UninferredRoot } from './root.js';
import { Tracer } from './trace.js';

/**
 * Compiles a root as Nexus.create() would, without building it. Takes the
 * same root forms: a module, a provider array, or
 * `{ providers, imports, exports }`. Then compiles each module of
 * `options.load` against it, as load() would. After every compile passed,
 * calls `validate` on the options schema of every forRoot() value, an async
 * schema included, so a schema must stay free of side effects. It judges
 * each result that comes back synchronously and discards its output. A
 * schema that returns a promise is not awaited, and a forRootAsync() module
 * with a schema is not validated; the returned report lists both in
 * `unchecked`.
 * No constructor, factory, onInit or setup hook runs; the plugins' compile,
 * tokenKey, observe and formatError hooks do. Throws one BlueprintError for
 * the first compile that fails, and compiles no load after it. Throws one
 * BlueprintError for every rejected forRoot() value when every compile
 * passed. A schema that throws propagates its exception.
 *
 * A named export, so a bundler drops it from an app that never imports it.
 */
export function check<const R = UninferredRoot>(
  root: CheckedRoot<R>,
  options?: CheckOptions,
): CheckReport;
export function check(root: unknown, options?: CheckOptions): CheckReport {
  const plugins = registerPlugins(options?.plugins);
  const canon = canonicalizer(plugins.tokenKey);
  // The last compile that passed. A load compiles against it, and a
  // LoadError, which carries no view of its own, is formatted with its view.
  let last: Blueprint | undefined;
  let unchecked: CheckReport['unchecked'];
  try {
    const rootModule = rootModuleOf(root);
    const tracer = new Tracer(traceSinks(plugins));
    const input = {
      root: rootModule,
      pluginImports: plugins.modules,
      hooks: plugins.compile,
      canon,
      phase: 'check' as const,
      wantsView: HOOK_SITES && plugins.formatError.length > 0,
    };
    last = compileTraced(tracer, input, 'check', null);
    for (const entry of options?.load ?? []) {
      last = compileTraced(
        tracer,
        {
          ...input,
          extraImports: [...last.extraImports, entry],
          previous: last,
        },
        'check',
        null,
      );
    }
    // After every compile passed, so no user code runs for a broken graph.
    unchecked = checkSchemas(last);
  } catch (error) {
    throw formatThrown(
      plugins,
      () => (last === undefined ? undefined : viewOfBlueprint(last, canon)),
      isLoadError(error) ? new BlueprintError([error]) : error,
    );
  }
  return Object.freeze({ unchecked });
}
