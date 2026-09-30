import type {
  InvalidProviderReason,
  InvalidTokenReason,
} from '../errors/index.js';

const NO_DEFINITION =
  'with no definition; add useClass, useValue, useFactory or useExisting';
const LIFETIMES = "use 'singleton', 'scoped' or 'transient'";
const NOT_A_TOKEN = 'A token is a class, a Token or a MultiToken.';

/**
 * Revision 1's sentence for a dep that is not one, after the entry that
 * holds it: `kind` is the id depOf returned, `values` its detail.
 */
function depSentence(
  kind: string | undefined,
  values: readonly string[],
): string {
  const [first, second] = values;
  if (kind === 'bad-modifier') {
    const takes =
      first === 'all'
        ? 'all() takes a MultiToken'
        : `${first}() takes a class or a Token`;
    return `is ${first}(${second}); ${takes}`;
  }
  if (kind === 'bare-multi-token')
    return `is the MultiToken ${first}; wrap it in all()`;
  return `is ${first}, not a token`;
}

/** Rebuilds depOf's sentences from `[where, kind, ...values]`. */
function dependencyReason(detail: readonly string[]): string {
  const [where, kind, ...values] = detail;
  return `${where} ${depSentence(kind, values)}`;
}

export const PROVIDER_REASONS: Record<
  InvalidProviderReason,
  (detail: readonly string[]) => string
> = {
  'static-deps-throws': ([d]) =>
    `has a static deps that throws when read: ${d}`,
  'static-deps-not-array': () => 'has a static deps that is not an array',
  'deps-in-both': () =>
    'declares deps in both @Injectable and static deps; keep one',
  'options-not-object': ([d]) => `has options that are ${d}, not an object`,
  'not-a-provider': ([d]) =>
    `is ${d}, not a provider; list a class, a provide() result or a { token } literal`,
  'class-throws': ([d]) => `is a class that throws when read: ${d}`,
  'bad-dep': (detail) => dependencyReason(detail),
  'deps-not-array': () => 'has deps that are not an array',
  'bad-injectable-lifetime': ([d]) =>
    `has the @Injectable lifetime ${d}; ${LIFETIMES}`,
  'is-a-module': ([d]) => `is the module ${d}; add it to imports`,
  'options-throw': ([d]) => `throws when its options are read: ${d}`,
  'provides-request': () =>
    'provides REQUEST, which createScope({ request }) supplies',
  'no-definition': ([d]) => `provides ${d} ${NO_DEFINITION}`,
  'several-definitions': ([d]) => `sets ${d}; use one of them`,
  'bad-lifetime': ([d]) => `has the lifetime ${d}; ${LIFETIMES}`,
  'use-class-not-a-class': () => 'has a useClass that is not a class',
  'value-with-lifetime': () => 'sets a lifetime on useValue; a value has none',
  'factory-not-a-function': () => 'has a useFactory that is not a function',
  'alias-with-lifetime': () =>
    'sets a lifetime on useExisting; an alias has none',
  'alias-to-multi-token': ([d]) =>
    `aliases the MultiToken ${d}; useExisting takes a class or a Token`,
  'bad-eager': ([d]) => `has eager set to ${d}; eager takes true or false`,
  'eager-not-deferrable': ([d]) =>
    `sets eager: false on a ${d}; only a singleton or scoped class or factory builds on first use`,
};

/** Revision 1's sentence for each InvalidTokenError reason, after `received`. */
export function tokenReason(
  reason: InvalidTokenReason | null,
  detail: readonly string[],
): string {
  switch (reason) {
    case 'bad-description':
      return 'is not a token description. A Token needs a non-empty description string.';
    case 'not-a-deps-value':
      return 'is not a deps map or a deps tuple.';
    case 'bad-modifier':
    case 'bare-multi-token':
      return `${depSentence(reason, detail)}.`;
    case 'alias-target':
      return `is not a token, so useExisting cannot alias it. ${NOT_A_TOKEN}`;
    case null:
      return `is not a token. ${NOT_A_TOKEN}`;
  }
}
