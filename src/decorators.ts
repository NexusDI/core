import 'reflect-metadata';
import type { TokenType, Provider as ProviderType, ServiceConfig, ModuleConfig } from './types';
import { METADATA_KEYS, type InjectionMetadata } from './types';
import { Token } from './token';

/**
 * Module decorator - defines a module with its imports, services, providers, and exports
 */
export function Module(config: ModuleConfig) {
  return function (target: new (...args: any[]) => any) {
    Reflect.defineMetadata(METADATA_KEYS.MODULE_METADATA, config, target);
  };
}

/**
 * Service decorator - marks a class as a service that can be injected
 */
export function Service<T>(token?: TokenType<T>) {
  return function (target: new (...args: any[]) => T) {
    const config: ServiceConfig<T> = {
      token: token || target,
      singleton: true,
    };
    Reflect.defineMetadata(METADATA_KEYS.SERVICE_METADATA, config, target);
  };
}

/**
 * Provider decorator - marks a class as a provider with custom token
 */
export function Provider<T>(token: TokenType<T>) {
  return function (target: new (...args: any[]) => T) {
    const config: ServiceConfig<T> = {
      token,
      singleton: true,
    };
    Reflect.defineMetadata(METADATA_KEYS.SERVICE_METADATA, config, target);
  };
}

/**
 * Inject decorator - marks a parameter or property for dependency injection
 */
export function Inject<T>(token: TokenType<T>) {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    const existingMetadata: InjectionMetadata[] = 
      Reflect.getMetadata(METADATA_KEYS.INJECT_METADATA, target) || [];
    
    const metadata: InjectionMetadata = {
      token,
      index: parameterIndex,
      ...(propertyKey !== undefined && { propertyKey }),
    };
    
    existingMetadata.push(metadata);
    Reflect.defineMetadata(METADATA_KEYS.INJECT_METADATA, existingMetadata, target);
  };
}

/**
 * Injectable decorator - marks a class as injectable (alternative to @Service)
 */
export function Injectable<T>() {
  return function (target: new (...args: any[]) => T) {
    // This decorator is mainly for compatibility and documentation
    // The actual injection logic is handled by the container
  };
}

/**
 * Optional decorator - marks a dependency as optional
 */
export function Optional<T>(token: TokenType<T>) {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    const existingMetadata: InjectionMetadata[] = 
      Reflect.getMetadata(METADATA_KEYS.INJECT_METADATA, target) || [];
    
    const metadata: InjectionMetadata = {
      token,
      index: parameterIndex,
      ...(propertyKey !== undefined && { propertyKey }),
    };
    
    existingMetadata.push(metadata);
    Reflect.defineMetadata(METADATA_KEYS.INJECT_METADATA, existingMetadata, target);
  };
} 