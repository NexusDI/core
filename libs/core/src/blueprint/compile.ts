import { REQUEST } from '../definitions/request.js';
import { BlueprintError, type NexusError } from '../errors/index.js';
import {
  REQUEST_ID,
  type Blueprint,
  type ProviderRecord,
} from './blueprint.js';
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

  if (errors.length > 0) throw new BlueprintError(errors);

  return Object.freeze({
    root,
    modules: new Map(walked.modules.map((m) => [m.id, m])),
    moduleByDefinition: walked.byDefinition,
    providers: new Map(records.map((r) => [r.id, r])),
    extraImports,
    visibility: visible.visibility,
    moduleExports: visible.moduleExports,
    exportedTokens: visible.exportedTokens,
  });
}
