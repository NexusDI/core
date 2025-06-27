import type { ModuleConfig } from '../types';
import { METADATA_KEYS } from '../constants';
import { setMetadata } from '../helpers';

/**
 * Decorator that marks a class as a DI module, allowing you to group providers and imports.
 *
 * Use this to define a module in NexusDI. Modules can import other modules, provide services/providers, and export tokens.
 *
 * #### Usage
 * ```typescript
 * import { Module } from '@nexusdi/core';
 *
 * @Module({
 *   providers: [LoggerService],
 *   imports: [OtherModule],
 * })
 * class AppModule {}
 * ```
 *
 * @param config The module configuration (providers, imports, exports, etc.)
 *
 * @see https://nexus.js.org/docs/modules/module-basics
 * @see https://nexus.js.org/docs/modules/module-patterns
 * @publicApi
 */
export function Module(config: ModuleConfig): ClassDecorator {
  return (target) => {
    setMetadata(target, METADATA_KEYS.MODULE_METADATA, config);
  };
}
