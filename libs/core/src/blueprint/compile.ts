import { BlueprintError, type NexusError } from '../errors/index.js';
import type { Blueprint } from './blueprint.js';
import { walk } from './walk.js';

export interface CompileInput {
  /** The root module. */
  readonly root: unknown;
  /** Modules load() added as root imports. */
  readonly extraImports?: readonly unknown[];
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

  if (errors.length > 0) throw new BlueprintError(errors);

  return Object.freeze({
    root: walked.modules[0]?.id ?? 'm0',
    modules: new Map(walked.modules.map((m) => [m.id, m])),
    moduleByDefinition: walked.byDefinition,
    providers: new Map(walked.records.map((r) => [r.id, r])),
    extraImports,
  });
}
