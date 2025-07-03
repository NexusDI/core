import { Token } from '../token';
import { Constructor } from './general';

export interface BaseProvider<T> {
  token: Token<T> | Constructor<T>;
}

// Helper type to extract the inner type from Token<T>
type ExtractTokenTypes<T extends readonly Token<unknown>[]> = {
  [K in keyof T]: T[K] extends Token<infer U> ? U : never;
};

export interface FactoryProvider<T, Deps extends readonly Token<unknown>[] = []>
  extends BaseProvider<T> {
  useFactory: (...args: ExtractTokenTypes<Deps>) => Promise<T>;
  deps: Deps;
}

export interface ValueProvider<T> extends BaseProvider<T> {
  useValue: Promise<T>;
}

export interface ClassProvider<T> extends BaseProvider<T> {
  useClass: Constructor<T>;
}

export type ProviderConfigObject<T> =
  | FactoryProvider<T>
  | ValueProvider<T>
  | ClassProvider<T>
  | Constructor<T>;

export interface ModuleConfig {
  token: Token<unknown>;
  providers: ProviderConfigObject<unknown>[];
}
