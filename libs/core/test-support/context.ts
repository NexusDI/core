import type {
  BlueprintView,
  NexusPlugin,
  PluginContext,
} from '../src/index.js';

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
