import type { EdgeKind, ProviderRecord } from './blueprint.js';

/** True when core builds an edge's target before its dependent. Cycles and levels count these edges only. */
export const ordersBuild = (
  kind: EdgeKind,
): kind is Exclude<EdgeKind, 'lazy'> => kind !== 'lazy';

/** True for a provider with no build level of its own: a transient or an alias. */
export const isInline = (
  r: Pick<ProviderRecord, 'lifetime' | 'kind'>,
): boolean => r.lifetime === 'transient' || r.kind === 'alias';
