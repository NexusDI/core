// Core exports
export { Nexus } from './container';
export type { IContainer } from './types';

// Token exports
export { Token } from './token';
export type { TokenType } from './types';

// Decorators
export { Module, Service, Provider, Inject, Injectable, Optional } from './decorators';

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
export { METADATA_KEYS } from './types';

// Default export for convenience
import { Nexus } from './container';
export default Nexus; 