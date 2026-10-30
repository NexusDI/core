import { ordersBuild } from './build-order.js';
import {
  resolveModuleRef,
  type ModuleDefinition,
  type ModuleRef,
} from '../definitions/define-module.js';
import { HOOK_SITES } from '../definitions/hook-sites.js';
import { REQUEST } from '../definitions/request.js';
import {
  BlueprintError,
  CircularDependencyError,
  LoadContributionError,
  LoadError,
  LoadGrantError,
  type NexusError,
} from '../errors/index.js';
import { describeValue, MultiToken } from '../definitions/token.js';
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
import { splitEntry, type LoadEntry } from './load-entry.js';
import { checkLifetimes } from './lifetimes.js';
import { providerRecord } from './records.js';
import {
  cyclePath,
  findCycles,
  orderingEdgesFrom,
  stepKinds,
  successorsOf,
} from './tarjan.js';
import {
  adoptView,
  buildView,
  rememberFailedView,
  sameToken,
  type Canonicalizer,
} from './views.js';
import { unreadContributions } from './unread.js';
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
  /**
   * Modules load() added as root imports, each with the grant it was loaded
   * with. With `previous`, the compile checks every grant against it.
   */
  readonly extraImports?: readonly LoadEntry[];
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
 * module new to the graph would change them all. A module is new when
 * `previous` holds no module for it or for the original a compile.module hook
 * replaced with it, and a held plain module that a hook turns global at a load
 * counts as new too. Walk order decides which one the error names.
 */
function checkNewGlobals(walked: WalkResult, previous: Blueprint): void {
  const added = walked.modules.find(
    (m) => m.global && previous.modules.get(m.id)?.global !== true,
  );
  if (added !== undefined) throw new LoadError({ module: added.name });
}

/** The id `previous` holds for a module ref, or undefined when it holds none. */
export function heldId(previous: Blueprint, ref: unknown): string | undefined {
  const definition = resolveModuleRef(ref);
  if (definition === undefined) return undefined;
  return (
    previous.moduleByDefinition.get(definition) ??
    previous.moduleByReplaced.get(definition)
  );
}

/**
 * Whether the grant `refs` names is the set the module `held` of `previous`
 * recorded. An empty request grants nothing, so it matches. A ref the graph
 * lacks never matches. The order of the refs does not matter.
 */
export function sameGrant(
  previous: Blueprint,
  held: string,
  refs: readonly unknown[],
): boolean {
  if (refs.length === 0) return true;
  const recorded = previous.modules.get(held)?.grantSet ?? [];
  const ids = new Set<string>();
  for (const ref of refs) {
    const id = heldId(previous, ref);
    if (id === undefined) return false;
    ids.add(id);
  }
  return ids.size === recorded.length && recorded.every((id) => ids.has(id));
}

/**
 * load()'s grant rules, checked against the live blueprint before the walk,
 * so a grant of the root never reaches the walk's stack. Each granted module
 * must be in the graph and must not be the root. A module the graph holds
 * keeps the grant it has: a request for another set is already-loaded. The
 * first entry and grant that break a rule name the error.
 */
function checkGrants(entries: readonly LoadEntry[], previous: Blueprint): void {
  for (const entry of entries) {
    const { module, imports } = splitEntry(entry);
    if (imports.length === 0) continue;
    const loaded = resolveModuleRef(module)?.name ?? describeValue(module);
    for (const ref of imports) {
      const id = heldId(previous, ref);
      const grant = resolveModuleRef(ref)?.name ?? describeValue(ref);
      if (id === undefined)
        throw new LoadGrantError({
          module: loaded,
          grant,
          reason: 'not-in-graph',
        });
      if (id === previous.root)
        throw new LoadGrantError({ module: loaded, grant, reason: 'root' });
    }
    const held = heldId(previous, module);
    if (held === undefined || sameGrant(previous, held, imports)) continue;
    const recorded = previous.modules.get(held)?.grantSet ?? [];
    // The error names the first requested module the record lacks. A request
    // that only drops modules from the record has none, so it names the first
    // requested module.
    const differing =
      imports.find((ref) => {
        const id = heldId(previous, ref);
        return id !== undefined && !recorded.includes(id);
      }) ?? imports[0];
    throw new LoadGrantError({
      module: loaded,
      grant: resolveModuleRef(differing)?.name ?? describeValue(differing),
      reason: 'already-loaded',
    });
  }
}

/**
 * load()'s second rule: collectors built at startup hold their lists, so a
 * load cannot publish a record of a MultiToken that `previous` did not
 * publish. A record is published when its module's exportTokens names its
 * token or a compile.provider hook pinned it. `previous` published the same
 * record when it holds a record under the id with the same module and token,
 * and that record was pinned or its module exported the token. A hook that
 * replaces a module with an equal fresh object every compile keeps its
 * records. A record a compile.provider hook removed or a pin dropped is not
 * checked, since the caller passes the records left after the hooks ran.
 */
function checkNewContributions(
  walked: WalkResult,
  records: readonly ProviderRecord[],
  pinned: ReadonlyMap<TokenKey, readonly string[]>,
  previous: Blueprint,
): void {
  const nodes = new Map(walked.modules.map((m) => [m.id, m]));
  for (const record of records) {
    const token = record.token;
    if (!(token instanceof MultiToken)) continue;
    const node = nodes.get(record.module);
    if (
      pinned.get(token)?.includes(record.id) !== true &&
      node?.exportTokens.includes(token) !== true
    )
      continue;
    const before = previous.providers.get(record.id);
    if (
      before !== undefined &&
      before.module === record.module &&
      before.token === token &&
      (previous.pinned.get(token)?.includes(record.id) === true ||
        previous.modules.get(record.module)?.exportTokens.includes(token) ===
          true)
    )
      continue;
    throw new LoadContributionError({
      module: node?.name ?? record.module,
      token: record.name,
    });
  }
}

/** The built-in REQUEST provider: scoped, visible in every module. */
function requestRecord(index: number, rootId: string): ProviderRecord {
  return providerRecord(
    {
      kind: 'value',
      token: REQUEST,
      lifetime: 'scoped',
      eager: true,
      deps: [],
      props: [],
    },
    REQUEST_ID,
    index,
    rootId,
    'REQUEST',
  );
}

/**
 * Compiles definitions into a frozen Blueprint, or throws one BlueprintError
 * holding every error in pass order. Constructs nothing and calls no user code.
 * Each pass collects errors and continues; a pass skips what an earlier error
 * broke, so one missing token produces one error. Pass 2 reports by module
 * walk order, then token order (see computeVisibility).
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
    HOOK_SITES && (hooks.module.length > 0 || hooks.provider.length > 0)
      ? compileContext(phase, input.canon ?? sameToken)
      : undefined;
  let replacedModules: ReadonlyMap<ModuleDefinition, ModuleDefinition> =
    NO_ENTRIES;
  let replace: ((definition: ModuleDefinition) => ModuleDefinition) | undefined;
  if (context !== undefined && hooks.module.length > 0) {
    const replaced = new Map<ModuleDefinition, ModuleDefinition>();
    replace = moduleReplacerFor(hooks, context, errors, replaced);
    replacedModules = replaced;
  }
  const keying =
    HOOK_SITES && input.canon !== sameToken ? input.canon : undefined;
  const canon =
    keying === undefined ? undefined : reportingCanon(keying, errors);
  const pluginImports = HOOK_SITES ? input.pluginImports : undefined;
  // Like checkNewGlobals, the guard throws alone. It runs ahead of the walk,
  // so a grant of the root never reaches the walk's stack.
  if (input.previous !== undefined) checkGrants(extraImports, input.previous);
  const walked = walk(
    {
      canon,
      root: input.root,
      extraImports:
        pluginImports === undefined || pluginImports.length === 0
          ? extraImports
          : [
              // A plugin's module is never a grant entry, whatever its shape.
              ...pluginImports.map((module) => ({
                module: module as ModuleRef,
                imports: [],
              })),
              ...extraImports,
            ],
      previous: input.previous,
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
  // id → record, in index order.
  const providers = new Map<string, ProviderRecord>();
  for (const record of records) providers.set(record.id, record);
  const rewrittenBy = rewritten?.rewrittenBy ?? NO_ENTRIES;
  const pinned = new Map<TokenKey, readonly string[]>([
    [REQUEST, [REQUEST_ID]],
  ]);
  if (rewritten !== undefined)
    for (const [token, ids] of rewritten.pinned) pinned.set(token, ids);
  const nameOf = (id: string): string => providers.get(id)?.name ?? id;
  errors.push(...walked.exportErrors);
  // Like checkNewGlobals, the guard throws alone: errors collected earlier in
  // this compile do not reach the user.
  if (input.previous !== undefined)
    checkNewContributions(walked, records, pinned, input.previous);

  // Pass 2: visibility.
  const visible = computeVisibility(
    {
      modules: walked.modules,
      records,
      providers,
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
  errors.push(
    ...unreadContributions(walked.modules, records, pinned, walked.records),
  );

  // Pass 4: cycles, ignoring lazy edges.
  const strong = successorsOf(bound.edges, ordersBuild);
  let byFrom: ReturnType<typeof orderingEdgesFrom> | undefined;
  for (const component of findCycles([...providers.keys()], strong)) {
    const path = cyclePath(
      component,
      strong,
      (id) => providers.get(id)?.index ?? 0,
    );
    byFrom ??= orderingEdgesFrom(bound.edges);
    errors.push(
      new CircularDependencyError({
        path: path.map(nameOf),
        kinds: stepKinds(path, byFrom),
      }),
    );
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
    HOOK_SITES &&
    (hooks.check.length > 0 || (input.wantsView === true && errors.length > 0))
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
            bindings: bound.bindings,
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

  const bp: Blueprint = Object.freeze({
    root,
    modules: new Map(walked.modules.map((m) => [m.id, m])),
    moduleByDefinition: walked.byDefinition,
    moduleByReplaced: moduleIdsOf(walked),
    providers,
    nextIds: walked.nextIds,
    pinned,
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
  if (view !== undefined) adoptView(bp, view);
  return bp;
}
