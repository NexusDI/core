// NOTE: This file assumes tsconfig.json includes "lib": ["es2022", "esnext.decorators", ...]
// Symbol.metadata constant
import { SYMBOL_METADATA, METADATA_KEYS } from './constants';

// Polyfill for Symbol.metadata
/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof (Symbol as any).metadata === 'undefined') {
  (Symbol as any).metadata = Symbol(SYMBOL_METADATA);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Core container
export { Nexus } from './container';

// Type system
export type {
  IContainer,
  TokenType,
  Constructor,
  Provider,
  ClassProvider,
  ValueProvider,
  FactoryProvider,
  ProviderConfigObject,
  ModuleProvider,
  ModuleConfig,
  ProviderConfig,
  RegistrationOptions,
  Disposable,
  AsyncDisposable,
  InjectionMetadata,
} from './types';

// Token system
export { Token } from './token';

// Decorators
export { Service } from './decorators/provider';
export { Module } from './decorators/module';
export { Inject } from './decorators/inject';
export { Optional } from './decorators/optional';

// Dynamic modules
export type { DynamicModule } from './dynamic-module';
export { createModuleConfig } from './dynamic-module';

// Guards for advanced usage
export {
  isTokenType,
  isConstructor,
  isProvider,
  isModuleConfig,
  isPromise,
} from './guards';

// Metadata utilities
export { getMetadata, setMetadata } from './helpers';

// Exception types
export {
  ContainerException,
  InvalidToken,
  NoProvider,
  InvalidProvider,
  InvalidModule,
} from './exceptions';

// Constants
export { SYMBOL_METADATA, METADATA_KEYS };

// Default export for convenience
import { Nexus } from './container';
export default Nexus;
