/** Why an entry in a module's providers is malformed. */
export type InvalidProviderReason =
  | 'static-deps-throws'
  | 'static-deps-not-array'
  | 'deps-in-both'
  | 'options-not-object'
  | 'not-a-provider'
  | 'class-throws'
  | 'bad-dep'
  | 'deps-not-array'
  | 'bad-injectable-lifetime'
  | 'is-a-module'
  | 'options-throw'
  | 'provides-request'
  | 'no-definition'
  | 'several-definitions'
  | 'bad-lifetime'
  | 'use-class-not-a-class'
  | 'value-with-lifetime'
  | 'factory-not-a-function'
  | 'alias-with-lifetime'
  | 'alias-to-multi-token';

/** Why a value is not a token. */
export type InvalidTokenReason =
  'not-a-deps-value' | 'bad-modifier' | 'bare-multi-token' | 'alias-target';
