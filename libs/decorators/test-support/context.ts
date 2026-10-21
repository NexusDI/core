import type { BlueprintView, NexusPlugin, PluginContext } from '@nexusdi/core';

/**
 * A plugin whose setup keeps the context, for tests that read module and
 * provider names from the live container. `view()` reads the current
 * blueprint, so it follows every load().
 */
export function viewRecorder(): {
  readonly plugin: NexusPlugin;
  view(): BlueprintView;
} {
  let context: PluginContext | undefined;
  return {
    plugin: {
      name: 'test:view',
      apiVersion: 1,
      setup: (c) => {
        context = c;
      },
    },
    view: () => {
      if (context === undefined) throw new Error('setup did not run');
      return context.blueprint();
    },
  };
}

/**
 * A class with the given `name` and the context a compiler passes to its
 * class decorator, for tests that stand in for a minified class.
 */
export function minifiedClass(name: string): {
  readonly cls: abstract new () => unknown;
  readonly context: ClassDecoratorContext;
} {
  const cls = class {};
  Object.defineProperty(cls, 'name', { value: name });
  const context = {
    kind: 'class',
    name,
    metadata: {},
    addInitializer: () => {},
  } as unknown as ClassDecoratorContext;
  return { cls, context };
}
