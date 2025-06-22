// Core exports
export { Nexus } from './container';
export type { IContainer } from './types';

// Token exports
export { Token } from './token';
export type { TokenType } from './types';

// Decorators
export { Module, Service, Provider, Inject, Injectable, Optional } from './decorators';

// Types
export type {
  Provider as ProviderType,
  ServiceConfig,
  ModuleConfig,
  InjectionMetadata,
} from './types';

// Constants
export { METADATA_KEYS } from './types';

// Default export for convenience
import { Nexus } from './container';
export default Nexus; 