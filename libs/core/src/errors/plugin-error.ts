import { describeThrown } from './describe-thrown.js';
import { NexusError } from './nexus-error.js';

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

type PluginErrorFields =
  | {
      code: 'NEXUS_PLUGIN_INVALID';
      plugin: string;
      reason: PluginInvalidReason;
      detail?: readonly string[];
    }
  | {
      code: 'NEXUS_PLUGIN_VERSION';
      plugin: string;
      apiVersion: string;
      supported: readonly number[];
    }
  | {
      code: 'NEXUS_PLUGIN_CONFLICT';
      plugins: readonly string[];
      target: string;
    }
  | {
      code: 'NEXUS_PLUGIN_FAILED';
      plugin: string;
      hook: string;
      cause: unknown;
      disposalErrors?: readonly unknown[];
    };

const INVALID: Record<PluginInvalidReason, (detail: string) => string> = {
  'not-an-array': (d) => `is ${d}; plugins takes an array of plugin objects.`,
  'not-an-object': (d) =>
    `is ${d}; a plugin is an object with a name and an apiVersion.`,
  'no-name': () => 'has no name; set name to a non-empty string.',
  'duplicate-name': () =>
    'has the name of an earlier plugin; each plugin needs its own name.',
  'bad-hook': (d) => `has a ${d} hook that is not a function.`,
  'bad-compile': () =>
    'has a compile that is not an object of module, provider and check functions.',
  'bad-modules': () => 'has modules that are not an array of modules.',
  'bad-on-init': (d) => `sets onInit to ${d}; the one accepted value is false.`,
};

function messageOf(fields: PluginErrorFields): string {
  switch (fields.code) {
    case 'NEXUS_PLUGIN_INVALID':
      return `${fields.plugin} ${INVALID[fields.reason]((fields.detail ?? []).join(', '))}`;
    case 'NEXUS_PLUGIN_VERSION':
      return `${fields.plugin} was written for plugin API ${fields.apiVersion}; this @nexusdi/core supports ${fields.supported.join(', ')}.\n  Fix: install the plugin version built for this @nexusdi/core.`;
    case 'NEXUS_PLUGIN_CONFLICT':
      return `${fields.plugins.join(' and ')} both rewrite ${fields.target}; one plugin may rewrite a module or a provider.`;
    case 'NEXUS_PLUGIN_FAILED':
      return `the ${fields.hook} hook of ${fields.plugin} failed: ${describeThrown(fields.cause)}`;
  }
}

/** A plugin is malformed, targets another plugin API, conflicts with another, or its hook failed. */
export class PluginError extends NexusError {
  declare readonly code:
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

  constructor(fields: PluginErrorFields) {
    super(fields.code, messageOf(fields), {
      cause: fields.code === 'NEXUS_PLUGIN_FAILED' ? fields.cause : undefined,
    });
    this.name = 'PluginError';
    this.plugin = 'plugin' in fields ? fields.plugin : null;
    this.reason = fields.code === 'NEXUS_PLUGIN_INVALID' ? fields.reason : null;
    this.detail =
      fields.code === 'NEXUS_PLUGIN_INVALID' ? (fields.detail ?? []) : [];
    this.apiVersion =
      fields.code === 'NEXUS_PLUGIN_VERSION' ? fields.apiVersion : null;
    this.supported =
      fields.code === 'NEXUS_PLUGIN_VERSION' ? fields.supported : [];
    this.plugins =
      fields.code === 'NEXUS_PLUGIN_CONFLICT' ? fields.plugins : [];
    this.target =
      fields.code === 'NEXUS_PLUGIN_CONFLICT' ? fields.target : null;
    this.hook = fields.code === 'NEXUS_PLUGIN_FAILED' ? fields.hook : null;
    this.disposalErrors =
      fields.code === 'NEXUS_PLUGIN_FAILED'
        ? (fields.disposalErrors ?? [])
        : [];
  }
}
