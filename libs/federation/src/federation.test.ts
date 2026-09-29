import { describe, expect, it } from 'vitest';

import {
  Nexus,
  Token,
  all,
  defineModule,
  optional,
  provide,
} from '@nexusdi/core';
import type { ModuleDefinition, NexusPlugin } from '@nexusdi/core';

import {
  ContractVersionError,
  defineContract,
  federation,
  type Contract,
} from './index.js';

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

interface IAudit {
  record(): string;
}

/** A module that provides and exports `contract`'s Auth, global by default. */
function shellOf(contract: Contract, name = 'Shell', global = true) {
  const auth = contract.token<IAuth>('Auth');
  return defineModule({
    name,
    providers: [provide(auth, { useValue: { user: () => 'ada' } })],
    exports: [auth],
    global,
  });
}

const root = (...imports: ModuleDefinition[]) =>
  defineModule({ name: 'Root', imports });

/** The errors a rejected create, load or check carries, or [] when it passed. */
async function errorsOf(run: () => unknown): Promise<unknown[]> {
  try {
    await run();
  } catch (error) {
    return (error as { errors: unknown[] }).errors;
  }
  return [];
}

/** The errors of a shell at `provided` and a remote at `required`. */
const verdict = (required: string, provided: string) =>
  errorsOf(() =>
    Nexus.create(
      root(
        shellOf(defineContract({ key: 'bank', version: provided })),
        remoteUsing(
          defineContract({ key: 'bank', version: required }).token<IAuth>(
            'Auth',
          ),
        ).module,
      ),
      { plugins: [federation()] },
    ),
  );

const mismatch = (required: string, provided: string) => ({
  code: 'NEXUS_CONTRACT_VERSION',
  contract: 'bank/Auth',
  required,
  provided,
});

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

  it('rejects a newer minor at create in either import order', async () => {
    const remote = remoteUsing(remoteBank.token<IAuth>('Auth')).module;
    for (const graph of [root(Shell, remote), root(remote, Shell)]) {
      const errors = await errorsOf(() =>
        Nexus.create(graph, { plugins: [federation()] }),
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject(mismatch('2.4.0', '2.3.0'));
    }
  });

  it('rejects a module whose own provider needs a newer minor than a module it imports', async () => {
    const { Statement } = remoteUsing(remoteBank.token<IAuth>('Auth'));
    const errors = await errorsOf(() =>
      Nexus.create(
        defineModule({
          name: 'Remote',
          imports: [Shell],
          providers: [Statement],
        }),
        { plugins: [federation()] },
      ),
    );
    expect(errors).toEqual([
      expect.objectContaining(mismatch('2.4.0', '2.3.0')),
    ]);
  });

  it('accepts a provider at a newer patch of the minor the dependent needs, in either order', async () => {
    const patched = shellOf(defineContract({ key: 'bank', version: '2.4.1' }));
    const remote = remoteUsing(shellBank.token<IAuth>('Auth')).module;
    for (const graph of [root(patched, remote), root(remote, patched)]) {
      const ship = await Nexus.create(graph, { plugins: [federation()] });
      expect(ship.has(shellBank.token<IAuth>('Auth'))).toBe(true);
    }
  });

  describe('at major 1 and above', () => {
    it('rejects a provider at an older patch of the same minor', async () => {
      expect(await verdict('2.3.5', '2.3.1')).toEqual([
        expect.objectContaining(mismatch('2.3.5', '2.3.1')),
      ]);
    });

    it('accepts a provider at the same or a newer patch of the same minor', async () => {
      expect(await verdict('2.3.1', '2.3.1')).toEqual([]);
      expect(await verdict('2.3.1', '2.3.5')).toEqual([]);
    });
  });

  describe('at major 0', () => {
    it('rejects a provider at a newer minor than the dependent was built against', async () => {
      expect(await verdict('0.3.0', '0.4.0')).toEqual([
        expect.objectContaining(mismatch('0.3.0', '0.4.0')),
      ]);
    });

    it('rejects a provider at an older minor than the dependent needs', async () => {
      expect(await verdict('0.4.0', '0.3.0')).toEqual([
        expect.objectContaining(mismatch('0.4.0', '0.3.0')),
      ]);
    });

    it('rejects a provider at an older patch of the same minor', async () => {
      expect(await verdict('0.4.2', '0.4.1')).toEqual([
        expect.objectContaining(mismatch('0.4.2', '0.4.1')),
      ]);
    });

    it('accepts a provider at the same or a newer patch of the same minor', async () => {
      expect(await verdict('0.4.1', '0.4.1')).toEqual([]);
      expect(await verdict('0.4.1', '0.4.3')).toEqual([]);
      expect(await verdict('0.4.0-rc.1', '0.4.0-rc.1')).toEqual([]);
    });
  });

  it('gives Nexus.check the verdict create gives, in either order', () => {
    const newer = remoteUsing(remoteBank.token<IAuth>('Auth')).module;
    const patched = shellOf(defineContract({ key: 'bank', version: '2.4.1' }));
    const older = remoteUsing(shellBank.token<IAuth>('Auth')).module;
    for (const graph of [root(Shell, newer), root(newer, Shell)])
      expect(() => Nexus.check(graph, { plugins: [federation()] })).toThrow(
        expect.objectContaining({
          errors: [expect.objectContaining(mismatch('2.4.0', '2.3.0'))],
        }),
      );
    for (const graph of [root(patched, older), root(older, patched)])
      expect(Nexus.check(graph, { plugins: [federation()] })).toBeUndefined();
  });

  it('checks each contributor of a contract multi token against an all() dependent, in either order', async () => {
    const Hooks = defineModule({
      name: 'Hooks',
      providers: [
        provide(shellBank.multi<IAudit>('Hooks'), {
          useValue: { record: () => 'shell' },
        }),
      ],
      exports: [shellBank.multi<IAudit>('Hooks')],
      global: true,
    });
    const hooks = remoteBank.multi<IAudit>('Hooks');
    class Audit {
      static deps = [all(hooks)] as const;
      constructor(readonly hooks: readonly IAudit[]) {}
    }
    const Remote = defineModule({
      name: 'Remote',
      providers: [
        provide(hooks, { useValue: { record: () => 'remote' } }),
        Audit,
      ],
    });
    for (const graph of [root(Hooks, Remote), root(Remote, Hooks)]) {
      const errors = await errorsOf(() =>
        Nexus.create(graph, { plugins: [federation()] }),
      );
      expect(errors).toEqual([
        expect.objectContaining({
          code: 'NEXUS_CONTRACT_VERSION',
          contract: 'bank/Hooks',
          required: '2.4.0',
          provided: '2.3.0',
        }),
      ]);
    }
  });

  it('rejects an older contributor to an all() dependent in one module', async () => {
    const hooks = shellBank.multi<IAudit>('Hooks');
    class Audit {
      static deps = [all(hooks)] as const;
      constructor(readonly hooks: readonly IAudit[]) {}
    }
    const errors = await errorsOf(() =>
      Nexus.create(
        defineModule({
          name: 'Remote',
          providers: [
            Audit,
            provide(olderRemote.multi<IAudit>('Hooks'), {
              useValue: { record: () => 'old' },
            }),
          ],
        }),
        { plugins: [federation()] },
      ),
    );
    expect(errors).toEqual([
      expect.objectContaining({ required: '2.3.0', provided: '2.1.0' }),
    ]);
  });

  it('checks a provider load() adds against its own copy, whatever copy create met first', async () => {
    class Probe {
      static deps = [optional(shellBank.token<IAuth>('Auth'))] as const;
      constructor(readonly auth: IAuth | undefined) {}
    }
    const ship = await Nexus.create(
      defineModule({ name: 'Root', providers: [Probe] }),
      { plugins: [federation()] },
    );
    const later = defineContract({ key: 'bank', version: '2.5.0' });
    const { Statement } = remoteUsing(later.token<IAuth>('Auth'));
    await ship.load(
      defineModule({
        name: 'Remote',
        imports: [shellOf(later, 'Bank', false)],
        providers: [Statement],
        exports: [Statement],
      }),
    );
    expect(ship.get(Statement).auth.user()).toBe('ada');
  });

  it('keeps its verdict when a plugin before it meets another copy first', async () => {
    const newer = remoteBank.token<IAuth>('Auth');
    const meddler: NexusPlugin = {
      name: 'meddler',
      apiVersion: 1,
      compile: {
        check: (view) => {
          view.visible(view.root, newer);
          view.canonical(newer);
        },
      },
    };
    const remote = remoteUsing(newer).module;
    for (const graph of [root(Shell, remote), root(remote, Shell)]) {
      const errors = await errorsOf(() =>
        Nexus.create(graph, { plugins: [meddler, federation()] }),
      );
      expect(errors).toEqual([
        expect.objectContaining(mismatch('2.4.0', '2.3.0')),
      ]);
    }
  });

  it('rejects a shell that needs a newer minor than a remote provides', async () => {
    const auth = shellBank.token<IAuth>('Auth');
    const Remote = defineModule({
      name: 'Remote',
      providers: [provide(auth, { useValue: { user: () => 'remote' } })],
      exports: [auth],
    });
    const { Statement } = remoteUsing(remoteBank.token<IAuth>('Auth'));
    const errors = await errorsOf(() =>
      Nexus.create(
        defineModule({
          name: 'Shell',
          imports: [Remote],
          providers: [Statement],
        }),
        { plugins: [federation()] },
      ),
    );
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toContain('the provider has 2.3.0');
  });

  it('reports one mismatch once for several dependents', async () => {
    const ship = await Nexus.create(Shell, { plugins: [federation()] });
    const first = remoteUsing(remoteBank.token<IAuth>('Auth'));
    const second = remoteUsing(remoteBank.token<IAuth>('Auth'));
    const errors = await errorsOf(() =>
      ship.load(
        defineModule({
          name: 'Remotes',
          providers: [first.Statement, second.Statement],
        }),
      ),
    );
    expect(errors).toEqual([
      expect.objectContaining(mismatch('2.4.0', '2.3.0')),
    ]);
  });

  it('rejects a remote built against an older major', async () => {
    const ship = await Nexus.create(Shell, { plugins: [federation()] });
    const oldMajor = defineContract({ key: 'bank', version: '1.9.0' });
    const errors = await errorsOf(() =>
      ship.load(remoteUsing(oldMajor.token<IAuth>('Auth')).module),
    );
    expect(errors).toEqual([
      expect.objectContaining(mismatch('1.9.0', '2.3.0')),
    ]);
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
      '[NEXUS_CONTRACT_VERSION] bank/Auth is needed at 2.4.0, and the provider has 2.3.0.\n  Fix: build the provider against 2.4.0 or a newer 2.x, or build the dependent against 2.3.0.',
    );
  });

  it('names a newer patch of the needed minor at major 0', async () => {
    const [error] = (await verdict('0.4.2', '0.3.0')) as Error[];
    expect(error).toBeInstanceOf(ContractVersionError);
    expect(error?.message).toBe(
      '[NEXUS_CONTRACT_VERSION] bank/Auth is needed at 0.4.2, and the provider has 0.3.0.\n  Fix: build the provider against 0.4.2 or a newer 0.4.x patch, or build the dependent against 0.3.0.',
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
