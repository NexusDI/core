// NOTE: This file assumes tsconfig.json includes "lib": ["es2022", "esnext.decorators", ...]
// Symbol.metadata constant
import { SYMBOL_METADATA, METADATA_KEYS } from './constants';

// Polyfill for Symbol.metadata
/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof (Symbol as any).metadata === 'undefined') {
  (Symbol as any).metadata = Symbol(SYMBOL_METADATA);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Core exports
export { Nexus } from './container';
export type { IContainer } from './types';

// Token exports
export { Token } from './token';
export type { TokenType } from './types';

// Decorators
export { Module, Service, Provider, Inject, Optional } from './decorators';

export {
  ContainerException,
  InvalidToken,
  NoProvider,
  InvalidProvider,
  InvalidModule,
} from './exceptions';

// Dynamic Module
export { DynamicModule } from './module';

// Types
export type {
  Provider as ProviderType,
  ModuleProvider,
  ProviderConfig,
  ModuleConfig,
  InjectionMetadata,
} from './types';

// Constants
export { SYMBOL_METADATA, METADATA_KEYS };

// Default export for convenience
import { Nexus } from './container';
export default Nexus;

export * from './guards';

export { setMetadata, getMetadata } from './helpers';
