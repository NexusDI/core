// NOTE: This file assumes tsconfig.json includes "lib": ["es2022", "esnext.decorators", ...]
// Symbol.metadata constant
import { SYMBOL_METADATA, METADATA_KEYS } from './constants';
// Polyfill for Symbol.metadata
if (typeof (Symbol as any).metadata === 'undefined') {
  (Symbol as any).metadata = Symbol(SYMBOL_METADATA);
}

// Core exports
export { Nexus } from './container';
export type { IContainer } from './types';

// Token exports
export { Token } from './token';
export type { TokenType } from './types';

// Decorators
export {
  Module,
  Service,
  Provider,
  Inject,
  Injectable,
  Optional,
} from './decorators';

// Dynamic Module
export { DynamicModule } from './module';

// Types
export type {
  Provider as ProviderType,
  ModuleProvider,
  ServiceConfig,
  ModuleConfig,
  InjectionMetadata,
} from './types';

// Constants
export { SYMBOL_METADATA, METADATA_KEYS };

// Default export for convenience
import { Nexus } from './container';
export default Nexus;

export * from './guards';
