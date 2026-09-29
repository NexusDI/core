import type { ProviderView } from '@nexusdi/core';

import type { Declarations } from './metadata.js';
import type { NormalBinding, NormalGlobal } from './options.js';
import type { InterceptorToken } from './types.js';

/** The bindings for the provider's token, before or after a tokenKey plugin keyed it. */
export function bindingsFor(
  provider: ProviderView,
  bindings: readonly NormalBinding[],
): readonly NormalBinding[] {
  return bindings.filter(
    (b) => b.token === provider.token || b.token === provider.written,
  );
}

/**
 * The interceptors for one method, outermost first (spec R5): global
 * entries, then bindings, then class lists, then method lists. A token
 * runs once, at its first position. A symbol key takes method lists only
 * (spec R11).
 */
export function chainFor(
  provider: ProviderView,
  method: string | symbol,
  global: readonly NormalGlobal[],
  bindings: readonly NormalBinding[],
  declarations: Declarations,
): readonly InterceptorToken[] {
  const chain: InterceptorToken[] = [];
  const seen = new Set<InterceptorToken>();
  const add = (tokens: readonly InterceptorToken[] | undefined): void => {
    for (const token of tokens ?? []) {
      if (seen.has(token)) continue;
      seen.add(token);
      chain.push(token);
    }
  };
  const named = typeof method === 'string';
  if (named)
    for (const entry of global)
      if (entry.when === undefined || entry.when({ provider, method }))
        add([entry.use]);
  for (const binding of bindings) {
    if (named) add(binding.class);
    add(binding.methods.get(method));
  }
  if (named) add(declarations.classTokens);
  add(declarations.methods.get(method));
  return chain;
}
