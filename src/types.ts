import 'reflect-metadata';
import type { Token } from './token';

// Extend Reflect with metadata methods
declare global {
  namespace Reflect {
    // biome-ignore lint/suspicious/noExplicitAny: Reflect metadata methods require any for flexibility
    function defineMetadata(metadataKey: any, metadataValue: any, target: Object): void;
    // biome-ignore lint/suspicious/noExplicitAny: Reflect metadata methods require any for flexibility
    function getMetadata(metadataKey: any, target: Object): any;
    // biome-ignore lint/suspicious/noExplicitAny: Reflect metadata methods require any for flexibility
    function hasMetadata(metadataKey: any, target: Object): boolean;
  }
}

// Token types for dependency injection - now using the Token class
// biome-ignore lint/suspicious/noExplicitAny: Generic DI system requires flexible type constraints
export type TokenType<T = any> = Token<T> | string | symbol | (new (...args: any[]) => T);

// Provider types
// biome-ignore lint/suspicious/noExplicitAny: Generic DI system requires flexible type constraints
export type Provider<T = any> = {
  // biome-ignore lint/suspicious/noExplicitAny: Constructor functions need flexible parameter types
  useClass?: new (...args: any[]) => T;
  useValue?: T;
  // biome-ignore lint/suspicious/noExplicitAny: Factory functions need flexible parameter types
  useFactory?: (...args: any[]) => T;
  deps?: TokenType[];
};

// Module provider type (includes token for module configuration)
// biome-ignore lint/suspicious/noExplicitAny: Generic DI system requires flexible type constraints
export type ModuleProvider<T = any> = Provider<T> & {
  token: TokenType<T>;
};

// Service configuration
// biome-ignore lint/suspicious/noExplicitAny: Generic DI system requires flexible type constraints
export type ServiceConfig<T = any> = {
  token?: TokenType<T>;
  singleton?: boolean;
};

// Module configuration
export type ModuleConfig = {
  // biome-ignore lint/suspicious/noExplicitAny: Module imports need flexible constructor types
  imports?: (new (...args: any[]) => any)[];
  // biome-ignore lint/suspicious/noExplicitAny: Module services need flexible constructor types
  services?: (new (...args: any[]) => any)[];
  providers?: ModuleProvider[];
  exports?: TokenType[];
};

// Container interface
export interface IContainer {
  get<T>(token: TokenType<T>): T;
  has(token: TokenType): boolean;
  // biome-ignore lint/suspicious/noExplicitAny: Container resolve method needs flexible constructor types
  resolve<T>(target: new (...args: any[]) => T): T;
  set<T>(token: TokenType<T>, provider: Provider<T>): void;
  // biome-ignore lint/suspicious/noExplicitAny: Module registration needs flexible constructor types
  registerModule(moduleClass: new (...args: any[]) => any): void;
}

// Metadata keys
export const METADATA_KEYS = {
  DESIGN_PARAMTYPES: 'design:paramtypes',
  DESIGN_TYPE: 'design:type',
  INJECT_METADATA: 'nexusdi:inject',
  SERVICE_METADATA: 'nexusdi:service',
  MODULE_METADATA: 'nexusdi:module',
} as const;

// Injection metadata
export type InjectionMetadata = {
  token: TokenType;
  index: number;
  propertyKey?: string | symbol;
};

// Re-export Token class for convenience
export { Token } from './token'; 