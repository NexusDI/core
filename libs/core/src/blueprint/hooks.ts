import type { ModuleDefinition } from '../definitions/define-module.js';
import type { NexusError } from '../errors/index.js';
import type { BlueprintView, CompileContext, ProviderView } from './views.js';

/** A plugin's hook, bound to the plugin, with the plugin's name for errors. */
export interface Hook<F> {
  readonly plugin: string;
  readonly call: F;
}

export type ModuleHook = (
  module: ModuleDefinition,
  context: CompileContext,
) => unknown;
export type ProviderHook = (
  provider: ProviderView,
  context: CompileContext,
) => unknown;
export type CheckHook = (
  view: BlueprintView,
  report: (error: NexusError) => void,
) => void;

export interface CompileHooks {
  readonly module: readonly Hook<ModuleHook>[];
  readonly provider: readonly Hook<ProviderHook>[];
  readonly check: readonly Hook<CheckHook>[];
}

export const NO_COMPILE_HOOKS: CompileHooks = Object.freeze({
  module: Object.freeze([]),
  provider: Object.freeze([]),
  check: Object.freeze([]),
});
