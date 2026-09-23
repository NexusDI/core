import { displayName } from '../definitions/token.js';
import { MissingProviderError, type NexusError } from '../errors/index.js';
import {
  REQUEST_ID,
  type Binding,
  type DepEntry,
  type Edge,
  type ModuleNode,
  type ProviderBindings,
  type ProviderRecord,
  type TokenKey,
} from './blueprint.js';
import { findNearMisses } from './near-misses.js';
import type { Visibility } from './visibility.js';

export interface BindInput {
  readonly modules: readonly ModuleNode[];
  readonly records: readonly ProviderRecord[];
  readonly visibility: Visibility;
  /** Tokens whose provider already has an error. */
  readonly broken: ReadonlySet<TokenKey>;
}

export interface BindResult {
  readonly bindings: Map<string, ProviderBindings>;
  readonly edges: Edge[];
}

/**
 * Pass 3. Looks every deps entry, property and alias target up in the owning
 * module's visibility map and records an edge per binding. A required, lazy
 * or alias entry with no binding is NEXUS_MISSING_PROVIDER, unless an earlier
 * pass already reported that token.
 */
export function bind(input: BindInput, errors: NexusError[]): BindResult {
  const names = new Map(input.modules.map((m) => [m.id, m.name]));
  const bindings = new Map<string, ProviderBindings>();
  const edges: Edge[] = [];

  for (const record of input.records) {
    if (record.id === REQUEST_ID) continue;
    const visible = input.visibility.visibility.get(record.module);
    const lookup = (token: TokenKey): readonly string[] =>
      visible?.get(token) ?? [];

    const reportMissing = (token: TokenKey): void => {
      if (
        input.broken.has(token) ||
        input.visibility.ambiguous.get(record.module)?.has(token)
      )
        return;
      errors.push(
        new MissingProviderError({
          token: displayName(token),
          requester: record.name,
          module: names.get(record.module) ?? record.module,
          nearMisses: findNearMisses(token, record.module, {
            modules: input.modules,
            records: input.records,
            exportedTokens: input.visibility.exportedTokens,
          }),
        }),
      );
    };

    const bindOne = (dep: DepEntry): Binding => {
      const ids = lookup(dep.token);
      if (dep.kind === 'all') {
        for (const to of ids) edges.push({ from: record.id, to, kind: 'all' });
        return { kind: 'all', token: dep.token, ids };
      }
      const [to] = ids;
      if (to === undefined) {
        if (dep.kind !== 'optional') reportMissing(dep.token);
        return { kind: dep.kind, token: dep.token, ids: [] };
      }
      edges.push({ from: record.id, to, kind: dep.kind });
      return { kind: dep.kind, token: dep.token, ids: [to] };
    };

    const args = record.deps.map(bindOne);
    const props = record.props.map((prop) => bindOne(prop.dep));
    let target: string | null = null;
    if (record.kind === 'alias' && record.target !== undefined) {
      const [to] = lookup(record.target);
      if (to === undefined) reportMissing(record.target);
      else {
        edges.push({ from: record.id, to, kind: 'alias' });
        target = to;
      }
    }
    bindings.set(record.id, { args, props, target });
  }

  return { bindings, edges };
}
