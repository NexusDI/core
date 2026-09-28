import type {
  ModuleDefinition,
  ProviderEntry,
} from '../definitions/define-module.js';
import type { AnyToken } from '../definitions/guards.js';
import type { Class, Lifetime } from '../definitions/types.js';

/** What a compile hook, a check hook or an error formatter reads. Frozen. */
export interface BlueprintView {
  readonly phase: 'create' | 'load' | 'check';
  /** False when a compile pass reported an error; the view holds what the passes finished. */
  readonly complete: boolean;
  /** The root module's id. Root get(), has(), resolve(), validate() and every scope look tokens up in this module. */
  readonly root: string;
  readonly modules: readonly ModuleView[];
  readonly providers: readonly ProviderView[];
  readonly edges: readonly EdgeView[];
  /** Provider ids of `token` visible in the module, in lookup order. The token is keyed through the tokenKey hooks, as get() keys it. */
  visible(moduleId: string, token: AnyToken): readonly string[];
}

export interface ModuleView {
  readonly id: string;
  readonly name: string;
  readonly global: boolean;
  readonly imports: readonly string[];
  /** Provider ids and module ids. */
  readonly exports: readonly string[];
  readonly definition: ModuleDefinition;
  /** The definition a compile.module hook replaced, or null. */
  readonly replaced: ModuleDefinition | null;
}

export interface ProviderView {
  readonly id: string;
  readonly token: AnyToken;
  /** The display name. */
  readonly name: string;
  /** The owning module's id. */
  readonly module: string;
  readonly kind: 'class' | 'value' | 'factory' | 'alias';
  readonly lifetime: Lifetime | null;
  readonly eager: boolean;
  /** The class a class provider constructs, or null. */
  readonly implementation: Class | null;
  /** The plugin whose compile.provider hook rewrote this provider, or null. */
  readonly rewrittenBy: string | null;
}

export interface EdgeView {
  readonly from: string;
  readonly to: string;
  readonly kind: 'required' | 'optional' | 'lazy' | 'all' | 'alias';
}

export interface CompileContext {
  readonly phase: 'create' | 'load' | 'check';
  /** The definition a forRoot or forRootAsync instance was made from. */
  configuredFrom(module: ModuleDefinition): ModuleDefinition | undefined;
}

export type ProviderRewrite =
  | { readonly with: ProviderEntry; readonly pin?: true }
  | { readonly remove: true };
