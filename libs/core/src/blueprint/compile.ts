import type { ModuleDefinition } from '../definitions/define-module.js';
import { REQUEST } from '../definitions/request.js';
import {
  BlueprintError,
  CircularDependencyError,
  LoadError,
  type NexusError,
} from '../errors/index.js';
import { bind } from './bind.js';
import {
  NO_ENTRIES,
  REQUEST_ID,
  type Blueprint,
  type ProviderRecord,
  type TokenKey,
} from './blueprint.js';
import {
  NO_COMPILE_HOOKS,
  compileContext,
  moduleReplacerFor,
  reportingCanon,
  rewriteProviders,
  runChecks,
  type CompileHooks,
} from './hooks.js';
import { computeLevels } from './levels.js';
import { checkLifetimes } from './lifetimes.js';
import { cyclePath, findCycles, successorsOf } from './tarjan.js';
import {
  buildView,
  rememberFailedView,
  sameToken,
  type Canonicalizer,
} from './views.js';
import { computeVisibility } from './visibility.js';
import { rejectDuplicates, walk, type WalkResult } from './walk.js';

export interface CompileInput {
  /** The root module. */
  readonly root: unknown;
  /**
   * Modules plugins add as root imports, walked ahead of `extraImports`. The
   * blueprint does not store them: every compile receives them again.
   */
  readonly pluginImports?: readonly unknown[];
  /** Modules load() added as root imports. */
  readonly extraImports?: readonly unknown[];
  /** Plugin compile hooks. */
  readonly hooks?: CompileHooks;
  /**
   * The container's canonicalizer, from its tokenKey hooks. The compile
   * keys every token through it, and the view's visible() keys with it.
   */
  readonly canon?: Canonicalizer;
  readonly phase?: 'create' | 'load' | 'check';
  /** Build a view of a failed compile for formatError hooks. */
  readonly wantsView?: boolean;
  /**
   * The live blueprint load() compiles against. A global module this compile
   * reaches that `previous` lacks is NEXUS_LOAD_GLOBAL_MODULE. A singleton
   * `previous` deferred stays deferred (spec §6.6).
   */
  readonly previous?: Blueprint;
}

/** Original definition → the id of the module the walk visited in its place. */
function moduleIdsOf(
  walked: WalkResult,
): ReadonlyMap<ModuleDefinition, string> {
  if (walked.swapped.size === 0) return NO_ENTRIES;
  const ids = new Map<ModuleDefinition, string>();
  for (const [original, replacement] of walked.swapped) {
    const id = walked.byDefinition.get(replacement);
    if (id !== undefined) ids.set(original, id);
  }
  return ids;
}

/**
 * load()'s rule: every existing module's bindings are computed, so a global
 * module new to the graph would change them all. Walk order decides which
 * one the error names.
 */
function checkNewGlobals(walked: WalkResult, previous: Blueprint): void {
  const added = walked.modules.find(
    (m) => m.global && !previous.moduleByDefinition.has(m.definition),
  );
  if (added !== undefined) throw new LoadError({ module: added.name });
}

/** The built-in REQUEST provider: scoped, visible in every module. */
function requestRecord(index: number, rootId: string): ProviderRecord {
  return {
    id: REQUEST_ID,
    index,
    kind: 'value',
    token: REQUEST,
    module: rootId,
    name: 'REQUEST',
    lifetime: 'scoped',
    eager: true,
    deps: [],
    props: [],
  };
}

/**
 * Compiles definitions into a frozen Blueprint, or throws one BlueprintError
 * holding every error in pass order. Constructs nothing and calls no user code.
 * Each pass collects errors and continues; a pass skips what an earlier error
 * broke, so one missing token produces one error.
 */
export function compile(input: CompileInput): Blueprint {
  const errors: NexusError[] = [];
  const extraImports = [...(input.extraImports ?? [])];

  // Pass 1: walk and deduplicate, with the compile.module hooks applied,
  // then the compile.provider hooks, then the duplicate check.
  // With no plugin, the hook sites cost one length test each (spec D19).
  const phase = input.phase ?? 'create';
  const hooks = input.hooks ?? NO_COMPILE_HOOKS;
  const context =
    hooks.module.length > 0 || hooks.provider.length > 0
      ? compileContext(phase)
      : undefined;
  let replacedModules: ReadonlyMap<ModuleDefinition, ModuleDefinition> =
    NO_ENTRIES;
  let replace: ((definition: ModuleDefinition) => ModuleDefinition) | undefined;
  if (context !== undefined && hooks.module.length > 0) {
    const replaced = new Map<ModuleDefinition, ModuleDefinition>();
    replace = moduleReplacerFor(hooks, context, errors, replaced);
    replacedModules = replaced;
  }
  const keying = input.canon === sameToken ? undefined : input.canon;
  const canon =
    keying === undefined ? undefined : reportingCanon(keying, errors);
  const pluginImports = input.pluginImports;
  const walked = walk(
    {
      canon,
      root: input.root,
      extraImports:
        pluginImports === undefined || pluginImports.length === 0
          ? extraImports
          : [...pluginImports, ...extraImports],
      replace,
    },
    errors,
  );
  if (input.previous !== undefined) checkNewGlobals(walked, input.previous);
  const rewritten =
    context === undefined
      ? undefined
      : rewriteProviders(walked.records, hooks, context, errors, canon);
  const root = walked.modules[0]?.id ?? 'm0';
  const records = [
    ...rejectDuplicates(rewritten?.records ?? walked.records, walked, errors),
    requestRecord(walked.records.length, root),
  ];
  const rewrittenBy = rewritten?.rewrittenBy ?? NO_ENTRIES;
  const pinned = new Map<TokenKey, readonly string[]>([
    [REQUEST, [REQUEST_ID]],
  ]);
  if (rewritten !== undefined)
    for (const [token, ids] of rewritten.pinned) pinned.set(token, ids);
  const providers = new Map(records.map((r) => [r.id, r]));
  const nameOf = (id: string): string => providers.get(id)?.name ?? id;
  errors.push(...walked.exportErrors);

  // Pass 2: visibility.
  const visible = computeVisibility(
    {
      modules: walked.modules,
      records,
      pinned,
    },
    errors,
  );

  // Pass 3: bind.
  const bound = bind(
    {
      modules: walked.modules,
      records,
      visibility: visible,
      broken: walked.broken,
    },
    errors,
  );

  // Pass 4: cycles, ignoring lazy edges.
  const strong = successorsOf(bound.edges, (kind) => kind !== 'lazy');
  for (const component of findCycles(
    records.map((r) => r.id),
    strong,
  )) {
    const path = cyclePath(
      component,
      strong,
      (id) => providers.get(id)?.index ?? 0,
    );
    errors.push(new CircularDependencyError({ path: path.map(nameOf) }));
  }

  // Pass 5: lifetimes, following every edge kind.
  checkLifetimes(
    providers,
    successorsOf(bound.edges, () => true),
    errors,
  );

  // The check hooks see what the passes finished, errors or not. A
  // formatError hook needs the view of a failed compile only; a compiled
  // blueprint's view comes from viewOfBlueprint.
  const view =
    hooks.check.length > 0 || (input.wantsView === true && errors.length > 0)
      ? buildView(
          {
            phase,
            complete: errors.length === 0,
            root,
            modules: walked.modules,
            records,
            visibility: visible.visibility,
            moduleExports: visible.moduleExports,
            edges: bound.edges,
            replaced: replacedModules,
            rewrittenBy,
          },
          keying ?? sameToken,
        )
      : undefined;
  if (view !== undefined) runChecks(hooks, view, errors);

  if (errors.length > 0) {
    const error = new BlueprintError(errors);
    if (view !== undefined) rememberFailedView(error, view);
    throw error;
  }

  // Pass 6: levels.
  const levels = computeLevels(providers, strong, input.previous?.deferred);
  const requestDependents = [
    ...new Set(
      bound.edges
        .filter((e) => e.to === REQUEST_ID && e.kind !== 'optional')
        .map((e) => nameOf(e.from)),
    ),
  ];

  return Object.freeze({
    root,
    modules: new Map(walked.modules.map((m) => [m.id, m])),
    moduleByDefinition: walked.byDefinition,
    moduleByReplaced: moduleIdsOf(walked),
    providers,
    extraImports,
    visibility: visible.visibility,
    moduleExports: visible.moduleExports,
    exportedTokens: visible.exportedTokens,
    bindings: bound.bindings,
    edges: bound.edges,
    singletonLevels: levels.singleton,
    deferred: levels.deferred,
    scopedLevels: levels.scoped,
    needsRequest: requestDependents.length > 0,
    requestDependents,
    phase,
    replacedModules,
    rewrittenBy,
  });
}
