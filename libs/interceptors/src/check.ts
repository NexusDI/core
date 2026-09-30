import type {
  InjectionToken,
  BlueprintView,
  NexusError,
  ProviderView,
} from '@nexusdi/core';

import { bindingsFor } from './chain.js';
import { invalid, lifetime, missing } from './interceptor-error.js';
import { declarationsOf, type AnyClass } from './metadata.js';
import { keyName, nameOf } from './names.js';
import type { NormalOptions } from './options.js';
import { findMethod } from './proxy.js';

/** Whether `provider` is a provider of one of `tokens`. */
export const isOneOf = (
  provider: ProviderView,
  tokens: readonly unknown[],
): boolean =>
  tokens.includes(provider.token) || tokens.includes(provider.written);

/**
 * `from` and every provider it reaches through a dependency edge of any
 * kind, transitively.
 */
export function reach(
  view: BlueprintView,
  from: Iterable<string>,
): Set<string> {
  const found = new Set(from);
  for (let grew = true; grew;) {
    grew = false;
    for (const edge of view.edges)
      if (found.has(edge.from) && !found.has(edge.to)) {
        found.add(edge.to);
        grew = true;
      }
  }
  return found;
}

/**
 * The exemption rule (spec R11). A root is a provider outside the plugin's
 * module that a provider inside it depends on directly. With global
 * entries, each root must be listed in `exempt`, and each `exempt` token
 * must be a root, so every provider global entries skip is named in the
 * config. A registered interceptor that a provider in its own dep closure
 * names in a class list or binding would call itself on every call.
 */
function checkSupport(
  view: BlueprintView,
  report: (error: NexusError) => void,
  config: NormalOptions,
  byId: ReadonlyMap<string, ProviderView>,
  ownModuleId: string,
): void {
  const inside = (id: string) => byId.get(id)?.module === ownModuleId;
  const names = (ids: Iterable<string>) =>
    [...ids].filter((id) => !inside(id)).map((id) => byId.get(id)?.name ?? id);

  if (config.global.length > 0) {
    const roots = new Map<string, string>();
    for (const edge of view.edges)
      if (
        inside(edge.from) &&
        !inside(edge.to) &&
        byId.get(edge.to)?.kind !== 'value' &&
        !roots.has(edge.to)
      )
        roots.set(edge.to, edge.from);
    const listed = new Set<InjectionToken<unknown>>();
    for (const [id, from] of roots) {
      const root = byId.get(id);
      if (root === undefined) continue;
      const hit = config.exempt.find(
        (token) => token === root.token || token === root.written,
      );
      if (hit !== undefined) listed.add(hit);
      else
        report(
          invalid('unexempted-dep', {
            token: byId.get(from)?.name ?? null,
            target: root.name,
            detail: names(reach(view, [id])),
          }),
        );
    }
    for (const token of config.exempt)
      if (!listed.has(token))
        report(
          invalid('unused-exempt', {
            target: nameOf(token),
            detail: [...roots.keys()]
              .filter((id) =>
                [...reach(view, [id])].some((at) => {
                  const p = byId.get(at);
                  return p !== undefined && isOneOf(p, [token]);
                }),
              )
              .map((id) => byId.get(id)?.name ?? id),
          }),
        );
  }

  for (const provider of view.providers) {
    if (provider.module !== ownModuleId) continue;
    const entry = config.registered.find((r) => isOneOf(provider, [r.token]));
    if (entry === undefined) continue;
    for (const id of reach(view, [provider.id])) {
      const target = byId.get(id);
      if (target === undefined || inside(id)) continue;
      const classLists = bindingsFor(target, config.bindings).map(
        (b) => b.class,
      );
      if (target.implementation !== null)
        classLists.push(declarationsOf(target.implementation).classTokens);
      if (classLists.some((list) => list.includes(entry.token)))
        report(
          invalid('self-intercept', {
            token: nameOf(entry.token),
            target: target.name,
          }),
        );
    }
  }
}

/**
 * The plugin's compile checks (spec 5.4). Adds errors to core's
 * BlueprintError; never removes one.
 */
export function checkBlueprint(
  view: BlueprintView,
  report: (error: NexusError) => void,
  config: NormalOptions,
  ownModuleId: string | undefined,
): void {
  const registered = config.registered.map((entry) => entry.token);
  const checked = new Set<AnyClass>();

  for (const provider of view.providers) {
    if (provider.module === ownModuleId) {
      if (
        isOneOf(provider, registered) &&
        (provider.lifetime === 'scoped' || provider.lifetime === 'transient')
      )
        report(lifetime(provider.written, provider.lifetime));
      continue;
    }
    const cls = provider.implementation;
    if (cls === null || checked.has(cls)) continue;
    checked.add(cls);
    const declarations = declarationsOf(cls);
    for (const problem of declarations.problems)
      report(
        invalid(problem.reason, {
          target: problem.target,
          detail: problem.key === undefined ? [] : [problem.key],
        }),
      );
    for (const token of declarations.classTokens)
      if (!registered.includes(token)) report(missing(token, cls.name, null));
    for (const [key, tokens] of declarations.methods) {
      const method = keyName(key);
      if (findMethod(cls.prototype as object, key) === undefined)
        report(invalid('unknown-method', { target: cls.name, method }));
      for (const token of tokens)
        if (!registered.includes(token))
          report(missing(token, cls.name, method));
    }
  }

  for (const entry of config.global)
    if (!registered.includes(entry.use)) report(missing(entry.use, null, null));
  for (const binding of config.bindings) {
    for (const token of binding.class)
      if (!registered.includes(token)) report(missing(token, null, null));
    for (const [key, tokens] of binding.methods)
      for (const token of tokens)
        if (!registered.includes(token))
          report(missing(token, null, keyName(key)));
  }

  if (ownModuleId !== undefined)
    checkSupport(
      view,
      report,
      config,
      new Map(view.providers.map((p) => [p.id, p])),
      ownModuleId,
    );
}
