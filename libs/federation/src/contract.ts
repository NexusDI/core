import { MultiToken, Token } from '@nexusdi/core';

/** Read across copies of this package, so the brand is a registered symbol. */
export const CONTRACT = Symbol.for('nexusdi.contract');

export interface ContractMark {
  readonly key: string;
  readonly name: string;
  readonly version: string;
}

export interface Contract {
  token<T>(name: string): Token<T>;
  multi<T>(name: string): MultiToken<T>;
}

/** major.minor.patch, with an optional prerelease or build suffix. */
const SEMVER = /^\d+\.\d+\.\d+(?:[-+].*)?$/;

/**
 * Tokens keyed by `<key>/<name>`, marked with the contract's semver. Two
 * copies of one contracts package make distinct Token objects that the
 * federation() plugin binds by key. One name makes one token, so a name
 * token() made cannot also name a MultiToken.
 */
export function defineContract(options: {
  readonly key: string;
  readonly version: string;
}): Contract {
  if (!SEMVER.test(options.version))
    throw new TypeError(
      `defineContract({ key: '${options.key}' }) needs a version such as 2.3.0, and got '${options.version}'.`,
    );
  const made = new Map<string, Token<unknown> | MultiToken<unknown>>();
  const make = <K extends Token<unknown> | MultiToken<unknown>>(
    name: string,
    kind: new (description: string) => K,
    call: 'token' | 'multi',
  ): K => {
    const known = made.get(name);
    if (known instanceof kind) return known;
    if (known !== undefined)
      throw new TypeError(
        `${known.description} is a ${call === 'multi' ? 'Token' : 'MultiToken'}, so ${call}() cannot make another token of the same name.`,
      );
    const token = new kind(`${options.key}/${name}`);
    Object.defineProperty(token, CONTRACT, {
      value: Object.freeze({
        key: options.key,
        name,
        version: options.version,
      }),
    });
    made.set(name, token);
    return token;
  };
  return {
    token: <T>(name: string) => make(name, Token<T>, 'token'),
    multi: <T>(name: string) => make(name, MultiToken<T>, 'multi'),
  };
}

export function markOf(token: unknown): ContractMark | undefined {
  return typeof token === 'object' && token !== null
    ? ((token as Record<symbol, unknown>)[CONTRACT] as ContractMark | undefined)
    : undefined;
}
