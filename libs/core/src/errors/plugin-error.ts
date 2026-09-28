import { errorBase } from './nexus-error.js';

/** Why a plugin failed validation. */
export type PluginInvalidReason =
  | 'not-an-array'
  | 'not-an-object'
  | 'no-name'
  | 'duplicate-name'
  | 'bad-hook'
  | 'bad-compile'
  | 'bad-modules'
  | 'bad-on-init';

/** Every field of every code; a field the code does not use is null or empty. */
interface PluginFields {
  readonly code:
    | 'NEXUS_PLUGIN_INVALID'
    | 'NEXUS_PLUGIN_VERSION'
    | 'NEXUS_PLUGIN_CONFLICT'
    | 'NEXUS_PLUGIN_FAILED';
  readonly plugin: string | null;
  readonly reason: PluginInvalidReason | null;
  readonly detail: readonly string[];
  readonly apiVersion: string | null;
  readonly supported: readonly number[];
  readonly plugins: readonly string[];
  readonly target: string | null;
  readonly hook: string | null;
  readonly disposalErrors: readonly unknown[];
}

/**
 * A plugin is malformed, targets another plugin API, conflicts with another,
 * or its hook failed. The hook's error is Error.cause.
 */
export class PluginError extends errorBase<PluginFields['code'], PluginFields>(
  (fields) => fields.code,
  'PluginError',
) {}
