import {
  moduleInternals,
  resolveModuleRef,
  type ModuleDefinition,
} from '../definitions/define-module.js';
import { isForeign } from '../definitions/brand.js';
import {
  describeValue,
  notShared,
  MultiToken,
  displayName,
} from '../definitions/token.js';
import { isToken } from '../definitions/guards.js';
import {
  DuplicateProviderError,
  InvalidExportError,
  InvalidModuleError,
  ModuleImportCycleError,
  ModuleOptionsError,
  type NexusError,
} from '../errors/index.js';
import {
  NO_ENTRIES,
  type Blueprint,
  type ModuleNode,
  type ProviderRecord,
  type RecordShape,
  type TokenKey,
} from './blueprint.js';
import { keyShape } from './hooks.js';
import { splitEntry, type LoadEntry } from './load-entry.js';
import {
  normalizeProvider,
  optionsShape,
  providerRecord,
  tokenOfEntry,
} from './records.js';
import { sameToken, type Canonicalizer } from './views.js';

/** Whether two records build alike, comparing recipes by reference. */
function sameRecipe(a: RecordShape, b: RecordShape): boolean {
  // Eager and schema are left out because they do not change the built
  // instance, and props are left out because they follow useClass.
  return (
    a.token === b.token &&
    a.kind === b.kind &&
    a.useClass === b.useClass &&
    a.useFactory === b.useFactory &&
    a.target === b.target &&
    a.lifetime === b.lifetime &&
    Object.is(a.value, b.value) &&
    a.deps.length === b.deps.length &&
    a.deps.every(
      (d, i) => d.kind === b.deps[i].kind && d.token === b.deps[i].token,
    )
  );
}

export interface WalkInput {
  readonly root: unknown;
  /**
   * Imports load() added to the root, walked after the root's own. An entry
   * with load imports gives every module the walk first meets under it the
   * exports of the imported modules, which an earlier walk of the same graph
   * already visited.
   */
  readonly extraImports: readonly LoadEntry[];
  /**
   * The blueprint a load compiles against. A module it holds keeps its id and
   * each of its records keeps the id it had; what it lacks takes the next
   * free index. Absent, the ids count from zero in walk order.
   */
  readonly previous?: Blueprint;
  /** The module to walk in place of the one met. The compile.module hooks use it. */
  readonly replace?: (definition: ModuleDefinition) => ModuleDefinition;
  /**
   * Keys every token when a tokenKey hook is registered: records, deps,
   * properties, alias targets, exports and broken tokens. Absent, every
   * token is its own key and the walk copies nothing.
   */
  readonly canon?: Canonicalizer;
}

export interface WalkResult {
  readonly modules: readonly ModuleNode[];
  readonly records: readonly ProviderRecord[];
  /** The next free module and record index after this walk. */
  readonly nextIds: readonly [number, number];
  readonly byDefinition: ReadonlyMap<ModuleDefinition, string>;
  /** Tokens whose provider was rejected, so pass 3 does not report them as missing too. */
  readonly broken: ReadonlySet<TokenKey>;
  /**
   * Provider id → the length `errors` had when the walk met it, for each
   * provider of a plain token its module already provides. `rejectDuplicates`
   * reports the ones the compile.provider hooks leave, at that place.
   */
  readonly duplicates: ReadonlyMap<string, number>;
  /** Each definition `replace` swapped → the definition walked in its place. */
  readonly swapped: ReadonlyMap<ModuleDefinition, ModuleDefinition>;
  /**
   * The errors the export plans raised, in module id order. The compile
   * reports them after the compile.provider hooks, ahead of pass 2's.
   */
  readonly exportErrors: readonly NexusError[];
}

/** A ModuleNode under construction: its lists fill in as the walk proceeds. */
type NodeDraft = Omit<
  ModuleNode,
  | 'imports'
  | 'loadImports'
  | 'providers'
  | 'shapes'
  | 'entries'
  | 'exportTokens'
  | 'exportModules'
> & {
  readonly imports: string[];
  readonly loadImports: string[];
  readonly providers: string[];
  readonly shapes: RecordShape[];
  readonly entries: unknown[];
  readonly exportTokens: TokenKey[];
  readonly exportModules: string[];
};

/**
 * Pass 1. A depth-first walk from the root that deduplicates modules by
 * identity and normalises every provider. A module and a record the previous
 * blueprint holds keep their ids; the rest number on from `nextIds`. It keeps
 * a duplicate provider and marks it; `rejectDuplicates` reports it after the
 * compile.provider hooks, which may remove one of the two (spec §5 pass 1).
 */
export function walk(input: WalkInput, errors: NexusError[]): WalkResult {
  const modules: NodeDraft[] = [];
  const records: ProviderRecord[] = [];
  const byDefinition = new Map<ModuleDefinition, string>();
  const broken = new Set<TokenKey>();
  let duplicates: Map<string, number> | undefined;
  let swapped: Map<ModuleDefinition, ModuleDefinition> | undefined;
  const stack: ModuleDefinition[] = [];
  const canon = input.canon;
  const keyOf = canon ?? sameToken;
  const previous = input.previous;
  let nextModule = previous?.nextIds[0] ?? 0;
  let nextRecord = previous?.nextIds[1] ?? 0;
  const claimed = new Set<string>();

  // The id previous holds for the module walked as `definition`, the first
  // of these that previous knows:
  // 1. the definition itself;
  // 2. the original a compile.module hook replaced;
  // 3. the module that original was replaced by last time.
  const heldId = (
    definition: ModuleDefinition,
    original: ModuleDefinition,
  ): string | undefined => {
    if (previous === undefined) return undefined;
    const id =
      previous.moduleByDefinition.get(definition) ??
      previous.moduleByDefinition.get(original) ??
      previous.moduleByReplaced.get(original);
    return id !== undefined && !claimed.has(id) ? id : undefined;
  };

  const addProviders = (
    node: NodeDraft,
    definition: ModuleDefinition,
    held: ModuleNode | undefined,
  ): void => {
    const plain = new Set<TokenKey>();
    const pending: {
      readonly written: RecordShape;
      readonly shape: RecordShape;
      readonly entry: unknown;
      readonly at: number;
      readonly dup: boolean;
    }[] = [];
    const accept = (written: RecordShape, entry?: unknown): void => {
      const shape = canon === undefined ? written : keyShape(written, canon);
      let dup = false;
      if (!(shape.token instanceof MultiToken)) {
        dup = plain.has(shape.token);
        plain.add(shape.token);
      }
      pending.push({ written, shape, entry, at: errors.length, dup });
    };

    // A record keeps the id of a record the held module had only when the
    // match is unambiguous. The steps, in order:
    // 1. the same entry object;
    // 2. the same token with an equal recipe (first unclaimed, in order);
    // 3. the only record of its token on both sides.
    // Any other record takes a fresh id and builds anew, since a wrong
    // instance is worse than a rebuilt one. A lone record replaced by a
    // different recipe keeps its built instance, as a held provider whose
    // recipe a hook changes does (#277). The held node's walked shapes, from
    // before the compile.provider hooks, give the candidates, so a record a
    // hook rewrote or removed still matches.
    const assign = (): void => {
      const ids: (string | undefined)[] = [];
      if (held !== undefined) {
        pending.forEach(({ entry }, n) => {
          const i = held.entries.indexOf(entry);
          if (entry !== undefined && i !== -1) ids[n] = held.providers[i];
        });
        pending.forEach(({ shape }, n) => {
          if (ids[n] === undefined) {
            const i = held.shapes.findIndex(
              (before, j) =>
                !ids.includes(held.providers[j]) && sameRecipe(before, shape),
            );
            if (i !== -1) ids[n] = held.providers[i];
          }
        });
        const tokens = held.shapes.map((x) => x.token);
        pending.forEach(({ shape: { token } }, n) => {
          const i = tokens.indexOf(token);
          if (
            ids[n] === undefined &&
            i !== -1 &&
            i === tokens.lastIndexOf(token) &&
            !ids.includes(held.providers[i]) &&
            pending.filter((q) => q.shape.token === token).length === 1
          )
            ids[n] = held.providers[i];
        });
      }
      pending.forEach(({ written, shape, entry, at, dup }, n) => {
        const id = ids[n] ?? `p${nextRecord++}`;
        if (dup) (duplicates ??= new Map()).set(id, at);
        records.push(
          providerRecord(
            shape,
            id,
            records.length,
            node.id,
            displayName(written.token),
          ),
        );
        node.providers.push(id);
        node.shapes.push(shape);
        node.entries.push(entry);
      });
    };

    const collect = (): void => {
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
        if (shape !== null) return accept(shape, entry);
        const token = tokenOfEntry(entry);
        if (token !== undefined) broken.add(keyOf(token));
      });

      const internals = moduleInternals(definition);
      if (internals?.options === undefined) return;
      if (internals.source === undefined) {
        broken.add(keyOf(internals.options));
        return;
      }
      const shape = optionsShape(
        internals,
        { module: definition.name, index: definition.providers.length },
        errors,
      );
      if (shape === null) broken.add(keyOf(internals.options));
      else accept(shape);
    };
    collect();
    assign();
  };

  // The ids of the imported modules, in load import order, without repeats.
  // A load import names a module an earlier walk of the graph visited; a ref
  // the walk has not visited is skipped, since compile() rejects it before the
  // walk.
  const loadImportIds = (refs: readonly unknown[]): readonly string[] => {
    const ids = new Set<string>();
    for (const ref of refs) {
      const found = resolveModuleRef(ref);
      if (found === undefined) continue;
      // A walked definition is looked up as it is, so the compile.module hook
      // never runs on it. An original the hook replaced goes through the
      // hook's memo.
      const id =
        byDefinition.get(found) ??
        byDefinition.get(input.replace?.(found) ?? found);
      if (id !== undefined) ids.add(id);
    }
    return [...ids];
  };

  // The load import ids of the entry being walked: each module created
  // while it is set records them and imports them.
  let loadImported: readonly string[] = [];

  const visit = (
    ref: unknown,
    extra: readonly LoadEntry[],
  ): string | undefined => {
    const found = resolveModuleRef(ref);
    if (found === undefined) {
      const path = stack.map((m) => m.name);
      errors.push(
        isForeign(ref)
          ? notShared(
              ref,
              path.length > 0 ? `imported by ${path.join(' → ')}` : null,
            )
          : new InvalidModuleError({ received: describeValue(ref), path }),
      );
      return undefined;
    }
    const definition = input.replace?.(found) ?? found;
    if (definition !== found) (swapped ??= new Map()).set(found, definition);

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
          issues: [],
        }),
      );
    }

    const keptId = heldId(definition, found);
    if (keptId !== undefined) claimed.add(keptId);
    const node: NodeDraft = {
      id: keptId ?? `m${nextModule++}`,
      index: modules.length,
      name: definition.name,
      definition,
      global: definition.global,
      imports: [],
      loadImports: [],
      loadImportSet: loadImported,
      providers: [],
      shapes: [],
      entries: [],
      exportTokens: [],
      exportModules: [],
    };
    modules.push(node);
    byDefinition.set(definition, node.id);
    addProviders(
      node,
      definition,
      keptId === undefined ? undefined : previous?.modules.get(keptId),
    );

    stack.push(definition);
    const imported = new Set<string>();
    const add = (id: string | undefined): void => {
      if (id !== undefined && !imported.has(id)) {
        imported.add(id);
        node.imports.push(id);
      }
    };
    for (const child of definition.imports) add(visit(child, []));
    for (const entry of extra) {
      const { module, imports } = splitEntry(entry);
      loadImported = loadImportIds(imports);
      add(visit(module, []));
      loadImported = [];
    }
    // The imported modules were visited before this module, so their ids exist.
    // `loadImports` keeps the ones the module did not already import.
    for (const id of node.loadImportSet)
      if (!imported.has(id)) {
        node.loadImports.push(id);
        add(id);
      }
    stack.pop();
    return node.id;
  };

  visit(input.root, input.extraImports);

  // Each module's export plan, in module id order. A module entry must name
  // a module the node imports, after replacement. A compile.module hook may
  // report errors here too, so every error from this point moves to
  // `exportErrors` in the order it was raised.
  const mark = errors.length;
  for (const node of modules) {
    for (const entry of node.definition.exports) {
      const found = resolveModuleRef(entry);
      if (found !== undefined) {
        const id = byDefinition.get(input.replace?.(found) ?? found);
        if (id !== undefined && node.imports.includes(id))
          node.exportModules.push(id);
        else
          errors.push(
            new InvalidExportError({ token: found.name, module: node.name }),
          );
      } else if (isToken(entry)) {
        node.exportTokens.push(keyOf(entry));
      } else {
        errors.push(
          new InvalidExportError({
            token: describeValue(entry),
            module: node.name,
          }),
        );
      }
    }
  }

  return {
    modules,
    records,
    nextIds: [nextModule, nextRecord],
    byDefinition,
    broken,
    duplicates: duplicates ?? NO_ENTRIES,
    swapped: swapped ?? NO_ENTRIES,
    exportErrors: errors.splice(mark),
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
