import {
  moduleInternals,
  resolveModuleRef,
  type ModuleDefinition,
} from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { MultiToken, displayName } from '../definitions/token.js';
import {
  DuplicateProviderError,
  InvalidModuleError,
  ModuleImportCycleError,
  ModuleOptionsError,
  type NexusError,
} from '../errors/index.js';
import {
  NO_ENTRIES,
  type ModuleNode,
  type ProviderRecord,
  type RecordShape,
  type TokenKey,
} from './blueprint.js';
import { normalizeProvider, optionsShape, tokenOfEntry } from './records.js';

export interface WalkInput {
  readonly root: unknown;
  /** Imports load() added to the root, walked after the root's own. */
  readonly extraImports: readonly unknown[];
  /** The module to walk in place of the one met. Testing overrides use it. */
  readonly replace?: (definition: ModuleDefinition) => ModuleDefinition;
}

export interface WalkResult {
  readonly modules: readonly ModuleNode[];
  readonly records: readonly ProviderRecord[];
  readonly byDefinition: ReadonlyMap<ModuleDefinition, string>;
  /** Tokens whose provider was rejected, so pass 3 does not report them as missing too. */
  readonly broken: ReadonlySet<TokenKey>;
  /**
   * Provider id → the length `errors` had when the walk met it, for each
   * provider of a plain token its module already provides. `rejectDuplicates`
   * reports the ones the compile.provider hooks leave, at that place.
   */
  readonly duplicates: ReadonlyMap<string, number>;
}

/** A ModuleNode under construction: its id/imports/providers fill in as the walk proceeds. */
type NodeDraft = Omit<ModuleNode, 'imports' | 'providers'> & {
  readonly imports: string[];
  readonly providers: string[];
};

/**
 * Pass 1. A depth-first walk from the root that deduplicates modules by
 * identity, assigns ids in walk order and normalises every provider. It keeps
 * a duplicate provider and marks it; `rejectDuplicates` reports it after the
 * compile.provider hooks, which may remove one of the two (spec §5 pass 1).
 */
export function walk(input: WalkInput, errors: NexusError[]): WalkResult {
  const modules: NodeDraft[] = [];
  const records: ProviderRecord[] = [];
  const byDefinition = new Map<ModuleDefinition, string>();
  const broken = new Set<TokenKey>();
  let duplicates: Map<string, number> | undefined;
  const stack: ModuleDefinition[] = [];

  const addProviders = (
    node: NodeDraft,
    definition: ModuleDefinition,
  ): void => {
    const plain = new Set<TokenKey>();
    const accept = (shape: RecordShape): void => {
      const index = records.length;
      const id = `p${index}`;
      if (!(shape.token instanceof MultiToken)) {
        if (plain.has(shape.token))
          (duplicates ??= new Map()).set(id, errors.length);
        else plain.add(shape.token);
      }
      records.push({
        ...shape,
        id,
        index,
        module: node.id,
        name: displayName(shape.token),
      });
      node.providers.push(id);
    };

    // The same entry listed twice is one provider, as one module imported twice is one module.
    const listed = new Set<unknown>();

    definition.providers.forEach((entry, index) => {
      if (listed.has(entry)) return;
      listed.add(entry);
      const shape = normalizeProvider(
        entry,
        { module: definition.name, index },
        errors,
      );
      if (shape !== null) return accept(shape);
      const token = tokenOfEntry(entry);
      if (token !== undefined) broken.add(token);
    });

    const internals = moduleInternals(definition);
    if (internals?.options === undefined) return;
    if (internals.source === undefined) {
      broken.add(internals.options);
      return;
    }
    const shape = optionsShape(
      internals,
      { module: definition.name, index: definition.providers.length },
      errors,
    );
    if (shape === null) broken.add(internals.options);
    else accept(shape);
  };

  const visit = (
    ref: unknown,
    extra: readonly unknown[],
  ): string | undefined => {
    const found = resolveModuleRef(ref);
    if (found === undefined) {
      errors.push(
        new InvalidModuleError({
          received: describeValue(ref),
          path: stack.map((m) => m.name),
        }),
      );
      return undefined;
    }
    const definition = input.replace?.(found) ?? found;

    const onStack = stack.indexOf(definition);
    if (onStack !== -1) {
      const path = [
        ...stack.slice(onStack).map((m) => m.name),
        definition.name,
      ];
      errors.push(new ModuleImportCycleError({ path }));
      return undefined;
    }
    const seen = byDefinition.get(definition);
    if (seen !== undefined) return seen;

    const internals = moduleInternals(definition);
    if (internals?.options !== undefined && internals.source === undefined) {
      errors.push(
        new ModuleOptionsError({
          code: 'NEXUS_MODULE_OPTIONS_MISSING',
          module: definition.name,
        }),
      );
    }

    const node: NodeDraft = {
      id: `m${modules.length}`,
      index: modules.length,
      name: definition.name,
      definition,
      global: definition.global,
      imports: [],
      providers: [],
    };
    modules.push(node);
    byDefinition.set(definition, node.id);
    addProviders(node, definition);

    stack.push(definition);
    const imported = new Set<string>();
    for (const child of [...definition.imports, ...extra]) {
      const id = visit(child, []);
      if (id !== undefined && !imported.has(id)) {
        imported.add(id);
        node.imports.push(id);
      }
    }
    stack.pop();
    return node.id;
  };

  visit(input.root, input.extraImports);
  return {
    modules,
    records,
    byDefinition,
    broken,
    duplicates: duplicates ?? NO_ENTRIES,
  };
}

/**
 * Pass 1, after the compile.provider hooks: a plain token provided twice in
 * one module is NEXUS_DUPLICATE_PROVIDER, and the compile drops the later
 * provider. Each error goes where the walk met the provider, so with no
 * plugin the errors keep the walk's order.
 */
export function rejectDuplicates(
  records: readonly ProviderRecord[],
  walked: WalkResult,
  errors: NexusError[],
): readonly ProviderRecord[] {
  if (walked.duplicates.size === 0) return records;
  const nameOf = new Map(walked.modules.map((m) => [m.id, m.name]));
  const seen = new Map<string, Set<TokenKey>>();
  const found: { readonly at: number; readonly error: NexusError }[] = [];
  const kept = records.filter((record) => {
    if (record.token instanceof MultiToken) return true;
    let tokens = seen.get(record.module);
    if (tokens === undefined) {
      tokens = new Set();
      seen.set(record.module, tokens);
    }
    if (!tokens.has(record.token)) {
      tokens.add(record.token);
      return true;
    }
    found.push({
      // Only a provider the walk marked can follow another of its token here.
      at: walked.duplicates.get(record.id) ?? errors.length,
      error: new DuplicateProviderError({
        token: record.name,
        module: nameOf.get(record.module) ?? record.module,
      }),
    });
    return false;
  });
  // `found` is in walk order, so each insert lands after the one before it.
  found.forEach(({ at, error }, i) => errors.splice(at + i, 0, error));
  return kept;
}
