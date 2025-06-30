// Core types and token
export { Token } from './token.js';
export type { TokenType } from './token.js';

// Type definitions
export type {
  Constructor,
  Provider as ProviderConfig,
  ValueProvider,
  ClassProvider,
  FactoryProvider,
  ModuleProvider,
  ModuleConfig,
  Lifecycle,
  ReactiveStream,
  Registration,
} from './types.js';

// Decorators
export { Service, Inject, InjectParam, Module } from './decorators.js';

// Container
export { Container } from './container.js';

// Base classes
export { Provider, BaseModule } from './base.js';

// Reactive streams
export { Stream, createStream, map, filter, merge } from './reactive.js';

// Metadata utilities (for advanced usage)
export {
  setServiceMetadata,
  getServiceMetadata,
  setInjectMetadata,
  getInjectMetadata,
  setModuleMetadata,
  getModuleMetadata,
  generateTokenFromClass,
  isConstructor,
  isToken,
  isProvider,
} from './metadata.js';
