import { describe, expect, it } from 'vitest';

import { Nexus, defineModule, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

import { defineContract, federation } from './index.js';
import { federationText } from './text.js';

interface IAuth {
  user(): string;
}

/** The message a shell at `provided` and a remote at `required` get with federationText. */
function messageOf(required: string, provided: string): string | undefined {
  const AUTH = defineContract({ key: 'bank', version: provided }).token<IAuth>(
    'Auth',
  );
  class Statement {
    static deps = [
      defineContract({ key: 'bank', version: required }).token<IAuth>('Auth'),
    ] as const;
    constructor(readonly auth: IAuth) {}
  }
  const graph = defineModule({
    name: 'Root',
    imports: [
      defineModule({
        name: 'Shell',
        providers: [provide(AUTH, { useValue: { user: () => 'ada' } })],
        exports: [AUTH],
        global: true,
      }),
      defineModule({ name: 'Statements', providers: [Statement] }),
    ],
  });
  try {
    Nexus.check(graph, {
      plugins: [federation(), errors({ text: [federationText] })],
    });
  } catch (error) {
    return (error as { errors: Error[] }).errors[0]?.message;
  }
  return undefined;
}

describe('federationText', () => {
  it('names the contract, the version needed and the version provided', () => {
    expect(messageOf('2.4.0', '2.3.0')).toBe(
      '[NEXUS_CONTRACT_VERSION] bank/Auth is needed at 2.4.0, and the provider has 2.3.0.\n  Fix: build the provider against 2.4.0 or a newer 2.x, or build the dependent against 2.3.0.',
    );
  });

  it('names a newer patch of the needed minor at major 0', () => {
    expect(messageOf('0.4.2', '0.3.0')).toBe(
      '[NEXUS_CONTRACT_VERSION] bank/Auth is needed at 0.4.2, and the provider has 0.3.0.\n  Fix: build the provider against 0.4.2 or a newer 0.4.x patch, or build the dependent against 0.3.0.',
    );
  });
});
