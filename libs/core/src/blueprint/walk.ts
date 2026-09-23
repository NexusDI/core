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
import type {
  ModuleNode,
  ProviderRecord,
  RecordShape,
  TokenKey,
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
}

/** A ModuleNode under construction: its id/imports/providers fill in as the walk proceeds. */
type NodeDraft = Omit<ModuleNode, 'imports' | 'providers'> & {
  readonly imports: string[];
  readonly providers: string[];
};

/**
 * Pass 1. A depth-first walk from the root that deduplicates modules by
 * identity, assigns ids in walk order and normalises every provider.
 */
export function walk(input: WalkInput, errors: NexusError[]): WalkResult {
  const modules: NodeDraft[] = [];
  const records: ProviderRecord[] = [];
  const byDefinition = new Map<ModuleDefinition, string>();
  const broken = new Set<TokenKey>();
  const stack: ModuleDefinition[] = [];

  const addProviders = (
    node: NodeDraft,
    definition: ModuleDefinition,
  ): void => {
    const plain = new Set<TokenKey>();
    const accept = (shape: RecordShape): void => {
      if (!(shape.token instanceof MultiToken)) {
        if (plain.has(shape.token)) {
          errors.push(
            new DuplicateProviderError({
              token: displayName(shape.token),
              module: definition.name,
            }),
          );
          return;
        }
        plain.add(shape.token);
      }
      const index = records.length;
      const id = `p${index}`;
      records.push({
        ...shape,
        id,
        index,
        module: node.id,
        name: displayName(shape.token),
      });
      node.providers.push(id);
    };

    definition.providers.forEach((entry, index) => {
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
    for (const child of [...definition.imports, ...extra]) {
      const id = visit(child, []);
      if (id !== undefined && !node.imports.includes(id)) node.imports.push(id);
    }
    stack.pop();
    return node.id;
  };

  visit(input.root, input.extraImports);
  return { modules, records, byDefinition, broken };
}
