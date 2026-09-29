import type { BlueprintView, NexusError } from '@nexusdi/core';

import { invalid, lifetime, missing } from './interceptor-error.js';
import { declarationsOf, type AnyClass } from './metadata.js';
import { keyName } from './names.js';
import type { NormalOptions } from './options.js';
import { findMethod } from './proxy.js';

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
  const registered = new Set<unknown>(
    config.registered.map((entry) => entry.token),
  );
  const checked = new Set<AnyClass>();

  for (const provider of view.providers) {
    if (provider.module === ownModuleId) {
      const isInterceptor =
        registered.has(provider.token) || registered.has(provider.written);
      if (
        isInterceptor &&
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
        invalid(
          problem.reason,
          { target: problem.target },
          problem.reason === 'two-forms'
            ? `${problem.target} declares interceptors with both static interceptors and @UseInterceptors.\n  Fix: keep one form.`
            : `${problem.target}'s static interceptors is not { class?: tokens, methods?: { name: tokens } }.`,
        ),
      );
    for (const token of declarations.classTokens)
      if (!registered.has(token)) report(missing(token, cls.name, null));
    for (const [key, tokens] of declarations.methods) {
      const method = keyName(key);
      if (findMethod(cls.prototype as object, key) === undefined)
        report(
          invalid(
            'unknown-method',
            { target: cls.name, method },
            `${cls.name} declares interceptors for ${method}, which is not a method of the class.`,
          ),
        );
      for (const token of tokens)
        if (!registered.has(token)) report(missing(token, cls.name, method));
    }
  }

  for (const entry of config.global)
    if (!registered.has(entry.use)) report(missing(entry.use, null, null));
  for (const binding of config.bindings) {
    for (const token of binding.class)
      if (!registered.has(token)) report(missing(token, null, null));
    for (const [key, tokens] of binding.methods)
      for (const token of tokens)
        if (!registered.has(token)) report(missing(token, null, keyName(key)));
  }
}
