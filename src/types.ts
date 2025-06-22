// biome-ignore-all lint/complexity/noBannedTypes: We need to use Object for the Reflect metadata methods
import 'reflect-metadata';
import type { Token } from './token';

// Extend Reflect with metadata methods
declare global {
  namespace Reflect {
    
    function defineMetadata(metadataKey: any, metadataValue: any, target: Object): void;
    function getMetadata(metadataKey: any, target: Object): any;
    function hasMetadata(metadataKey: any, target: Object): boolean;
  }
}

// Token types for dependency injection - now using the Token class
export type TokenType<T = any> = Token<T> | string | symbol | (new (...args: any[]) => T);

// Provider types
export type Provider<T = any> = {
  useClass?: new (...args: any[]) => T;
  useValue?: T;
  useFactory?: (...args: any[]) => T;
  deps?: TokenType[];
};

// Module provider type (includes token for module configuration)
export type ModuleProvider<T = any> = 
  | (Provider<T> & { token: TokenType<T> })  // Full provider object
  | (new (...args: any[]) => T);             // Service class (uses @Service decorator token)

// Service configuration
export type ServiceConfig<T = any> = {
  token?: TokenType<T>;
  singleton?: boolean;
};

// Module configuration
export type ModuleConfig = {
  imports?: (new (...args: any[]) => any)[];
  services?: (new (...args: any[]) => any)[];
  providers?: ModuleProvider[];
  exports?: TokenType[];
};

// Container interface
export interface IContainer {
  get<T>(token: TokenType<T>): T;
  has(token: TokenType): boolean;
  resolve<T>(target: new (...args: any[]) => T): T;
  set<T>(token: TokenType<T>, provider: Provider<T>): void;
  set<T>(token: TokenType<T>, serviceClass: new (...args: any[]) => T): void;
  setModule(moduleClass: new (...args: any[]) => any): void;
  registerDynamicModule(moduleConfig: {
    services?: (new (...args: any[]) => any)[];
    providers?: ModuleProvider[];
    imports?: (new (...args: any[]) => any)[];
  }): void;
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