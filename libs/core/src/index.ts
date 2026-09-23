// NOTE: This file assumes tsconfig.json includes "lib": ["es2022", "esnext.decorators", ...]
// Symbol.metadata constant
import { SYMBOL_METADATA, METADATA_KEYS } from './constants.js';

// Polyfill for Symbol.metadata
/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof (Symbol as any).metadata === 'undefined') {
  (Symbol as any).metadata = Symbol(SYMBOL_METADATA);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Core exports
export { Nexus } from './container.js';
export type { IContainer } from './types.js';

// Token exports
export { Token } from './token.js';
export type { TokenType } from './types.js';

// Decorators
export {
  Module,
  Service,
  Provider,
  Inject,
  Optional,
} from './decorators/index.js';

export {
  ContainerException,
  InvalidToken,
  NoProvider,
  InvalidProvider,
  InvalidModule,
} from './exceptions/index.js';

// Dynamic Module
export { DynamicModule } from './module.js';

// Types
export type {
  Provider as ProviderType,
  ModuleProvider,
  ProviderConfig,
  ModuleConfig,
  InjectionMetadata,
} from './types.js';

// Constants
export { SYMBOL_METADATA, METADATA_KEYS };

// Default export for convenience
import { Nexus } from './container.js';
export default Nexus;

export * from './guards.js';

export { setMetadata, getMetadata } from './helpers.js';
