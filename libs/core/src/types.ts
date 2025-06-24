/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Token } from './token';

/**
 * [INTERNAL] Represents a token for DI registration. Used internally to support class, string, or Token-based tokens.
 *
 * Users should use the exported `Token` class for custom tokens instead of Symbol or string.
 *
 * @see https://nexus.js.org/docs/modules/tokens
 */
export type TokenType<T = any> = new (...args: any[]) => T | string | Token<T>;

/**
 * Provider definition for DI. Use this to register classes, values, or factories.
 *
 * @example
 * import { Provider } from '@nexusdi/core';
 * const provider: Provider = { provide: 'MyService', useClass: MyService };
 * @see https://nexus.js.org/docs/modules/providers-and-services
 */
export type Provider<T = any> = {
  useClass?: new (...args: any[]) => T;
  useValue?: T;
  useFactory?: (...args: any[]) => T;
  deps?: TokenType[];
};

/**
 * Provider definition for modules. Used in the 'imports' property of @Module.
 *
 * @example
 * import { ModuleProvider } from '@nexusdi/core';
 * const imports: ModuleProvider[] = [OtherModule];
 * @see https://nexus.js.org/docs/modules/module-basics
 */
export type ModuleProvider<T = any> =
  | (Provider<T> & { token: TokenType<T> }) // Full provider object
  | (new (...args: any[]) => T); // Service class (uses @Service decorator token)

/**
 * Configuration for a service. Used with @Service and @Provider decorators.
 *
 * @example
 * import { ServiceConfig } from '@nexusdi/core';
 * const config: ServiceConfig = { scope: 'singleton' };
 * @see https://nexus.js.org/docs/modules/providers-and-services
 */
export type ServiceConfig<T = any> = {
  token?: TokenType<T>;
  singleton?: boolean;
};

/**
 * Configuration for a module. Used with @Module decorator.
 *
 * @example
 * import { ModuleConfig } from '@nexusdi/core';
 * const config: ModuleConfig = { providers: [MyService] };
 * @see https://nexus.js.org/docs/modules/module-basics
 */
export type ModuleConfig = {
  imports?: (new (...args: any[]) => any)[];
  services?: (new (...args: any[]) => any)[];
  providers?: ModuleProvider[];
  exports?: TokenType[];
};

/**
 * Interface for the DI container. Use Nexus class for actual usage.
 *
 * @see https://nexus.js.org/docs/container/nexus-class
 */
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

/**
 * Metadata keys used internally for decorators and reflection.
 *
 * @see https://nexus.js.org/docs/modules/module-basics
 */
export const METADATA_KEYS = {
  DESIGN_PARAMTYPES: 'design:paramtypes',
  DESIGN_TYPE: 'design:type',
  INJECT_METADATA: 'nexusdi:inject',
  SERVICE_METADATA: 'nexusdi:service',
  MODULE_METADATA: 'nexusdi:module',
} as const;

/**
 * Metadata for injection, used internally by @Inject and @Optional.
 *
 * @see https://nexus.js.org/docs/modules/providers-and-services
 */
export type InjectionMetadata = {
  token: TokenType;
  index: number;
  propertyKey?: string | symbol;
  optional?: boolean;
};

// Re-export Token class for convenience
export { Token } from './token';
