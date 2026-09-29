import { describe, expect, it } from 'vitest';

import { Nexus, Token, all, defineModule, provide } from '@nexusdi/core';

import { ContractVersionError, defineContract, federation } from './index.js';

interface IAuth {
  user(): string;
}

/** What the shell and a remote each bundle: one contracts package, two copies. */
const shellBank = defineContract({ key: 'bank', version: '2.3.0' });
const remoteBank = defineContract({ key: 'bank', version: '2.4.0' });
const olderRemote = defineContract({ key: 'bank', version: '2.1.0' });

function remoteUsing(auth: ReturnType<typeof shellBank.token<IAuth>>) {
  class Statement {
    static deps = [auth] as const;
    constructor(readonly auth: IAuth) {}
  }
  return {
    Statement,
    module: defineModule({
      name: 'Statements',
      providers: [Statement],
      exports: [Statement],
    }),
  };
}

const Shell = defineModule({
  name: 'Shell',
  providers: [
    provide(shellBank.token<IAuth>('Auth'), {
      useValue: { user: () => 'ada' },
    }),
  ],
  exports: [shellBank.token<IAuth>('Auth')],
  global: true,
});

describe('federation', () => {
  it('binds a remote copy of a contract token to the shell provider', async () => {
    const ship = await Nexus.create(Shell, { plugins: [federation()] });
    const remote = remoteUsing(olderRemote.token<IAuth>('Auth'));
    await ship.load(remote.module);
    expect(ship.get(remote.Statement).auth.user()).toBe('ada');
  });

  it('rejects a remote that needs a newer minor than the shell provides', async () => {
    const ship = await Nexus.create(Shell, { plugins: [federation()] });
    const remote = remoteUsing(remoteBank.token<IAuth>('Auth'));
    await expect(ship.load(remote.module)).rejects.toMatchObject({
      errors: [
        {
          code: 'NEXUS_CONTRACT_VERSION',
          contract: 'bank/Auth',
          required: '2.4.0',
          provided: '2.3.0',
        },
      ],
    });
  });

  it('rejects a remote built against another major', async () => {
    const ship = await Nexus.create(Shell, { plugins: [federation()] });
    const nextMajor = defineContract({ key: 'bank', version: '3.0.0' });
    const remote = remoteUsing(nextMajor.token<IAuth>('Auth'));
    await expect(ship.load(remote.module)).rejects.toMatchObject({
      errors: [{ code: 'NEXUS_CONTRACT_VERSION', required: '3.0.0' }],
    });
  });

  it('collects the providers of every copy of a contract multi token', async () => {
    const Hooks = defineModule({
      name: 'Hooks',
      providers: [provide(shellBank.multi<string>('Hooks'), { useValue: 'a' })],
      global: true,
      exports: [shellBank.multi<string>('Hooks')],
    });
    const ship = await Nexus.create(Hooks, { plugins: [federation()] });
    const hooks = olderRemote.multi<string>('Hooks');
    class Audit {
      static deps = [all(hooks)] as const;
      constructor(readonly hooks: readonly string[]) {}
    }
    await ship.load(
      defineModule({
        name: 'Remote',
        providers: [provide(hooks, { useValue: 'b' }), Audit],
        exports: [Audit],
      }),
    );
    expect(ship.get(Audit).hooks).toEqual(['a', 'b']);
  });

  it('leaves a token without a contract to core', async () => {
    const NAME = new Token<string>('bank/Auth');
    const ship = await Nexus.create(
      defineModule({
        name: 'Plain',
        providers: [provide(NAME, { useValue: 'plain' })],
        exports: [NAME],
      }),
      { plugins: [federation()] },
    );
    expect(ship.has(shellBank.token('Auth'))).toBe(false);
    expect(ship.get(NAME)).toBe('plain');
  });
});

describe('ContractVersionError', () => {
  it('names the contract, the version needed and the version provided', async () => {
    const ship = await Nexus.create(Shell, { plugins: [federation()] });
    const remote = remoteUsing(remoteBank.token<IAuth>('Auth'));
    const caught = await ship.load(remote.module).catch((error) => error);
    const [error] = caught.errors;
    expect(error).toBeInstanceOf(ContractVersionError);
    expect(error.message).toBe(
      "[NEXUS_CONTRACT_VERSION] bank/Auth is needed at 2.4.0, and the shell provides 2.3.0.\n  Fix: upgrade the shell's contracts package, or build the remote against 2.3.0.",
    );
  });
});

describe('defineContract', () => {
  it('returns one token per name', () => {
    expect(shellBank.token('Auth')).toBe(shellBank.token('Auth'));
    expect(shellBank.token('Auth')).not.toBe(remoteBank.token('Auth'));
  });

  it('describes a token by the contract key and the name', () => {
    expect(shellBank.token('Auth').description).toBe('bank/Auth');
    expect(shellBank.multi('Hooks').description).toBe('bank/Hooks');
  });

  it('rejects a version without a major, a minor and a patch', () => {
    expect(() => defineContract({ key: 'bank', version: '2.3' })).toThrow(
      new TypeError(
        "defineContract({ key: 'bank' }) needs a version such as 2.3.0, and got '2.3'.",
      ),
    );
  });

  it('rejects a second kind of token for one name', () => {
    shellBank.token('Ledger');
    expect(() => shellBank.multi('Ledger')).toThrow(
      new TypeError(
        'bank/Ledger is a Token, so multi() cannot make another token of the same name.',
      ),
    );
    shellBank.multi('Audit');
    expect(() => shellBank.token('Audit')).toThrow(
      new TypeError(
        'bank/Audit is a MultiToken, so token() cannot make another token of the same name.',
      ),
    );
  });
});
