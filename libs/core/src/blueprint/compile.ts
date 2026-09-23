import { REQUEST } from '../definitions/request.js';
import {
  BlueprintError,
  CircularDependencyError,
  type NexusError,
} from '../errors/index.js';
import { bind } from './bind.js';
import {
  REQUEST_ID,
  type Blueprint,
  type ProviderRecord,
} from './blueprint.js';
import { computeLevels } from './levels.js';
import { checkLifetimes } from './lifetimes.js';
import { cyclePath, findCycles, successorsOf } from './tarjan.js';
import { computeVisibility } from './visibility.js';
import { walk } from './walk.js';

export interface CompileInput {
  /** The root module. */
  readonly root: unknown;
  /** Modules load() added as root imports. */
  readonly extraImports?: readonly unknown[];
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

  // Pass 1: walk and deduplicate.
  const walked = walk({ root: input.root, extraImports }, errors);
  const root = walked.modules[0]?.id ?? 'm0';
  const records = [
    ...walked.records,
    requestRecord(walked.records.length, root),
  ];
  const providers = new Map(records.map((r) => [r.id, r]));
  const nameOf = (id: string): string => providers.get(id)?.name ?? id;

  // Pass 2: visibility.
  const visible = computeVisibility(
    {
      modules: walked.modules,
      records,
      byDefinition: walked.byDefinition,
      pinned: new Map([[REQUEST, [REQUEST_ID]]]),
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

  if (errors.length > 0) throw new BlueprintError(errors);

  // Pass 6: levels.
  const levels = computeLevels(providers, strong);
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
    providers,
    extraImports,
    visibility: visible.visibility,
    moduleExports: visible.moduleExports,
    exportedTokens: visible.exportedTokens,
    bindings: bound.bindings,
    edges: bound.edges,
    singletonLevels: levels.singleton,
    scopedLevels: levels.scoped,
    needsRequest: requestDependents.length > 0,
    requestDependents,
  });
}
