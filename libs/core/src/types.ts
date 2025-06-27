/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Token } from './token';

/**
 * [INTERNAL] Represents a token for DI registration. Used internally to support class, string, or Token-based tokens.
 *
 * Users should use the exported `Token` class for custom tokens instead of Symbol or string.
 *
 * @see https://nexus.js.org/docs/modules/tokens
 */
export type TokenType<T = any> = new (...args: any[]) => T | symbol | Token<T>;
export type InjectableToken<T = any> =
  | Token<T>
  | symbol
  | (new (...args: any[]) => T);

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
  deps?: InjectableToken[];
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
  | (Provider<T> & { token: InjectableToken<T> })
  | (new (...args: any[]) => T);

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
  get<T>(token: Token<T>): T;
  get<T>(token: symbol): T;
  get<T>(token: new (...args: any[]) => T): T;

  has(token: Token<any>): boolean;
  has(token: symbol): boolean;
  has(token: new (...args: any[]) => any): boolean;

  resolve<T>(token: Token<T>): T;
  resolve<T>(token: symbol): T;
  resolve<T>(token: new (...args: any[]) => T): T;

  set<T>(token: Token<T>, provider: Provider<T>): void;
  set<T>(token: Token<T>, serviceClass: new (...args: any[]) => T): void;
  set<T>(token: symbol, provider: Provider<T>): void;
  set<T>(token: symbol, serviceClass: new (...args: any[]) => T): void;
  set<T>(token: new (...args: any[]) => T, provider: Provider<T>): void;
  set<T>(
    token: new (...args: any[]) => T,
    serviceClass: new (...args: any[]) => T
  ): void;
  set(moduleClass: new (...args: any[]) => any): void;
  set(moduleConfig: {
    providers?: ModuleProvider[];
    imports?: (new (...args: any[]) => any)[];
    services?: (new (...args: any[]) => any)[];
    exports?: TokenType[];
  }): void;
  set(tokenOrModuleOrConfig: any, providerOrNothing?: any): void;
}

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
