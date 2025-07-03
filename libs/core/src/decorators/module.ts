import type { ModuleConfig } from '../types';
import { METADATA_KEYS } from '../constants';
import { setMetadata } from '../helpers';

/**
 * Decorator that marks a class as a DI module, allowing you to group providers and imports.
 *
 * Use this to define a module in NexusDI. Modules can import other modules, provide services/providers, and export tokens for use in other modules.
 *
 * #### Usage
 * Basic module:
 * ```typescript
 * @Module({
 *   providers: [LoggerService],
 *   imports: [OtherModule],
 * })
 * class AppModule {}
 * ```
 *
 * With exports:
 * ```typescript
 * @Module({
 *   providers: [LoggerService],
 *   exports: [LoggerService],
 * })
 * class LoggerModule {}
 * ```
 *
 * #### Notes
 * - Modules can be imported by other modules for reusability.
 *
 * @param config The module configuration (providers, imports, exports, etc.)
 *
 * @see https://nexus.js.org/docs/modules/module-basics
 * @see https://nexus.js.org/docs/modules/module-patterns
 * @see https://nexus.js.org/docs/container/decorators
 * @publicApi
 */
export function Module(config: ModuleConfig): ClassDecorator {
  return (target) => {
    setMetadata(target, METADATA_KEYS.MODULE_METADATA, config);
  };
}
